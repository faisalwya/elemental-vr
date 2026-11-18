// Elemental Proving Ground VR, draft v13 · lock-on without a beam (arm aim, warmer/colder), stations organised by what they test
// Rendering, headset input, the sign, sound and the loop.
// Game logic lives in gestures.js (what your hand is doing), fire.js (taking, throwing, the jet) and world.js (bowls, targets, burning, flight).

import * as THREE from 'three';
import { COL, rnd, lambert, glow, sphereGeo, makeFlame, updateFlame, makeGlow, createParticles, createAudio, SWAY } from './fx.js';
import { createScenery } from './scenery.js';
import { readHand } from './gestures.js';
import { createHand, stepHand, FT, createButton, stepButton } from './fire.js';
import { createWorld, STATIONS, at } from './world.js';
import { createDemo } from './demo.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;

const stats = { pulls: 0, lost: 0, throws: 0, hits: 0, jets: 0, jetSecs: 0, lit: 0, yank: { quick: { grabs: 0, pulls: 0 }, pull: { grabs: 0, pulls: 0 } } };
// v12: how a grab is yanked. A: a short sharp tug. B: draw your fist back toward you, like a rope. Switched on the post at the practice range.
const YANKS = { quick: { letter: 'A', name: 'QUICK YANK' }, pull: { letter: 'B', name: 'PULL BACK' } };
try { const a = localStorage.getItem('epg-v12-yank'); if (a === 'quick' || a === 'pull') FT.yankMode = a; } catch (e) { /* storage unavailable */ }
let debug = false;   // the aim beam and the pull numbers, off unless switched on at the post
const AIMS = { arm: 'ARM LINE', ray: 'HEADSET RAY' };
try { const a = localStorage.getItem('epg-v13-aim'); if (a === 'arm' || a === 'ray') FT.aimMode = a; } catch (e) { /* storage unavailable */ }
function setAim(m) {
  FT.aimMode = m; try { localStorage.setItem('epg-v13-aim', m); } catch (e) { /* storage unavailable */ }
  for (const sd of ['left', 'right']) if (hands[sd].state === 'empty') hands[sd].target = null;
  if (window.__log) window.__log.push('AIM ' + m);
  audio.tick(); sign.key = ''; if (typeof post !== 'undefined') post.key = '';
}
function setYank(m) {
  FT.yankMode = m; try { localStorage.setItem('epg-v12-yank', m); } catch (e) { /* storage unavailable */ }
  if (window.__log) window.__log.push('YANK ' + m);
  audio.tick(); sign.key = ''; if (typeof post !== 'undefined') post.key = '';
}
let lastShot = '';

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 300);   // v10: far enough that the sky is never cut off (it was at 90 m, which showed as a patch following your gaze away from the centre)
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
  ['TAKE', 'Reach toward a fire. Fires near your aim stir; the one you would grab leans to you. Close your hand, then yank.'],
  ['POST', 'Beside you: yank A or B, aim along your arm or the headset ray, and debug (beam and numbers).'],
  ['TRAVEL', 'Stand on a glowing circle behind you for a second. Next: throw range, pour yard, playground.'],
];
function drawSign() {
  const key = JSON.stringify(stats) + lastShot + FT.yankMode + FT.aimMode;
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
  const A = stats.yank.quick, B = stats.yank.pull, Y = YANKS[FT.yankMode];
  g.fillStyle = '#d8322a'; g.fillText(`YANK ${Y.letter} · AIM ${FT.aimMode === 'arm' ? 'ARM' : 'RAY'}`, 56, 664);
  g.fillStyle = '#14161d'; g.fillText(`A: ${A.pulls} pulls from ${A.grabs} grabs   B: ${B.pulls} from ${B.grabs}`, 560, 664);
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
  // v11: the aim beam (what your pull would grab) and a small label with your pull speed
  const beam = new THREE.Mesh(threadGeo, glow(COL.hot, 0.3)); beam.visible = false; scene.add(beam);
  const pullLabel = textPlane(0.2, 0.039, 512, 100); pullLabel.mesh.renderOrder = 10; pullLabel.mesh.visible = false; scene.add(pullLabel.mesh);
  views[side] = { flame, halo, light, flash, flashT: 0, ghost, ring, thread, jet, beam, pullLabel, pullText: '', pullT: 0, k: 0, held: 0 };
}
const tmpV = new V3(), tmpA = new V3(), tmpB = new V3(), headPos = new V3(), gazeV = new V3();
function showPull(side, text) { const vw = views[side]; vw.pullText = text; vw.pullT = 2.5; }
function drawLabel(lb, text, hot) {
  const key = text + hot; if (lb.key === key) return; lb.key = key;
  const g = lb.canvas.getContext('2d'), W = lb.canvas.width, H = lb.canvas.height;
  g.clearRect(0, 0, W, H); if (!text) { lb.tex.needsUpdate = true; return; }
  g.fillStyle = 'rgba(20,22,29,.82)'; g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill();
  g.fillStyle = hot ? '#7fd36b' : '#d8322a'; g.fillRect(0, 0, 14, H);
  g.fillStyle = '#ece6d8'; g.font = `700 44px ${FONT}`; g.textBaseline = 'middle'; g.fillText(text, 30, H / 2 + 2); g.textBaseline = 'alphabetic';
  lb.tex.needsUpdate = true;
}
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
  vw.thread.visible = debug && locked && !!inp;   // the solid thread is a debug aid now; the tether is made of sparks
  if (vw.thread.visible) {
    const a = tmpA.set(src.pos.x, src.pos.y + src.r * 0.5, src.pos.z), d = tmpB.set(inp.palm.x, inp.palm.y, inp.palm.z).sub(a), L = d.length();
    vw.thread.position.copy(a); vw.thread.quaternion.setFromUnitVectors(UPV, d.normalize()); vw.thread.scale.set(1 + Math.sin(t * 30) * 0.3, L, 1);
  }
  if (locked && inp) {
    // the tether: sparks streaming from the fire to your fist, faster and hotter the harder you are pulling
    const a = tmpA.set(src.pos.x, src.pos.y + src.r * 0.5, src.pos.z), d = tmpB.set(inp.palm.x, inp.palm.y, inp.palm.z).sub(a), L = d.length(); d.normalize();
    const k = h.pullProgress || 0, n = 4 + Math.round(6 * k);
    for (let i = 0; i < n; i++) { const u = Math.random(); particles.sparks.spawn(a.x + d.x * L * u, a.y + d.y * L * u + Math.sin(u * Math.PI) * 0.05, a.z + d.z * L * u, d.x * (1 + 3 * k), d.y * (1 + 3 * k), d.z * (1 + 3 * k), 0.18 + 0.1 * k, 0.012 + 0.012 * k, k > 0.6 ? COL.white : Math.random() < 0.5 ? COL.hot : COL.fire, 0); }
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
  // the aim beam: from where the pull aims, out to the fire it would grab (faint and short when nothing is selected)
  const aimingNow = st === 'empty' && h.aiming && h.aimFrom && h.aimDir && !!inp;
  vw.beam.visible = debug && aimingNow;
  if (aimingNow) {
    const a = tmpA.set(h.aimFrom.x, h.aimFrom.y, h.aimFrom.z), tg = h.target;
    const e = tg ? tmpB.set(tg.pos.x, tg.pos.y + (tg.r || 0) * 0.4, tg.pos.z) : tmpB.set(a.x + h.aimDir.x * 1.2, a.y + h.aimDir.y * 1.2, a.z + h.aimDir.z * 1.2);
    const d = e.sub(a), L = d.length();
    vw.beam.position.copy(a); vw.beam.quaternion.setFromUnitVectors(UPV, d.normalize()); vw.beam.scale.set(tg ? 0.9 : 0.5, L, tg ? 0.9 : 0.5);
    vw.beam.material.opacity = tg ? 0.5 + 0.1 * Math.sin(t * 8) : 0.16;
  }
  // the pull label: live while you hold a grab, then the result for a couple of seconds
  vw.pullT = Math.max(0, vw.pullT - dt);
  const live = st === 'locked';
  const text = live ? (FT.yankMode === 'pull' ? `pulled back ${Math.round((h.pullBack || 0) * 100)} of ${Math.round(FT.pullDist * 100)} cm` : `pull ${(h.pullSpeedNow || 0).toFixed(1)} m/s · needs ${FT.quickSpeed.toFixed(1)} · best ${(h.peakPull || 0).toFixed(1)}`) : vw.pullT > 0 ? vw.pullText : '';
  vw.pullLabel.mesh.visible = debug && !!text && !!inp;
  if (vw.pullLabel.mesh.visible) {
    vw.pullLabel.mesh.position.set(inp.palm.x, inp.palm.y + 0.17, inp.palm.z); vw.pullLabel.mesh.lookAt(headPos);
    drawLabel(vw.pullLabel, text, live ? (h.pullProgress || 0) >= 1 : vw.pullText.startsWith('pulled'));
  }
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
        tip: J['index-finger-tip'] || null, btn,
        ray: s.ray.visible !== false ? { from: P3(s.ray.position), dir: P3(tmpA.set(0, 0, -1).applyQuaternion(s.ray.quaternion)) } : null };
      for (const name in s.hand.joints) { const j = s.hand.joints[name], m = s.joints[n++]; if (!m) break; m.visible = j.visible !== false; m.position.copy(j.position); m.scale.setScalar(j.jointRadius || 0.008); }
    }
  } else if (s.src && s.grip.visible) {
    tmpV.set(0, 0, -1).applyQuaternion(s.ray.quaternion);
    const gp = s.src.gamepad, bt = gp && gp.buttons ? gp.buttons : [];
    const nextB = !!(bt[4] && bt[4].pressed), backB = !!(bt[5] && bt[5].pressed);   // A or X: next station; B or Y: back
    if (nextB && !s.nextB) travel(station + 1); if (backB && !s.backB) travel(station - 1);
    s.nextB = nextB; s.backB = backB;
    const yankB = !!(bt[3] && bt[3].pressed);   // thumbstick press: switch yank A / B
    if (yankB && !s.yankB) setYank(FT.yankMode === 'quick' ? 'pull' : 'quick'); s.yankB = yankB;
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
    case 'lock': {
      // the catch: the fire flares where you grabbed it, and sparks jump to your hand
      audio.lockOn(); audio.puff(); buzz(d.side, 0.4, 50); stats.yank[d.yank].grabs++;
      particles.burst('fire', d.from, 14, 1.1);
      const hp = hands[d.side].flamePos; if (hp) particles.burst('fire', hp, 6, 0.5);
      if (window.__log) window.__log.push(`LOCK ${d.side} yank ${d.yank}`); break;
    }
    case 'unlock': stats.lost++; showPull(d.side, d.yank === 'pull' ? `let go · pulled back ${Math.round((d.back || 0) * 100)} cm (needs ${Math.round(FT.pullDist * 100)})` : `let go · fastest ${f1(d.peak || 0)} m/s (needs ${f1(FT.quickSpeed)})`); if (window.__log) window.__log.push(`UNLOCK ${d.side} ${d.why} peak ${f1(d.peak || 0)} back ${Math.round((d.back || 0) * 100)}cm`); break;
    case 'pullStart': particles.burst('fire', d.from, 24, 1.4); audio.yank(); buzz(d.side, 0.7, 70); stats.yank[d.yank].pulls++; showPull(d.side, d.yank === 'pull' ? `pulled back ${Math.round((d.back || 0) * 100)} cm` : `pulled at ${f1(d.speed)} m/s`);
      if (window.__log) window.__log.push(`PULL ${d.side} ${d.yank} from ${f1(d.d)} m at ${f1(d.speed)} m/s, back ${Math.round((d.back || 0) * 100)} cm`); break;
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
  baseRef = renderer.xr.getReferenceSpace(); station = 0; bodyYaw = null;
  for (const k in stats) if (typeof stats[k] === 'number') stats[k] = 0;
  for (const m in stats.yank) stats.yank[m].pulls = stats.yank[m].grabs = 0;   // (v11 first build reset the per-mode counts to 0 too, and the first pull then crashed)
  lastShot = ''; sign.key = '';
});
renderer.xr.addEventListener('sessionend', () => { audio.ambience(false); baseRef = null; station = 0; fade.t = -1; world.reset(); resetHands(); demo = createDemo(world); document.body.classList.remove('in-vr'); resize(); });
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (ok) { enterBtn.hidden = false; enterBtn.addEventListener('click', enterVR); statusEl.textContent = 'Clear your play space, then enter. Walk around as much as your room allows; the device on your left wrist takes you between stations.'; }
  }).catch(() => {});
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sign.key = ''; });

/* ---------- stations: floor pads to travel, and the post at the practice range ---------- */
// v12: the wrist device is gone (one hand touching the other is the worst case for Quest hand tracking).
// Each station has two glowing circles a step behind you, left (previous station) and right (next). Stand on one for a second.
let station = 0, baseRef = null;
const PAD = { r: 0.28, dwell: 1.0, side: 0.75, behind: 0.6 };
const padRingGeo = new THREE.RingGeometry(PAD.r - 0.04, PAD.r, 40).rotateX(-Math.PI / 2), padDiscGeo = new THREE.CircleGeometry(PAD.r - 0.04, 40).rotateX(-Math.PI / 2);
const pads = [];
STATIONS.forEach((S, s) => {
  for (const [dir, x] of [[-1, -PAD.side], [1, PAD.side]]) {
    const to = (s + dir + STATIONS.length) % STATIONS.length, [px, pz] = at(s, x, -PAD.behind);
    const ring = new THREE.Mesh(padRingGeo, new THREE.MeshBasicMaterial({ color: COL.hot, transparent: true, opacity: 0.55, depthWrite: false }));
    const disc = new THREE.Mesh(padDiscGeo, new THREE.MeshBasicMaterial({ color: COL.fire, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.set(px, 0.012, pz); disc.position.set(px, 0.011, pz); scene.add(ring, disc);
    const label = textPlane(0.5, 0.12, 500, 120); label.mesh.renderOrder = 5;
    const [lx, lz] = at(s, x * 1.25, -PAD.behind - 0.4); label.mesh.position.set(lx, 0.55, lz); label.mesh.lookAt(S.O[0], 0.9, S.O[1]); scene.add(label.mesh);
    const g = label.canvas.getContext('2d'); g.fillStyle = 'rgba(20,22,29,.85)'; g.beginPath(); g.roundRect(0, 0, 500, 120, 20); g.fill();
    g.fillStyle = '#ffd27a'; g.font = `700 52px ${FONT}`; g.textAlign = 'center'; g.fillText((dir < 0 ? '< ' : '') + STATIONS[to].name.toUpperCase() + (dir > 0 ? ' >' : ''), 250, 80); label.tex.needsUpdate = true;
    pads.push({ s, to, x: px, z: pz, ring, disc, dwell: 0 });
  }
});
let padCool = 0;
function stepPads(dt, t) {
  padCool = Math.max(0, padCool - dt);
  for (const P of pads) {
    const on = renderer.xr.isPresenting && padCool <= 0 && fade.t < 0 && Math.hypot(headPos.x - P.x, headPos.z - P.z) < PAD.r;
    P.dwell = on ? P.dwell + dt : Math.max(0, P.dwell - dt * 3);
    const k = Math.min(1, P.dwell / PAD.dwell);
    P.disc.material.opacity = 0.08 + 0.55 * k; P.ring.material.opacity = 0.45 + 0.15 * Math.sin(t * 3 + P.x) + 0.4 * k;
    P.ring.scale.setScalar(1 + 0.08 * k);
    if (k >= 1) { P.dwell = 0; travel(P.to); padCool = 1.5; }
  }
}
// the post: two big buttons, pressed with one hand. Left: yank A / B. Right: debug (the aim beam and pull numbers).
const post = (() => {
  const [x, z] = at(0, -1.15, 0.15), g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); scene.add(g);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 10), lambert(0x4a4658)); col.position.y = 0.5; g.add(col);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), lambert(0x2a2c36)); top.position.y = 1.02; top.rotation.x = -0.35; g.add(top);
  const btns = [['yank', -0.16, 0xd8322a], ['aim', 0, 0xe0a030], ['debug', 0.16, 0x5d5a4f]].map(([k, bx, c]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 20), lambert(c, { emissive: c, emissiveIntensity: 0.25 }));
    b.position.set(bx, 0.03, 0); top.add(b);
    const lb = textPlane(0.15, 0.06, 340, 130); lb.mesh.position.set(bx, 0.16, -0.02); lb.mesh.rotation.x = 0.35; top.add(lb.mesh);
    return { k, mesh: b, label: lb, down: false, press: 0 };
  });
  return { g, top, btns, key: '' };
})();
function drawPost() {
  const key = FT.yankMode + FT.aimMode + debug; if (post.key === key) return; post.key = key;
  for (const b of post.btns) {
    const g = b.label.canvas.getContext('2d'), W = b.label.canvas.width, H = b.label.canvas.height;
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(20,22,29,.85)'; g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill();
    g.fillStyle = '#ece6d8'; g.textAlign = 'center'; g.font = `700 40px ${FONT}`;
    g.fillText(b.k === 'yank' ? `YANK ${YANKS[FT.yankMode].letter}` : b.k === 'aim' ? 'AIM' : `DEBUG ${debug ? 'ON' : 'OFF'}`, W / 2, 56);
    g.font = `600 30px ${FONT}`; g.fillStyle = '#ffd27a'; g.fillText(b.k === 'yank' ? YANKS[FT.yankMode].name : b.k === 'aim' ? AIMS[FT.aimMode] : 'beam + numbers', W / 2, 104);
    b.label.tex.needsUpdate = true;
  }
}
const POST_BTN = { on: 0.05, off: 0.08 };
function stepPost(dt, tips) {
  post.top.updateMatrixWorld(true);
  for (const b of post.btns) {
    const c = b.mesh.getWorldPosition(tmpA);
    let near = Infinity; for (const tp of tips) if (tp) near = Math.min(near, Math.hypot(tp.x - c.x, tp.y - c.y, tp.z - c.z));
    if (!b.down && near < POST_BTN.on) {
      b.down = true; b.press = 1; audio.tick();
      if (b.k === 'yank') setYank(FT.yankMode === 'quick' ? 'pull' : 'quick'); else if (b.k === 'aim') setAim(FT.aimMode === 'arm' ? 'ray' : 'arm'); else { debug = !debug; post.key = ''; if (window.__log) window.__log.push('DEBUG ' + debug); }
    } else if (b.down && near > POST_BTN.off) b.down = false;
    b.press = Math.max(0, b.press - dt * 4); b.mesh.position.y = 0.03 - 0.015 * b.press;
  }
  drawPost();
}
// the fade: a black shell around your head
const fade = { t: -1, to: 0, mesh: new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false })) };
fade.mesh.renderOrder = 1000; fade.mesh.visible = false; scene.add(fade.mesh);
const FADE_OUT = 0.15, FADE_IN = 0.22;
function travel(to) {
  if (!baseRef || fade.t >= 0) return;
  fade.to = ((to % STATIONS.length) + STATIONS.length) % STATIONS.length; fade.t = 0;
  audio.whoosh(4);
}
// place station s around where you are standing in your room, turned so you face its things
function arrive(s) {
  const frame = renderer.xr.getFrame(), vp = frame && frame.getViewerPose(baseRef);
  if (!vp) return;
  const p = vp.transform.position;
  // face the station's things along where your body faces, not where your head points: you are looking down at your wrist when you press
  const S = STATIONS[s], D = Math.atan2(S.F[0], S.F[1]) - (bodyYaw === null ? 0 : bodyYaw);
  // world = T(O) R(D) T(-head); the offset space's origin is the inverse of that, expressed in the room's space
  const c = Math.cos(-D), sn = Math.sin(-D), ox = S.O[0] * c + S.O[1] * sn, oz = -S.O[0] * sn + S.O[1] * c;
  const T = new XRRigidTransform({ x: p.x - ox, y: 0, z: p.z - oz }, { x: 0, y: Math.sin(-D / 2), z: 0, w: Math.cos(-D / 2) });
  renderer.xr.setReferenceSpace(baseRef.getOffsetReferenceSpace(T));
  station = s; padCool = 1.5; for (const P of pads) P.dwell = 0;
  for (const side of ['left', 'right']) { const h = hands[side]; h.hist.length = 0; h.swing = null; h.calmP = null; if (h.state === 'locked') { h.state = 'empty'; h.src = null; h.target = null; } }
  if (window.__log) window.__log.push('STATION ' + s + ' ' + S.name);
}
function stepTravel(dt) {
  if (fade.t < 0) { fade.mesh.visible = false; return; }
  const was = fade.t; fade.t += dt;
  if (was < FADE_OUT && fade.t >= FADE_OUT) arrive(fade.to);
  const k = fade.t < FADE_OUT ? fade.t / FADE_OUT : Math.max(0, 1 - (fade.t - FADE_OUT) / FADE_IN);
  fade.mesh.visible = true; fade.mesh.material.opacity = k; fade.mesh.position.copy(headPos);
  if (fade.t > FADE_OUT + FADE_IN) fade.t = -1;
}

/* ---------- the fire answers your aim (v12, in place of the beam) ---------- */
// The fire you would grab leans toward your hand and flares, and embers drift from it to your fingers.
const UPY = new V3(0, 1, 0), leanQ = new THREE.Quaternion(), leanV = new V3();
function answerAim(dt, inputs) {
  const want = new Map(), warm = new Map();
  for (const side of ['left', 'right']) {
    const h = hands[side];
    if (h.state !== 'empty' || !h.aiming) continue;
    for (const w of h.warm || []) warm.set(w.id, Math.max(warm.get(w.id) || 0, w.k));
  }
  for (const side of ['left', 'right']) {
    const h = hands[side], inp = inputs[side];
    if (h.state !== 'empty' || !h.target || !inp || !inp.tracked) continue;
    const tg = h.target, palm = inp.palm;
    want.set(tg.id, palm);
    // embers drifting from the fire to your hand
    const d = leanV.set(palm.x - tg.pos.x, palm.y - tg.pos.y, palm.z - tg.pos.z), L = d.length(); d.normalize();
    if (Math.random() < 0.7) { const sp = rnd(2.5, 4); particles.sparks.spawn(tg.pos.x + rnd(-0.08, 0.08), tg.pos.y + (tg.r || 0.2) * 0.6, tg.pos.z + rnd(-0.08, 0.08), d.x * sp, d.y * sp + 0.3, d.z * sp, Math.min(1.2, L / sp) * 0.8, rnd(0.012, 0.022), Math.random() < 0.5 ? COL.hot : COL.fire, 0); }
  }
  // warmer / colder: fires near your aim stir and brighten, more the closer you get; the selected one leans right over
  let aimHand = null; for (const side of ['left', 'right']) if (hands[side].state === 'empty' && hands[side].aiming && inputs[side] && inputs[side].tracked) aimHand = inputs[side].palm;
  for (const B of world.bowls) {
    const palm = want.get(B.id), wk = warm.get(B.id) || 0, goal = palm ? 1 : 0.45 * wk * wk;
    B.lean = (B.lean || 0) + (goal - (B.lean || 0)) * Math.min(1, dt * 8);
    const toward = palm || (wk > 0 ? aimHand : null);
    if (toward) B.leanTo = { x: toward.x - B.pos.x, z: toward.z - B.pos.z };
    B.glow.material.opacity = 0.45 + 0.5 * B.lean;
    if (!palm && wk > 0.55 && Math.random() < dt * 10 * wk) particles.sparks.spawn(B.pos.x + rnd(-0.1, 0.1), B.pos.y + B.r * 0.5, B.pos.z + rnd(-0.1, 0.1), rnd(-0.2, 0.2), rnd(0.6, 1.2), rnd(-0.2, 0.2), rnd(0.4, 0.8), rnd(0.012, 0.02), COL.hot, -0.3);
    for (const f of B.flames) {
      if (f.userData.base === undefined) f.userData.base = f.userData.size;
      f.userData.size = f.userData.base * (1 + 0.35 * B.lean);
      if (B.leanTo && B.lean > 0.01) {
        const hz = Math.hypot(B.leanTo.x, B.leanTo.z) || 1;
        leanV.set(B.leanTo.x / hz * 0.7 * B.lean, 1, B.leanTo.z / hz * 0.7 * B.lean).normalize();
        f.quaternion.copy(leanQ.setFromUnitVectors(UPY, leanV));
      } else f.quaternion.identity();
    }
  }
}

/* ---------- loop ---------- */
let last = 0, simT = 0;
let bodyYaw = null;
// where your body faces in the room: your head's heading, smoothed over about a second (held during a fade)
function trackBody(dt, frozen) {
  const frame = renderer.xr.getFrame(), vp = baseRef && frame && frame.getViewerPose(baseRef);
  if (!vp) return;
  const o = vp.transform.orientation, f = new V3(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
  if (Math.hypot(f.x, f.z) < 0.2) return;   // looking straight up or down says nothing about heading
  const yaw = Math.atan2(f.x, f.z);
  if (bodyYaw === null) { bodyYaw = yaw; return; }
  if (frozen) return;
  const d = Math.atan2(Math.sin(yaw - bodyYaw), Math.cos(yaw - bodyYaw));
  bodyYaw += d * (1 - Math.exp(-dt / 1.0));
}
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

  // travel pads and the post
  if (inVR) trackBody(dt, fade.t >= 0);
  stepPads(dt, t);
  stepPost(dt, ['left', 'right'].map(sd => inputs[sd] && inputs[sd].tracked ? inputs[sd].tip : null));
  stepTravel(dt);

  const sources = world.sources();
  for (const side of ['left', 'right']) {
    const h = hands[side], inp = inputs[side];
    stepHand(h, inp, dt, simT, sources, (type, d) => onHandEvent(type, d));
    if (h.state === 'jet') { audio.loop('jet-' + side, 'roar', true); if (Math.random() < 0.2) buzz(side, 0.25, 30); }
    updateView(side, h, inp && inp.tracked ? inp : null, dt, t);
    const gv = views[side].ghost; gv.visible = !inVR && !!inp; if (gv.visible) gv.position.set(inp.palm.x, inp.palm.y, inp.palm.z);
  }

  answerAim(dt, inputs);
  world.update(dt, t);
  for (const e of world.events) onWorldEvent(e);
  world.events.length = 0;

  scenery.follow(headPos); scenery.update(dt, t); drawShots(t); particles.update(dt); drawSign();
  if (!inVR) {
    const tall = camera.aspect < 1, sway = Math.sin(t * 0.2) * 0.15;
    if (location.search.includes('eye')) { camera.position.set(0, 1.62, 0.3); camera.lookAt(0.3, 1.5, -4); }
    else { camera.position.set(sway + (tall ? 0 : -0.4), tall ? 2.6 : 2.3, tall ? 6.2 : 3.4); camera.lookAt(tall ? 0 : 0.2, tall ? 1.2 : 1.5, -4); }
  }
  renderer.render(scene, camera);
});

// handle for the automated page check
window.__game = { world, hands, stats, scenery, renderer, FT, yank: () => FT.yankMode, setYank, aim: () => FT.aimMode, setAim, debug: () => debug, demo: () => demo, station: () => station, travel, pads: () => pads.map(P => ({ s: P.s, to: P.to, x: P.x, z: P.z, dwell: P.dwell })), post: () => post.btns.map(b => { const c = b.mesh.getWorldPosition(new V3()); return { k: b.k, x: c.x, y: c.y, z: c.z }; }), head: () => ({ x: headPos.x, y: headPos.y, z: headPos.z }) };
