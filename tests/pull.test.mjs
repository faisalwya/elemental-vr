// Run with: node tests/pull.test.mjs
// v06 pulling lab: reach in, style A (grab and yank), style B (two-finger draw), then the flick throw.
import assert from 'node:assert/strict';
import { createHand, stepHand, FT, pickSource } from '../v06/src/fire.js';
import { readHand } from '../v06/src/gestures.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });
const nrm = a => { const l = Math.hypot(a.x, a.y, a.z); return P(a.x / l, a.y / l, a.z / l); };
const SH = P(0.17, 1.4, 0.05);
const NEAR = { id: 0, pos: P(0.55, 0.9, -0.55), r: 0.2, near: true };
const FAR = { id: 1, pos: P(3.9, 1.2, -2.25), r: 0.3, near: false };      // 4.5 m, off to the right
const SOURCES = [NEAR, FAR];
const toFar = nrm(P(FAR.pos.x - SH.x, FAR.pos.y - SH.y, FAR.pos.z - SH.z));
const OUT = P(SH.x + toFar.x * 0.5, SH.y + toFar.y * 0.5, SH.z + toFar.z * 0.5);
const BACK = P(SH.x + toFar.x * 0.12, SH.y + toFar.y * 0.12 - 0.08, SH.z + toFar.z * 0.12);
const REST = P(0.25, 1.15, -0.3);
const OPEN = 0.11, CLOSED = 0.05;

function rig(style, mode = 'hand') {
  const h = createHand('right'), ev = [];
  let t = 0;
  const frame = (palm, curl, extra = {}, dt = 1 / 72) => {
    t += dt;
    const gesture = extra.point ? 'point' : curl < 0.068 ? 'fist' : curl > 0.085 ? 'open' : 'relaxed';
    const inp = palm ? Object.assign({ tracked: true, mode, palm, normal: P(0, 1, 0), flamePos: palm, gesture, curl, head: P(0, 1.6, 0), facing: P(0, -0.2, -1) }, extra) : null;
    stepHand(h, inp, dt, t, r.style, SOURCES, (type, d) => ev.push(Object.assign({ type }, d)));
  };
  const hold = (palm, curl, secs, extra) => { for (let s = 0; s < secs; s += 1 / 72) frame(palm, curl, extra); };
  const move = (from, to, secs, curl, extra) => { const k = Math.round(secs * 72); for (let i = 1; i <= k; i++) frame(P(from.x + (to.x - from.x) * i / k, from.y + (to.y - from.y) * i / k, from.z + (to.z - from.z) * i / k), curl, extra); };
  const r = { h, ev, frame, hold, move, style, types: () => ev.map(e => e.type) };
  return r;
}
const pointAt = (from, src) => ({ point: true, pointFrom: from, pointDir: nrm(P(src.pos.x - from.x, src.pos.y - from.y, src.pos.z - from.z)) });

{
  const r = rig('A');
  r.hold(REST, OPEN, 0.5);
  assert.equal(r.h.state, 'empty');
  ok('no flame appears on its own');
  r.move(REST, P(0.55, 0.95, -0.55), 0.5, OPEN);
  assert.equal(r.h.state, 'ready'); assert.ok(r.ev.find(e => e.type === 'take' && e.how === 'reach'));
  ok('reaching into a near bowl takes a flame');
}
{
  const r = rig('A');
  r.move(REST, OUT, 0.6, OPEN); r.hold(OUT, OPEN, 0.3);
  assert.equal(r.h.state, 'empty'); assert.equal(r.h.target && r.h.target.id, 1);
  ok('A: an open hand reaching toward a far fire makes it glow, nothing else');
  r.hold(OUT, CLOSED, 0.4);
  assert.equal(r.h.state, 'locked');
  ok('A: closing the hand grabs it, and it waits');
  r.move(OUT, BACK, 0.2, CLOSED);
  assert.ok(['pulling', 'ready'].includes(r.h.state));
  const ps = r.ev.find(e => e.type === 'pullStart');
  assert.ok(ps && ps.d > 3.5, JSON.stringify(ps));
  r.hold(BACK, CLOSED, 0.8);
  assert.equal(r.h.state, 'ready'); assert.ok(r.ev.find(e => e.type === 'take' && e.how === 'pull'));
  ok('A: yanking the fist back pulls the flame over');
}
{
  const r = rig('A');
  r.move(REST, OUT, 0.6, OPEN); r.hold(OUT, CLOSED, 0.3); r.hold(OUT, OPEN, 0.2);
  assert.equal(r.h.state, 'empty'); assert.ok(r.types().includes('unlock'));
  ok('A: opening the hand lets go of the grab');
  const r2 = rig('A');
  r2.move(REST, OUT, 0.6, OPEN); r2.hold(OUT, OPEN, 0.3); r2.move(OUT, BACK, 0.2, OPEN);
  assert.equal(r2.h.state, 'empty');
  ok('A: pulling back with an open hand does nothing');
  const r3 = rig('A');
  r3.move(REST, OUT, 0.6, CLOSED); r3.hold(OUT, CLOSED, 0.3);
  assert.equal(r3.h.state, 'empty');
  ok('A: a fist that was already closed while reaching does not grab');
}
{
  const r = rig('B');
  r.move(REST, OUT, 0.6, OPEN); r.hold(OUT, OPEN, 0.3);
  assert.equal(r.h.target, null);
  ok('B: reaching an open hand does nothing');
  r.hold(OUT, 0.07, 0.1, pointAt(OUT, FAR));
  assert.equal(r.h.state, 'empty');
  r.hold(OUT, 0.07, 0.1, pointAt(OUT, FAR));
  assert.equal(r.h.state, 'locked');
  ok('B: pointing at a fire for a moment locks it');
  const k = 14; for (let i = 1; i <= k; i++) { const p = P(OUT.x + (BACK.x - OUT.x) * i / k, OUT.y + (BACK.y - OUT.y) * i / k, OUT.z + (BACK.z - OUT.z) * i / k); r.frame(p, 0.07, pointAt(p, FAR)); }
  r.hold(BACK, OPEN, 0.8);
  assert.equal(r.h.state, 'ready'); assert.ok(r.ev.find(e => e.type === 'take' && e.how === 'pull' && e.style === 'B'));
  ok('B: drawing the hand back pulls the flame over');
  const r2 = rig('B');
  r2.move(REST, OUT, 0.6, OPEN); r2.hold(OUT, 0.07, 0.3, pointAt(OUT, FAR)); r2.hold(OUT, OPEN, 0.3);
  assert.equal(r2.h.state, 'empty'); assert.ok(r2.types().includes('unlock'));
  ok('B: stopping pointing lets go');
  const r3 = rig('B');
  r3.move(REST, OUT, 0.6, OPEN); r3.hold(OUT, 0.07, 0.3, pointAt(OUT, FAR)); r3.hold(OUT, 0.07, 0.1, { point: false }); r3.hold(OUT, 0.07, 0.2, pointAt(OUT, FAR));
  assert.equal(r3.h.state, 'locked');
  ok('B: a brief flicker in the pointing does not lose the lock');
}
{
  const r = rig('A');
  r.move(REST, OUT, 0.6, OPEN); r.hold(OUT, CLOSED, 0.3); r.move(OUT, BACK, 0.2, CLOSED); r.hold(BACK, CLOSED, 0.8);
  const A = P(0.3, 1.5, 0.05), Bp = P(0.3, 1.42, -0.42), C = P(0.3, 1.38, -0.5);
  r.move(BACK, A, 0.5, OPEN); r.move(A, Bp, 0.1, OPEN); r.move(Bp, C, 0.15, OPEN);
  const th = r.ev.find(e => e.type === 'throw');
  assert.ok(th && th.vel.z < -4, JSON.stringify(th));
  assert.equal(r.h.state, 'empty');
  ok('a pulled flame throws with the v05 flick, and the hand is empty after');
}
{
  assert.equal(pickSource(SH, toFar, SOURCES, 8).id, 1);
  const off = nrm(P(toFar.x, toFar.y, toFar.z + 0.35));
  assert.equal(pickSource(SH, off, SOURCES, 8), null);
  ok('aiming picks the fire on the ray and nothing well off it');
}
{
  // a right hand, palm down, fingers forward; open, two-finger point, index point and fist
  const base = { 'wrist': P(0, 1, 0), 'index-finger-phalanx-proximal': P(-0.035, 1, -0.09), 'middle-finger-phalanx-proximal': P(-0.01, 1, -0.095), 'pinky-finger-phalanx-proximal': P(0.04, 1, -0.08), 'thumb-tip': P(-0.07, 0.98, -0.07) };
  const out = { 'index-finger-tip': P(-0.04, 1, -0.17), 'middle-finger-tip': P(-0.01, 1, -0.18) }, curledRP = { 'ring-finger-tip': P(0.012, 0.965, -0.05), 'pinky-finger-tip': P(0.035, 0.965, -0.045) };
  const two = readHand(Object.assign({}, base, out, curledRP), 'right');
  assert.ok(two.point && two.two && two.gesture === 'point' && two.pointDir.z < -0.9, JSON.stringify(two.pointDir));
  const one = readHand(Object.assign({}, base, { 'index-finger-tip': P(-0.04, 1, -0.17), 'middle-finger-tip': P(-0.01, 0.965, -0.055) }, curledRP), 'right');
  assert.ok(one.point && !one.two);
  const open = readHand(Object.assign({}, base, out, { 'ring-finger-tip': P(0.015, 1, -0.17), 'pinky-finger-tip': P(0.04, 1, -0.15) }), 'right');
  assert.ok(!open.point && open.gesture === 'open');
  ok('gestures: reads a two-finger point (with its direction), a one-finger point, and tells an open hand apart');
}
console.log(`\n${n} checks passed`);
