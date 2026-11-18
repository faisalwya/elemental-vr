// Run with: node tests/lock.test.mjs
// v11 lock-on: sticky selection, and aim A (arm line) vs aim B (the headset's pointing ray).
import assert from 'node:assert/strict';
import { createHand, stepHand, FT, pickSticky } from '../v11/src/fire.js';
import * as V13 from '../v13/src/fire.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });
const nrm = a => { const l = Math.hypot(a.x, a.y, a.z); return P(a.x / l, a.y / l, a.z / l); };
const yawDir = deg => P(Math.sin(deg * Math.PI / 180), 0, -Math.cos(deg * Math.PI / 180));
const at = (deg, d) => P(Math.sin(deg * Math.PI / 180) * d, 1.4, -Math.cos(deg * Math.PI / 180) * d);
const EYE = P(0, 1.4, 0);
const F1 = { id: 1, pos: at(-6, 5), r: 0.2, near: false }, F2 = { id: 2, pos: at(6, 5), r: 0.2, near: false };
const FIRES = [F1, F2];

{
  // aim wobbling around the middle between two fires 12 degrees apart: whichever was picked first stays picked
  let cur = pickSticky(EYE, yawDir(-1), FIRES, 9, null);
  assert.equal(cur.id, 1);
  for (const deg of [1, -0.5, 1.5, 0.5, 1.2, -1]) cur = pickSticky(EYE, yawDir(deg), FIRES, 9, cur);
  assert.equal(cur.id, 1);
  ok('sticky: wobbling between two close fires does not flicker the selection');
  cur = pickSticky(EYE, yawDir(5.5), FIRES, 9, cur);
  assert.equal(cur.id, 2);
  ok('sticky: aiming clearly at the other fire moves the selection');
  cur = pickSticky(EYE, yawDir(25), FIRES, 9, cur);
  assert.equal(cur, null);
  ok('sticky: aiming well away from every fire clears it');
}
{
  // the same hand, the same fires: aim A follows the arm line, aim B follows the ray the headset reports
  const SH = P(0.17, 1.4, 0.05), OUT = P(SH.x + 0.1, SH.y - 0.05, SH.z - 0.45);
  const F = { id: 7, pos: at(-30, 4.5), r: 0.3, near: false };
  const run = mode => {
    FT.aimMode = mode;
    const h = createHand('right'), ev = [];
    const rayDir = nrm(P(F.pos.x - OUT.x, F.pos.y - OUT.y, F.pos.z - OUT.z));   // the headset's ray points at the fire...
    for (let i = 0; i < 30; i++) stepHand(h, { tracked: true, mode: 'hand', palm: OUT, normal: P(0, 0, -1), flamePos: OUT, gesture: 'open', curl: 0.11, head: P(0, 1.6, 0), facing: P(0, 0, -1), ray: { from: OUT, dir: rayDir } }, 1 / 72, i / 72, [F], (t, d) => ev.push(t));
    return h;
  };
  assert.equal(run('arm').target, null);   // ...but the arm line points 30 degrees away from it
  assert.equal(run('ray').target && run('ray').target.id, 7);
  FT.aimMode = 'arm';
  ok('aim A uses the line from your shoulder through your hand; aim B uses the ray the headset reports');
}
{
  // the beam and label read these
  FT.aimMode = 'arm';
  const h = createHand('right'), SH = P(0.17, 1.4, 0.05), F = { id: 3, pos: P(0.17, 1.2, -4.5), r: 0.3, near: false };
  const OUT = P(0.17, 1.38, -0.45), BACK = P(0.17, 1.32, -0.1);
  let t = 0; const step = (palm, curl) => { t += 1 / 72; stepHand(h, { tracked: true, mode: 'hand', palm, normal: P(0, 0, -1), flamePos: palm, gesture: curl < 0.068 ? 'fist' : 'open', curl, head: P(0, 1.6, 0), facing: P(0, 0, -1) }, 1 / 72, t, [F], () => {}); };
  for (let i = 0; i < 20; i++) step(OUT, 0.11);
  assert.ok(h.aiming && h.aimDir && h.target && h.target.id === 3);
  for (let i = 0; i < 10; i++) step(OUT, 0.05);
  assert.equal(h.state, 'locked'); assert.equal(h.aiming, false);
  for (let i = 1; i <= 30; i++) step(P(OUT.x, OUT.y + (BACK.y - OUT.y) * i / 30, OUT.z + (BACK.z - OUT.z) * i / 30), 0.05);   // a slow pull: 0.85 m/s
  assert.equal(h.state, 'locked'); assert.ok(h.peakPull > 0.5 && h.peakPull < FT.pullSpeed, h.peakPull);
  ok('while grabbed, the pull speed and the best so far are measured (a slow 0.85 m/s pull does not fetch)');
}
{
  // v13: back to the arm line by default, a 12 degree zone, and warmer / colder
  assert.equal(V13.FT.aimMode, 'arm'); assert.equal(V13.FT.aimCone, 12);
  ok('v13: aims along the arm line by default, with a 12 degree zone');
  const near = (deg, d) => ({ id: deg, pos: at(deg, d), r: 0.25 + d * 0.03, near: false });
  const A = near(52, 5), B = near(60, 5);
  assert.equal(V13.pickSticky(EYE, yawDir(51), [A, B], 12, null).id, 52);
  assert.equal(V13.pickSticky(EYE, yawDir(61), [A, B], 12, null).id, 60);
  assert.equal(V13.pickSticky(EYE, yawDir(61), [A, B], 12, A).id, 60);
  ok('v13: the close pair (8 degrees apart) can each be picked, and you can move from one to the other');
  const w = d => (V13.warmth(EYE, yawDir(d), [near(0, 5.5)])[0] || { k: 0 }).k;
  assert.ok(w(0) > w(10) && w(10) > w(20) && w(20) > 0 && w(40) === 0, [w(0), w(10), w(20), w(40)].join(','));
  ok('v13: warmth rises as your aim nears a fire and is zero well away from it');
}
console.log(`\n${n} checks passed`);
