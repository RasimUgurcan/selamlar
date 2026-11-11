"""Kufi Animation: dikey (9:16) kumaş simülasyonu Short üreticisi.

Bir bölüm JSON dosyasındaki her "klip" için:
  1. Stüdyo arka planı, ışıklar ve kamera kurulur.
  2. Karakter (senin modelin ya da yer tutucu blok figür) ortaya konur.
  3. Üstten, verilen ızgara çözünürlüğünde bir kumaş düşürülür (Blender cloth).
  4. Kareler Cycles ile render alınır.
  5. ffmpeg ile etiket ("Face 4" gibi) ve filigran ("Kufi Animation") basılır.
Sonunda tüm klipler tek bir MP4'te birleştirilir.

Çalıştırma (ikisi de olur):
  blender -b -P kufi_short.py -- bolumler/ornek.json
  python kufi_short.py bolumler/ornek.json          # pip install bpy kuruluysa

Seçenekler:
  --onizleme       yarım çözünürlük, az örnek: hızlı deneme için
  --cikis DIR      çıktı klasörü (varsayılan: cikti/<bölüm adı>)
  --klip N         yalnızca N. klibi render al (1'den başlar)
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys

import bpy
import bmesh
from mathutils import Vector


# ---------------------------------------------------------------- yardımcılar

def hex_rgb(h):
    """'#E3B126' -> doğrusal (linear) RGBA. Blender renkleri doğrusal ister."""
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (*[lin(c) for c in srgb], 1.0)


def face_label(n_faces):
    """16384 -> '16K', 1000000 -> '1M'."""
    if n_faces >= 1_000_000:
        v = n_faces / 1_000_000
        return f"{v:g}M" if v != int(v) else f"{int(v)}M"
    if n_faces >= 1000:
        v = n_faces / 1000
        if v >= 10 or abs(v - round(v)) < 0.15:  # 1024 -> 1K, 4096 -> 4K, 16384 -> 16K
            return f"{round(v)}K"
        return f"{round(v, 1):g}K"
    return str(n_faces)


def find_font(pref=None):
    cands = [pref] if pref else []
    cands += [
        "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",  # macOS
        "C:/Windows/Fonts/arialbd.ttf",  # Windows
    ]
    for c in cands:
        if c and os.path.exists(c):
            return c
    raise SystemExit("Font bulunamadı: bölüm dosyasına \"font\": \"/yol/font.ttf\" ekle.")


def new_material(name, color, roughness=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return m


# ---------------------------------------------------------------- sahne

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def setup_render(scene, cfg, preview):
    w, h = cfg.get("resolution", [1080, 1920])
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 50 if preview else 100
    scene.render.fps = cfg.get("fps", 30)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU" if cfg.get("gpu") else "CPU"
    scene.cycles.samples = 12 if preview else cfg.get("samples", 64)
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"  # arka plan rengi bozulmasın
    scene.render.film_transparent = False
    if cfg.get("gpu"):
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
            try:
                prefs.compute_device_type = backend
                prefs.get_devices()
                if any(d.type != "CPU" for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = True
                    break
            except TypeError:
                continue


def add_backdrop(scene, color):
    """Kıvrımlı stüdyo fonu (cyclorama): zemin + yumuşak köşe + arka duvar."""
    prof = []
    for y in [-14.0, -6.0, 0.0, 3.0]:
        prof.append((y, 0.0))
    r = 4.0
    for i in range(1, 13):  # çeyrek yay
        a = i / 12 * math.pi / 2
        prof.append((3.0 + r * math.sin(a), r - r * math.cos(a)))
    for z in [8.0, 25.0]:
        prof.append((3.0 + r, z))

    mesh = bpy.data.meshes.new("Fon")
    bm = bmesh.new()
    half = 25.0
    rows = []
    for (y, z) in prof:
        rows.append((bm.verts.new((-half, y, z)), bm.verts.new((half, y, z))))
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], a[1], b[1], b[0]))
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new("Fon", mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(new_material("FonMat", hex_rgb(color), 0.9))
    obj.modifiers.new("Carpisma", "COLLISION")
    obj.collision.thickness_outer = 0.01
    return obj


def add_lights_camera(scene, cam_cfg):
    # Ana yumuşak ışık: üst-ön
    key = bpy.data.lights.new("Ana", "AREA")
    key.energy = 900
    key.size = 7
    k = bpy.data.objects.new("Ana", key)
    k.location = (-2.5, -5.0, 8.0)
    scene.collection.objects.link(k)
    k.rotation_euler = (Vector((0, 0, 1.2)) - k.location).to_track_quat("-Z", "Y").to_euler()

    fill = bpy.data.lights.new("Dolgu", "AREA")
    fill.energy = 250
    fill.size = 8
    f = bpy.data.objects.new("Dolgu", fill)
    f.location = (5.0, -6.0, 3.0)
    scene.collection.objects.link(f)
    f.rotation_euler = (Vector((0, 0, 1.2)) - f.location).to_track_quat("-Z", "Y").to_euler()

    world = bpy.data.worlds.new("Dunya")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.25
    scene.world = world

    cam = bpy.data.cameras.new("Kamera")
    cam.lens = cam_cfg.get("lens", 50)
    cam.sensor_fit = "AUTO"
    c = bpy.data.objects.new("Kamera", cam)
    c.location = tuple(cam_cfg.get("location", [0.0, -8.6, 3.4]))
    target = Vector(cam_cfg.get("target", [0.0, 0.0, 1.45]))
    c.rotation_euler = (target - c.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(c)
    scene.camera = c


# ---------------------------------------------------------------- karakter

def add_placeholder_figure(scene, height):
    """Model verilmezse kullanılan, sade blok figür."""
    s = height / 1.9
    parts = [  # ad, merkez (x, y, z), boyut (x, y, z), renk
        ("Kafa", (0, 0, 1.65), (0.5, 0.5, 0.5), "#F2C14E"),
        ("Govde", (0, 0, 1.03), (0.52, 0.28, 0.74), "#F7F4EA"),
        ("KolSol", (-0.39, 0, 1.03), (0.24, 0.26, 0.74), "#F2C14E"),
        ("KolSag", (0.39, 0, 1.03), (0.24, 0.26, 0.74), "#F2C14E"),
        ("BacakSol", (-0.13, 0, 0.33), (0.25, 0.27, 0.66), "#3D5A80"),
        ("BacakSag", (0.13, 0, 0.33), (0.25, 0.27, 0.66), "#3D5A80"),
    ]
    objs = []
    for name, loc, size, col in parts:
        bpy.ops.mesh.primitive_cube_add(size=1, location=[v * s for v in loc])
        o = bpy.context.active_object
        o.name = name
        o.scale = [v * s for v in size]
        o.data.materials.append(new_material(name + "Mat", hex_rgb(col), 0.6))
        objs.append(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.join()
    return [bpy.context.active_object]


def import_model(scene, path, height, rot_z_deg=0.0):
    """Kendi modelini içe aktar; boyuna göre ölçekle, zemine ve ortaya oturt."""
    path = os.path.abspath(path)
    ext = os.path.splitext(path)[1].lower()
    before = set(bpy.data.objects)
    if ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".blend":
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = src.objects
        for o in dst.objects:
            if o is not None and o.type in {"MESH", "EMPTY", "ARMATURE"}:
                scene.collection.objects.link(o)
    else:
        raise SystemExit(f"Desteklenmeyen model türü: {ext} (.blend .fbx .obj .glb kullan)")
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"{path} içinde mesh bulunamadı.")

    # Ortak bir kök altında topla ve ölçekle
    root = bpy.data.objects.new("ModelKok", None)
    scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    root.rotation_euler.z = math.radians(rot_z_deg)
    bpy.context.view_layer.update()

    def bbox():
        pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        return lo, hi

    lo, hi = bbox()
    k = height / max(hi.z - lo.z, 1e-6)
    root.scale = (k, k, k)
    bpy.context.view_layer.update()
    lo, hi = bbox()
    root.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.context.view_layer.update()
    return meshes


def make_colliders(objs):
    for o in objs:
        o.modifiers.new("Carpisma", "COLLISION")
        o.collision.thickness_outer = 0.02
        o.collision.cloth_friction = 8.0


# ---------------------------------------------------------------- kumaş

def grid_material(color, grid, line_color=None):
    """Kumaş rengi + ızgara çizgileri (her yüz görünür: 'Face N' etkisi)."""
    m = new_material("KumasMat", hex_rgb(color), 0.45)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Sheen Weight"].default_value = 0.4
    if grid > 128:  # o kadar ince çizgi zaten görünmez
        return m
    nt = m.node_tree
    N = nt.nodes
    L = nt.links
    uv = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(uv.outputs["UV"], sep.inputs[0])

    def axis_line(out):
        mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = grid
        fr = N.new("ShaderNodeMath"); fr.operation = "FRACT"
        inv = N.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
        mn = N.new("ShaderNodeMath"); mn.operation = "MINIMUM"
        lt = N.new("ShaderNodeMath"); lt.operation = "LESS_THAN"
        lt.inputs[1].default_value = 0.035 if grid <= 8 else 0.06
        L.new(out, mul.inputs[0]); L.new(mul.outputs[0], fr.inputs[0])
        L.new(fr.outputs[0], inv.inputs[1]); L.new(fr.outputs[0], mn.inputs[0])
        L.new(inv.outputs[0], mn.inputs[1]); L.new(mn.outputs[0], lt.inputs[0])
        return lt.outputs[0]

    mx = N.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
    L.new(axis_line(sep.outputs["X"]), mx.inputs[0])
    L.new(axis_line(sep.outputs["Y"]), mx.inputs[1])
    mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs["A"].default_value = hex_rgb(color)
    base = hex_rgb(color)
    mix.inputs["B"].default_value = hex_rgb(line_color) if line_color else (
        min(1, base[0] * 2.2 + 0.25), min(1, base[1] * 2.2 + 0.25), min(1, base[2] * 2.2 + 0.25), 1)
    L.new(mx.outputs[0], mix.inputs["Factor"])
    L.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    return m


def add_cloth(scene, clip, frames, model_height):
    grid = int(clip["grid"])
    size = clip.get("sheet_size", 2.3)
    z = clip.get("drop_height", model_height + 1.3)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=grid, y_subdivisions=grid, size=size,
                                    location=(0, 0, z))
    sheet = bpy.context.active_object
    sheet.name = "Kumas"
    # Az parçalı kumaş sert bir levha gibidir: eğik düşerse kafadan kayıp kadrajdan çıkar.
    flat = grid <= 2
    sheet.rotation_euler = (math.radians(clip.get("tilt_x", 0 if flat else 4)),
                            math.radians(clip.get("tilt_y", 0 if flat else -3)),
                            math.radians(clip.get("spin", 12)))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    if grid >= 12:
        bpy.ops.object.shade_smooth()
    sheet.data.materials.append(grid_material(clip.get("sheet_color", "#E8342E"), grid,
                                              clip.get("line_color")))

    cloth = sheet.modifiers.new("Kumas", "CLOTH")
    st = cloth.settings
    st.quality = max(5, min(15, grid // 8 + 5))
    st.mass = clip.get("mass", 0.3)
    st.tension_stiffness = st.compression_stiffness = clip.get("stiffness", 15)
    st.shear_stiffness = 5
    st.bending_stiffness = clip.get("bending", 0.5)
    st.air_damping = 1.0
    cs = cloth.collision_settings
    cs.collision_quality = 4
    cs.distance_min = 0.012
    cs.use_self_collision = grid >= 24
    cs.self_distance_min = 0.01
    cloth.point_cache.frame_start = 1
    cloth.point_cache.frame_end = frames

    solid = sheet.modifiers.new("Kalinlik", "SOLIDIFY")
    solid.thickness = 0.012
    solid.offset = 0
    if grid >= 12:
        sub = sheet.modifiers.new("Yumusat", "SUBSURF")
        sub.levels = sub.render_levels = 1
    return sheet


# ---------------------------------------------------------------- render + video

def render_clip(cfg, clip, idx, out_dir, preview):
    scene = reset_scene()
    setup_render(scene, cfg, preview)
    fps = scene.render.fps
    frames = int(round(clip.get("seconds", 3.5) * fps))
    scene.frame_start, scene.frame_end = 1, frames

    add_backdrop(scene, clip.get("bg", "#E3B126"))
    add_lights_camera(scene, cfg.get("camera", {}))
    h = cfg.get("model_height", 1.9)
    model = clip.get("model", cfg.get("model"))
    if model:
        base = os.path.dirname(os.path.abspath(cfg["_path"]))
        objs = import_model(scene, os.path.join(base, model), h, clip.get("model_rot_z", cfg.get("model_rot_z", 0)))
    else:
        objs = add_placeholder_figure(scene, h)
    make_colliders(objs)
    add_cloth(scene, clip, frames, h)

    frame_dir = os.path.join(out_dir, f"klip{idx:02d}_kareler")
    shutil.rmtree(frame_dir, ignore_errors=True)
    os.makedirs(frame_dir)
    for f in range(1, frames + 1):
        scene.frame_set(f)  # kumaş simülasyonu sırayla ilerler
        scene.render.filepath = os.path.join(frame_dir, f"{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[klip {idx}] kare {f}/{frames}", flush=True)
    return frame_dir, fps


def ff_escape(text):
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019").replace("%", "\\%")


def encode_clip(cfg, clip, idx, frame_dir, fps, out_dir, height):
    font = find_font(cfg.get("font"))
    label = clip.get("label") or f"Face {face_label(int(clip['grid']) ** 2)}"
    wm = cfg.get("watermark", "Kufi Animation")
    wm_color = clip.get("watermark_color") or cfg.get("watermark_color")
    if not wm_color:  # koyu fonda açık, açık fonda koyu yazı
        r, g, b, _ = hex_rgb(clip.get("bg", "#E3B126"))
        wm_color = "#F2F2F2" if (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.12 else "#2A2A2A"
    filt = (
        f"drawtext=fontfile='{font}':text='{ff_escape(label)}':fontcolor=white:"
        f"fontsize=h*0.046:x=(w-tw)/2:y=h*0.075:shadowcolor=black@0.45:shadowx={max(1, round(height * 0.002))}:shadowy={max(1, round(height * 0.003))},"
        f"drawtext=fontfile='{font}':text='{ff_escape(wm)}':fontcolor={wm_color}@0.85:"
        f"fontsize=h*0.019:x=(w-tw)/2:y=h*0.915"
    )
    out = os.path.join(out_dir, f"klip{idx:02d}.mp4")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps),
        "-i", os.path.join(frame_dir, "%04d.png"), "-vf", filt,
        "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", out,
    ], check=True)
    return out


def concat(clips, out_path):
    lst = out_path + ".txt"
    with open(lst, "w") as fh:
        for c in clips:
            fh.write(f"file '{os.path.abspath(c)}'\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-c", "copy", "-movflags", "+faststart", out_path], check=True)
    os.remove(lst)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description="Kufi Animation Short üreticisi")
    ap.add_argument("bolum", help="bölüm JSON dosyası")
    ap.add_argument("--onizleme", action="store_true", help="hızlı, düşük kaliteli deneme")
    ap.add_argument("--cikis", help="çıktı klasörü")
    ap.add_argument("--klip", type=int, help="yalnızca bu klibi render al (1'den başlar)")
    a = ap.parse_args(argv)

    with open(a.bolum, encoding="utf-8") as fh:
        cfg = json.load(fh)
    cfg["_path"] = a.bolum
    name = os.path.splitext(os.path.basename(a.bolum))[0]
    out_dir = os.path.abspath(a.cikis or os.path.join(os.path.dirname(os.path.abspath(__file__)), "cikti", name))
    os.makedirs(out_dir, exist_ok=True)

    clips = []
    for i, clip in enumerate(cfg["clips"], 1):
        if a.klip and i != a.klip:
            continue
        frame_dir, fps = render_clip(cfg, clip, i, out_dir, a.onizleme)
        height = cfg.get("resolution", [1080, 1920])[1] // (2 if a.onizleme else 1)
        clips.append(encode_clip(cfg, clip, i, frame_dir, fps, out_dir, height))
        if not cfg.get("keep_frames"):
            shutil.rmtree(frame_dir, ignore_errors=True)

    final = os.path.join(out_dir, f"{name}{'_onizleme' if a.onizleme else ''}.mp4")
    concat(clips, final)
    print(f"\nHazır: {final}")


if __name__ == "__main__":
    main()
