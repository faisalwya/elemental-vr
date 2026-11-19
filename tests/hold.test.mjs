// Run with: node tests/hold.test.mjs
// v14: fewer accidental pulls. A fire must have been aimed at for a moment before the hand closes;
// a swing past a fire with a closing hand does not grab; after a throw the hand waits longer; deliberate grabs still work.
import assert from 'node:assert/strict';
import { createHand, stepHand, FT } from '../v14/src/fire.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });
const HEAD = P(0, 1.6, 0), SH = P(0.17, 1.4, 0.05), F = { id: 3, pos: P(0.17, 1.2, -5), r: 0.3, near: false };
const AT = P(0.17, 1.38, -0.45);   // arm pointing straight at the fire
const SIDE = P(0.6, 1.38, -0.2);   // arm pointing well to the right of it

function rig() {
  FT.aimMode = 'arm'; FT.yankMode = 'quick';
  const h = createHand('right'), ev = [];
  let t = 0;
  const frame = (palm, curl) => { t += 1 / 72; stepHand(h, { tracked: true, mode: 'hand', palm, normal: P(0, 0, -1), flamePos: palm, gesture: curl < 0.068 ? 'fist' : curl > 0.085 ? 'open' : 'relaxed', curl, head: HEAD, facing: P(0, -0.2, -1) }, 1 / 72, t, [F], (type, d) => ev.push(Object.assign({ type }, d))); };
  const hold = (palm, curl, secs) => { for (let s = 0; s < secs; s += 1 / 72) frame(palm, curl); };
  const move = (a, b, secs, c0, c1 = c0) => { const k = Math.round(secs * 72); for (let i = 1; i <= k; i++) frame(P(a.x + (b.x - a.x) * i / k, a.y + (b.y - a.y) * i / k, a.z + (b.z - a.z) * i / k), c0 + (c1 - c0) * i / k); };
  return { h, ev, frame, hold, move, locked: () => ev.some(e => e.type === 'lock') };
}

{
  const r = rig(); r.hold(AT, 0.11, 0.4); r.hold(AT, 0.05, 0.2);
  assert.ok(r.locked());
  ok('aim at a fire, then close your hand: it grabs, as before');
}
{
  // the arm sweeps across the fire while the hand is closing (a throw follow-through, or turning)
  const r = rig(); r.hold(SIDE, 0.11, 0.3);
  r.move(SIDE, P(-0.3, 1.38, -0.2), 0.25, 0.11, 0.05); r.hold(P(-0.3, 1.38, -0.2), 0.05, 0.4);
  assert.ok(!r.locked(), r.ev.map(e => e.type).join(','));
  ok('an arm sweeping past a fire while the hand closes does not grab it');
}
{
  // closing a moment early, just as the aim arrives on the fire, still grabs
  const r = rig(); r.hold(SIDE, 0.11, 0.3); r.move(SIDE, AT, 0.2, 0.11); r.hold(AT, 0.11, 0.08); r.hold(AT, 0.05, 0.3);
  assert.ok(r.locked());
  ok('closing a little early, as your aim settles on the fire, still grabs it');
}
{
  // just thrown: the empty hand comes back and closes near a fire's line within the pause
  const r = rig(); r.h.timer = FT.afterThrow; r.hold(AT, 0.11, 0.3); r.hold(AT, 0.05, 0.3);
  assert.ok(!r.locked() && FT.afterThrow >= 0.7);
  ok('right after a throw the empty hand waits 0.7 s before it can grab');
}
console.log(`\n${n} checks passed`);
