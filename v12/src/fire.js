// Elemental Proving Ground VR, draft v12 · the yank: quick yank (A) vs pull back (B); aim is the headset's pointing ray
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
//   ready  --push the hand out from in front of you, ending palm forward-->  jet at once (v09: a push is never a throw)
//   jet    --turn the palm away, or close the hand-->  ready (whatever flame is left stays in your hand)
//   jet    --fuel runs out-->  empty
//
// The jet only starts with the arm out in front of you and the hand fairly still, so the palm-forward moment of an
// overhand wind-up (hand beside the head) does not trigger it, and a flick never turns into a jet.

export const FT = {
  // taking
  nearTake: 0.08,
  aimCone: 9,           // degrees off the aim ray a far fire may be (plus its own size) to glow (v06: 12)
  aimMode: 'ray',       // v11 compared 'arm' (shoulder through hand) with 'ray' (the Quest's own pointing ray); Faisal: B slightly better, so v12 uses the ray
  yankMode: 'quick',    // v12 A/B: 'quick' = a short sharp tug; 'pull' = draw your fist back a set distance at any speed, like a rope
  quickSpeed: 0.6,      // quick yank: hand speed back toward your body that fetches (v06 to v11: 1.0 toward the shoulder only)
  pullDist: 0.15,       // pull back: how far your fist must come back toward your body
  yankBuffer: 0.25,     // a yank that starts up to this long before your hand counts as closed still counts (people grab and yank in one motion)
  stickExit: 4,         // v11: once a fire is selected it stays selected until you aim this many degrees past the cone...
  stickBetter: 4,       // ...or another fire is this many degrees closer to your aim (so the selection does not flicker between two fires)
  aimRange: 12,
  reach: 0.3,
  aimGrace: 0.12,       // closing the hand nudges the arm: a fire that glowed this recently, with no other glowing since, can still be grabbed
  pullSpeed: 1.0,
  flight: { min: 0.15, max: 0.7 },
  afterThrow: 0.35,
  grabCurl: 0.078, releaseCurl: 0.088,
  // jet
  jetFacing: 0.65,      // palm normal along where you face (cosine) to start; about 50 degrees (v07 0.6 too quick, v08 0.7 sometimes missed)
  jetKeep: 0.45,        // keeps going until it drops below this (about 63 degrees; a relaxed palm-down hand is about 0.37)
  jetOut: 0.32,         // to start: hand at least this far in front of the shoulder (along where you face): arm out (v07 0.22, v08 0.38)
  jetReach: 0.42,       // and at least this far from the shoulder (v08 0.45)
  jetKeepOut: 0.25,     // once pouring, the arm may bend back to this before it stops
  jetStill: 1.2,        // and moving slower than this (m/s)
  jetHold: 0.25,        // seconds holding still in that pose before the jet starts (v07 0.2, v08 0.35)
  pushFrom: 0.1,        // a swing that starts this far in front of the shoulder is a push, not a throw (throws wind up beside or behind the head)
  openCurl: 0.08,       // fingers out at least this far count as an open hand for the jet (v08 0.085)
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
    fuel: 0, poseT: 0, poseK: 0, offT: 0, jetAcc: 0, jetDir: { x: 0, y: 0, z: -1 },
    aiming: false, aimFrom: null, aimDir: null, peakPull: 0, pullSpeedNow: 0, lastPull: null, trail: [], grabFrom: null, grabDir: null, pullProgress: 0 };
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

// v11: the same, but sticky. The fire already selected (current) is kept unless you aim clearly away from it or clearly at another.
export function pickSticky(from, dir, sources, coneDeg, current) {
  let best = null, bs = Infinity, curAng = Infinity;
  for (const s of sources) {
    if (s.near) continue;
    const to = sub(s.pos, from), d = len(to);
    if (d < 0.3 || d > FT.aimRange) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(norm(to), dir)))) / DEG - Math.atan2(s.r || 0, d) / DEG;
    if (current && s.id === current.id) curAng = ang;
    if (ang < bs) { bs = ang; best = s; }
  }
  if (current && curAng < coneDeg + FT.stickExit && !(best && best.id !== current.id && bs < curAng - FT.stickBetter && bs < coneDeg)) return sources.find(s => s.id === current.id);
  return best && bs < coneDeg ? best : null;
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
function unlock(h, emit, why) { emit('unlock', { side: h.side, why, peak: h.peakPull, back: h.pullBack || 0, yank: FT.yankMode }); h.pullProgress = 0; h.state = 'empty'; h.src = null; h.target = null; }

// inp: { tracked, mode:'hand'|'controller', palm, normal, flamePos, gesture, curl, head, facing }
//   controllers: normal is the controller's forward; gesture 'pinch' (trigger) pours the jet
// sources: [{ id, pos, r, near }]
// emit(type, data): lock, unlock, pullStart, take, throw, blocked, glitch, jetStart, jetDrop, jetStop
export function stepHand(h, inp, dt, t, sources, emit) {
  if (!inp || !inp.tracked) {
    if (FT.lostThrow && h.state === 'ready' && h.swing && h.flamePos) launch(h, h.swing.vel, 'lost', emit);
    if (h.state === 'locked') unlock(h, emit, 'lost');
    if (h.state === 'jet') { h.state = 'ready'; emit('jetStop', { side: h.side }); }
    h.hist.length = 0; h.trail.length = 0; h.vel = { x: 0, y: 0, z: 0 }; h.swing = null; h.target = null; h.poseT = 0;
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
  h.trail.push({ t, p: copy(inp.palm), v: null }); while (h.trail.length > 2 && t - h.trail[0].t > 0.5) h.trail.shift();
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
  // v12: "back toward you" is toward your chest, from wherever your hand is: straight back, back and down, back and across all count
  // (toward your chest or toward your hip on that side, whichever the hand is moving along more)
  const hd = inp.head || { x: shoulder.x, y: shoulder.y + 0.2, z: shoulder.z };
  const chest = { x: hd.x, y: hd.y - 0.35, z: hd.z }, hip = { x: shoulder.x, y: hd.y - 0.65, z: hd.z };
  const toMe = norm(sub(chest, inp.palm)), toHip = norm(sub(hip, inp.palm));
  const pullV = Math.max(dot(h.vel, toMe), dot(h.vel, toHip));
  h.trail[h.trail.length - 1].v = pullV;
  const fwd = inp.facing ? norm({ x: inp.facing.x, y: 0, z: inp.facing.z }) : { x: 0, y: 0, z: -1 };
  const speed = len(h.vel);
  if (speed < 0.8 || !h.calmP) h.calmP = copy(inp.palm);   // where the hand last rested: where a swing or push started

  // the jet pose: arm out in front, palm (controller: trigger) forward, hand fairly still, not closed
  const palmFwd = inp.mode === 'controller' ? (g === 'pinch' ? 1 : -1) : dot(norm(inp.normal), fwd);
  // to start: arm fully out and hand fully open (not just relaxed); to keep going it may ease off a little
  const out = dot(sub(inp.palm, shoulder), fwd), extended = out > FT.jetOut && dist(inp.palm, shoulder) > FT.jetReach;
  const openHand = g === 'open' || (inp.curl !== undefined && inp.curl > FT.openCurl);
  const jetPose = k => palmFwd > k && !h.closed && (inp.mode === 'controller' || (k === FT.jetFacing ? extended && openHand : out > FT.jetKeepOut));

  switch (h.state) {
    case 'empty': {
      h.timer = Math.max(0, h.timer - dt); h.aiming = false;
      if (h.timer > 0) { h.target = null; break; }
      const near = sources.find(s => s.near && dist(inp.palm, s.pos) < s.r + FT.nearTake);
      if (near) { land(h); emit('take', { side: h.side, from: copy(near.pos), how: 'reach', d: 0 }); break; }
      const reaching = dist(inp.palm, shoulder) > FT.reach;
      // A: the line from your shoulder through your hand. B: the headset's pointing ray (controllers: the controller's own ray either way)
      const useRay = inp.mode === 'controller' || (FT.aimMode === 'ray' && inp.ray);
      const from = useRay && inp.ray ? inp.ray.from : inp.palm;
      const dir = inp.mode === 'controller' ? norm(inp.normal) : useRay ? norm(inp.ray.dir) : norm(sub(inp.palm, shoulder));
      h.aiming = reaching && !h.closed; h.aimFrom = copy(from); h.aimDir = copy(dir);
      const seen = h.aiming ? pickSticky(from, dir, sources, FT.aimCone, h.target) : null;
      if (seen) { h.target = seen; h.targetT = t; }
      else if (h.target && t - h.targetT > FT.aimGrace) h.target = null;
      if (closing && h.target) {
        h.state = 'locked'; h.src = h.target; h.peakPull = 0; h.aiming = false;
        // where the yank is measured from: the hand a moment before it closed, so a grab-and-yank in one motion counts
        const back = h.trail.find(e => t - e.t <= FT.yankBuffer) || h.trail[h.trail.length - 1];
        h.grabFrom = copy(back.p); h.grabDir = copy(toMe); h.grabDir2 = copy(toHip); h.lockT = t;
        emit('lock', { side: h.side, from: copy(h.src.pos), aim: FT.aimMode, yank: FT.yankMode });
      }
      break;
    }
    case 'locked': {
      const live = sources.find(s => s.id === h.src.id);
      if (!live) { unlock(h, emit, 'gone'); break; }
      h.src = live;
      if (!h.closed) { unlock(h, emit, 'opened'); break; }
      // quick: the fastest pull back in the last moment, including just before the hand closed; pull: how far the fist has come back
      let recent = 0; for (const e of h.trail) if (e.v !== null && t - e.t <= FT.yankBuffer && e.t >= h.lockT - FT.yankBuffer) recent = Math.max(recent, e.v);
      const moved = sub(inp.palm, h.grabFrom), back = Math.max(dot(moved, h.grabDir), dot(moved, h.grabDir2));
      h.pullSpeedNow = Math.max(0, pullV); h.peakPull = Math.max(h.peakPull, recent);
      h.pullBack = Math.max(0, back);
      h.pullProgress = FT.yankMode === 'pull' ? Math.min(1, h.pullBack / FT.pullDist) : Math.min(1, recent / FT.quickSpeed);
      const go = FT.yankMode === 'pull' ? back >= FT.pullDist : recent >= FT.quickSpeed;
      if (go) {
        h.lastPull = { speed: recent, t };
        const d = dist(h.src.pos, inp.palm);
        h.state = 'pulling'; h.pullFrom = copy(h.src.pos); h.pullK = 0; h.pullT = 0;
        h.pullDur = Math.max(FT.flight.min, Math.min(FT.flight.max, d / (3 + 4 * Math.max(recent, 0.6))));
        emit('pullStart', { side: h.side, from: copy(h.pullFrom), speed: recent, back: h.pullBack, d, aim: FT.aimMode, yank: FT.yankMode });
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
      h.poseK = inp.mode === 'controller' ? 0 : Math.min(1, h.poseT / FT.jetHold);   // for the view: the flame swells as the jet is about to start
      if (posing && h.poseT >= (inp.mode === 'controller' ? 0 : FT.jetHold)) {
        h.state = 'jet'; h.offT = 0; h.jetAcc = 0; h.poseT = 0;
        emit('jetStart', { side: h.side });
        break;
      }
      // the flick
      const dir = norm(h.vel);
      const forward = inp.facing ? dot(dir, fwd) > FT.forward : dot(dir, norm(sub(inp.palm, shoulder))) > -0.2;
      if (!h.swing) {
        if (h.armT > FT.armDelay && speed > FT.swingSpeed[inp.mode] && forward) h.swing = { peak: speed, vel: copy(h.vel), t: 0, startOut: dot(sub(h.calmP, shoulder), fwd) };
      } else {
        h.swing.t += dt;
        if (speed > h.swing.peak) { h.swing.peak = speed; h.swing.vel = copy(h.vel); }
        if (speed < h.swing.peak * FT.releaseDrop || h.swing.t > FT.maxSwing) {
          // a push: started in front of you and ends palm forward. It pours (arm out) or does nothing, but never throws.
          if (inp.mode === 'hand' && h.swing.startOut > FT.pushFrom && palmFwd > FT.jetFacing) {
            h.swing = null; h.poseT = 0;
            if (!h.closed && out > FT.jetKeepOut) { h.state = 'jet'; h.offT = 0; h.jetAcc = 0; emit('jetStart', { side: h.side, how: 'push' }); }
            else emit('pushed', { side: h.side });
          } else launch(h, h.swing.vel, 'flick', emit);
        }
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

// The wrist device's buttons (as v05's wrist button). A fingertip within `on` metres presses once; it has to move `off` metres away first.
export const BT = { on: 0.022, off: 0.04, cooldown: 0.6 };
export function createButton() { return { down: false, cool: 0 }; }
export function stepButton(b, tip, center, dt) {
  b.cool = Math.max(0, b.cool - dt);
  if (!tip || !center) { b.down = false; return false; }
  const d = len(sub(tip, center));
  if (b.down) { if (d > BT.off) b.down = false; return false; }
  if (d < BT.on && b.cool <= 0) { b.down = true; b.cool = BT.cooldown; return true; }
  return false;
}
