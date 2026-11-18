// Run with: node tests/push.test.mjs
// v09: a push (starts in front of you, ends palm forward) pours at once and never throws;
// a throw winds up beside or behind the head and still throws, palm forward or not; the still pose is a little easier.
import assert from 'node:assert/strict';
import { createHand, stepHand, FT } from '../v09/src/fire.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });
const NEAR = { id: 0, pos: P(0.55, 0.9, -0.55), r: 0.2, near: true };
const UP = P(0, 1, 0), FWD = P(0, 0, -1);
const BOWL_IN = P(0.55, 0.95, -0.55), REST = P(0.25, 1.15, -0.3);
const CHEST = P(0.2, 1.3, -0.2), OUT = P(0.2, 1.35, -0.5);   // shoulder is at z 0.05: chest is 0.25 m in front, OUT 0.55 m
const OPEN = 0.11;

function rig() {
  const h = createHand('right'), ev = [];
  let t = 0;
  const frame = (palm, curl, normal = UP, dt = 1 / 72) => {
    t += dt;
    const gesture = curl < 0.068 ? 'fist' : curl > 0.085 ? 'open' : 'relaxed';
    stepHand(h, { tracked: true, mode: 'hand', palm, normal, flamePos: palm, gesture, curl, head: P(0, 1.6, 0), facing: P(0, -0.2, -1) }, dt, t, [NEAR], (type, d) => ev.push(Object.assign({ type }, d)));
  };
  const hold = (palm, curl, secs, normal) => { for (let s = 0; s < secs; s += 1 / 72) frame(palm, curl, normal); };
  const move = (from, to, secs, curl, normal) => { const k = Math.round(secs * 72); for (let i = 1; i <= k; i++) frame(P(from.x + (to.x - from.x) * i / k, from.y + (to.y - from.y) * i / k, from.z + (to.z - from.z) * i / k), curl, normal); };
  const count = type => ev.filter(e => e.type === type).length;
  const take = () => { move(REST, BOWL_IN, 0.5, OPEN); move(BOWL_IN, CHEST, 0.6, OPEN); hold(CHEST, OPEN, 0.4); assert.equal(h.state, 'ready'); };
  return { h, ev, frame, hold, move, count, take };
}

{
  const r = rig(); r.take();
  r.move(CHEST, OUT, 0.12, OPEN, FWD);   // a quick push, 2.5 m/s, palm forward
  r.hold(OUT, OPEN, 0.1, FWD);
  assert.equal(r.count('throw'), 0); assert.ok(r.ev.some(e => e.type === 'jetStart' && e.how === 'push'), r.ev.map(e => e.type).join(','));
  ok('a quick push from in front, ending palm forward, pours at once and does not throw');
}
{
  const r = rig(); r.take();
  r.move(CHEST, P(0.2, 1.3, -0.35), 0.1, OPEN, FWD); r.hold(P(0.2, 1.3, -0.35), OPEN, 0.3, UP);
  assert.equal(r.count('throw'), 0);
  ok('a short push from in front never throws, even if it ends without pouring');
}
{
  const r = rig(); r.take();
  const WIND = P(0.3, 1.6, 0.08);
  r.move(CHEST, WIND, 0.6, OPEN, UP); r.hold(WIND, OPEN, 0.3, UP);
  r.move(WIND, P(0.3, 1.45, -0.4), 0.1, OPEN, FWD); r.move(P(0.3, 1.45, -0.4), P(0.3, 1.42, -0.48), 0.15, OPEN, FWD);
  assert.equal(r.count('throw'), 1); assert.equal(r.count('jetStart'), 0);
  ok('an overhand throw wound up beside the head still throws, palm forward at release');
}
{
  const r = rig(); r.take();
  r.move(CHEST, OUT, 0.12, OPEN, UP); r.hold(OUT, OPEN, 0.3, UP);
  assert.equal(r.count('throw'), 1);
  ok('a toss from in front with the palm up is still a throw');
}
{
  const r = rig(); r.take();
  r.move(CHEST, OUT, 0.6, OPEN, UP);   // slow, not a swing
  r.hold(OUT, OPEN, 0.2, FWD);
  assert.equal(r.count('jetStart'), 0);
  r.hold(OUT, OPEN, 0.1, FWD);
  assert.equal(r.count('jetStart'), 1);
  ok('holding still, arm out, palm forward: pours after a quarter of a second');
  assert.ok(r.h.state === 'jet');
}
{
  const r = rig(); r.take();
  r.move(CHEST, OUT, 0.6, OPEN, UP); r.hold(OUT, 0.082, 0.4, FWD);
  assert.equal(r.count('jetStart'), 1);
  ok('a slightly relaxed open hand (curl 0.082) still pours');
  const r2 = rig(); r2.take();
  r2.move(CHEST, OUT, 0.6, OPEN, UP);
  let max = 0; for (let s = 0; s < 0.2; s += 1 / 72) { r2.frame(OUT, OPEN, FWD); max = Math.max(max, r2.h.poseK); }
  assert.ok(max > 0.6 && max < 1, max);
  ok('the view gets a 0 to 1 "about to pour" value while you hold the pose');
}
console.log(`\n${n} checks passed`);
