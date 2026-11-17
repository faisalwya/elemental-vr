// Enter VR in an emulated Quest 3 (IWER, Meta's WebXR emulator) inside headless Chrome, play the throwing lab
// with emulated hands and controllers, and report what happened. Checks function, not feel.
//
//   node tests/xr_check.mjs v05 [out-dir]      # screenshots go to out-dir (default: a temp folder)
//
// Needs Playwright with a Chromium (set CHROME=/path if it is not found) and the `iwer` npm package;
// if iwer is missing it is installed once into a temp folder. Serves the repo itself.
// Hand motion is keyed to game time (the same summed, clamped frame step the game uses), so the slow
// software renderer does not make swings read slower or faster than scripted.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VER = process.argv[2] || 'v05';
const OUT = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'xr-check-'));
fs.mkdirSync(OUT, { recursive: true });

/* ---------- dependencies ---------- */
const require = createRequire(import.meta.url);
function need(name, installDir) {
  try { return require.resolve(name); } catch (e) { /* not local */ }
  const g = path.join(execSync('npm root -g').toString().trim(), name);
  if (fs.existsSync(g)) return g;
  if (!installDir) throw new Error(`${name} not found`);
  const local = path.join(installDir, 'node_modules', name);
  if (!fs.existsSync(local)) { console.log(`installing ${name} into ${installDir}`); execSync(`npm install --silent --prefix "${installDir}" ${name}`, { stdio: 'inherit' }); }
  return local;
}
const { chromium } = require(need('playwright'));
const iwerDir = need('iwer', path.join(os.tmpdir(), 'epg-iwer'));
const iwerRoot = iwerDir.endsWith('.js') ? path.dirname(path.dirname(iwerDir)) : iwerDir;
const IWER_JS = fs.readFileSync(path.join(iwerRoot, 'build', 'iwer.min.js'), 'utf8');
const CHROME = process.env.CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

/* ---------- a static server for the repo ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

/* ---------- what runs in the page before the game: the emulator and a puppet for it ---------- */
const PUPPET = `
(() => {
  const d = new IWER.XRDevice(IWER.metaQuest3);
  d.installRuntime({ forceInstall: true }); d.stereoEnabled = false; d.primaryInputMode = 'hand';   // forceInstall: Chrome has its own empty WebXR
  d.position.set(0, 1.6, 0);
  window.__xr = d;
  // keyframe queues per input; each key: { to:[x,y,z], dur, pose, linear, buttons:{id:value}, connected, then }
  const Q = { left: [], right: [] }, from = {};
  const input = side => d.primaryInputMode === 'hand' ? d.hands[side] : d.controllers[side];
  window.__key = (side, k) => Q[side].push(k);
  window.__idle = () => !Q.left.length && !Q.right.length;
  function puppet(dt) {
    for (const side of ['left', 'right']) {
      const q = Q[side]; if (!q.length) { from[side] = null; continue; }
      const k = q[0], inp = input(side);
      if (!k.started) {
        k.started = true; k.t = 0; from[side] = inp.position.clone();
        const q0 = inp.quaternion; k.q0 = [q0.x, q0.y, q0.z, q0.w];
        if (k.q && k.q0[0] * k.q[0] + k.q0[1] * k.q[1] + k.q0[2] * k.q[2] + k.q0[3] * k.q[3] < 0) k.q = k.q.map(x => -x);
        if (k.pose && inp.poseId !== undefined) inp.poseId = k.pose;
        if (k.buttons) for (const id in k.buttons) inp.updateButtonValue(id, k.buttons[id]);
        if (k.connected !== undefined) inp.connected = k.connected;
      }
      k.t += dt;
      const f = Math.min(1, k.t / (k.dur || 0.0001)), e = k.linear ? f : f * f * (3 - 2 * f);
      if (k.q) { const q = k.q0.map((x, i) => x + (k.q[i] - x) * e), l = Math.hypot(...q); inp.quaternion.set(q[0] / l, q[1] / l, q[2] / l, q[3] / l); }
      if (k.to) { const a = from[side]; inp.position.set(a.x + (k.to[0] - a.x) * e, a.y + (k.to[1] - a.y) * e, a.z + (k.to[2] - a.z) * e); }
      if (f >= 1) { q.shift(); if (k.then) k.then(); }
    }
  }
  const req = navigator.xr.requestSession.bind(navigator.xr);
  navigator.xr.requestSession = async (...a) => {
    const s = await req(...a);
    const ref = await s.requestReferenceSpace('local-floor');
    const raf = s.requestAnimationFrame.bind(s);
    let last = null; window.__gt = 0;
    s.requestAnimationFrame = cb => raf((t, f) => {
      const dt = last === null ? 0.016 : Math.min(0.05, Math.max(0.001, (t - last) / 1000)); last = t;   // the game's own step
      window.__gt += dt;
      puppet(dt);
      const J = {};
      for (const src of s.inputSources) if (src.hand) {
        const o = {};
        for (const [name, space] of src.hand) { const p = f.getJointPose(space, ref); if (p) o[name] = { x: p.transform.position.x, y: p.transform.position.y, z: p.transform.position.z }; }
        J[src.handedness] = o;
      }
      window.__joints = J;
      const vp = f.getViewerPose(ref); if (vp) window.__head = { x: vp.transform.position.x, y: vp.transform.position.y, z: vp.transform.position.z };
      cb(t, f);
    });
    return s;
  };
})();`;

/* ---------- run ---------- */
const results = [];
const check = (ok, what, detail = '') => { results.push({ ok, what, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  · ' + detail : ''}`); };
const info = (what, detail) => { results.push({ ok: null, what, detail }); console.log(`info ${what}  · ${detail}`); };

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
await page.addInitScript({ content: IWER_JS + PUPPET + '\nwindow.__log = [];' });
await page.goto(`http://127.0.0.1:${PORT}/${VER}/`);
await page.waitForSelector('#enter:not([hidden])', { timeout: 15000 });
await page.click('#enter');
await page.waitForFunction(() => document.body.classList.contains('in-vr'), null, { timeout: 15000 });

const K = (side, k) => page.evaluate(([s, k]) => window.__key(s, k), [side, k]);
const settle = async (ms = 60000) => { await page.waitForFunction(() => window.__idle(), null, { timeout: ms, polling: 50 }); };
const wait = async secs => { await K('left', { dur: secs }); await settle(); };
const log = () => page.evaluate(() => window.__log.slice());
const since = async n => (await log()).slice(n);
const state = () => page.evaluate(() => ({ style: window.__game.style ? window.__game.style() : null, left: window.__game.hands.left.state, right: window.__game.hands.right.state, stats: JSON.parse(JSON.stringify(window.__game.stats)), gt: window.__gt, head: window.__head }));
// what the game's own hand reader makes of the emulated joints
const read = side => page.evaluate(async s => {
  const { readHand } = await import('./src/gestures.js');
  const J = window.__joints[s]; if (!J) return null;
  const r = readHand(J, s, null); if (!r) return null;
  const w = J['wrist'], mp = J['middle-finger-phalanx-proximal'], f = [mp.x - w.x, mp.y - w.y, mp.z - w.z], l = Math.hypot(...f);
  const btn = [0, 1, 2].map(i => [w.x, w.y, w.z][i] - [r.normal.x, r.normal.y, r.normal.z][i] * 0.035 - f[i] / l * 0.03);   // same as main.js
  return { curl: +r.curl.toFixed(3), gesture: r.gesture, normal: [r.normal.x, r.normal.y, r.normal.z].map(n => +n.toFixed(2)), palm: [r.palm.x, r.palm.y, r.palm.z].map(n => +n.toFixed(3)),
    tip: J['index-finger-tip'] && [J['index-finger-tip'].x, J['index-finger-tip'].y, J['index-finger-tip'].z], btn,
    point: !!r.point, two: !!r.two, pointDir: r.pointDir && [r.pointDir.x, r.pointDir.y, r.pointDir.z], pointFrom: r.pointFrom, tips: r.tips || [] };
}, side);
const handPos = side => page.evaluate(s => { const p = window.__xr.primaryInputMode === 'hand' ? window.__xr.hands[s].position : window.__xr.controllers[s].position; return [p.x, p.y, p.z]; }, side);
const shot = async name => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); return f; };
const look = (yawDeg, pitchDeg = 0) => page.evaluate(([y, p]) => {
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2), cp = Math.cos(p / 2), sp = Math.sin(p / 2);
  window.__xr.quaternion.set(cp * 0 + sp * cy, sy * cp, -sp * sy, cy * cp);   // yaw about Y, then pitch about X
}, [yawDeg * Math.PI / 180, pitchDeg * Math.PI / 180]);

async function scenarioV05() {
// 1. arrive: hands in front, open
await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.3, pose: 'open' });
await K('right', { to: [0.25, 1.2, -0.3], dur: 0.3, pose: 'open' });
await settle(); await wait(1.2);
  let s = await state();
check(s.left === 'ready' && s.right === 'ready', 'both hands tracked and holding a flame', `left ${s.left}, right ${s.right}, head ${JSON.stringify(s.head)}`);
check(s.style === 'A', 'starts in style A', s.style);
const R0 = await read('right'), L0 = await read('left');
info('emulated open hands as the game reads them', `right curl ${R0 && R0.curl} ${R0 && R0.gesture} normal ${R0 && R0.normal}; left curl ${L0 && L0.curl} ${L0 && L0.gesture} normal ${L0 && L0.normal}`);
await shot('01-hands-ready');

// 2. which emulated poses count as a closed hand in style A
const poses = ['open', 'flat', 'cup', 'claw', 'grip', 'fist', 'point', 'pinch'];
const table = [];
for (const p of poses) {
  await K('right', { dur: 0.3, pose: 'open' }); await K('right', { dur: 0.35, pose: p }); await settle();
  const r = await read('right'), st = await state();
  table.push(`${p}: curl ${r.curl} ${r.gesture} -> ${st.right}`);
}
await K('right', { dur: 0.3, pose: 'open' }); await settle();
info('style A, pose -> state (held = closed around the flame)', table.join(' | '));
  let n = (await log()).length;
check(!(await since(0)).some(l => l.startsWith('THROW')), 'changing hand poses while still never throws');

// 3. style A throw: close, swing forward about 4 m/s, open at the end
const wind = [0.25, 1.55, 0.1], front = [0.25, 1.45, -0.35], after = [0.25, 1.43, -0.4];
await K('right', { to: wind, dur: 0.7, pose: 'open' }); await K('right', { dur: 0.3, pose: 'fist' });
await K('right', { to: front, dur: 0.1, linear: true, pose: 'fist' }); await K('right', { to: after, dur: 0.12, linear: true, pose: 'open' });
await K('right', { to: [0.25, 1.2, -0.3], dur: 0.6, pose: 'open' });
await settle(); await wait(2.5);
  let L = await since(n); n += L.length;
  let th = L.find(l => l.startsWith('THROW A right open'));
check(!!th, 'A: close, swing, open throws', th || L.join(' / '));
info('A throw result', L.filter(l => !l.startsWith('THROW')).join(' / ') || 'no result yet');
const hs = th && +th.match(/hand ([\d.]+)/)[1];
check(th && hs > 3 && hs < 6, 'A: measured hand speed matches the scripted swing (about 4.5 m/s)', th ? `${hs} m/s` : '');

// 4. A: open a still hand, no throw
await K('right', { dur: 0.3, pose: 'fist' }); await K('right', { dur: 0.3, pose: 'fist' }); await K('right', { dur: 0.3, pose: 'open' }); await settle();
L = await since(n); n += L.length;
check(!L.some(l => l.startsWith('THROW')) && (await state()).right === 'ready', 'A: opening a still hand keeps the flame, no throw', L.join(' / '));

// 5. A: tracking lost mid swing still throws
await K('right', { to: wind, dur: 0.7, pose: 'open' }); await K('right', { dur: 0.3, pose: 'fist' });
await K('right', { to: front, dur: 0.1, linear: true, pose: 'fist' }); await K('right', { dur: 0.15, connected: false });
await K('right', { dur: 0.3, connected: true, to: [0.25, 1.2, -0.3], pose: 'open' });
await settle(); await wait(1.5);
L = await since(n); n += L.length;
check(L.some(l => l.startsWith('THROW A right lost')), 'A: tracking lost in mid swing still throws', L.filter(l => l.startsWith('THROW')).join(' / ') || 'no throw');

// 6. wrist button: point the right index at the button on the back of the left wrist
await K('left', { to: [-0.15, 1.25, -0.3], dur: 0.4, pose: 'open' }); await K('right', { dur: 0.3, pose: 'point' }); await settle(); await wait(0.2);
const Lb = await read('left'), Rp = await read('right'), rh = await handPos('right');
const off = [0, 1, 2].map(i => Rp.tip[i] - rh[i]);
const aim = d => [0, 1, 2].map(i => Lb.btn[i] - off[i] + d[i]);
info('left wrist button position', `button ${Lb.btn.map(x => x.toFixed(3))}, left palm ${Lb.palm}, palm normal ${Lb.normal}`);
await look(-20, -40); await wait(0.3); await shot('02-wrist-button');
await look(0, 0);
const styleBefore = (await state()).style;
await K('right', { to: aim([0.06, 0.04, 0.06]), dur: 0.5 }); await K('right', { to: aim([0, 0, 0]), dur: 0.3 }); await K('right', { dur: 0.2 });
await K('right', { to: aim([0.08, 0.06, 0.08]), dur: 0.3 }); await settle();
s = await state();
check(s.style !== styleBefore, 'wrist button: touching it with the other index switches style', `${styleBefore} -> ${s.style}`);
await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5, pose: 'open' }); await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.5 }); await settle(); await wait(0.8);
L = await since(n); n += L.length;
check(L.filter(l => l.startsWith('STYLE')).length === 1, 'wrist button: one touch is one switch', L.filter(l => l.startsWith('STYLE')).join(' / '));

// 7. style B: flick, and a fast wind-up that must not throw
await K('right', { to: [0.25, 1.35, -0.45], dur: 0.6, pose: 'open' }); await K('right', { to: wind, dur: 0.15, linear: true }); await K('right', { dur: 0.4 }); await settle();
L = await since(n); n += L.length;
check(!L.some(l => l.startsWith('THROW')), 'B: a fast wind-up back past the head is not a throw', L.join(' / '));
await K('right', { to: front, dur: 0.1, linear: true }); await K('right', { to: after, dur: 0.15, linear: true }); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.6 });
await settle(); await wait(0.4); await shot('03-flick-in-flight'); await wait(2);
L = await since(n); n += L.length;
th = L.find(l => l.startsWith('THROW B right flick'));
check(!!th, 'B: an open-hand swing flicks the flame', th || L.join(' / '));
info('B throw result', L.filter(l => !l.startsWith('THROW')).join(' / ') || 'no result yet');

// 7b. B: a swing low beside the hip, out of sight, does not throw
await K('right', { to: [0.4, 0.9, 0.4], dur: 0.8, pose: 'open' }); await K('right', { dur: 0.4 });
await K('right', { to: [0.4, 0.85, 0.0], dur: 0.08, linear: true }); await K('right', { to: [0.4, 0.85, -0.03], dur: 0.15, linear: true });
await K('right', { to: [0.25, 1.2, -0.3], dur: 0.8 }); await settle(); await wait(0.5);
L = await since(n); n += L.length;
check(!L.some(l => l.startsWith('THROW')), 'B: a swing out of sight, beside the hip, does not throw', L.join(' / '));

// 8. the sign: look left at it
await look(48, 8); await wait(0.4); await shot('04-sign'); await look(0, 0);

// 8b. hands leave view and come back right first (the right hand can land in the other input slot)
await K('left', { dur: 0.2, connected: false }); await K('right', { dur: 0.2, connected: false }); await settle(); await wait(0.3);
await K('right', { dur: 0.2, connected: true, pose: 'open', to: [0.25, 1.2, -0.3] }); await settle(); await wait(1.2);
const flameAt = () => page.evaluate(() => { const p = window.__game.hands.right.flamePos; return p && [p.x, p.y, p.z]; });
const fa = await flameAt();
await K('right', { to: [0.05, 1.35, -0.4], dur: 0.6 }); await settle(); await wait(0.3);
const fb = await flameAt(), moved = fa && fb ? Math.hypot(fb[0] - fa[0], fb[1] - fa[1], fb[2] - fa[2]) : 0;
s = await state();
check(moved > 0.2 && s.right !== 'empty', 'right hand alone after tracking loss: its flame follows the hand', `flame moved ${moved.toFixed(2)} m for a 0.32 m hand move, right ${s.right}`);
await K('left', { dur: 0.2, connected: true, pose: 'open', to: [-0.25, 1.2, -0.3] }); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.4 }); await settle(); await wait(1);
L = await since(n); n += L.length;

// 9. controllers: grip to hold, swing, let go; A button switches style
await page.evaluate(() => { window.__xr.primaryInputMode = 'controller'; });
await wait(1);
L = await since(n); n += L.length;
check(!L.some(l => l.startsWith('THROW')), 'switching from hands to controllers throws nothing', L.filter(l => l.startsWith('THROW')).join(' / '));
info('controllers start at', JSON.stringify([await handPos('left'), await handPos('right')].map(p => p.map(x => +x.toFixed(2)))));
await K('left', { to: [-0.25, 1.2, -0.3], dur: 1.5 }); await K('right', { to: [0.25, 1.2, -0.3], dur: 1.5 }); await settle(); await wait(1);
L = await since(n); n += L.length;
check(!L.some(l => l.startsWith('THROW')), 'moving the controllers slowly into place throws nothing', L.filter(l => l.startsWith('THROW')).join(' / '));
await K('right', { dur: 0.1, buttons: { 'a-button': 1 } }); await K('right', { dur: 0.3, buttons: { 'a-button': 0 } }); await settle();
s = await state();
check(s.style === 'A', 'controllers: the A button switches style', s.style);
await K('right', { to: wind, dur: 0.7 }); await K('right', { dur: 0.3, buttons: { squeeze: 1 } });
await K('right', { to: front, dur: 0.1, linear: true }); await K('right', { to: after, dur: 0.12, linear: true, buttons: { squeeze: 0 } });
await K('right', { to: [0.25, 1.2, -0.3], dur: 0.6 }); await settle(); await wait(1.5);
L = await since(n); n += L.length;
check(L.some(l => l.startsWith('THROW A right open')), 'controllers: grip, swing, release throws', L.filter(l => l.startsWith('THROW')).join(' / ') || L.join(' / '));

}

async function scenarioV06() {
  const W = () => page.evaluate(() => window.__game.world.bowls.map(b => ({ id: b.id, pos: [b.pos.x, b.pos.y, b.pos.z], r: b.r, near: b.near, d: b.d })));
  const bowls = await W();
  const hand = side => page.evaluate(s => { const h = window.__game.hands[s]; return { state: h.state, target: h.target && h.target.id, src: h.src && h.src.id }; }, side);
  const yawQ = (yaw, pitch) => { const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2); return [cy * sp, sy * cp, -sy * sp, cy * cp]; };
  const setQ = (side, q) => page.evaluate(([s, q]) => { const i = window.__xr.primaryInputMode === 'hand' ? window.__xr.hands[s] : window.__xr.controllers[s]; i.quaternion.set(...q); }, [side, q]);
  const shoulder = side => [(side === 'left' ? -0.17 : 0.17), 1.4, 0.05];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul3 = (a, k) => a.map(x => x * k);
  const nrm3 = a => mul3(a, 1 / Math.hypot(...a));
  // where to put the input so its palm lands at p (the emulator positions the wrist/grip, not the palm)
  const palmTo = async (side, p, dur, pose) => {
    const r = await read(side), hp = await handPos(side), off = r ? sub3(r.palm, hp) : [0, 0, 0];
    await K(side, Object.assign({ to: sub3(p, off), dur }, pose ? { pose } : {})); await settle();
  };
  // turn the hand until its pointing fingers aim at a point (corrects for the emulated hand's own angles)
  const aimFingers = async (side, at) => {
    let yaw = 0, pitch = 0, err = 99;
    for (let i = 0; i < 4; i++) {
      await setQ(side, yawQ(yaw, pitch)); await wait(0.15);
      const r = await read(side); if (!r || !r.point) return { ok: false, err, r };
      const want = nrm3(sub3(at, r.pointFrom ? [r.pointFrom.x, r.pointFrom.y, r.pointFrom.z] : r.palm)), got = r.pointDir;
      err = Math.acos(Math.max(-1, Math.min(1, want[0] * got[0] + want[1] * got[1] + want[2] * got[2]))) * 180 / Math.PI;
      yaw += Math.atan2(-want[0], -want[2]) - Math.atan2(-got[0], -got[2]);
      pitch += Math.asin(want[1]) - Math.asin(got[1]);
    }
    return { ok: err < 4, err };
  };

  // 1. arrive: hands in front, open, nothing in them
  await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.3, pose: 'open' }); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.3, pose: 'open' });
  await settle(); await wait(1.2);
  let s = await state(), n = (await log()).length, L;
  check(s.left === 'empty' && s.right === 'empty', 'no flame appears on its own', `left ${s.left}, right ${s.right}`);
  if (s.style !== 'A') await page.evaluate(() => {});   // fresh browser: starts in A
  check(s.style === 'A', 'starts in style A', s.style);
  await shot('v06-01-arrive');

  // 2. which emulated poses read as pointing (style B's trigger)
  const table = [];
  for (const p of ['open', 'relaxed', 'point', 'peace', 'finger-gun', 'fist', 'cup']) {
    if (!(await page.evaluate(p => window.__xr.hands.right.poseIds.includes(p), p))) continue;
    await K('right', { dur: 0.25, pose: p }); await settle();
    const r = await read('right');
    table.push(`${p}: ${r.gesture}${r.point ? (r.two ? ' (two fingers)' : ' (one finger)') : ''}, tips ${r.tips.map(x => x.toFixed(3)).join('/')}`);
    if (p === 'peace') check(r.point && r.two, 'emulated two-finger pose reads as a two-finger point', `${r.gesture}, tips ${r.tips.map(x => x.toFixed(3)).join('/')}`);
    if (p === 'open' || p === 'fist') check(!r.point, `emulated ${p} hand is not pointing`, r.gesture);
  }
  await K('right', { dur: 0.25, pose: 'open' }); await settle();
  info('pose -> gesture as the game reads it (tips: index/middle/ring/pinky to palm, m)', table.join(' | '));

  // 3. reach into the right near bowl, then flick the flame away
  const nb = bowls.find(b => b.near && b.pos[0] > 0);
  await palmTo('right', add3(nb.pos, [0, 0.25, 0.1]), 0.7, 'open'); await palmTo('right', add3(nb.pos, [0, 0.03, 0]), 0.5);
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.6 }); await settle(); await wait(0.3);
  L = await since(n); n += L.length;
  check(L.some(l => l === 'TAKE right reach'), 'reaching into a near bowl takes a flame', L.join(' / '));
  const flick = async side => {
    const x = side === 'left' ? -0.25 : 0.25;
    await K(side, { to: [x, 1.55, 0.1], dur: 0.7, pose: 'open' }); await K(side, { dur: 0.3 });
    await K(side, { to: [x, 1.45, -0.35], dur: 0.1, linear: true }); await K(side, { to: [x, 1.43, -0.4], dur: 0.15, linear: true });
    await K(side, { to: [x, 1.2, -0.3], dur: 0.6 }); await settle(); await wait(0.8);
  };
  await flick('right');
  L = await since(n); n += L.length;
  check(L.some(l => l.startsWith('THROW right flick')), 'the taken flame throws with the flick', L.join(' / '));

  // 4. style A: open hand reaching toward the 4.5 m fire, close, yank back
  const fb = bowls.find(b => !b.near && Math.abs(b.d - 4.5) < 0.1), sh = shoulder('right'), dir = nrm3(sub3(fb.pos, sh));
  await palmTo('right', add3(sh, mul3(dir, 0.5)), 0.8, 'open'); await wait(0.4);
  let h = await hand('right');
  check(h.target === fb.id, 'A: reaching an open hand toward a far fire makes it glow', JSON.stringify(h));
  await K('right', { dur: 0.3, pose: 'fist' }); await settle(); await wait(0.2);
  h = await hand('right');
  check(h.state === 'locked', 'A: closing the hand grabs it', JSON.stringify(h));
  await look(-50, 0); await wait(0.3); await shot('v06-02-A-locked'); await look(0, 0);
  const back = add3(sh, add3(mul3(dir, 0.12), [0, -0.08, 0]));
  await palmTo('right', back, 0.2, 'fist'); await wait(1);
  L = await since(n); n += L.length;
  check(L.some(l => l.startsWith('PULL A right')) && L.some(l => l === 'TAKE right pull A'), 'A: yanking the fist back pulls the flame over', L.join(' / '));
  await K('right', { dur: 0.3, pose: 'open' }); await settle(); await flick('right');
  L = await since(n); n += L.length;

  // 5. switch to B with the wrist button
  await K('left', { to: [-0.15, 1.25, -0.3], dur: 0.4, pose: 'open' }); await K('right', { dur: 0.3, pose: 'point' }); await settle(); await wait(0.2);
  const Lb = await read('left'), Rp = await read('right'), rh = await handPos('right');
  const off = [0, 1, 2].map(i => Rp.tip[i] - rh[i]), aimB = d => [0, 1, 2].map(i => Lb.btn[i] - off[i] + d[i]);
  await K('right', { to: aimB([0.06, 0.04, 0.06]), dur: 0.5 }); await K('right', { to: aimB([0, 0, 0]), dur: 0.3 }); await K('right', { dur: 0.2 });
  await K('right', { to: aimB([0.08, 0.06, 0.08]), dur: 0.3 }); await settle();
  s = await state();
  check(s.style === 'B', 'wrist button switches to B', s.style);
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5, pose: 'open' }); await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.5 }); await settle(); await wait(0.5);
  L = await since(n); n += L.length;
  check(!L.some(l => l.startsWith('LOCK') || l.startsWith('TAKE')), 'pointing at the wrist button takes nothing', L.join(' / '));

  // 6. style B: point two fingers at the 4.5 m fire, then draw the hand back
  await palmTo('right', add3(sh, mul3(dir, 0.45)), 0.8, 'peace');
  const aimed = await aimFingers('right', fb.pos);
  info('B: fingers aimed at the fire', `error ${aimed.err.toFixed(1)} degrees after correcting for the emulated hand`);
  await wait(0.4);
  h = await hand('right');
  check(h.state === 'locked' && h.src === fb.id, 'B: pointing two fingers at a far fire locks it', JSON.stringify(h));
  await look(-50, 0); await wait(0.2); await shot('v06-03-B-locked'); await look(0, 0);
  await palmTo('right', add3(sh, add3(mul3(dir, 0.08), [0, -0.08, 0])), 0.2); await wait(1);
  L = await since(n); n += L.length;
  check(L.some(l => l.startsWith('PULL B right')) && L.some(l => l === 'TAKE right pull B'), 'B: drawing the hand back pulls the flame over', L.join(' / '));
  await setQ('right', [0, 0, 0, 1]); await K('right', { dur: 0.3, pose: 'open' }); await settle(); await flick('right');
  L = await since(n); n += L.length;

  // 7. B: point, then stop pointing: lets go
  await palmTo('right', add3(sh, mul3(dir, 0.45)), 0.8, 'peace'); await aimFingers('right', fb.pos); await wait(0.4);
  await K('right', { dur: 0.5, pose: 'open' }); await settle();
  L = await since(n); n += L.length;
  check(L.some(l => l.startsWith('UNLOCK right')) && (await hand('right')).state === 'empty', 'B: stopping pointing lets go, nothing is pulled', L.join(' / '));
  await setQ('right', [0, 0, 0, 1]); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5 }); await settle();

  // 8. controllers, style A: aim the controller at the fire, grip, pull back
  await page.evaluate(() => { window.__xr.primaryInputMode = 'controller'; }); await wait(1);
  await K('right', { dur: 0.1, buttons: { 'a-button': 1 } }); await K('right', { dur: 0.3, buttons: { 'a-button': 0 } }); await settle();
  check((await state()).style === 'A', 'controllers: the A button switches style', (await state()).style);
  const cOut = add3(sh, mul3(dir, 0.5));
  await K('right', { to: cOut, dur: 1.2 }); await settle();
  await setQ('right', yawQ(Math.atan2(-(fb.pos[0] - cOut[0]), -(fb.pos[2] - cOut[2])), Math.asin(nrm3(sub3(fb.pos, cOut))[1]))); await wait(0.3);
  await K('right', { dur: 0.3, buttons: { squeeze: 1 } }); await settle(); await wait(0.2);
  await K('right', { to: add3(sh, mul3(dir, 0.12)), dur: 0.2, linear: true }); await settle(); await wait(1);
  L = await since(n); n += L.length;
  check(L.some(l => l === 'TAKE right pull A'), 'controllers: aim, grip, pull back fetches the flame', L.join(' / '));
  await K('right', { dur: 0.2, buttons: { squeeze: 0 } }); await settle();
}

async function scenarioV07() {
  const bowls = await page.evaluate(() => window.__game.world.bowls.map(b => ({ id: b.id, pos: [b.pos.x, b.pos.y, b.pos.z], r: b.r, near: b.near, d: b.d })));
  const dummies = await page.evaluate(() => window.__game.world.dummies.map(d => [d.center.x, d.center.y, d.center.z]));
  const hand = side => page.evaluate(s => { const h = window.__game.hands[s]; return { state: h.state, fuel: +h.fuel.toFixed(2), target: h.target && h.target.id }; }, side);
  const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qAxis = (ax, ang) => [ax[0] * Math.sin(ang / 2), ax[1] * Math.sin(ang / 2), ax[2] * Math.sin(ang / 2), Math.cos(ang / 2)];
  const setQ = (side, q) => page.evaluate(([s, q]) => { const i = window.__xr.primaryInputMode === 'hand' ? window.__xr.hands[s] : window.__xr.controllers[s]; i.quaternion.set(...q); }, [side, q]);
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul3 = (a, k) => a.map(x => x * k);
  const nrm3 = a => mul3(a, 1 / Math.hypot(...a));
  const palmTo = async (side, p, dur, pose) => {
    const r = await read(side), hp = await handPos(side), off = r ? sub3(r.palm, hp) : [0, 0, 0];
    await K(side, Object.assign({ to: sub3(p, off), dur }, pose ? { pose } : {})); await settle();
  };
  // turn the hand so its palm faces a direction: find the pitch that turns the palm forward, then yaw toward the target
  const turn = async (side, q, dur = 0.4) => { await K(side, { q, dur }); await settle(); };
  const facePalm = async (side, dir) => {
    let best = null;
    for (let deg = -150; deg <= 150; deg += 15) {
      const q = qAxis([1, 0, 0], deg * Math.PI / 180); await setQ(side, q); await wait(0.06);
      const r = await read(side); const c = -r.normal[2];
      if (!best || c > best.c) best = { q, c, n: r.normal };
    }
    const yaw = Math.atan2(-dir[0], -dir[2]) - Math.atan2(-best.n[0], -best.n[2]);
    const q = qMul(qAxis([0, 1, 0], yaw), best.q); await setQ(side, q); await wait(0.1);
    const r = await read(side);
    return { q, normal: r.normal, err: Math.acos(Math.max(-1, Math.min(1, r.normal[0] * dir[0] + r.normal[1] * dir[1] + r.normal[2] * dir[2]))) * 180 / Math.PI };
  };
  const sh = [0.17, 1.4, 0.05];
  const nb = bowls.find(b => b.near && b.pos[0] > 0);
  const takeNear = async () => { await setQ('right', [0, 0, 0, 1]); await palmTo('right', add3(nb.pos, [0, 0.25, 0.1]), 0.6, 'open'); await palmTo('right', add3(nb.pos, [0, 0.03, 0]), 0.5); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.6 }); await settle(); };

  // 1. arrive
  await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.3, pose: 'open' }); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.3, pose: 'open' });
  await settle(); await wait(1);
  let n = (await log()).length, L;
  const R0 = await read('right');
  info('emulated relaxed hand', `palm normal ${R0.normal}, so "palm forward" is ${(-R0.normal[2]).toFixed(2)} (start needs 0.6, keep needs 0.45)`);

  // work out the hand turns first, while the hand is empty (snapping the emulated hand would read as a flick)
  const dm = dummies[0], dir = nrm3(sub3(dm, sh));
  await palmTo('right', add3(sh, mul3(dir, 0.5)), 0.7);
  const fp = await facePalm('right', dir), fpFwd = await facePalm('right', [0, 0, -1]);
  info('palm turned toward the dummy', `${fp.err.toFixed(1)} degrees off; straight ahead ${fpFwd.err.toFixed(1)} degrees off`);
  await setQ('right', [0, 0, 0, 1]); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5 }); await settle(); await wait(0.3);
  n = (await log()).length;

  // 2. take, then pour at the nearest dummy: arm out toward it, palm turned to face it
  await takeNear();
  L = await since(n); n += L.length;
  check(L.includes('TAKE right reach'), 'reaching into a near bowl takes a flame', L.join(' / '));
  await palmTo('right', add3(sh, mul3(dir, 0.5)), 0.7);
  await wait(0.4);
  check(!(await since(n)).some(l => l.startsWith('JET')), 'arm out with the palm still down does not pour');
  await turn('right', fp.q);
  await wait(0.4); await look(-15, 0); await wait(0.2); await shot('v07-01-jet'); await look(0, 0);
  await wait(2.5);
  L = await since(n); n += L.length;
  check(L.includes('JET right'), 'holding a flame, arm out, palm turned forward: the jet starts', L.join(' / '));
  check(L.some(l => l.startsWith('ignite dummy')), 'the jet sets the straw dummy alight', L.join(' / '));
  check(L.some(l => /^JETSTOP right .* out$/.test(l)) && (await hand('right')).state === 'empty', 'pouring until the flame is used up empties the hand', L.filter(l => l.startsWith('JET')).join(' / '));

  // 3. take again, pour briefly, turn the palm back down: stops, rest stays; then flick it
  await takeNear();
  await palmTo('right', add3(sh, mul3(dir, 0.5)), 0.7); await turn('right', fp.q); await wait(0.9);
  await turn('right', [0, 0, 0, 1]); await wait(0.4);
  L = await since(n); n += L.length;
  let h = await hand('right');
  check(L.some(l => /^JETSTOP right [\d.]+ s$/.test(l)) && h.state === 'ready' && h.fuel > 1, 'turning the palm back down stops the jet and keeps the rest of the flame', `${L.filter(l => l.startsWith('JET')).join(' / ')}; ${JSON.stringify(h)}`);
  await K('right', { to: [0.25, 1.55, 0.1], dur: 0.7 }); await K('right', { dur: 0.3 });
  await K('right', { to: [0.25, 1.45, -0.35], dur: 0.1, linear: true }); await K('right', { to: [0.25, 1.43, -0.4], dur: 0.15, linear: true });
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.6 }); await settle(); await wait(0.5);
  L = await since(n); n += L.length;
  check(L.some(l => l.startsWith('THROW right flick')) && !L.some(l => l.startsWith('JET')), 'the rest of the flame can still be flicked', L.join(' / '));

  // 4. overhand wind-up with the palm forward beside the head: no jet
  await takeNear();
  const WIND = [0.28, 1.62, 0.08];
  await palmTo('right', WIND, 0.6); await turn('right', fpFwd.q); await wait(0.8);
  L = await since(n); n += L.length;
  check(!L.some(l => l.startsWith('JET')), 'palm forward beside the head (an overhand wind-up) does not pour', L.join(' / '));
  await turn('right', [0, 0, 0, 1]); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5 }); await settle();

  // 5. grab and yank from the 4.5 m fire, then pour the pulled flame
  const fb = bowls.find(b => !b.near && Math.abs(b.d - 4.5) < 0.1), fdir = nrm3(sub3(fb.pos, sh));
  await palmTo('right', add3(sh, mul3(fdir, 0.5)), 0.4);   // still holding the flame from step 4: pour it out first
  await turn('right', fpFwd.q); await wait(3.4); await turn('right', [0, 0, 0, 1]);
  await palmTo('right', add3(sh, mul3(fdir, 0.5)), 0.6, 'open'); await wait(0.4);
  await K('right', { dur: 0.3, pose: 'fist' }); await settle(); await wait(0.2);
  await palmTo('right', add3(sh, add3(mul3(fdir, 0.12), [0, -0.08, 0])), 0.2, 'fist'); await wait(1);
  L = await since(n); n += L.length;
  check(L.includes('TAKE right pull'), 'grab and yank still pulls from a far fire', L.join(' / '));

  // 6. controllers: hold the trigger to pour
  await K('right', { dur: 0.2, pose: 'open' }); await settle();
  await page.evaluate(() => { window.__xr.primaryInputMode = 'controller'; }); await wait(1);
  await K('right', { to: [0.55, 1.0, -0.55], dur: 1.2 }); await K('right', { to: [0.2, 1.3, -0.45], dur: 0.8 }); await settle(); await wait(0.3);
  await K('right', { dur: 0.8, buttons: { trigger: 1 } }); await K('right', { dur: 0.4, buttons: { trigger: 0 } }); await settle();
  L = await since(n); n += L.length;
  check(L.includes('JET right') && L.some(l => l.startsWith('JETSTOP right')), 'controllers: trigger pours, letting go stops', L.join(' / '));
}

await ({ v05: scenarioV05, v06: scenarioV06, v07: scenarioV07 })[VER]();
const s = await state();
info('sign score', JSON.stringify(s.stats));
check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
await browser.close(); server.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ version: VER, results, log: await Promise.resolve(null) }, null, 2));
const fails = results.filter(r => r.ok === false).length;
console.log(`\n${results.filter(r => r.ok).length} passed, ${fails} failed · screenshots in ${OUT}`);
process.exit(fails ? 1 : 0);
