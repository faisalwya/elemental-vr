// Run with: node tests/jet.test.mjs
// v07 flamethrower lab: palm-forward jet while holding a flame, plus the v06 grab-and-yank aiming fix.
import assert from 'node:assert/strict';
import { createHand, stepHand, FT, pickSource } from '../v07/src/fire.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });
const nrm = a => { const l = Math.hypot(a.x, a.y, a.z); return P(a.x / l, a.y / l, a.z / l); };
const SH = P(0.17, 1.4, 0.05);
const NEAR = { id: 0, pos: P(0.55, 0.9, -0.55), r: 0.2, near: true };
const FAR = { id: 3, pos: P(3.9, 1.2, -2.25), r: 0.39, near: false };
const SOURCES = [NEAR, FAR];
const UP = P(0, 1, 0), FWD = P(0, 0, -1);
const BOWL_IN = P(0.55, 0.95, -0.55), REST = P(0.25, 1.15, -0.3), OUT = P(0.2, 1.35, -0.45);
const OPEN = 0.11, CLOSED = 0.05;

function rig(mode = 'hand') {
  const h = createHand('right'), ev = [];
  let t = 0;
  const frame = (palm, curl, normal = UP, extra = {}, dt = 1 / 72) => {
    t += dt;
    const gesture = curl < 0.068 ? 'fist' : curl > 0.085 ? 'open' : 'relaxed';
    const inp = palm ? Object.assign({ tracked: true, mode, palm, normal, flamePos: palm, gesture, curl, head: P(0, 1.6, 0), facing: P(0, -0.2, -1) }, extra) : null;
    stepHand(h, inp, dt, t, SOURCES, (type, d) => ev.push(Object.assign({ type }, d)));
  };
  const hold = (palm, curl, secs, normal, extra) => { for (let s = 0; s < secs; s += 1 / 72) frame(palm, curl, normal, extra); };
  const move = (from, to, secs, curl, normal, extra) => { const k = Math.round(secs * 72); for (let i = 1; i <= k; i++) frame(P(from.x + (to.x - from.x) * i / k, from.y + (to.y - from.y) * i / k, from.z + (to.z - from.z) * i / k), curl, normal, extra); };
  const count = type => ev.filter(e => e.type === type).length;
  const take = () => { move(REST, BOWL_IN, 0.5, OPEN); move(BOWL_IN, OUT, 0.6, OPEN); assert.equal(h.state, 'ready'); };
  return { h, ev, frame, hold, move, count, take };
}

{
  const r = rig(); r.take();
  r.hold(OUT, OPEN, 0.5, UP);
  assert.equal(r.h.state, 'ready'); assert.equal(r.count('jetDrop'), 0);
  ok('carrying a flame on an upturned palm does not pour');
  r.hold(OUT, OPEN, 0.1, FWD);
  assert.equal(r.h.state, 'ready');
  r.hold(OUT, OPEN, 0.2, FWD);
  assert.equal(r.h.state, 'jet'); assert.ok(r.count('jetStart') === 1);
  ok('arm out, palm turned forward for a moment: the jet starts');
  r.hold(OUT, OPEN, 1, FWD);
  const drops = r.ev.filter(e => e.type === 'jetDrop');
  assert.ok(drops.length > 35 && drops.length < 55, drops.length);
  assert.ok(drops.every(d => d.vel.z < -6), 'pours forward');
  ok('the jet pours forward out of the palm, about 45 droplets a second');
  r.hold(OUT, OPEN, 0.3, UP);
  assert.equal(r.h.state, 'ready'); assert.ok(r.h.fuel > 1.5 && r.h.fuel < 2.2, r.h.fuel);
  ok('turning the palm away stops it and the rest of the flame stays in the hand');
  r.hold(OUT, OPEN, 0.3, FWD); r.hold(OUT, OPEN, 2.5, FWD);
  assert.equal(r.h.state, 'empty'); assert.ok(r.ev.some(e => e.type === 'jetStop' && e.out));
  ok('pouring until the fuel runs out empties the hand');
}
{
  const r = rig(); r.take();
  r.hold(OUT, OPEN, 0.3, FWD); r.hold(OUT, CLOSED, 0.3, FWD);
  assert.equal(r.h.state, 'ready');
  ok('closing the hand stops the jet');
}
{
  const r = rig(); r.take();
  // overhand wind-up: hand beside the head, palm facing forward, held a moment
  const WIND = P(0.3, 1.6, 0.08);
  r.move(OUT, WIND, 0.5, OPEN, UP); r.hold(WIND, OPEN, 0.5, FWD);
  assert.equal(r.count('jetStart'), 0);
  ok('the palm-forward moment of an overhand wind-up beside the head does not pour');
  r.move(WIND, P(0.3, 1.45, -0.4), 0.1, OPEN, FWD); r.move(P(0.3, 1.45, -0.4), P(0.3, 1.42, -0.48), 0.15, OPEN, FWD);
  assert.equal(r.count('jetStart'), 0); assert.equal(r.count('throw'), 1);
  ok('a flick with the palm forward still throws and never turns into a jet');
}
{
  const r = rig();
  r.hold(OUT, OPEN, 0.5, FWD);
  assert.equal(r.count('jetStart'), 0);
  ok('an empty hand with the palm forward does nothing');
}
{
  // aiming fix: near bowls are reach-in only, never pulled from a distance
  const toNear = nrm(P(NEAR.pos.x - SH.x, NEAR.pos.y - SH.y, NEAR.pos.z - SH.z));
  assert.equal(pickSource(SH, toNear, SOURCES, FT.aimCone), null);
  const toFar = nrm(P(FAR.pos.x - SH.x, FAR.pos.y - SH.y, FAR.pos.z - SH.z));
  assert.equal(pickSource(SH, toFar, SOURCES, FT.aimCone).id, 3);
  ok('aiming: near bowls cannot be pulled from a distance; far fires still can');
  const r = rig();
  const OUTF = P(SH.x + toFar.x * 0.5, SH.y + toFar.y * 0.5, SH.z + toFar.z * 0.5), BACK = P(SH.x + toFar.x * 0.12, SH.y + toFar.y * 0.12 - 0.08, SH.z + toFar.z * 0.12);
  r.move(REST, OUTF, 0.6, OPEN); r.hold(OUTF, CLOSED, 0.3); r.move(OUTF, BACK, 0.2, CLOSED); r.hold(BACK, CLOSED, 0.8);
  assert.equal(r.h.state, 'ready'); assert.ok(Math.abs(r.h.fuel - FT.fuel) < 1e-9);
  ok('grab and yank still works, and a pulled flame comes with full fuel');
}
{
  const r = rig('controller'); r.take();
  r.frame(OUT, OPEN, FWD, { gesture: 'pinch' });
  assert.equal(r.h.state, 'jet');
  r.frame(OUT, OPEN, FWD, { gesture: 'open' }); r.hold(OUT, OPEN, 0.2, FWD, { gesture: 'open' });
  assert.equal(r.h.state, 'ready');
  ok('controllers: hold the trigger to pour, let go to stop');
}
console.log(`\n${n} checks passed`);
