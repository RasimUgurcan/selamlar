"""Sinematik ortamlar: her bölüm için ayrı dekor, ışık ve kamera.

Bir ortam JSON dosyası (kufi/ortamlar/<ad>.json) şunları tarif eder:
  hdri       Poly Haven HDRI'si: arka plan ve ortam ışığı (gerçek mekân fotoğrafı)
  zemin      Poly Haven dokusu ile kaplanmış zemin
  duvarlar   arkada ve yanlarda dokulu duvarlar (iç mekân için)
  podyum     karakterin durduğu sahne (halı, mermer kaide, ...)
  dekor      Poly Haven 3D modelleri: konum, dönüş, ölçek
  prosedurel kodla üretilen soyut yapılar (kemerler, sütunlar, yüzen şekiller)
  isiklar    pratik ışıklar (lamba, mum, neon, pencere ışığı)
  kamera     lens, alan derinliği (bokeh), yavaş yaklaşma (dolly)
  renk       görüntü dönüşümü ve görünüm (AgX, kontrast)

Tüm Poly Haven varlıkları CC0'dır (ticari kullanım serbest) ve
kufi/.onbellek/ klasörüne bir kez indirilip saklanır.
"""

import json
import math
import os
import random
import urllib.request

import bpy
from mathutils import Vector

API = "https://api.polyhaven.com/files/"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".onbellek", "polyhaven")
UA = {"User-Agent": "kufi-short-generator"}


# ---------------------------------------------------------------- indirme

def _get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r, open(dest + ".part", "wb") as fh:
        fh.write(r.read())
    os.replace(dest + ".part", dest)
    return dest


def _files(asset):
    dest = os.path.join(CACHE, asset, "files.json")
    _get(API + asset, dest)
    with open(dest) as fh:
        return json.load(fh)


def hdri_path(asset, res="2k"):
    f = _files(asset)["hdri"]
    res = res if res in f else sorted(f)[0]
    url = f[res]["hdr"]["url"]
    return _get(url, os.path.join(CACHE, asset, os.path.basename(url)))


def texture_maps(asset, res="1k"):
    f = _files(asset)
    out = {}
    for key, name in (("Diffuse", "diff"), ("Rough", "rough"), ("nor_gl", "nor"), ("arm", "arm")):
        if key in f:
            r = res if res in f[key] else sorted(f[key])[0]
            fmt = "jpg" if "jpg" in f[key][r] else sorted(f[key][r])[0]
            url = f[key][r][fmt]["url"]
            out[name] = _get(url, os.path.join(CACHE, asset, os.path.basename(url)))
    return out


def model_path(asset, res="1k"):
    g = _files(asset)["gltf"]
    res = res if res in g else sorted(g)[0]
    g = g[res]["gltf"]
    base = os.path.join(CACHE, asset, "gltf_" + res)
    for rel, info in g.get("include", {}).items():
        _get(info["url"], os.path.join(base, rel))
    return _get(g["url"], os.path.join(base, os.path.basename(g["url"])))


# ---------------------------------------------------------------- yardımcılar

def hex_rgb(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb], a)


def _look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def pbr_material(name, asset=None, color=None, scale=1.0, roughness=0.6, metallic=0.0,
                 emission=None, emission_strength=0.0, tint=None):
    """Poly Haven dokulu ya da düz renkli PBR malzeme. Doku ölçeği dünya koordinatına göre."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if color:
        bsdf.inputs["Base Color"].default_value = hex_rgb(color)
    if emission:
        bsdf.inputs["Emission Color"].default_value = hex_rgb(emission)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if asset:
        maps = texture_maps(asset)
        tc = N.new("ShaderNodeTexCoord")
        mp = N.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1 / scale, 1 / scale, 1 / scale)
        L.new(tc.outputs["Object"], mp.inputs["Vector"])

        def img(path, non_color=False):
            t = N.new("ShaderNodeTexImage")
            t.image = bpy.data.images.load(path, check_existing=True)
            t.projection = "BOX"
            t.projection_blend = 0.2
            if non_color:
                t.image.colorspace_settings.name = "Non-Color"
            L.new(mp.outputs["Vector"], t.inputs["Vector"])
            return t

        if "diff" in maps:
            d = img(maps["diff"])
            if tint:
                mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
                mix.inputs["Factor"].default_value = 1.0
                L.new(d.outputs["Color"], mix.inputs["A"])
                mix.inputs["B"].default_value = hex_rgb(tint)
                L.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
            else:
                L.new(d.outputs["Color"], bsdf.inputs["Base Color"])
        if "rough" in maps:  # doku haritası, ama verilen pürüzlülükten daha parlak olmasın
            mx = N.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
            mx.inputs[1].default_value = roughness
            L.new(img(maps["rough"], True).outputs["Color"], mx.inputs[0])
            L.new(mx.outputs[0], bsdf.inputs["Roughness"])
        if "nor" in maps:
            nm = N.new("ShaderNodeNormalMap")
            L.new(img(maps["nor"], True).outputs["Color"], nm.inputs["Color"])
            L.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def _box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new("Pah", "BEVEL"); b.width = bevel; b.segments = 3
    o.data.materials.append(mat)
    return o


# ---------------------------------------------------------------- parçalar

def setup_world(scene, cfg):
    world = bpy.data.worlds.new("OrtamDunya")
    world.use_nodes = True
    nt = world.node_tree
    N, L = nt.nodes, nt.links
    bg = N["Background"]
    if cfg.get("hdri"):
        env = N.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri_path(cfg["hdri"], cfg.get("hdri_cozunurluk", "2k")))
        tc = N.new("ShaderNodeTexCoord"); mp = N.new("ShaderNodeMapping")
        mp.inputs["Rotation"].default_value[2] = math.radians(cfg.get("hdri_donus", 0))
        L.new(tc.outputs["Generated"], mp.inputs["Vector"])
        L.new(mp.outputs["Vector"], env.inputs["Vector"])
        L.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = cfg.get("hdri_guc", 1.0)
    else:
        bg.inputs["Color"].default_value = hex_rgb(cfg.get("gok_rengi", "#101014"))
        bg.inputs["Strength"].default_value = cfg.get("gok_guc", 1.0)
    scene.world = world


def build_floor(scene, z):
    mat = pbr_material("Zemin", z.get("doku"), z.get("renk"), z.get("olcek", 2.0),
                       z.get("puruzluluk", 0.5), tint=z.get("ton"))
    bpy.ops.mesh.primitive_plane_add(size=z.get("boyut", 60), location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = "Zemin"
    o.data.materials.append(mat)
    o.modifiers.new("Carpisma", "COLLISION")
    o.collision.thickness_outer = 0.01
    return o


def build_walls(scene, w):
    """Arka duvar (+ istenirse yan duvarlar), süpürgelik ve pencere boşlukları."""
    mat = pbr_material("Duvar", w.get("doku"), w.get("renk"), w.get("olcek", 2.5),
                       w.get("puruzluluk", 0.8), tint=w.get("ton"))
    depth = w.get("uzaklik", 6.0)
    width = w.get("genislik", 16.0)
    h = w.get("yukseklik", 7.0)
    t = 0.3
    objs = [_box("ArkaDuvar", (0, depth + t / 2, h / 2), (width, t, h), mat)]
    if w.get("yanlar", True):
        for s in (-1, 1):
            objs.append(_box("YanDuvar", (s * (width / 2), depth / 2 - 4, h / 2), (t, depth + 8, h), mat))
    if w.get("supurgelik"):
        sm = pbr_material("Supurgelik", color=w["supurgelik"], roughness=0.4)
        _box("Supurgelik", (0, depth - 0.03, 0.15), (width, 0.08, 0.3), sm)
    # Pencereler: duvara boşluk aç, arkasından HDRI ışığı girsin
    for i, win in enumerate(w.get("pencereler", [])):
        cx, cz = win["x"], win.get("z", 3.2)
        ww, wh = win.get("en", 1.6), win.get("boy", 2.6)
        cutter = _box(f"PencereKesici{i}", (cx, depth, cz), (ww, t * 4, wh), mat)
        mod = objs[0].modifiers.new(f"Pencere{i}", "BOOLEAN")
        mod.object = cutter
        mod.operation = "DIFFERENCE"
        cutter.hide_render = True
        cutter.hide_viewport = True
        # Pencerenin arkasındaki manzara: gece göğü, gün ışığı vb. (ışık yayan düzlem)
        sky = win.get("manzara", "#6F86C9")
        bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, depth + 2.5, cz),
                                         rotation=(math.pi / 2, 0, 0))
        sp = bpy.context.active_object
        sp.name = f"Manzara{i}"
        sp.scale = (ww * 3, wh * 2, 1)
        sp.data.materials.append(pbr_material(f"Manzara{i}", color=sky, emission=sky,
                                              emission_strength=win.get("manzara_guc", 2.5)))
        if win.get("kayit"):  # pencere çıtaları: dikey + yatay kayıtlar
            km = pbr_material("Kayit", color=win.get("kayit_renk", "#2A1C14"), roughness=0.5)
            bw = 0.07
            for k in range(1, win.get("dikey", 2)):
                _box("KayitD", (cx - ww / 2 + ww * k / win.get("dikey", 2), depth, cz), (bw, 0.12, wh), km)
            for k in range(1, win.get("yatay", 3)):
                _box("KayitY", (cx, depth, cz - wh / 2 + wh * k / win.get("yatay", 3)), (ww, 0.12, bw), km)
        if win.get("isik", True):
            ld = bpy.data.lights.new(f"PencereIsik{i}", "AREA")
            ld.shape = "RECTANGLE"; ld.size = ww; ld.size_y = wh
            ld.energy = win.get("guc", 600)
            ld.color = hex_rgb(win.get("renk", "#FFE7C2"))[:3]
            lo = bpy.data.objects.new(f"PencereIsik{i}", ld)
            lo.location = (cx, depth + 0.6, cz)
            scene.collection.objects.link(lo)
            _look_at(lo, (cx * 0.4, 0, 0.5))
            lo.visible_camera = False
    return objs


def build_podium(scene, p):
    kind = p.get("tip", "yuvarlak")
    mat = pbr_material("Podyum", p.get("doku"), p.get("renk", "#CFC6B8"), p.get("olcek", 1.0),
                       p.get("puruzluluk", 0.35), metallic=p.get("metal", 0.0), tint=p.get("ton"))
    h = p.get("yukseklik", 0.0)
    r = p.get("yaricap", 1.7)
    if kind == "hali":  # ince yuvarlak halı
        bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=r, depth=0.02, location=(0, 0, 0.01))
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=r, depth=max(h, 0.02), location=(0, 0, h / 2))
        b = bpy.context.active_object.modifiers.new("Pah", "BEVEL"); b.width = 0.03; b.segments = 4
    o = bpy.context.active_object
    o.name = "Podyum"
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    o.modifiers.new("Carpisma", "COLLISION")
    o.collision.thickness_outer = 0.01
    if p.get("serit"):  # podyum kenarında ışıklı şerit
        bpy.ops.mesh.primitive_torus_add(major_radius=r + 0.01, minor_radius=0.015,
                                         location=(0, 0, max(h, 0.02)))
        s = bpy.context.active_object
        s.data.materials.append(pbr_material("Serit", color=p["serit"], emission=p["serit"],
                                             emission_strength=p.get("serit_guc", 8)))
    return h


def place_props(scene, props):
    for i, pr in enumerate(props):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=model_path(pr["model"], pr.get("cozunurluk", "1k")))
        new = [o for o in bpy.data.objects if o not in before]
        root = bpy.data.objects.new(f"Dekor_{pr['model']}_{i}", None)
        scene.collection.objects.link(root)
        for o in new:
            if o.parent is None:
                o.parent = root
        root.location = pr.get("konum", (0, 3, 0))
        root.rotation_euler.z = math.radians(pr.get("don", 0))
        s = pr.get("olcek", 1.0)
        root.scale = (s, s, s)


def build_procedural(scene, pc, seed):
    """Soyut / sürreal sahne parçaları: tamamen kodla."""
    rnd = random.Random(seed)
    kind = pc.get("tip")
    c1 = pc.get("renk", "#EDE6DA")
    c2 = pc.get("vurgu", "#FF6B4A")
    mat = pbr_material("Soyut", color=c1, roughness=pc.get("puruzluluk", 0.55))
    glow = pbr_material("Isilti", color=c2, emission=c2, emission_strength=pc.get("isilti", 6))
    if kind == "kemerler":
        # Arka arkaya dizilmiş dev kemerler: bir koridorun derinliği
        for k in range(pc.get("adet", 6)):
            y = 3.0 + k * 3.2
            w, h, t = 4.4 + k * 0.15, 6.5 + k * 0.2, 0.7
            for s in (-1, 1):
                _box(f"Ayak{k}", (s * w / 2, y, h / 2), (t, t, h), mat, 0.04)
            bpy.ops.mesh.primitive_torus_add(major_radius=w / 2, minor_radius=t / 2,
                                             major_segments=64, minor_segments=4,
                                             location=(0, y, h), rotation=(math.pi / 2, 0, 0))
            arc = bpy.context.active_object
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.bisect(plane_co=(0, y, h), plane_no=(0, 0, 1), clear_inner=True)
            bpy.ops.object.mode_set(mode="OBJECT")
            arc.data.materials.append(mat)
            if pc.get("neon", True) and k % 2 == 0:
                bpy.ops.mesh.primitive_torus_add(major_radius=w / 2 - t / 2 - 0.03, minor_radius=0.03,
                                                 location=(0, y - t / 2 - 0.02, h), rotation=(math.pi / 2, 0, 0))
                n = bpy.context.active_object
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.mesh.bisect(plane_co=(0, y, h), plane_no=(0, 0, 1), clear_inner=True)
                bpy.ops.object.mode_set(mode="OBJECT")
                n.data.materials.append(glow)
    if kind in ("kemerler", "yuzen"):
        # Havada asılı duran küre, küp ve halkalar (karakterin arkasında ve yanlarında)
        shapes = pc.get("yuzen_adet", 14)
        for j in range(shapes):
            ang = rnd.uniform(-1.2, 1.2)
            dist = rnd.uniform(3.2, 9.0)
            x, y = math.sin(ang) * dist, abs(math.cos(ang) * dist) + 1.5
            z = rnd.uniform(0.6, 5.5)
            sz = rnd.uniform(0.18, 0.7)
            pick = rnd.random()
            if pick < 0.45:
                bpy.ops.mesh.primitive_uv_sphere_add(radius=sz, location=(x, y, z), segments=48, ring_count=24)
                bpy.ops.object.shade_smooth()
            elif pick < 0.8:
                bpy.ops.mesh.primitive_cube_add(size=sz * 1.6, location=(x, y, z),
                                                rotation=(rnd.random() * 3, rnd.random() * 3, rnd.random() * 3))
                b = bpy.context.active_object.modifiers.new("Pah", "BEVEL"); b.width = 0.03; b.segments = 3
            else:
                bpy.ops.mesh.primitive_torus_add(major_radius=sz, minor_radius=sz * 0.18, location=(x, y, z),
                                                 rotation=(rnd.random() * 3, rnd.random() * 3, 0))
                bpy.ops.object.shade_smooth()
            o = bpy.context.active_object
            o.data.materials.append(glow if rnd.random() < pc.get("isilti_orani", 0.25) else mat)
            if pc.get("suzulme", True):  # yavaşça yüzme hareketi
                o.keyframe_insert("location", frame=1)
                o.location.z += rnd.uniform(0.15, 0.4)
                o.keyframe_insert("location", frame=pc.get("_frames", 120))


def build_lights(scene, lights):
    for i, li in enumerate(lights):
        kind = {"nokta": "POINT", "spot": "SPOT", "alan": "AREA", "gunes": "SUN"}[li.get("tip", "nokta")]
        ld = bpy.data.lights.new(f"Isik{i}", kind)
        ld.energy = li.get("guc", 300)
        ld.color = hex_rgb(li.get("renk", "#FFFFFF"))[:3]
        if kind == "POINT":
            ld.shadow_soft_size = li.get("boyut", 0.1)
        if kind == "AREA":
            ld.size = li.get("boyut", 2.0)
        if kind == "SPOT":
            ld.spot_size = math.radians(li.get("aci", 40))
            ld.spot_blend = 0.6
            ld.shadow_soft_size = li.get("boyut", 0.2)
        if kind == "SUN":
            ld.angle = math.radians(li.get("yumusaklik", 3))
        lo = bpy.data.objects.new(f"Isik{i}", ld)
        lo.location = li.get("konum", (0, -3, 5))
        scene.collection.objects.link(lo)
        _look_at(lo, li.get("hedef", (0, 0, 1)))


def add_fog(scene, f):
    """Hafif hava perspektifi: ışık hüzmeleri ve derinlik hissi (Cycles hacim)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 4, 4))
    o = bpy.context.active_object
    o.name = "Sis"
    o.scale = (30, 30, 8)
    m = bpy.data.materials.new("SisMat")
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    N.remove(N["Principled BSDF"])
    vol = N.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = f.get("yogunluk", 0.02)
    vol.inputs["Color"].default_value = hex_rgb(f.get("renk", "#FFFFFF"))
    L.new(vol.outputs["Volume"], N["Material Output"].inputs["Volume"])
    o.data.materials.append(m)
    scene.cycles.volume_step_rate = 4.0
    scene.cycles.volume_bounces = 0


def setup_camera(scene, cam_cfg, frames, focus_z):
    cam = bpy.data.cameras.new("Kamera")
    cam.lens = cam_cfg.get("lens", 55)
    c = bpy.data.objects.new("Kamera", cam)
    scene.collection.objects.link(c)
    scene.camera = c
    target = Vector(cam_cfg.get("hedef", (0, 0, 1.45)))
    start = Vector(cam_cfg.get("konum", (0, -10.5, 3.2)))
    if cam_cfg.get("f_stop"):
        focus = bpy.data.objects.new("Odak", None)
        focus.location = (0, 0, focus_z)
        scene.collection.objects.link(focus)
        cam.dof.use_dof = True
        cam.dof.focus_object = focus
        cam.dof.aperture_fstop = cam_cfg["f_stop"]
        cam.dof.aperture_blades = 7
    dolly = cam_cfg.get("dolly", 0.0)  # klip boyunca hedefe ne kadar yaklaşılacağı (oran)
    orbit = math.radians(cam_cfg.get("donus", 0.0))  # klip boyunca hedef etrafında dönüş
    keys = [1, frames] if (dolly or orbit) else [1]
    for f, tval in zip(keys, (0.0, 1.0)):
        rel = start - target
        rel = rel * (1 - dolly * tval)
        ca, sa = math.cos(orbit * tval), math.sin(orbit * tval)
        rel = Vector((rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca, rel.z))
        c.location = target + rel
        _look_at(c, target)
        if len(keys) > 1:
            c.keyframe_insert("location", frame=f)
            c.keyframe_insert("rotation_euler", frame=f)
    if len(keys) > 1 and c.animation_data and c.animation_data.action:
        _ease(c.animation_data.action)
    return c


def _ease(action):
    """Keyframe'leri yumuşak başlat/bitir (sinematik his)."""
    curves = []
    if hasattr(action, "fcurves"):
        curves = list(action.fcurves)
    else:  # Blender 5: katmanlı aksiyonlar
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.easing = "EASE_IN_OUT"


def color_management(scene, r):
    vt = r.get("donusum", "AgX")
    try:
        scene.view_settings.view_transform = vt
    except TypeError:
        scene.view_settings.view_transform = "Standard"
    look = r.get("gorunum")
    if look:
        for cand in (look, f"{vt} - {look}"):
            try:
                scene.view_settings.look = cand
                break
            except TypeError:
                continue
    scene.view_settings.exposure = r.get("pozlama", 0.0)


# ---------------------------------------------------------------- ana giriş

def load(name_or_dict, base_dir):
    if isinstance(name_or_dict, dict):
        return name_or_dict
    p = name_or_dict
    if not p.endswith(".json"):
        p = os.path.join(HERE, "ortamlar", p + ".json")
    elif not os.path.isabs(p):
        p = os.path.join(base_dir, p)
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def build(scene, cfg, frames, seed=0):
    """Ortamı kur. Karakterin ayak seviyesini (podyum yüksekliği) döndürür."""
    setup_world(scene, cfg)
    if cfg.get("zemin", {"renk": "#808080"}) is not None:
        build_floor(scene, cfg.get("zemin", {"renk": "#808080"}))
    if cfg.get("duvarlar"):
        build_walls(scene, cfg["duvarlar"])
    stage = build_podium(scene, cfg["podyum"]) if cfg.get("podyum") else 0.0
    if cfg.get("dekor"):
        place_props(scene, cfg["dekor"])
    if cfg.get("prosedurel"):
        pc = dict(cfg["prosedurel"], _frames=frames)
        build_procedural(scene, pc, seed)
    build_lights(scene, cfg.get("isiklar", []))
    if cfg.get("sis"):
        add_fog(scene, cfg["sis"])
    color_management(scene, cfg.get("renk_yonetimi", {}))
    return stage
