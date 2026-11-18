// Elemental Proving Ground VR, draft v11 · the courtyard
// Fire bowls to take from (two in reach, three at 2.5, 4.5 and 7 m), three big targets at 3, 6 and 9 m,
// a wall of crates to knock down or burn, three straw dummies, and (new in v08, see createProps at the end)
// hay bales, paper lanterns, a bell on a rope, a fuse to fireworks, an ice block, barrels and a patch of dry grass.
// Anything burning is also a fire you can pull from.
// No aim help: a throw flies exactly where the hand sent it. Player stands at the origin facing -Z.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL, rnd, lambert, glow, sphereGeo, makeFlame, updateFlame, makeGlow, swayMaterial } from './fx.js';

export const WT = {
  gravity: 5,          // floaty on purpose (real gravity is 9.8), same as v01 to v04
  radius: 0.12,
  life: 6,
  impulse: 10,         // crate push per throw, scaled by speed
  wallRebuild: 5,      // seconds after the last hit on a knocked wall before it stacks itself again
  jet: { gravity: 2, radius: 0.06, life: 0.6, push: 0.15 },   // reaches about 5 m
  heat: { ball: 1, jet: 0.05 },   // 1 sets a dry thing alight: one throw, or about half a second of jet
  burn: { dummy: 6, crate: 8 },   // seconds alight before it chars
  spread: 0.6,         // heat per second a burning crate gives crates touching it
  regrow: 6,           // seconds a charred dummy stands before it is fresh straw again
};

/* ---------- v10: four stations in one bigger courtyard. Each is a living-room-sized patch (about 2 x 2 m) with its
   own bowl to reach into; everything else stands around its edges. Positions below are local to a station:
   [x to your right, d in front of you], as you stand on the station facing its things. ---------- */
export const STATIONS = [
  { name: 'Practice range', O: [0, 0], F: [0, -1] },
  { name: 'Burn yard', O: [-7, -5], F: [-1, 0] },
  { name: 'Machine corner', O: [7, -5], F: [1, 0] },
  { name: 'Frozen corner', O: [0, -15], F: [0, -1] },
];
// local [x, d] on station s -> world [x, z]
export function at(s, x, d) { const S = STATIONS[s], Rx = -S.F[1], Rz = S.F[0]; return [S.O[0] + Rx * x + S.F[0] * d, S.O[1] + Rz * x + S.F[1] * d]; }
export const DUMMIES = [at(1, 1.6, 2.4), at(1, 0.0, 3.9)];   // the burn yard: one stands in the dry grass

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
const CS = 0.42;               // crate size
const WALL = { at: at(2, 0, 4.4), face: STATIONS[2].O, cols: 4, rows: 4 };   // the machine corner
// fire bowls: near ones you reach into (world [x, z]); far ones to pull from (world [x, z], height, distance from their station)
export const NEAR_BOWLS = [[-0.55, -0.55], [0.55, -0.55], at(1, 0.55, 0.55), at(2, 0.55, 0.55), at(3, 0.55, 0.55)];
export const FAR_BOWLS = [[...at(0, -2.45, 0.52), 1.1, 2.5], [...at(0, 3.9, 2.25), 1.2, 4.5], [...at(1, -2.4, 1.0), 1.15, 2.6], [...at(2, -2.6, 0.4), 1.15, 2.6], [...at(3, 2.2, 2.4), 1.2, 3.3]];
export const TARGETS = [   // the practice range (station 0 stands at the origin facing -Z)        // [distance m, bearing degrees (negative = left), centre height m, radius m]
  [3, -30, 1.4, 0.5],
  [6, -6, 1.8, 0.6],
  [9, 16, 2.3, 0.75],
];

let dummies_n = 0;
const crateGeo = new THREE.BoxGeometry(CS, CS, CS), crateEdges = new THREE.EdgesGeometry(crateGeo);
const edgeMat = new THREE.LineBasicMaterial({ color: COL.ink });

export function createWorld(scene, fx) {
  const W = { shots: [], events: [], t: 0 };
  const emit = (type, data = {}) => W.events.push(Object.assign({ type }, data));
  const P = fx.particles;

  /* ---------- the targets: big painted discs on posts, with their distance written above ---------- */
  const discTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    [[128, '#ece6d8'], [104, '#d8322a'], [80, '#ece6d8'], [56, '#d8322a'], [32, '#ece6d8'], [14, '#14161d']].forEach(([r, col]) => { g.fillStyle = col; g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#14161d'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const discs = TARGETS.map(([d, deg, y, r]) => {
    const a = deg * DEG, pos = V(Math.sin(a) * d, y, -Math.cos(a) * d);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, y - r, 6), lambert(COL.ink)); pole.position.set(pos.x, (y - r) / 2, pos.z); scene.add(pole);
    const mat = new THREE.MeshLambertMaterial({ map: discTex, side: THREE.DoubleSide, emissive: 0xffa040, emissiveIntensity: 0 });
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat); m.position.copy(pos); m.lookAt(0, 1.5, 0); scene.add(m);
    const back = new THREE.Mesh(new THREE.CircleGeometry(r + 0.04, 40), lambert(COL.ink, { side: THREE.DoubleSide })); back.position.copy(pos); back.lookAt(0, 1.5, 0); back.translateZ(-0.01); scene.add(back);
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = '#ece6d8'; g.font = '700 80px "Barlow Condensed",sans-serif'; g.textAlign = 'center'; g.fillText(d + ' m', 128, 78);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.24 * d ** 0.6, 0.09 * d ** 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    label.position.copy(pos).add(V(0, r + 0.1 * d ** 0.6, 0)); label.lookAt(0, 1.5, 0); scene.add(label);
    const normal = V(0, 1.5, 0).sub(pos).normalize();
    return { pos, r, d, mat, normal, flash: 0, label };
  });

  /* ---------- fire bowls: always burning, take from them as often as you like (no lights, to keep the Quest fast) ---------- */
  const bowlGeo = new THREE.CylinderGeometry(1, 0.5, 0.6, 16), legGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 6);
  const bowls = [
    ...NEAR_BOWLS.map(([x, z]) => ({ pos: V(x, 0.9, z), r: 0.2, near: true, d: 0.8 })),
    ...FAR_BOWLS.map(([x, z, y, d]) => ({ pos: V(x, y, z), r: 0.25 + d * 0.03, near: false, d })),
  ].map((B, id) => {
    const p = B.pos, r = B.r;
    const bowl = new THREE.Mesh(bowlGeo, lambert(0x30323c)); bowl.scale.set(r * 1.1, r * 0.6, r * 1.1); bowl.position.set(p.x, p.y - r * 0.35, p.z); scene.add(bowl);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094, leg = new THREE.Mesh(legGeo, lambert(COL.ink)); leg.scale.y = p.y - 0.1;
      leg.position.set(p.x + Math.cos(a) * r * 0.55, (p.y - 0.1) / 2, p.z + Math.sin(a) * r * 0.55); scene.add(leg);
    }
    const coals = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a22 })); coals.position.set(p.x, p.y - r * 0.18, p.z); scene.add(coals);
    const flames = [0, 1, 2].map(i => { const f = makeFlame(r * rnd(0.9, 1.3), scene, true); f.position.set(p.x + (i - 1) * r * 0.4, p.y - r * 0.2, p.z + (i % 2) * r * 0.3 - r * 0.15); return f; });
    const glow = makeGlow(COL.fire, r * 6, 0.5); glow.position.set(p.x, p.y + r * 0.3, p.z); scene.add(glow);
    return Object.assign(B, { id, flames, glow });
  });

  /* ---------- crate wall (rebuilt on its own a few seconds after you knock it) ---------- */
  const wallAt = V(WALL.at[0], 0, WALL.at[1]);
  const wallYaw = Math.atan2(WALL.face[0] - wallAt.x, WALL.face[1] - wallAt.z);   // face the station
  let phys, crates = [], wallRoot = null, lastWallHit = 0;
  function buildWall() {
    if (wallRoot) scene.remove(wallRoot);
    wallRoot = new THREE.Group(); scene.add(wallRoot);
    if (phys) crates.forEach(c => phys.removeBody(c.body));
    crates = [];
    const q = new CANNON.Quaternion(); q.setFromEuler(0, wallYaw, 0);
    const across = V(Math.cos(wallYaw), 0, -Math.sin(wallYaw));
    for (let row = 0; row < WALL.rows; row++) {
      const n = WALL.cols - (row % 2), off = row % 2 ? 0.5 : 0;
      for (let i = 0; i < n; i++) {
        const k = (i + off - (WALL.cols - 1) / 2) * (CS + 0.01);
        const p = wallAt.clone().addScaledVector(across, k).setY(CS / 2 + row * (CS + 0.002));
        const mat = lambert(row % 2 ? COL.wood : 0x9a7652), m = new THREE.Mesh(crateGeo, mat);
        m.add(new THREE.LineSegments(crateEdges, edgeMat)); m.position.copy(p); m.rotation.y = wallYaw; wallRoot.add(m);
        const body = new CANNON.Body({ mass: 1.5, shape: new CANNON.Box(new CANNON.Vec3(CS / 2, CS / 2, CS / 2)), position: new CANNON.Vec3(p.x, p.y, p.z), quaternion: q.clone() });
        body.sleepSpeedLimit = 0.15; body.sleepTimeLimit = 0.5; phys.addBody(body); body.sleep();
        body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 1.5) emit('thud', { v }); });
        crates.push({ mesh: m, body, start: p.clone(), half: CS / 2, mat, base: mat.color.getHex(), heat: 0, state: 'dry', burnT: 0, flame: makeFlame(0.38, wallRoot) });
      }
    }
  }
  function build() {
    phys = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.8, 0) });
    phys.allowSleep = true; phys.broadphase = new CANNON.SAPBroadphase(phys); phys.solver.iterations = 12;
    phys.defaultContactMaterial.friction = 0.5; phys.defaultContactMaterial.restitution = 0.08;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); phys.addBody(ground);
    crates = []; buildWall();
    W.shots.length = 0;
  }

  /* ---------- helpers ---------- */
  const cv = new CANNON.Vec3(), cq = new CANNON.Quaternion();
  function inBody(body, half, p, r) {
    cv.set(p.x - body.position.x, p.y - body.position.y, p.z - body.position.z);
    body.quaternion.conjugate(cq); const l = cq.vmult(cv);
    return Math.abs(l.x) < half + r && Math.abs(l.y) < half + r && Math.abs(l.z) < half + r;
  }
  const wallMoved = () => crates.filter(c => V(c.body.position.x, c.body.position.y, c.body.position.z).distanceTo(c.start) > 0.25).length;
  const groundFires = [];

  // segment test so fast throws cannot pass through a thin disc between frames
  const tmp = V();
  function discHit(a, b) {
    for (const D of discs) {
      const da = tmp.copy(a).sub(D.pos).dot(D.normal), db = tmp.copy(b).sub(D.pos).dot(D.normal);
      if (da > WT.radius && db > WT.radius) continue;
      if (da < -WT.radius && db < -WT.radius) continue;
      const k = da === db ? 0 : Math.max(0, Math.min(1, da / (da - db)));
      const p = a.clone().lerp(b, k), off = tmp.copy(p).sub(D.pos).addScaledVector(D.normal, -tmp.copy(p).sub(D.pos).dot(D.normal)).length();
      if (off < D.r + WT.radius * 0.5) return { D, p, off };
    }
    return null;
  }

  /* ---------- straw dummies: catch fire, burn, char, then grow back ---------- */
  const dummies = DUMMIES.map(([x, z]) => {
    const p = V(x, 0, z);
    const g = new THREE.Group(); g.position.copy(p); scene.add(g);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), lambert(COL.ink)); post.position.y = 0.95; g.add(post);
    const mat = lambert(COL.straw);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.85, 12), mat); torso.position.y = 1.15; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), mat); head.position.y = 1.78; g.add(head);
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6).rotateZ(Math.PI / 2), mat); arms.position.y = 1.4; g.add(arms);
    const flames = [makeFlame(0.5, scene), makeFlame(0.36, scene)];
    flames[0].position.set(p.x - 0.05, 0.85, p.z); flames[1].position.set(p.x + 0.07, 1.55, p.z);
    return { pos: p, center: V(p.x, 1.25, p.z), mat, flames, heat: 0, state: 'dry', burnT: 0, id: 100 + dummies_n++ };
  });
  function heatUp(o, amount, at) {
    if (o.state !== 'dry') return;
    o.heat += amount;
    if (Math.random() < 0.3) P.burst('ember', at || (o.center || o.mesh.position), 1, 0.4);
    if (o.heat >= 1) { o.state = 'burning'; o.burnT = 0; (o.flames || [o.flame]).forEach(f => { f.userData.target = 1; }); P.burst('fire', o.center || o.mesh.position, 18, 1.2); emit('ignite', { pos: (o.center || o.mesh.position).clone(), what: o.center ? 'dummy' : 'crate' }); }
  }

  /* ---------- the v08 things that react to fire ---------- */
  const props = createProps(scene, P, emit, {
    // a burst: pushes crates away and sets light things alight
    blast(c, R) {
      crates.forEach(cr => {
        const d = cr.mesh.position.distanceTo(c); if (d > R) return;
        const dir = cr.mesh.position.clone().sub(c).normalize(), k = 16 * (1 - d / R) + 2;
        cr.body.wakeUp(); cr.body.applyImpulse(new CANNON.Vec3(dir.x * k, Math.abs(dir.y) * k + k * 0.5, dir.z * k), new CANNON.Vec3(0, 0, 0));
        heatUp(cr, 1); lastWallHit = W.t;
      });
      dummies.forEach(d => { if (Math.hypot(d.pos.x - c.x, d.pos.z - c.z) < R) heatUp(d, 2); });
    },
    shake() { emit('thud', { v: 8 }); },
    // fire on the ground heats a dummy standing in it
    heatAt(at, amount) { dummies.forEach(d => { if (Math.hypot(d.pos.x - at.x, d.pos.z - at.z) < 0.35) heatUp(d, amount); }); },
  });

  /* ---------- public ---------- */
  // a throw: flies along vel with gravity, nothing bends it
  // kind: 'ball' (a throw) or 'jet' (one droplet of the stream)
  W.addShot = (pos, vel, kind = 'ball') => {
    W.shots.push({ kind, pos: V(pos.x, pos.y, pos.z), vel: V(vel.x, vel.y, vel.z), age: 0, id: Math.random(), from: V(pos.x, pos.y, pos.z) });
  };
  W.dummies = dummies;
  W.props = props;
  W.discs = discs;
  W.stations = STATIONS;
  W.bowls = bowls;
  // fires you can pull from: the bowls, and anything burning
  W.sources = () => {
    const s = bowls.slice();
    dummies.forEach(d => { if (d.state === 'burning') s.push({ id: d.id, pos: d.center, r: 0.35, near: false }); });
    crates.forEach((c, i) => { if (c.state === 'burning') s.push({ id: 200 + i, pos: c.mesh.position, r: 0.3, near: false }); });
    return s.concat(props.sources());
  };
  W.targets = () => Object.assign({ near: discs[0].pos.clone(), mid: discs[1].pos.clone(), far: discs[2].pos.clone(), wall: wallAt.clone().setY(0.9) }, props.targets());
  W.status = () => Object.assign({ wallMoved: wallMoved(), crates: crates.map(c => c.state[0]).join(''), dummies: dummies.map(d => d.state[0]).join(''), shots: W.shots.length }, props.status());

  /* ---------- per frame ---------- */
  const prev = V();
  W.update = (dt, t) => {
    W.t = t;
    phys.step(1 / 72, dt, 3);

    for (let i = W.shots.length - 1; i >= 0; i--) {
      const s = W.shots[i];
      prev.copy(s.pos);
      const jet = s.kind === 'jet', rad = jet ? WT.jet.radius : WT.radius;
      s.vel.y -= (jet ? WT.jet.gravity : WT.gravity) * dt;
      s.pos.addScaledVector(s.vel, dt); s.age += dt;
      let gone = false;
      if (jet) {
        if (props.hit(s, prev)) { W.shots.splice(i, 1); continue; }
        if (s.pos.y < rad) props.ground(s.pos, 'jet');
        const c = crates.find(c => inBody(c.body, c.half, s.pos, rad));
        const dm = dummies.find(d => Math.hypot(s.pos.x - d.pos.x, s.pos.z - d.pos.z) < 0.26 + rad && s.pos.y > 0.6 && s.pos.y < 1.98);
        if (c) { c.body.wakeUp(); const dir = s.vel.clone().normalize(); c.body.applyImpulse(new CANNON.Vec3(dir.x * WT.jet.push, dir.y * WT.jet.push, dir.z * WT.jet.push), new CANNON.Vec3(0, 0, 0)); heatUp(c, WT.heat.jet, s.pos); lastWallHit = t; gone = true; }
        else if (dm) { heatUp(dm, WT.heat.jet, s.pos); gone = true; }
        else if (discHit(prev, s.pos)) { gone = true; }
        else if (s.pos.y < rad || s.age > WT.jet.life) { if (s.pos.y < rad && Math.random() < 0.3) P.burst('fire', s.pos, 1, 0.4); gone = true; }
        if (gone) W.shots.splice(i, 1);
        continue;
      }
      if (props.hit(s, prev)) { emit('hit', { what: 'prop', pos: s.pos.clone() }); W.shots.splice(i, 1); continue; }
      const dm = dummies.find(d => Math.hypot(s.pos.x - d.pos.x, s.pos.z - d.pos.z) < 0.26 + rad && s.pos.y > 0.6 && s.pos.y < 1.98);
      if (dm) { heatUp(dm, WT.heat.ball, s.pos); P.burst('fire', s.pos, 22, 1.3); emit('hit', { what: 'dummy', pos: s.pos.clone() }); W.shots.splice(i, 1); continue; }
      const dh = discHit(prev, s.pos);
      if (dh) {
        dh.D.flash = 1; s.pos.copy(dh.p);
        P.burst('fire', dh.p, 22, 1.3);
        emit('hit', { what: 'disc', d: dh.D.d, off: dh.off, r: dh.D.r, pos: dh.p.clone(), style: s.style });
        gone = true;
      } else {
        const c = crates.find(c => inBody(c.body, c.half, s.pos, WT.radius));
        if (c) {
          const dir = s.vel.clone().normalize(), amount = WT.impulse * Math.min(1.6, s.vel.length() / 7);
          c.body.wakeUp();
          c.body.applyImpulse(new CANNON.Vec3(dir.x * amount, dir.y * amount + amount * 0.1, dir.z * amount), new CANNON.Vec3(s.pos.x - c.body.position.x, s.pos.y - c.body.position.y, s.pos.z - c.body.position.z));
          P.burst('fire', s.pos, 22, 1.3); lastWallHit = t; heatUp(c, WT.heat.ball, s.pos);
          emit('hit', { what: 'wall', pos: s.pos.clone(), style: s.style });
          gone = true;
        } else if (s.pos.y < WT.radius * 0.6) {
          const at = V(s.pos.x, 0.02, s.pos.z);
          props.ground(at, 'ball');
          const gf = { t: 1.4, flame: makeFlame(0.3, scene, true) }; gf.flame.position.copy(at); groundFires.push(gf);
          P.burst('fire', at, 12, 1);
          emit('miss', { pos: at, style: s.style, flat: Math.hypot(at.x - s.from.x, at.z - s.from.z) });
          gone = true;
        } else if (s.age > WT.life || s.pos.length() > 25) { emit('miss', { pos: s.pos.clone(), style: s.style }); gone = true; }
      }
      if (gone) W.shots.splice(i, 1);
    }

    for (let i = groundFires.length - 1; i >= 0; i--) {
      const g = groundFires[i]; g.t -= dt;
      if (g.t < 0.4) g.flame.userData.target = 0;
      updateFlame(g.flame, dt, t);
      if (g.t <= 0) { scene.remove(g.flame); groundFires.splice(i, 1); }
    }

    crates.forEach(c => { c.mesh.position.copy(c.body.position); c.mesh.quaternion.copy(c.body.quaternion); });
    // burning: crates heat the crates touching them, char after a while; dummies char, then grow back
    for (const c of crates) {
      if (c.state === 'burning') {
        c.burnT += dt;
        c.flame.position.set(c.mesh.position.x, c.mesh.position.y + 0.15, c.mesh.position.z);
        if (Math.random() < dt * 3) P.burst('smoke', c.mesh.position.clone().setY(c.mesh.position.y + 0.5), 1, 0.5);
        crates.forEach(n => { if (n !== c && n.state === 'dry' && n.mesh.position.distanceTo(c.mesh.position) < CS * 1.25) heatUp(n, WT.spread * dt); });
        if (c.burnT > WT.burn.crate) { c.state = 'charred'; c.flame.userData.target = 0; c.mat.color.set(COL.char); P.burst('smoke', c.mesh.position, 6, 0.8); }
        lastWallHit = t;   // the wall stacks itself again 5 s after the last crate stops burning
      }
      updateFlame(c.flame, dt, t);
    }
    for (const d of dummies) {
      if (d.state === 'burning') {
        d.burnT += dt;
        if (Math.random() < dt * 4) P.burst('ember', d.center, 1, 0.6);
        if (d.burnT > 1) props.ignitedBy(d.pos, 0.3);   // a burning dummy lights the grass it stands in
        if (Math.random() < dt * 3) P.burst('smoke', d.center.clone().setY(2.0), 1, 0.6);
        if (d.burnT > WT.burn.dummy) { d.state = 'charred'; d.burnT = 0; d.flames.forEach(f => { f.userData.target = 0; }); d.mat.color.set(COL.char); P.burst('smoke', d.center, 10, 0.8); emit('char', { what: 'dummy' }); }
      } else if (d.state === 'charred') {
        d.burnT += dt;
        if (d.burnT > WT.regrow) { d.state = 'dry'; d.heat = 0; d.mat.color.set(COL.straw); P.burst('ember', d.center, 8, 0.6); }
      }
      d.flames.forEach(f => updateFlame(f, dt, t));
    }
    const charred = crates.some(c => c.state === 'charred'), burning = crates.some(c => c.state === 'burning');
    if ((wallMoved() > 0 || charred) && !burning && t - lastWallHit > WT.wallRebuild) {
      crates.forEach(c => P.burst('ember', c.mesh.position, 4, 0.8));
      buildWall(); emit('rebuild', {});
    }
    discs.forEach(D => { D.flash *= Math.exp(-3 * dt); D.mat.emissiveIntensity = D.flash * 0.9; });
    bowls.forEach(B => { B.flames.forEach(f => updateFlame(f, dt, t)); B.glow.material.opacity = 0.5 + Math.sin(t * 7 + B.id) * 0.08; });
    props.update(dt, t);
  };

  W.reset = build;
  build();
  return W;
}

/* ======================================================================================================
   Things that react to fire (v08). Each one does something different:
   hay bales flare and spread, paper lanterns float away, a rope burns through and drops a bell,
   a fuse runs past candles to fireworks, an ice block melts to free a flame, barrels burst,
   and a patch of dry grass carries fire across the ground.
   hit(shot, prev) takes a shot that touched one of them; ground(at, kind) is where a shot came down.
   ====================================================================================================== */
export const PT = {
  // burn yard (station 1)
  hay: { at: at(1, -1.6, 3.0), face: STATIONS[1].O, burn: 7, regrow: 14, spread: 1.4 },
  grass: { x0: at(1, 0.4, 3.4)[0], z0: at(1, 2.8, 3.4)[1], cols: 5, rows: 6, cell: 0.4, burn: 2.8, regrow: 16, spread: 0.45 },   // local x 0.4..2.8, d 1.4..3.4
  // machine corner (station 2)
  bell: { at: at(2, -2.6, 2.6), reset: 10 },
  fuse: [at(2, 0.6, 0.9), at(2, 1.4, 1.6), at(2, 2.0, 2.6), at(2, 2.4, 3.4)],
  barrels: { at: [at(2, -1.4, 4.0), at(2, 1.4, 4.0)], ball: 1, jet: 0.03, fuse: 1.3, reach: 2.6, back: 10 },   // one throw, or about 0.75 s of jet
  // frozen corner (station 3)
  ice: { at: at(3, -1.0, 1.7), size: 0.75, ball: 0.2, jet: 0.02, refreeze: 25 },   // about a second of jet on it
  lanterns: { a: at(3, -2.3, 3.3), b: at(3, 2.3, 3.6), top: 3.4, n: 6, heatJet: 0.25, regrow: 14 },
};

function createProps(scene, P, emit, ctx) {
  const X = { all: [] };
  const groundY = 0.02;

  /* ---------- hay bales: catch at once, flare up, light their neighbours ---------- */
  const hayGroup = new THREE.Group(); hayGroup.position.set(PT.hay.at[0], 0, PT.hay.at[1]); hayGroup.rotation.y = Math.atan2(PT.hay.face[0] - PT.hay.at[0], PT.hay.face[1] - PT.hay.at[1]); scene.add(hayGroup);
  const baleGeo = new THREE.BoxGeometry(0.9, 0.45, 0.5), baleEdges = new THREE.EdgesGeometry(baleGeo), twineMat = new THREE.LineBasicMaterial({ color: 0x7a5a2a });
  const hay = [[-0.92, 0.225], [0, 0.225], [0.92, 0.225], [-0.46, 0.68], [0.46, 0.68]].map(([x, y], i) => {
    const mat = lambert(0xd8b25a), m = new THREE.Mesh(baleGeo, mat); m.position.set(x, y, 0); m.add(new THREE.LineSegments(baleEdges, twineMat)); hayGroup.add(m);
    hayGroup.updateMatrixWorld(true);
    const center = m.getWorldPosition(V());
    const flames = [makeFlame(0.75, scene), makeFlame(0.5, scene)]; flames[0].position.copy(center).setY(center.y + 0.1); flames[1].position.copy(center).add(V(0.25, 0.2, 0));
    return { kind: 'hay', mat, base: 0xd8b25a, center, flames, heat: 0, state: 'dry', burnT: 0, id: 400 + i };
  });

  /* ---------- paper lanterns on a line: lit, they float up into the sky ---------- */
  const LA = V(PT.lanterns.a[0], PT.lanterns.top, PT.lanterns.a[1]), LB = V(PT.lanterns.b[0], PT.lanterns.top, PT.lanterns.b[1]);
  for (const p of [LA, LB]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, p.y, 6), lambert(0x5a3e2a)); pole.position.set(p.x, p.y / 2, p.z); scene.add(pole); }
  {
    const d = LB.clone().sub(LA), line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4).translate(0, 0.5, 0), lambert(0x2a2622));
    line.position.copy(LA); line.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); line.scale.y = d.length(); scene.add(line);
  }
  const paperGeo = new THREE.CylinderGeometry(0.13, 0.11, 0.3, 12), capGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10);
  const lanterns = Array.from({ length: PT.lanterns.n }, (_, i) => {
    const k = (i + 1) / (PT.lanterns.n + 1), home = LA.clone().lerp(LB, k); home.y -= 0.32;
    const g = new THREE.Group(); g.position.copy(home); scene.add(g);
    const mat = new THREE.MeshLambertMaterial({ color: [0xf2d7a8, 0xe9a9a0, 0xf2c78a][i % 3], emissive: 0xff8a3a, emissiveIntensity: 0 });
    g.add(new THREE.Mesh(paperGeo, mat));
    const capMat = lambert(0x7a2a22); const c1 = new THREE.Mesh(capGeo, capMat); c1.position.y = 0.16; const c2 = c1.clone(); c2.position.y = -0.16; g.add(c1, c2);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 3), lambert(0x2a2622)); str.position.y = 0.25; g.add(str);
    const glw = makeGlow(0xffb060, 1.1, 0); g.add(glw);
    return { g, mat, str, glw, home, state: 'hang', heat: 0, t: 0, vy: 0, seed: rnd(10) };
  });

  /* ---------- the bell on a rope: burn the rope and it drops; hit the bell and it rings ---------- */
  const BG = V(PT.bell.at[0], 0, PT.bell.at[1]), ROPE_TOP = 3.55, HANG = 2.62;
  {
    const postGeo = new THREE.BoxGeometry(0.16, 3.7, 0.16), wood = lambert(0x5a3e2a);
    for (const dx of [-0.85, 0.85]) { const m = new THREE.Mesh(postGeo, wood); m.position.set(BG.x + dx, 1.85, BG.z); scene.add(m); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.18), wood); beam.position.set(BG.x, 3.65, BG.z); scene.add(beam);
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.08, 16), lambert(0x4a4658)); slab.position.set(BG.x, 0.04, BG.z); scene.add(slab);
  }
  const bellPts = [[0.03, 0.62], [0.12, 0.6], [0.17, 0.52], [0.19, 0.32], [0.26, 0.1], [0.34, 0.01], [0.32, 0], [0.24, 0.08], [0.16, 0.3], [0.13, 0.5], [0.0, 0.55]].map(([x, y]) => new THREE.Vector2(x, y - 0.62));
  const bellMesh = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 24), lambert(COL.bronze, { side: THREE.DoubleSide, emissive: 0x3a2808 }));
  const bellG = new THREE.Group(); bellG.add(bellMesh); scene.add(bellG);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lambert(0x2a2622)); clapper.position.y = -0.5; bellG.add(clapper);
  const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6).translate(0, -0.5, 0), lambert(0xc8a46a)); scene.add(ropeMesh);
  const bell = { state: 'hang', y: HANG, vy: 0, swing: 0, t: 0, rope: 'intact', ropeHeat: 0, burnT: 0, flame: makeFlame(0.16, scene) };
  function placeBell() {
    bellG.position.set(BG.x, bell.y, BG.z);
    const len = bell.rope === 'cut' ? 0.3 : ROPE_TOP - HANG;
    ropeMesh.position.set(BG.x, ROPE_TOP, BG.z); ropeMesh.scale.y = bell.rope === 'burning' ? len * (1 - Math.min(1, bell.burnT / 1.4) * 0.7) : len;
  }

  /* ---------- the fuse: runs past three candles to the fireworks ---------- */
  const curve = new THREE.CatmullRomCurve3(PT.fuse.map(([x, z]) => V(x, 0.03, z)));
  const samples = curve.getSpacedPoints(Math.round(curve.getLength() / 0.06));
  const fuseInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.035, 0.07), lambert(0xffffff), samples.length);
  { const m4 = new THREE.Matrix4(), c = new THREE.Color(0xb59466); samples.forEach((p, i) => { fuseInst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)); fuseInst.setColorAt(i, c); }); scene.add(fuseInst); }
  { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.08, 10), lambert(COL.red)); cap.position.copy(samples[0]).setY(0.04); scene.add(cap); }
  const fuse = { state: new Uint8Array(samples.length), timer: new Float32Array(samples.length), dirty: false, doneT: 0 };
  const candles = [0.3, 0.55, 0.8].map((f, k) => {
    const i = Math.floor(f * (samples.length - 1)), p = samples[i], q = samples[Math.min(samples.length - 1, i + 1)];
    const side = V(q.z - p.z, 0, -(q.x - p.x)).normalize().multiplyScalar(k % 2 ? 0.22 : -0.22), base = p.clone().add(side).setY(0);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 10), lambert(COL.paper)); stick.position.copy(base).setY(0.15); scene.add(stick);
    const flame = makeFlame(0.12, scene); flame.position.copy(base).setY(0.31);
    return { idx: i, pos: base.clone().setY(0.33), lit: false, flame };
  });
  const end = samples[samples.length - 1];
  const rockets = [[-0.25, -0.25], [0.05, -0.45], [0.3, -0.22]].map(([dx, dz], k) => {
    const g = new THREE.Group(), start = V(end.x + dx, 0, end.z + dz); g.position.copy(start);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), lambert([COL.red, 0x2f6fb3, 0xe0b23a][k])); tube.position.y = 0.35; g.add(tube);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 10), lambert(COL.paper)); tip.position.y = 0.67; g.add(tip);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), lambert(COL.wood)); stick.position.set(0.06, 0.2, 0); g.add(stick);
    scene.add(g);
    return { g, start, state: 'idle', t: 0, delay: k * 0.45, vel: V(), color: [0xff5a4a, 0x7cc8ff, 0xffd27a][k] };
  });
  function lightFuse(at, r) {
    let best = -1, bd = r;
    samples.forEach((s, i) => { const d = Math.hypot(s.x - at.x, s.z - at.z); if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && fuse.state[best] === 0) { fuse.state[best] = 1; fuse.timer[best] = 0; fuse.dirty = true; emit('fuse', { pos: samples[best].clone() }); }
  }
  function lightCandle(c) { if (c.lit) return; c.lit = true; c.flame.userData.target = 1; P.burst('fire', c.pos, 6, 0.6); emit('candle', {}); }
  function launch(r, delay = 0) { if (r.state === 'idle') { r.state = 'lit'; r.t = -delay; } }

  /* ---------- the ice block: melts to free the flame frozen inside, which you can then pull ---------- */
  const IC = V(PT.ice.at[0], 0, PT.ice.at[1]);
  const iceMat = lambert(COL.ice, { emissive: 0x2a4a66, transparent: true, opacity: 0.8 });
  const iceMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), iceMat); iceMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(iceMesh.geometry), new THREE.LineBasicMaterial({ color: 0xeaf6ff }))); scene.add(iceMesh);
  const seed = new THREE.Mesh(sphereGeo, glow(COL.fire, 0.95)); seed.scale.setScalar(0.07); scene.add(seed);
  const seedGlow = makeGlow(COL.fire, 0.6, 0.6); scene.add(seedGlow);
  const ice = { hp: 1, state: 'frozen', t: 0, flame: makeFlame(0.3, scene), half: 0 };
  function placeIce() {
    const s = PT.ice.size * (0.25 + 0.75 * ice.hp); ice.half = s / 2;
    iceMesh.scale.setScalar(s); iceMesh.position.set(IC.x, s / 2, IC.z);
    seed.position.set(IC.x, Math.max(0.08, s / 2), IC.z); seedGlow.position.copy(seed.position);
  }
  ice.flame.position.set(IC.x, 0.05, IC.z);
  function melt(amount, at) {
    if (ice.state !== 'frozen') return;
    ice.hp = Math.max(0, ice.hp - amount);
    P.burst('steam', at, 3, 0.6); if (Math.random() < 0.4) P.burst('water', at, 2, 0.6);
    emit('melt', {});
    placeIce();
    if (ice.hp <= 0) {
      ice.state = 'free'; ice.t = 0; iceMesh.visible = seed.visible = seedGlow.visible = false; ice.flame.userData.target = 1;
      P.burst('steam', V(IC.x, 0.4, IC.z), 30, 1.4); P.burst('water', V(IC.x, 0.3, IC.z), 20, 1.2);
      emit('freed', { pos: V(IC.x, 0.3, IC.z) });
    }
  }

  /* ---------- barrels: heat them up and, after a hiss, they burst ---------- */
  const barrelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.85, 14), bandGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.05, 14);
  const barrels = PT.barrels.at.map(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const mat = lambert(0xa8322a); const body = new THREE.Mesh(barrelGeo, mat); body.position.y = 0.425; g.add(body);
    for (const y of [0.15, 0.7]) { const b = new THREE.Mesh(bandGeo, lambert(0x2a2622)); b.position.y = y; g.add(b); }
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.12, 14), lambert(0xe0b23a)); stripe.position.y = 0.43; g.add(stripe);
    return { g, mat, center: V(x, 0.43, z), heat: 0, state: 'ready', t: 0 };
  });
  function explode(B) {
    B.state = 'gone'; B.t = 0; B.g.visible = false;
    const c = B.center;
    P.burst('fire', c, 70, 3); P.burst('smoke', c, 20, 1.6); P.burst('firework', c, 40, 0.6, COL.hot); P.burst('ember', c, 30, 2);
    ctx.blast(c, PT.barrels.reach);
    hay.forEach(o => { if (o.center.distanceTo(c) < PT.barrels.reach) heat(o, 2); });
    barrels.forEach(o => { if (o !== B && o.state === 'ready' && o.center.distanceTo(c) < PT.barrels.reach) { o.heat = 1; o.state = 'lit'; o.t = PT.barrels.fuse - 0.25; } });
    grassNear(c, 1.6);
    emit('explode', { pos: c.clone() });
  }

  /* ---------- dry grass: fire runs across it cell by cell ---------- */
  const G = PT.grass, cells = [], BLADES = 6;
  const bladeGeo = new THREE.ConeGeometry(0.03, 1, 3).translate(0, 0.5, 0);
  const grassInst = new THREE.InstancedMesh(bladeGeo, swayMaterial(0xffffff), G.cols * G.rows * BLADES);
  for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
    const x = G.x0 + (c + 0.5) * G.cell, z = G.z0 + (r + 0.5) * G.cell;
    cells.push({ x, z, r, c, state: 0, t: 0, heat: 0, blades: Array.from({ length: BLADES }, () => ({ x: x + rnd(-0.18, 0.18), z: z + rnd(-0.18, 0.18), h: rnd(0.35, 0.6), ry: rnd(Math.PI), lean: rnd(-0.25, 0.25) })), flame: null });
  }
  scene.add(grassInst);
  const gm4 = new THREE.Matrix4(), gq = new THREE.Quaternion(), gs = new THREE.Vector3(), gp = new THREE.Vector3(), gc = new THREE.Color(), ge = new THREE.Euler();
  function drawGrass() {
    cells.forEach((cl, ci) => cl.blades.forEach((b, k) => {
      const burnt = cl.state === 2, h = burnt ? 0.08 : cl.state === 1 ? b.h * 0.8 : b.h;
      grassInst.setMatrixAt(ci * BLADES + k, gm4.compose(gp.set(b.x, 0, b.z), gq.setFromEuler(ge.set(b.lean, b.ry, b.lean * 0.5)), gs.set(1, h, 1)));
      grassInst.setColorAt(ci * BLADES + k, burnt ? gc.set(COL.char) : cl.state === 1 ? gc.set(0xff8a3a) : gc.setHSL(0.11 + b.lean * 0.05, 0.55, 0.52));
    }));
    grassInst.instanceMatrix.needsUpdate = true; grassInst.instanceColor.needsUpdate = true;
  }
  drawGrass();
  const grassFlames = Array.from({ length: 14 }, () => makeFlame(0.34, scene));
  let grassDirty = false, spreadT = 0;
  const cellAt = (x, z) => { const c = Math.floor((x - G.x0) / G.cell), r = Math.floor((z - G.z0) / G.cell); return c >= 0 && c < G.cols && r >= 0 && r < G.rows ? cells[r * G.cols + c] : null; };
  function igniteCell(cl) { if (!cl || cl.state !== 0) return; cl.state = 1; cl.t = 0; grassDirty = true; P.burst('fire', V(cl.x, 0.2, cl.z), 5, 0.6); if (Math.random() < 0.3) emit('grass', {}); }
  function grassNear(at, r) { cells.forEach(cl => { if (Math.hypot(cl.x - at.x, cl.z - at.z) < r) igniteCell(cl); }); }

  /* ---------- heat, shared ---------- */
  function heat(o, amount, at) {
    if (o.state !== 'dry') return;
    o.heat += amount;
    if (at && Math.random() < 0.3) P.burst('ember', at, 1, 0.4);
    if (o.heat >= 1) { o.state = 'burning'; o.burnT = 0; o.flames.forEach(f => { f.userData.target = 1; }); P.burst('fire', o.center, 22, 1.4); emit('ignite', { what: o.kind, pos: o.center.clone() }); }
  }
  const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };

  /* ---------- a shot touching something: returns true if it is used up ---------- */
  // a fast throw moves up to half a metre a frame, so test along the path since the last frame, not just where it is now
  X.hit = (s, prevP) => {
    const L = prevP.distanceTo(s.pos), n = Math.max(1, Math.ceil(L / 0.08)), p = V();
    for (let k = 1; k <= n; k++) { p.copy(prevP).lerp(s.pos, k / n); if (hitAt(p, s.kind === 'jet')) { s.pos.copy(p); return true; } }
    return false;
  };
  function hitAt(p, jet) {
    const rad = jet ? 0.06 : 0.12;
    for (const o of hay) if (p.distanceTo(o.center) < 0.42 + rad) { heat(o, jet ? 0.08 : 1, p); if (!jet) P.burst('fire', p, 18, 1.2); return true; }
    for (const L of lanterns) if (L.state === 'hang' && p.distanceTo(L.g.position) < 0.16 + rad) {
      L.heat += jet ? PT.lanterns.heatJet : 1;
      if (L.heat >= 1) { L.state = 'rise'; L.t = 0; L.vy = 0.15; L.str.visible = false; L.mat.emissiveIntensity = 1; L.glw.material.opacity = 0.8; P.burst('fire', L.g.position, 8, 0.6); emit('lantern', {}); }
      return true;
    }
    if (bell.rope === 'intact' && segDist(p, V(BG.x, ROPE_TOP, BG.z), V(BG.x, HANG, BG.z)) < 0.05 + rad) {
      bell.ropeHeat += jet ? 0.12 : 1;
      if (bell.ropeHeat >= 1) { bell.rope = 'burning'; bell.burnT = 0; bell.flame.userData.target = 1; emit('ignite', { what: 'rope', pos: p.clone() }); }
      return true;
    }
    if (bell.state === 'hang' && p.distanceTo(V(BG.x, bell.y - 0.3, BG.z)) < 0.34 + rad) {
      if (!jet || Math.random() < 0.04) { bell.swing = 1; emit('bell', {}); }
      if (!jet) P.burst('fire', p, 14, 1);
      return true;
    }
    for (const c of candles) if (c.pos.distanceTo(p) < 0.1 + rad) { lightCandle(c); return true; }
    for (const r of rockets) if (r.state === 'idle' && r.g.position.clone().setY(0.4).distanceTo(p) < 0.12 + rad) { launch(r); return true; }
    if (ice.state === 'frozen' && Math.abs(p.x - IC.x) < ice.half + rad && Math.abs(p.z - IC.z) < ice.half + rad && p.y < ice.half * 2 + rad) { melt(jet ? PT.ice.jet : PT.ice.ball, p); return true; }
    for (const B of barrels) if (B.state === 'ready' && Math.hypot(p.x - B.center.x, p.z - B.center.z) < 0.28 + rad && p.y < 0.9) {
      B.heat += jet ? PT.barrels.jet : PT.barrels.ball;
      B.mat.color.setRGB(0.66 + Math.min(1, B.heat) * 0.34, 0.2 + Math.min(1, B.heat) * 0.25, 0.16);
      if (!jet) P.burst('fire', p, 14, 1);
      if (B.heat >= 1) { B.state = 'lit'; B.t = 0; emit('barrelLit', {}); }
      return true;
    }
    if (jet && p.y < 0.6) { const cl = cellAt(p.x, p.z); if (cl && cl.state === 0) { cl.heat += 0.25; if (cl.heat >= 1) igniteCell(cl); return p.y < 0.35; } }
    return false;
  };
  // where a shot came down (ball: on landing; jet: a droplet reaching the ground)
  X.ground = (at, kind) => {
    lightFuse(at, kind === 'jet' ? 0.18 : 0.32);
    const cl = cellAt(at.x, at.z);
    if (cl) { if (kind === 'jet') { cl.heat += 0.25; if (cl.heat >= 1) igniteCell(cl); } else grassNear(at, 0.45); }
  };
  X.sources = () => {
    const s = [];
    hay.forEach(o => { if (o.state === 'burning') s.push({ id: o.id, pos: o.center, r: 0.4, near: false }); });
    if (ice.state === 'free') s.push({ id: 300, pos: V(IC.x, 0.3, IC.z), r: 0.28, near: false });
    return s;
  };
  X.targets = () => ({ hay: hay[1].center.clone(), lantern: lanterns[2].g.position.clone(), rope: V(BG.x, (ROPE_TOP + HANG) / 2, BG.z), bell: V(BG.x, HANG - 0.3, BG.z),
    fuse: samples[0].clone().setY(0.02), ice: V(IC.x, 0.15, IC.z), barrel: barrels[0].center.clone(), grass: V(G.x0 + G.cols * G.cell * 0.5, 0.02, G.z0 + G.rows * G.cell * 0.5) });
  X.status = () => ({ hay: hay.map(o => o.state[0]).join(''), lanterns: lanterns.map(L => L.state[0]).join(''), bell: bell.state + '/' + bell.rope,
    fuse: `${fuse.state.filter(x => x > 0).length}/${samples.length}`, candles: candles.filter(c => c.lit).length, rockets: rockets.map(r => r.state[0]).join(''),
    ice: ice.state === 'frozen' ? +ice.hp.toFixed(2) : ice.state, barrels: barrels.map(b => b.state[0]).join(''), grass: cells.map(c => c.state).join('') });

  /* ---------- per frame ---------- */
  X.update = (dt, t) => {
    // hay
    for (const o of hay) {
      if (o.state === 'burning') {
        o.burnT += dt;
        if (Math.random() < dt * 6) P.burst('ember', o.center, 1, 0.8);
        if (Math.random() < dt * 4) P.burst('smoke', o.center.clone().setY(o.center.y + 0.8), 1, 0.7);
        hay.forEach(n => { if (n !== o && n.center.distanceTo(o.center) < 1.1) heat(n, PT.hay.spread * dt); });
        grassNear(o.center, 0.6);
        if (o.burnT > PT.hay.burn) { o.state = 'charred'; o.burnT = 0; o.flames.forEach(f => { f.userData.target = 0; }); o.mat.color.set(COL.char); P.burst('smoke', o.center, 10, 0.8); }
      } else if (o.state === 'charred') {
        o.burnT += dt;
        if (o.burnT > PT.hay.regrow) { o.state = 'dry'; o.heat = 0; o.mat.color.set(o.base); P.burst('ember', o.center, 6, 0.5); }
      }
      o.flames.forEach(f => updateFlame(f, dt, t));
    }
    // lanterns
    for (const L of lanterns) {
      if (L.state === 'rise') {
        L.t += dt; L.vy = Math.min(1.1, L.vy + dt * 0.5);
        L.g.position.y += L.vy * dt; L.g.position.x += Math.sin(t * 0.7 + L.seed) * 0.15 * dt; L.g.position.z += Math.cos(t * 0.5 + L.seed) * 0.12 * dt - 0.05 * dt;
        L.g.rotation.z = Math.sin(t * 1.3 + L.seed) * 0.08;
        L.mat.emissiveIntensity = 0.85 + Math.sin(t * 13 + L.seed) * 0.15;
        if (Math.random() < dt * 3) P.sparks.spawn(L.g.position.x, L.g.position.y - 0.18, L.g.position.z, rnd(-0.05, 0.05), -0.2, rnd(-0.05, 0.05), 0.6, 0.012, COL.hot, -0.5);
        if (L.g.position.y > 24) { L.state = 'gone'; L.g.visible = false; }
      }
      if (L.state !== 'hang') {
        L.t += L.state === 'gone' ? dt : 0;
        if (L.t > PT.lanterns.regrow) { L.state = 'hang'; L.heat = 0; L.g.visible = true; L.g.position.copy(L.home); L.g.rotation.z = 0; L.str.visible = true; L.mat.emissiveIntensity = 0; L.glw.material.opacity = 0; P.burst('ember', L.home, 4, 0.4); }
      }
    }
    // bell
    if (bell.rope === 'burning') {
      bell.burnT += dt;
      bell.flame.position.set(BG.x, HANG + (ROPE_TOP - HANG) * Math.min(1, bell.burnT / 1.4) * 0.7, BG.z);
      if (Math.random() < dt * 20) P.burst('ember', bell.flame.position, 1, 0.5);
      if (bell.burnT > 1.4) { bell.rope = 'cut'; bell.flame.userData.target = 0; bell.state = 'fall'; bell.vy = 0; P.burst('fire', bell.flame.position, 12, 0.8); emit('snap', {}); }
    }
    updateFlame(bell.flame, dt, t);
    if (bell.state === 'fall') {
      bell.vy -= 9.8 * dt; bell.y += bell.vy * dt;
      if (bell.y - 0.62 <= 0.08) { bell.y = 0.7; bell.state = 'down'; bell.t = 0; bellG.rotation.z = 0.32; P.burst('smoke', V(BG.x, 0.2, BG.z), 18, 1.4); P.burst('ember', V(BG.x, 0.2, BG.z), 12, 1.2); emit('bellLand', {}); ctx.shake(BG); }
    } else if (bell.state === 'down') {
      bell.t += dt;
      if (bell.t > PT.bell.reset) { bell.state = 'hang'; bell.rope = 'intact'; bell.ropeHeat = 0; bell.y = HANG; bellG.rotation.z = 0; P.burst('ember', V(BG.x, HANG, BG.z), 10, 0.6); }
    } else if (bell.state === 'hang') { bell.swing *= Math.exp(-0.8 * dt); bellG.rotation.z = Math.sin(t * 5) * 0.3 * bell.swing; }
    placeBell();
    // fuse, candles, rockets
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      if (fuse.state[i] !== 1) continue;
      fuse.timer[i] += dt;
      if (fuse.timer[i] > 0.08) for (const j of [i - 1, i + 1]) if (j >= 0 && j < n && fuse.state[j] === 0) { fuse.state[j] = 1; fuse.timer[j] = -0.0001; fuse.dirty = true; }
      if (Math.random() < 0.5) { const s = samples[i]; P.sparks.spawn(s.x, s.y + 0.03, s.z, rnd(-0.6, 0.6), rnd(0.6, 1.4), rnd(-0.6, 0.6), rnd(0.2, 0.4), rnd(0.012, 0.025), Math.random() < 0.5 ? COL.hot : COL.white, -3); }
      if (fuse.timer[i] > 0.45) { fuse.state[i] = 2; fuse.dirty = true; }
      candles.forEach(c => { if (c.idx === i) lightCandle(c); });
      if (i === n - 1) rockets.forEach(r => launch(r, r.delay));
    }
    if (fuse.dirty) { const c = new THREE.Color(); for (let i = 0; i < n; i++) fuseInst.setColorAt(i, c.set(fuse.state[i] === 0 ? 0xb59466 : fuse.state[i] === 1 ? 0xffb050 : 0x2a2622)); fuseInst.instanceColor.needsUpdate = true; fuse.dirty = false; }
    if (fuse.state.some(x => x === 1) && Math.random() < dt * 8) emit('sizzle', {});
    candles.forEach(c => updateFlame(c.flame, dt, t));
    for (const r of rockets) {
      if (r.state === 'lit') { r.t += dt; if (r.t > 0) { r.state = 'fly'; r.t = 0; r.vel.set(rnd(-0.6, 0.6), 4, rnd(-0.6, 0.6)); emit('launch', {}); } }
      else if (r.state === 'fly') {
        r.t += dt; r.vel.y = Math.min(22, r.vel.y + 30 * dt); r.g.position.addScaledVector(r.vel, dt);
        const p = r.g.position;
        for (let k = 0; k < 3; k++) P.sparks.spawn(p.x, p.y, p.z, rnd(-0.4, 0.4), rnd(-2, -0.5), rnd(-0.4, 0.4), rnd(0.3, 0.6), rnd(0.02, 0.05), k ? COL.hot : COL.fire, -2);
        if (r.t > 1.15) { r.state = 'done'; r.g.visible = false; P.burst('firework', p, 140, 1, r.color); P.burst('firework', p, 40, 1, COL.white); emit('boom', {}); }
      }
    }
    const fuseDone = fuse.state.every(x => x === 2) || (rockets.every(r => r.state === 'done') && !fuse.state.some(x => x === 1));
    if (fuseDone && (fuse.state.some(x => x > 0) || rockets.some(r => r.state === 'done'))) {
      fuse.doneT += dt;
      if (fuse.doneT > 8 && rockets.every(r => r.state === 'idle' || r.state === 'done')) {
        fuse.state.fill(0); fuse.dirty = true; fuse.doneT = 0;
        candles.forEach(c => { c.lit = false; c.flame.userData.target = 0; });
        rockets.forEach(r => { r.state = 'idle'; r.g.visible = true; r.g.position.copy(r.start); P.burst('ember', r.start, 4, 0.4); });
      }
    }
    // ice
    if (ice.state === 'frozen') seedGlow.material.opacity = 0.45 + Math.sin(t * 3) * 0.15;
    else { ice.t += dt; if (ice.t > PT.ice.refreeze) { ice.state = 'frozen'; ice.hp = 1; ice.flame.userData.target = 0; iceMesh.visible = seed.visible = seedGlow.visible = true; placeIce(); P.burst('steam', V(IC.x, 0.4, IC.z), 14, 0.8); emit('refreeze', {}); } }
    updateFlame(ice.flame, dt, t);
    // barrels
    for (const B of barrels) {
      if (B.state === 'lit') {
        B.t += dt; B.g.position.x += Math.sin(t * 60) * 0.004;
        for (let k = 0; k < 2; k++) P.sparks.spawn(B.center.x, 0.9, B.center.z, rnd(-0.8, 0.8), rnd(1, 2.5), rnd(-0.8, 0.8), rnd(0.2, 0.4), rnd(0.015, 0.03), Math.random() < 0.5 ? COL.hot : COL.white, -4);
        if (B.t > PT.barrels.fuse) explode(B);
      } else if (B.state === 'gone') {
        B.t += dt;
        if (B.t > PT.barrels.back) { B.state = 'ready'; B.heat = 0; B.g.visible = true; B.g.position.set(B.center.x, 0, B.center.z); B.mat.color.set(0xa8322a); P.burst('ember', B.center, 6, 0.5); }
      }
    }
    // grass
    spreadT -= dt;
    const doSpread = spreadT <= 0; if (doSpread) spreadT = 0.3;
    let fi = 0;
    for (const cl of cells) {
      if (cl.state === 1) {
        cl.t += dt;
        if (fi < grassFlames.length) { const f = grassFlames[fi++]; f.position.set(cl.x, 0, cl.z); f.userData.target = cl.t < G.burn - 0.4 ? 1 : 0; }
        else if (Math.random() < dt * 6) P.burst('fire', V(cl.x, 0.15, cl.z), 1, 0.4);
        if (Math.random() < dt * 1.5) P.burst('smoke', V(cl.x, 0.6, cl.z), 1, 0.4);
        if (doSpread) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const r2 = cl.r + dr, c2 = cl.c + dc;
          if (r2 >= 0 && r2 < G.rows && c2 >= 0 && c2 < G.cols && Math.random() < G.spread) igniteCell(cells[r2 * G.cols + c2]);
        }
        ctx.heatAt(V(cl.x, 0, cl.z), 0.6 * dt);
        lightFuse(V(cl.x, 0, cl.z), 0.25);
        if (cl.t > G.burn) { cl.state = 2; cl.t = 0; grassDirty = true; }
      } else if (cl.state === 2) { cl.t += dt; if (cl.t > G.regrow) { cl.state = 0; cl.heat = 0; grassDirty = true; } }
    }
    for (; fi < grassFlames.length; fi++) grassFlames[fi].userData.target = 0;
    grassFlames.forEach(f => updateFlame(f, dt, t));
    if (grassDirty) { drawGrass(); grassDirty = false; }
  };
  X.ignitedBy = (pos, r) => grassNear(pos, r);   // something burning at ground level lights the grass around it
  X.cellBurning = (x, z) => { const cl = cellAt(x, z); return cl && cl.state === 1; };
  placeIce(); placeBell();
  return X;
}
