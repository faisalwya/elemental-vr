// Elemental Proving Ground VR, draft v07 · flamethrower lab
// What one hand does: take a flame, then throw it or pour it out as a jet. Takes a gesture each frame and reports what happened.
// Works the same for tracked hands and for controllers (main.js maps the buttons).
//
// Taking (v06, style A won):
//   empty  --put your hand into a near bowl-->  ready
//   empty  --open hand reaching toward a far fire (it glows), close the hand-->  locked
//   locked --pull the fist back toward you-->  pulling (the flame flies over)  -->  ready
// Using it, while you hold a flame:
//   ready  --swing-->  throw, released at the fastest point of the swing (v05 flick)
//   ready  --arm out in front, open palm turned forward, held a moment-->  jet: the flame pours out of your palm
//   jet    --turn the palm away, or close the hand-->  ready (whatever flame is left stays in your hand)
//   jet    --fuel runs out-->  empty
//
// The jet only starts with the arm out in front of you and the hand fairly still, so the palm-forward moment of an
// overhand wind-up (hand beside the head) does not trigger it, and a flick never turns into a jet.

export const FT = {
  // taking
  nearTake: 0.08,
  aimCone: 9,           // degrees off the aim ray a far fire may be (plus its own size) to glow (v06: 12)
  aimRange: 12,
  reach: 0.3,
  aimGrace: 0.12,       // closing the hand nudges the arm: a fire that glowed this recently, with no other glowing since, can still be grabbed
  pullSpeed: 1.0,
  flight: { min: 0.15, max: 0.7 },
  afterThrow: 0.35,
  grabCurl: 0.078, releaseCurl: 0.088,
  // jet
  jetFacing: 0.7,       // palm normal along where you face (cosine) to start; about 45 degrees (was 0.6; Faisal: triggered too quickly)
  jetKeep: 0.45,        // keeps going until it drops below this (about 63 degrees; a relaxed palm-down hand is about 0.37)
  jetOut: 0.38,         // to start: hand at least this far in front of the shoulder (along where you face), i.e. arm fully out (was 0.22)
  jetReach: 0.45,       // and at least this far from the shoulder
  jetKeepOut: 0.25,     // once pouring, the arm may bend back to this before it stops
  jetStill: 1.2,        // and moving slower than this (m/s)
  jetHold: 0.35,        // seconds in that pose before the jet starts (was 0.2)
  jetGrace: 0.12,       // the pose may flicker off this long without stopping the jet
  fuel: 3,              // seconds of jet in one flame
  jetRate: 45, jetSpeed: 9,
  // throwing (v05)
  armDelay: 0.3, throwGain: 1.8, minLaunch: 2.5, maxLaunch: 14, velWindow: 0.07,
  swingSpeed: { hand: 1.6, controller: 2.1 }, releaseDrop: 0.75, maxSwing: 0.25, forward: 0.2,
  lostThrow: true, maxStep: 15, viewCone: 0.26,
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
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
    target: null, targetT: 0, src: null, pullFrom: null, pullK: 0, pullDur: 0, pullT: 0,
    fuel: 0, poseT: 0, offT: 0, jetAcc: 0, jetDir: { x: 0, y: 0, z: -1 } };
}

export function shoulderOf(h, head) {
  const hd = head || { x: 0, y: 1.6, z: 0 };
  return { x: hd.x + (h.side === 'left' ? -0.17 : 0.17), y: hd.y - 0.2, z: hd.z + 0.05 };
}

// the far fire the ray points at: smallest angle off the ray, allowing for the fire's own size. Near bowls are reach-in only.
export function pickSource(from, dir, sources, coneDeg) {
  let best = null, bs = Infinity;
  for (const s of sources) {
    if (s.near) continue;
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
  emit('throw', { side: h.side, how, pos: copy(h.flamePos), vel: scale(norm(vel), s), handSpeed, fuel: h.fuel / FT.fuel });
  h.state = 'empty'; h.timer = FT.afterThrow; h.swing = null; h.armed = false; h.armT = 0; h.fuel = 0;
}
function land(h) { h.state = 'ready'; h.armT = 0; h.armed = false; h.swing = null; h.src = null; h.target = null; h.pullFrom = null; h.fuel = FT.fuel; h.poseT = 0; }
function unlock(h, emit, why) { emit('unlock', { side: h.side, why }); h.state = 'empty'; h.src = null; h.target = null; }

// inp: { tracked, mode:'hand'|'controller', palm, normal, flamePos, gesture, curl, head, facing }
//   controllers: normal is the controller's forward; gesture 'pinch' (trigger) pours the jet
// sources: [{ id, pos, r, near }]
// emit(type, data): lock, unlock, pullStart, take, throw, blocked, glitch, jetStart, jetDrop, jetStop
export function stepHand(h, inp, dt, t, sources, emit) {
  if (!inp || !inp.tracked) {
    if (FT.lostThrow && h.state === 'ready' && h.swing && h.flamePos) launch(h, h.swing.vel, 'lost', emit);
    if (h.state === 'locked') unlock(h, emit, 'lost');
    if (h.state === 'jet') { h.state = 'ready'; emit('jetStop', { side: h.side }); }
    h.hist.length = 0; h.vel = { x: 0, y: 0, z: 0 }; h.swing = null; h.target = null; h.poseT = 0;
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

  const g = inp.gesture;
  if (inp.mode === 'controller') h.closed = g === 'fist';
  else if (g === 'fist') h.closed = true;
  else if (inp.curl !== undefined) h.closed = h.closed ? inp.curl < FT.releaseCurl : inp.curl < FT.grabCurl;
  const closing = h.closed && !h.wasClosed;
  h.wasClosed = h.closed;

  const shoulder = shoulderOf(h, inp.head);
  const toMe = norm(sub(shoulder, inp.palm)), pullV = dot(h.vel, toMe);
  const fwd = inp.facing ? norm({ x: inp.facing.x, y: 0, z: inp.facing.z }) : { x: 0, y: 0, z: -1 };
  const speed = len(h.vel);

  // the jet pose: arm out in front, palm (controller: trigger) forward, hand fairly still, not closed
  const palmFwd = inp.mode === 'controller' ? (g === 'pinch' ? 1 : -1) : dot(norm(inp.normal), fwd);
  // to start: arm fully out and hand fully open (not just relaxed); to keep going it may ease off a little
  const out = dot(sub(inp.palm, shoulder), fwd), extended = out > FT.jetOut && dist(inp.palm, shoulder) > FT.jetReach;
  const openHand = g === 'open' || (inp.curl !== undefined && inp.curl > 0.085);
  const jetPose = k => palmFwd > k && !h.closed && (inp.mode === 'controller' || (k === FT.jetFacing ? extended && openHand : out > FT.jetKeepOut));

  switch (h.state) {
    case 'empty': {
      h.timer = Math.max(0, h.timer - dt);
      if (h.timer > 0) { h.target = null; break; }
      const near = sources.find(s => s.near && dist(inp.palm, s.pos) < s.r + FT.nearTake);
      if (near) { land(h); emit('take', { side: h.side, from: copy(near.pos), how: 'reach', d: 0 }); break; }
      const reaching = dist(inp.palm, shoulder) > FT.reach;
      const dir = inp.mode === 'controller' ? norm(inp.normal) : norm(sub(inp.palm, shoulder));
      const seen = reaching && !h.closed ? pickSource(inp.palm, dir, sources, FT.aimCone) : null;
      if (seen) { h.target = seen; h.targetT = t; }
      else if (h.target && t - h.targetT > FT.aimGrace) h.target = null;
      if (closing && h.target) { h.state = 'locked'; h.src = h.target; emit('lock', { side: h.side, from: copy(h.src.pos) }); }
      break;
    }
    case 'locked': {
      const live = sources.find(s => s.id === h.src.id);
      if (!live) { unlock(h, emit, 'gone'); break; }
      h.src = live;
      if (!h.closed) { unlock(h, emit, 'opened'); break; }
      if (pullV > FT.pullSpeed) {
        const d = dist(h.src.pos, inp.palm);
        h.state = 'pulling'; h.pullFrom = copy(h.src.pos); h.pullK = 0; h.pullT = 0;
        h.pullDur = Math.max(FT.flight.min, Math.min(FT.flight.max, d / (3 + 4 * pullV)));
        emit('pullStart', { side: h.side, from: copy(h.pullFrom), speed: pullV, d });
      }
      break;
    }
    case 'pulling': {
      h.pullT += dt; h.pullK = Math.min(1, h.pullT / h.pullDur);
      if (h.pullK >= 1) { const from = h.pullFrom; land(h); emit('take', { side: h.side, from, how: 'pull', d: dist(from, inp.palm) }); }
      break;
    }
    case 'ready': {
      h.armT += dt;
      // the jet: hold the pose a moment, never mid-swing
      const posing = !h.swing && jetPose(FT.jetFacing) && speed < FT.jetStill;
      h.poseT = posing ? h.poseT + dt : 0;
      if (posing && h.poseT >= (inp.mode === 'controller' ? 0 : FT.jetHold)) {
        h.state = 'jet'; h.offT = 0; h.jetAcc = 0; h.poseT = 0;
        emit('jetStart', { side: h.side });
        break;
      }
      // the flick
      const dir = norm(h.vel);
      const forward = inp.facing ? dot(dir, fwd) > FT.forward : dot(dir, norm(sub(inp.palm, shoulder))) > -0.2;
      if (!h.swing) {
        if (h.armT > FT.armDelay && speed > FT.swingSpeed[inp.mode] && forward) h.swing = { peak: speed, vel: copy(h.vel), t: 0 };
      } else {
        h.swing.t += dt;
        if (speed > h.swing.peak) { h.swing.peak = speed; h.swing.vel = copy(h.vel); }
        if (speed < h.swing.peak * FT.releaseDrop || h.swing.t > FT.maxSwing) launch(h, h.swing.vel, 'flick', emit);
      }
      break;
    }
    case 'jet': {
      h.offT = jetPose(FT.jetKeep) ? 0 : h.offT + dt;
      if (h.offT > FT.jetGrace) { h.state = 'ready'; h.armT = 0; emit('jetStop', { side: h.side, fuel: h.fuel / FT.fuel }); break; }
      // the stream leaves the palm along the palm's direction, steadied a little toward the arm's line
      const want = inp.mode === 'controller' ? norm(inp.normal) : norm(add(scale(norm(inp.normal), 0.7), scale(norm(sub(inp.palm, shoulder)), 0.3)));
      h.jetDir = norm(add(scale(h.jetDir, 0.6), scale(want, 0.4)));
      h.fuel -= dt; h.jetAcc += dt * FT.jetRate;
      const from = add(inp.palm, scale(norm(inp.mode === 'controller' ? inp.normal : inp.normal), 0.05));
      while (h.jetAcc >= 1) { h.jetAcc -= 1; emit('jetDrop', { side: h.side, pos: copy(from), vel: add(scale(h.jetDir, FT.jetSpeed), h.vel) }); }
      if (h.fuel <= 0) { h.fuel = 0; h.state = 'empty'; h.timer = FT.afterThrow; emit('jetStop', { side: h.side, fuel: 0, out: true }); }
      break;
    }
  }
}
