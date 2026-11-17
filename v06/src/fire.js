// Elemental Proving Ground VR, draft v06 · pulling lab
// What one hand does: take a flame from a fire, then throw it. Takes a gesture each frame and reports what happened.
// Works the same for tracked hands and for controllers (main.js maps the buttons).
//
// Taking, always on:
//   empty  --put your hand into a near bowl-->  ready
// Taking from a distance, two styles (switched from the wrist button):
//   A, grab and yank:   empty --open hand reaching toward a fire (it glows), close the hand-->  locked
//                       locked --pull the fist back toward you-->  pulling (the flame flies over)  -->  ready
//                       opening the hand lets go of the lock
//   B, two-finger draw: empty --point index (and middle) finger at a fire, hold briefly (it glows)-->  locked
//                       locked --draw the hand back toward you-->  pulling  -->  ready
//                       stopping pointing lets go of the lock
//   The harder you pull, the faster the flame comes.
// Throwing (v05 style B, unchanged): ready --swing-->  throw, released at the fastest point of the swing.
//
// No aim help on throws. Hand velocity is measured against game time (the summed frame step).

export const FT = {
  // taking
  nearTake: 0.08,       // palm within the bowl radius plus this takes the flame (reach right in)
  aimCone: { A: 12, B: 8 },   // degrees off the aim ray a fire may be (plus its own size) to glow
  aimRange: 12,
  reach: 0.3,           // A: hand at least this far from the shoulder counts as reaching toward a fire
  aimGrace: 0.25,       // A: closing the hand nudges the arm, so a fire that glowed this recently can still be grabbed
  pointHold: 0.15,      // B: seconds pointing at the same fire before it locks
  pointGrace: 0.15,     // B: pointing may flicker off this long without losing the lock
  pullSpeed: 1.0,       // m/s of hand moving back toward you that pulls
  flight: { min: 0.15, max: 0.7 },   // seconds the pulled flame takes to arrive
  afterThrow: 0.35,     // an empty hand ignores fires for this long after a throw
  grabCurl: 0.078,      // fingers curled tighter than this: the hand is closed
  releaseCurl: 0.088,   // and opened past this: open again (gap so tracking noise does not flicker)
  // throwing (v05)
  armDelay: 0.3,
  throwGain: 1.8,
  minLaunch: 2.5, maxLaunch: 14,
  velWindow: 0.07,
  swingSpeed: { hand: 1.6, controller: 2.1 },
  releaseDrop: 0.75,
  maxSwing: 0.25,
  forward: 0.2,
  lostThrow: true,
  maxStep: 15,          // a jump faster than this (m/s) between two frames is a tracking glitch
  viewCone: 0.26,       // throws only leave from a hand in front of you (cosine, about 75 degrees)
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = a => Math.hypot(a.x, a.y, a.z);
const dist = (a, b) => len(sub(a, b));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const copy = a => ({ x: a.x, y: a.y, z: a.z });
const DEG = Math.PI / 180;

export function createHand(side) {
  return { side, state: 'empty', timer: 0, armed: false, armT: 0, hist: [], vel: { x: 0, y: 0, z: 0 },
    flamePos: null, swing: null, closed: false, wasClosed: false, mode: 'hand',
    target: null, targetT: 0, aimT: 0, src: null, offT: 0, pullFrom: null, pullK: 0, pullDur: 0, pullT: 0 };
}

export function shoulderOf(h, head) {
  const hd = head || { x: 0, y: 1.6, z: 0 };
  return { x: hd.x + (h.side === 'left' ? -0.17 : 0.17), y: hd.y - 0.2, z: hd.z + 0.05 };
}

// the fire the ray points at: smallest angle off the ray, allowing for the fire's own size
export function pickSource(from, dir, sources, coneDeg) {
  let best = null, bs = Infinity;
  for (const s of sources) {
    const to = sub(s.pos, from), d = len(to);
    if (d < 0.3 || d > FT.aimRange) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(norm(to), dir)))) / DEG - Math.atan2(s.r || 0, d) / DEG;
    if (ang < coneDeg && ang < bs) { bs = ang; best = s; }
  }
  return best;
}

function inView(h) {
  if (!h.facing || !h.head) return true;
  return dot(norm(sub(h.flamePos, h.head)), norm(h.facing)) > FT.viewCone;
}
function launch(h, vel, how, emit) {
  if (!inView(h)) { h.swing = null; h.armed = false; emit('blocked', { side: h.side, how }); return; }
  const handSpeed = len(vel), s = Math.max(FT.minLaunch, Math.min(FT.maxLaunch, handSpeed * FT.throwGain));
  emit('throw', { side: h.side, how, pos: copy(h.flamePos), vel: scale(norm(vel), s), handSpeed });
  h.state = 'empty'; h.timer = FT.afterThrow; h.swing = null; h.armed = false; h.armT = 0;
}
function land(h) { h.state = 'ready'; h.armT = 0; h.armed = false; h.swing = null; h.src = null; h.target = null; h.pullFrom = null; }
function unlock(h, emit, why) { emit('unlock', { side: h.side, why }); h.state = 'empty'; h.src = null; h.target = null; h.aimT = 0; }

// inp: { tracked, mode:'hand'|'controller', palm, normal, flamePos, gesture, curl, point, pointFrom, pointDir, head, facing }
// sources: [{ id, pos, r, near }]  (near: in reach, can be taken by putting your hand in it)
// style: 'A' | 'B'
// emit(type, data): aim, lock, unlock, pullStart, take, throw, blocked, glitch
export function stepHand(h, inp, dt, t, style, sources, emit) {
  if (!inp || !inp.tracked) {
    if (FT.lostThrow && h.state === 'ready' && h.swing && h.flamePos) launch(h, h.swing.vel, 'lost', emit);
    if (h.state === 'locked') unlock(h, emit, 'lost');
    h.hist.length = 0; h.vel = { x: 0, y: 0, z: 0 }; h.swing = null; h.target = null;
    return;
  }
  if (h.mode !== inp.mode) { h.hist.length = 0; h.swing = null; }
  h.mode = inp.mode;
  const prevP = h.hist.length ? h.hist[h.hist.length - 1] : null;
  if (prevP && t > prevP.t && dist(inp.palm, prevP.p) / (t - prevP.t) > FT.maxStep) { h.hist.length = 0; h.swing = null; emit('glitch', { side: h.side }); }
  h.flamePos = copy(inp.flamePos || inp.palm);
  if (inp.head) h.head = copy(inp.head);
  if (inp.facing) h.facing = copy(inp.facing);
  h.hist.push({ t, p: copy(inp.palm) });
  while (h.hist.length > 2 && t - h.hist[0].t > FT.velWindow) h.hist.shift();
  const a = h.hist[0], b = h.hist[h.hist.length - 1];
  h.vel = b.t > a.t ? scale(sub(b.p, a.p), 1 / (b.t - a.t)) : { x: 0, y: 0, z: 0 };

  // closed / open with a gap between thresholds; a pointing hand is not closed. Controllers: grip is closed, trigger is pointing.
  const g = inp.gesture, pointing = !!inp.point;
  if (inp.mode === 'controller') h.closed = g === 'fist';
  else if (pointing) h.closed = false;
  else if (g === 'fist') h.closed = true;
  else if (inp.curl !== undefined) h.closed = h.closed ? inp.curl < FT.releaseCurl : inp.curl < FT.grabCurl;
  const closing = h.closed && !h.wasClosed;
  h.wasClosed = h.closed;

  const shoulder = shoulderOf(h, inp.head);
  const toMe = norm(sub(shoulder, inp.palm)), pullV = dot(h.vel, toMe);

  switch (h.state) {
    case 'empty': {
      h.timer = Math.max(0, h.timer - dt);
      if (h.timer > 0) { h.target = null; break; }
      // reach right in
      const near = sources.find(s => s.near && dist(inp.palm, s.pos) < s.r + FT.nearTake);
      if (near) { land(h); emit('take', { side: h.side, from: copy(near.pos), how: 'reach', d: 0 }); break; }
      let seen = null;
      if (style === 'A') {
        const reaching = dist(inp.palm, shoulder) > FT.reach;
        const dir = inp.mode === 'controller' ? norm(inp.normal) : norm(sub(inp.palm, shoulder));
        if (reaching && !h.closed && !pointing) seen = pickSource(inp.palm, dir, sources, FT.aimCone.A);
        if (seen) { h.target = seen; h.targetT = t; }
        else if (h.target && t - h.targetT > FT.aimGrace) h.target = null;
        if (closing && h.target) { h.state = 'locked'; h.src = h.target; emit('lock', { side: h.side, from: copy(h.src.pos), style }); }
      } else {
        if (pointing && inp.pointDir) seen = pickSource(inp.pointFrom || inp.palm, inp.pointDir, sources, FT.aimCone.B);
        if (seen && h.target && seen.id === h.target.id) h.aimT += dt; else h.aimT = 0;
        h.target = seen;
        if (seen && h.aimT >= FT.pointHold) { h.state = 'locked'; h.src = seen; h.offT = 0; emit('lock', { side: h.side, from: copy(h.src.pos), style }); }
      }
      break;
    }
    case 'locked': {
      const live = sources.find(s => s.id === h.src.id);
      if (!live) { unlock(h, emit, 'gone'); break; }
      h.src = live;
      if (style === 'A' && !h.closed) { unlock(h, emit, 'opened'); break; }
      if (style === 'B') {
        h.offT = pointing ? 0 : h.offT + dt;
        if (h.offT > FT.pointGrace) { unlock(h, emit, 'stopped pointing'); break; }
      }
      if (pullV > FT.pullSpeed) {
        const d = dist(h.src.pos, inp.palm);
        h.state = 'pulling'; h.pullFrom = copy(h.src.pos); h.pullK = 0; h.pullT = 0;
        h.pullDur = Math.max(FT.flight.min, Math.min(FT.flight.max, d / (3 + 4 * pullV)));
        emit('pullStart', { side: h.side, from: copy(h.pullFrom), speed: pullV, d, style });
      }
      break;
    }
    case 'pulling': {
      h.pullT += dt; h.pullK = Math.min(1, h.pullT / h.pullDur);
      if (h.pullK >= 1) { const from = h.pullFrom; land(h); emit('take', { side: h.side, from, how: 'pull', d: dist(from, inp.palm), style }); }
      break;
    }
    case 'ready': {
      // throw: a flick, released at the fastest point of the swing (v05 B)
      h.armT += dt;
      const speed = len(h.vel), dir = norm(h.vel);
      const fwd = inp.facing ? norm({ x: inp.facing.x, y: 0, z: inp.facing.z }) : null;
      const forward = fwd ? dot(dir, fwd) > FT.forward : dot(dir, norm(sub(inp.palm, shoulder))) > -0.2;
      if (!h.swing) {
        if (h.armT > FT.armDelay && speed > FT.swingSpeed[inp.mode] && forward) h.swing = { peak: speed, vel: copy(h.vel), t: 0 };
      } else {
        h.swing.t += dt;
        if (speed > h.swing.peak) { h.swing.peak = speed; h.swing.vel = copy(h.vel); }
        if (speed < h.swing.peak * FT.releaseDrop || h.swing.t > FT.maxSwing) launch(h, h.swing.vel, 'flick', emit);
      }
      break;
    }
  }
}

// The wrist button. A fingertip within `on` metres presses it once; it has to move `off` metres away before it can press again.
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
