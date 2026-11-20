import type { Vec3 } from "./types.ts";

/**
 * Standard maps of TICKET-02. Angles are measured from +X, counter-clockwise when seen from above
 * in the XZ plane: x = r cos θ, z = r sin θ. (This matches the given Night 1 lantern coordinates.)
 */

export const VOID = Number.NEGATIVE_INFINITY;
/** A column whose top is more than this above the feet is a wall; lower steps and ramps are walkable. */
export const STEP = 0.35;

export interface Pad {
  pos: Vec3;
  radius: number;
  vy: number;
  /** Horizontal launch velocity (m/s), kept until landing. */
  vel: [number, number];
}

export interface NightMap {
  night: 1 | 2 | 3;
  name: string;
  /** Spawn / respawn point and the direction Mây faces at the start. */
  start: Vec3;
  facing: [number, number];
  /** Ground height at (x, z), or VOID when there is nothing to stand on. Tall columns act as walls. */
  groundY(x: number, z: number): number;
  lanterns: Vec3[];
  motePoints: Vec3[];
  shadePoints: Vec3[];
  pads: Pad[];
  charms: Vec3[];
  shadeSpeed: number;
  shadeSpawnTicks: number;
  shadeMax: number;
  drifters: boolean;
  wind: boolean;
}

const rad = (d: number) => (d * Math.PI) / 180;
const polar = (r: number, deg: number, y = 0, cx = 0, cz = 0): Vec3 => [
  Math.round((cx + r * Math.cos(rad(deg))) * 1000) / 1000,
  y,
  Math.round((cz + r * Math.sin(rad(deg))) * 1000) / 1000,
];
const ring = (
  n: number,
  r: number,
  startDeg: number,
  stepDeg: number,
  y = 0,
  cx = 0,
  cz = 0,
): Vec3[] => Array.from({ length: n }, (_, i) => polar(r, startDeg + stepDeg * i, y, cx, cz));
const toward = (from: Vec3, to: [number, number], speed: number): [number, number] => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[2];
  const d = Math.hypot(dx, dz);
  return [(dx / d) * speed, (dz / d) * speed];
};

// ---------------------------------------------------------------- Night 1 — Đảo Bến
const night1: NightMap = {
  night: 1,
  name: "Đảo Bến",
  start: [0, 0, 0],
  facing: [0, 1],
  groundY: (x, z) => (Math.hypot(x, z) <= 40 ? 0 : VOID),
  lanterns: [
    [0, 0, 25],
    [23.8, 0, 7.7],
    [14.7, 0, -20.2],
    [-14.7, 0, -20.2],
    [-23.8, 0, 7.7],
  ],
  motePoints: [...ring(8, 12, 0, 45), ...ring(16, 33, 0, 22.5)],
  shadePoints: ring(12, 37, 15, 30),
  pads: [],
  charms: [],
  shadeSpeed: 4.0,
  shadeSpawnTicks: 480,
  shadeMax: 6,
  drifters: false,
  wind: false,
};

// ---------------------------------------------------------------- Night 2 — Đảo Cau
const B_CENTER: [number, number] = [70, 0];
const night2Pads: Pad[] = [
  { pos: [20, 0, 18], radius: 1, vy: 14, vel: [0, 0] },
  { pos: [50, 0, -18], radius: 1, vy: 14, vel: [0, 0] },
];
night2Pads[0]!.vel = toward(night2Pads[0]!.pos, B_CENTER, 24);
night2Pads[1]!.vel = toward(night2Pads[1]!.pos, [0, 0], 24);

const night2: NightMap = {
  night: 2,
  name: "Đảo Cau",
  start: [0, 0, 0],
  facing: [0, 1],
  groundY: (x, z) => {
    if (Math.hypot(x, z) <= 28 || Math.hypot(x - 70, z) <= 28) return 0;
    if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0; // bamboo bridge, no rails
    return VOID;
  },
  lanterns: [
    [0, 0, 20],
    [17, 0, -10],
    [-17, 0, -10],
    [70, 0, 20],
    [87, 0, -10],
    [53, 0, -10],
  ],
  motePoints: [
    ...ring(4, 10, 0, 90, 0, 0, 0),
    ...ring(8, 22, 0, 45, 0, 0, 0),
    ...ring(4, 10, 0, 90, 0, 70, 0),
    ...ring(8, 22, 0, 45, 0, 70, 0),
  ],
  shadePoints: [...ring(8, 26, 22.5, 45, 0, 0, 0), ...ring(8, 26, 22.5, 45, 0, 70, 0)],
  pads: night2Pads,
  charms: [[35, 0, 0]],
  shadeSpeed: 4.0,
  shadeSpawnTicks: 420,
  shadeMax: 8,
  drifters: true,
  wind: false,
};

// ---------------------------------------------------------------- Night 3 — Đảo Chuông
const RAMP_ANGLES = [30, 150];
const night3: NightMap = {
  night: 3,
  name: "Đảo Chuông",
  start: [0, 0, -20],
  facing: [0, 1],
  groundY: (x, z) => {
    const r = Math.hypot(x, z);
    let h = r <= 45 ? 0 : VOID;
    if (r >= 12 && r <= 24 && z > 0) h = Math.max(h, 3);
    for (const a of RAMP_ANGLES) {
      const along = x * Math.cos(rad(a)) + z * Math.sin(rad(a));
      const perp = -x * Math.sin(rad(a)) + z * Math.cos(rad(a));
      if (along >= 23 && along <= 30 && Math.abs(perp) <= 1.5) {
        h = Math.max(h, Math.min(3, (3 * (30 - along)) / 6));
      }
    }
    if (r <= 8) h = Math.max(h, 6);
    if (r <= 2) h = 14; // bell tower: 6 + 8, a wall for walking and knock-back
    return h;
  },
  lanterns: [
    [0, 6, 6],
    [18, 3, 10],
    [-18, 3, 10],
    [35, 0, -10],
    [-35, 0, -10],
    [20, 0, -35],
    [-20, 0, -35],
  ],
  motePoints: [...ring(18, 34, 0, 20, 0), ...ring(8, 18, 20, 20, 3), ...ring(4, 5, 45, 90, 6)],
  shadePoints: ring(16, 43, 0, 22.5),
  pads: [{ pos: [0, 3, 13], radius: 1, vy: 12, vel: [0, -8] }],
  charms: [
    [30, 0, 25],
    [-30, 0, 25],
  ],
  shadeSpeed: 4.5,
  shadeSpawnTicks: 360,
  shadeMax: 10,
  drifters: true,
  wind: true,
};

export const MAPS: Record<1 | 2 | 3, NightMap> = { 1: night1, 2: night2, 3: night3 };

export function getMap(night: number): NightMap {
  const m = MAPS[night as 1 | 2 | 3];
  if (!m) throw new RangeError(`night must be 1, 2 or 3 (got ${night})`);
  return m;
}

/** Duration key of a night in `tuning`. */
export const durationKey = (night: 1 | 2 | 3) =>
  (night === 1 ? "night1_duration_s" : night === 2 ? "night2_duration_s" : "night3_duration_s") as
    "night1_duration_s" | "night2_duration_s" | "night3_duration_s";
