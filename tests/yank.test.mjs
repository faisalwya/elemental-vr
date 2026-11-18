// Run with: node tests/yank.test.mjs
// v12 yank: a grab-and-yank in one motion counts; any pull back toward your body counts;
// A (quick) fetches on a short sharp tug, B (pull) on drawing the fist back 15 cm at any speed.
import assert from 'node:assert/strict';
import { createHand, stepHand, FT } from '../v12/src/fire.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });
const nrm = a => { const l = Math.hypot(a.x, a.y, a.z); return P(a.x / l, a.y / l, a.z / l); };
const HEAD = P(0, 1.6, 0), OUT = P(0.25, 1.35, -0.45), F = { id: 3, pos: P(0.6, 1.2, -4.5), r: 0.3, near: false };
const RAY = nrm(P(F.pos.x - OUT.x, F.pos.y - OUT.y, F.pos.z - OUT.z));

function rig(mode) {
  FT.yankMode = mode; FT.aimMode = 'ray';
  const h = createHand('right'), ev = [];
  let t = 0;
  const frame = (palm, curl) => { t += 1 / 72; stepHand(h, { tracked: true, mode: 'hand', palm, normal: P(0, 0, -1), flamePos: palm, gesture: curl < 0.068 ? 'fist' : curl > 0.085 ? 'open' : 'relaxed', curl, head: HEAD, facing: P(0, -0.2, -1), ray: { from: palm, dir: RAY } }, 1 / 72, t, [F], (type, d) => ev.push(Object.assign({ type }, d))); };
  const hold = (palm, curl, secs) => { for (let s = 0; s < secs; s += 1 / 72) frame(palm, curl); };
  const move = (a, b, secs, curl, curlTo = curl) => { const k = Math.round(secs * 72); for (let i = 1; i <= k; i++) frame(P(a.x + (b.x - a.x) * i / k, a.y + (b.y - a.y) * i / k, a.z + (b.z - a.z) * i / k), curl + (curlTo - curl) * i / k); };
  const pulled = () => ev.some(e => e.type === 'pullStart');
  return { h, ev, frame, hold, move, pulled };
}
const toward = (p, d) => P(p.x + (0 - p.x) * d, p.y + (1.25 - p.y) * d, p.z + (0 - p.z) * d);   // d of the way to the chest

{
  // close the hand and yank back in one motion: the hand only counts as closed half way through the yank
  const r = rig('quick'); r.hold(OUT, 0.11, 0.4);
  assert.ok(r.h.target && r.h.target.id === 3);
  r.move(OUT, toward(OUT, 0.3), 0.18, 0.11, 0.05); r.hold(toward(OUT, 0.3), 0.05, 0.3);
  assert.ok(r.pulled(), r.ev.map(e => e.type).join(','));
  ok('A quick: grabbing and yanking in one motion fetches the flame first time');
  const r2 = rig('pull'); r2.hold(OUT, 0.11, 0.4);
  r2.move(OUT, toward(OUT, 0.4), 0.18, 0.11, 0.05); r2.hold(toward(OUT, 0.4), 0.05, 0.3);
  assert.ok(r2.pulled());
  ok('B pull: grabbing and pulling back in one motion fetches it too');
}
{
  // a yank back and down (toward the hip side), not toward the shoulder
  const r = rig('quick'); r.hold(OUT, 0.11, 0.4); r.hold(OUT, 0.05, 0.2);
  assert.equal(r.h.state, 'locked');
  const DOWN = P(OUT.x + 0.05, OUT.y - 0.15, OUT.z + 0.12);
  r.move(OUT, DOWN, 0.15, 0.05); r.hold(DOWN, 0.05, 0.3);
  assert.ok(r.pulled());
  ok('A quick: a yank back and down counts (it is toward your body)');
}
{
  // a slow, deliberate 20 cm draw at about 0.4 m/s
  const SLOW = toward(OUT, 0.45);
  const a = rig('quick'); a.hold(OUT, 0.11, 0.4); a.hold(OUT, 0.05, 0.2); a.move(OUT, SLOW, 0.6, 0.05); a.hold(SLOW, 0.05, 0.3);
  const b = rig('pull'); b.hold(OUT, 0.11, 0.4); b.hold(OUT, 0.05, 0.2); b.move(OUT, SLOW, 0.6, 0.05); b.hold(SLOW, 0.05, 0.3);
  assert.ok(!a.pulled() && b.pulled(), `quick ${a.pulled()} pull ${b.pulled()}`);
  ok('a slow draw back: B (pull) fetches it, A (quick) does not, which is the difference to feel');
}
{
  // holding the grab still, with tracking jitter, never pulls in either style
  for (const mode of ['quick', 'pull']) {
    const r = rig(mode); r.hold(OUT, 0.11, 0.4); r.hold(OUT, 0.05, 0.2);
    for (let i = 0; i < 120; i++) r.frame(P(OUT.x + (Math.random() - 0.5) * 0.008, OUT.y + (Math.random() - 0.5) * 0.008, OUT.z + (Math.random() - 0.5) * 0.008), 0.05);
    assert.ok(!r.pulled() && r.h.state === 'locked', mode);
  }
  ok('holding a grab still, with tracking jitter, never pulls in either style');
}
{
  // reaching forward then grabbing: the forward reach before the close must not count as a pull
  const r = rig('pull'); r.hold(P(OUT.x, OUT.y, OUT.z + 0.2), 0.11, 0.3);
  r.move(P(OUT.x, OUT.y, OUT.z + 0.2), OUT, 0.2, 0.11, 0.05); r.hold(OUT, 0.05, 0.4);
  assert.ok(!r.pulled() && r.h.state === 'locked');
  ok('reaching forward and grabbing does not count as a pull');
}
console.log(`\n${n} checks passed`);
