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
        if (k.pose && inp.poseId !== undefined) inp.poseId = k.pose;
        if (k.buttons) for (const id in k.buttons) inp.updateButtonValue(id, k.buttons[id]);
        if (k.connected !== undefined) inp.connected = k.connected;
      }
      k.t += dt;
      const f = Math.min(1, k.t / (k.dur || 0.0001)), e = k.linear ? f : f * f * (3 - 2 * f);
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
const state = () => page.evaluate(() => ({ style: window.__game.style(), left: window.__game.hands.left.state, right: window.__game.hands.right.state, stats: JSON.parse(JSON.stringify(window.__game.stats)), gt: window.__gt, head: window.__head }));
// what the game's own hand reader makes of the emulated joints
const read = side => page.evaluate(async s => {
  const { readHand } = await import('./src/gestures.js');
  const J = window.__joints[s]; if (!J) return null;
  const r = readHand(J, s, null); if (!r) return null;
  const w = J['wrist'], mp = J['middle-finger-phalanx-proximal'], f = [mp.x - w.x, mp.y - w.y, mp.z - w.z], l = Math.hypot(...f);
  const btn = [0, 1, 2].map(i => [w.x, w.y, w.z][i] - [r.normal.x, r.normal.y, r.normal.z][i] * 0.035 - f[i] / l * 0.03);   // same as main.js
  return { curl: +r.curl.toFixed(3), gesture: r.gesture, normal: [r.normal.x, r.normal.y, r.normal.z].map(n => +n.toFixed(2)), palm: [r.palm.x, r.palm.y, r.palm.z].map(n => +n.toFixed(3)),
    tip: J['index-finger-tip'] && [J['index-finger-tip'].x, J['index-finger-tip'].y, J['index-finger-tip'].z], btn };
}, side);
const handPos = side => page.evaluate(s => { const p = window.__xr.primaryInputMode === 'hand' ? window.__xr.hands[s].position : window.__xr.controllers[s].position; return [p.x, p.y, p.z]; }, side);
const shot = async name => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); return f; };
const look = (yawDeg, pitchDeg = 0) => page.evaluate(([y, p]) => {
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2), cp = Math.cos(p / 2), sp = Math.sin(p / 2);
  window.__xr.quaternion.set(cp * 0 + sp * cy, sy * cp, -sp * sy, cy * cp);   // yaw about Y, then pitch about X
}, [yawDeg * Math.PI / 180, pitchDeg * Math.PI / 180]);

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

// 8. the sign: look left at it
await look(48, 8); await wait(0.4); await shot('04-sign'); await look(0, 0);

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

s = await state();
info('sign score', JSON.stringify(s.stats));
check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
await browser.close(); server.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ version: VER, results, log: await Promise.resolve(null) }, null, 2));
const fails = results.filter(r => r.ok === false).length;
console.log(`\n${results.filter(r => r.ok).length} passed, ${fails} failed · screenshots in ${OUT}`);
process.exit(fails ? 1 : 0);
