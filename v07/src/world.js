// Elemental Proving Ground VR, draft v07 · flamethrower lab
// Fire bowls to take from (two in reach, three at 2.5, 4.5 and 7 m), three big targets at 3, 6 and 9 m,
// a wall of crates to knock down or burn, three straw dummies to set alight, and the flight of every throw and jet.
// Anything burning is also a fire you can pull from.
// No aim help: a throw flies exactly where the hand sent it. Player stands at the origin facing -Z.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL, rnd, lambert, makeFlame, updateFlame, makeGlow } from './fx.js';

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
export const DUMMIES = [[2.4, 26], [3.6, -17], [3.4, 78]];   // [distance m, bearing degrees]

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
const CS = 0.42;               // crate size
const WALL = { d: 5, deg: 38, cols: 4, rows: 4 };
// fire bowls: [x, z] for the two in reach; [distance m, bearing degrees, height m] for the far ones
export const NEAR_BOWLS = [[-0.55, -0.55], [0.55, -0.55]];
export const FAR_BOWLS = [[2.5, -78, 1.1], [4.5, 60, 1.2], [7, -46, 1.3]];
export const TARGETS = [        // [distance m, bearing degrees (negative = left), centre height m, radius m]
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
    ...NEAR_BOWLS.map(([x, z]) => ({ pos: V(x, 0.9, z), r: 0.2, near: true, d: Math.hypot(x, z) })),
    ...FAR_BOWLS.map(([d, deg, y]) => { const a = deg * DEG; return { pos: V(Math.sin(a) * d, y, -Math.cos(a) * d), r: 0.25 + d * 0.03, near: false, d }; }),
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
  const wallAt = (() => { const a = WALL.deg * DEG; return V(Math.sin(a) * WALL.d, 0, -Math.cos(a) * WALL.d); })();
  const wallYaw = Math.atan2(-wallAt.x, -wallAt.z);   // face the player
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
  const dummies = DUMMIES.map(([d, deg]) => {
    const a = deg * DEG, p = V(Math.sin(a) * d, 0, -Math.cos(a) * d);
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

  /* ---------- public ---------- */
  // a throw: flies along vel with gravity, nothing bends it
  // kind: 'ball' (a throw) or 'jet' (one droplet of the stream)
  W.addShot = (pos, vel, kind = 'ball') => {
    W.shots.push({ kind, pos: V(pos.x, pos.y, pos.z), vel: V(vel.x, vel.y, vel.z), age: 0, id: Math.random(), from: V(pos.x, pos.y, pos.z) });
  };
  W.dummies = dummies;
  W.discs = discs;
  W.bowls = bowls;
  // fires you can pull from: the bowls, and anything burning
  W.sources = () => {
    const s = bowls.slice();
    dummies.forEach(d => { if (d.state === 'burning') s.push({ id: d.id, pos: d.center, r: 0.35, near: false }); });
    crates.forEach((c, i) => { if (c.state === 'burning') s.push({ id: 200 + i, pos: c.mesh.position, r: 0.3, near: false }); });
    return s;
  };
  W.targets = () => ({ near: discs[0].pos.clone(), mid: discs[1].pos.clone(), far: discs[2].pos.clone(), wall: wallAt.clone().setY(0.9) });
  W.status = () => ({ wallMoved: wallMoved(), crates: crates.map(c => c.state[0]).join(''), dummies: dummies.map(d => d.state), shots: W.shots.length });

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
        const c = crates.find(c => inBody(c.body, c.half, s.pos, rad));
        const dm = dummies.find(d => Math.hypot(s.pos.x - d.pos.x, s.pos.z - d.pos.z) < 0.26 + rad && s.pos.y > 0.6 && s.pos.y < 1.98);
        if (c) { c.body.wakeUp(); const dir = s.vel.clone().normalize(); c.body.applyImpulse(new CANNON.Vec3(dir.x * WT.jet.push, dir.y * WT.jet.push, dir.z * WT.jet.push), new CANNON.Vec3(0, 0, 0)); heatUp(c, WT.heat.jet, s.pos); lastWallHit = t; gone = true; }
        else if (dm) { heatUp(dm, WT.heat.jet, s.pos); gone = true; }
        else if (discHit(prev, s.pos)) { gone = true; }
        else if (s.pos.y < rad || s.age > WT.jet.life) { if (s.pos.y < rad && Math.random() < 0.3) P.burst('fire', s.pos, 1, 0.4); gone = true; }
        if (gone) W.shots.splice(i, 1);
        continue;
      }
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
  };

  W.reset = build;
  build();
  return W;
}

