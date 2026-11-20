import { describe, expect, it } from "vitest";
import contract from "../game.contract.json" with { type: "json" };
import {
  Sim,
  VOID,
  defaultInput,
  getMap,
  type Contract,
  type InputState,
} from "../packages/sim/src/index.ts";

const T = (contract as Contract).tuning;

// ---------------------------------------------------------------- navigation (grid BFS over groundY)
const CELL = 0.25;
const X0 = -60;
const Z0 = -60;
const COLS = 680; // x in [-60, 110)
const ROWS = 480; // z in [-60, 60)
const STEP_OK = 0.2; // well under the sim's 0.35 step limit: ramp side walls are up to 0.5 m
const HOPS = 2; // cells of lookahead when steering down a distance field (short, so corners are not cut)
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];

interface Grid {
  h: Float32Array; // ground height, NaN when blocked
  fields: Map<number, Int16Array>;
}
const grids = new Map<number, Grid>();

function gridFor(night: 1 | 2 | 3): Grid {
  let g = grids.get(night);
  if (g) return g;
  const map = getMap(night);
  const raw = new Float32Array(COLS * ROWS);
  const cx = (i: number) => X0 + (i + 0.5) * CELL;
  const cz = (j: number) => Z0 + (j + 0.5) * CELL;
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) raw[j * COLS + i] = map.groundY(cx(i), cz(j));
  const h = new Float32Array(COLS * ROWS).fill(NaN);
  const solid = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < COLS && j < ROWS && raw[j * COLS + i]! !== VOID;
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      // keep one cell of clearance from the void edge so dodging does not walk Mây off the island
      if (
        !solid(i, j) ||
        !solid(i + 2, j) ||
        !solid(i - 2, j) ||
        !solid(i, j + 2) ||
        !solid(i, j - 2)
      )
        continue;
      const x = cx(i);
      const z = cz(j);
      // launch pads would fling Mây off her route: treat them as blocked
      if (map.pads.some((p) => Math.hypot(p.pos[0] - x, p.pos[2] - z) <= p.radius + 1)) continue;
      h[j * COLS + i] = raw[j * COLS + i]!;
    }
  g = { h, fields: new Map() };
  grids.set(night, g);
  return g;
}

const cellOf = (x: number, z: number): [number, number] => [
  Math.floor((x - X0) / CELL),
  Math.floor((z - Z0) / CELL),
];
const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < COLS && j < ROWS;

/** Nearest walkable cell to a point (ring search). */
function snap(g: Grid, x: number, z: number): number {
  const [ci, cj] = cellOf(x, z);
  for (let r = 0; r <= 16; r++)
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !inGrid(i, j)) continue;
        if (!Number.isNaN(g.h[j * COLS + i]!)) return j * COLS + i;
      }
  return -1;
}

function fieldTo(g: Grid, x: number, z: number): Int16Array {
  const key = Math.round(x * 4) * 100003 + Math.round(z * 4);
  let f = g.fields.get(key);
  if (f) return f;
  f = new Int16Array(COLS * ROWS).fill(-1);
  const seed = snap(g, x, z);
  if (seed >= 0) {
    const queue = new Int32Array(COLS * ROWS);
    let qh = 0;
    let qt = 0;
    queue[qt++] = seed;
    f[seed] = 0;
    while (qh < qt) {
      const c = queue[qh++]!;
      const ci = c % COLS;
      const cj = (c - ci) / COLS;
      for (let k = 0; k < 8; k++) {
        const i = ci + DX8[k]!;
        const j = cj + DZ8[k]!;
        if (!inGrid(i, j)) continue;
        const n = j * COLS + i;
        if (f[n]! >= 0 || Number.isNaN(g.h[n]!)) continue;
        if (Math.abs(g.h[n]! - g.h[c]!) > STEP_OK) continue;
        if (k >= 4) {
          // diagonals need both orthogonal neighbours walkable
          const a = cj * COLS + i;
          const b = j * COLS + ci;
          if (Number.isNaN(g.h[a]!) || Number.isNaN(g.h[b]!)) continue;
        }
        f[n] = f[c]! + 1;
        queue[qt++] = n;
      }
    }
  }
  g.fields.set(key, f);
  return f;
}

/** Path distance in cells from (x, z) to the field's goal, or -1. */
function pathDist(g: Grid, f: Int16Array, x: number, z: number): number {
  const c = snap(g, x, z);
  return c < 0 ? -1 : f[c]!;
}

/** Unit vector along the descent of the field, looking a few cells ahead. */
function descend(g: Grid, f: Int16Array, x: number, z: number): [number, number] | null {
  let c = snap(g, x, z);
  if (c < 0 || f[c]! < 0) return null;
  if (f[c]! === 0) return [0, 0];
  for (let hop = 0; hop < HOPS && f[c]! > 0; hop++) {
    const ci = c % COLS;
    const cj = (c - ci) / COLS;
    let best = c;
    for (let k = 0; k < 8; k++) {
      const i = ci + DX8[k]!;
      const j = cj + DZ8[k]!;
      if (!inGrid(i, j)) continue;
      const n = j * COLS + i;
      if (f[n]! >= 0 && f[n]! < f[best]!) best = n;
    }
    if (best === c) break;
    c = best;
  }
  const ci = c % COLS;
  const cj = (c - ci) / COLS;
  const dx = X0 + (ci + 0.5) * CELL - x;
  const dz = Z0 + (cj + 0.5) * CELL - z;
  const d = Math.hypot(dx, dz);
  return d < 1e-6 ? [0, 0] : [dx / d, dz / d];
}

const SEEDS = 20;
const BOT_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------- the bot
export interface BotResult {
  state: string;
  score: number;
  ticks: number;
  flames: number;
  /** Lanterns lit when the game ended. */
  lit: number;
  need: number;
  /** Seconds left when the game ended (0 at dawn). */
  timeLeft: number;
}

const FUEL_UNITS = 60; // the sim stores lantern fuel in 1/60 units
/** Seconds of burn a quota lantern should still hold at dawn (above the 30 s low-fuel threshold: no Shade drain). */
const DAWN_FUEL_FLOOR = 40;
/** The early "haven" lantern (only lit once a flame is lost) is topped up below this fuel. */
const HAVEN_REFUEL_BELOW = 45;
/** The sprint (light the whole quota) starts this many seconds before dawn: tour time x1.3 + margin, clamped. */
const SPRINT_MIN_S = 55;
const SPRINT_MAX_S = 100;
const SPRINT_MARGIN_S = 12;
const SPRINT_HIGH_S = 15; // extra when a terrace lantern (ramp climb) is in the quota
const ELEVATED_PENALTY_M = 60; // tour-length penalty per terrace lantern when choosing the quota
const HIGH_Y = 0.5; // anything above this is "up the ramp"
/** Motes banked per trip, and the stock carried before the sprint. Few motes in hand: Gió Lạc only chase at >= 5. */
const BATCH = 2;
const STOCK = 1;
const DODGE_R = 7;
const PULSE_R = 2;
const PULSE_SPARE = 3; // pulse only when this many motes remain after paying for it
const LEVEL_DY = 1.2; // a Shade this far above/below Mây (cliff) cannot reach her
const STUCK_TICKS = 90;
const STUCK_M = 1.5;
const STUCK_PULSE_AFTER = 2;
const SKIP_TICKS = 900;

type Lan = Sim["lanterns"][number];

/**
 * Banking bot for any night. Plan: the quota (ceil(win_ratio * N) lanterns: the one nearest the start plus the
 * cheapest tour of the others, terrace lanterns last) is filled in two phases.
 *  1. Bank: collect a few fireflies at a time and drop them into dark quota lanterns (deposits persist, are
 *     safe from hits and thieves, and leave the carry limit free) until each holds cost - 1.
 *  2. Sprint (the last stretch before dawn, so every lantern is still lit and above the low-fuel threshold at
 *     dawn): one firefly per lantern lights the whole quota in a short tour.
 * Same dodge / Lướt / Tỏa Sáng mechanics as before; walks a grid path so ramps and bridges work.
 */
export function playBot(seed: number, night: 1 | 2 | 3 = 1): BotResult {
  const sim = new Sim(T, seed, {}, night);
  const g = gridFor(night);
  const inp: InputState = defaultInput();
  const total = sim.lanterns.length;
  const need = Math.ceil(T.win_ratio * total);
  const startField = fieldTo(g, sim.pos[0], sim.pos[2]);
  const isHigh = (l: { pos: number[] }) => l.pos[1]! > HIGH_Y;
  const reachable = (p: number[]) => pathDist(g, startField, p[0]!, p[2]!) >= 0;
  const cells = (a: number[], b: number[]) =>
    pathDist(g, fieldTo(g, b[0]!, b[2]!), a[0]!, a[2]!) * CELL;

  // ---- plan: quota lanterns = the haven (nearest to the start) + the cheapest tour of the others
  const usable = sim.lanterns.filter((l) => reachable(l.pos));
  const haven = [...usable].sort((a, b) => cells(sim.pos, a.pos) - cells(sim.pos, b.pos))[0]!;
  const others = usable.filter((l) => l !== haven);
  const tourLen = (order: Lan[]) => {
    let at: number[] = haven.pos;
    let len = 0;
    const left = [...order];
    while (left.length) {
      left.sort((a, b) => cells(at, a.pos) - cells(at, b.pos));
      const nx = left.shift()!;
      len += cells(at, nx.pos);
      at = nx.pos;
    }
    return len;
  };
  const combos = (arr: Lan[], k: number): Lan[][] =>
    k === 0
      ? [[]]
      : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((rest) => [x, ...rest]));
  let best: Lan[] = [];
  let bestLen = Infinity;
  for (const c of combos(others, need - 1)) {
    const len = tourLen(c) + ELEVATED_PENALTY_M * c.filter(isHigh).length;
    if (len < bestLen) {
      bestLen = len;
      best = c;
    }
  }
  const quota: Lan[] = [haven, ...best].map((l) => sim.lanterns.find((x) => x.id === l.id)!);
  const sprintS = Math.min(
    SPRINT_MAX_S,
    Math.max(
      SPRINT_MIN_S,
      (bestLen / T.player_speed) * 1.3 + SPRINT_MARGIN_S + (best.some(isHigh) ? SPRINT_HIGH_S : 0),
    ),
  );

  let toggle = false;
  let goal: { kind: "lantern" | "mote"; id: string; pos: number[]; act: boolean } | null = null;
  let decideAt = 0;
  let lastCarried = -1;
  let hold = false;
  const reach = new Map<string, boolean>();
  const skipUntil = new Map<string, number>();
  let stuckRef: number[] = [...sim.pos];
  let stuckTick = 0;
  let stuckCount = 0;
  let stuckPulse = false;

  const capacity = () => Math.min(T.capacity_max, 10 + 2 * sim.successfulLights);
  const cost = (l: Lan) => (l.ever_lit ? T.relight_cost : T.lantern_cost);
  const room = (l: Lan) => cost(l) - 1 - l.deposited; // motes that can be banked without lighting it
  const fs = (l: Lan) => l.fuel / FUEL_UNITS;

  while (!sim.outcome && sim.simTick < 400 * 60) {
    const [px, , pz] = sim.pos;
    const dist = (p: number[]) => Math.hypot(p[0]! - px, p[2]! - pz);

    if (sim.simTick >= decideAt || sim.carried !== lastCarried) {
      decideAt = sim.simTick + 20;
      lastCarried = sim.carried;
      const tau = sim.timeLeft;
      const carried = sim.carried;
      const sprinting = tau <= sprintS;
      let target: Lan = haven;
      let want = 0;
      let act = false;
      hold = false;
      // a lost flame means the dodge is failing: light the haven early so there is a Shade-free zone to stand in
      const wantHaven = sim.flames < T.flames;
      if (!haven.lit && !sprinting && wantHaven) {
        target = haven;
        want = cost(haven) - haven.deposited;
        act = true;
      } else if (sprinting) {
        const jobs = quota.filter((l) => !l.lit || fs(l) - tau < DAWN_FUEL_FLOOR);
        if (jobs.length === 0) {
          hold = true;
          target = [...quota].sort((a, b) => dist(a.pos) - dist(b.pos))[0]!;
        } else {
          target = jobs.sort((a, b) => dist(a.pos) - dist(b.pos))[0]!;
          want = target.lit
            ? Math.ceil((DAWN_FUEL_FLOOR + tau - fs(target)) / T.fuel_per_mote)
            : cost(target) - target.deposited;
          act = true;
        }
      } else if (haven.lit && fs(haven) < HAVEN_REFUEL_BELOW && carried >= 2) {
        target = haven;
        want = 0;
        act = true;
      } else {
        const banks = quota
          .filter((l) => !l.lit && room(l) >= 1 && !isHigh(l))
          .sort((a, b) => dist(a.pos) - dist(b.pos));
        const fit = banks.find((l) => room(l) >= carried);
        if (fit) {
          target = fit;
          want = Math.min(BATCH, room(fit), capacity());
          act = true;
        } else {
          hold = true;
          target = haven.lit ? haven : [...quota].sort((a, b) => dist(a.pos) - dist(b.pos))[0]!;
          want = Math.min(capacity(), STOCK);
        }
      }
      const free = sim.motes.filter((m) => {
        if ((skipUntil.get(m.id) ?? 0) > sim.simTick) return false;
        if (!sprinting && m.pos[1]! > HIGH_Y) return false; // the ramp feet are where Shades camp: go up only in the sprint
        let r = reach.get(m.id);
        if (r === undefined) {
          r = reachable(m.pos);
          reach.set(m.id, r);
        }
        return r;
      });
      const mustCollect = carried < want || (carried === 0 && act) || (hold && carried < want);
      if (!mustCollect || free.length === 0) {
        goal = { kind: "lantern", id: target.id, pos: target.pos, act };
      } else {
        const danger = (p: number[]) =>
          sim.shades.some(
            (s) =>
              s.state !== "stunned" &&
              s.state !== "spawning" &&
              Math.hypot(s.pos[0] - p[0]!, s.pos[2] - p[2]!) < 9,
          )
            ? 40
            : 0;
        const c = (p: number[]) => dist(p) + danger(p);
        const kept = goal?.kind === "mote" ? free.find((m) => m.id === goal!.id) : undefined;
        const m =
          kept && danger(kept.pos) === 0
            ? kept
            : free.reduce((a, b) => (c(a.pos) < c(b.pos) ? a : b));
        goal = { kind: "mote", id: m.id, pos: m.pos, act: false };
      }
    }
    if (goal?.kind === "mote" && !sim.motes.some((m) => m.id === goal!.id)) decideAt = 0;

    // ---- steering
    let mx = 0;
    let mz = 0;
    const dg = goal ? dist(goal.pos) : 0;
    if (goal && !(goal.kind === "lantern" && dg < 1.2)) {
      const dir =
        dg < 1.5
          ? [(goal.pos[0]! - px) / (dg || 1), (goal.pos[2]! - pz) / (dg || 1)]
          : descend(g, fieldTo(g, goal.pos[0]!, goal.pos[2]!), px, pz);
      if (dir) [mx, mz] = dir as [number, number];
      else {
        // stuck on an isolated cell (tower base, pad rim): head for the nearest cell connected to the start
        const d2 = descendFromStart(g, startField, px, pz);
        if (d2) [mx, mz] = d2;
      }
    }
    // stuck detector: a Shade parked in a narrow passage (ramp, terrace edge) can balance the goal pull
    let stuck = false;
    if (sim.simTick - stuckTick >= STUCK_TICKS) {
      const still = Math.hypot(px - stuckRef[0]!, pz - stuckRef[2]!) < STUCK_M;
      stuckCount = still && !!goal && !hold && dg > 3 ? stuckCount + 1 : 0;
      stuck = stuckCount >= 1;
      stuckRef = [px, 0, pz];
      stuckTick = sim.simTick;
      if (stuck && goal?.kind === "mote") {
        skipUntil.set(goal.id, sim.simTick + SKIP_TICKS);
        decideAt = 0;
      }
    }
    if (stuckCount >= STUCK_PULSE_AFTER) stuckPulse = true;
    let nearest = Infinity;
    let dx = mx;
    let dz = mz;
    let pushed = false;
    for (const s of sim.shades) {
      if (
        s.state === "stunned" ||
        s.state === "spawning" ||
        Math.abs(s.pos[1] - 1 - sim.pos[1]) > LEVEL_DY
      )
        continue; // a Shade on another level (below a terrace cliff) cannot reach Mây
      const sx = px - s.pos[0];
      const sz = pz - s.pos[2];
      const sd = Math.hypot(sx, sz) || 0.01;
      nearest = Math.min(nearest, sd);
      if (sd < DODGE_R) {
        pushed = true;
        const w = ((DODGE_R - sd) / DODGE_R) * 2.2;
        dx += (sx / sd) * w;
        dz += (sz / sd) * w;
      }
    }
    const dl = Math.hypot(dx, dz);
    if (!pushed) {
      dx = mx;
      dz = mz;
    } else if (dl > 1e-6) {
      dx /= dl;
      dz /= dl;
      // never dodge into the void or up a wall: turn the dodge until the way ahead is walkable
      const walkable = (x: number, z: number) => {
        const h = sim.map.groundY(x, z);
        return h !== VOID && Math.abs(h - sim.pos[1]) <= STEP_OK;
      };
      let found = false;
      for (const turn of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
        const c = Math.cos(turn);
        const sn = Math.sin(turn);
        const tx = dx * c - dz * sn;
        const tz = dx * sn + dz * c;
        if (
          walkable(px + tx * 1.2, pz + tz * 1.2) &&
          walkable(px + tx * 2.4, pz + tz * 2.4) &&
          walkable(px + tx * 3.4, pz + tz * 3.4)
        ) {
          dx = tx;
          dz = tz;
          found = true;
          break;
        }
      }
      if (!found) {
        dx = mx;
        dz = mz;
      }
    }
    inp.move = dl < 1e-6 && nearest > DODGE_R ? [0, 0] : [dx, dz]; // yaw 0: x -> +X, z -> +Z

    // ---- actions
    toggle = !toggle;
    const tl = goal?.kind === "lantern" ? sim.lanterns.find((l) => l.id === goal!.id) : undefined;
    inp.interact =
      toggle &&
      !!goal?.act &&
      !!tl &&
      sim.carried > 0 &&
      dist(tl.pos) <= T.interact_radius - 0.2 &&
      (tl.lit ||
        !quota.slice(1).includes(tl) ||
        sim.timeLeft <= sprintS ||
        sim.carried <= room(tl));
    inp.pulse =
      toggle &&
      sim.carried >= T.pulse_cost &&
      ((nearest < PULSE_R && sim.dashCd > 0 && sim.carried >= T.pulse_cost + PULSE_SPARE) ||
        (stuckPulse && nearest < 8));
    if (inp.pulse) {
      stuckPulse = false;
      stuckCount = 0;
    }
    inp.dash = toggle && nearest < 2.2 && nearest >= 0;
    sim.step(inp);
  }
  return {
    state: sim.outcome ?? "playing",
    score: sim.score,
    ticks: sim.simTick,
    flames: sim.flames,
    lit: sim.lanterns.filter((l) => l.lit).length,
    need,
    timeLeft: sim.timeLeft,
  };
}

/** Heading to the nearest cell that is connected to the start (used when Mây stands on an isolated cell). */
function descendFromStart(g: Grid, f: Int16Array, x: number, z: number): [number, number] | null {
  const [ci, cj] = cellOf(x, z);
  for (let r = 1; r <= 24; r++)
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !inGrid(i, j)) continue;
        const n = j * COLS + i;
        if (Number.isNaN(g.h[n]!) || f[n]! < 0) continue;
        const dx = X0 + (i + 0.5) * CELL - x;
        const dz = Z0 + (j + 0.5) * CELL - z;
        const d = Math.hypot(dx, dz);
        return [dx / d, dz / d];
      }
  return null;
}

describe.each([1, 2, 3] as const)("Night %i is winnable", (night) => {
  it(
    "a lantern-banking bot wins on some seeds (the level is beatable, and not trivially)",
    () => {
      const results = Array.from({ length: SEEDS }, (_, i) => playBot(i + 1, night));
      const wins = results.filter((r) => r.state === "won").length;
      const detail = results.map((r) => `${r.state[0]}${r.lit}/${r.need}f${r.flames}`).join(" ");
      expect(wins, `night ${night}: bot wins ${wins}/${SEEDS} (${detail})`).toBeGreaterThanOrEqual(
        1,
      );
      expect(wins, `night ${night}: bot wins ${wins}/${SEEDS} (${detail})`).toBeLessThan(SEEDS);
    },
    BOT_TIMEOUT_MS,
  );
  it("and standing still loses", () => {
    const sim = new Sim(T, 1, {}, night);
    const inp = defaultInput();
    while (!sim.outcome) sim.step(inp);
    expect(sim.outcome).toBe("lost");
  });
});
