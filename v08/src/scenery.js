// Elemental Proving Ground VR, draft v08 · the courtyard
// Everything that is only there to make the place feel alive: dusk sky, mountains and trees beyond the walls,
// the walled courtyard with torches and banners, drifting clouds, fireflies, bats and grass in the wind.
// Nothing here reacts to fire (that lives in world.js). No lights are added: torches glow with sprites, so the
// light count stays constant and the Quest never recompiles shaders.

import * as THREE from 'three';
import { COL, rnd, lambert, makeFlame, updateFlame, makeGlow, glowTex, swayMaterial } from './fx.js';

export const YARD = { x0: -9, x1: 9, z0: -11, z1: 5, h: 3.2 };   // inside of the courtyard walls, metres

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4; return t;
}

export function createScenery(scene, particles) {
  const S = { torches: [], bats: [] };

  /* ---------- dusk sky: a gradient dome, the last light low in the west, the moon rising ---------- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x0b1030) }, mid: { value: new THREE.Color(0x3a2f63) }, low: { value: new THREE.Color(0xd9784e) }, ground: { value: new THREE.Color(0x1d1828) }, sun: { value: new THREE.Vector3(-0.8, 0.05, -0.6).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, low, ground, sun; varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 c = y > 0.0 ? mix(mix(low, mid, smoothstep(0.0, 0.25, y)), top, smoothstep(0.25, 0.8, y)) : mix(low * 0.5, ground, smoothstep(0.0, 0.15, -y));
        float s = max(0.0, dot(vDir, sun));
        c += vec3(1.0, 0.55, 0.3) * pow(s, 12.0) * 0.6 * (1.0 - smoothstep(0.0, 0.4, y));   // warm glow where the sun went down
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  scene.add(sky);
  scene.background = new THREE.Color(0x2a2340);
  scene.fog = new THREE.Fog(0x3b2d4e, 18, 75);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf6f0dc, fog: false })); moon.position.set(30, 38, -55); moon.scale.setScalar(2.2); scene.add(moon);
  const moonGlow = makeGlow(0xbfc8ff, 18, 0.35); moonGlow.material.fog = false; moonGlow.position.copy(moon.position); scene.add(moonGlow);
  {
    const n = 320, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = rnd(Math.PI * 2), e = rnd(0.35, 1.5), r = 85; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    S.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8ecff, size: 0.45, fog: false, transparent: true, opacity: 0.8 })); scene.add(S.stars);
  }

  /* ---------- far away: a ring of mountains and a forest beyond the walls ---------- */
  {
    const geo = new THREE.ConeGeometry(1, 1, 5), mat = lambert(0x2c2440, { flatShading: true });
    const n = 22, mtn = new THREE.InstancedMesh(geo, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.1, 0.1), r = rnd(48, 62), h = rnd(9, 22);
      p.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r); q.setFromEuler(new THREE.Euler(0, rnd(Math.PI), 0)); s.set(rnd(10, 18), h, rnd(10, 18));
      mtn.setMatrixAt(i, m4.compose(p, q, s));
    }
    scene.add(mtn);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6).translate(0, 0.5, 0), leafGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    const nt = 70, trunks = new THREE.InstancedMesh(trunkGeo, lambert(0x3a2a22), nt), leaves = new THREE.InstancedMesh(leafGeo, lambert(0x22382e, { flatShading: true }), nt * 2);
    for (let i = 0; i < nt; i++) {
      let x, z; do { x = rnd(-26, 26); z = rnd(-30, 18); } while (x > YARD.x0 - 1.5 && x < YARD.x1 + 1.5 && z > YARD.z0 - 1.5 && z < YARD.z1 + 1.5);
      const h = rnd(4, 8), w = rnd(1.1, 1.9);
      trunks.setMatrixAt(i, m4.compose(p.set(x, 0, z), q.identity(), s.set(1, h * 0.4, 1)));
      leaves.setMatrixAt(i * 2, m4.compose(p.set(x, h * 0.3, z), q, s.set(w, h * 0.55, w)));
      leaves.setMatrixAt(i * 2 + 1, m4.compose(p.set(x, h * 0.6, z), q, s.set(w * 0.7, h * 0.42, w * 0.7)));
    }
    scene.add(trunks, leaves);
  }

  /* ---------- the ground: grass outside, flagstones inside ---------- */
  {
    const outside = new THREE.Mesh(new THREE.CircleGeometry(80, 48).rotateX(-Math.PI / 2), lambert(0x283327)); outside.position.y = -0.01; scene.add(outside);
    const W = YARD.x1 - YARD.x0, D = YARD.z1 - YARD.z0;
    const flags = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#3e3f52'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const x = col * 64 + (row % 2 ? 32 : 0), y = row * 64, v = 70 + Math.floor(Math.random() * 26);
        g.fillStyle = `rgb(${v},${v + 2},${v + 18})`; g.fillRect(x + 3, y + 3, 58, 58); g.fillRect(x + 3 - 512, y + 3, 58, 58);
      }
    }, [W / 4, D / 4]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: flags }));
    floor.position.set((YARD.x0 + YARD.x1) / 2, 0, (YARD.z0 + YARD.z1) / 2); scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL.paper, transparent: true, opacity: 0.3 })); ring.position.y = 0.01; scene.add(ring);
  }

  /* ---------- the courtyard walls: stone, battlements, pillars with torches, banners, a gate behind you ---------- */
  {
    const stone = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#2b2a36'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
        const x = col * 96 + (row % 2 ? 48 : 0) - 48, y = row * 32, v = 78 + Math.floor(Math.random() * 30);
        g.fillStyle = `rgb(${v},${v - 4},${v + 6})`; g.fillRect(x + 2, y + 2, 92, 28);
      }
    }, [1, 1]);
    const wallMat = new THREE.MeshLambertMaterial({ map: stone }), capMat = lambert(0x4a4658), woodMat = lambert(0x5a3e2a);
    const T = 0.6, H = YARD.h;
    const walls = [
      { x: (YARD.x0 + YARD.x1) / 2, z: YARD.z0 - T / 2, w: YARD.x1 - YARD.x0 + 2 * T, d: T },
      { x: (YARD.x0 + YARD.x1) / 2, z: YARD.z1 + T / 2, w: YARD.x1 - YARD.x0 + 2 * T, d: T },
      { x: YARD.x0 - T / 2, z: (YARD.z0 + YARD.z1) / 2, w: T, d: YARD.z1 - YARD.z0 },
      { x: YARD.x1 + T / 2, z: (YARD.z0 + YARD.z1) / 2, w: T, d: YARD.z1 - YARD.z0 },
    ];
    const merlonGeo = new THREE.BoxGeometry(0.5, 0.45, T + 0.04), merlons = [];
    for (const wl of walls) {
      const geo = new THREE.BoxGeometry(wl.w, H, wl.d), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(wl.w, wl.d) / 4, uv.getY(i) * H / 2);   // keep the bricks the same size on every wall
      const m = new THREE.Mesh(geo, wallMat); m.position.set(wl.x, H / 2, wl.z); scene.add(m);
      const along = wl.w > wl.d, L = along ? wl.w : wl.d;
      for (let k = -L / 2 + 0.4; k < L / 2; k += 1.0) merlons.push([along ? wl.x + k : wl.x, H + 0.22, along ? wl.z : wl.z + k, along ? 0 : Math.PI / 2]);
    }
    const mi = new THREE.InstancedMesh(merlonGeo, capMat, merlons.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    merlons.forEach(([x, y, z, r], i) => mi.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromEuler(new THREE.Euler(0, r, 0)), one)));
    scene.add(mi);
    // gate in the wall behind you
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), lambert(0x4a3220)); gate.position.set(0, 1.3, YARD.z1 - 0.01); gate.rotation.y = Math.PI; scene.add(gate);
    for (let i = -1; i <= 1; i += 2) { const band = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.04), lambert(COL.ink)); band.position.set(0, 1.3 + i * 0.7, YARD.z1 - 0.03); scene.add(band); }
    // pillars with torches, along the side and back walls
    const pillarGeo = new THREE.BoxGeometry(0.7, H + 0.5, 0.7), sconceGeo = new THREE.CylinderGeometry(0.1, 0.05, 0.22, 8);
    const spots = [];
    for (const x of [-6, -2, 2, 6]) spots.push([x, YARD.z0 + 0.05, 0]);
    for (const z of [-8, -4, 0, 4]) { spots.push([YARD.x0 + 0.05, z, Math.PI / 2]); spots.push([YARD.x1 - 0.05, z, -Math.PI / 2]); }
    // pillars and torch holders are drawn as two instanced batches (fewer draw calls for the Quest)
    const pils = new THREE.InstancedMesh(pillarGeo, capMat, spots.length), scs = new THREE.InstancedMesh(sconceGeo, woodMat, spots.length);
    scene.add(pils, scs);
    for (const [i, [x, z, r]] of spots.entries()) {
      pils.setMatrixAt(i, m4.makeTranslation(x, (H + 0.5) / 2, z));
      const out = new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
      const tp = new THREE.Vector3(x, 2.15, z).addScaledVector(out, 0.5);
      scs.setMatrixAt(i, m4.makeTranslation(tp.x, 2.0, tp.z));
      const flame = makeFlame(0.32, scene, true); flame.position.copy(tp).setY(2.08);
      const glw = makeGlow(COL.fire, 2.2, 0.5); glw.position.copy(tp).setY(2.25); scene.add(glw);
      S.torches.push({ flame, glow: glw, pos: tp, seed: rnd(10) });
    }
    // banners between the pillars on the back wall, moving in the wind
    const bannerMat = swayMaterial(0x9c2a2a, { side: THREE.DoubleSide, cloth: true });
    const bannerGeo = new THREE.PlaneGeometry(1.0, 1.9, 4, 10).translate(0, -0.95, 0);
    for (const x of [-4, 0, 4]) {
      const b = new THREE.Mesh(bannerGeo, bannerMat); b.position.set(x, H - 0.1, YARD.z0 + 0.04); scene.add(b);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6).rotateZ(Math.PI / 2), woodMat); pole.position.set(x, H - 0.08, YARD.z0 + 0.06); scene.add(pole);
      const sigil = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: 0xffb04a })); sigil.position.set(x, H - 0.8, YARD.z0 + 0.05); scene.add(sigil);
    }
  }

  /* ---------- grass in the wind along the walls and around the edges ---------- */
  {
    const blade = new THREE.ConeGeometry(0.035, 1, 3).translate(0, 0.5, 0);
    const n = 520, grass = new THREE.InstancedMesh(blade, swayMaterial(0xffffff), n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let x, z;
      if (i < 360) {   // tufts along the inside of the walls
        const side = i % 4, k = Math.random();
        x = side === 0 ? YARD.x0 + rnd(0.1, 0.9) : side === 1 ? YARD.x1 - rnd(0.1, 0.9) : YARD.x0 + k * (YARD.x1 - YARD.x0);
        z = side === 2 ? YARD.z0 + rnd(0.1, 0.9) : side === 3 ? YARD.z1 - rnd(0.1, 0.9) : YARD.z0 + k * (YARD.z1 - YARD.z0);
      } else { const a = rnd(Math.PI * 2), r = rnd(10.5, 16); x = Math.cos(a) * r; z = Math.sin(a) * r; }   // outside
      const h = rnd(0.25, 0.6);
      grass.setMatrixAt(i, m4.compose(p.set(x, 0, z), q.setFromEuler(new THREE.Euler(rnd(-0.2, 0.2), rnd(Math.PI), rnd(-0.2, 0.2))), s.set(1, h, 1)));
      grass.setColorAt(i, c.setHSL(0.22 + rnd(-0.04, 0.04), 0.35, 0.28 + rnd(0, 0.1)));
    }
    scene.add(grass);
  }

  /* ---------- clouds drifting over, fireflies, and a few bats ---------- */
  const cloudTex = canvasTex(256, 128, (g, w, h) => {
    for (let i = 0; i < 14; i++) { const x = rnd(50, w - 50), y = rnd(50, h - 40), r = rnd(22, 46), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  });
  S.clouds = Array.from({ length: 9 }, (_, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: i % 2 ? 0xc9a3c8 : 0x8f86b8, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    const a = rnd(Math.PI * 2), r = rnd(30, 60); sp.position.set(Math.cos(a) * r, rnd(22, 34), Math.sin(a) * r); sp.scale.set(rnd(26, 40), rnd(9, 14), 1);
    scene.add(sp); return { sp, a, r, w: rnd(0.004, 0.01) };
  });
  {
    const n = 70, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    S.flies = Array.from({ length: n }, () => ({ x: rnd(YARD.x0 + 1, YARD.x1 - 1), y: rnd(0.4, 2.6), z: rnd(YARD.z0 + 1, YARD.z1 - 1), s: rnd(10), v: rnd(0.15, 0.35) }));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    S.flyPoints = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    S.flyPoints.frustumCulled = false; scene.add(S.flyPoints);
  }
  {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -0.35, 0.05, 0.1, -0.3, 0, -0.12, 0, 0, 0, 0.35, 0.05, 0.1, 0.3, 0, -0.12]), 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x141018, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(wing, mat); scene.add(b); S.bats.push({ b, r: rnd(5, 11), h: rnd(6, 10), w: rnd(0.25, 0.45) * (i % 2 ? 1 : -1), a: rnd(Math.PI * 2), cx: rnd(-3, 3), cz: rnd(-6, 0) }); }
  }

  /* ---------- per frame ---------- */
  S.update = (dt, t) => {
    for (const T of S.torches) {
      updateFlame(T.flame, dt, t);
      T.glow.material.opacity = 0.42 + Math.sin(t * 9 + T.seed) * 0.06 + Math.sin(t * 23 + T.seed * 3) * 0.04;
      if (Math.random() < dt * 1.5) particles.sparks.spawn(T.pos.x + rnd(-0.04, 0.04), 2.3, T.pos.z + rnd(-0.04, 0.04), rnd(-0.1, 0.1), rnd(0.3, 0.7), rnd(-0.1, 0.1), rnd(0.8, 1.6), rnd(0.01, 0.02), Math.random() < 0.5 ? COL.fire : 0xff5a1a, -0.1);
    }
    for (const C of S.clouds) { C.a += C.w * dt; C.sp.position.x = Math.cos(C.a) * C.r; C.sp.position.z = Math.sin(C.a) * C.r; }
    const pos = S.flyPoints.geometry.attributes.position.array, col = S.flyPoints.geometry.attributes.color.array;
    S.flies.forEach((f, i) => {
      const k = t * f.v + f.s;
      pos[i * 3] = f.x + Math.sin(k * 1.3) * 0.6; pos[i * 3 + 1] = f.y + Math.sin(k * 2.1) * 0.25; pos[i * 3 + 2] = f.z + Math.cos(k * 1.7) * 0.6;
      const on = Math.max(0, Math.sin(t * 1.7 + f.s * 3)) ** 3;
      col[i * 3] = 0.85 * on; col[i * 3 + 1] = 1.0 * on; col[i * 3 + 2] = 0.45 * on;
    });
    S.flyPoints.geometry.attributes.position.needsUpdate = true; S.flyPoints.geometry.attributes.color.needsUpdate = true;
    for (const B of S.bats) {
      B.a += B.w * dt * 2;
      const x = B.cx + Math.cos(B.a) * B.r, z = B.cz + Math.sin(B.a) * B.r * 0.6, y = B.h + Math.sin(B.a * 3) * 0.6;
      const sg = Math.sign(B.w); B.b.position.set(x, y, z); B.b.lookAt(x - Math.sin(B.a) * sg, y, z + Math.cos(B.a) * 0.6 * sg);
      B.b.scale.set(1, 1 + Math.sin(t * 14 + B.r) * 2.2, 1);
    }
  };
  return S;
}
