// Scripted "ghost hands" that play the v05 throwing lab through the same states a player uses.
// Runs on screens without a headset, and in the automated page check.
// No aim help in v05, so the ghost works out its own swing: the hand velocity that, times the throw gain,
// lands a ballistic arc on the target. Throws in style A, then style B, and switches with the wrist button.

import { FT } from './fire.js';
import { WT } from './world.js';

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a, s) => v(a.x * s, a.y * s, a.z * s);
const lerp = (a, b, k) => v(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const smooth = k => k * k * (3 - 2 * k);
const UP = v(0, 1, 0);
const SH = { left: v(-0.17, 1.4, 0.05), right: v(0.17, 1.4, 0.05) };
const REST = { left: v(-0.3, 1.1, -0.25), right: v(0.3, 1.1, -0.25) };
const FLAME_UP = 0.1;   // flame sits this far above the palm (palm up)

// direction to launch at speed S from L so the arc passes through T (the flatter of the two solutions)
export function aimDir(L, T, S, g = WT.gravity) {
  const dx = T.x - L.x, dz = T.z - L.z, dy = T.y - L.y, h = Math.hypot(dx, dz);
  const disc = S ** 4 - g * (g * h * h + 2 * dy * S * S);
  const th = disc < 0 ? Math.PI / 4 : Math.atan((S * S - Math.sqrt(disc)) / (g * h));
  return v(dx / h * Math.cos(th), Math.sin(th), dz / h * Math.cos(th));
}

export function createDemo(world, setStyle) {
  const H = {};
  for (const s of ['left', 'right']) H[s] = { pos: REST[s], gesture: 'open', q: [], from: REST[s], t: 0 };
  const key = (s, to, dur, gesture, linear = false, then) => H[s].q.push({ to, dur, gesture, linear, then });

  function throwAt(s, target, S, style) {
    const hz = (() => { const d = v(target.x - SH[s].x, 0, target.z - SH[s].z), l = Math.hypot(d.x, d.z); return v(d.x / l, 0, d.z / l); })();
    const R = add(add(SH[s], scale(hz, 0.42)), v(0, 0.02, 0));          // where the hand is at the fastest point
    const d = aimDir(add(R, v(0, FLAME_UP, 0)), target, S);
    const u = S / FT.throwGain, W = add(R, scale(d, -0.4)), after = add(R, scale(d, 0.05));
    const closed = style === 'A' ? 'fist' : 'open';
    key(s, W, 0.9, 'open');                                     // bring the flame back beside the head
    key(s, W, 0.25, closed);                                    // A: close the hand around it
    key(s, R, 0.4 / u, closed, true);                           // swing through at a steady speed
    key(s, after, 0.16, 'open', true);                          // A: open to let go; B: slow down so it leaves
    key(s, REST[s], 0.9, 'open');
  }
  function wait(secs) { key('left', REST.left, secs, 'open'); }
  function style(st) { key('left', REST.left, 0.3, 'open', false, () => setStyle(st)); }

  const T = () => world.targets();
  const plan = [
    () => style('A'),
    () => throwAt('right', T().near, 7, 'A'),
    () => throwAt('left', T().mid, 9, 'A'),
    () => throwAt('right', T().far, 11, 'A'),
    () => throwAt('right', T().wall, 9, 'A'),
    () => wait(2),
    () => style('B'),
    () => throwAt('right', T().near, 7, 'B'),
    () => throwAt('left', T().mid, 9, 'B'),
    () => throwAt('right', T().far, 11, 'B'),
    () => throwAt('right', T().wall, 9, 'B'),
    () => wait(6),
  ];
  let step = 0, idle = 1.5;

  function update(dt) {
    if (!H.left.q.length && !H.right.q.length) {
      idle -= dt;
      if (idle <= 0) { plan[step % plan.length](); step++; idle = 0.3; }
    }
    const out = {};
    for (const s of ['left', 'right']) {
      const h = H[s];
      if (h.q.length) {
        const k = h.q[0]; h.t += dt;
        const f = Math.min(1, h.t / k.dur), e = k.linear ? f : smooth(f);
        h.pos = lerp(h.from, k.to, e);
        h.gesture = k.gesture;
        if (f >= 1) { h.q.shift(); h.from = h.pos; h.t = 0; if (k.then) k.then(); }
      }
      out[s] = { tracked: true, mode: 'hand', palm: h.pos, normal: UP, pinchPoint: h.pos, flamePos: add(h.pos, v(0, FLAME_UP, 0)),
        gesture: h.gesture, curl: h.gesture === 'fist' ? 0.05 : 0.11, head: v(0, 1.6, 0), facing: v(0, 0, -1) };
    }
    return out;
  }
  return { update, step: () => step };
}
