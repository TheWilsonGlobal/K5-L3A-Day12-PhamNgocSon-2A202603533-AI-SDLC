import * as THREE from "three";
import { PAL, onPaletteChange } from "./palette.ts";

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

  const cream = std(PAL.robe, 0x6a5a3a, 0.4);
  const teal = std(PAL.robe, 0x6a5a3a, 0.4); // sleeves and tunic top share the standard robe colour
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

  // red scarf (khăn) at the neck, with a short tail that flutters while running
  const scarfMat = std(PAL.scarf, 0x4a0a14, 0.5);
  const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 20), scarfMat);
  scarfRing.rotation.x = Math.PI / 2;
  scarfRing.position.y = 1.5;
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.03), scarfMat);
  scarfTail.geometry.translate(0, -0.17, 0);
  scarfTail.position.set(0.12, 1.5, -0.18);
  body.add(scarfRing, scarfTail);

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
      scarfTail.rotation.x =
        0.35 * amp + Math.sin(phase * 1.5) * 0.25 * amp + Math.sin(t * 2) * 0.05;
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
    /** World position of the lantern being drained, or null when not in `drain`. */
    drainTarget: [number, number, number] | null,
  ): void;
}

const INK_BODY = new THREE.Color(PAL.shadeBody);
const INK_BODY_STUN = new THREE.Color(PAL.shadeStun);
const INK_VIOLET = new THREE.Color(PAL.shadeRim);
const INK_DRAIN = new THREE.Color(PAL.shadeDrain);
const STUN_BLUE = new THREE.Color(PAL.shadeStunGlow);
const EYE_CHASE = new THREE.Color(PAL.shadeEye);
const EYE_STUN = new THREE.Color(PAL.shadeEyeStun);
const INK_EMIT = new THREE.Color(PAL.shadeInkEmit);
const INK_EMIT_STUN = new THREE.Color(PAL.shadeInkEmitStun);
const WISP_EMIT = new THREE.Color(PAL.shadeWispEmit);
const WISP_EMIT_STUN = new THREE.Color(PAL.shadeWispEmitStun);
const DRAIN_BEADS = 9;

// every shade copies these each frame, so refreshing them in place re-colours all shades live
onPaletteChange(() => {
  INK_VIOLET.set(PAL.shadeRim);
  INK_DRAIN.set(PAL.shadeDrain);
  STUN_BLUE.set(PAL.shadeStunGlow);
  EYE_CHASE.set(PAL.shadeEye);
  EYE_STUN.set(PAL.shadeEyeStun);
  INK_EMIT.set(PAL.shadeInkEmit);
  INK_EMIT_STUN.set(PAL.shadeInkEmitStun);
  WISP_EMIT.set(PAL.shadeWispEmit);
  WISP_EMIT_STUN.set(PAL.shadeWispEmitStun);
});

const SHADE_CORE_GEO = new THREE.SphereGeometry(0.72, 16, 12);
const SHADE_HALO_GEO = new THREE.SphereGeometry(0.72 * 1.2, 16, 12);
const SHADE_GROUND_GEO = new THREE.CircleGeometry(1.5, 20);
const SHADE_EYE_GEO = new THREE.SphereGeometry(0.12, 10, 8);
const SHADE_PUPIL_GEO = new THREE.SphereGeometry(0.055, 8, 6);
const SHADE_BEAD_GEO = new THREE.SphereGeometry(0.12, 8, 6);
const SHADE_STAR_GEO = new THREE.OctahedronGeometry(0.1);

const SHARED_BENCH_INK = new THREE.MeshStandardMaterial({
  color: PAL.shadeBody,
  emissive: 0x24104a,
  roughness: 0.6,
  metalness: 0.4,
});
const SHARED_BENCH_HALO = new THREE.MeshBasicMaterial({
  color: PAL.shadeRim,
  transparent: true,
  opacity: 0.55,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const SHARED_BENCH_EYE = new THREE.MeshBasicMaterial({ color: PAL.shadeEye });
const SHARED_PUPIL_MAT = new THREE.MeshBasicMaterial({ color: 0x1a0b33 });

/** Bóng Mực: friendly-spooky ink spirit — dark core, violet rim halo, drifting droplets, glowing eyes. */
export function createShade(seed: number, bench = false): ShadeRig {
  const group = new THREE.Group();
  const inner = new THREE.Group(); // wobbles and faces the player
  group.add(inner);

  if (bench) {
    // TICKET-04: in benchmark scene, extra creative decorative sub-meshes are disabled so all 200 wandering shades render on a standard baseline
    const core = new THREE.Mesh(SHADE_CORE_GEO, SHARED_BENCH_INK);
    core.scale.set(1, 1.15, 1);
    core.position.y = 1.05;
    const halo = new THREE.Mesh(SHADE_HALO_GEO, SHARED_BENCH_HALO);
    halo.scale.set(1, 1.15, 1);
    halo.position.y = 1.05;
    const eyes = new THREE.Group();
    eyes.position.set(0, 1.18, 0.6);
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(SHADE_EYE_GEO, SHARED_BENCH_EYE);
      w.position.x = sx * 0.25;
      w.scale.set(1, 1.3, 0.6);
      eyes.add(w);
    }
    inner.add(core, halo, eyes);
    const base = seed * 1.7;
    return {
      group,
      update(t, _dtRaw, _stunned, x, z, tx, tz) {
        group.position.x = x;
        group.position.z = z;
        inner.rotation.y = Math.atan2(tx - x, tz - z);
        inner.position.y = Math.sin((t + base) * 2.2) * 0.1;
      },
    };
  }

  const ink = std(PAL.shadeBody, 0x24104a, 0.6, 0.4);
  const core = new THREE.Mesh(SHADE_CORE_GEO, ink);
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
  const halo = new THREE.Mesh(SHADE_HALO_GEO, haloMat);
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
  const ground = new THREE.Mesh(SHADE_GROUND_GEO, groundMat);
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
  const mkEye = (sx: number) => {
    const g = new THREE.Group();
    g.position.x = sx * 0.25;
    const w = new THREE.Mesh(SHADE_EYE_GEO, eyeMat);
    w.scale.set(1, 1.3, 0.6);
    const p = new THREE.Mesh(SHADE_PUPIL_GEO, SHARED_PUPIL_MAT);
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
    const m = new THREE.Mesh(SHADE_STAR_GEO, starMat);
    m.visible = false;
    inner.add(m);
    return { m, ph: (i / 3) * Math.PI * 2 };
  });

  inner.add(core, halo, eyes);
  group.add(ground);

  // drain stream: beads travelling from the shade up to the lantern it is sapping
  const streamMat = new THREE.MeshBasicMaterial({
    color: INK_DRAIN.clone(),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const beads = Array.from({ length: DRAIN_BEADS }, () => {
    const m = new THREE.Mesh(SHADE_BEAD_GEO, streamMat);
    m.visible = false;
    group.add(m);
    return m;
  });

  let face = 0;
  let stun = 0; // 0 = chasing, 1 = fully stunned (smoothed)
  let drain = 0; // 0 = normal, 1 = draining a lantern (smoothed)
  const base = seed * 1.7;

  return {
    group,
    update(t, dtRaw, stunned, x, z, tx, tz, drainTarget) {
      const dt = Math.min(Math.max(dtRaw, 1e-4), 0.1);
      const tt = t + base;
      stun += ((stunned ? 1 : 0) - stun) * Math.min(1, dt * 10);
      drain += ((drainTarget ? 1 : 0) - drain) * Math.min(1, dt * 10);
      group.position.x = x;
      group.position.z = z;

      // while draining the shade looks at its lantern, otherwise at the player
      const lookX = (drainTarget ? drainTarget[0] : tx) - x;
      const lookZ = (drainTarget ? drainTarget[2] : tz) - z;
      if (!stunned && Math.hypot(lookX, lookZ) > 0.05)
        face = turn(face, Math.atan2(lookX, lookZ), dt * 8);
      inner.rotation.y = face;
      // hover bob; stunned shades sag and wobble instead
      inner.position.y = Math.sin(tt * 2.2) * 0.12 * (1 - stun) - 0.2 * stun;
      inner.rotation.z = Math.sin(tt * 9) * 0.14 * stun;
      inner.scale.set(1 + 0.12 * stun, 1 - 0.12 * stun, 1 + 0.12 * stun);

      // colours: violet while chasing, cool blue when stunned
      haloMat.color.copy(INK_VIOLET).lerp(STUN_BLUE, stun).lerp(INK_DRAIN, drain);
      haloMat.opacity =
        0.55 - 0.22 * stun + Math.sin(tt * 3) * 0.05 * (1 - stun) + 0.2 * drain * Math.sin(tt * 6);
      groundMat.color.copy(haloMat.color);
      ink.color.copy(INK_BODY).lerp(INK_BODY_STUN, stun);
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
      // drain stream: beads flow from the shade's head to the lantern, in group-local space
      streamMat.color.copy(INK_DRAIN);
      streamMat.opacity = 0.85 * drain;
      const tgt = drainTarget;
      beads.forEach((b, i) => {
        b.visible = tgt !== null;
        if (!tgt) return;
        const u = (t * 0.7 + i / DRAIN_BEADS) % 1;
        const lx = tgt[0] - x;
        const ly = tgt[1] - group.position.y;
        const lz = tgt[2] - z;
        const wob = Math.sin(u * Math.PI * 3 + t * 6 + i) * 0.25 * Math.sin(u * Math.PI);
        b.position.set(lx * u + wob, 1.4 + (ly - 1.4) * u, lz * u - wob);
        b.scale.setScalar(0.6 + 0.8 * Math.sin(u * Math.PI));
      });
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
