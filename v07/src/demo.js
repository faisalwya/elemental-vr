// Scripted "ghost hands" that play the v07 flamethrower lab through the same states a player uses.
// Runs on screens without a headset, and in the automated page check.
// Takes from a near bowl or pulls with grab and yank, then either flicks the flame at a target or pours it out
// as a jet (arm out, palm forward). No aim help, so the ghost works out its own swing for each throw.

import { FT } from './fire.js';
import { WT } from './world.js';

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a, s) => v(a.x * s, a.y * s, a.z * s);
const norm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return v(a.x / l, a.y / l, a.z / l); };
const lerp = (a, b, k) => v(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const smooth = k => k * k * (3 - 2 * k);
const UP = v(0, 1, 0);
const SH = { left: v(-0.17, 1.4, 0.05), right: v(0.17, 1.4, 0.05) };
const REST = { left: v(-0.3, 1.1, -0.25), right: v(0.3, 1.1, -0.25) };
const FLAME_UP = 0.1;

// direction to launch at speed S from L so the arc passes through T (the flatter of the two solutions)
export function aimDir(L, T, S, g = WT.gravity) {
  const dx = T.x - L.x, dz = T.z - L.z, dy = T.y - L.y, h = Math.hypot(dx, dz);
  const disc = S ** 4 - g * (g * h * h + 2 * dy * S * S);
  const th = disc < 0 ? Math.PI / 4 : Math.atan((S * S - Math.sqrt(disc)) / (g * h));
  return v(dx / h * Math.cos(th), Math.sin(th), dz / h * Math.cos(th));
}

export function createDemo(world) {
  const H = {};
  for (const s of ['left', 'right']) H[s] = { pos: REST[s], gesture: 'open', q: [], from: REST[s], t: 0, aim: null, normal: UP, fromN: UP };
  const key = (s, to, dur, gesture, opt = {}) => H[s].q.push(Object.assign({ to, dur, gesture }, opt));

  function throwAt(s, target, S) {
    const hz = (() => { const d = v(target.x - SH[s].x, 0, target.z - SH[s].z), l = Math.hypot(d.x, d.z); return v(d.x / l, 0, d.z / l); })();
    const R = add(add(SH[s], scale(hz, 0.42)), v(0, 0.02, 0));
    const d = aimDir(add(R, v(0, FLAME_UP, 0)), target, S);
    const u = S / FT.throwGain, W = add(R, scale(d, -0.4)), after = add(R, scale(d, 0.05));
    key(s, W, 0.9, 'open'); key(s, W, 0.25, 'open');
    key(s, R, 0.4 / u, 'open', { linear: true }); key(s, after, 0.16, 'open', { linear: true });
    key(s, REST[s], 0.9, 'open');
  }
  function reachIn(s, bowl) {
    key(s, add(bowl.pos, v(0, 0.25, 0.1)), 0.8, 'open'); key(s, add(bowl.pos, v(0, 0.05, 0)), 0.4, 'open'); key(s, add(bowl.pos, v(0, 0.3, 0.1)), 0.5, 'open');
  }
  // A: reach an open hand toward the fire, close it, yank the fist back
  function grabYank(s, bowl) {
    const d = norm(sub(bowl.pos, SH[s])), out = add(SH[s], scale(d, 0.5)), back = add(SH[s], add(scale(d, 0.12), v(0, -0.08, -0.05)));
    key(s, out, 0.9, 'open'); key(s, out, 0.4, 'open'); key(s, out, 0.3, 'fist');
    key(s, back, 0.2, 'fist', { linear: true }); key(s, back, 0.8, 'fist'); key(s, back, 0.3, 'open');
  }
  // pour: arm out toward the target, palm turned to face it, hold, then turn the palm back up
  function pourAt(s, target, secs) {
    const d = norm(sub(target, SH[s])), out = add(SH[s], scale(d, 0.5));
    key(s, out, 0.9, 'open'); key(s, out, 0.25, 'open', { normal: d }); key(s, out, secs, 'open', { normal: d }); key(s, out, 0.3, 'open');
    key(s, REST[s], 0.8, 'open');
  }
  function wait(secs) { key('left', REST.left, secs, 'open'); }

  const B = () => world.bowls, T = () => world.targets(), D = () => world.dummies;
  const plan = [
    () => reachIn('right', B()[1]),
    () => pourAt('right', D()[0].center, 1.8),
    () => wait(0.5),
    () => throwAt('right', T().near, 7),
    () => grabYank('left', B()[2]),
    () => throwAt('left', T().mid, 9),
    () => grabYank('right', B()[3]),
    () => pourAt('right', T().wall, 3.4),
    () => wait(2),
    () => grabYank('left', B()[4]),
    () => pourAt('left', D()[1].center, 3.4),
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
        h.pos = lerp(h.from, k.to, e); h.gesture = k.gesture; h.aim = k.aim || null;
        h.normal = norm(lerp(h.fromN, k.normal || UP, Math.min(1, f * 3)));
        if (f >= 1) { h.q.shift(); h.from = h.pos; h.fromN = h.normal; h.t = 0; if (k.then) k.then(); }
      }
      out[s] = { tracked: true, mode: 'hand', palm: h.pos, normal: h.normal, pinchPoint: h.pos, flamePos: add(add(h.pos, v(0, 0.07, 0)), scale(h.normal, 0.03)),
        gesture: h.gesture, curl: h.gesture === 'fist' ? 0.05 : 0.11, head: v(0, 1.6, 0), facing: v(0, 0, -1) };
    }
    return out;
  }
  return { update, step: () => step };
}
