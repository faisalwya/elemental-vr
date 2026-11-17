// Run with: node tests/throw.test.mjs
// v05 throwing lab: style A (hold and release), style B (flick), the wrist button.
import assert from 'node:assert/strict';
import { createHand, stepHand, FT, createButton, stepButton } from '../v05/src/fire.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });
const READY = P(0.3, 1.25, -0.3), BACK = P(0.3, 1.5, 0.0), FRONT = P(0.3, 1.38, -0.5);
const OPEN = 0.11, CLOSED = 0.05;

function rig(style, mode = 'hand') {
  const h = createHand('right'), ev = [];
  let t = 0;
  const frame = (palm, curl, extra = {}, dt = 1 / 72) => {
    t += dt;
    const gesture = curl < 0.068 ? 'fist' : curl > 0.085 ? 'open' : 'relaxed';
    const inp = palm ? Object.assign({ tracked: true, mode, palm, flamePos: palm, gesture, curl, head: P(0, 1.6, 0), facing: P(0, -0.2, -1) }, extra) : null;
    stepHand(h, inp, dt, t, r.style, (type, d) => ev.push(Object.assign({ type }, d)));
  };
  const hold = (palm, curl, secs, extra) => { for (let s = 0; s < secs; s += 1 / 72) frame(palm, curl, extra); };
  const move = (from, to, secs, curl, extra) => { const k = Math.round(secs * 72); for (let i = 1; i <= k; i++) frame(P(from.x + (to.x - from.x) * i / k, from.y + (to.y - from.y) * i / k, from.z + (to.z - from.z) * i / k), curl, extra); };
  const r = { h, ev, frame, hold, move, style, types: () => ev.map(e => e.type), throws: () => ev.filter(e => e.type === 'throw') };
  return r;
}

{
  const r = rig('A');
  r.hold(READY, OPEN, 0.6);
  assert.equal(r.h.state, 'ready'); assert.ok(r.types().includes('spawn'));
  ok('a flame appears in the hand on its own');
  r.move(READY, FRONT, 0.6, OPEN); r.move(FRONT, BACK, 0.12, OPEN); r.move(BACK, FRONT, 0.12, OPEN);
  assert.equal(r.throws().length, 0);
  ok('A: swinging an open hand does not throw');
  r.hold(BACK, CLOSED, 0.2);
  assert.equal(r.h.state, 'held');
  r.move(BACK, FRONT, 0.12, CLOSED);
  assert.equal(r.h.state, 'held');
  ok('A: close around the flame, swing with the hand closed: still holding');
  r.frame(P(0.3, 1.37, -0.52), OPEN);
  const th = r.throws()[0];
  assert.ok(th && th.style === 'A' && th.how === 'open');
  assert.ok(th.vel.z < -5 && Math.abs(th.vel.x) < 0.5, JSON.stringify(th.vel));
  ok('A: opening the hand at the end of the swing throws along the swing');
  r.hold(FRONT, OPEN, FT.respawn + 0.1);
  assert.equal(r.h.state, 'ready');
  ok('a new flame after each throw');
}
{
  const r = rig('A');
  r.hold(READY, OPEN, 0.6); r.hold(READY, CLOSED, 0.2);
  r.move(READY, FRONT, 0.12, CLOSED); r.hold(FRONT, CLOSED, 0.3);   // swing, stop, wait, then open
  r.hold(FRONT, OPEN, 0.1);
  assert.equal(r.throws().length, 0); assert.equal(r.h.state, 'ready'); assert.ok(r.types().includes('unclench'));
  ok('A: opening a still hand puts the flame back on the palm, no throw');
  r.hold(READY, 0.083, 0.2);
  assert.equal(r.h.state, 'ready');
  r.hold(READY, 0.075, 0.1); assert.equal(r.h.state, 'held');
  r.hold(READY, 0.084, 0.1); assert.equal(r.h.state, 'held');
  ok('A: closing and opening use two thresholds, so in-between curl does not flicker');
}
{
  const r = rig('A');
  r.hold(READY, CLOSED, 0.6);
  assert.equal(r.h.state, 'ready');
  ok('A: a hand already closed when the flame appears has to open once first');
}
{
  const r = rig('A');
  r.hold(READY, OPEN, 0.6); r.hold(BACK, CLOSED, 0.3);
  r.move(BACK, FRONT, 0.1, CLOSED); r.frame(null);
  const th = r.throws()[0];
  assert.ok(th && th.how === 'lost' && th.vel.z < -5, JSON.stringify(th));
  ok('A: tracking lost in the middle of a fast swing still throws');
}
{
  const r = rig('B');
  r.hold(READY, OPEN, 0.9);
  r.move(READY, P(0.3, 1.25, -0.6), 0.6, OPEN);
  assert.equal(r.throws().length, 0);
  ok('B: moving the flame around slowly never throws it');
  r.move(P(0.3, 1.25, -0.6), BACK, 0.6, OPEN);
  r.move(BACK, P(0.3, 1.45, -0.4), 0.12, OPEN);
  r.move(P(0.3, 1.45, -0.4), FRONT, 0.15, OPEN);
  const th = r.throws()[0];
  assert.ok(th && th.style === 'B' && th.how === 'flick' && th.vel.z < -4, JSON.stringify(th));
  ok('B: a swing flicks the flame off at the fastest point, hand open');
  const r2 = rig('B');
  r2.hold(FRONT, OPEN, 0.9); r2.move(FRONT, BACK, 0.15, OPEN); r2.hold(BACK, OPEN, 0.3);
  assert.equal(r2.throws().length, 0);
  ok('B: a fast wind-up, hand going back past your head, is not a throw');
}
{
  const r = rig('B');
  r.hold(READY, OPEN, 0.9); r.hold(READY, CLOSED, 0.3);
  assert.equal(r.h.state, 'ready');
  ok('B: closing the hand does nothing');
  const a = rig('A'), b = rig('B');
  for (const x of [a, b]) { x.hold(READY, OPEN, 0.9); x.move(READY, BACK, 0.8, OPEN); x.hold(BACK, x.style === 'A' ? CLOSED : OPEN, 0.3); x.move(BACK, FRONT, 0.12, x.style === 'A' ? CLOSED : OPEN); x.move(FRONT, P(0.3, 1.37, -0.53), 0.1, OPEN); }
  const va = a.throws()[0].vel, vb = b.throws()[0].vel, sa = Math.hypot(va.x, va.y, va.z), sb = Math.hypot(vb.x, vb.y, vb.z);
  assert.ok(Math.abs(sa - sb) / sb < 0.25, `${sa} vs ${sb}`);
  ok('the same swing gives about the same throw speed in both styles');
}
{
  const r = rig('A', 'controller');
  r.hold(READY, OPEN, 0.6);
  r.hold(BACK, CLOSED, 0.2, { gesture: 'fist' }); assert.equal(r.h.state, 'held');
  r.move(BACK, FRONT, 0.12, CLOSED, { gesture: 'fist' }); r.frame(P(0.3, 1.37, -0.52), OPEN, { gesture: 'open' });
  assert.equal(r.throws().length, 1);
  ok('controllers: grip to hold, swing, let go of the grip to throw');
}
{
  const b = createButton(), C = P(0, 1, 0);
  assert.equal(stepButton(b, P(0, 1, 0.1), C, 0.016), false);
  assert.equal(stepButton(b, P(0, 1, 0.02), C, 0.016), true);
  assert.equal(stepButton(b, P(0, 1, 0.01), C, 0.016), false);
  assert.equal(stepButton(b, P(0, 1, 0.04), C, 0.016), false);
  assert.equal(stepButton(b, P(0, 1, 0.02), C, 0.016), false);
  ok('wrist button: one press per touch, the finger has to move away first');
  for (let i = 0; i < 40; i++) stepButton(b, P(0, 1, 0.2), C, 0.016);
  assert.equal(stepButton(b, P(0, 1, 0.02), C, 0.016), true);
  assert.equal(stepButton(b, null, C, 0.016), false);
  ok('wrist button: presses again after the finger leaves');
}
console.log(`\n${n} checks passed`);
