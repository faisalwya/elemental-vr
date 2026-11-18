// Elemental Proving Ground VR, draft v09 · the courtyard
// Rendering, headset input, the sign, sound and the loop.
// Game logic lives in gestures.js (what your hand is doing), fire.js (taking, throwing, the jet) and world.js (bowls, targets, burning, flight).

import * as THREE from 'three';
import { COL, rnd, lambert, glow, sphereGeo, makeFlame, updateFlame, makeGlow, createParticles, createAudio, SWAY } from './fx.js';
import { createScenery } from './scenery.js';
import { readHand } from './gestures.js';
import { createHand, stepHand, FT } from './fire.js';
import { createWorld } from './world.js';
import { createDemo } from './demo.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;

const stats = { pulls: 0, lost: 0, throws: 0, hits: 0, jets: 0, jetSecs: 0, lit: 0 };
let lastShot = '';

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 90);
function resize() {
  if (renderer.xr.isPresenting) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 80 : 62; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ---------- light: a cool sky above, the last warm light from the west (two lights, never more) ---------- */
scene.add(new THREE.HemisphereLight(0x9a96d8, 0x3a2a30, 1.35));
const sunLight = new THREE.DirectionalLight(0xffb27a, 1.0); sunLight.position.set(-20, 8, -12); scene.add(sunLight);

const particles = createParticles(scene);
const audio = createAudio(() => renderer.xr.isPresenting);
const scenery = createScenery(scene, particles);
const world = createWorld(scene, { particles, audio });
const hands = { left: createHand('left'), right: createHand('right') };

/* ---------- text on a canvas, for the sign and the wrist buttons ---------- */
function textPlane(w, h, pxW, pxH) {
  const canvas = document.createElement('canvas'); canvas.width = pxW; canvas.height = pxH;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  return { mesh, canvas, tex, key: '' };
}
const FONT = '"Barlow Condensed","Arial Narrow",sans-serif';

/* ---------- the sign: how to take, throw and pour, and what you have done ---------- */
const sign = textPlane(2.4, 1.2, 1600, 800);
sign.mesh.position.set(-3.2, 2.0, 0.5); sign.mesh.lookAt(0, 1.6, 0); scene.add(sign.mesh);
const SIGN_LINES = [
  ['TAKE', 'Reach into a near bowl, or reach toward a far fire until it glows, close your hand and pull your fist back.'],
  ['THROW', 'Swing. It leaves at the fastest point.'],
  ['POUR', 'Arm out in front, open hand, turn your palm forward. Turn it away to stop.'],
];
function drawSign() {
  const key = JSON.stringify(stats) + lastShot;
  if (key === sign.key) return; sign.key = key;
  const g = sign.canvas.getContext('2d'), W = sign.canvas.width, H = sign.canvas.height;
  g.fillStyle = '#ece6d8'; g.fillRect(0, 0, W, H); g.strokeStyle = '#14161d'; g.lineWidth = 14; g.strokeRect(7, 7, W - 14, H - 14);
  g.fillStyle = '#d8322a'; g.fillRect(48, 46, 24, 84);
  g.fillStyle = '#14161d'; g.font = `700 96px ${FONT}`; g.fillText('FLAME LAB', 96, 122);
  let y = 220;
  for (const [k, text] of SIGN_LINES) {
    g.fillStyle = '#d8322a'; g.font = `700 50px ${FONT}`; g.fillText(k, 56, y);
    g.fillStyle = '#2a2823'; g.font = `600 50px ${FONT}`;
    let line = '';
    for (const word of text.split(' ')) { if (g.measureText(line + word).width > W - 330) { g.fillText(line, 260, y); y += 58; line = ''; } line += word + ' '; }
    g.fillText(line, 260, y); y += 78;
  }
  g.fillStyle = '#14161d'; g.fillRect(48, 590, W - 96, 4);
  g.font = `700 50px ${FONT}`; g.fillStyle = '#14161d';
  g.fillText(`${stats.pulls} pulls · ${stats.hits}/${stats.throws} throws hit · ${stats.jets} jets (${stats.jetSecs.toFixed(0)} s) · ${stats.lit} things set alight`, 56, 664);
  g.font = `600 46px ${FONT}`; g.fillStyle = '#5d5a4f'; g.fillText(lastShot || 'Try the hay, lanterns, the bell rope, the fuse, the ice, barrels and dry grass.', 56, 736);
  sign.tex.needsUpdate = true;
}
/* ---------- each hand: joints or a mitt, the flame, the jet, the grab thread ---------- */
const skinMat = lambert(COL.paper), mittGeo = new THREE.SphereGeometry(0.045, 12, 8).scale(0.8, 0.65, 1.2);
const jetGeo = new THREE.ConeGeometry(0.035, 1, 8, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
const threadGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6, 1, true).translate(0, 0.5, 0), UPV = new V3(0, 1, 0);
const views = {};
for (const side of ['left', 'right']) {
  const flame = makeFlame(0.16, scene, false);
  const halo = makeGlow(COL.fire, 0.35, 0); scene.add(halo);
  const light = new THREE.PointLight(COL.fire, 0, 5, 2); scene.add(light);
  const flash = makeGlow(COL.hot, 0.3, 0); scene.add(flash);
  const ghost = new THREE.Mesh(mittGeo, skinMat); ghost.scale.setScalar(1.7); ghost.visible = false; scene.add(ghost);
  const ring = makeGlow(COL.hot, 1, 0); scene.add(ring);
  const thread = new THREE.Mesh(threadGeo, glow(COL.hot, 0.7)); thread.visible = false; scene.add(thread);
  const jet = new THREE.Mesh(jetGeo, glow(COL.hot, 0.6)); jet.visible = false; scene.add(jet);
  views[side] = { flame, halo, light, flash, flashT: 0, ghost, ring, thread, jet, k: 0, held: 0 };
}
const tmpV = new V3(), tmpA = new V3(), tmpB = new V3(), headPos = new V3(), gazeV = new V3();
function updateView(side, h, inp, dt, t) {
  const vw = views[side], st = h.state, has = st === 'ready' || st === 'pulling' || st === 'jet', held = st === 'ready' && h.closed;
  vw.k += ((has ? 1 : 0) - vw.k) * Math.min(1, dt * 10);
  vw.held += ((held ? 1 : 0) - vw.held) * Math.min(1, dt * 14);
  const target = inp && (held ? inp.palm : inp.flamePos);
  if (target) {
    if (!vw.sp) vw.sp = new V3(target.x, target.y, target.z);
    vw.sp.lerp(tmpV.set(target.x, target.y, target.z), 1 - Math.exp(-30 * dt));   // steady the flame against tracking jitter
  }
  let p = vw.sp;
  if (st === 'pulling' && h.pullFrom && p) {
    // the pulled flame flies from the fire to your hand in a low arc, leaving a stream behind it
    const k = h.pullK * h.pullK * (3 - 2 * h.pullK), f = h.pullFrom;
    const at = k2 => new V3(f.x + (p.x - f.x) * k2, f.y + (p.y - f.y) * k2 + Math.sin(Math.PI * k2) * 0.25, f.z + (p.z - f.z) * k2);
    p = at(k);
    for (let i = 0; i < 6; i++) { const q = at(k * Math.random()); particles.sparks.spawn(q.x, q.y, q.z, rnd(-0.15, 0.15), rnd(0, 0.4), rnd(-0.15, 0.15), rnd(0.25, 0.45), rnd(0.03, 0.06), i % 2 ? COL.fire : COL.hot, 0.5); }
  }
  // the fire you are aiming at glows faintly; once locked it glows bright and a thread joins it to your hand
  const src = st === 'locked' ? h.src : st === 'empty' ? h.target : null, locked = st === 'locked';
  const want = locked ? 0.85 + 0.15 * Math.sin(t * 12) : src ? 0.4 : 0;
  vw.ring.material.opacity += (want - vw.ring.material.opacity) * Math.min(1, dt * 14);
  if (src) { vw.ring.position.set(src.pos.x, src.pos.y + src.r * 0.6, src.pos.z); vw.ring.scale.setScalar(src.r * (locked ? 7 + Math.sin(t * 12) * 0.5 : 5.5)); }
  vw.thread.visible = locked && !!inp;
  if (vw.thread.visible) {
    const a = tmpA.set(src.pos.x, src.pos.y + src.r * 0.5, src.pos.z), d = tmpB.set(inp.palm.x, inp.palm.y, inp.palm.z).sub(a), L = d.length();
    vw.thread.position.copy(a); vw.thread.quaternion.setFromUnitVectors(UPV, d.normalize()); vw.thread.scale.set(1 + Math.sin(t * 30) * 0.3, L, 1);
    for (let i = 0; i < 2; i++) { const k = Math.random(); particles.sparks.spawn(a.x + d.x * L * k, a.y + d.y * L * k, a.z + d.z * L * k, d.x, d.y, d.z, 0.25, 0.02, COL.hot, 0); }
  }
  if (p) { vw.flame.position.set(p.x, p.y - 0.03, p.z); vw.halo.position.set(p.x, p.y + 0.02, p.z); vw.light.position.copy(vw.halo.position); }
  // held: the flame shrinks into your fist and the glow leaks out between the fingers
  vw.flame.userData.target = has ? 1 : 0;
  // the flame shrinks as its fuel is poured out
  const fuelK = st === 'pulling' ? 1 : Math.max(0, h.fuel) / FT.fuel;
  // about to pour: the flame swells and brightens while you hold the pose, so you can see it coming
  const prime = st === 'ready' ? (h.poseK || 0) : 0;
  vw.prime = (vw.prime || 0) + (prime - (vw.prime || 0)) * Math.min(1, dt * 20);
  vw.flame.userData.size = (0.16 - 0.1 * vw.held) * (0.35 + 0.65 * fuelK) * (1 + 0.6 * vw.prime);
  vw.jet.visible = st === 'jet' && !!inp;
  if (vw.jet.visible) {
    const d = h.jetDir, from = inp.palm;
    vw.jet.position.set(from.x + inp.normal.x * 0.04, from.y + inp.normal.y * 0.04, from.z + inp.normal.z * 0.04);
    vw.jet.lookAt(vw.jet.position.x + d.x, vw.jet.position.y + d.y, vw.jet.position.z + d.z);
    vw.jet.scale.set(1.3 + Math.sin(t * 50) * 0.25, 1.3 + Math.sin(t * 37) * 0.25, 0.6 + Math.sin(t * 29) * 0.08);
  }
  updateFlame(vw.flame, dt, t);
  vw.halo.material.opacity = vw.k * (0.35 + 0.35 * vw.held + 0.5 * vw.prime); vw.halo.scale.setScalar(0.3 + 0.1 * vw.held);
  vw.light.intensity = vw.k * 2.2;
  if (held && p && Math.random() < 0.5) particles.sparks.spawn(p.x + rnd(-0.05, 0.05), p.y + rnd(-0.03, 0.05), p.z + rnd(-0.05, 0.05), rnd(-0.1, 0.1), rnd(0.2, 0.5), rnd(-0.1, 0.1), 0.25, 0.012, COL.hot, 0);
  // release flash
  vw.flashT = Math.max(0, vw.flashT - dt);
  const fk = vw.flashT / 0.18;
  vw.flash.material.opacity = fk * 0.95; vw.flash.scale.setScalar(0.25 + (1 - fk) * 0.6);
}

/* ---------- what is in flight: a bright core, a glow and a long trail ---------- */
const coreMat = glow(COL.hot, 0.95);
const shotViews = new Map(), shotPool = [];
const shotLight = new THREE.PointLight(COL.fire, 0, 7, 2); scene.add(shotLight);   // one light, always present, so shaders never recompile
const seg = new V3();
const JET_MAX = 200;
const jetMesh = new THREE.InstancedMesh(sphereGeo, glow(0xffffff, 0.7), JET_MAX);
jetMesh.frustumCulled = false; jetMesh.count = 0; scene.add(jetMesh);
{ const c = new THREE.Color(0xffffff); for (let i = 0; i < JET_MAX; i++) jetMesh.setColorAt(i, c); }
const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sv = new V3(), jc = new THREE.Color(), cHot = new THREE.Color(COL.hot), cFire = new THREE.Color(COL.fire), cDeep = new THREE.Color(0xc0381a);
function drawShots(t) {
  let lit = false, ji = 0;
  const live = new Set();
  for (const s of world.shots) {
    if (s.kind === 'jet') {
      // the stream: droplets that swell and darken from white-hot to deep red as they fly
      if (ji >= JET_MAX) continue;
      const a = Math.min(1, s.age / 0.6), size = 0.035 + a * 0.12;
      m4.compose(s.pos, q0, sv.set(size, size, size)); jetMesh.setMatrixAt(ji, m4);
      jc.copy(a < 0.5 ? cHot : cFire).lerp(a < 0.5 ? cFire : cDeep, a < 0.5 ? a * 2 : (a - 0.5) * 2); jetMesh.setColorAt(ji, jc);
      ji++;
      if (Math.random() < 0.06) particles.burst('ember', s.pos, 1, 0.3);
      continue;
    }
    live.add(s.id);
    let v = shotViews.get(s.id);
    if (!v) {
      v = shotPool.pop() || (() => { const core = new THREE.Mesh(sphereGeo, coreMat), halo = makeGlow(COL.fire, 0.6, 0.9); scene.add(core, halo); return { core, halo, last: new V3() }; })();
      v.core.visible = v.halo.visible = true; v.last.copy(s.from); shotViews.set(s.id, v);
    }
    const flick = 1 + Math.sin(t * 35 + s.id * 99) * 0.12;
    v.core.position.copy(s.pos); v.core.scale.setScalar(0.085 * flick);
    v.halo.position.copy(s.pos); v.halo.scale.setScalar(0.65 * flick);
    // the trail: glowing beads laid every 5 cm along the path, fading over half a second, so you can read the arc
    seg.copy(s.pos).sub(v.last); const L = seg.length(), n = Math.min(40, Math.floor(L / 0.05));
    for (let k = 1; k <= n; k++) {
      const q = v.last.clone().addScaledVector(seg, k / n);
      particles.sparks.spawn(q.x, q.y, q.z, rnd(-0.05, 0.05), rnd(0, 0.15), rnd(-0.05, 0.05), 0.6, 0.05, k % 3 ? COL.fire : COL.hot, 0);
    }
    if (n) v.last.copy(s.pos);
    for (let k = 0; k < 2; k++) particles.sparks.spawn(s.pos.x, s.pos.y, s.pos.z, -s.vel.x * 0.07 + rnd(-0.3, 0.3), -s.vel.y * 0.07 + rnd(0, 0.5), -s.vel.z * 0.07 + rnd(-0.3, 0.3), rnd(0.25, 0.5), rnd(0.03, 0.06), COL.hot, 1);
    if (!lit) { shotLight.position.copy(s.pos); shotLight.intensity = 3.5; lit = true; }
  }
  if (!lit) shotLight.intensity = 0;
  jetMesh.count = ji; if (ji) { jetMesh.instanceMatrix.needsUpdate = true; jetMesh.instanceColor.needsUpdate = true; }
  for (const [id, v] of shotViews) if (!live.has(id)) { v.core.visible = v.halo.visible = false; shotViews.delete(id); shotPool.push(v); }
}

/* ---------- headset input: hands or controllers ---------- */
const xr = [0, 1].map(i => {
  const s = { ray: renderer.xr.getController(i), grip: renderer.xr.getControllerGrip(i), hand: renderer.xr.getHand(i), src: null, sel: false, sqz: false, prev: null, styleBtn: false };
  s.ray.addEventListener('connected', e => { s.src = e.data; });
  s.ray.addEventListener('disconnected', () => { s.src = null; s.sel = s.sqz = false; s.prev = null; });
  s.ray.addEventListener('selectstart', () => { s.sel = true; }); s.ray.addEventListener('selectend', () => { s.sel = false; });
  s.ray.addEventListener('squeezestart', () => { s.sqz = true; }); s.ray.addEventListener('squeezeend', () => { s.sqz = false; });
  scene.add(s.ray, s.grip, s.hand);
  s.mitt = new THREE.Mesh(mittGeo, skinMat); s.grip.add(s.mitt);
  s.joints = Array.from({ length: 25 }, () => { const m = new THREE.Mesh(sphereGeo, skinMat); m.visible = false; scene.add(m); return m; });
  return s;
});
const P3 = o => ({ x: o.x, y: o.y, z: o.z });
function readXR(i, head, facing) {
  const s = xr[i], side = (s.src && s.src.handedness) || (i ? 'right' : 'left');
  const isHand = !!(s.src && s.src.hand);
  let inp = { tracked: false }, n = 0;
  if (isHand && s.hand.visible) {
    const J = {};
    for (const name in s.hand.joints) { const j = s.hand.joints[name]; if (j.visible !== false) J[name] = P3(j.position); }
    const r = readHand(J, side, s.prev);
    s.prev = r;
    if (r) {
      // the wrist button sits on the back of the wrist, like a watch face
      const w = J['wrist'], mp = J['middle-finger-phalanx-proximal'];
      const f = tmpV.set(mp.x - w.x, mp.y - w.y, mp.z - w.z).normalize();
      const btn = { x: w.x - r.normal.x * 0.035 - f.x * 0.03, y: w.y - r.normal.y * 0.035 - f.y * 0.03, z: w.z - r.normal.z * 0.035 - f.z * 0.03 };
      inp = { tracked: true, mode: 'hand', palm: r.palm, normal: r.normal,
        flamePos: { x: r.palm.x + r.normal.x * 0.03, y: r.palm.y + 0.07 + r.normal.y * 0.03, z: r.palm.z + r.normal.z * 0.03 }, gesture: r.gesture, curl: r.curl, point: r.point, two: r.two, pointFrom: r.pointFrom, pointDir: r.pointDir, head, facing,
        tip: J['index-finger-tip'] || null, btn };
      for (const name in s.hand.joints) { const j = s.hand.joints[name], m = s.joints[n++]; if (!m) break; m.visible = j.visible !== false; m.position.copy(j.position); m.scale.setScalar(j.jointRadius || 0.008); }
    }
  } else if (s.src && s.grip.visible) {
    tmpV.set(0, 0, -1).applyQuaternion(s.ray.quaternion);
    const gp = s.src.gamepad, bt = gp && gp.buttons ? gp.buttons : [];
    const g = P3(s.grip.position);
    inp = { tracked: true, mode: 'controller', palm: g, normal: P3(tmpV),
      flamePos: { x: g.x, y: g.y + 0.09, z: g.z }, gesture: s.sqz ? 'fist' : s.sel ? 'pinch' : 'open', point: s.sel, pointFrom: P3(s.ray.position), pointDir: P3(tmpV), head, facing,
      tip: { x: s.ray.position.x + tmpV.x * 0.08, y: s.ray.position.y + tmpV.y * 0.08, z: s.ray.position.z + tmpV.z * 0.08 },
      btn: { x: g.x, y: g.y - 0.05, z: g.z + 0.06 } };
  }
  for (; n < s.joints.length; n++) s.joints[n].visible = false;
  s.mitt.visible = !isHand;
  return { side, inp };
}
function buzz(side, strength, ms) {
  for (const s of xr) {
    if (!s.src || s.src.handedness !== side) continue;
    try { const a = s.src.gamepad && s.src.gamepad.hapticActuators; if (a && a[0]) a[0].pulse(strength, ms); } catch (e) { /* no haptics here */ }
  }
}

/* ---------- what the hands and the world report ---------- */
const f1 = n => n.toFixed(1);
const jetFrom = {};
function onHandEvent(type, d) {
  switch (type) {
    case 'lock': audio.lockOn(); buzz(d.side, 0.3, 40); if (window.__log) window.__log.push(`LOCK ${d.side}`); break;
    case 'unlock': stats.lost++; if (window.__log) window.__log.push(`UNLOCK ${d.side} ${d.why}`); break;
    case 'pullStart': particles.burst('fire', d.from, 16, 1); audio.yank(); buzz(d.side, 0.6, 60);
      if (window.__log) window.__log.push(`PULL ${d.side} from ${f1(d.d)} m at ${f1(d.speed)} m/s`); break;
    case 'take': {
      const at = hands[d.side].flamePos || d.from;
      particles.burst('fire', at, 14, 0.8); audio.take(); buzz(d.side, 0.7, 70);
      if (d.how === 'pull') { stats.pulls++; lastShot = `Last: pulled from ${f1(d.d)} m.`; } else lastShot = 'Last: took from a near bowl.';
      if (window.__log) window.__log.push(`TAKE ${d.side} ${d.how}`); break;
    }
    case 'jetStart': stats.jets++; jetFrom[d.side] = simT; audio.loop('jet-' + d.side, 'roar', true); buzz(d.side, 0.5, 60); if (window.__log) window.__log.push(`JET ${d.side}${d.how === 'push' ? ' push' : ''}`); break;
    case 'pushed': if (window.__log) window.__log.push(`PUSHED ${d.side}`); break;
    case 'jetDrop': world.addShot(d.pos, { x: d.vel.x + rnd(-0.3, 0.3), y: d.vel.y + rnd(-0.3, 0.3), z: d.vel.z + rnd(-0.3, 0.3) }, 'jet'); break;
    case 'jetStop': {
      audio.loop('jet-' + d.side, 'roar', false);
      const secs = simT - (jetFrom[d.side] || simT); stats.jetSecs += secs; lastShot = d.out ? `Last: poured out the whole flame (${f1(secs)} s).` : `Last: a ${f1(secs)} s jet, the rest of the flame kept.`;
      if (window.__log) window.__log.push(`JETSTOP ${d.side} ${f1(secs)} s${d.out ? ' out' : ''}`); break;
    }
    case 'blocked': case 'glitch': if (window.__log) window.__log.push(`${type.toUpperCase()} ${d.side}`); break;
    case 'throw': {
      const sp = Math.hypot(d.vel.x, d.vel.y, d.vel.z), dir = { x: d.vel.x / sp, y: d.vel.y / sp, z: d.vel.z / sp };
      stats.throws++;
      world.addShot(d.pos, d.vel, 'ball');
      // the release: a burst thrown forward along the throw, a flash in the hand, a whoosh
      for (let k = 0; k < 22; k++) { const f = rnd(0.5, 3.5); particles.sparks.spawn(d.pos.x, d.pos.y, d.pos.z, dir.x * f + rnd(-0.6, 0.6), dir.y * f + rnd(-0.4, 0.8), dir.z * f + rnd(-0.6, 0.6), rnd(0.25, 0.5), rnd(0.03, 0.06), k % 2 ? COL.fire : COL.hot, 1); }
      const vw = views[d.side]; vw.flash.position.set(d.pos.x, d.pos.y, d.pos.z); vw.flashT = 0.18;
      audio.whoosh(sp); buzz(d.side, 0.8, 70);
      if (window.__log) window.__log.push(`THROW ${d.side} ${d.how} hand ${f1(d.handSpeed)} m/s, out ${f1(sp)} m/s`);
      break;
    }
  }
}
let meltCool = 0;
function onWorldEvent(e) {
  switch (e.type) {
    case 'thud': audio.thud(e.v); break;
    case 'hit':
      if (e.what === 'prop') break;
      stats.hits++;
      if (e.what === 'dummy') { lastShot = 'Last: hit a dummy.'; break; }
      if (e.what === 'disc') { audio.ding(e.off / e.r); lastShot = `Last: hit the ${e.d} m target, ${Math.round(e.off * 100)} cm from the centre.`; }
      else { audio.whoomp(); lastShot = 'Last: hit the crate wall.'; }
      break;
    case 'miss': audio.puff(); lastShot = 'Last: miss.'; break;
    case 'rebuild': audio.chime(); break;
    case 'ignite': stats.lit++; audio.whoomp(); lastShot = `Last: set the ${e.what === 'hay' ? 'hay' : e.what} alight.`; break;
    case 'lantern': stats.lit++; audio.whoosh(3); lastShot = 'Last: a lantern floats away.'; break;
    case 'snap': audio.snap(); lastShot = 'Last: the rope burned through.'; break;
    case 'bell': audio.gong(); lastShot = 'Last: rang the bell.'; break;
    case 'bellLand': audio.clank(); audio.gong(); audio.thud(10); lastShot = 'Last: the bell came down.'; break;
    case 'fuse': audio.fizzle(); lastShot = 'Last: lit the fuse.'; break;
    case 'candle': audio.fizzle(); break;
    case 'launch': audio.launch(); break;
    case 'boom': audio.boom(); lastShot = 'Last: fireworks.'; break;
    case 'barrelLit': audio.hiss(); lastShot = 'Last: the barrel is hissing...'; break;
    case 'explode': audio.blast(1); audio.boom(); lastShot = 'Last: the barrel burst.'; break;
    case 'melt': if (meltCool <= 0) { audio.melt(); meltCool = 0.3; } break;
    case 'freed': audio.chime(); lastShot = 'Last: freed the flame in the ice. Pull it.'; break;
    case 'refreeze': audio.hiss(); break;
    case 'grass': audio.puff(); break;
  }
  if (window.__log && !['thud', 'melt', 'sizzle', 'candle', 'grass'].includes(e.type)) window.__log.push(e.type + (e.what ? ' ' + e.what + (e.d ? ' ' + e.d + 'm off ' + e.off.toFixed(2) : '') : '') + (e.style ? ' ' + e.style : ''));
}

/* ---------- page chrome ---------- */
let demo = createDemo(world);
const statusEl = $('status'), enterBtn = $('enter');
function resetHands() { for (const s of ['left', 'right']) { Object.assign(hands[s], createHand(s)); audio.loop('jet-' + s, 'roar', false); } }
async function enterVR() {
  audio.init();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
  } catch (err) { statusEl.textContent = 'Could not start VR: ' + (err && err.message ? err.message : err); }
}
renderer.xr.addEventListener('sessionstart', () => {
  world.reset(); world.events.length = 0; resetHands(); document.body.classList.add('in-vr'); audio.ambience(true);
  for (const k in stats) stats[k] = 0; lastShot = ''; sign.key = '';
});
renderer.xr.addEventListener('sessionend', () => { audio.ambience(false); world.reset(); resetHands(); demo = createDemo(world); document.body.classList.remove('in-vr'); resize(); });
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (ok) { enterBtn.hidden = false; enterBtn.addEventListener('click', enterVR); statusEl.textContent = 'Clear an arm\'s length of space around you, then enter. You stay standing in one spot.'; }
  }).catch(() => {});
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sign.key = ''; });

/* ---------- loop ---------- */
let last = 0, simT = 0;
resize();
renderer.setAnimationLoop(ms => {
  const t = ms / 1000, dt = Math.min(0.05, Math.max(0.001, t - last)); last = t;
  const inVR = renderer.xr.isPresenting;
  simT += dt; meltCool -= dt; SWAY.time.value = t;
  if (inVR) { const xc = renderer.xr.getCamera(); xc.getWorldPosition(headPos); xc.getWorldDirection(gazeV); } else { headPos.copy(camera.position); camera.getWorldDirection(gazeV); }
  const head = P3(headPos), facing = P3(gazeV);

  let inputs = {};
  if (inVR) {
    // a hand that drops out can come back in the other slot; an empty slot must not overwrite the hand that is there
    for (const i of [0, 1]) { const r = readXR(i, head, facing); if (r.inp.tracked || !inputs[r.side]) inputs[r.side] = r.inp; }
  }
  else inputs = demo.update(dt);

  const sources = world.sources();
  for (const side of ['left', 'right']) {
    const h = hands[side], inp = inputs[side];
    stepHand(h, inp, dt, simT, sources, (type, d) => onHandEvent(type, d));
    if (h.state === 'jet') { audio.loop('jet-' + side, 'roar', true); if (Math.random() < 0.2) buzz(side, 0.25, 30); }
    updateView(side, h, inp && inp.tracked ? inp : null, dt, t);
    const gv = views[side].ghost; gv.visible = !inVR && !!inp; if (gv.visible) gv.position.set(inp.palm.x, inp.palm.y, inp.palm.z);
  }

  world.update(dt, t);
  for (const e of world.events) onWorldEvent(e);
  world.events.length = 0;

  scenery.update(dt, t); drawShots(t); particles.update(dt); drawSign();
  if (!inVR) {
    const tall = camera.aspect < 1, sway = Math.sin(t * 0.2) * 0.15;
    if (location.search.includes('eye')) { camera.position.set(0, 1.62, 0.3); camera.lookAt(0.3, 1.5, -4); }
    else { camera.position.set(sway + (tall ? 0 : -0.4), tall ? 2.6 : 2.3, tall ? 6.2 : 3.4); camera.lookAt(tall ? 0 : 0.2, tall ? 1.2 : 1.5, -4); }
  }
  renderer.render(scene, camera);
});

// handle for the automated page check
window.__game = { world, hands, stats, scenery, renderer, demo: () => demo };
