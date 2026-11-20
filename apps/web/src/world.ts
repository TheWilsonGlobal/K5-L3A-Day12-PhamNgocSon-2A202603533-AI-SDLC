import * as THREE from "three";
import { VOID, type NightMap } from "@ddl/sim";
import { PAL } from "./palette.ts";

const std = (color: number, roughness = 1, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, emissive, emissiveIntensity: ei });

export interface World {
  group: THREE.Group;
  /** Animates pads, clouds and the bell. */
  update(t: number): void;
}

/** A round island: sand cliff on the sides, grass on top, its top face at height `top`. */
function island(cx: number, cz: number, r: number, depth: number, top = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, depth, 72), [
    std(PAL.sand),
    std(PAL.grass),
    std(PAL.sand),
  ]);
  m.position.set(cx, top - depth / 2, cz);
  return m;
}

export function buildWorld(map: NightMap): World {
  const group = new THREE.Group();
  const animated: ((t: number) => void)[] = [];

  // cloud sea below everything
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    std(PAL.cloudSea, 1, PAL.cloudSea, 0.5),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -9;
  group.add(sea);
  const puffMat = new THREE.MeshBasicMaterial({
    color: 0x2a5f78,
    transparent: true,
    opacity: 0.35,
  });
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 46; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const rr = 60 + ((i * 37) % 170);
    const p = new THREE.Mesh(new THREE.SphereGeometry(9 + (i % 5) * 3, 12, 8), puffMat);
    p.scale.y = 0.35;
    p.position.set(
      Math.cos(a) * rr + (map.night === 2 ? 35 : 0),
      -7 + (i % 4) * 0.8,
      Math.sin(a) * rr,
    );
    puffs.push(p);
    group.add(p);
  }
  animated.push((t) =>
    puffs.forEach((p, i) => (p.position.y = -7 + (i % 4) * 0.8 + Math.sin(t * 0.3 + i) * 0.4)),
  );

  if (map.night === 1) {
    group.add(island(0, 0, 40, 4));
  } else if (map.night === 2) {
    group.add(island(0, 0, 28, 4), island(70, 0, 28, 4));
    // bamboo bridge, no rails
    const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 0.25, 4), std(PAL.wood));
    deck.position.set(35, -0.125, 0);
    group.add(deck);
    const plank = std(0x543a24);
    for (let i = 0; i < 19; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 4.02), plank);
      p.position.set(26 + i, 0.005, 0);
      group.add(p);
    }
    for (const z of [-2, 2]) {
      const rope = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 0.12), std(0x3f2c1a));
      rope.position.set(35, -0.2, z);
      group.add(rope);
    }
  } else {
    group.add(island(0, 0, 45, 5));
    // tier 1: half ring (z > 0), top at y = 3
    const sideMat = std(PAL.sand);
    const topMat = std(PAL.grass);
    const outer = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 24, 3, 64, 1, true, -Math.PI / 2, Math.PI),
      sideMat,
    );
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 12, 3, 48, 1, true, -Math.PI / 2, Math.PI),
      sideMat,
    );
    (inner.material as THREE.MeshStandardMaterial).side = THREE.BackSide;
    (outer.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const ringTop = new THREE.Mesh(new THREE.RingGeometry(12, 24, 64, 1, Math.PI, Math.PI), topMat);
    ringTop.rotation.x = -Math.PI / 2;
    ringTop.position.y = 3;
    outer.position.y = inner.position.y = 1.5;
    group.add(outer, ringTop);
    const innerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 12, 3, 48, 1, true, -Math.PI / 2, Math.PI),
      std(PAL.sand),
    );
    (innerWall.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    innerWall.position.y = 1.5;
    group.add(innerWall);
    for (const sx of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.05), sideMat);
      cap.position.set(sx * 18, 1.5, 0);
      group.add(cap);
    }
    // tier 2: top disc, top at y = 6
    group.add(island(0, 0, 8, 6, 6));
    // two 3 m wide ramps, foot at r = 30 (y 0), top at r = 24 (y 3)
    for (const deg of [30, 150]) {
      const holder = new THREE.Object3D();
      holder.rotation.y = -(deg * Math.PI) / 180;
      const len = Math.hypot(6, 3);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 3), std(PAL.wood));
      ramp.position.set(27, 1.5 - 0.15, 0);
      ramp.rotation.z = -Math.atan2(3, 6);
      holder.add(ramp);
      group.add(holder);
    }
    // bell tower on the top tier: R 2, 8 m tall
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 8, 24), std(0x8b6b4a, 0.9));
    tower.position.set(0, 10, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.4, 24), std(PAL.scarf, 0.8));
    roof.position.set(0, 15.2, 0);
    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 12),
      std(PAL.gold, 0.4, PAL.gold, 0.35),
    );
    bell.scale.y = 1.15;
    bell.position.set(0, 12.4, 0);
    group.add(tower, roof, bell);
    animated.push((t) => (bell.rotation.z = Math.sin(t * 1.4) * 0.12));
  }

  // jump pads
  for (const p of map.pads) {
    const g = new THREE.Group();
    g.position.set(p.pos[0], p.pos[1] + 0.03, p.pos[2]);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(p.radius, 32),
      new THREE.MeshBasicMaterial({ color: PAL.gold, transparent: true, opacity: 0.85 }),
    );
    disc.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(p.radius * 1.05, p.radius * 1.3, 32),
      new THREE.MeshBasicMaterial({
        color: PAL.lanternOn,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.9, 4),
      new THREE.MeshBasicMaterial({ color: PAL.lanternCore }),
    );
    arrow.position.y = 1.2;
    g.add(disc, ring, arrow);
    group.add(g);
    animated.push((t) => {
      ring.scale.setScalar(1 + 0.18 * Math.sin(t * 4));
      arrow.position.y = 1.2 + 0.3 * Math.sin(t * 4);
    });
  }

  return {
    group,
    update(t) {
      for (const f of animated) f(t);
    },
  };
}

// ---------------------------------------------------------------- minimap terrain

export interface TerrainImage {
  canvas: HTMLCanvasElement;
  minX: number;
  minZ: number;
  widthM: number;
  heightM: number;
}

const BOUNDS: Record<number, [number, number, number, number]> = {
  1: [-42, -42, 42, 42],
  2: [-30, -30, 100, 30],
  3: [-47, -47, 47, 47],
};

/** Pre-rendered top-down terrain (2 px per metre), coloured by height. */
export function renderTerrain(map: NightMap): TerrainImage {
  const [x0, z0, x1, z1] = BOUNDS[map.night]!;
  const ppm = 2;
  const w = Math.round((x1 - x0) * ppm);
  const h = Math.round((z1 - z0) * ppm);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) / ppm;
      const z = z0 + (j + 0.5) / ppm;
      const gy = map.groundY(x, z);
      if (gy === VOID) continue;
      const edge =
        map.groundY(x + 0.8, z) === VOID ||
        map.groundY(x - 0.8, z) === VOID ||
        map.groundY(x, z + 0.8) === VOID ||
        map.groundY(x, z - 0.8) === VOID;
      const [r, g, b] = edge
        ? [236, 214, 150]
        : gy >= 13
          ? [214, 160, 110]
          : gy >= 5.5
            ? [150, 214, 176]
            : gy >= 2.5
              ? [110, 184, 150]
              : gy > 0.05
                ? [88, 160, 128]
                : [70, 138, 110];
      const k = (j * w + i) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, minX: x0, minZ: z0, widthM: x1 - x0, heightM: z1 - z0 };
}
