// Elemental Proving Ground VR, draft v06 · pulling lab
// Rendering, headset input, the wrist button, the sign, sound and the loop.
// Game logic lives in gestures.js (what your hand is doing), fire.js (taking and throwing) and world.js (bowls, targets, flight).

import * as THREE from 'three';
import { COL, rnd, lambert, glow, sphereGeo, makeFlame, updateFlame, makeGlow, createParticles, createAudio } from './fx.js';
import { readHand } from './gestures.js';
import { createHand, stepHand, createButton, stepButton } from './fire.js';
import { createWorld } from './world.js';
import { createDemo } from './demo.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;

/* ---------- which pulling style: A grab and yank, B two-finger draw (remembered on the headset) ---------- */
const STYLES = {
  A: { name: 'A · GRAB AND YANK', how: 'Reach an open hand toward a fire until it glows. Close your hand to grab it, then pull your fist back.', short: 'GRAB' },
  B: { name: 'B · TWO-FINGER DRAW', how: 'Point index and middle finger at a fire until it glows, then draw your hand back toward you.', short: 'DRAW' },
};
let style = 'A';
try { const s = localStorage.getItem('epg-v06-style'); if (s === 'A' || s === 'B') style = s; } catch (e) { /* storage unavailable */ }
const stats = { A: { pulls: 0, lost: 0 }, B: { pulls: 0, lost: 0 }, throws: 0, hits: 0 };
let lastShot = '';
function setStyle(s) {
  if (s === style) return;
  style = s;
  try { localStorage.setItem('epg-v06-style', s); } catch (e) { /* storage unavailable */ }
  for (const sd of ['left', 'right']) if (hands[sd].state === 'locked') { hands[sd].state = 'empty'; hands[sd].src = null; hands[sd].target = null; }
  if (window.__log) window.__log.push('STYLE ' + s);
  audio.tick(); sign.key = ''; Object.values(views).forEach(v => { v.btn.key = ''; });
}

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.sky);
scene.fog = new THREE.Fog(COL.sky, 12, 32);
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 90);
function resize() {
  if (renderer.xr.isPresenting) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 80 : 62; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ---------- surroundings ---------- */
scene.add(new THREE.HemisphereLight(0x9db0e6, 0x23252f, 1.5));
const moonLight = new THREE.DirectionalLight(0xc6d4ff, 1.2); moonLight.position.set(-4, 8, 3); scene.add(moonLight);
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), lambert(COL.stone)); scene.add(floor);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 2.8, 32, 1, true), lambert(COL.stoneDark, { side: THREE.BackSide })); wall.position.y = 1.4; scene.add(wall);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL.paper, transparent: true, opacity: 0.3 })); ring.position.y = 0.01; scene.add(ring);
  const moon = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xf2efe2, fog: false })); moon.position.set(-9, 15, -22); moon.scale.setScalar(1.3); scene.add(moon);
  const n = 260, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = rnd(Math.PI * 2), e = rnd(0.12, 1.5), r = 55; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 0.35, fog: false })));
}

const particles = createParticles(scene);
const audio = createAudio(() => renderer.xr.isPresenting);
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

/* ---------- the sign: which style, how to pull with it, and the count for each ---------- */
const sign = textPlane(2.4, 1.2, 1600, 800);
sign.mesh.position.set(-2.6, 2.1, -1.7); sign.mesh.lookAt(0, 1.6, 0); scene.add(sign.mesh);
function drawSign() {
  const S = STYLES[style], key = style + JSON.stringify(stats) + lastShot;
  if (key === sign.key) return; sign.key = key;
  const g = sign.canvas.getContext('2d'), W = sign.canvas.width, H = sign.canvas.height;
  g.fillStyle = '#ece6d8'; g.fillRect(0, 0, W, H); g.strokeStyle = '#14161d'; g.lineWidth = 14; g.strokeRect(7, 7, W - 14, H - 14);
  g.fillStyle = '#d8322a'; g.fillRect(48, 46, 24, 84);
  g.fillStyle = '#14161d'; g.font = `700 64px ${FONT}`; g.fillText('PULLING LAB · STYLE', 96, 92);
  g.font = `700 112px ${FONT}`; g.fillText(S.name, 56, 230);
  g.font = `600 58px ${FONT}`; g.fillStyle = '#2a2823';
  let line = '', y = 320;
  for (const word of S.how.split(' ')) { if (g.measureText(line + word).width > W - 110) { g.fillText(line, 56, y); y += 66; line = ''; } line += word + ' '; }
  g.fillText(line, 56, y);
  g.font = `600 46px ${FONT}`; g.fillStyle = '#5d5a4f';
  g.fillText('Or reach into a near bowl. Throw: swing, it leaves at the fastest point.', 56, y + 70);
  g.fillText('Switch style: touch the button on your wrist.', 56, y + 126);
  g.fillStyle = '#14161d'; g.fillRect(48, 548, W - 96, 4);
  g.font = `700 56px ${FONT}`;
  ['A', 'B'].forEach((k, i) => { const s = stats[k]; g.fillStyle = k === style ? '#d8322a' : '#5d5a4f'; g.fillText(`${k}: ${s.pulls} pulls · ${s.lost} lost grips`, 56 + i * 760, 630); });
  g.font = `600 48px ${FONT}`; g.fillStyle = '#5d5a4f'; g.fillText((lastShot || 'Fires at 2.5, 4.5 and 7 m, two more in reach.') + `   Throws: ${stats.hits} hits in ${stats.throws}`, 56, 720);
  sign.tex.needsUpdate = true;
}

/* ---------- each hand: joints or a mitt, the flame, the release flash, the wrist button ---------- */
const skinMat = lambert(COL.paper), mittGeo = new THREE.SphereGeometry(0.045, 12, 8).scale(0.8, 0.65, 1.2);
const threadGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6, 1, true).translate(0, 0.5, 0), UPV = new V3(0, 1, 0);
const views = {};
for (const side of ['left', 'right']) {
  const flame = makeFlame(0.16, scene, false);
  const halo = makeGlow(COL.fire, 0.35, 0); scene.add(halo);
  const light = new THREE.PointLight(COL.fire, 0, 5, 2); scene.add(light);
  const flash = makeGlow(COL.hot, 0.3, 0); scene.add(flash);
  const btn = textPlane(0.06, 0.06, 192, 192); btn.mesh.renderOrder = 10; btn.mesh.visible = false; scene.add(btn.mesh);
  const ghost = new THREE.Mesh(mittGeo, skinMat); ghost.scale.setScalar(1.7); ghost.visible = false; scene.add(ghost);
  const ring = makeGlow(COL.hot, 1, 0); scene.add(ring);
  const thread = new THREE.Mesh(threadGeo, glow(COL.hot, 0.7)); thread.visible = false; scene.add(thread);
  views[side] = { flame, halo, light, flash, flashT: 0, btn, btnFlash: 0, button: createButton(), ghost, ring, thread, k: 0, held: 0 };
}
function drawButton(b, glowK) {
  const key = style + (glowK > 0.5 ? '*' : '');
  if (b.key === key) return; b.key = key;
  const g = b.canvas.getContext('2d'), W = b.canvas.width;
  g.clearRect(0, 0, W, W);
  g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 6, 0, Math.PI * 2); g.fillStyle = glowK > 0.5 ? '#d8322a' : '#14161d'; g.fill();
  g.lineWidth = 8; g.strokeStyle = '#ece6d8'; g.stroke();
  g.fillStyle = '#ece6d8'; g.textAlign = 'center'; g.font = `700 104px ${FONT}`; g.fillText(style, W / 2, 112);
  g.font = `700 36px ${FONT}`; g.fillText(STYLES[style].short, W / 2, 156);
  b.tex.needsUpdate = true;
}
const tmpV = new V3(), tmpA = new V3(), tmpB = new V3(), headPos = new V3(), gazeV = new V3();
function updateView(side, h, inp, dt, t) {
  const vw = views[side], st = h.state, has = st === 'ready' || st === 'pulling', held = st === 'ready' && h.closed;
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
  vw.flame.userData.size = 0.16 - 0.1 * vw.held;
  updateFlame(vw.flame, dt, t);
  vw.halo.material.opacity = vw.k * (0.35 + 0.35 * vw.held); vw.halo.scale.setScalar(0.3 + 0.1 * vw.held);
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
function drawShots(t) {
  let lit = false;
  const live = new Set();
  for (const s of world.shots) {
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
    const styleBtn = !!(bt[4] && bt[4].pressed);   // A or X also switches style
    if (styleBtn && !s.styleBtn) setStyle(style === 'A' ? 'B' : 'A');
    s.styleBtn = styleBtn;
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
function onHandEvent(type, d) {
  switch (type) {
    case 'lock': audio.lockOn(); buzz(d.side, 0.3, 40); if (window.__log) window.__log.push(`LOCK ${d.style} ${d.side}`); break;
    case 'unlock': stats[style].lost++; if (window.__log) window.__log.push(`UNLOCK ${d.side} ${d.why}`); break;
    case 'pullStart': particles.burst('fire', d.from, 16, 1); audio.yank(); buzz(d.side, 0.6, 60);
      if (window.__log) window.__log.push(`PULL ${d.style} ${d.side} from ${f1(d.d)} m at ${f1(d.speed)} m/s`); break;
    case 'take': {
      const at = hands[d.side].flamePos || d.from;
      particles.burst('fire', at, 14, 0.8); audio.take(); buzz(d.side, 0.7, 70);
      if (d.how === 'pull') { stats[d.style].pulls++; lastShot = `Last: pulled from ${f1(d.d)} m.`; } else lastShot = 'Last: took from a near bowl.';
      if (window.__log) window.__log.push(`TAKE ${d.side} ${d.how}${d.style ? ' ' + d.style : ''}`); break;
    }
    case 'blocked': case 'glitch': if (window.__log) window.__log.push(`${type.toUpperCase()} ${d.side}`); break;
    case 'throw': {
      const sp = Math.hypot(d.vel.x, d.vel.y, d.vel.z), dir = { x: d.vel.x / sp, y: d.vel.y / sp, z: d.vel.z / sp };
      stats.throws++;
      world.addShot(d.pos, d.vel, 'B');
      // the release: a burst thrown forward along the throw, a flash in the hand, a whoosh
      for (let k = 0; k < 22; k++) { const f = rnd(0.5, 3.5); particles.sparks.spawn(d.pos.x, d.pos.y, d.pos.z, dir.x * f + rnd(-0.6, 0.6), dir.y * f + rnd(-0.4, 0.8), dir.z * f + rnd(-0.6, 0.6), rnd(0.25, 0.5), rnd(0.03, 0.06), k % 2 ? COL.fire : COL.hot, 1); }
      const vw = views[d.side]; vw.flash.position.set(d.pos.x, d.pos.y, d.pos.z); vw.flashT = 0.18;
      audio.whoosh(sp); buzz(d.side, 0.8, 70);
      if (window.__log) window.__log.push(`THROW ${d.side} ${d.how} hand ${f1(d.handSpeed)} m/s, out ${f1(sp)} m/s`);
      break;
    }
  }
}
function onWorldEvent(e) {
  switch (e.type) {
    case 'thud': audio.thud(e.v); break;
    case 'hit':
      stats.hits++;
      if (e.what === 'disc') { audio.ding(e.off / e.r); lastShot = `Last: hit the ${e.d} m target, ${Math.round(e.off * 100)} cm from the centre.`; }
      else { audio.whoomp(); lastShot = 'Last: hit the crate wall.'; }
      break;
    case 'miss': audio.puff(); lastShot = 'Last: miss.'; break;
    case 'rebuild': audio.chime(); break;
  }
  if (window.__log && e.type !== 'thud') window.__log.push(e.type + (e.what ? ' ' + e.what + (e.d ? ' ' + e.d + 'm off ' + e.off.toFixed(2) : '') : '') + (e.style ? ' ' + e.style : ''));
}

/* ---------- page chrome ---------- */
let demo = createDemo(world, setStyle);
const statusEl = $('status'), enterBtn = $('enter');
function resetHands() { for (const s of ['left', 'right']) Object.assign(hands[s], createHand(s)); }
async function enterVR() {
  audio.init();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
  } catch (err) { statusEl.textContent = 'Could not start VR: ' + (err && err.message ? err.message : err); }
}
renderer.xr.addEventListener('sessionstart', () => {
  world.reset(); world.events.length = 0; resetHands(); document.body.classList.add('in-vr');
  for (const k of ['A', 'B']) stats[k].pulls = stats[k].lost = 0; stats.throws = stats.hits = 0; lastShot = ''; sign.key = '';
});
renderer.xr.addEventListener('sessionend', () => { world.reset(); resetHands(); demo = createDemo(world, setStyle); document.body.classList.remove('in-vr'); resize(); });
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (ok) { enterBtn.hidden = false; enterBtn.addEventListener('click', enterVR); statusEl.textContent = 'Clear an arm\'s length of space around you, then enter. You stay standing in one spot.'; }
  }).catch(() => {});
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sign.key = ''; Object.values(views).forEach(v => { v.btn.key = ''; }); });

/* ---------- loop ---------- */
let last = 0, simT = 0;
resize();
renderer.setAnimationLoop(ms => {
  const t = ms / 1000, dt = Math.min(0.05, Math.max(0.001, t - last)); last = t;
  const inVR = renderer.xr.isPresenting;
  simT += dt;
  if (inVR) { const xc = renderer.xr.getCamera(); xc.getWorldPosition(headPos); xc.getWorldDirection(gazeV); } else { headPos.copy(camera.position); camera.getWorldDirection(gazeV); }
  const head = P3(headPos), facing = P3(gazeV);

  let inputs = {};
  if (inVR) {
    // a hand that drops out can come back in the other slot; an empty slot must not overwrite the hand that is there
    for (const i of [0, 1]) { const r = readXR(i, head, facing); if (r.inp.tracked || !inputs[r.side]) inputs[r.side] = r.inp; }
  }
  else inputs = demo.update(dt);

  // wrist buttons: each one is pressed by the other hand's index fingertip
  for (const side of ['left', 'right']) {
    const vw = views[side], inp = inputs[side], other = inputs[side === 'left' ? 'right' : 'left'];
    const at = inp && inp.tracked && inp.btn, tip = other && other.tracked && other.tip;
    if (stepButton(vw.button, tip || null, at || null, dt)) { setStyle(style === 'A' ? 'B' : 'A'); vw.btnFlash = 1; buzz(side, 0.5, 40); }
    vw.btnFlash = Math.max(0, vw.btnFlash - dt * 3);
    vw.btn.mesh.visible = inVR && !!at;
    if (at) { vw.btn.mesh.position.set(at.x, at.y, at.z); vw.btn.mesh.lookAt(headPos); drawButton(vw.btn, vw.btnFlash); }
  }

  const sources = world.sources();
  for (const side of ['left', 'right']) {
    const h = hands[side], inp = inputs[side];
    stepHand(h, inp, dt, simT, style, sources, (type, d) => onHandEvent(type, d));
    updateView(side, h, inp && inp.tracked ? inp : null, dt, t);
    const gv = views[side].ghost; gv.visible = !inVR && !!inp; if (gv.visible) gv.position.set(inp.palm.x, inp.palm.y, inp.palm.z);
  }

  world.update(dt, t);
  for (const e of world.events) onWorldEvent(e);
  world.events.length = 0;

  drawShots(t); particles.update(dt); drawSign();
  if (!inVR) {
    const tall = camera.aspect < 1, sway = Math.sin(t * 0.2) * 0.15;
    if (location.search.includes('eye')) { camera.position.set(0, 1.62, 0.3); camera.lookAt(0.3, 1.5, -4); }
    else { camera.position.set(sway + (tall ? 0 : -0.4), tall ? 2.6 : 2.3, tall ? 6.2 : 3.4); camera.lookAt(tall ? 0 : 0.2, tall ? 1.2 : 1.5, -4); }
  }
  renderer.render(scene, camera);
});

// handle for the automated page check
window.__game = { world, hands, stats, style: () => style, demo: () => demo };
