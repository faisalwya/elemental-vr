// Run with: node test/v04.test.mjs
import assert from 'node:assert/strict';
import { createHand, stepHand, FT } from '../v04/src/fire.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });
const nrm = a => { const l = Math.hypot(a.x, a.y, a.z); return P(a.x / l, a.y / l, a.z / l); };
const SH = P(0.17, 1.4, 0.05), BOWL = P(0.65, 0.96, -0.6), READY = P(0.3, 1.25, -0.3), BACK = P(0.22, 1.32, -0.02);
const toBowl = nrm(P(BOWL.x - SH.x, BOWL.y - SH.y, BOWL.z - SH.z));
const OUT = P(SH.x + toBowl.x * 0.45, SH.y + toBowl.y * 0.45, SH.z + toBowl.z * 0.45);

function rig(mode = 'hand') {
  const h = createHand('right'), ev = [];
  let t = 0;
  const frame = (palm, gesture, extra = {}, dt = 1 / 72) => {
    t += dt;
    stepHand(h, Object.assign({ tracked: true, mode, palm, normal: P(0, 1, 0), pinchPoint: palm, flamePos: palm, gesture, curl: gesture === 'fist' ? 0.05 : 0.11, head: P(0, 1.6, 0) }, extra),
      dt, t, [{ pos: BOWL, r: 0.24 }], (type, d) => ev.push(Object.assign({ type }, d)));
  };
  const hold = (palm, gesture, secs, extra) => { for (let s = 0; s < secs; s += 1 / 72) frame(palm, gesture, extra); };
  const move = (from, to, secs, gesture, extra) => { const k = Math.round(secs * 72); for (let i = 1; i <= k; i++) frame(P(from.x + (to.x - from.x) * i / k, from.y + (to.y - from.y) * i / k, from.z + (to.z - from.z) * i / k), gesture, extra); };
  return { h, ev, frame, hold, move, types: () => ev.map(e => e.type) };
}
function carrying(r) {
  r.hold(OUT, 'open', 0.4, { normal: toBowl }); r.hold(OUT, 'fist', 0.4, { normal: toBowl }); r.hold(READY, 'open', 0.4);
  assert.equal(r.h.state, 'carry');
}

{
  const r = rig();
  r.hold(OUT, 'open', 0.15, { normal: toBowl });
  assert.equal(r.h.state, 'empty');
  r.hold(OUT, 'open', 0.2, { normal: toBowl });
  assert.equal(r.h.state, 'locked'); assert.ok(r.types().includes('lock'));
  r.hold(OUT, 'open', 1.0, { normal: toBowl });
  assert.equal(r.h.state, 'locked');
  ok('reaching toward a fire locks on and waits; nothing moves on its own');
  r.frame(OUT, 'fist', { normal: toBowl });
  assert.equal(r.h.state, 'pulling');
  r.hold(OUT, 'fist', 0.4, { normal: toBowl });
  assert.equal(r.h.state, 'carry'); assert.equal(r.h.armed, false);
  r.hold(READY, 'open', 0.1);
  assert.equal(r.h.armed, true);
  ok('closing the hand while locked pulls the flame over');
}
{
  const r = rig();
  r.hold(OUT, 'open', 0.5, { normal: toBowl });
  assert.equal(r.h.state, 'locked');
  r.hold(OUT, 'open', 0.4, { normal: P(-1, 0, 0) });
  assert.equal(r.h.state, 'empty'); assert.ok(r.types().includes('unlock'));
  ok('turning the palm away breaks the lock');
}
{
  const r = rig();
  r.hold(OUT, 'open', 0.5, { normal: toBowl });
  r.move(OUT, BACK, 0.12, 'open', { normal: toBowl });
  assert.equal(r.h.state, 'locked');
  ok('yanking does nothing when the pull style is close-your-hand');
  FT.pullStyle = 'yank';
  const r2 = rig();
  r2.hold(OUT, 'open', 0.5, { normal: toBowl });
  r2.move(OUT, BACK, 0.12, 'open', { normal: toBowl });
  assert.ok(['pulling', 'carry'].includes(r2.h.state));
  const r3 = rig();
  r3.hold(OUT, 'open', 0.5, { normal: toBowl }); r3.frame(OUT, 'fist', { normal: toBowl });
  assert.equal(r3.h.state, 'locked');
  FT.pullStyle = 'close';
  ok('with the yank style, pulling the hand back fetches it and closing does not');
}
{
  const r = rig(); carrying(r);
  // an overhand throw: palm facing back toward you the whole time, hand speeds up then slows
  const A = P(0.3, 1.6, 0.05), B = P(0.3, 1.45, -0.4), C = P(0.3, 1.38, -0.5);
  r.move(READY, A, 0.5, 'open', { normal: P(0, 0, 1) });
  r.move(A, B, 0.12, 'open', { normal: P(0, 0, 1) });
  assert.equal(r.h.state, 'carry');
  r.move(B, C, 0.15, 'open', { normal: P(0, 0, 1) });
  const th = r.ev.find(e => e.type === 'throw');
  assert.ok(th, 'threw'); assert.ok(th.vel.z < -4 && Math.abs(th.vel.x) < 1, JSON.stringify(th.vel));
  ok('an overhand swing throws at the fastest point, palm facing any way');
}
{
  const r = rig(); carrying(r);
  r.move(READY, P(0.3, 1.25, -0.6), 0.6, 'open', { normal: P(0, 0, -1) });
  assert.equal(r.h.state, 'carry');
  ok('moving the flame around slowly never throws it');
  r.move(P(0.3, 1.25, -0.6), P(0.25, 1.3, -0.1), 0.15, 'open');
  assert.equal(r.h.state, 'carry');
  ok('a fast move back toward you is not a throw');
}
{
  const r = rig(); carrying(r);
  r.hold(READY, 'fist', 1.5, { normal: P(0, 0, -1) }); r.frame(READY, 'open', { normal: P(0, 0, -1) });
  const b = r.ev.find(e => e.type === 'blast');
  assert.ok(b && b.power === 1);
  ok('fist to charge and open to blast still works');
  const r2 = rig(); carrying(r2);
  r2.hold(READY, 'pinch', 1);
  assert.ok(r2.types().filter(t => t === 'jetDrop').length >= 40);
  ok('pinch still pours a jet');
}
{
  const r = rig();
  r.hold(P(0.25, 0.9, 0), 'relaxed', 1, { normal: P(-1, 0, 0) });
  assert.equal(r.h.state, 'empty');
  ok('a hand resting at your side does nothing');
  const r2 = rig('controller');
  r2.hold(OUT, 'open', 0.5, { normal: toBowl }); assert.equal(r2.h.state, 'locked');
  r2.frame(OUT, 'fist', { normal: toBowl }); assert.equal(r2.h.state, 'pulling');
  ok('controllers: point at a fire with the arm out to lock, grip to pull');
}
console.log(`\n${n} checks passed`);
