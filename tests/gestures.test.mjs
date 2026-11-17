// Run with: node tests/gestures.test.mjs
import assert from 'node:assert/strict';
import { readHand } from '../v04/src/gestures.js';

let n = 0; const ok = s => console.log(`ok ${++n} ${s}`);
const P = (x, y, z) => ({ x, y, z });

// A right hand, palm facing down, fingers pointing forward (-Z), wrist at (0, 1, 0).
function hand({ pose = 'open', palmUp = false, mirror = false } = {}) {
  const J = {
    'wrist': P(0, 1, 0),
    'index-finger-phalanx-proximal': P(-0.035, 1, -0.09),
    'middle-finger-phalanx-proximal': P(-0.01, 1, -0.095),
    'pinky-finger-phalanx-proximal': P(0.04, 1, -0.08),
    'thumb-tip': P(-0.09, 1, -0.06),
  };
  if (pose === 'open') Object.assign(J, { 'index-finger-tip': P(-0.04, 1, -0.17), 'middle-finger-tip': P(-0.01, 1, -0.18), 'ring-finger-tip': P(0.015, 1, -0.17), 'pinky-finger-tip': P(0.04, 1, -0.15) });
  if (pose === 'fist') Object.assign(J, { 'index-finger-tip': P(-0.035, 0.965, -0.05), 'middle-finger-tip': P(-0.01, 0.965, -0.055), 'ring-finger-tip': P(0.012, 0.965, -0.05), 'pinky-finger-tip': P(0.035, 0.965, -0.045), 'thumb-tip': P(-0.02, 0.96, -0.07) });
  if (pose === 'pinch') Object.assign(J, { 'index-finger-tip': P(-0.085, 1, -0.07), 'middle-finger-tip': P(-0.01, 1, -0.18), 'ring-finger-tip': P(0.015, 1, -0.17), 'pinky-finger-tip': P(0.04, 1, -0.15), 'thumb-tip': P(-0.08, 1, -0.065) });
  for (const k in J) {
    let p = J[k];
    if (palmUp) p = P(-p.x, 2 - p.y, p.z); // roll the hand over around the forearm
    if (mirror) p = P(-p.x, p.y, p.z);     // the same pose on the left hand
    J[k] = p;
  }
  return J;
}

{
  const open = readHand(hand(), 'right'), fist = readHand(hand({ pose: 'fist' }), 'right'), pinch = readHand(hand({ pose: 'pinch' }), 'right');
  assert.equal(open.gesture, 'open'); assert.equal(fist.gesture, 'fist'); assert.equal(pinch.gesture, 'pinch');
  ok('reads open hand, fist and pinch');
  assert.equal(open.palmDown, true); assert.ok(open.normal.y < -0.9);
  const up = readHand(hand({ palmUp: true }), 'right');
  assert.equal(up.palmDown, false); assert.ok(up.normal.y > 0.9);
  const left = readHand(hand({ mirror: true }), 'left');
  assert.equal(left.palmDown, true); assert.equal(left.gesture, 'open');
  ok('palm direction is right for both hands, up and down');
  assert.equal(readHand({ wrist: P(0, 0, 0) }, 'right'), null);
  ok('missing joints give no reading');
}

console.log(`\n${n} checks passed`);
