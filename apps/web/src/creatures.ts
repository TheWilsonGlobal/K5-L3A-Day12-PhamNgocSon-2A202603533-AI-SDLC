import * as THREE from "three";
import { PAL } from "./palette.ts";

// Visual-only rigs for Gió Lạc (drifter), Bùa Gió (charm) and the firefly pickups.

export interface DrifterRig {
  group: THREE.Group;
  update(
    t: number,
    dt: number,
    state: string,
    stolen: number,
    x: number,
    y: number,
    z: number,
  ): void;
}

/** Gió Lạc: a fast grey-blue silk ribbon that curls through the air. */
export function createDrifter(seed: number): DrifterRig {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const SEG = 14;
  const ribbons: { mesh: THREE.Mesh; phase: number; len: number; off: number }[] = [];
  const mats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 3; i++) {
    const len = 2.6 - i * 0.35;
    const geo = new THREE.PlaneGeometry(len, 0.34 - i * 0.05, SEG, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: i === 0 ? PAL.drifter : 0xb6c6d8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82 - i * 0.18,
    });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    ribbons.push({ mesh, phase: i * 1.7 + seed, len, off: (i - 1) * 0.18 });
    inner.add(mesh);
  }
  // fireflies it carries off after a theft
  const loot = new THREE.Group();
  const lootMat = new THREE.MeshBasicMaterial({ color: PAL.moteCore });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lootMat);
    loot.add(m);
  }
  inner.add(loot);

  let px = Number.NaN;
  let pz = Number.NaN;
  let face = 0;
  return {
    group,
    update(t, dtRaw, state, stolen, x, y, z) {
      const dt = Math.min(Math.max(dtRaw, 1e-4), 0.1);
      if (Number.isNaN(px)) {
        px = x;
        pz = z;
      }
      const dx = x - px;
      const dz = z - pz;
      px = x;
      pz = z;
      group.position.set(x, y + Math.sin(t * 2 + seed) * 0.15, z);
      if (Math.hypot(dx, dz) > 1e-4) {
        const target = Math.atan2(dx, dz) - Math.PI / 2;
        let d = target - face;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        face += d * Math.min(1, dt * 10);
      }
      inner.rotation.y = face;
      const fast = state === "chase" || state === "flee";
      const speed = fast ? 9 : 3;
      for (const r of ribbons) {
        const pos = r.mesh.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i <= SEG; i++) {
          const u = i / SEG;
          // tail waves more than the head; both vertices of a column share the wave
          const amp = 0.15 + 0.45 * u;
          const wy = Math.sin(t * speed - u * 5 + r.phase) * amp;
          const wz = Math.cos(t * speed * 0.8 - u * 4 + r.phase) * amp * 0.7;
          for (const row of [0, 1]) {
            const k = i + row * (SEG + 1);
            pos.setY(k, (row === 0 ? 0.17 : -0.17) * (1 - 0.6 * u) + wy);
            pos.setZ(k, r.off + wz);
          }
        }
        pos.needsUpdate = true;
      }
      const flee = state === "flee";
      mats.forEach((m, i) => (m.opacity = (flee ? 0.55 : 0.82) - i * 0.18));
      loot.visible = stolen > 0;
      loot.children.forEach((c, i) => {
        c.visible = i < stolen;
        c.position.set(-1.1 - i * 0.25, Math.sin(t * 6 + i) * 0.12, Math.cos(t * 5 + i) * 0.1);
      });
    },
  };
}

export interface CharmRig {
  group: THREE.Group;
  update(t: number, available: boolean, respawnFrac: number): void;
}

/** Bùa Gió: a red paper talisman with a gold border and tassel. */
export function createCharm(): CharmRig {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const gold = new THREE.MeshStandardMaterial({
    color: PAL.gold,
    emissive: PAL.gold,
    emissiveIntensity: 0.5,
    roughness: 0.5,
  });
  const red = new THREE.MeshStandardMaterial({
    color: PAL.scarf,
    emissive: PAL.scarf,
    emissiveIntensity: 0.45,
    roughness: 0.7,
  });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.92, 0.04), gold);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.06), red);
  const mark = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), gold);
  mark.position.z = 0.04;
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 0.3, 6), gold);
  tassel.position.y = -0.62;
  spin.add(frame, paper, mark, tassel);
  const light = new THREE.PointLight(PAL.scarf, 6, 7);
  group.add(light);
  return {
    group,
    update(t, available, respawnFrac) {
      spin.rotation.y = t * 1.6;
      group.position.y = 1.2 + Math.sin(t * 2.2) * 0.12;
      group.visible = true;
      // taken: leave a faint ghost that fills back in as the respawn timer runs down
      const a = available ? 1 : 0.12 + 0.2 * (1 - respawnFrac);
      for (const m of [frame, paper, mark, tassel]) {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.transparent = !available;
        mat.opacity = a;
      }
      light.intensity = available ? 6 : 0;
    },
  };
}
