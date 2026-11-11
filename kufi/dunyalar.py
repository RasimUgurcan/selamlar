"""Stilize, yaşayan dünyalar: pastel çöl, sürreal kanyon, uzay...

Her şey kodla üretilir (hazır model ya da fotoğraf yok):
  gökyüzü    yumuşak gradyan; uzayda parıldayan yıldızlar
  zemin      kumul tepeleri, kum dalgacıkları, karakterin durduğu düz alan
  kayalar    pembe/turuncu fasetli kaya sivrileri (kanyon)
  kaktüsler  kollu, oluklu saguaro kaktüsleri
  çalılar    kabarık, tüylü kuru çalılar (hafifçe sallanır)
  toplar     yerdeki pastel küreler (hafifçe süzülür)
  bulutlar   pofuduk bulutlar (gökyüzünde akar)
  gezegenler havadaki dev küreler / halkalı gezegenler (döner, süzülür)

Uzaktaki her şey gökyüzü rengine karışır (hava perspektifi): derinlik hissi.
"""

import math
import random

import bmesh
import bpy
from mathutils import Vector, noise

# Kamera bu dosyadaki yerleşimlerde y = -9 civarında, +y yönüne bakar.
CAM_Y = -9.0


def hex_rgb(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb], a)


def lerp_hex(a, b, t):
    ca, cb = hex_rgb(a), hex_rgb(b)
    return tuple(ca[i] + (cb[i] - ca[i]) * t for i in range(4))


# ---------------------------------------------------------------- malzemeler

def haze_material(name, color, haze, roughness=0.8, sheen=0.3, near=25.0, far=260.0,
                  emission=None, emission_strength=0.0, variation=None, var_scale=0.15, bump=None):
    """Stilize malzeme + mesafeye göre gökyüzü rengine karışma (hava perspektifi)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    out = N["Material Output"]
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Sheen Weight"].default_value = sheen
    bsdf.inputs["Base Color"].default_value = hex_rgb(color) if isinstance(color, str) else color
    if variation:  # ikinci renkle yumuşak, büyük ölçekli renk değişimi
        tc = N.new("ShaderNodeTexCoord")
        nz = N.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = var_scale
        nz.inputs["Detail"].default_value = 2.0
        L.new(tc.outputs["Object"], nz.inputs["Vector"])
        ramp = N.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.35
        ramp.color_ramp.elements[1].position = 0.65
        ramp.color_ramp.elements[0].color = hex_rgb(color)
        ramp.color_ramp.elements[1].color = hex_rgb(variation)
        L.new(nz.outputs["Fac"], ramp.inputs["Fac"])
        L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if bump:  # kum dalgacıkları gibi ince yüzey detayı
        tc2 = N.new("ShaderNodeTexCoord")
        wv = N.new("ShaderNodeTexWave")
        wv.inputs["Scale"].default_value = bump.get("olcek", 1.5)
        wv.inputs["Distortion"].default_value = bump.get("bozulma", 6.0)
        wv.inputs["Detail"].default_value = 3
        L.new(tc2.outputs["Object"], wv.inputs["Vector"])
        bp = N.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump.get("guc", 0.15)
        L.new(wv.outputs["Fac"], bp.inputs["Height"])
        L.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = hex_rgb(emission)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    # Hava perspektifi: kameraya uzaklık arttıkça gökyüzü rengine karış
    cam = N.new("ShaderNodeCameraData")
    mr = N.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = near
    mr.inputs["From Max"].default_value = far
    L.new(cam.outputs["View Distance"], mr.inputs["Value"])
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = hex_rgb(haze)
    em.inputs["Strength"].default_value = 1.0
    mix = N.new("ShaderNodeMixShader")
    L.new(mr.outputs["Result"], mix.inputs["Fac"])
    L.new(bsdf.outputs["BSDF"], mix.inputs[1])
    L.new(em.outputs["Emission"], mix.inputs[2])
    L.new(mix.outputs["Shader"], out.inputs["Surface"])
    return m


def _new_obj(name, mesh, scene):
    o = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(o)
    return o


def _key(obj, path, frame, value):
    setattr(obj, path, value) if not isinstance(value, tuple) else setattr(obj, path, value)
    obj.keyframe_insert(path, frame=frame)


def _linear(obj):
    """Sabit hızlı hareket (bulut akışı, gezegen dönüşü)."""
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    act = ad.action
    curves = list(act.fcurves) if hasattr(act, "fcurves") else [
        fc for layer in act.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def _in_view(x, y, margin=1.15):
    """Dikey kadrajın yatay görüş açısına (yaklaşık ±16°) göre görünür mü?"""
    d = y - CAM_Y
    return d > 2 and abs(x) < 0.30 * d * margin


# ---------------------------------------------------------------- gökyüzü

def build_sky(scene, g, frames):
    world = bpy.data.worlds.new("Gok")
    world.use_nodes = True
    nt = world.node_tree
    N, L = nt.nodes, nt.links
    bg = N["Background"]
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Generated"], sep.inputs[0])
    ramp = N.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "EASE"
    cr.elements[0].position = 0.0
    cr.elements[0].color = hex_rgb(g.get("ufuk", "#F6C9B5"))
    cr.elements[1].position = 0.55
    cr.elements[1].color = hex_rgb(g.get("tepe", "#BFE3DA"))
    if g.get("orta"):
        e = cr.elements.new(0.12)
        e.color = hex_rgb(g["orta"])
    mr = N.new("ShaderNodeMapRange")  # yön vektörünün z'si: ufuk 0, tepe 1
    mr.inputs["From Min"].default_value = g.get("ufuk_z", -0.02)
    mr.inputs["From Max"].default_value = 1.0
    L.new(sep.outputs["Z"], mr.inputs["Value"])
    L.new(mr.outputs["Result"], ramp.inputs["Fac"])
    sky_col = ramp.outputs["Color"]

    if g.get("yildiz"):  # parıldayan yıldızlar: Voronoi noktaları + zamanla değişen gürültü
        vor = N.new("ShaderNodeTexVoronoi")
        vor.voronoi_dimensions = "3D"
        vor.feature = "F1"
        vor.inputs["Scale"].default_value = g.get("yildiz_yogunluk", 260.0)
        vor.inputs["Randomness"].default_value = 1.0
        L.new(tc.outputs["Generated"], vor.inputs["Vector"])
        lt = N.new("ShaderNodeMath"); lt.operation = "LESS_THAN"
        lt.inputs[1].default_value = g.get("yildiz_boyut", 0.045)
        L.new(vor.outputs["Distance"], lt.inputs[0])
        tw = N.new("ShaderNodeTexNoise")
        tw.noise_dimensions = "4D"
        tw.inputs["Scale"].default_value = 60.0
        L.new(tc.outputs["Generated"], tw.inputs["Vector"])
        tw.inputs["W"].default_value = 0.0
        tw.inputs["W"].keyframe_insert("default_value", frame=1)
        tw.inputs["W"].default_value = frames / 30.0 * g.get("parilti_hizi", 1.5)
        tw.inputs["W"].keyframe_insert("default_value", frame=frames)
        twr = N.new("ShaderNodeMapRange")
        twr.inputs["From Min"].default_value = 0.35
        twr.inputs["From Max"].default_value = 0.65
        twr.inputs["To Min"].default_value = 0.15
        twr.inputs["To Max"].default_value = 1.0
        L.new(tw.outputs["Fac"], twr.inputs["Value"])
        hz = N.new("ShaderNodeMath"); hz.operation = "GREATER_THAN"  # ufkun altında yıldız yok
        hz.inputs[1].default_value = 0.04
        L.new(sep.outputs["Z"], hz.inputs[0])
        m1 = N.new("ShaderNodeMath"); m1.operation = "MULTIPLY"
        m2 = N.new("ShaderNodeMath"); m2.operation = "MULTIPLY"
        L.new(lt.outputs[0], m1.inputs[0]); L.new(twr.outputs["Result"], m1.inputs[1])
        L.new(m1.outputs[0], m2.inputs[0]); L.new(hz.outputs[0], m2.inputs[1])
        add = N.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"
        add.inputs["B"].default_value = (6, 6, 6.5, 1)
        L.new(m2.outputs[0], add.inputs["Factor"])
        L.new(sky_col, add.inputs["A"])
        sky_col = add.outputs["Result"]

    L.new(sky_col, bg.inputs["Color"])
    bg.inputs["Strength"].default_value = g.get("guc", 1.0)
    scene.world = world
    return g.get("ufuk", "#F6C9B5")


def build_sun(scene, s):
    ld = bpy.data.lights.new("Gunes", "SUN")
    ld.energy = s.get("guc", 3.0)
    ld.angle = math.radians(s.get("yumusaklik", 10))
    ld.color = hex_rgb(s.get("renk", "#FFE6CC"))[:3]
    o = bpy.data.objects.new("Gunes", ld)
    scene.collection.objects.link(o)
    elev = math.radians(s.get("yukseklik", 28))
    az = math.radians(s.get("yon", 145))  # 180 = kameranın karşısından (arka ışık)
    d = Vector((math.sin(az) * math.cos(elev), -math.cos(az) * math.cos(elev), math.sin(elev)))
    o.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    if s.get("dolgu", 0):
        f = bpy.data.lights.new("Dolgu", "AREA")
        f.energy = s["dolgu"]; f.size = 10
        f.color = hex_rgb(s.get("dolgu_renk", "#FFD6E0"))[:3]
        fo = bpy.data.objects.new("Dolgu", f)
        fo.location = (4, -8, 5)
        scene.collection.objects.link(fo)
        fo.rotation_euler = (Vector((0, 0, 1.2)) - fo.location).to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------- zemin

def terrain_height(x, y, z, seed):
    r = math.hypot(x, y)
    flat = max(0.0, min(1.0, (r - z.get("duz_yaricap", 3.2)) / 7.0))
    flat = flat * flat * (3 - 2 * flat)
    o = Vector((seed * 13.1, seed * 7.7, 0))
    f = z.get("kumul_olcek", 0.035)
    p = Vector((x * f, y * f * 0.6, 0)) + o
    dune = noise.fractal(p, 0.6, 2.0, 3) * z.get("kumul_yukseklik", 2.2)
    ridge = (1 - abs(noise.noise(p * 0.5 + Vector((3, 1, 0))))) ** 2 * z.get("sirt", 1.4)
    far = max(0.0, (y - 40) / 160) * z.get("uzak_yukseklik", 4.0)
    return (dune + ridge + far * (0.5 + 0.5 * noise.noise(p * 0.3))) * flat


def build_ground(scene, z, haze, seed):
    size = z.get("boyut", 520.0)
    res = z.get("cozunurluk", 220)
    bm = bmesh.new()
    # Kameraya yakın kısımda daha sık örnekleme için kare ızgara (y ekseni ileriye kaymış)
    verts = []
    for j in range(res + 1):
        row = []
        t = j / res
        y = -40 + (t ** 1.6) * size * 0.8
        for i in range(res + 1):
            x = (i / res - 0.5) * size * (0.25 + 0.75 * t)
            row.append(bm.verts.new((x, y, terrain_height(x, y, z, seed))))
        verts.append(row)
    for j in range(res):
        for i in range(res):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    me = bpy.data.meshes.new("Zemin")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = _new_obj("Zemin", me, scene)
    o.data.materials.append(haze_material(
        "Kum", z.get("renk", "#F2B79A"), haze, roughness=0.9, sheen=0.5,
        variation=z.get("renk2"), var_scale=0.05,
        bump={"olcek": 0.9, "bozulma": 4.0, "guc": z.get("dalgacik", 0.12)} if z.get("dalgacik", 0.12) else None,
        near=z.get("pus_yakin", 20), far=z.get("pus_uzak", 240)))
    o.modifiers.new("Carpisma", "COLLISION")
    o.collision.thickness_outer = 0.01
    return o


def ground_z(x, y, z, seed):
    return terrain_height(x, y, z, seed)


# ---------------------------------------------------------------- nesneler

def _faceted_rock(name, h, w, rnd, mat, scene):
    bpy.ops.mesh.primitive_cone_add(vertices=rnd.randint(5, 8), radius1=w, radius2=w * rnd.uniform(0.05, 0.25),
                                    depth=h, location=(0, 0, h / 2))
    o = bpy.context.active_object
    o.name = name
    mod = o.modifiers.new("Bol", "SUBSURF"); mod.levels = mod.render_levels = 2
    mod.subdivision_type = "SIMPLE"
    bpy.ops.object.modifier_apply(modifier="Bol")
    for v in o.data.vertices:  # kırık, fasetli yüzey
        k = 0.18 * w * (0.4 + v.co.z / h)
        n = noise.noise(v.co * (2.2 / w) + Vector((rnd.random() * 50, 0, 0)))
        v.co.x += n * k
        v.co.y += noise.noise(v.co * (2.0 / w) + Vector((0, 9, 0))) * k
        v.co.z += noise.noise(v.co * (1.5 / w) + Vector((0, 0, 4))) * h * 0.04
    dec = o.modifiers.new("Faset", "DECIMATE"); dec.ratio = 0.35
    bpy.ops.object.modifier_apply(modifier="Faset")
    for p in o.data.polygons:
        p.use_smooth = False
    o.data.materials.append(mat)
    return o


def build_rocks(scene, k, z, haze, seed):
    rnd = random.Random(seed + 11)
    mat = haze_material("Kaya", k.get("renk", "#E9727A"), haze, roughness=0.75, sheen=0.2,
                        variation=k.get("renk2", "#F59A8C"), var_scale=0.08, near=15, far=320)
    placed = 0
    tries = 0
    while placed < k.get("adet", 26) and tries < 2000:
        tries += 1
        y = rnd.uniform(k.get("min_y", 12), k.get("max_y", 160))
        side = rnd.choice((-1, 1))
        d = y - CAM_Y
        x = side * rnd.uniform(0.12, 0.42) * d  # kanyon duvarları: yolun iki yanı
        if k.get("yol", True) is False:
            x = rnd.uniform(-0.4, 0.4) * d
        if not _in_view(x, y, 1.6):
            continue
        sc = 0.7 + d / 30
        h = rnd.uniform(4, 11) * sc * k.get("olcek", 1.0)
        w = h * rnd.uniform(0.22, 0.4)
        o = _faceted_rock(f"Kaya{placed}", h, w, rnd, mat, scene)
        o.location = (x, y, ground_z(x, y, z, seed) - 0.5)
        o.rotation_euler.z = rnd.random() * 6.28
        placed += 1


def _capsule(r, length, segs=24, rib=0.08, rings=10):
    """Oluklu kapsül (kaktüs gövdesi/kolu). Taban z=0, tepe z=length."""
    bm = bmesh.new()
    prof = []
    body = length - r
    for k in range(rings + 1):
        prof.append((k / rings * body, 1.0))
    for k in range(1, 7):
        a = k / 6 * math.pi / 2
        prof.append((body + math.sin(a) * r, math.cos(a)))
    rings_v = []
    for zz, s in prof:
        ring = []
        for i in range(segs):
            ang = i / segs * 2 * math.pi
            rr = r * s * (1 - rib * (i % 2))
            ring.append(bm.verts.new((math.cos(ang) * rr, math.sin(ang) * rr, zz)))
        rings_v.append(ring)
    for a, b in zip(rings_v, rings_v[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    top = bm.verts.new((0, 0, length))
    for i in range(segs):
        bm.faces.new((rings_v[-1][i], rings_v[-1][(i + 1) % segs], top))
    return bm


def build_cactus(scene, name, h, arms, rnd, mat):
    r = h * rnd.uniform(0.06, 0.075)
    parts = []
    me = bpy.data.meshes.new(name)
    bm = _capsule(r, h)
    bm.to_mesh(me); bm.free()
    trunk = _new_obj(name, me, scene)
    parts.append(trunk)
    for a in range(arms):
        side = 1 if a % 2 == 0 else -1
        ang = side * (math.pi / 2) + rnd.uniform(-0.5, 0.5)
        ar = r * rnd.uniform(0.62, 0.78)
        az = h * rnd.uniform(0.3, 0.58)
        out = r + ar * rnd.uniform(1.3, 2.0)
        up = h * rnd.uniform(0.22, 0.42)
        bend = ar * 1.6
        # dirsek: gövdenin içinden çıkıp yukarı kıvrılan boru
        cu = bpy.data.curves.new(name + "Dirsek", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = ar
        cu.bevel_resolution = 6
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(1)
        p0, p1 = sp.bezier_points
        p0.co = (0, 0, az)
        p0.handle_left = (-0.1, 0, az)
        p0.handle_right = (out - bend * 0.2, 0, az)
        p1.co = (out, 0, az + bend)
        p1.handle_left = (out, 0, az + bend * 0.2)
        p1.handle_right = (out, 0, az + bend + 0.1)
        co = bpy.data.objects.new(name + "Dirsek", cu)
        scene.collection.objects.link(co)
        bpy.ops.object.select_all(action="DESELECT")
        co.select_set(True)
        bpy.context.view_layer.objects.active = co
        bpy.ops.object.convert(target="MESH")
        co.rotation_euler.z = ang
        parts.append(co)
        # dikey kol: oluklu, yuvarlak uçlu
        mv = bpy.data.meshes.new(name + "KolD")
        b = _capsule(ar, up + ar); b.to_mesh(mv); b.free()
        o2 = _new_obj(name + "KolD", mv, scene)
        o2.location = (math.cos(ang) * out, math.sin(ang) * out, az + bend - 0.02)
        parts.append(o2)
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = trunk
    bpy.ops.object.join()
    trunk.data.materials.append(mat)
    for p in trunk.data.polygons:
        p.use_smooth = True
    sub = trunk.modifiers.new("Yumusak", "SUBSURF"); sub.levels = sub.render_levels = 1
    return trunk


def build_cacti(scene, c, z, haze, seed):
    rnd = random.Random(seed + 23)
    mat = haze_material("Kaktus", c.get("renk", "#7E9C6E"), haze, roughness=0.6, sheen=0.4,
                        variation=c.get("renk2", "#93AE80"), var_scale=0.6, near=18, far=260)
    spots = list(c.get("sabit", [[-2.3, 1.5, 5.2, 3], [2.4, 3.2, 6.4, 2]]))  # [x, y, boy, kol]
    n = c.get("adet", 10)
    tries = 0
    while len(spots) < n + 2 and tries < 3000:
        tries += 1
        y = rnd.uniform(8, 120)
        x = rnd.uniform(-0.45, 0.45) * (y - CAM_Y)
        if abs(x) < 3.5 and y < 14:
            continue
        if not _in_view(x, y):
            continue
        spots.append([x, y, rnd.uniform(3.5, 7.5), rnd.choice((0, 1, 2, 2, 3))])
    for i, (x, y, h, arms) in enumerate(spots):
        o = build_cactus(scene, f"Kaktus{i}", h, arms, rnd, mat)
        o.location = (x, y, ground_z(x, y, z, seed) - 0.1)
        o.rotation_euler.z = rnd.random() * 6.28


def build_bushes(scene, b, z, haze, seed, frames):
    """Tüylü kuru çalılar: kısa saç parçacıkları ile."""
    rnd = random.Random(seed + 37)
    mat = haze_material("Cali", b.get("renk", "#C7A48A"), haze, roughness=0.9, sheen=0.8,
                        variation=b.get("renk2", "#A88C7A"), var_scale=2.0, near=15, far=160)
    n = b.get("adet", 22)
    placed = 0
    tries = 0
    while placed < n and tries < 3000:
        tries += 1
        y = rnd.uniform(-1.5, 60)
        x = rnd.uniform(-0.45, 0.45) * (y - CAM_Y)
        if math.hypot(x, y) < 2.6 or not _in_view(x, y, 1.1):
            continue
        r = rnd.uniform(0.25, 0.6) * (1 + max(0, y) / 60)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r,
                                              location=(x, y, ground_z(x, y, z, seed) + r * 0.25))
        o = bpy.context.active_object
        o.name = f"Cali{placed}"
        o.scale.z = 0.6
        o.data.materials.append(mat)
        ps = o.modifiers.new("Tuy", "PARTICLE_SYSTEM").particle_system.settings
        ps.type = "HAIR"
        ps.count = b.get("tuy", 420)
        ps.hair_length = r * 0.9
        ps.use_advanced_hair = True
        ps.child_type = "INTERPOLATED"
        ps.rendered_child_count = 6
        ps.child_length = 1.0
        ps.roughness_2 = 0.25 * r
        ps.roughness_endpoint = 0.15 * r
        ps.radius_scale = b.get("kalinlik", 0.006)
        ps.root_radius = 1.0
        ps.tip_radius = 0.15
        ps.material = 1
        # rüzgârda hafif sallanma
        o.rotation_euler = (0, 0, rnd.random() * 6.28)
        o.keyframe_insert("rotation_euler", frame=1)
        o.rotation_euler.x = rnd.uniform(-0.05, 0.05)
        o.keyframe_insert("rotation_euler", frame=max(2, frames // 2))
        o.rotation_euler.x = 0
        o.keyframe_insert("rotation_euler", frame=frames)
        placed += 1


def build_balls(scene, t, z, haze, seed, frames):
    rnd = random.Random(seed + 41)
    cols = t.get("renkler", ["#F0A27E", "#F3B08F", "#E98F74"])
    mats = [haze_material(f"Top{i}", c, haze, roughness=0.55, sheen=0.3, near=15, far=200)
            for i, c in enumerate(cols)]
    n = t.get("adet", 24)
    placed = 0
    tries = 0
    while placed < n and tries < 3000:
        tries += 1
        y = rnd.uniform(-2.0, 45)
        x = rnd.uniform(-0.45, 0.45) * (y - CAM_Y)
        if math.hypot(x, y) < 2.5 or not _in_view(x, y, 1.1):
            continue
        r = rnd.uniform(0.12, 0.55) * (1 + max(0, y) / 40)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r,
                                             location=(x, y, ground_z(x, y, z, seed) + r * 0.8))
        o = bpy.context.active_object
        bpy.ops.object.shade_smooth()
        o.name = f"Top{placed}"
        o.data.materials.append(rnd.choice(mats))
        if t.get("suzulme", False) and rnd.random() < 0.3:
            base = o.location.z
            o.keyframe_insert("location", frame=1)
            o.location.z = base + rnd.uniform(0.05, 0.15)
            o.keyframe_insert("location", frame=max(2, frames // 2))
            o.location.z = base
            o.keyframe_insert("location", frame=frames)
        placed += 1


def build_clouds(scene, b, haze, seed, frames):
    """Pofuduk bulutlar (metaball) – sabit hızla akar."""
    rnd = random.Random(seed + 53)
    mat = haze_material("Bulut", b.get("renk", "#FFFFFF"), haze, roughness=1.0, sheen=1.0,
                        near=60, far=900, emission=b.get("renk", "#FFFFFF"),
                        emission_strength=b.get("parlaklik", 0.25))
    speed = b.get("hiz", 0.6)  # m/sn
    secs = frames / 30
    for i in range(b.get("adet", 9)):
        y = rnd.uniform(60, 320)
        d = y - CAM_Y
        x = rnd.uniform(-0.35, 0.35) * d
        zc = rnd.uniform(0.10, 0.42) * d + 4
        size = rnd.uniform(0.05, 0.1) * d
        mb = bpy.data.metaballs.new(f"Bulut{i}")
        mb.resolution = size / 18
        mb.render_resolution = size / 24
        for k in range(rnd.randint(6, 11)):
            el = mb.elements.new()
            el.co = (rnd.uniform(-1.6, 1.6) * size, rnd.uniform(-0.4, 0.4) * size,
                     rnd.uniform(-0.1, 0.5) * size * (1 - abs(k - 4) / 8))
            el.radius = rnd.uniform(0.55, 1.05) * size
        o = bpy.data.objects.new(f"Bulut{i}", mb)
        scene.collection.objects.link(o)
        o.location = (x, y, zc)
        o.scale.z = 0.62
        mb.materials.append(mat)
        o.keyframe_insert("location", frame=1)
        o.location.x = x + speed * secs * (d / 60)
        o.keyframe_insert("location", frame=frames)
        _linear(o)


def build_planets(scene, p, haze, seed, frames):
    rnd = random.Random(seed + 67)
    specs = p.get("liste") or []
    if not specs:
        cols = p.get("renkler", ["#FBEDE6", "#F7C9C0", "#F2A5A0"])
        for i in range(p.get("adet", 6)):
            y = rnd.uniform(90, 360)
            d = y - CAM_Y
            specs.append({
                "konum": [rnd.uniform(-0.3, 0.3) * d, y, rnd.uniform(0.18, 0.5) * d],
                "yaricap": rnd.uniform(0.012, 0.06) * d,
                "renk": rnd.choice(cols),
                "halka": p.get("halka", False) and rnd.random() < 0.35})
    for i, s in enumerate(specs):
        r = s["yaricap"]
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=r, location=s["konum"])
        o = bpy.context.active_object
        bpy.ops.object.shade_smooth()
        o.name = f"Gezegen{i}"
        mat = haze_material(f"Gezegen{i}", s["renk"], haze, roughness=0.7, sheen=0.6,
                            variation=s.get("renk2") or lerp_hex_hex(s["renk"], "#FFFFFF", 0.35),
                            var_scale=1.2 / max(r, 0.1), near=80, far=1400,
                            emission=s["renk"], emission_strength=p.get("parlaklik", 0.15))
        o.data.materials.append(mat)
        o.rotation_euler = (rnd.uniform(-0.4, 0.4), 0.2, 0)
        o.keyframe_insert("rotation_euler", frame=1)
        o.rotation_euler.z += math.radians(p.get("donus", 25)) * frames / 120
        o.keyframe_insert("rotation_euler", frame=frames)
        o.keyframe_insert("location", frame=1)
        o.location.z += r * 0.06
        o.keyframe_insert("location", frame=frames)
        _linear(o)
        if s.get("halka"):
            bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.7, minor_radius=r * 0.18,
                                             location=s["konum"], rotation=(1.2, 0.3, 0))
            ring = bpy.context.active_object
            ring.scale.z = 0.06
            ring.data.materials.append(haze_material(f"Halka{i}", p.get("halka_renk", "#FFF3E6"), haze,
                                                     near=80, far=1400, emission="#FFF3E6",
                                                     emission_strength=0.2))


def lerp_hex_hex(a, b, t):
    ca, cb = a.lstrip("#"), b.lstrip("#")
    va = [int(ca[i:i + 2], 16) for i in (0, 2, 4)]
    vb = [int(cb[i:i + 2], 16) for i in (0, 2, 4)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(va, vb))


# ---------------------------------------------------------------- ana giriş

def build(scene, d, frames, seed=0):
    seed = d.get("tohum", seed)
    haze = build_sky(scene, d.get("gok", {}), frames)
    haze = d.get("pus_rengi", haze)
    build_sun(scene, d.get("gunes", {}))
    z = d.get("zemin", {})
    build_ground(scene, z, haze, seed)
    if d.get("kayalar"):
        build_rocks(scene, d["kayalar"], z, haze, seed)
    if d.get("kaktusler"):
        build_cacti(scene, d["kaktusler"], z, haze, seed)
    if d.get("calilar"):
        build_bushes(scene, d["calilar"], z, haze, seed, frames)
    if d.get("toplar"):
        build_balls(scene, d["toplar"], z, haze, seed, frames)
    if d.get("bulutlar"):
        build_clouds(scene, d["bulutlar"], haze, seed, frames)
    if d.get("gezegenler"):
        build_planets(scene, d["gezegenler"], haze, seed, frames)
    return 0.0
