import * as THREE from "three";

// Visual-only rigs. They read positions from the sim and never feed anything back.

const std = (color: number, emissive = 0x000000, intensity = 0, roughness = 0.8) =>
  new THREE.MeshStandardMaterial({ color, roughness, emissive, emissiveIntensity: intensity });
const basic = (color: number) => new THREE.MeshBasicMaterial({ color });
const sphere = (r: number, mat: THREE.Material, w = 16, h = 12) =>
  new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat);
const capsule = (r: number, len: number, mat: THREE.Material) =>
  new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);

const turn = (from: number, to: number, k: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return from + d * Math.min(1, k);
};

// ------------------------------------------------------------------ Mây

export interface MayRig {
  group: THREE.Group;
  /** The warm point light inside the hanging lantern. */
  light: THREE.PointLight;
  update(t: number, dt: number, x: number, y: number, z: number): void;
}

/** Mây: lantern keeper with hair, áo dài tunic, arms/legs and a tilted nón lá with a hanging lantern. */
export function createMay(): MayRig {
  const group = new THREE.Group();
  const body = new THREE.Group(); // bobs and leans as a unit
  group.add(body);

  const cream = std(0xf4e6c8, 0x6a5a3a, 0.45);
  const teal = std(0x2f9d94, 0x0f4a46, 0.6);
  const skin = std(0xf0c9a0);
  const hairMat = std(0x2a1a14);
  const straw = std(0xf0d48e, 0x7a5a1a, 0.7);
  const trouser = std(0xfaf3e0, 0x6a5a3a, 0.4);

  // áo dài: cream skirt panel + teal fitted top + orange sash
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.52, 0.85, 20), cream);
  robe.position.y = 0.78;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.31, 0.42, 20), teal);
  top.position.y = 1.31;
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.04, 8, 24), std(0xe58a2e));
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 1.12;
  body.add(robe, top, sash);

  // head, face, hair
  const head = new THREE.Group();
  head.position.y = 1.73;
  const skull = sphere(0.27, skin);
  const eyeL = sphere(0.035, std(0x1a0f0a));
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.09, 0.0, 0.245);
  eyeR.position.set(0.09, 0.0, 0.245);
  const cheekMat = std(0xf0a090);
  const cheekL = sphere(0.045, cheekMat);
  const cheekR = cheekL.clone();
  cheekL.position.set(-0.16, -0.07, 0.21);
  cheekR.position.set(0.16, -0.07, 0.21);
  cheekL.scale.set(1, 0.6, 0.4);
  cheekR.scale.set(1, 0.6, 0.4);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.295, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hairMat,
  );
  hairCap.position.set(0, 0.01, -0.03);
  const hairBack = sphere(0.25, hairMat);
  hairBack.position.set(0, -0.05, -0.1);
  head.add(skull, eyeL, eyeR, cheekL, cheekR, hairCap, hairBack);
  body.add(head);

  // braid with a tie, swaying behind
  const braid = new THREE.Group();
  braid.position.set(0.05, 1.55, -0.24);
  const braidMesh = capsule(0.06, 0.38, hairMat);
  braidMesh.position.y = -0.22;
  const tie = sphere(0.05, std(0xe58a2e));
  tie.position.y = -0.46;
  braid.add(braidMesh, tie);
  body.add(braid);

  // arms (teal sleeves) and legs (white trousers), each on a hip/shoulder pivot
  const makeLimb = (
    x: number,
    y: number,
    r: number,
    len: number,
    mat: THREE.Material,
    end: THREE.Mesh,
  ) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const limb = capsule(r, len, mat);
    limb.position.y = -(len / 2 + r);
    end.position.y = -(len + r * 2) + 0.01;
    pivot.add(limb, end);
    return pivot;
  };
  const hand = () => sphere(0.065, skin, 10, 8);
  const foot = () => {
    const f = sphere(0.085, std(0x3a2a22), 10, 8);
    f.scale.set(1, 0.7, 1.45);
    return f;
  };
  const armL = makeLimb(-0.36, 1.46, 0.065, 0.38, teal, hand());
  const armR = makeLimb(0.36, 1.46, 0.065, 0.38, teal, hand());
  const legL = makeLimb(-0.14, 0.62, 0.075, 0.36, trouser, foot());
  const legR = makeLimb(0.14, 0.62, 0.075, 0.36, trouser, foot());
  body.add(armL, armR);
  group.add(legL, legR); // legs do not bob with the torso

  // nón lá: wide shallow cone, tilted a little, with a hanging lantern at the front brim
  const hat = new THREE.Group();
  hat.position.y = 2.09;
  hat.rotation.set(-0.1, 0, 0.14);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.42, 28, 1, true), straw);
  (cone.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.775, 0.018, 6, 36), std(0xb78d44));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.21;
  const knob = sphere(0.03, std(0xb78d44), 8, 6);
  knob.position.y = 0.22;
  hat.add(cone, rim, knob);
  // red chin strap
  const strapMat = std(0xc0392b);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), strapMat);
    strap.position.set(sx * 0.2, -0.38, 0.1);
    strap.rotation.z = sx * 0.12;
    hat.add(strap);
  }
  body.add(hat);

  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(0.58, -0.2, 0.3); // front-right side of the brim, visible from behind
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 5), std(0x5a3a1a));
  string.position.y = -0.2;
  const lantern = new THREE.Group();
  lantern.position.y = -0.5;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb54a });
  const lampBody = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), glowMat);
  lampBody.scale.y = 1.25;
  const capMat = std(0xb8862b, 0x000000, 0, 0.5);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.05, 12), capMat);
  capTop.position.y = 0.16;
  const capBottom = capTop.clone();
  capBottom.position.y = -0.16;
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 0.12, 5), strapMat);
  tassel.position.y = -0.24;
  const light = new THREE.PointLight(0xffa73a, 14, 14);
  lantern.add(lampBody, capTop, capBottom, tassel, light);
  lanternPivot.add(string, lantern);
  hat.add(lanternPivot);

  // ---- animation state
  let px = Number.NaN;
  let pz = Number.NaN;
  let face = 0;
  let phase = 0;
  let amp = 0;

  return {
    group,
    light,
    update(t, dtRaw, x, y, z) {
      const dt = Math.min(Math.max(dtRaw, 1e-4), 0.1);
      if (Number.isNaN(px)) {
        px = x;
        pz = z;
      }
      const dx = x - px;
      const dz = z - pz;
      px = x;
      pz = z;
      const speed = Math.hypot(dx, dz) / dt;
      const moving = speed > 0.5;
      group.position.set(x, y, z);
      if (moving) face = turn(face, Math.atan2(dx, dz), dt * 12);
      group.rotation.y = face;

      amp += ((moving ? Math.min(1, speed / 6) : 0) - amp) * Math.min(1, dt * 10);
      if (moving) phase += dt * (7 + speed * 0.9);
      const air = y > 0.05;
      const s = Math.sin(phase);

      body.position.y = Math.abs(s) * 0.07 * amp + Math.sin(t * 2) * 0.012 * (1 - amp);
      body.rotation.x = 0.12 * amp;
      body.rotation.z = s * 0.04 * amp;
      legL.rotation.x = air ? 0.55 : s * 0.7 * amp;
      legR.rotation.x = air ? -0.25 : -s * 0.7 * amp;
      armL.rotation.x = air ? -1.1 : -s * 0.6 * amp + Math.sin(t * 1.7) * 0.03;
      armR.rotation.x = air ? -1.1 : s * 0.6 * amp - Math.sin(t * 1.7) * 0.03;
      armL.rotation.z = air ? -0.5 : 0.04;
      armR.rotation.z = air ? 0.5 : -0.04;
      braid.rotation.x =
        -0.15 * amp + Math.sin(phase * 0.5) * 0.12 * amp + Math.sin(t * 1.3) * 0.04;
      braid.rotation.z = Math.cos(phase) * 0.12 * amp;
      // the lantern swings like a pendulum, more when walking
      lanternPivot.rotation.x = Math.sin(phase + 1) * 0.4 * amp + Math.sin(t * 1.6) * 0.07;
      lanternPivot.rotation.z = Math.cos(phase * 0.5) * 0.12 * amp + Math.sin(t * 1.1) * 0.04;
      hat.rotation.z = 0.14 + Math.sin(phase) * 0.03 * amp;
    },
  };
}

// ------------------------------------------------------------- Bóng Mực

export interface ShadeRig {
  group: THREE.Group;
  /** (x, z) = shade position, (tx, tz) = what it looks at (the player). */
  update(
    t: number,
    dt: number,
    stunned: boolean,
    x: number,
    z: number,
    tx: number,
    tz: number,
  ): void;
}

const INK_VIOLET = new THREE.Color(0xa468ff);
const STUN_BLUE = new THREE.Color(0x5aa8ff);
const EYE_CHASE = new THREE.Color(0xf1eaff);
const EYE_STUN = new THREE.Color(0x9ad0ff);
const INK_EMIT = new THREE.Color(0x24104a);
const INK_EMIT_STUN = new THREE.Color(0x103a78);
const WISP_EMIT = new THREE.Color(0x3a1a78);
const WISP_EMIT_STUN = new THREE.Color(0x1a4a90);

/** Bóng Mực: friendly-spooky ink spirit — dark core, violet rim halo, drifting droplets, glowing eyes. */
export function createShade(seed: number): ShadeRig {
  const group = new THREE.Group();
  const inner = new THREE.Group(); // wobbles and faces the player
  group.add(inner);

  const ink = std(0x0a0314, 0x24104a, 0.6, 0.4);
  const core = sphere(0.72, ink, 20, 14);
  core.scale.set(1, 1.15, 1);
  core.position.y = 1.05;

  // violet rim halo: a slightly larger back-faced additive shell outlines the silhouette
  const haloMat = new THREE.MeshBasicMaterial({
    color: INK_VIOLET.clone(),
    transparent: true,
    opacity: 0.55,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = sphere(0.72 * 1.2, haloMat, 20, 14);
  halo.scale.set(1, 1.15, 1);
  halo.position.y = 1.05;

  // soft glow on the ground so it reads against the dark island
  const groundMat = new THREE.MeshBasicMaterial({
    color: INK_VIOLET.clone(),
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.05;

  // wispy ink: floating droplets + hanging tendrils around the base
  const wispMat = std(0x0e0620, 0x3a1a78, 0.8, 0.4);
  const drops: { m: THREE.Mesh; r: number; h: number; sp: number; ph: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const m = sphere(0.1 + (i % 3) * 0.05, wispMat, 10, 8);
    drops.push({
      m,
      r: 0.85 + (i % 2) * 0.3,
      h: 0.25 + (i % 3) * 0.22,
      sp: 0.8 + i * 0.13,
      ph: (i / 6) * Math.PI * 2,
    });
    inner.add(m);
  }
  const tendrils: { m: THREE.Mesh; ang: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const m = sphere(0.13, wispMat, 10, 8);
    m.scale.set(0.6, 2.4 - (i % 2) * 0.6, 0.6);
    tendrils.push({ m, ang: (i / 5) * Math.PI * 2 });
    inner.add(m);
  }

  // eyes: pale-violet glow + dark pupils, facing +Z (rotated toward the player)
  const eyes = new THREE.Group();
  eyes.position.set(0, 1.18, 0.6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: EYE_CHASE.clone() });
  const pupilMat = basic(0x1a0b33);
  const mkEye = (sx: number) => {
    const g = new THREE.Group();
    g.position.x = sx * 0.25;
    const w = sphere(0.12, eyeMat, 12, 10);
    w.scale.set(1, 1.3, 0.6);
    const p = sphere(0.055, pupilMat, 8, 6);
    p.position.set(0, 0, 0.06);
    g.add(w, p);
    return { g, p };
  };
  const eL = mkEye(-1);
  const eR = mkEye(1);
  eyes.add(eL.g, eR.g);

  // dizzy sparkles, only visible when stunned
  const starMat = basic(0xbfe0ff);
  const stars = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), starMat);
    m.visible = false;
    inner.add(m);
    return { m, ph: (i / 3) * Math.PI * 2 };
  });

  inner.add(core, halo, eyes);
  group.add(ground);

  let face = 0;
  let stun = 0; // 0 = chasing, 1 = fully stunned (smoothed)
  const base = seed * 1.7;

  return {
    group,
    update(t, dtRaw, stunned, x, z, tx, tz) {
      const dt = Math.min(Math.max(dtRaw, 1e-4), 0.1);
      const tt = t + base;
      stun += ((stunned ? 1 : 0) - stun) * Math.min(1, dt * 10);
      group.position.set(x, 0, z);

      const lookX = tx - x;
      const lookZ = tz - z;
      if (!stunned && Math.hypot(lookX, lookZ) > 0.05)
        face = turn(face, Math.atan2(lookX, lookZ), dt * 8);
      inner.rotation.y = face;
      // hover bob; stunned shades sag and wobble instead
      inner.position.y = Math.sin(tt * 2.2) * 0.12 * (1 - stun) - 0.2 * stun;
      inner.rotation.z = Math.sin(tt * 9) * 0.14 * stun;
      inner.scale.set(1 + 0.12 * stun, 1 - 0.12 * stun, 1 + 0.12 * stun);

      // colours: violet while chasing, cool blue when stunned
      haloMat.color.copy(INK_VIOLET).lerp(STUN_BLUE, stun);
      haloMat.opacity = 0.55 - 0.22 * stun + Math.sin(tt * 3) * 0.05 * (1 - stun);
      groundMat.color.copy(haloMat.color);
      ink.emissive.copy(INK_EMIT).lerp(INK_EMIT_STUN, stun);
      wispMat.emissive.copy(WISP_EMIT).lerp(WISP_EMIT_STUN, stun);
      eyeMat.color.copy(EYE_CHASE).lerp(EYE_STUN, stun);

      // eyes: wide and curious when chasing (with a blink), closed arcs when stunned
      const blink = Math.sin(tt * 1.3 + 2) > 0.985 ? 0.12 : 1;
      const open = (1 - stun) * blink + 0.1 * stun;
      for (const e of [eL, eR]) {
        e.g.scale.set(1 + 0.3 * stun, open, 1);
        e.p.visible = stun < 0.5;
      }
      eL.g.rotation.z = -0.18 * (1 - stun);
      eR.g.rotation.z = 0.18 * (1 - stun);

      // wisps drift (frozen-ish when stunned)
      const drift = 1 - 0.85 * stun;
      for (const d of drops) {
        const a = d.ph + tt * d.sp * drift;
        d.m.position.set(
          Math.cos(a) * d.r,
          d.h + Math.sin(tt * 1.7 + d.ph) * 0.12 * drift,
          Math.sin(a) * d.r,
        );
      }
      for (const w of tendrils) {
        const sway = Math.sin(tt * 2.4 + w.ang * 2) * 0.12 * drift;
        w.m.position.set(Math.cos(w.ang) * (0.5 + sway), 0.42, Math.sin(w.ang) * (0.5 + sway));
      }
      for (const s of stars) {
        s.m.visible = stun > 0.5;
        const a = s.ph + tt * 3.2;
        s.m.position.set(
          Math.cos(a) * 0.55,
          2.15 + Math.sin(tt * 4 + s.ph) * 0.05,
          Math.sin(a) * 0.55,
        );
        s.m.rotation.y = tt * 4;
      }
    },
  };
}
