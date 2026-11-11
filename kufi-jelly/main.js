// Kufi Jelly: "Softness 1/10 → 10/10" — jöle küp serisi.
// Kurallar (Fable Motion Playbook'tan): sayılar sıfatların yerine, müzik saattir
// (her çarpma bir vuruşa düşer), kahraman kadrajın ≥ %55'i, sabit adımlı
// deterministik fizik (renderAt(t) her zaman aynı kareyi verir).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ zaman çizelgesi (müzik = saat)
const FPS = 30, BPM = 120, BEAT = 60 / BPM;          // 15 kare / vuruş
const INTRO = 2 * BEAT, SHOT = 7 * BEAT, OUTRO = 6 * BEAT;
const IMPACT_AT = 2 * BEAT;                            // her çekimde çarpma 2. vuruşta (1.0 sn)
const SIM_HZ = 240;                                    // sabit fizik adımı
const G = 13.5;                                        // yerçekimi (m/s²), biraz canlı
const CUBE = 1.6, PED_H = 0.45, PED_R = 1.9;
const DROP_H = 3.4;                                    // küpün altı ile kaide arası (m)
const T_FALL = Math.sqrt(2 * DROP_H / G);              // 0.71 sn
const DARK = '#16161C';

// yumuşaklık → fizik (her adım 1/240 sn):
//   shape  : şekil eşleme gücü (1 = tamamen katı)   edge: kenar sertliği   damp: hız sönümü
const SHOTS = [
  { s: 1,  bg: '#FFB3C6', jelly: '#38B6FF', shape: 0.25,   edge: 1.0,  iters: 4, damp: 0.990,  drops: 0, smooth: 0 },
  { s: 3,  bg: '#9EF0D8', jelly: '#FF4F8B', shape: 0.012,  edge: 0.5,  iters: 2, damp: 0.995,  drops: 0, smooth: 0.02 },
  { s: 5,  bg: '#FFE27A', jelly: '#8A3FFC', shape: 0.0035, edge: 0.18, iters: 1, damp: 0.997,  drops: 5, smooth: 0.09 },
  { s: 7,  bg: '#C9B6FF', jelly: '#FF8A1F', shape: 0.0012, edge: 0.07, iters: 1, damp: 0.998,  drops: 9, smooth: 0.13 },
  { s: 10, bg: '#8FE3FF', jelly: '#F2266E', shape: 0.00035, edge: 0.02, iters: 1, damp: 0.9985, drops: 16, smooth: 0.14 },
];
const TOTAL = INTRO + SHOTS.length * SHOT + OUTRO;
window.FPS = FPS;
window.TOTAL_FRAMES = Math.round(TOTAL * FPS);
window.cues = [];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
// cubic-bezier(0.16, 1, 0.3, 1) ≈ expo out
const easeOut = (t) => { t = clamp(t); return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); };
// kapalı formlu yay (deterministik): sönüm oranı ζ, frekans ω
const spring = (t, zeta = 0.5, w = 18) => {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
};
const $ = (s) => document.querySelector(s);
const hexLin = (h) => new THREE.Color(h);

// ------------------------------------------------------------------ renderer + sahne
const W = 1080, H = 1920;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.transmissionResolutionScale = 0.75;
$('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);

const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(3.5, 8, 5.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 25 });
key.shadow.bias = -0.0006;
key.shadow.radius = 6;
scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 2.2);
rim.position.set(-3, 4, -5);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, 0.35));

// Arka plan: opak bir düzlem (jöle onu kırarak gösterir). Üstüne dev hayalet rakam çizilir.
const bgCanvas = document.createElement('canvas'); bgCanvas.width = 900; bgCanvas.height = 1200;
const bgCtx = bgCanvas.getContext('2d');
const bgTex = new THREE.CanvasTexture(bgCanvas); bgTex.colorSpace = THREE.SRGBColorSpace;
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 18), new THREE.MeshBasicMaterial({ map: bgTex, toneMapped: false }));
backdrop.position.set(0, 2.2, -6);
scene.add(backdrop);
let bgState = '';
function drawBackdrop(color, label, slide, alpha) {
  const k = `${color}|${label}|${slide.toFixed(1)}|${alpha.toFixed(2)}`;
  if (k === bgState) return; bgState = k;
  const g = bgCtx, w = bgCanvas.width, h = bgCanvas.height;
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  if (label && alpha > 0) {
    g.save();
    g.globalAlpha = 0.28 * alpha;
    g.fillStyle = '#ffffff';
    g.font = '900 520px Inter';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.translate(w / 2 + slide, h * 0.47); g.rotate(-0.07);
    g.fillText(label, 0, 0);
    g.restore();
  }
  const vg = g.createRadialGradient(w / 2, h * 0.55, w * 0.2, w / 2, h * 0.55, w * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  bgTex.needsUpdate = true;
}

// zemin: yalnızca gölge (arka plan rengi kesintisiz devam eder)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
scene.add(floor);

// kaide: yuvarlatılmış kenarlı silindir (lathe)
const pedProfile = [];
pedProfile.push(new THREE.Vector2(0, 0));
pedProfile.push(new THREE.Vector2(PED_R - 0.02, 0));
for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pedProfile.push(new THREE.Vector2(PED_R - 0.08 + 0.08 * Math.cos(a), PED_H - 0.08 + 0.08 * Math.sin(a))); }
pedProfile.push(new THREE.Vector2(0, PED_H));
const pedMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 });
const pedestal = new THREE.Mesh(new THREE.LatheGeometry(pedProfile, 96), pedMat);
pedestal.castShadow = true; pedestal.receiveShadow = true;
scene.add(pedestal);
const ring = new THREE.Mesh(new THREE.TorusGeometry(PED_R + 0.005, 0.03, 12, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
ring.rotation.x = Math.PI / 2; ring.position.y = PED_H * 0.45;
scene.add(ring);

// ------------------------------------------------------------------ jöle küp (yumuşak cisim)
const base = new RoundedBoxGeometry(CUBE, CUBE, CUBE, 8, 0.36);
base.deleteAttribute('normal'); base.deleteAttribute('uv');
const geo = mergeVertices(base, 1e-4);
const NV = geo.attributes.position.count;
const REST = Float32Array.from(geo.attributes.position.array);       // merkez (0,0,0)
const TRIS = Uint32Array.from(geo.index.array);
const EDGES = (() => {
  const set = new Set(), out = [];
  for (let t = 0; t < TRIS.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const i = TRIS[t + a], j = TRIS[t + b], k = i < j ? i * 65536 + j : j * 65536 + i;
    if (!set.has(k)) { set.add(k); out.push(Math.min(i, j), Math.max(i, j)); }
  }
  return Uint32Array.from(out);
})();
const EDGE_REST = new Float32Array(EDGES.length / 2);
for (let e = 0; e < EDGES.length; e += 2) {
  const a = EDGES[e] * 3, b = EDGES[e + 1] * 3;
  EDGE_REST[e / 2] = Math.hypot(REST[a] - REST[b], REST[a + 1] - REST[b + 1], REST[a + 2] - REST[b + 2]);
}
// komşuluk listesi (yüzey pürüzsüzlüğü için)
const NB_START = new Uint32Array(NV + 1), NB = (() => {
  const lists = Array.from({ length: NV }, () => []);
  for (let e = 0; e < EDGES.length; e += 2) { lists[EDGES[e]].push(EDGES[e + 1]); lists[EDGES[e + 1]].push(EDGES[e]); }
  const flat = []; for (let v = 0; v < NV; v++) { NB_START[v] = flat.length; flat.push(...lists[v]); } NB_START[NV] = flat.length;
  return Uint32Array.from(flat);
})();
const AVG = new Float32Array(NV * 3);
function smoothSurface(k) {
  if (k <= 0) return;
  for (let v = 0; v < NV; v++) {
    let x = 0, y = 0, z = 0; const a = NB_START[v], b = NB_START[v + 1];
    for (let j = a; j < b; j++) { const n = NB[j] * 3; x += P[n]; y += P[n + 1]; z += P[n + 2]; }
    const c = b - a; AVG[v * 3] = x / c; AVG[v * 3 + 1] = y / c; AVG[v * 3 + 2] = z / c;
  }
  for (let i = 0; i < P.length; i++) P[i] += (AVG[i] - P[i]) * k;
}

function volumeOf(p) {
  let v = 0;
  for (let t = 0; t < TRIS.length; t += 3) {
    const a = TRIS[t] * 3, b = TRIS[t + 1] * 3, c = TRIS[t + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}
const V0 = volumeOf(REST);

const jellyMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.12, metalness: 0, transmission: 1.0, thickness: 1.4, ior: 1.38,
  clearcoat: 1.0, clearcoatRoughness: 0.06, attenuationDistance: 1.5, attenuationColor: new THREE.Color(1, 1, 1),
  specularIntensity: 1.0, envMapIntensity: 1.1,
});
const jellyGeo = new THREE.BufferGeometry();
jellyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
jellyGeo.setIndex(new THREE.BufferAttribute(TRIS, 1));
const jelly = new THREE.Mesh(jellyGeo, jellyMat);
jelly.castShadow = true; jelly.frustumCulled = false;
scene.add(jelly);

// yüz: gözler ve ağız yüzeye "yapışık" (en yakın köşelerin ağırlıklı ortalaması)
function anchor(rx, ry) {
  const target = [rx, ry, CUBE / 2];
  const near = [];
  for (let i = 0; i < NV; i++) {
    const d = Math.hypot(REST[i * 3] - target[0], REST[i * 3 + 1] - target[1], REST[i * 3 + 2] - target[2]);
    near.push([d, i]);
  }
  near.sort((a, b) => a[0] - b[0]);
  const pick = near.slice(0, 6);
  return { idx: pick.map((p) => p[1]), w: pick.map((p) => 1 / (p[0] + 0.03)) };
}
const faceMat = new THREE.MeshPhysicalMaterial({ color: 0x15121c, roughness: 0.15, clearcoat: 1 });
const eyeGeo = new THREE.SphereGeometry(0.135, 24, 16);
const eyes = [-1, 1].map((s) => {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(eyeGeo, faceMat); ball.scale.set(1, 1.4, 0.35);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  shine.position.set(0.035, 0.07, 0.04);
  g.add(ball, shine); scene.add(g);
  return { g, ball, a: anchor(s * 0.25, 0.06) };
});
const smile = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.024, 8, 24, Math.PI), faceMat);
const ohMouth = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), faceMat);
const mouth = { g: new THREE.Group(), a: anchor(0, -0.2) };
smile.rotation.z = Math.PI; mouth.g.add(smile, ohMouth); scene.add(mouth.g);
const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7aa2, transparent: true, opacity: 0.55, depthWrite: false });
const blushes = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), blushMat); scene.add(m); return { g: m, a: anchor(s * 0.46, -0.14) }; });

// damlacıklar (yüksek yumuşaklıkta çarpmada sıçrar)
const dropGeo = new THREE.SphereGeometry(1, 20, 14);
const drops = [];
for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(dropGeo, jellyMat); m.castShadow = true; m.visible = false; scene.add(m); drops.push(m); }

// ------------------------------------------------------------------ fizik durumu
const P = new Float32Array(NV * 3), PREV = new Float32Array(NV * 3), N = new Float32Array(NV * 3);
const Q = new THREE.Quaternion();
let simShot = -1, simStep = -1, firstHit = -1, released = false;
const fired = new Set();
function cue(type, t, strength = 1) { window.cues.push({ type, t: +t.toFixed(4), strength }); }

function shotStart(i) { return INTRO + i * SHOT; }
function resetJelly(i) {
  simShot = i; firstHit = -1; released = false; Q.identity();
  const y0 = PED_H + DROP_H + CUBE / 2;
  for (let v = 0; v < NV; v++) {
    P[v * 3] = REST[v * 3]; P[v * 3 + 1] = REST[v * 3 + 1] + y0; P[v * 3 + 2] = REST[v * 3 + 2];
  }
  PREV.set(P);
  const c = new THREE.Color(SHOTS[i].jelly);
  jellyMat.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.35);
  jellyMat.attenuationColor.copy(c);
}

const cx = [0, 0, 0];
function shapeMatch(alpha) {
  // kütle merkezi
  let mx = 0, my = 0, mz = 0;
  for (let v = 0; v < NV; v++) { mx += P[v * 3]; my += P[v * 3 + 1]; mz += P[v * 3 + 2]; }
  mx /= NV; my /= NV; mz /= NV;
  // A = Σ (x - c) qᵀ  (sütunlar a0, a1, a2)
  const a = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let v = 0; v < NV; v++) {
    const px = P[v * 3] - mx, py = P[v * 3 + 1] - my, pz = P[v * 3 + 2] - mz;
    const qx = REST[v * 3], qy = REST[v * 3 + 1], qz = REST[v * 3 + 2];
    a[0] += px * qx; a[1] += py * qx; a[2] += pz * qx;
    a[3] += px * qy; a[4] += py * qy; a[5] += pz * qy;
    a[6] += px * qz; a[7] += py * qz; a[8] += pz * qz;
  }
  // dönüşü çıkar (Müller 2016, kuaterniyon yinelemesi)
  const m = new THREE.Matrix4(), e = m.elements, dq = new THREE.Quaternion(), ax = new THREE.Vector3();
  for (let it = 0; it < 8; it++) {
    m.makeRotationFromQuaternion(Q);
    const r = [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
    let ox = 0, oy = 0, oz = 0, den = 0;
    for (let c = 0; c < 3; c++) {
      const rx = r[c * 3], ry = r[c * 3 + 1], rz = r[c * 3 + 2], bx = a[c * 3], by = a[c * 3 + 1], bz = a[c * 3 + 2];
      ox += ry * bz - rz * by; oy += rz * bx - rx * bz; oz += rx * by - ry * bx;
      den += rx * bx + ry * by + rz * bz;
    }
    den = Math.abs(den) + 1e-9;
    ox /= den; oy /= den; oz /= den;
    const wl = Math.hypot(ox, oy, oz);
    if (wl < 1e-9) break;
    dq.setFromAxisAngle(ax.set(ox / wl, oy / wl, oz / wl), wl);
    Q.premultiply(dq).normalize();
  }
  m.makeRotationFromQuaternion(Q);
  for (let v = 0; v < NV; v++) {
    const qx = REST[v * 3], qy = REST[v * 3 + 1], qz = REST[v * 3 + 2];
    const gx = e[0] * qx + e[4] * qy + e[8] * qz + mx, gy = e[1] * qx + e[5] * qy + e[9] * qz + my, gz = e[2] * qx + e[6] * qy + e[10] * qz + mz;
    P[v * 3] += (gx - P[v * 3]) * alpha; P[v * 3 + 1] += (gy - P[v * 3 + 1]) * alpha; P[v * 3 + 2] += (gz - P[v * 3 + 2]) * alpha;
  }
}

const GRAD = new Float32Array(NV * 3);
function volumeConstraint(k) {
  const V = volumeOf(P);
  GRAD.fill(0);
  for (let t = 0; t < TRIS.length; t += 3) {
    const a = TRIS[t] * 3, b = TRIS[t + 1] * 3, c = TRIS[t + 2] * 3;
    // ∂V/∂a = (b × c)/6 vb.
    GRAD[a] += (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) / 6; GRAD[a + 1] += (P[b + 2] * P[c] - P[b] * P[c + 2]) / 6; GRAD[a + 2] += (P[b] * P[c + 1] - P[b + 1] * P[c]) / 6;
    GRAD[b] += (P[c + 1] * P[a + 2] - P[c + 2] * P[a + 1]) / 6; GRAD[b + 1] += (P[c + 2] * P[a] - P[c] * P[a + 2]) / 6; GRAD[b + 2] += (P[c] * P[a + 1] - P[c + 1] * P[a]) / 6;
    GRAD[c] += (P[a + 1] * P[b + 2] - P[a + 2] * P[b + 1]) / 6; GRAD[c + 1] += (P[a + 2] * P[b] - P[a] * P[b + 2]) / 6; GRAD[c + 2] += (P[a] * P[b + 1] - P[a + 1] * P[b]) / 6;
  }
  let s = 0; for (let i = 0; i < GRAD.length; i++) s += GRAD[i] * GRAD[i];
  const lam = k * (V - V0) / (s + 1e-9);
  for (let i = 0; i < P.length; i++) P[i] -= lam * GRAD[i];
}

function collide(tNow) {
  for (let v = 0; v < NV; v++) {
    const i = v * 3, x = P[i], y = P[i + 1], z = P[i + 2];
    const r = Math.hypot(x, z);
    let hit = false;
    if (r < PED_R && y < PED_H) {           // kaidenin içinde: en yakın yüzeye it
      if (PED_H - y < PED_R - r) { P[i + 1] = PED_H; hit = true; }
      else { const k = PED_R / (r || 1e-6); P[i] = x * k; P[i + 2] = z * k; }
    }
    if (P[i + 1] < 0) { P[i + 1] = 0; hit = true; }
    if (hit) {                               // sürtünme
      P[i] = PREV[i] + (P[i] - PREV[i]) * 0.35; P[i + 2] = PREV[i + 2] + (P[i + 2] - PREV[i + 2]) * 0.35;
      if (firstHit < 0) firstHit = tNow;
    }
  }
}

function simStepOnce(spec, tNow) {
  const dt = 1 / SIM_HZ, gdt = -G * dt * dt;
  for (let i = 0; i < P.length; i++) {
    const v = (P[i] - PREV[i]) * spec.damp;
    PREV[i] = P[i];
    P[i] += v + ((i % 3) === 1 ? gdt : 0);
  }
  for (let it = 0; it < spec.iters; it++) {
    for (let e = 0; e < EDGES.length; e += 2) {
      const a = EDGES[e] * 3, b = EDGES[e + 1] * 3;
      const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      const f = 0.5 * spec.edge * (d - EDGE_REST[e / 2]) / d;
      P[a] += dx * f; P[a + 1] += dy * f; P[a + 2] += dz * f;
      P[b] -= dx * f; P[b + 1] -= dy * f; P[b + 2] -= dz * f;
    }
    smoothSurface(spec.smooth);
    volumeConstraint(0.9);
    collide(tNow);
  }
  shapeMatch(spec.shape);
  collide(tNow);
}

// fiziği t anına kadar sabit adımlarla ilerlet (deterministik)
function advanceSim(i, t) {
  if (i !== simShot) { resetJelly(i); simStep = Math.round((shotStart(i) + IMPACT_AT - T_FALL) * SIM_HZ) - 1; }
  const target = Math.round(t * SIM_HZ);
  const spec = SHOTS[i];
  while (simStep < target) {
    simStep++;
    const tNow = simStep / SIM_HZ;
    simStepOnce(spec, tNow);
  }
}

// ------------------------------------------------------------------ yüz ve damlacıklar
const tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3(), up = new THREE.Vector3();
function placeOnSurface(obj, a, lift = 0.012) {
  tmpV.set(0, 0, 0); tmpN.set(0, 0, 0); let ws = 0;
  for (let k = 0; k < a.idx.length; k++) {
    const v = a.idx[k], w = a.w[k];
    tmpV.x += P[v * 3] * w; tmpV.y += P[v * 3 + 1] * w; tmpV.z += P[v * 3 + 2] * w;
    tmpN.x += N[v * 3] * w; tmpN.y += N[v * 3 + 1] * w; tmpN.z += N[v * 3 + 2] * w;
    ws += w;
  }
  tmpV.multiplyScalar(1 / ws); tmpN.normalize();
  obj.position.copy(tmpV).addScaledVector(tmpN, lift);
  up.set(0, 1, 0).applyQuaternion(Q);
  obj.up.copy(up);
  obj.lookAt(tmpV.x + tmpN.x, tmpV.y + tmpN.y, tmpV.z + tmpN.z);
}

function dropState(i, t) {
  // damlacıklar: çarpma anında halka şeklinde fırlar, kapalı formlu balistik yol
  const spec = SHOTS[i];
  const t0 = shotStart(i) + IMPACT_AT;
  for (let k = 0; k < drops.length; k++) {
    const m = drops[k];
    if (k >= spec.drops || t < t0) { m.visible = false; continue; }
    const ang = (k / spec.drops) * Math.PI * 2 + 0.4 * Math.sin(k * 7.1);
    const sp = 1.1 + 1.2 * ((k * 37) % 10) / 10, vy = 2.6 + 1.8 * ((k * 53) % 10) / 10;
    const r0 = 0.85, y0 = PED_H + 0.08;
    const tau = t - t0;
    let x = Math.cos(ang) * (r0 + sp * tau), z = Math.sin(ang) * (r0 + sp * tau), y = y0 + vy * tau - 0.5 * G * tau * tau;
    // iniş: kaide üstü ya da zemin
    const rr = Math.hypot(x, z), ground = rr < PED_R ? PED_H : 0;
    const size = 0.07 + 0.06 * ((k * 13) % 10) / 10;
    let sy = 1, scale = size;
    if (y < ground + size * 0.5) {
      // iniş anını bul (zemin seviyesine göre)
      const g2 = ground;
      const disc = vy * vy + 2 * G * (y0 - g2 - size * 0.5);
      const tl = (vy + Math.sqrt(Math.max(disc, 0))) / G;
      const after = tau - tl;
      x = Math.cos(ang) * (r0 + sp * tl); z = Math.sin(ang) * (r0 + sp * tl); y = g2 + size * 0.3;
      sy = 0.45; scale = size * Math.max(0, 1 - after / 1.4);
    }
    m.visible = scale > 0.004;
    m.position.set(x, y, z); m.scale.set(scale, scale * sy, scale);
  }
}

// ------------------------------------------------------------------ DOM
const gauge = $('#gauge'); for (let k = 0; k < 10; k++) gauge.appendChild(document.createElement('i'));
const dots = $('#dots'); SHOTS.forEach(() => dots.appendChild(document.createElement('i')));
const chips = $('#chips'); SHOTS.forEach((s) => { const b = document.createElement('b'); b.textContent = s.s; b.style.background = s.jelly; chips.appendChild(b); });

function segment(t) {
  if (t < INTRO) return { kind: 'intro', i: -1, lt: t };
  const k = Math.floor((t - INTRO) / SHOT);
  if (k < SHOTS.length) return { kind: 'shot', i: k, lt: t - shotStart(k) };
  return { kind: 'outro', i: SHOTS.length, lt: t - shotStart(SHOTS.length) };
}

let lastT = -1;
function update(t) {
  const seg = segment(t);
  const target = seg.kind === 'shot' ? seg.i : seg.kind === 'outro' ? SHOTS.length : -1;
  // geçiş (0.30 sn, 0.27'de sahne değişir)
  let wipeS = 0;
  if (seg.kind === 'shot' && seg.lt < 0.3) {
    wipeS = ease(seg.lt / 0.3);
    if (!fired.has('w' + target)) { fired.add('w' + target); cue('whoosh', t); }
  }
  const sw = seg.kind === 'shot' && seg.lt < 0.27;            // geçiş henüz ekranı kaplamadı
  const visIdx = seg.kind === 'intro' ? -1 : sw ? target - 1 : target;   // ekranda görünen çekim
  const jellyIdx = Math.min(visIdx, SHOTS.length - 1);
  const wipe = $('#wipe');
  wipe.style.display = wipeS > 0 && wipeS < 1 ? 'block' : 'none';
  wipe.style.transform = `scale(${wipeS})`;
  wipe.style.background = SHOTS[Math.min(Math.max(target, 0), SHOTS.length - 1)].bg;

  // arka plan + hayalet rakam
  const bgColor = visIdx < 0 ? DARK : SHOTS[Math.min(visIdx, SHOTS.length - 1)].bg;
  let label = '', slide = 0, alpha = 0;
  if (visIdx >= 0 && visIdx < SHOTS.length) {
    const lt = t - shotStart(visIdx) - 0.27;
    label = String(SHOTS[visIdx].s); slide = (1 - easeOut(lt / 0.8)) * 260 - lt * 14; alpha = clamp(lt / 0.25);
  }
  drawBackdrop(bgColor, label, slide, alpha);
  pedMat.color.set(bgColor).lerp(new THREE.Color('#ffffff'), 0.45);

  // jöle
  if (jellyIdx >= 0) {
    advanceSim(jellyIdx, t);
    if (firstHit >= 0 && !fired.has('i' + jellyIdx)) { fired.add('i' + jellyIdx); cue('impact', firstHit, SHOTS[jellyIdx].s / 10); }
    jelly.visible = true;
    jellyGeo.attributes.position.array.set(P);
    jellyGeo.attributes.position.needsUpdate = true;
    jellyGeo.computeVertexNormals();
    N.set(jellyGeo.attributes.normal.array);
    dropState(jellyIdx, t);
  } else { jelly.visible = false; drops.forEach((d) => d.visible = false); }

  // yüz ifadeleri
  const showFace = jelly.visible;
  const local = jellyIdx >= 0 ? t - shotStart(jellyIdx) : 0;
  const tauHit = firstHit >= 0 ? t - firstHit : -1;
  const falling = jellyIdx >= 0 && firstHit < 0;
  const squint = tauHit >= 0 && tauHit < 0.18 + 0.05 * SHOTS[Math.max(jellyIdx, 0)].s;
  const blink = [2.45, 3.15].some((b) => Math.abs(local - b) < 0.05) || (seg.kind === 'outro' && Math.abs(seg.lt - 1.6) < 0.05);
  for (const e of eyes) {
    e.g.visible = showFace;
    if (showFace) placeOnSurface(e.g, e.a);
    e.ball.scale.y = squint ? 0.22 : blink ? 0.15 : falling ? 1.6 : 1.4;
  }
  for (const b of blushes) { b.g.visible = showFace; if (showFace) placeOnSurface(b.g, b.a, 0.006); }
  mouth.g.visible = showFace; if (showFace) placeOnSurface(mouth.g, mouth.a);
  smile.visible = !(falling || squint); ohMouth.visible = falling || squint;
  if (squint) ohMouth.scale.set(1.2, 0.5, 1); else ohMouth.scale.set(1, 1.15, 1);

  // kamera: hafif aşağıdan, yavaş yaklaşma, çarpmada sarsıntı (yay ζ=0.3)
  const shotT = seg.kind === 'shot' ? seg.lt : seg.kind === 'outro' ? SHOT + seg.lt : 0;
  const push = ease(shotT / (SHOT + 1));
  const dir = (Math.max(jellyIdx, 0) % 2 === 0) ? 1 : -1;
  const orbit = dir * (0.08 - 0.16 * push);
  const dist = 10.8 - 1.0 * push;
  let shake = 0;
  if (tauHit >= 0) { const s = SHOTS[jellyIdx].s; shake = (0.02 + 0.005 * (10 - s)) * Math.exp(-8 * tauHit) * Math.sin(55 * tauHit); }
  camera.position.set(Math.sin(orbit) * dist, 3.6 + shake, Math.cos(orbit) * dist);
  camera.lookAt(0, 1.05 + shake * 0.5, 0);

  // HUD: puan (yay ζ=0.5 ile pop), gösterge (çubuk başına 1 kare gecikme)
  const hud = $('#hud');
  if (visIdx >= 0 && visIdx < SHOTS.length) {
    const lt = t - shotStart(visIdx) - 0.27;
    hud.style.opacity = seg.kind === 'outro' ? clamp(1 - seg.lt / 0.25) : 1;
    const s = SHOTS[visIdx].s;
    $('#score').innerHTML = `${s}<small>/10</small>`;
    const pop = spring(lt, 0.5, 20);
    $('#score').style.transform = `scale(${0.6 + 0.4 * pop})`;
    [...gauge.children].forEach((g, k) => {
      const on = k < s;
      const f = spring(lt - 0.15 - k / FPS, 0.45, 26);
      g.style.background = on ? '#ffffff' : 'rgba(255,255,255,0.32)';
      g.style.transform = on ? `scaleY(${0.4 + 0.6 * f}) scaleX(${0.7 + 0.3 * f})` : 'none';
    });
  } else hud.style.opacity = 0;
  [...dots.children].forEach((d, k) => d.className = k === visIdx || (seg.kind === 'outro' && k === SHOTS.length - 1) ? 'on' : '');
  dots.style.opacity = seg.kind === 'intro' ? 0 : 1;

  const title = $('#title');
  if (seg.kind === 'intro') {
    title.querySelector('.big').innerHTML = 'SOFTNESS<br>1 → 10';
    title.querySelector('.small').textContent = 'JELLY TEST';
    title.style.opacity = clamp(seg.lt / 0.2) * clamp((INTRO - seg.lt) / 0.1);
    title.style.transform = `translateY(${(1 - easeOut(seg.lt / 0.5)) * 50}px)`;
  } else if (seg.kind === 'outro' && seg.lt > 0.3) {
    title.querySelector('.big').innerHTML = 'WHICH ONE<br>IS YOURS?';
    title.querySelector('.small').textContent = 'COMMENT 1 – 10';
    title.style.opacity = clamp((seg.lt - 0.3) / 0.2);
    title.style.transform = `translateY(${(1 - easeOut((seg.lt - 0.3) / 0.5)) * 50 - 110}px)`;
  } else title.style.opacity = 0;
  [...chips.children].forEach((c, k) => {
    const t0 = 0.5 + k * BEAT * 0.5;   // her çip bir sekizlikte
    const s = seg.kind === 'outro' ? spring(seg.lt - t0, 0.5, 22) : 0;
    c.style.transform = `scale(${Math.max(s, 0)})`;
    if (seg.kind === 'outro' && seg.lt >= t0 && !fired.has('c' + k)) { fired.add('c' + k); cue('pop', t, 0.6); }
  });
}

window.renderAt = (t, draw = true) => {
  if (t < lastT) { window.cues = []; fired.clear(); simShot = -1; }
  lastT = t;
  update(t);
  if (draw) renderer.render(scene, camera);
  return true;
};
// eski arayüzle uyum: kare numarası
window.renderFrame = (f, draw = true) => window.renderAt(f / FPS, draw);

document.fonts.load('900 100px Inter').then(() => document.fonts.load('800 40px Inter')).then(() => {
  window.renderAt(0);
  window.ready = true;
});
