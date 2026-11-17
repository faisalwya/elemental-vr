// Elemental Proving Ground VR, draft v05 · throwing lab
// Three big targets at 3, 6 and 9 m, a wall of stacked crates to knock down, and the flight of every throw.
// No aim help: a throw flies exactly where the hand sent it. Player stands at the origin facing -Z.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL, lambert, makeFlame, updateFlame } from './fx.js';

export const WT = {
  gravity: 5,          // floaty on purpose (real gravity is 9.8), same as v01 to v04
  radius: 0.12,
  life: 6,
  impulse: 10,         // crate push per throw, scaled by speed
  wallRebuild: 5,      // seconds after the last hit on a knocked wall before it stacks itself again
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
const CS = 0.42;               // crate size
const WALL = { d: 5, deg: 38, cols: 4, rows: 4 };
export const TARGETS = [        // [distance m, bearing degrees (negative = left), centre height m, radius m]
  [3, -30, 1.4, 0.5],
  [6, -6, 1.8, 0.6],
  [9, 16, 2.3, 0.75],
];

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
        crates.push({ mesh: m, body, start: p.clone(), half: CS / 2 });
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

  /* ---------- public ---------- */
  // a throw: flies along vel with gravity, nothing bends it
  W.addShot = (pos, vel, style) => {
    W.shots.push({ pos: V(pos.x, pos.y, pos.z), vel: V(vel.x, vel.y, vel.z), age: 0, id: Math.random(), style, from: V(pos.x, pos.y, pos.z) });
  };
  W.discs = discs;
  W.targets = () => ({ near: discs[0].pos.clone(), mid: discs[1].pos.clone(), far: discs[2].pos.clone(), wall: wallAt.clone().setY(0.9) });
  W.status = () => ({ wallMoved: wallMoved(), crates: crates.length, shots: W.shots.length });

  /* ---------- per frame ---------- */
  const prev = V();
  W.update = (dt, t) => {
    W.t = t;
    phys.step(1 / 72, dt, 3);

    for (let i = W.shots.length - 1; i >= 0; i--) {
      const s = W.shots[i];
      prev.copy(s.pos);
      s.vel.y -= WT.gravity * dt;
      s.pos.addScaledVector(s.vel, dt); s.age += dt;
      let gone = false;
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
          P.burst('fire', s.pos, 22, 1.3); lastWallHit = t;
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
    if (wallMoved() > 0 && t - lastWallHit > WT.wallRebuild) {
      crates.forEach(c => P.burst('ember', c.mesh.position, 4, 0.8));
      buildWall(); emit('rebuild', {});
    }
    discs.forEach(D => { D.flash *= Math.exp(-3 * dt); D.mat.emissiveIntensity = D.flash * 0.9; });
  };

  W.reset = build;
  build();
  return W;
}

