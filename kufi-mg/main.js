// Kufi MG: "Face 1 → 10K" kumaş testi, motion graphics tarzında.
// Her kare zamanın deterministik bir fonksiyonu; kumaş fiziği kareler sırayla
// ilerledikçe adım adım hesaplanır (render.mjs kareleri sırayla ister).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 1080, H = 1920, FPS = 30;
const BEAT = 0.425;                 // 141 BPM: her çekim 8 vuruş
const INTRO = 2 * BEAT, SHOT = 8 * BEAT, OUTRO = 6 * BEAT;
const DROP_AT = 0.42;               // çekim içinde kumaşın bırakıldığı an (sn)
const DARK = '#1B1B1F';

const SHOTS = [
  { n: 1,   faces: 1,     label: '1',   bg: '#FFC93C', cloth: '#F0436A', line: '#B8204A', tilt: [0.06, 0.03], off: [0.22, 0.0] },
  { n: 2,   faces: 4,     label: '4',   bg: '#2EC4B6', cloth: '#FFE45E', line: '#D6A800', tilt: [0.05, -0.04], off: [0.1, 0.05] },
  { n: 8,   faces: 64,    label: '64',  bg: '#7B5CD6', cloth: '#5EF0C8', line: '#21A688', tilt: [0.04, 0.05], off: [0.0, 0.0] },
  { n: 32,  faces: 1024,  label: '1K',  bg: '#FF6B4A', cloth: '#FFF3E2', line: '#E7B89E', tilt: [-0.05, 0.04], off: [0.0, 0.0] },
  { n: 100, faces: 10000, label: '10K', bg: '#1E9BD7', cloth: '#FFD23F', line: '#E8A900', tilt: [0.04, 0.06], off: [0.0, 0.0] },
];
const TOTAL = INTRO + SHOTS.length * SHOT + OUTRO;
window.TOTAL_FRAMES = Math.round(TOTAL * FPS);
window.FPS = FPS;
window.cues = [];

// ------------------------------------------------------------------ yardımcılar
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const backOut = (t) => { t = clamp(t); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------------ sahne
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfe8, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(3.5, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
sun.shadow.bias = -0.0004;
sun.shadow.radius = 4;
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.2 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// yumuşak temas gölgesi (karakterin altı)
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.2),
  new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.position.y = 0.005;
scene.add(blob);

// çizgi film (toon) gölgelendirme: 3 ton
const grad = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: grad });
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x24192e, side: THREE.BackSide });

function rbox(w, h, d, r, color, outline = 0.035) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, r), toon(color));
  m.castShadow = true;
  g.add(m);
  if (outline) {
    const o = new THREE.Mesh(m.geometry, outlineMat);
    o.scale.set(1 + 2 * outline / w, 1 + 2 * outline / h, 1 + 2 * outline / d);
    g.add(o);
  }
  return g;
}

// ------------------------------------------------------------------ karakter: "Kufi"
const BODY_C = new THREE.Vector3(0, 1.12, 0), BODY_H = new THREE.Vector3(0.75, 0.75, 0.74), BODY_R = 0.28;
const ARM_C = new THREE.Vector3(0, 0.95, 0), ARM_H = new THREE.Vector3(1.0, 0.26, 0.16), ARM_R = 0.1;

const kufi = new THREE.Group();
scene.add(kufi);
const squashRoot = new THREE.Group();          // ezilme ayaklardan olsun
kufi.add(squashRoot);
const body = rbox(1.5, 1.5, 1.3, 0.28, '#FFF4E0');
body.position.copy(BODY_C);
squashRoot.add(body);
for (const s of [-1, 1]) {
  const arm = rbox(0.24, 0.52, 0.32, 0.1, '#FFF4E0', 0.03);
  arm.position.set(s * 0.86, 0.95, 0); arm.rotation.z = s * 0.28;
  squashRoot.add(arm);
  const foot = rbox(0.44, 0.3, 0.52, 0.12, '#2B2D42', 0.03);
  foot.position.set(s * 0.37, 0.15, 0.05);
  kufi.add(foot);
}
const face = new THREE.Group();
face.position.set(0, 1.12, 0.652);
squashRoot.add(face);
const eyeGeo = new THREE.SphereGeometry(0.11, 24, 16);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1b1b1f });
const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const eyes = [];
for (const s of [-1, 1]) {
  const e = new THREE.Group();
  const ball = new THREE.Mesh(eyeGeo, eyeMat); ball.scale.set(1, 1.45, 0.45);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), shineMat); shine.position.set(0.035, 0.07, 0.05);
  e.add(ball, shine);
  e.position.set(s * 0.29, 0.13, 0);
  face.add(e); eyes.push(e);
  const blush = new THREE.Mesh(new THREE.CircleGeometry(0.12, 32),
    new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.85 }));
  blush.position.set(s * 0.53, -0.1, 0.0); face.add(blush);
}
const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 24, Math.PI), eyeMat);
mouth.rotation.z = Math.PI; mouth.position.set(0, -0.08, 0.005); face.add(mouth);
const mouthO = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), eyeMat);  // şaşkın "o" ağız
mouthO.position.set(0, -0.1, 0.006); mouthO.visible = false; face.add(mouthO);

// ------------------------------------------------------------------ çarpışma (yuvarlatılmış kutu SDF)
function sdBox(px, py, pz, c, h, r, out) {
  const dx = px - c.x, dy = py - c.y, dz = pz - c.z;
  const qx = Math.abs(dx) - (h.x - r), qy = Math.abs(dy) - (h.y - r), qz = Math.abs(dz) - (h.z - r);
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  const lo = Math.hypot(mx, my, mz);
  const inside = Math.min(Math.max(qx, qy, qz), 0);
  const d = lo + inside - r;
  if (lo > 1e-6) { out[0] = Math.sign(dx) * mx / lo; out[1] = Math.sign(dy) * my / lo; out[2] = Math.sign(dz) * mz / lo; }
  else if (qx >= qy && qx >= qz) { out[0] = Math.sign(dx); out[1] = 0; out[2] = 0; }
  else if (qy >= qz) { out[0] = 0; out[1] = Math.sign(dy); out[2] = 0; }
  else { out[0] = 0; out[1] = 0; out[2] = Math.sign(dz); }
  return d;
}
const nA = [0, 0, 0], nB = [0, 0, 0];
function sdChar(x, y, z, n) {
  const a = sdBox(x, y, z, BODY_C, BODY_H, BODY_R, nA);
  const b = sdBox(x, y, z, ARM_C, ARM_H, ARM_R, nB);
  const src = a < b ? nA : nB;
  n[0] = src[0]; n[1] = src[1]; n[2] = src[2];
  return Math.min(a, b);
}

// ------------------------------------------------------------------ kumaş (PBD)
function gridTexture(N, color, line) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  const lines = N <= 32 ? N : 50;
  const lw = Math.max(3, (S / lines) * (N <= 2 ? 0.035 : 0.09));
  g.fillStyle = line;
  for (let i = 0; i <= lines; i++) {
    const p = Math.round(i * S / lines);
    g.fillRect(p - lw / 2, 0, lw, S); g.fillRect(0, p - lw / 2, S, lw);
  }
  g.lineWidth = Math.max(lw * 2, 10); g.strokeStyle = line; g.strokeRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

class Cloth {
  constructor(spec) {
    const N = spec.n, size = 3.0;
    this.N = N; this.P = (N + 1) * (N + 1);
    this.pos = new Float32Array(this.P * 3); this.prev = new Float32Array(this.P * 3);
    this.contact = new Uint8Array(this.P);
    const ct = Math.cos(spec.tilt[0]), st = Math.sin(spec.tilt[0]), cr = Math.cos(spec.tilt[1]), sr = Math.sin(spec.tilt[1]);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      let x = (i / N - 0.5) * size, z = (j / N - 0.5) * size, y = 0;
      // hafif eğim (x ve z eksenleri etrafında)
      let y1 = y * ct - z * st, z1 = y * st + z * ct;
      let x2 = x * cr - y1 * sr, y2 = x * sr + y1 * cr;
      this.pos[k * 3] = x2 + spec.off[0]; this.pos[k * 3 + 1] = y2 + 6.6; this.pos[k * 3 + 2] = z1 + spec.off[1];
    }
    this.prev.set(this.pos);
    // kısıtlar: yapısal, kayma, bükülme
    const cons = [];
    const id = (i, j) => j * (N + 1) + i;
    const add = (a, b, s) => {
      const dx = this.pos[a * 3] - this.pos[b * 3], dy = this.pos[a * 3 + 1] - this.pos[b * 3 + 1], dz = this.pos[a * 3 + 2] - this.pos[b * 3 + 2];
      cons.push(a, b, Math.hypot(dx, dy, dz), s);
    };
    const bend = N <= 1 ? 1 : N <= 2 ? 0.05 : N <= 8 ? 0.06 : N <= 32 ? 0.05 : 0.03;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      if (i < N) add(id(i, j), id(i + 1, j), 1);
      if (j < N) add(id(i, j), id(i, j + 1), 1);
      if (i < N && j < N) { add(id(i, j), id(i + 1, j + 1), 0.9); add(id(i + 1, j), id(i, j + 1), 0.9); }
      if (i < N - 1) add(id(i, j), id(i + 2, j), bend);
      if (j < N - 1) add(id(i, j), id(i, j + 2), bend);
    }
    this.cons = new Float32Array(cons);
    // seyrek ızgaralarda çarpışmayı yüzey üzerindeki örnek noktalarla yap (levha kafadan geçmesin)
    this.samples = null;
    if (N < 32) {
      const S = 26, sm = [];
      for (let b = 0; b <= S; b++) for (let a = 0; a <= S; a++) {
        const u = a / S * N, v = b / S * N;
        const ci = Math.min(N - 1, Math.floor(u)), cj = Math.min(N - 1, Math.floor(v));
        const fu = u - ci, fv = v - cj;
        sm.push(id(ci, cj), id(ci + 1, cj), id(ci, cj + 1), id(ci + 1, cj + 1),
          (1 - fu) * (1 - fv), fu * (1 - fv), (1 - fu) * fv, fu * fv);
      }
      this.samples = new Float32Array(sm);
    }
    this.iters = N >= 100 ? 7 : N >= 32 ? 10 : 14;
    this.sub = N >= 100 ? 4 : 5;
    this.active = false; this.hitChar = false; this.firstHit = -1;
    // görüntü
    const geo = new THREE.PlaneGeometry(1, 1, N, N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(), 3));
    this.geo = geo;
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, map: gridTexture(N, spec.cloth, spec.line), side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.sync();
  }
  sync() {
    this.geo.attributes.position.array.set(this.pos);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
  step(dt, tGlobal) {
    if (!this.active) return;
    const h = dt / this.sub, g = -13.5 * h * h, P = this.P, pos = this.pos, prev = this.prev, cons = this.cons;
    const n = [0, 0, 0], TH = 0.035;
    for (let s = 0; s < this.sub; s++) {
      for (let k = 0; k < P; k++) {
        const i = k * 3;
        for (let a = 0; a < 3; a++) {
          const v = (pos[i + a] - prev[i + a]) * 0.993;
          prev[i + a] = pos[i + a];
          pos[i + a] += v + (a === 1 ? g : 0);
        }
      }
      for (let it = 0; it < this.iters; it++) {
        for (let c = 0; c < cons.length; c += 4) {
          const a = cons[c] * 3, b = cons[c + 1] * 3, rest = cons[c + 2], st = cons[c + 3];
          const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          const f = 0.5 * st * (d - rest) / d;
          pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f;
          pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
        }
        this.collide(n, TH, tGlobal);
      }
      // sürtünme: temas eden noktaların kayması yavaşlar
      for (let k = 0; k < P; k++) if (this.contact[k]) {
        const i = k * 3;
        for (let a = 0; a < 3; a++) pos[i + a] = prev[i + a] + (pos[i + a] - prev[i + a]) * 0.55;
      }
    }
    this.sync();
  }
  collide(n, TH, tGlobal) {
    const pos = this.pos;
    this.contact.fill(0);
    if (this.samples) {
      const sm = this.samples;
      for (let q = 0; q < sm.length; q += 8) {
        const ia = sm[q] * 3, ib = sm[q + 1] * 3, ic = sm[q + 2] * 3, id = sm[q + 3] * 3;
        const wa = sm[q + 4], wb = sm[q + 5], wc = sm[q + 6], wd = sm[q + 7];
        const x = wa * pos[ia] + wb * pos[ib] + wc * pos[ic] + wd * pos[id];
        const y = wa * pos[ia + 1] + wb * pos[ib + 1] + wc * pos[ic + 1] + wd * pos[id + 1];
        const z = wa * pos[ia + 2] + wb * pos[ib + 2] + wc * pos[ic + 2] + wd * pos[id + 2];
        let d = sdChar(x, y, z, n), nx = n[0], ny = n[1], nz = n[2], pen = TH - d, hit = 1;
        const gpen = TH - y;
        if (gpen > pen) { pen = gpen; nx = 0; ny = 1; nz = 0; hit = 0; }
        if (pen <= 0) continue;
        if (hit) this.markHit(tGlobal);
        const w2 = wa * wa + wb * wb + wc * wc + wd * wd;
        for (const [ii, w] of [[ia, wa], [ib, wb], [ic, wc], [id, wd]]) {
          const s = pen * w / w2;
          pos[ii] += nx * s; pos[ii + 1] += ny * s; pos[ii + 2] += nz * s;
          if (w > 0.25) this.contact[ii / 3] = 1;
        }
      }
    } else {
      for (let k = 0; k < this.P; k++) {
        const i = k * 3;
        const d = sdChar(pos[i], pos[i + 1], pos[i + 2], n);
        if (d < TH) {
          const p = TH - d;
          pos[i] += n[0] * p; pos[i + 1] += n[1] * p; pos[i + 2] += n[2] * p;
          this.contact[k] = 1; this.markHit(tGlobal);
        }
        if (pos[i + 1] < TH) { pos[i + 1] = TH; this.contact[k] = 1; }
      }
    }
  }
  markHit(t) {
    if (this.firstHit < 0) { this.firstHit = t; }
  }
}

// ------------------------------------------------------------------ DOM
const dots = $('#dots');
SHOTS.forEach(() => dots.appendChild(document.createElement('i')));
const chips = $('#chips');
SHOTS.forEach((s) => { const b = document.createElement('b'); b.textContent = s.label; chips.appendChild(b); });

// ------------------------------------------------------------------ zaman çizelgesi
function segment(t) {
  if (t < INTRO) return { kind: 'intro', i: -1, lt: t };
  const k = Math.floor((t - INTRO) / SHOT);
  if (k < SHOTS.length) return { kind: 'shot', i: k, lt: t - INTRO - k * SHOT };
  return { kind: 'outro', i: SHOTS.length, lt: t - INTRO - SHOTS.length * SHOT };
}

let cloth = null, curShot = -2, lastFrame = -1, impactCue = -1;
const fired = new Set();   // tek seferlik ses tetikleyicileri
function setShot(i) {
  if (cloth) { scene.remove(cloth.mesh); cloth.geo.dispose(); cloth = null; }
  curShot = i;
  impactCue = -1;
  if (i >= 0 && i < SHOTS.length) { cloth = new Cloth(SHOTS[i]); scene.add(cloth.mesh); }
}
function cue(type, t, strength = 1) { window.cues.push({ type, t: +t.toFixed(3), strength }); }

const STRENGTH = [1.0, 0.85, 0.6, 0.45, 0.4];

function update(frame) {
  const t = frame / FPS;
  const seg = segment(t);
  const dt = 1 / FPS;

  // --- çekim değişimi + dairesel geçiş
  const wipe = $('#wipe');
  let wipeScale = 0, wipeColor = DARK;
  const targetIdx = seg.kind === 'shot' ? seg.i : seg.kind === 'outro' ? SHOTS.length : -1;
  if (seg.kind !== 'intro' && seg.lt < 0.3) {
    wipeScale = ease(seg.lt / 0.3);
    wipeColor = targetIdx < SHOTS.length ? SHOTS[targetIdx].bg : DARK;
    if (!fired.has('w' + targetIdx)) { fired.add('w' + targetIdx); cue('whoosh', t); }
  }
  // çekim sahnesi, geçiş ekranı kapladığında değişir
  const sceneIdx = seg.kind === 'intro' ? -1 : (seg.lt >= 0.27 ? targetIdx : targetIdx - 1);
  const shotForScene = sceneIdx >= SHOTS.length ? SHOTS.length - 1 : sceneIdx;
  if (seg.kind === 'outro') { if (curShot !== SHOTS.length - 1 && !cloth) setShot(SHOTS.length - 1); }
  else if (shotForScene !== curShot) setShot(shotForScene);
  wipe.style.transform = `scale(${wipeScale})`;
  wipe.style.background = wipeColor;
  wipe.style.display = wipeScale > 0 && wipeScale < 1 ? 'block' : 'none';
  const bgIdx = seg.kind === 'intro' ? -1 : (seg.lt >= 0.3 ? targetIdx : targetIdx - 1);
  document.body.style.background = bgIdx < 0 || bgIdx >= SHOTS.length ? DARK : SHOTS[bgIdx].bg;

  // --- kumaş
  const shotStart = INTRO + Math.max(curShot, 0) * SHOT;
  if (cloth && curShot >= 0) {
    const local = t - shotStart;
    if (!cloth.active && local >= DROP_AT && seg.kind === 'shot') cloth.active = true;
    if (seg.kind === 'outro' || local >= DROP_AT) cloth.step(dt, t);
    if (cloth.firstHit >= 0 && impactCue < 0) { impactCue = cloth.firstHit; cue('impact', cloth.firstHit, STRENGTH[curShot]); }
  }

  // --- karakter
  const pop = seg.kind === 'intro' ? backOut((seg.lt - 0.05) / 0.45) : 1;
  kufi.scale.setScalar(Math.max(pop, 0.0001));
  if (seg.kind === 'intro' && seg.lt >= 0.05 && !fired.has('intro')) { fired.add('intro'); cue('pop', t, 0.8); }
  let sq = 0, squint = 0, lookUp = 0, surprised = false;
  if (cloth && cloth.firstHit >= 0) {
    const tau = t - cloth.firstHit, A = 0.18 * STRENGTH[curShot];
    sq = A * Math.exp(-5.5 * tau) * Math.cos(17 * tau);
    squint = tau < 0.45 ? 1 : 0;
  } else if (seg.kind === 'shot' && seg.lt > 0.3) {
    lookUp = easeOut((seg.lt - 0.3) / 0.35); surprised = seg.lt > 0.55;
  }
  const breathe = 0.008 * Math.sin(t * 2 * Math.PI / (BEAT * 4));
  squashRoot.scale.set(1 + sq * 0.6 + breathe, 1 - sq - breathe, 1 + sq * 0.6 + breathe);
  const blink = [1.6, 2.9].some((b) => seg.kind !== 'intro' && Math.abs(seg.lt - b) < 0.06) || (seg.kind === 'intro' && Math.abs(seg.lt - 0.62) < 0.06);
  for (const e of eyes) {
    e.scale.y = squint ? 0.18 : blink ? 0.12 : 1;
    e.position.y = 0.13 + lookUp * 0.05;
  }
  mouth.visible = !surprised && !squint; mouthO.visible = surprised || !!squint;

  // --- kamera: çekim boyunca yavaş yaklaşma + hafif dönüş + darbe sarsıntısı
  let lt = seg.kind === 'shot' ? seg.lt : seg.kind === 'outro' ? SHOT + seg.lt : 0;
  const push = ease(lt / (SHOT + 0.6));
  const dir = (curShot % 2 === 0 ? 1 : -1);
  const orbit = dir * (0.07 - 0.14 * push);
  const dist = 10.6 - 1.2 * push - (seg.kind === 'outro' ? 0.0 : 0);
  let shake = 0;
  if (cloth && cloth.firstHit >= 0) { const tau = t - cloth.firstHit; shake = 0.07 * STRENGTH[curShot] * Math.exp(-7 * tau) * Math.sin(48 * tau); }
  camera.position.set(Math.sin(orbit) * dist, 3.0 - 0.25 * push + shake, Math.cos(orbit) * dist);
  camera.lookAt(0, 1.55 + shake * 0.5, 0);

  // --- HUD
  const hud = $('#hud'), count = $('#count'), ghost = $('#ghost'), title = $('#title');
  if (seg.kind === 'shot') {
    hud.style.opacity = 1;
    const prevF = seg.i > 0 ? SHOTS[seg.i - 1].faces : 0, f = SHOTS[seg.i].faces;
    const roll = ease((seg.lt - 0.15) / 0.65);
    count.textContent = Math.round(prevF + (f - prevF) * roll).toLocaleString('en-US');
    const showIdx = seg.lt >= 0.27 ? seg.i : seg.i - 1;
    if (showIdx >= 0) {
      const gl = seg.lt >= 0.27 ? seg.lt - 0.27 : seg.lt + SHOT - 0.27;
      ghost.textContent = SHOTS[showIdx].label;
      ghost.style.opacity = 1;
      ghost.style.transform = `translateX(${(1 - easeOut(gl / 0.7)) * 260 - gl * 18}px) scale(${1 + gl * 0.012}) rotate(-4deg)`;
    } else ghost.style.opacity = 0;
  } else if (seg.kind === 'outro') {
    const fade = clamp(1 - seg.lt / 0.3);
    hud.style.opacity = fade; ghost.style.opacity = fade;
  } else { hud.style.opacity = 0; ghost.style.opacity = 0; }
  [...dots.children].forEach((d, k) => d.className = (seg.kind === 'shot' && k === seg.i) || (seg.kind === 'outro' && k === SHOTS.length - 1) ? 'on' : '');
  dots.style.opacity = seg.kind === 'intro' ? 0 : 1;

  // giriş başlığı / kapanış
  if (seg.kind === 'intro') {
    title.style.opacity = 1;
    title.querySelector('.big').innerHTML = '1 → 10,000';
    title.querySelector('.small').textContent = 'CLOTH FACES';
    title.style.transform = `translateY(${(1 - easeOut(seg.lt / 0.4)) * 60}px)`;
    title.style.opacity = clamp(seg.lt / 0.25) * clamp((INTRO - seg.lt) / 0.12);
  } else if (seg.kind === 'outro' && seg.lt > 0.3) {
    title.style.opacity = clamp((seg.lt - 0.3) / 0.25);
    title.querySelector('.big').innerHTML = 'WHICH<br>ONE WINS?';
    title.querySelector('.small').textContent = 'COMMENT YOUR PICK';
    title.style.transform = `translateY(${(1 - easeOut((seg.lt - 0.3) / 0.4)) * 60 - 150}px)`;
  } else title.style.opacity = 0;
  [...chips.children].forEach((c, k) => {
    const t0 = 0.75 + k * BEAT * 0.5;
    const s = seg.kind === 'outro' ? backOut((seg.lt - t0) / 0.3) : 0;
    c.style.transform = `scale(${Math.max(s, 0)})`;
    c.style.background = SHOTS[k].bg; c.style.color = '#fff';
    if (seg.kind === 'outro' && seg.lt >= t0 && !fired.has('c' + k)) { fired.add('c' + k); cue('pop', t, 0.6); }
  });
  chips.style.top = '640px';
}

window.renderFrame = (frame, draw = true) => {
  if (frame <= lastFrame) { // baştan başla
    window.cues = []; fired.clear(); setShot(-2); curShot = -2; lastFrame = -1;
  }
  for (let f = lastFrame + 1; f <= frame; f++) update(f);
  lastFrame = frame;
  if (draw) renderer.render(scene, camera);
  return true;
};

document.fonts.load('900 100px Inter').then(() => document.fonts.load('800 40px Inter')).then(() => {
  window.renderFrame(0);
  window.ready = true;
});
