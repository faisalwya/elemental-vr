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
  const nearDummy = dummies.filter(d => Math.hypot(d[0], d[2]) < 6).sort((a, b) => Math.abs(Math.atan2(a[0], -a[2])) - Math.abs(Math.atan2(b[0], -b[2])))[0];
  const dm = nearDummy || await page.evaluate(() => { const t = window.__game.world.targets().mid; return [t.x, t.y, t.z]; }), dir = nrm3(sub3(dm, sh));
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
  if (nearDummy) check(L.some(l => l.startsWith('ignite dummy')), 'the jet sets the straw dummy alight', L.join(' / '));
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

  // 3b. (v09 on) a quick push from in front of the chest, palm forward: pours at once, no throw
  if (VER >= 'v09') {
    await takeNear();
    await palmTo('right', add3(sh, [0, -0.1, -0.25]), 0.6); await turn('right', fpFwd.q); await wait(0.5);
    L = await since(n); n += L.length;
    check(!L.some(l => l.startsWith('JET')), 'palm forward at the chest (arm not out) does not pour yet', L.join(' / '));
    await palmTo('right', add3(sh, [0, -0.05, -0.55]), 0.12); await wait(0.6);
    L = await since(n); n += L.length;
    check(L.includes('JET right push') && !L.some(l => l.startsWith('THROW')), 'a quick push out, palm forward, pours at once and does not throw', L.join(' / '));
    await turn('right', [0, 0, 0, 1]); await wait(0.3); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5 }); await settle(); await wait(0.5);
    L = await since(n); n += L.length;
  }

  // 4. overhand wind-up with the palm forward beside the head: no jet
  await takeNear();
  const WIND = [0.28, 1.62, 0.08];
  await palmTo('right', WIND, 0.6); await turn('right', fpFwd.q); await wait(0.8);
  L = await since(n); n += L.length;
  check(!L.some(l => l.startsWith('JET')), 'palm forward beside the head (an overhand wind-up) does not pour', L.join(' / '));
  await turn('right', [0, 0, 0, 1]); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5 }); await settle();

  // 5. grab and yank from the 4.5 m fire, then pour the pulled flame
  const fb = bowls.find(b => !b.near && Math.abs(b.d - 4.5) < 0.1), fdir = nrm3(sub3(fb.pos, sh));
  await palmTo('right', add3(sh, [0, -0.05, -0.5]), 0.6);   // still holding the flame from step 4: pour it out straight ahead first
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

async function scenarioV08() {
  await scenarioV07();
  await propsCheck();
}
async function propsCheck() {
  // each thing that reacts to fire, hit directly by a throw (or a jet) aimed with the game's own ballistics
  await page.evaluate(() => { window.__xr.primaryInputMode = 'hand'; });
  const st = () => page.evaluate(() => window.__game.world.status());
  const throwAt = (name, S = 9) => page.evaluate(async ([name, S]) => {
    const { aimDir } = await import('./src/demo.js');
    const T = window.__game.world.targets()[name], st = window.__game.world.stations;
    let from = { x: 0.15, y: 1.55, z: -0.3 };
    if (st) { const S0 = st.slice().sort((a, b) => Math.hypot(a.O[0] - T.x, a.O[1] - T.z) - Math.hypot(b.O[0] - T.x, b.O[1] - T.z))[0]; from = { x: S0.O[0] + S0.F[0] * 0.3, y: 1.55, z: S0.O[1] + S0.F[1] * 0.3 }; }
    const d = aimDir(from, T, S);
    window.__game.world.addShot(from, { x: d.x * S, y: d.y * S, z: d.z * S }, 'ball');
  }, [name, S]);
  const pour = (name, secs) => page.evaluate(async ([name, secs]) => {
    const T = window.__game.world.targets()[name], st = window.__game.world.stations;
    let from = { x: 0.6, y: 1.0, z: -0.3 };
    if (st) { const S0 = st.slice().sort((a, b) => Math.hypot(a.O[0] - T.x, a.O[1] - T.z) - Math.hypot(b.O[0] - T.x, b.O[1] - T.z))[0]; from = { x: S0.O[0] + S0.F[0] * 0.3, y: 1.0, z: S0.O[1] + S0.F[1] * 0.3 }; }
    const d = { x: T.x - from.x, y: T.y - from.y, z: T.z - from.z }, l = Math.hypot(d.x, d.y, d.z);
    for (let i = 0; i < secs * 45; i++) setTimeout(() => window.__game.world.addShot(from, { x: d.x / l * 9, y: d.y / l * 9 + 0.6, z: d.z / l * 9 }, 'jet'), i * 22);
  }, [name, secs]);
  let n = (await log()).length, L, S0 = await st();
  info('props before', JSON.stringify(S0));
  await throwAt('hay', 8); await wait(2);
  check((await st()).hay.includes('b'), 'hay: one throw sets a bale alight', (await st()).hay);
  await wait(3);
  check(((await st()).hay.match(/b|c/g) || []).length >= 3, 'hay: fire spreads to the neighbouring bales', (await st()).hay);
  await throwAt('lantern', 8); await wait(2);
  check(/r|g/.test((await st()).lanterns), 'lanterns: a hit lantern lights up and floats away', (await st()).lanterns);
  await throwAt('rope', 11); await wait(3.5);
  check(/^(fall|down)/.test((await st()).bell), 'bell: burning the rope drops the bell', (await st()).bell);
  await throwAt('fuse', 6); await wait(1);
  check(!(await st()).fuse.startsWith('0/'), 'fuse: a throw landing on it lights it', (await st()).fuse);
  await wait(9);
  L = await since(n);
  check(L.filter(l => l === 'boom').length >= 1, 'fuse: it burns to the fireworks', `${(await st()).fuse}, rockets ${(await st()).rockets}`);
  await throwAt('barrel', 8); await wait(2.5);
  L = await since(n);
  check(L.includes('explode'), 'barrel: a throw makes it hiss and burst', (await st()).barrels);
  const lit = () => st().then(x => (x.grass.match(/[12]/g) || []).length);
  for (let i = 0; i < 40 && (await lit()) > 0; i++) await wait(1);   // let any earlier fire burn out and regrow
  const g0 = await lit();
  await throwAt('grass', 6); await wait(1.2);
  const g1 = await lit(); await wait(2);
  const g2 = await lit();
  check(g0 === 0 && g1 > 0 && g2 > g1, 'grass: a throw lights it and the fire spreads', `${g0}, then ${g1}, then ${g2} of 30 cells`);
  if ((await st()).ice !== 'free') { await pour('ice', 3); await wait(4); }
  check((await st()).ice === 'free', 'ice: the jet melts it and frees the flame', String((await st()).ice));
  const src = await page.evaluate(() => window.__game.world.sources().some(s => s.id === 300));
  check(src, 'ice: the freed flame is a fire you can pull from');
  if (VER < 'v10') { await look(-30, -15); await wait(0.3); await shot('v08-props'); }
  info('props after', JSON.stringify(await st()));
}


async function scenarioV10() {
  await scenarioV07();   // the hand and jet checks, at the practice range
  await page.evaluate(() => { window.__xr.primaryInputMode = 'hand'; });
  await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.6, pose: 'open' }); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.6, pose: 'open' }); await settle(); await wait(1);
  const station = () => page.evaluate(() => window.__game.station());
  check((await station()) === 0, 'starts at the practice range', String(await station()));
  // the wrist device: shown on the back of the left wrist; poke "next" with the right index finger
  await K('left', { to: [-0.15, 1.25, -0.3], dur: 0.4 }); await K('right', { dur: 0.3, pose: 'point' }); await settle(); await wait(0.3);
  const hidden = () => page.evaluate(() => Object.keys(window.__game.device()).length === 0);
  await look(26, -46); await wait(0.6);   // look at the wrist: still hidden until you tap it
  check(await hidden(), 'the wrist device stays hidden, even while you look at your wrist, until you tap it');
  const Rp = await read('right'), rh = await handPos('right');
  const off = [0, 1, 2].map(i => Rp.tip[i] - rh[i]), to = (c, d) => [c.x - off[0] + d[0], c.y - off[1] + d[1], c.z - off[2] + d[2]];
  const wake = await page.evaluate(() => window.__game.wake());
  await K('right', { to: to(wake, [0.05, 0.08, 0.06]), dur: 0.5 }); await K('right', { to: to(wake, [0, 0.01, 0]), dur: 0.25 }); await K('right', { to: to(wake, [0.04, 0.09, 0.06]), dur: 0.25 }); await settle(); await wait(0.1);
  check(!(await hidden()), 'tapping the back of the left wrist brings the device up');
  await wait(4.5);
  check(await hidden() && (await station()) === 0, 'left alone it hides after about 4 seconds, without travelling');
  await K('right', { to: to(wake, [0.05, 0.08, 0.06]), dur: 0.3 }); await K('right', { to: to(wake, [0, 0.01, 0]), dur: 0.25 }); await K('right', { to: to(wake, [0.04, 0.09, 0.06]), dur: 0.25 }); await settle(); await wait(0.1);
  const dev = await page.evaluate(() => window.__game.device());
  check(!!dev.next && !!dev.back, 'the wrist device is showing, with back and next buttons', JSON.stringify(dev));
  info('device buttons', `back ${['x', 'y', 'z'].map(k => dev.back[k].toFixed(3))}, next ${['x', 'y', 'z'].map(k => dev.next[k].toFixed(3))}, ${(Math.hypot(dev.next.x - dev.back.x, dev.next.y - dev.back.y, dev.next.z - dev.back.z) * 100).toFixed(1)} cm apart`);
  await shot('v10-01-device');
  let n = (await log()).length, L;
  await K('right', { to: to(dev.next, [0.04, 0.05, 0.05]), dur: 0.5 }); await K('right', { to: to(dev.next, [0, 0, 0]), dur: 0.3 }); await K('right', { dur: 0.2 });
  await K('right', { to: to(dev.next, [0.05, 0.07, 0.07]), dur: 0.3 }); await settle(); await wait(0.8);
  await look(0, 0); await wait(0.2);
  L = await since(n); n += L.length;
  check((await station()) === 1 && L.filter(l => l.startsWith('STATION')).length === 1, 'poking "next" once travels once, to the burn yard', `${L.join(' / ')}; station ${await station()}`);
  check(await hidden(), 'after travelling the device hides again');
  const head = await page.evaluate(() => window.__game.head()), S1 = await page.evaluate(() => window.__game.world.stations[1]);
  check(Math.hypot(head.x - S1.O[0], head.z - S1.O[1]) < 0.4, 'you arrive standing on the burn yard station', `head at ${head.x.toFixed(2)}, ${head.z.toFixed(2)}; station at ${S1.O}`);
  const fwd = await page.evaluate(() => { const v = new (window.__game.renderer.xr.getCamera().position.constructor)(); window.__game.renderer.xr.getCamera().getWorldDirection(v); return [v.x, v.z]; });
  const cosF = (fwd[0] * S1.F[0] + fwd[1] * S1.F[1]) / Math.hypot(fwd[0], fwd[1]);
  check(cosF > 0.95, 'and facing its things', `facing ${fwd.map(x => x.toFixed(2))}, station faces ${S1.F}`);
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5, pose: 'open' }); await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.5 }); await settle(); await wait(0.5);
  await shot('v10-02-burn-yard');
  // walk half a metre in the room: the world stays put around you (no drift)
  const h0 = await page.evaluate(() => window.__game.head());
  await page.evaluate(() => { window.__xr.position.x += 0.5; }); await wait(0.3);
  const h1 = await page.evaluate(() => window.__game.head());
  check(Math.abs(Math.hypot(h1.x - h0.x, h1.z - h0.z) - 0.5) < 0.05, 'walking in the room moves you the same distance in the courtyard', `${Math.hypot(h1.x - h0.x, h1.z - h0.z).toFixed(2)} m for 0.5 m`);
  // the sky dome travels with you, so it is never cut off by the far limit (v10 first build: a patch following your gaze)
  const sky = await page.evaluate(() => { const g = window.__game, h = g.head(), far = g.renderer.xr.getCamera().far; let r = 0; g.scenery && g.renderer && (r = 90); return { far, h }; });
  check(sky.far >= 200, 'the headset draws far enough for the whole sky', `far ${sky.far}`);
  await page.evaluate(() => { window.__xr.position.x -= 0.5; }); await wait(0.2);
  // controllers: A goes on, B goes back
  await page.evaluate(() => { window.__xr.primaryInputMode = 'controller'; }); await wait(0.8);
  await K('right', { dur: 0.1, buttons: { 'a-button': 1 } }); await K('right', { dur: 0.6, buttons: { 'a-button': 0 } }); await settle();
  check((await station()) === 2, 'controllers: A goes to the next station (machine corner)', String(await station()));
  await shot('v10-03-machines');
  await K('right', { dur: 0.1, buttons: { 'b-button': 1 } }); await K('right', { dur: 0.6, buttons: { 'b-button': 0 } }); await settle();
  check((await station()) === 1, 'controllers: B goes back', String(await station()));
  for (let i = 0; i < 2; i++) { await K('right', { dur: 0.1, buttons: { 'a-button': 1 } }); await K('right', { dur: 0.6, buttons: { 'a-button': 0 } }); await settle(); }
  check((await station()) === 3, 'and on to the frozen corner', String(await station()));
  await shot('v10-04-frozen');
  await K('right', { dur: 0.1, buttons: { 'a-button': 1 } }); await K('right', { dur: 0.6, buttons: { 'a-button': 0 } }); await settle();
  check((await station()) === 0, 'next from the last station wraps round to the practice range', String(await station()));
  await page.evaluate(() => { window.__xr.primaryInputMode = 'hand'; }); await wait(0.5);
  await propsCheck();
}


async function scenarioV11() {
  await scenarioV10();
  // v11 lock-on: switch aim with the device's A/B button, then check the headset's own ray picks a fire the arm line would not
  await page.evaluate(() => { window.__xr.primaryInputMode = 'hand'; window.__game.travel(0); }); await wait(1);
  await K('left', { to: [-0.15, 1.25, -0.3], dur: 0.5, pose: 'open' }); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5, pose: 'point' }); await settle(); await wait(0.5);
  const st = await page.evaluate(() => window.__game.station());
  const Rp = await read('right'), rh = await handPos('right');
  const off = [0, 1, 2].map(i => Rp.tip[i] - rh[i]), to = (c, d) => [c.x - off[0] + d[0], c.y - off[1] + d[1], c.z - off[2] + d[2]];
  const wake = await page.evaluate(() => window.__game.wake());
  await K('right', { to: to(wake, [0.05, 0.08, 0.06]), dur: 0.4 }); await K('right', { to: to(wake, [0, 0.01, 0]), dur: 0.25 }); await K('right', { to: to(wake, [0.04, 0.09, 0.06]), dur: 0.25 }); await settle(); await wait(0.1);
  const dev = await page.evaluate(() => window.__game.device());
  const before = await page.evaluate(() => window.__game.aim());
  if (dev.aim) { await K('right', { to: to(dev.aim, [0.03, 0.05, 0.05]), dur: 0.35 }); await K('right', { to: to(dev.aim, [0, 0, 0]), dur: 0.25 }); await K('right', { dur: 0.15 }); await K('right', { to: to(dev.aim, [0.05, 0.08, 0.07]), dur: 0.3 }); await settle(); }
  const after = await page.evaluate(() => window.__game.aim());
  check(st === 0 && before === 'arm' && after === 'ray', 'the device\'s A/B button switches the pull aim to the headset ray', `station ${st}, ${before} -> ${after}, aim button ${dev.aim ? 'shown' : 'missing'}`);
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5, pose: 'open' }); await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.5 }); await settle(); await wait(0.5);
  // the emulated hand's pointing ray: where does it point with the hand held out flat?
  await page.evaluate(() => { const h = window.__game.hands.right; h.state = 'empty'; h.fuel = 0; h.timer = 0; });   // empty-handed (it may have passed through a near bowl)
  await K('right', { to: [0.3, 1.35, -0.45], dur: 0.6, pose: 'open' }); await settle(); await wait(0.4);
  const ray = await page.evaluate(() => { const h = window.__game.hands.right; return { aiming: h.aiming, from: h.aimFrom, dir: h.aimDir, target: h.target && h.target.id, state: h.state, closed: h.closed, head: window.__game.head() }; });
  info('right hand', JSON.stringify({ state: ray.state, closed: ray.closed, aiming: ray.aiming, head: ray.head }));
  info('aim B: the headset ray for an emulated open hand', ray.dir ? `from ${['x', 'y', 'z'].map(k => ray.from[k].toFixed(2))} toward ${['x', 'y', 'z'].map(k => ray.dir[k].toFixed(2))}, selected ${ray.target}` : 'no ray reported');
  check(!!ray.dir && ray.aiming, 'aim B: the headset reports a pointing ray for the tracked hand, and the game aims along it');
  // turn the hand toward the 4.5 m fire: with aim B it is selected and can be pulled
  const fb = await page.evaluate(() => { const b = window.__game.world.bowls.find(b => !b.near && Math.abs(b.d - 4.5) < 0.1); return { id: b.id, pos: [b.pos.x, b.pos.y, b.pos.z] }; });
  let hit = null;
  for (const yawDeg of [-70, -60, -50, -40, -30, -20]) {
    const y = yawDeg * Math.PI / 180;
    await page.evaluate(q => window.__xr.hands.right.quaternion.set(...q), [0, Math.sin(y / 2), 0, Math.cos(y / 2)]); await wait(0.25);
    const r = await page.evaluate(() => { const h = window.__game.hands.right; return { target: h.target && h.target.id, dir: h.aimDir }; });
    if (r.target === fb.id) { hit = yawDeg; break; }
  }
  check(hit !== null, 'aim B: turning the hand toward a fire selects it', hit !== null ? `selected the 4.5 m fire with the hand turned ${hit} degrees` : 'never selected');
  if (hit !== null) {
    await look(-45, -5); await wait(0.2); await shot('v11-aim-beam'); await look(0, 0);
    let n = (await log()).length;
    await K('right', { pose: 'fist', dur: 0.3 }); await settle(); await wait(0.2);
    await K('right', { to: [0.25, 1.28, -0.12], dur: 0.2, linear: true }); await settle(); await wait(1);
    const L = await since(n);
    check(L.some(l => l === 'LOCK right aim ray') && L.includes('TAKE right pull'), 'aim B: close and yank pulls the selected fire', L.join(' / '));
  }
  await page.evaluate(() => { window.__xr.hands.right.quaternion.set(0, 0, 0, 1); window.__game.setAim('arm'); });
}


async function scenarioV12() {
  // the earlier hand and jet checks aim along the arm line; v12 aims with the headset ray, so run them with the arm line
  await page.evaluate(() => { window.__game.FT.aimMode = 'arm'; });
  await scenarioV07();
  await page.evaluate(() => { window.__game.FT.aimMode = 'ray'; window.__xr.primaryInputMode = 'hand'; window.__game.travel(0); }); await wait(1);
  const st = () => page.evaluate(() => window.__game.station());
  const empty = side => page.evaluate(s => { const h = window.__game.hands[s]; h.state = 'empty'; h.fuel = 0; h.timer = 0; }, side);
  await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.5, pose: 'open' }); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5, pose: 'point' }); await settle(); await wait(0.5);
  check((await st()) === 0, 'back at the practice range', String(await st()));
  // the post: poke "yank" with the right index finger, then "debug" on and off
  const Rp = await read('right'), rh = await handPos('right');
  const off = [0, 1, 2].map(i => Rp.tip[i] - rh[i]), to = (c, d) => [c.x - off[0] + d[0], c.y - off[1] + d[1], c.z - off[2] + d[2]];
  const press = async c => { await K('right', { to: to(c, [0.05, 0.12, 0.05]), dur: 0.5 }); await K('right', { to: to(c, [0, 0.01, 0]), dur: 0.3 }); await K('right', { dur: 0.15 }); await K('right', { to: to(c, [0.05, 0.14, 0.06]), dur: 0.3 }); await settle(); };
  const post = Object.fromEntries((await page.evaluate(() => window.__game.post())).map(b => [b.k, b]));
  const y0 = await page.evaluate(() => window.__game.yank());
  await press(post.yank);
  const y1 = await page.evaluate(() => window.__game.yank());
  check(y0 === 'quick' && y1 === 'pull', 'the post\'s yank button switches A (quick) to B (pull back)', `${y0} -> ${y1}`);
  await press(post.debug); const d1 = await page.evaluate(() => window.__game.debug());
  await press(post.debug); const d2 = await page.evaluate(() => window.__game.debug());
  check(d1 === true && d2 === false, 'the debug button turns the beam and numbers on and off', `${d1}, ${d2}`);
  await look(40, -25); await wait(0.3); await shot('v12-01-post'); await look(0, 0);
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.5, pose: 'open' }); await settle();
  // a slow draw back with the headset ray: B (pull back) fetches, A (quick) does not
  const fb = await page.evaluate(() => { const b = window.__game.world.bowls.find(b => !b.near && Math.abs(b.d - 4.5) < 0.1); return { id: b.id }; });
  const aimAt = async () => {
    for (const yawDeg of [-70, -60, -50, -40, 20, 30, 40, 50]) { const y = yawDeg * Math.PI / 180; await page.evaluate(q => window.__xr.hands.right.quaternion.set(...q), [0, Math.sin(y / 2), 0, Math.cos(y / 2)]); await wait(0.25);
      if (await page.evaluate(id => { const h = window.__game.hands.right; return !!(h.target && h.target.id === id); }, fb.id)) return yawDeg; }
    return null;
  };
  const slowDraw = async mode => {
    await page.evaluate(m => window.__game.setYank(m), mode); await empty('right');
    await K('right', { to: [0.3, 1.35, -0.45], dur: 0.5, pose: 'open' }); await settle(); await wait(0.3);
    const yaw = await aimAt();
    if (yaw === null) return { yaw, L: ['never selected'] };
    if (mode === 'pull') { await look(-45, -5); await wait(0.15); await shot('v12-02-selected'); await look(0, 0); }
    const n0 = (await log()).length;
    await K('right', { pose: 'fist', dur: 0.3 }); await settle(); await wait(0.2);
    await K('right', { to: [0.27, 1.3, -0.22], dur: 0.6, linear: true }); await settle(); await wait(0.8);   // 23 cm back over 0.6 s: about 0.4 m/s
    await K('right', { pose: 'open', dur: 0.3 }); await settle(); await wait(0.3);
    await page.evaluate(() => window.__xr.hands.right.quaternion.set(0, 0, 0, 1));
    return { yaw, L: await since(n0) };
  };
  const B = await slowDraw('pull');
  check(B.L.some(l => l.startsWith('LOCK right yank pull')) && B.L.some(l => l.startsWith('PULL right pull')), 'yank B: a slow 23 cm draw back fetches the selected fire (aimed with the headset ray)', B.L.join(' / '));
  const A = await slowDraw('quick');
  check(A.L.some(l => l.startsWith('LOCK right yank quick')) && !A.L.some(l => l.startsWith('PULL')), 'yank A: the same slow draw does not fetch (A needs a quick tug)', A.L.join(' / '));
  // grab and yank in one motion with A
  await empty('right'); await K('right', { to: [0.3, 1.35, -0.45], dur: 0.5, pose: 'open' }); await settle(); await wait(0.3);
  if ((await aimAt()) !== null) {
    const n0 = (await log()).length;
    await K('right', { pose: 'fist', to: [0.27, 1.28, -0.2], dur: 0.15, linear: true }); await settle(); await wait(0.8);
    const L = await since(n0);
    check(L.some(l => l.startsWith('PULL right quick')), 'yank A: grabbing and yanking in one motion fetches it first time', L.join(' / '));
    await K('right', { pose: 'open', dur: 0.2 }); await settle(); await page.evaluate(() => window.__xr.hands.right.quaternion.set(0, 0, 0, 1));
  }
  // travel: stand on the "next" pad behind you to the right for a second
  await empty('right'); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.4, pose: 'open' }); await settle();
  const pads = await page.evaluate(() => window.__game.pads());
  const next = pads.find(P => P.s === 0 && P.to === 1);
  check(!!next, 'each station has a pad to the next station', JSON.stringify(pads.filter(P => P.s === 0)));
  let n = (await log()).length;
  await page.evaluate(([x, z]) => { window.__xr.position.x = x; window.__xr.position.z = z; }, [next.x, next.z]); await wait(0.5);
  check((await st()) === 0, 'stepping onto a pad does not travel straight away (you stand for a second)', String(await st()));
  await wait(1.2);
  let L = await since(n); n += L.length;
  check((await st()) === 1 && L.filter(l => l.startsWith('STATION')).length === 1, 'standing on it for a second travels once, to the burn yard', L.join(' / '));
  const head = await page.evaluate(() => window.__game.head()), S1 = await page.evaluate(() => window.__game.world.stations[1]);
  check(Math.hypot(head.x - S1.O[0], head.z - S1.O[1]) < 0.4, 'you arrive standing on the burn yard station', `head at ${head.x.toFixed(2)}, ${head.z.toFixed(2)}`);
  await wait(1.5);
  check((await st()) === 1, 'and stay there (you arrive in the middle, not on a pad)', String(await st()));
  await shot('v12-03-burn-yard');
  // controllers still travel with A and B
  await page.evaluate(() => { window.__xr.primaryInputMode = 'controller'; }); await wait(0.8);
  await K('right', { dur: 0.1, buttons: { 'a-button': 1 } }); await K('right', { dur: 0.6, buttons: { 'a-button': 0 } }); await settle();
  check((await st()) === 2, 'controllers: A goes on', String(await st()));
  await K('right', { dur: 0.1, buttons: { 'b-button': 1 } }); await K('right', { dur: 0.6, buttons: { 'b-button': 0 } }); await settle();
  check((await st()) === 1, 'controllers: B goes back', String(await st()));
  await page.evaluate(() => { window.__xr.primaryInputMode = 'hand'; }); await wait(0.5);
  await propsCheck();
}


async function scenarioV13() {
  await scenarioV12();
  await page.evaluate(() => { window.__game.FT.aimMode = 'arm'; window.__xr.primaryInputMode = 'hand'; window.__game.travel(0); window.__xr.position.x = 0; window.__xr.position.z = 0; }); await wait(1.2);
  const st = await page.evaluate(() => window.__game.station());
  check(st === 0, 'back at the pull lab', String(st));
  const empty = side => page.evaluate(s => { const h = window.__game.hands[s]; h.state = 'empty'; h.fuel = 0; h.timer = 0; h.target = null; }, side);
  // the post's aim button
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.4, pose: 'point' }); await settle(); await wait(0.3);
  const Rp = await read('right'), rh = await handPos('right');
  const off = [0, 1, 2].map(i => Rp.tip[i] - rh[i]), to = (c, d) => [c.x - off[0] + d[0], c.y - off[1] + d[1], c.z - off[2] + d[2]];
  const post = Object.fromEntries((await page.evaluate(() => window.__game.post())).map(b => [b.k, b]));
  const press = async c => { await K('right', { to: to(c, [0.05, 0.12, 0.05]), dur: 0.5 }); await K('right', { to: to(c, [0, 0.01, 0]), dur: 0.3 }); await K('right', { dur: 0.15 }); await K('right', { to: to(c, [0.05, 0.14, 0.06]), dur: 0.3 }); await settle(); };
  const a0 = await page.evaluate(() => window.__game.aim()); await press(post.aim); const a1 = await page.evaluate(() => window.__game.aim()); await press(post.aim); const a2 = await page.evaluate(() => window.__game.aim());
  check(a0 === 'arm' && a1 === 'ray' && a2 === 'arm', 'the post\'s aim button switches arm line and headset ray', `${a0} -> ${a1} -> ${a2}`);
  // warmer / colder with the arm line: aim 18 degrees off the 5.5 m fire, then straight at it
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.4, pose: 'open' }); await settle(); await empty('right');
  const F = await page.evaluate(() => { const b = window.__game.world.bowls.find(b => !b.near && Math.abs(b.d - 5.5) < 0.1); return { id: b.id, pos: [b.pos.x, b.pos.y, b.pos.z] }; });
  const sh = [0.17, 1.4, 0.05], dirTo = p => { const v = [p[0] - sh[0], p[1] - sh[1], p[2] - sh[2]], l = Math.hypot(...v); return v.map(x => x / l); };
  const rotY = (v, deg) => { const a = deg * Math.PI / 180; return [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)]; };
  const palmAt = async d => { const r = await read('right'), hp = await handPos('right'), o = [r.palm[0] - hp[0], r.palm[1] - hp[1], r.palm[2] - hp[2]]; await K('right', { to: [sh[0] + d[0] * 0.5 - o[0], sh[1] + d[1] * 0.5 - o[1], sh[2] + d[2] * 0.5 - o[2]], dur: 0.6 }); await settle(); await wait(0.4); };
  const state = () => page.evaluate(id => { const h = window.__game.hands.right, w = (h.warm || []).find(w => w.id === id); return { target: h.target && h.target.id, warm: w ? w.k : 0, aiming: h.aiming }; }, F.id);
  await palmAt(rotY(dirTo(F.pos), 24)); const off18 = await state();
  await palmAt(dirTo(F.pos)); const on = await state();
  check(off18.aiming && off18.warm > 0 && off18.target !== F.id, 'aiming 24 degrees off a fire: it is warm (stirs) but not selected', JSON.stringify(off18));
  check(on.target === F.id && on.warm > off18.warm, 'aiming at it: it is selected, and warmer than before', JSON.stringify(on));
  await look(0, -5); await wait(0.2); await shot('v13-01-pull-lab');
}


async function scenarioV14() {
  await scenarioV07();   // hand, pull (arm line, quick yank) and jet checks
  await page.evaluate(() => { window.__xr.primaryInputMode = 'hand'; window.__game.travel(0); window.__xr.position.x = 0; window.__xr.position.z = 0; }); await wait(1.2);
  const st = () => page.evaluate(() => window.__game.station());
  const empty = side => page.evaluate(s => { const h = window.__game.hands[s]; h.state = 'empty'; h.fuel = 0; h.timer = 0; h.target = null; }, side);
  check((await st()) === 0, 'back at the pull lab', String(await st()));
  // the wireframe hands: shown while tracked, fade out when tracking is lost
  await K('left', { to: [-0.25, 1.2, -0.3], dur: 0.4, pose: 'open' }); await K('right', { to: [0.25, 1.2, -0.3], dur: 0.4, pose: 'open' }); await settle(); await wait(0.4);
  const a1 = await page.evaluate(() => window.__game.handAlpha());
  check(a1.every(a => a > 0.9), 'both hands are drawn as a wireframe while tracked', JSON.stringify(a1));
  await look(0, -35); await wait(0.2); await shot('v14-01-hands'); await look(0, 0);
  await K('right', { dur: 0.1, connected: false }); await settle(); await wait(0.15);
  const a2 = await page.evaluate(() => window.__game.handAlpha()); await wait(0.6);
  const a3 = await page.evaluate(() => window.__game.handAlpha());
  check(Math.min(...a2) > 0.05 && Math.min(...a2) < 0.95 && Math.min(...a3) < 0.02, 'a hand that loses tracking fades out over a moment, not instantly', `${JSON.stringify(a2)} then ${JSON.stringify(a3)}`);
  await K('right', { dur: 0.3, connected: true, pose: 'open', to: [0.25, 1.2, -0.3] }); await settle(); await wait(0.5);
  // the post: hold A / B and debug
  await K('right', { pose: 'point', dur: 0.3 }); await settle(); await wait(0.2);
  const Rp = await read('right'), rh = await handPos('right');
  const off = [0, 1, 2].map(i => Rp.tip[i] - rh[i]), to = (c, d) => [c.x - off[0] + d[0], c.y - off[1] + d[1], c.z - off[2] + d[2]];
  const press = async c => { await K('right', { to: to(c, [0.05, 0.12, 0.05]), dur: 0.5 }); await K('right', { to: to(c, [0, 0.01, 0]), dur: 0.3 }); await K('right', { dur: 0.15 }); await K('right', { to: to(c, [0.05, 0.14, 0.06]), dur: 0.3 }); await settle(); };
  const post = Object.fromEntries((await page.evaluate(() => window.__game.post())).map(b => [b.k, b]));
  const h0 = await page.evaluate(() => window.__game.hold()); await press(post.hold); const h1 = await page.evaluate(() => window.__game.hold());
  check(h0 === 'float' && h1 === 'held', 'the post\'s hold button switches A (floating) to B (held)', `${h0} -> ${h1}`);
  await press(post.debug); const d1 = await page.evaluate(() => window.__game.debug()); await press(post.debug); const d2 = await page.evaluate(() => window.__game.debug());
  check(d1 === true && d2 === false, 'the debug button still turns the beam and numbers on and off', `${d1}, ${d2}`);
  // B, held: take a flame; it sits in the palm, and leans as the hand moves
  await K('right', { to: [0.25, 1.2, -0.3], dur: 0.4, pose: 'open' }); await settle(); await empty('right');
  const nb = await page.evaluate(() => { const b = window.__game.world.bowls.find(b => b.near && b.pos.x > 0 && Math.hypot(b.pos.x, b.pos.z) < 1); return [b.pos.x, b.pos.y, b.pos.z]; });
  const palmTo = async (p, dur) => { const r = await read('right'), hp = await handPos('right'), o = [r.palm[0] - hp[0], r.palm[1] - hp[1], r.palm[2] - hp[2]]; await K('right', { to: [p[0] - o[0], p[1] - o[1], p[2] - o[2]], dur }); await settle(); };
  await palmTo([nb[0], nb[1] + 0.25, nb[2] + 0.1], 0.6); await palmTo([nb[0], nb[1] + 0.03, nb[2]], 0.4); await palmTo([0.25, 1.25, -0.35], 0.6); await wait(0.5);
  const sit = await page.evaluate(() => { const h = window.__game.hands.right, r = window.__joints && window.__joints.right; return { state: h.state, flame: h.flamePos }; });
  const rr = await read('right'), dist = sit.flame ? Math.hypot(sit.flame.x - rr.palm[0], sit.flame.y - rr.palm[1], sit.flame.z - rr.palm[2]) : 99;
  check(sit.state === 'ready' && dist < 0.065, 'hold B: the flame sits in the palm (within about 5 cm of it)', `${sit.state}, ${Math.round(dist * 100)} cm`);
  const still = await page.evaluate(() => window.__game.flameTilt('right'));
  const watchTilt = page.evaluate(async () => { let m = 0; const t0 = performance.now(); while (performance.now() - t0 < 6000) { m = Math.max(m, window.__game.flameTilt('right')); await new Promise(r => setTimeout(r, 10)); } return m; });
  await K('right', { to: [0.65, 1.25, -0.35], dur: 0.35, linear: true }); await settle(); await wait(0.6);
  const moving = await watchTilt;
  check(still < 0.1 && moving > 0.15, 'hold B: the flame stands upright when still and leans as the hand moves', `still ${still.toFixed(2)} rad, moving ${moving.toFixed(2)} rad`);
  await look(-10, -20); await wait(0.1); await shot('v14-02-held-flame'); await look(0, 0);
  await page.evaluate(() => window.__game.setHold('float')); await empty('right');
  // fewer accidental pulls: an arm sweeping past a fire while the hand closes does not grab it
  const F = await page.evaluate(() => { const b = window.__game.world.bowls.find(b => !b.near && Math.abs(b.d - 5.5) < 0.1); return [b.pos.x, b.pos.y, b.pos.z]; });
  const sh = [0.17, 1.4, 0.05], dirTo = p => { const v = [p[0] - sh[0], p[1] - sh[1], p[2] - sh[2]], l = Math.hypot(...v); return v.map(x => x / l); };
  const rotY = (v, deg) => { const a = deg * Math.PI / 180; return [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)]; };
  const out = d => [sh[0] + d[0] * 0.5, sh[1] + d[1] * 0.5, sh[2] + d[2] * 0.5];
  let n = (await log()).length;
  // sweep from pointing at the floor, up through the fire, to above it (no other fire on that line), closing the hand as it passes
  const tilt = (v, dy) => { const w = [v[0], v[1] + dy, v[2]], l = Math.hypot(...w); return w.map(x => x / l); };
  await palmTo(out(tilt(dirTo(F), -0.9)), 0.6); await wait(0.3);
  await K('right', { to: out(tilt(dirTo(F), -0.1)), dur: 0.15, linear: true }); await K('right', { pose: 'fist', to: out(tilt(dirTo(F), 0.8)), dur: 0.15, linear: true }); await settle(); await wait(0.5);
  let L = await since(n); n += L.length;
  check(!L.some(l => l.startsWith('LOCK')), 'an arm sweeping past a fire while the hand closes does not grab it', L.join(' / ') || 'nothing grabbed');
  await K('right', { pose: 'open', dur: 0.3 }); await settle(); await empty('right');
  await palmTo(out(dirTo(F)), 0.6); await wait(0.4);
  await K('right', { pose: 'fist', dur: 0.25 }); await settle(); await wait(0.3);
  L = await since(n); n += L.length;
  check(L.some(l => l.startsWith('LOCK right')), 'aiming at a fire and then closing still grabs it', L.join(' / '));
  await K('right', { pose: 'open', dur: 0.3, to: [0.25, 1.2, -0.3] }); await settle(); await empty('right');
  // travel by pad, then every reaction at its station
  const pads = await page.evaluate(() => window.__game.pads()), next = pads.find(P => P.s === 0 && P.to === 1);
  n = (await log()).length;
  await page.evaluate(([x, z]) => { window.__xr.position.x = x; window.__xr.position.z = z; }, [next.x, next.z]); await wait(1.7);
  L = await since(n);
  check((await st()) === 1 && L.filter(l => l.startsWith('STATION')).length === 1, 'standing on the "next" pad travels once, to the throw range', L.join(' / '));
  await propsCheck();
}

await ({ v05: scenarioV05, v06: scenarioV06, v07: scenarioV07, v08: scenarioV08, v09: scenarioV08, v10: scenarioV10, v11: scenarioV11, v12: scenarioV12, v13: scenarioV13, v14: scenarioV14 })[VER]();
const s = await state();
info('sign score', JSON.stringify(s.stats));
check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
await browser.close(); server.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ version: VER, results, log: await Promise.resolve(null) }, null, 2));
const fails = results.filter(r => r.ok === false).length;
console.log(`\n${results.filter(r => r.ok).length} passed, ${fails} failed · screenshots in ${OUT}`);
process.exit(fails ? 1 : 0);
