// Moodboard ana kareleri: dört konsept, her biri ?s=A|B|C|D ile.
// Ortak dil: kil/oyuncak görünümlü Kufi, yumuşak stüdyo ışığı, alan derinliği.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1080, H = 1920;
const S = new URLSearchParams(location.search).get('s') || 'A';
const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
document.getElementById('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 200);

// ------------------------------------------------------------------ malzeme yardımcıları
const clay = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.5, sheenColor: 0xffffff, ...o });
const gloss = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, ...o });
const glass = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.08, transmission: 1, thickness: 0.9, ior: 1.4,
  clearcoat: 1, clearcoatRoughness: 0.05, attenuationColor: new THREE.Color(c), attenuationDistance: 1.2, ...o });
const add = (m, x = 0, y = 0, z = 0, parent = scene) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
const rbox = (w, h, d, r, mat) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, r), mat);
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function backdrop(draw, z = -14, w = 40, h = 60, y = 8) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(512, 768, draw), toneMapped: false }));
  m.position.set(0, y, z); scene.add(m); return m;
}
function lights({ key = [4, 9, 6], keyI = 2.4, keyC = 0xffffff, rimI = 1.6, rimC = 0xffffff, hemi = 0.4 } = {}) {
  const k = new THREE.DirectionalLight(keyC, keyI); k.position.set(...key); k.castShadow = true;
  k.shadow.mapSize.set(2048, 2048); Object.assign(k.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 });
  k.shadow.bias = -0.0005; k.shadow.radius = 5; scene.add(k);
  const r = new THREE.DirectionalLight(rimC, rimI); r.position.set(-4, 5, -6); scene.add(r);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, hemi));
  return k;
}

// ------------------------------------------------------------------ Kufi (kil karakter)
function kufi({ color = '#FFF1DE', mood = 'happy', scale = 1, look = 0 } = {}) {
  const g = new THREE.Group();
  const bodyMat = clay(color), dark = gloss('#17141f'), footMat = clay('#2B2D42');
  add(rbox(1.5, 1.5, 1.3, 0.3, bodyMat), 0, 1.12, 0, g);
  for (const s of [-1, 1]) {
    const arm = add(rbox(0.24, 0.55, 0.32, 0.11, bodyMat), s * 0.86, 0.95, 0, g); arm.rotation.z = s * (mood === 'scared' ? -0.9 : 0.28);
    if (mood === 'scared') arm.position.y = 1.35;
    add(rbox(0.44, 0.3, 0.52, 0.13, footMat), s * 0.37, 0.15, 0.05, g);
    // gözler
    const eye = new THREE.Group(); eye.position.set(s * 0.29, 1.27 + look * 0.05, 0.66); g.add(eye);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), dark);
    const sy = mood === 'deadpan' ? 0.55 : mood === 'scared' ? 1.75 : 1.45;
    ball.scale.set(mood === 'scared' ? 1.15 : 1, sy, 0.45); eye.add(ball);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    sh.position.set(0.035, 0.06 + look * 0.02, 0.05); eye.add(sh);
    if (mood === 'deadpan') { // yarı kapalı göz kapağı
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.06), bodyMat); lid.position.set(0, 0.03, 0.03); eye.add(lid);
    }
    // kaşlar
    const brow = add(rbox(0.24, 0.05, 0.05, 0.02, dark), s * 0.29, 1.5 + look * 0.04, 0.66, g);
    brow.rotation.z = mood === 'scared' || mood === 'worried' ? s * -0.38 : mood === 'deadpan' ? s * 0.12 : s * 0.12;
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.12, 32), new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.8 }));
    blush.position.set(s * 0.53, 1.02, 0.653); g.add(blush);
  }
  if (mood === 'happy') {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.024, 8, 24, Math.PI), dark); m.rotation.z = Math.PI; m.position.set(0, 1.04, 0.66); g.add(m);
  } else if (mood === 'deadpan') {
    add(rbox(0.2, 0.04, 0.04, 0.015, dark), 0, 0.98, 0.66, g);
  } else {
    const m = new THREE.Mesh(new THREE.CircleGeometry(mood === 'scared' ? 0.1 : 0.07, 24), dark); m.scale.y = 1.25; m.position.set(0, 0.98, 0.656); g.add(m);
  }
  g.scale.setScalar(scale); scene.add(g); return g;
}

// ------------------------------------------------------------------ ortak son işleme (alan derinliği)
let focusDist = 10, aperture = 0.0012;
function finish() {
  const comp = new EffectComposer(renderer);
  comp.setSize(W, H);
  comp.addPass(new RenderPass(scene, camera));
  comp.addPass(new BokehPass(scene, camera, { focus: focusDist, aperture, maxblur: 0.006 }));
  comp.addPass(new OutputPass());
  comp.render();
  window.ready = true;
}
const ov = document.getElementById('overlay');

// ================================================================== A: SADECE BİRİ KALIR
function sceneA() {
  scene.background = new THREE.Color('#120F24');
  scene.fog = new THREE.Fog('#120F24', 14, 34);
  backdrop((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0B0A1A'); gr.addColorStop(0.6, '#241B4D'); gr.addColorStop(1, '#3B2370');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,220,255,${0.15 + rnd() * 0.5})`; g.beginPath(); g.arc(rnd() * w, rnd() * h * 0.7, rnd() * 1.6 + 0.3, 0, 7); g.fill(); }
  });
  lights({ keyI: 1.2, keyC: 0xffe9ff, rimI: 2.4, rimC: 0x9a7bff, hemi: 0.25 });
  const floor = add(new THREE.Mesh(new THREE.CircleGeometry(30, 64), gloss('#1C1838', { roughness: 0.22 })), 0, 0, 0); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  // sahne platformu (basamaklı)
  const stage = add(new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.4, 0.5, 96), clay('#E9E2FF')), 0, 0.25, -0.5);
  add(new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.05, 12, 128), gloss('#FF3D7F', { emissive: '#FF3D7F', emissiveIntensity: 1.2 })), 0, 0.04, -0.5).rotation.x = Math.PI / 2;
  const xs = [-2.1, -1.05, 0, 1.05, 2.1], zs = [-1.1, -0.35, 0.1, -0.35, -1.1];
  const colors = ['#FFF1DE', '#FFE0E8', '#E2F4FF', '#E9FFE6', '#FFF6CC'];
  const plates = ['#FF3D7F', '#FFB020', '#2EC4B6', '#7B5CFF', '#4CC9F0'];
  xs.forEach((x, i) => {
    const z = zs[i];
    const k = kufi({ color: colors[i], mood: i === 2 ? 'scared' : 'worried', scale: 0.56, look: 1 });
    k.position.set(x, 0.5, z);
    const plate = add(rbox(0.62, 0.36, 0.1, 0.06, gloss(plates[i], { emissive: plates[i], emissiveIntensity: 0.5 })), x, 0.25, z + 0.95);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false,
      map: canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#fff'; g.font = '900 130px Inter'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), w / 2, h / 2 + 8); }) }));
    num.position.set(x, 0.25, z + 1.01); scene.add(num);
    const sp = new THREE.SpotLight(0xfff2dd, 70, 14, 0.22, 0.45, 1.6); sp.position.set(x, 8.5, z + 0.4); sp.target.position.set(x, 0.5, z);
    sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); scene.add(sp, sp.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.75, 7.6, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe8ff, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.set(x, 4.6, z); scene.add(cone);
    const objY = 3.35 + (i % 2) * 0.25;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 9 - objY, 6), gloss('#D8D2F0', { metalness: 1 })), x, objY + (9 - objY) / 2, z);
    if (i === 0) {
      const geo = new THREE.PlaneGeometry(0.95, 0.95, 30, 30); const p = geo.attributes.position;
      for (let v = 0; v < p.count; v++) { const px = p.getX(v), py = p.getY(v); p.setZ(v, Math.sin(px * 6) * 0.05 + Math.cos(py * 5) * 0.04 - (px * px + py * py) * 0.6); }
      geo.computeVertexNormals();
      const tex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#FF3D7F'; g.fillRect(0, 0, w, h); g.fillStyle = '#C21E5A'; for (let k = 0; k <= 8; k++) { g.fillRect(k * 32 - 2, 0, 4, h); g.fillRect(0, k * 32 - 2, w, 4); } });
      const c = add(new THREE.Mesh(geo, clay('#ffffff', { map: tex, side: THREE.DoubleSide })), x, objY, z); c.rotation.x = Math.PI / 2 - 0.15;
    } else if (i === 1) {
      const j = add(rbox(0.7, 0.7, 0.7, 0.18, glass('#FF9F1C')), x, objY, z); j.rotation.set(0.3, 0.6, 0.1);
    } else if (i === 2) {
      const geo = new THREE.DodecahedronGeometry(0.46, 1); const p = geo.attributes.position;
      for (let v = 0; v < p.count; v++) { const q = 1 + (Math.sin(p.getX(v) * 9) + Math.cos(p.getY(v) * 8) + Math.sin(p.getZ(v) * 7)) * 0.05; p.setXYZ(v, p.getX(v) * q, p.getY(v) * q * 0.9, p.getZ(v) * q); }
      geo.computeVertexNormals(); add(new THREE.Mesh(geo, clay('#8E8AA0', { roughness: 0.85, flatShading: true })), x, objY, z);
    } else if (i === 3) {
      const honey = gloss('#FFB000', { transmission: 0.6, thickness: 0.7, attenuationColor: new THREE.Color('#D27000'), attenuationDistance: 0.5, roughness: 0.03 });
      const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.38, 48, 32), honey), x, objY, z); b.scale.set(1, 1.15, 1);
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 8, 16), honey), x + 0.08, objY - 0.5, z + 0.05);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), honey), x + 0.08, objY - 0.76, z + 0.05);
    } else {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.43, 48, 32), gloss('#3A1F8A', { roughness: 0.1 })), x, objY, z);
      for (const [dx, dy] of [[-0.11, 0.18], [0.09, 0.2], [0, 0.05]]) add(new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ color: 0x07040f })), x + dx, objY + dy, z + 0.428);
    }
  });
  camera.position.set(0, 3.4, 14.5); camera.lookAt(0, 2.9, 0); camera.fov = 32; camera.updateProjectionMatrix();
  focusDist = 14.4; aperture = 0.0005;
  ov.innerHTML = `
    <div class="ov" style="top:120px"><div class="tag" style="background:#FF3D7F">ROUND 1</div>
      <div class="big shadow" style="font-size:150px;margin-top:22px">ONLY <span style="color:#FFD23F">1</span><br>SURVIVES</div></div>
    <div class="ov" style="bottom:250px"><div class="tag" style="background:#FFD23F;color:#120F24;font-size:44px">GUESS NOW · 1 – 5</div></div>
    <div class="vign"></div><div class="wm">Kufi Animation</div>`;
}

// ================================================================== B: YA BULUTLAR JÖLE OLSAYDI?
function sceneB() {
  backdrop((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#7FC8F8'); gr.addColorStop(0.45, '#C9B6F2'); gr.addColorStop(0.75, '#FFC8DD'); gr.addColorStop(1, '#FFE5C2');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sun = g.createRadialGradient(w * 0.72, h * 0.62, 0, w * 0.72, h * 0.62, w * 0.35);
    sun.addColorStop(0, 'rgba(255,250,235,0.9)'); sun.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = sun; g.fillRect(0, 0, w, h);
  }, -18, 60, 70, 10);
  scene.fog = new THREE.Fog('#FFD6E2', 22, 50);
  lights({ key: [5, 10, 7], keyI: 2.6, keyC: 0xfff3e6, rimI: 2, rimC: 0xffd0f0, hemi: 0.55 });
  // tepeler
  const hill = (r, x, z, c) => { const m = add(new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), clay(c)), x, -r * 0.82, z); m.scale.y = 0.45; return m; };
  hill(9, 0, -1, '#9EE6B8'); hill(7, -9, -9, '#B7F0C8'); hill(8, 9, -11, '#8FDDB0'); hill(10, 2, -18, '#C3F5D3');
  // ağaçlar
  for (const [x, z, s] of [[-3.2, -2.2, 1], [3.4, -3, 1.2], [-5.5, -7, 1.4], [6, -8, 1.3], [-1.2, -9, 1.1]]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.1 * s, 0.9 * s, 12), clay('#B07D5B')), x, 0.85 * s, z);
    const crown = add(new THREE.Mesh(new THREE.SphereGeometry(0.6 * s, 32, 24), clay('#6FD3A0')), x, 1.55 * s, z); crown.scale.y = 1.15;
  }
  // ev
  const house = new THREE.Group(); scene.add(house); house.position.set(1.9, 0.62, -1.4); house.rotation.y = -0.45;
  add(rbox(2.2, 1.8, 1.9, 0.12, clay('#FFF4E4')), 0, 0.9, 0, house);
  const roof = add(new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.3, 4, 1), clay('#FF7A9A')), 0, 2.45, 0, house); roof.rotation.y = Math.PI / 4;
  add(rbox(0.55, 0.95, 0.1, 0.06, clay('#7B5CFF')), -0.45, 0.48, 0.96, house);
  add(rbox(0.55, 0.5, 0.1, 0.06, gloss('#BDE8FF', { emissive: '#FFF2B3', emissiveIntensity: 0.5 })), 0.5, 1.05, 0.96, house);
  add(rbox(0.3, 0.7, 0.3, 0.05, clay('#FF7A9A')), 0.55, 2.6, -0.3, house);
  // jöle bulutları
  const jellyCols = ['#FF5DA2', '#4CC9F0', '#B388FF', '#FFB020'];
  const cloud = (x, y, z, s, c) => {
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.scale.setScalar(s); scene.add(grp);
    const mat = glass(c, { attenuationDistance: 1.6, thickness: 1.5 });
    for (const [dx, dy, r] of [[0, 0, 1], [-1.1, -0.25, 0.75], [1.15, -0.2, 0.8], [0.5, 0.45, 0.7], [-0.5, 0.4, 0.65], [1.9, -0.45, 0.5], [-1.85, -0.5, 0.5]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat); b.position.set(dx, dy, 0); b.castShadow = true; grp.add(b);
    }
    return mat;
  };
  cloud(-1.4, 7.6, -2, 1.05, jellyCols[0]); cloud(2.8, 9.3, -5, 0.9, jellyCols[1]); cloud(-4.5, 10.2, -8, 1.1, jellyCols[2]); cloud(4.8, 6.4, -9, 0.8, jellyCols[3]);
  // jöle yağmuru: damlalar + yere düşmüş birikintiler
  for (let i = 0; i < 26; i++) {
    const c = jellyCols[i % 4], x = -3.5 + rnd() * 7, y = 1.6 + rnd() * 5.4, z = -3.5 + rnd() * 5;
    const d = add(new THREE.Mesh(new THREE.SphereGeometry(0.13 + rnd() * 0.1, 24, 16), glass(c)), x, y, z); d.scale.set(0.8, 1.35, 0.8);
  }
  for (let i = 0; i < 9; i++) {
    const c = jellyCols[i % 4], x = -3 + rnd() * 6, z = -2.5 + rnd() * 4.5;
    const p = add(new THREE.Mesh(new THREE.SphereGeometry(0.3 + rnd() * 0.25, 32, 16), glass(c)), x, 0.62, z); p.scale.y = 0.28;
  }
  // Kufi + şemsiye
  const k = kufi({ mood: 'happy', look: 1 }); k.position.set(-0.6, 0.6, 0.9); k.rotation.y = 0.2;
  const um = new THREE.Group(); um.position.set(-0.05, 0.6, 1.0); um.rotation.z = -0.22; scene.add(um);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.7, 12), gloss('#2B2D42')), 0, 1.6, 0, um);
  const canopy = add(new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), clay('#FFD23F', { side: THREE.DoubleSide })), 0, 2.55, 0, um);
  canopy.scale.y = 0.55;
  const splat = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), glass('#FF5DA2')), 0.25, 3.1, 0.1, um); splat.scale.y = 0.4;
  camera.position.set(0.4, 3.3, 14.5); camera.lookAt(0.2, 3.7, 0); focusDist = 13.6; aperture = 0.0007;
  ov.innerHTML = `
    <div class="ov" style="top:120px"><div class="tag" style="background:#ffffff;color:#7B5CFF">WHAT IF…</div>
      <div class="big shadow" style="font-size:132px;margin-top:22px">CLOUDS<br>WERE <span style="color:#FF5DA2">JELLY?</span></div></div>
    <div class="wm">Kufi Animation</div>`;
}

// ================================================================== C: 1'DEN 1 MİLYONA
function sceneC() {
  scene.background = new THREE.Color('#FFE9D6');
  lights({ key: [3, 12, 8], keyI: 2.4, rimI: 1.2, hemi: 0.5 });
  // oda köşesi
  const wallMat = clay('#FFD9C0'), floorMat = clay('#F7C6A8');
  add(new THREE.Mesh(new THREE.PlaneGeometry(14, 20), wallMat), 0, 9, -2.6);
  const fl = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat), 0, 0, 2); fl.rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) { const w = add(new THREE.Mesh(new THREE.PlaneGeometry(10, 20), clay('#FFCFB0')), s * 3.2, 9, 1.8); w.rotation.y = -s * Math.PI / 2; }
  // tavandaki kapak + borudan akan toplar
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.4, 48, 1, true), gloss('#7B5CFF', { side: THREE.DoubleSide })), 0.3, 10.4, 0.2);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.09, 16, 48), gloss('#5E3FE0')), 0.3, 9.7, 0.2).rotation.x = Math.PI / 2;
  const cols = ['#FF3D7F', '#FFB020', '#2EC4B6', '#7B5CFF', '#4CC9F0', '#FFD23F', '#FF7A59'].map((c) => new THREE.Color(c));
  const R = 0.135;
  const ballMat = gloss('#ffffff', { roughness: 0.2, clearcoat: 1 });
  const geo = new THREE.SphereGeometry(R, 16, 12);
  const N = 9000, inst = new THREE.InstancedMesh(geo, ballMat, N); inst.castShadow = true; inst.receiveShadow = true;
  const m4 = new THREE.Matrix4(); let n = 0;
  const heap = (x, z) => 1.5 + 1.1 * Math.exp(-((x - 0.3) ** 2 + (z - 0.2) ** 2) / 1.6) + 0.12 * Math.sin(x * 3.1) * Math.cos(z * 2.7);
  for (let i = 0; i < 26000 && n < N - 260; i++) {
    const x = -3.1 + rnd() * 6.2, z = -2.5 + rnd() * 6.0, h = heap(x, z) - 0.05 * Math.max(0, z - 1.5) * 4;
    const y = h - rnd() * 0.75;
    if (y < R) continue;
    m4.makeTranslation(x, y, z); inst.setMatrixAt(n, m4); inst.setColorAt(n, cols[Math.floor(rnd() * cols.length)]); n++;
  }
  for (let i = 0; i < 260; i++) { // düşen sütun
    const y = 3.0 + rnd() * 6.6, a = rnd() * 6.28, r = rnd() * 0.55 * (1 - (y - 3) / 9);
    m4.makeTranslation(0.3 + Math.cos(a) * r, y, 0.2 + Math.sin(a) * r); inst.setMatrixAt(n, m4); inst.setColorAt(n, cols[Math.floor(rnd() * cols.length)]); n++;
  }
  inst.count = n; scene.add(inst);
  // Kufi: toplara gömülmüş, sadece başı ve bir kolu dışarıda
  const k = kufi({ mood: 'scared', look: 1 }); k.position.set(-0.7, 1.15, 1.5); k.rotation.y = 0.15; k.rotation.z = 0.06;
  camera.position.set(0, 3.6, 12.2); camera.lookAt(0, 3.3, 0); focusDist = 10.7; aperture = 0.0009;
  ov.innerHTML = `
    <div class="ov" style="top:110px"><div class="tag" style="background:#1B1B1F">BALLS</div>
      <div class="big shadow" style="font-size:210px;margin-top:10px;color:#fff;-webkit-text-stroke:6px #1B1B1F;paint-order:stroke fill">65,536</div>
      <div class="big" style="font-size:56px;margin-top:18px;color:#1B1B1F;letter-spacing:0">1 → 1,000,000</div></div>
    <div class="wm" style="color:#1B1B1F;text-shadow:none">Kufi Animation</div>`;
}

// ================================================================== D: KUFİ'NİN KÖTÜ GÜNÜ
function sceneD() {
  scene.background = new THREE.Color('#F4E3C8');
  lights({ key: [-4, 9, 7], keyI: 1.8, keyC: 0xfff0d8, rimI: 2.2, rimC: 0xffc98a, hemi: 0.45 });
  // fayans duvar + ahşap zemin
  const tiles = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#8FB8A0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6E9A82'; g.lineWidth = 6; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); } });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(4, 6);
  add(new THREE.Mesh(new THREE.PlaneGeometry(16, 20), clay('#ffffff', { map: tiles })), 0, 9, -3);
  const wood = canvasTex(512, 512, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#C98B5A' : '#D69A68'; g.fillRect(0, i * 64, w, 64); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, i * 64, w, 3); } });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(3, 3);
  const fl = add(new THREE.Mesh(new THREE.PlaneGeometry(16, 16), clay('#ffffff', { map: wood, roughness: 0.6 })), 0, 0, 3); fl.rotation.x = -Math.PI / 2;
  // masa + devrilmiş bal kavanozu
  add(rbox(4.2, 0.18, 1.8, 0.05, clay('#B97A4A')), -1.2, 2.2, -1.6);
  for (const [x, z] of [[-3.1, -2.3], [0.7, -2.3], [-3.1, -0.9], [0.7, -0.9]]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 12), clay('#A0663A')), x, 1.1, z);
  const honey = gloss('#F5A300', { transmission: 0.5, thickness: 0.8, attenuationColor: new THREE.Color('#B85F00'), attenuationDistance: 0.5, roughness: 0.04 });
  const jar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 40), glass('#FFE7A8', { attenuationDistance: 3 })), -0.4, 2.72, -1.3); jar.rotation.z = Math.PI / 2;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 40), clay('#E0443E')), 0.15, 2.72, -1.3).rotation.z = Math.PI / 2;
  const pud = add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 40), honey), 0.25, 2.32, -1.0); pud.scale.z = 0.7;
  for (const [x, len] of [[0.55, 1.1], [0.85, 1.6]]) { add(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, len, 8, 16), honey), x, 2.25 - len / 2, -0.75); }
  // yırtık yastık
  const pil = add(rbox(1.5, 0.45, 1.0, 0.22, clay('#BFD7FF')), 2.6, 0.24, 0.3); pil.rotation.y = -0.5;
  // Kufi: balla kaplı, tüylü, bıkkın
  const k = kufi({ mood: 'deadpan' }); k.position.set(-0.3, 0, 1.2); k.rotation.y = 0.12;
  const honey2 = gloss('#FFD24A', { transmission: 0.92, thickness: 0.6, attenuationColor: new THREE.Color('#E08A00'), attenuationDistance: 0.7, roughness: 0.02, ior: 1.5 });
  const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 64, 32), honey2), 0.05, 1.86, 0.02, k); cap.scale.set(1.0, 0.26, 0.86);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 16), honey2), 0.25, 1.96, 0.1, k).scale.y = 0.5;
  for (const [x, len] of [[-0.62, 0.55], [-0.3, 0.3], [0.05, 0.75], [0.38, 0.4], [0.64, 0.9]]) {
    add(new THREE.Mesh(new THREE.CapsuleGeometry(0.03, len, 6, 12), honey2), x, 1.82 - len / 2, 0.665, k);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 12), honey2), x, 1.8 - len - 0.03, 0.68, k).scale.y = 1.25;
  }
  for (const s2 of [-1, 1]) add(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.6, 6, 12), honey2), s2 * 0.76, 1.5, 0.3, k);
  // tüyler (havada ve Kufi'ye yapışık)
  const fGeo = new THREE.SphereGeometry(0.16, 16, 8), fMat = clay('#FFFFFF', { sheen: 1 });
  for (let i = 0; i < 70; i++) {
    const f = new THREE.Mesh(fGeo, fMat);
    const onK = i < 16;
    if (onK) f.position.set(-0.3 + (rnd() - 0.5) * 1.5, 0.6 + rnd() * 1.4, 1.2 + 0.66 + rnd() * 0.05);
    else f.position.set(-4 + rnd() * 8, 0.3 + rnd() * 6.5, -2 + rnd() * 5);
    f.scale.set(1, 0.18, 0.45); f.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); f.castShadow = true; scene.add(f);
  }
  camera.position.set(0.3, 3.2, 11.5); camera.lookAt(0, 2.6, 0); focusDist = 10.6; aperture = 0.0009;
  ov.innerHTML = `
    <div style="position:absolute;left:0;right:0;top:0;height:900px;background:linear-gradient(rgba(10,8,20,.62),rgba(10,8,20,0))"></div>
    <div class="ov" style="top:100px;text-align:left;left:70px;font-family:'Courier New',monospace;font-weight:700;font-size:46px;color:#fff;text-shadow:0 0 8px rgba(255,255,255,.6)">◀◀ REWIND</div>
    <div class="ov" style="top:100px;text-align:right;right:70px;left:auto;font-family:'Courier New',monospace;font-weight:700;font-size:46px;color:#fff;text-shadow:0 0 8px rgba(255,255,255,.6)">00:00:14</div>
    <div class="ov" style="top:230px"><div class="tag" style="background:#E0443E">EP. 1 · KUFI'S BAD DAY</div>
      <div class="big shadow" style="font-size:140px;margin-top:22px">HOW DID<br>WE GET HERE?</div></div>
    <div class="scan"></div><div class="vign"></div><div class="wm">Kufi Animation</div>`;
}

({ A: sceneA, B: sceneB, C: sceneC, D: sceneD })[S]();
document.fonts.load('900 100px Inter').then(() => document.fonts.load('800 40px Inter')).then(finish);
