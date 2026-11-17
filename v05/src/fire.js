// Elemental Proving Ground VR, draft v05 · throwing lab
// What one hand does with its flame. Takes a gesture each frame and reports what happened.
// Works the same for tracked hands and for controllers (main.js maps grip and trigger to a closed hand).
//
// A flame appears in the hand on its own, and another one after every throw. Two ways to throw it:
//
//   Style A, hold and release (like v01):
//     ready (flame over the open palm)  --close the hand-->  held  --swing, open the hand-->  throw
//     opening the hand without a swing puts the flame back on the palm
//   Style B, flick (like v04):
//     ready (flame on the open palm)  --swing-->  throw, released at the fastest point of the swing
//
// No aim help: the flame leaves along the hand's own velocity, times throwGain. Both styles share the gain.
// Velocity is measured against game time (the summed frame step) so slow frames do not make swings read slow.

export const FT = {
  respawn: 0.45,        // seconds after a throw before the next flame appears
  armDelay: 0.3,        // B: after a flame appears, before a swing can throw it
  throwGain: 1.8,       // release speed = hand speed x this (v01 used 1.5, v04 2.6)
  minLaunch: 2.5, maxLaunch: 14,
  velWindow: 0.07,      // seconds of hand history per velocity sample
  // A
  grabCurl: 0.078,      // fingers curled tighter than this: the hand is closed around the flame
  releaseCurl: 0.088,   // and opened past this: let go (gap so tracking noise does not flicker)
  releaseLook: 0.12,    // on letting go, use the fastest hand velocity of the last this-many seconds (the hand opens a little late)
  minRelease: 1.0,      // slower than this when opening: no throw, the flame goes back on the palm
  // B
  swingSpeed: { hand: 1.6, controller: 2.1 },   // swing speed that starts a flick
  releaseDrop: 0.75,    // let go once the swing slows to this share of its peak
  maxSwing: 0.25,       // or after this long
  forward: 0.2,         // the swing must head at least this much along where you face (cosine), so a fast wind-up is not a throw
  // tracking lost mid-throw (fast swings often do this on Quest): throw with what was measured, if it was fast enough
  lostThrow: true,
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = a => Math.hypot(a.x, a.y, a.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const copy = a => ({ x: a.x, y: a.y, z: a.z });

export function createHand(side) {
  return { side, state: 'empty', timer: 0.2, armed: false, armT: 0, hist: [], vels: [], vel: { x: 0, y: 0, z: 0 },
    flamePos: null, swing: null, closed: false, mode: 'hand' };
}

function shoulderOf(h, head) {
  const hd = head || { x: 0, y: 1.6, z: 0 };
  return { x: hd.x + (h.side === 'left' ? -0.17 : 0.17), y: hd.y - 0.2, z: hd.z + 0.05 };
}

function launch(h, vel, style, how, emit) {
  const handSpeed = len(vel), s = Math.max(FT.minLaunch, Math.min(FT.maxLaunch, handSpeed * FT.throwGain));
  emit('throw', { side: h.side, style, how, pos: copy(h.flamePos), vel: scale(norm(vel), s), handSpeed });
  h.state = 'empty'; h.timer = FT.respawn; h.swing = null; h.armed = false; h.armT = 0;
}
function fastestRecent(h, t) {
  let best = null;
  for (const s of h.vels) if (t - s.t <= FT.releaseLook && (!best || len(s.v) > len(best))) best = s.v;
  return best || h.vel;
}

// inp: { tracked, mode:'hand'|'controller', palm, flamePos, gesture, curl, head, facing (head direction, optional) }
// style: 'A' | 'B'
// emit(type, data): spawn, grab, unclench, throw
export function stepHand(h, inp, dt, t, style, emit) {
  if (!inp || !inp.tracked) {
    // lost mid-throw: A while held, B mid-swing. Throw with what was measured if it was a real swing.
    if (FT.lostThrow && h.flamePos) {
      if (h.state === 'held') { const v = fastestRecent(h, t); if (len(v) >= FT.minRelease) launch(h, v, style, 'lost', emit); }
      else if (h.state === 'ready' && h.swing) launch(h, h.swing.vel, style, 'lost', emit);
    }
    h.hist.length = 0; h.vels.length = 0; h.vel = { x: 0, y: 0, z: 0 }; h.swing = null;
    return;
  }
  h.mode = inp.mode;
  h.flamePos = copy(inp.flamePos || inp.palm);
  h.hist.push({ t, p: copy(inp.palm) });
  while (h.hist.length > 2 && t - h.hist[0].t > FT.velWindow) h.hist.shift();
  const a = h.hist[0], b = h.hist[h.hist.length - 1];
  h.vel = b.t > a.t ? scale(sub(b.p, a.p), 1 / (b.t - a.t)) : { x: 0, y: 0, z: 0 };
  h.vels.push({ t, v: copy(h.vel) });
  while (h.vels.length && t - h.vels[0].t > FT.releaseLook) h.vels.shift();

  // closed / open with a gap between the two thresholds; controllers: grip or trigger is closed
  const g = inp.gesture;
  if (inp.mode === 'controller') h.closed = g === 'fist' || g === 'pinch';
  else if (g === 'fist') h.closed = true;
  else if (inp.curl !== undefined) h.closed = h.closed ? inp.curl < FT.releaseCurl : inp.curl < FT.grabCurl;
  else h.closed = g === 'pinch';

  switch (h.state) {
    case 'empty': {
      h.timer -= dt;
      if (h.timer <= 0) { h.state = 'ready'; h.armed = false; h.armT = 0; h.swing = null; emit('spawn', { side: h.side, pos: copy(h.flamePos) }); }
      break;
    }
    case 'ready': {
      h.armT += dt;
      if (!h.closed) h.armed = true;    // a hand that was already closed when the flame appeared has to open once first
      if (style === 'A') {
        h.swing = null;
        if (h.armed && h.closed) { h.state = 'held'; emit('grab', { side: h.side }); }
        break;
      }
      // B: flick. The swing starts above swingSpeed, moving away from the body, and lets go as it slows.
      // A wind-up (hand going back past your head) is fast too, so the swing has to head forward: along where you face, or else away from the shoulder.
      const speed = len(h.vel), dir = norm(h.vel);
      const fwd = inp.facing ? norm({ x: inp.facing.x, y: 0, z: inp.facing.z }) : null;
      const forward = fwd ? dot(dir, fwd) > FT.forward : dot(dir, norm(sub(inp.palm, shoulderOf(h, inp.head)))) > -0.2;
      if (!h.swing) {
        if (h.armT > FT.armDelay && speed > FT.swingSpeed[inp.mode] && forward) h.swing = { peak: speed, vel: copy(h.vel), t: 0 };
      } else {
        h.swing.t += dt;
        if (speed > h.swing.peak) { h.swing.peak = speed; h.swing.vel = copy(h.vel); }
        if (speed < h.swing.peak * FT.releaseDrop || h.swing.t > FT.maxSwing) launch(h, h.swing.vel, 'B', 'flick', emit);
      }
      break;
    }
    case 'held': {
      if (style !== 'A') { h.state = 'ready'; break; }
      if (!h.closed) {
        const v = fastestRecent(h, t);
        if (len(v) >= FT.minRelease) launch(h, v, 'A', 'open', emit);
        else { h.state = 'ready'; emit('unclench', { side: h.side }); }
      }
      break;
    }
  }
}

// The wrist button. A fingertip pressing within `on` metres of it presses it once;
// it has to move `off` metres away before it can press again.
export const BT = { on: 0.028, off: 0.05, cooldown: 0.5 };
export function createButton() { return { down: false, cool: 0 }; }
export function stepButton(b, tip, center, dt) {
  b.cool = Math.max(0, b.cool - dt);
  if (!tip || !center) { b.down = false; return false; }
  const d = len(sub(tip, center));
  if (b.down) { if (d > BT.off) b.down = false; return false; }
  if (d < BT.on && b.cool <= 0) { b.down = true; b.cool = BT.cooldown; return true; }
  return false;
}
