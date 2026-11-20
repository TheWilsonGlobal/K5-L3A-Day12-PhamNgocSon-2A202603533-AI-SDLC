import { makeRng } from "./rng.ts";
import { STEP, VOID, durationKey, getMap, type NightMap } from "./maps.ts";
import {
  InputError,
  type DrifterState,
  type EventName,
  type InputState,
  type Scenario,
  type ShadeState,
  type SimEvent,
  type Snapshot,
  type Tuning,
  type Vec3,
} from "./types.ts";

export const TICK_RATE = 60;
const DT = 1 / TICK_RATE;

// Standard numbers of TICKET-02 that are not part of `tuning`.
const JUMP_VEL = 7.0;
const GRAVITY = -20.0;
const FALL_Y = -10;
const FALL_WAIT_TICKS = 60;
const RESPAWN_INVULN_TICKS = 90;
const CHARM_SPEED = 7.2;
const CHARM_TICKS = 600;
const CHARM_RESPAWN_TICKS = 2700;
const START_MOTES = 20;
const MOTE_CAP = 30;
const MOTE_SPAWN_TICKS = 240;
const DROPPED_TTL = 480;
// Carry capacity = CAPACITY_BASE + CAPACITY_PER_LIGHT * successful_lights, capped at tuning.capacity_max (G15).
const CAPACITY_BASE = 10;
const CAPACITY_PER_LIGHT = 2;
// Lantern fuel is an integer count of 1/60 fuel units (C2): 100 fuel = 6000 units.
const FUEL_UNITS = 60;
// fuel_drain is emitted on every 60th draining tick of a shade (G5).
const FUEL_DRAIN_EVENT_TICKS = 60;
// A wandering shade stops and drains within this XZ distance of its lantern (C6).
const SHADE_DRAIN_RANGE = 2;
// Mây within this XZ distance turns a draining shade into a chasing one (C6).
const SHADE_DRAIN_CHASE_DIST = 6;
const SHADE_FIRST_SPAWN_TICK = 300;
const SHADE_FIRST_SPAWN_COUNT = 2;
const SHADE_MIN_SPAWN_DIST = 15;
const SHADE_DETECT = 12;
const SHADE_GIVE_UP = 18;
const SHADE_WANDER_SPEED = 2.0;
const SHADE_SPAWNING_TICKS = 60; // not fixed by the ticket
const RECOIL_TICKS = 60;
const RECOIL_DIST = 2;
const PUSH_TICKS = 15;
const PULSE_Y_OFFSET = 0.8;
const EJECT_TICKS = 30;
const PICKUP_DY = 1.5;
const HIT_DY = 1.5;
const DRIFTER_MAX = 2;
const DRIFTER_SPAWN_TICKS = 1200;
const DRIFTER_IDLE_SPEED = 2;
const DRIFTER_FAST_SPEED = 7;
const DRIFTER_CHASE_CARRY = 5;
const DRIFTER_CHASE_DIST = 15;
const DRIFTER_TOUCH = 1.2;
const DRIFTER_STEAL = 3;
const DRIFTER_FLEE_TICKS = 240;
const DRIFTER_DROP_REMOVE_TICKS = 120;
const WIND_PERIOD = 30 * TICK_RATE;
const WIND_DURATION = 5 * TICK_RATE;
const WIND_WARNING = 2 * TICK_RATE;
const WIND_PUSH = 2;

export const r3 = (x: number): number => {
  const v = Math.round(x * 1000) / 1000;
  return v === 0 ? 0 : v;
};
const rv = (p: Vec3): Vec3 => [r3(p[0]), r3(p[1]), r3(p[2])];
const distXZ = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const idNum = (id: string): number => {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
};
const byId = <T extends { id: string }>(a: T, b: T): number => idNum(a.id) - idNum(b.id);
const hash32 = (n: number): number => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};
/** Fuel in integer 1/60 units from a fuel value (scenario input, tuning). */
const fuelUnits = (fuel: number): number => Math.round(fuel * FUEL_UNITS);
/** Fuel in units to 1 decimal of fuel (G6: nearest). */
const fuelOut = (units: number): number => Math.round((units / FUEL_UNITS) * 10) / 10;

interface Lantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
  fuel: number; // integer units of 1/60 fuel (100 fuel = 6000)
  ever_lit: boolean;
  relit_count: number;
}
interface Shade {
  id: string;
  pos: Vec3; // centre of the body: ground + 1
  state: ShadeState;
  left: number; // ticks left in spawning / stunned / recoil
  target_lantern_id: string | null;
  drain_ticks: number; // ticks spent in drain, for fuel_drain every 60 ticks (G5)
  eject: number;
  push: { left: number; dx: number; dz: number } | null;
  recoil: { dx: number; dz: number } | null;
  heading: number;
  headLeft: number;
}
interface Mote {
  id: string;
  pos: Vec3;
  kind: "random" | "dropped";
  ttl: number | null;
}
interface Drifter {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
  left: number;
  heading: number;
  headLeft: number;
}
interface Charm {
  id: string;
  pos: Vec3;
  available: boolean;
  respawn: number;
}

export const defaultInput = (): InputState => ({
  move: [0, 0],
  cam_yaw_deg: 0,
  jump: false,
  interact: false,
  pulse: false,
  dash: false,
  pause: false,
});

export class Sim {
  readonly tuning: Tuning;
  readonly map: NightMap;
  readonly night: 1 | 2 | 3;
  tick = 0; // every step, including paused ones
  simTick = 0; // gameplay steps only
  paused = false;
  outcome: "won" | "lost" | null = null;
  score = 0;

  pos: Vec3;
  vel: Vec3 = [0, 0, 0];
  grounded = true;
  facing: [number, number];
  flames: number;
  carried = 0;
  invuln = 0;
  dashCd = 0;
  pulseCd = 0;
  charm = 0;
  dashLeft = 0;
  respawnWait = 0;
  successfulLights = 0; // lights this night, reset per night; scenario-placed lights do not count

  lanterns: Lantern[] = [];
  shades: Shade[] = [];
  motes: Mote[] = [];
  drifters: Drifter[] = [];
  charms: Charm[] = [];
  wind = { active: false, dir_deg: 0 };
  windWarning = false;

  private rng: () => number;
  private seed: number;
  private startTicksLeft: number;
  private randomMotes: boolean;
  private randomShades: boolean;
  private randomDrifters: boolean;
  private windEnabled: boolean;
  private prev = { jump: false, interact: false, pulse: false, dash: false, pause: false };
  private dashDir: [number, number] = [0, 1];
  private launch: [number, number] | null = null;
  private moteSeq = 0;
  private shadeSeq = 0;
  private drifterSeq = 0;
  private dashTicks: number;

  constructor(tuning: Tuning, seed: number, scenario: Scenario = {}, night: number = 1) {
    this.tuning = tuning;
    this.seed = seed | 0;
    this.map = getMap(night);
    this.night = this.map.night;
    this.rng = makeRng(seed);
    this.flames = tuning.flames;
    this.dashTicks = Math.round(tuning.dash_duration_s * TICK_RATE);
    this.startTicksLeft = Math.round(
      (scenario.time_left_s ?? tuning[durationKey(this.night)]) * TICK_RATE,
    );
    this.randomMotes = scenario.random_motes ?? true;
    this.randomShades = scenario.random_shades ?? true;
    this.randomDrifters = scenario.random_drifters ?? this.map.drifters;
    this.windEnabled = scenario.wind_enabled ?? this.map.wind;

    this.pos = [...this.map.start];
    this.facing = [...this.map.facing];

    this.lanterns = this.map.lanterns.map((p, i) => ({
      id: `L${i + 1}`,
      pos: [...p],
      lit: false,
      deposited: 0,
      fuel: 0,
      ever_lit: false,
      relit_count: 0,
    }));
    this.charms = this.map.charms.map((p, i) => ({
      id: `C${i + 1}`,
      pos: [...p],
      available: true,
      respawn: 0,
    }));

    // Start motes: 20 distinct points, chosen by a seeded partial shuffle.
    const pts = [...this.map.motePoints];
    const start: Vec3[] = [];
    for (let i = 0; i < Math.min(START_MOTES, pts.length); i++) {
      const j = i + Math.floor(this.rng() * (pts.length - i));
      [pts[i], pts[j]] = [pts[j]!, pts[i]!];
      start.push(pts[i]!);
    }
    if (scenario.motes) for (const p of scenario.motes) this.addMote(p, "random", null);
    else if (this.randomMotes) for (const p of start) this.addMote(p, "random", null);

    if (scenario.shades) {
      for (const s of scenario.shades) {
        const state = s.state ?? "wander";
        const sh = this.addShade(s.pos ?? [30, 0, 0], s.id, state);
        sh.left =
          s.state_ticks_left ??
          (state === "stunned"
            ? 120
            : state === "recoil"
              ? RECOIL_TICKS
              : state === "spawning"
                ? SHADE_SPAWNING_TICKS
                : 0);
        if (state === "recoil") sh.recoil = { dx: 0, dz: 0 };
        const target = s.target_lantern_id ?? null;
        if (target !== null && !this.lanterns.some((l) => l.id === target))
          throw new InputError(
            `scenario shade ${sh.id}: target_lantern_id "${target}" matches no lantern`,
          );
        sh.target_lantern_id = target;
      }
    }
    if (scenario.drifters) {
      for (const d of scenario.drifters) {
        const dr = this.addDrifter(d.pos ?? [0, 1.5, 0], d.id);
        dr.state = d.state ?? "idle";
        dr.stolen = d.stolen ?? 0;
        dr.left = d.state_ticks_left ?? (dr.state === "flee" ? DRIFTER_FLEE_TICKS : 0);
      }
    }
    if (scenario.charms) {
      this.charms = scenario.charms.map((c, i) => ({
        id: c.id ?? `C${i + 1}`,
        pos: [...(c.pos ?? this.map.charms[i] ?? [0, 0, 0])] as Vec3,
        available: c.available ?? true,
        respawn: c.respawn_ticks ?? 0,
      }));
    }

    const p = scenario.player;
    if (p) {
      if (p.pos) this.pos = [...p.pos];
      if (p.carried !== undefined) this.carried = p.carried;
      if (p.flames !== undefined) this.flames = p.flames;
      if (p.invuln_ticks !== undefined) this.invuln = p.invuln_ticks;
      if (p.dash_cd_ticks !== undefined) this.dashCd = p.dash_cd_ticks;
      if (p.pulse_cd_ticks !== undefined) this.pulseCd = p.pulse_cd_ticks;
      if (p.charm_ticks !== undefined) this.charm = p.charm_ticks;
    }
    for (const u of scenario.lanterns ?? []) {
      const l = this.lanterns.find((x) => x.id === u.id);
      if (!l) continue;
      if (u.pos) l.pos = [...u.pos];
      if (u.deposited !== undefined) l.deposited = u.deposited;
      if (u.lit === false) {
        // an explicit unlit lantern must still be relightable: its deposit must be below the price
        const cost = (u.ever_lit ?? false) ? tuning.relight_cost : tuning.lantern_cost;
        if (l.deposited >= cost)
          throw new InputError(
            `scenario lantern ${l.id}: lit false with deposited ${l.deposited} >= ${cost} can never be relit`,
          );
      }
      l.lit = u.lit ?? l.deposited >= tuning.lantern_cost;
      if (l.lit) {
        l.fuel = u.fuel !== undefined ? fuelUnits(u.fuel) : fuelUnits(tuning.fuel_max);
        l.ever_lit = u.ever_lit ?? true;
        if (l.deposited < tuning.lantern_cost) l.deposited = tuning.lantern_cost;
      } else {
        l.fuel = 0;
        l.ever_lit = u.ever_lit ?? false;
      }
    }
    if (scenario.player?.successful_lights !== undefined)
      this.successfulLights = scenario.player.successful_lights;
    const h = this.map.groundY(this.pos[0], this.pos[2]);
    this.grounded = h !== VOID && this.pos[1] <= h + 1e-9;
    this.updateWind();
  }

  // ------------------------------------------------------------ entity helpers

  private groundOf(x: number, z: number): number {
    const h = this.map.groundY(x, z);
    return h === VOID ? 0 : h;
  }

  private addMote(pos: Vec3, kind: "random" | "dropped", ttl: number | null): Mote {
    const m: Mote = { id: `M${++this.moteSeq}`, pos: [...pos], kind, ttl };
    this.motes.push(m);
    return m;
  }

  private addShade(pos: Vec3, id: string | undefined, state: ShadeState): Shade {
    let sid = id;
    if (!sid) {
      do sid = `S${++this.shadeSeq}`;
      while (this.shades.some((s) => s.id === sid));
    } else {
      this.shadeSeq = Math.max(this.shadeSeq, idNum(sid));
    }
    const s: Shade = {
      id: sid,
      pos: [pos[0], this.groundOf(pos[0], pos[2]) + 1, pos[2]],
      state,
      left: 0,
      target_lantern_id: null,
      drain_ticks: 0,
      eject: 0,
      push: null,
      recoil: null,
      heading: 0,
      headLeft: 0,
    };
    this.shades.push(s);
    return s;
  }

  private addDrifter(pos: Vec3, id?: string): Drifter {
    let did = id;
    if (!did) {
      do did = `D${++this.drifterSeq}`;
      while (this.drifters.some((d) => d.id === did));
    } else {
      this.drifterSeq = Math.max(this.drifterSeq, idNum(did));
    }
    const d: Drifter = {
      id: did,
      pos: [...pos],
      state: "idle",
      stolen: 0,
      left: 0,
      heading: 0,
      headLeft: 0,
    };
    this.drifters.push(d);
    return d;
  }

  get timeLeftTicks(): number {
    return Math.max(0, this.startTicksLeft - this.simTick);
  }
  get timeLeft(): number {
    return this.timeLeftTicks / TICK_RATE;
  }

  private updateWind(): void {
    const t = this.simTick;
    let k = Math.floor((t + WIND_WARNING) / WIND_PERIOD);
    const relevant = k >= 1 && t < WIND_PERIOD * k + WIND_DURATION;
    if (!relevant) k = Math.floor(t / WIND_PERIOD) + 1;
    const dir = hash32(this.seed * 31 + k) % 360;
    const active = this.windEnabled && relevant && t >= WIND_PERIOD * k;
    this.wind = { active, dir_deg: this.windEnabled ? dir : 0 };
    this.windWarning = this.windEnabled && relevant && t < WIND_PERIOD * k;
  }

  /** Carry capacity (G15): min(capacity_max, 10 + 2 · successful lights). */
  private capacity(): number {
    return Math.min(
      this.tuning.capacity_max,
      CAPACITY_BASE + CAPACITY_PER_LIGHT * this.successfulLights,
    );
  }

  /** A lit lantern below low_fuel_threshold: shades are drawn to it, and it has no safe zone. */
  private isWeak(l: Lantern): boolean {
    return l.lit && l.fuel < fuelUnits(this.tuning.low_fuel_threshold);
  }

  private lanternById(id: string | null): Lantern | undefined {
    return id === null ? undefined : this.lanterns.find((l) => l.id === id);
  }

  /** Nearest lantern passing `ok` within `radius` (XZ); equal distance goes to the lower id. */
  private nearestLantern(
    pos: Vec3,
    radius: number,
    ok: (l: Lantern) => boolean,
  ): Lantern | undefined {
    let best: Lantern | undefined;
    let bestD = Infinity;
    for (const l of this.lanterns) {
      if (!ok(l)) continue;
      const d = distXZ(pos, l.pos);
      if (d > radius) continue;
      if (
        !best ||
        d < bestD - 1e-12 ||
        (Math.abs(d - bestD) <= 1e-12 && idNum(l.id) < idNum(best.id))
      ) {
        best = l;
        bestD = d;
      }
    }
    return best;
  }

  private nearSafeZone(x: number, z: number): { lx: number; lz: number } | null {
    const threshold = fuelUnits(this.tuning.low_fuel_threshold);
    for (const l of this.lanterns) {
      if (!l.lit || l.fuel < threshold) continue;
      if (Math.hypot(x - l.pos[0], z - l.pos[2]) < this.tuning.safe_radius - 1e-9)
        return { lx: l.pos[0], lz: l.pos[2] };
    }
    return null;
  }

  /** Can a ground creature standing at height `gy` step to (x, z)? */
  private walkable(x: number, z: number, gy: number): boolean {
    const h = this.map.groundY(x, z);
    return h !== VOID && h <= gy + STEP;
  }

  private shadeMove(s: Shade, dx: number, dz: number): boolean {
    const gy = s.pos[1] - 1;
    const nx = s.pos[0] + dx;
    const nz = s.pos[2] + dz;
    if (this.walkable(nx, nz, gy)) {
      s.pos[0] = nx;
      s.pos[2] = nz;
    } else if (this.walkable(s.pos[0] + dx, s.pos[2], gy)) s.pos[0] += dx;
    else if (this.walkable(s.pos[0], s.pos[2] + dz, gy)) s.pos[2] += dz;
    else return false;
    s.pos[1] = this.groundOf(s.pos[0], s.pos[2]) + 1;
    return true;
  }

  private dropMotes(n: number, around: Vec3, ring: boolean): void {
    for (let i = 0; i < n; i++) {
      let p: Vec3 | null = null;
      for (let tries = 0; tries < 8 && !p; tries++) {
        const a = this.rng() * 2 * Math.PI;
        const r = ring ? 1.5 + this.rng() * 1.0 : 0;
        const x = around[0] + r * Math.cos(a);
        const z = around[2] + r * Math.sin(a);
        const h = this.map.groundY(x, z);
        if (h !== VOID && Math.abs(h - around[1]) <= PICKUP_DY) p = [x, h, z];
      }
      this.addMote(p ?? [around[0], around[1], around[2]], "dropped", DROPPED_TTL);
    }
  }

  // ------------------------------------------------------------ the tick

  /** Advance one tick in the order fixed by TICKET-02. Returns the events of that tick. */
  step(input: InputState): SimEvent[] {
    if (this.outcome) return [];
    const T = this.tuning;
    const ev: SimEvent[] = [];
    this.tick += 1;
    const emit = (name: EventName, data: Record<string, unknown> = {}) =>
      ev.push({ type: "event", tick: this.tick, name, data });

    const edge = {
      jump: input.jump && !this.prev.jump,
      interact: input.interact && !this.prev.interact,
      pulse: input.pulse && !this.prev.pulse,
      dash: input.dash && !this.prev.dash,
      pause: input.pause && !this.prev.pause,
    };
    this.prev = {
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
      dash: input.dash,
      pause: input.pause,
    };

    // 1. input / pause
    if (edge.pause) {
      this.paused = !this.paused;
      emit(this.paused ? "paused" : "resumed");
      if (this.paused) return ev; // just paused: stop here
    } else if (this.paused) return ev; // frozen: only `tick` advances
    this.simTick += 1;

    // 2. counters
    this.updateWind();
    this.invuln = Math.max(0, this.invuln - 1);
    this.dashCd = Math.max(0, this.dashCd - 1);
    this.pulseCd = Math.max(0, this.pulseCd - 1);
    this.charm = Math.max(0, this.charm - 1);
    for (const c of this.charms) {
      if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
    }
    for (const m of [...this.motes]) {
      if (m.ttl !== null && --m.ttl <= 0) this.motes.splice(this.motes.indexOf(m), 1);
    }
    for (const s of this.shades) {
      if (s.state === "spawning" || s.state === "stunned") {
        if (--s.left <= 0) {
          s.left = 0;
          s.state =
            s.state === "stunned" && distXZ(s.pos, this.pos) <= SHADE_DETECT ? "chase" : "wander";
        }
      }
    }
    for (const d of this.drifters) {
      if (d.state === "flee" && --d.left <= 0) d.state = "removed";
    }
    this.drifters = this.drifters.filter((d) => d.state !== "removed");

    // 2a. fuel: every lit lantern burns decay, plus drain for each shade draining it (G10: state after last step 8)
    const decay = Math.round((T.fuel_decay_per_s * FUEL_UNITS) / TICK_RATE);
    const drainPerTick = Math.round((T.drain_per_s * FUEL_UNITS) / TICK_RATE);
    const drainers = this.shades
      .filter((s) => {
        const l = this.lanternById(s.target_lantern_id);
        return s.state === "drain" && l !== undefined && l.lit;
      })
      .sort(byId);
    for (const l of this.lanterns) {
      if (!l.lit) continue;
      const n = drainers.filter((s) => s.target_lantern_id === l.id).length;
      l.fuel = Math.max(0, l.fuel - decay - n * drainPerTick);
    }
    for (const s of drainers) {
      s.drain_ticks += 1;
      const l = this.lanternById(s.target_lantern_id);
      if (l && s.drain_ticks % FUEL_DRAIN_EVENT_TICKS === 0)
        emit("fuel_drain", { lantern_id: l.id, shade_id: s.id, fuel: fuelOut(l.fuel) });
    }

    // 2b. lanterns that ran out of fuel go dark (ascending id, G13)
    for (const l of this.lanterns) {
      if (!l.lit || l.fuel > 0) continue;
      l.lit = false;
      l.fuel = 0;
      l.deposited = 0;
      l.ever_lit = true;
      emit("lantern_out", { lantern_id: l.id });
    }

    // 3. move Mây, then check falling
    this.movePlayer(input, edge, emit);

    const alive = this.respawnWait === 0;
    // 4. pick up fireflies and charms
    if (alive) {
      for (const m of [...this.motes]) {
        if (this.carried >= this.capacity()) break;
        if (
          distXZ(this.pos, m.pos) <= T.pickup_radius &&
          Math.abs(this.pos[1] - m.pos[1]) <= PICKUP_DY
        ) {
          this.motes.splice(this.motes.indexOf(m), 1);
          this.carried += 1;
          emit("mote_picked", { carried: this.carried });
        }
      }
      for (const c of this.charms) {
        if (
          c.available &&
          distXZ(this.pos, c.pos) <= T.pickup_radius &&
          Math.abs(this.pos[1] - c.pos[1]) <= PICKUP_DY
        ) {
          c.available = false;
          c.respawn = CHARM_RESPAWN_TICKS;
          this.charm = CHARM_TICKS;
          emit("charm_picked", { charm_id: c.id, charm_ticks: CHARM_TICKS });
        }
      }
    }

    // 5. lantern interaction
    if (alive && edge.interact && this.carried > 0) {
      const maxFuel = fuelUnits(T.fuel_max);
      // candidates: unlit lanterns, and lit lanterns that are not yet full (C6)
      const best = this.nearestLantern(
        this.pos,
        T.interact_radius,
        (l) => !l.lit || l.fuel < maxFuel,
      );
      if (best && !best.lit) {
        // deposit toward the price: 10 for a first light, 5 for a relight (G7: partial deposits accumulate)
        const cost = best.ever_lit ? T.relight_cost : T.lantern_cost;
        const amount = Math.min(this.carried, cost - best.deposited);
        if (amount > 0) {
          this.carried -= amount;
          best.deposited += amount;
          this.score += T.score.per_mote * amount;
          emit("deposit", { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= cost) {
            const relight = best.ever_lit;
            best.lit = true;
            best.fuel = maxFuel;
            best.ever_lit = true;
            if (relight) best.relit_count += 1;
            this.successfulLights += 1;
            this.score += relight ? T.score.per_relight : T.score.per_lantern;
            emit("lantern_lit", { lantern_id: best.id, relight });
          }
        }
      } else if (best) {
        const perMote = fuelUnits(T.fuel_per_mote);
        const used = Math.min(this.carried, Math.ceil((maxFuel - best.fuel) / perMote));
        if (used > 0) {
          best.fuel = Math.min(maxFuel, best.fuel + used * perMote);
          this.carried -= used;
          this.score += T.score.per_mote * used;
          emit("refuel", { lantern_id: best.id, amount: used, fuel: fuelOut(best.fuel) });
          if (best.fuel >= fuelUnits(T.low_fuel_threshold)) {
            // the lantern is safe again: shades drawing on it give up (their eject follows in step 6)
            for (const s of this.shades) {
              if (s.state === "drain" && s.target_lantern_id === best.id) {
                s.state = "wander";
                s.target_lantern_id = null;
                s.drain_ticks = 0;
              }
            }
          }
        }
      }
    }

    // 6. safe zones: shades caught inside a lit zone (fuel >= low_fuel_threshold) are pushed out over <= 30 ticks
    for (const s of this.shades) {
      if (s.eject === 0 && this.nearSafeZone(s.pos[0], s.pos[2])) s.eject = EJECT_TICKS;
      if (s.eject > 0) {
        const z = this.nearSafeZone(s.pos[0], s.pos[2]);
        if (!z) s.eject = 0;
        else {
          const dx = s.pos[0] - z.lx;
          const dz = s.pos[2] - z.lz;
          const d = Math.hypot(dx, dz);
          const ux = d > 1e-9 ? dx / d : 1;
          const uz = d > 1e-9 ? dz / d : 0;
          const step = Math.min(T.safe_radius / EJECT_TICKS, T.safe_radius - d);
          this.shadeMove(s, ux * step, uz * step);
          s.eject -= 1;
        }
      }
    }

    // 7. Tỏa Sáng
    if (alive && edge.pulse && this.pulseCd === 0 && this.carried >= T.pulse_cost) {
      this.carried -= T.pulse_cost;
      this.pulseCd = Math.round(T.pulse_cooldown_s * TICK_RATE);
      const cx = this.pos[0];
      const cy = this.pos[1] + PULSE_Y_OFFSET;
      const cz = this.pos[2];
      const ids: string[] = [];
      for (const s of [...this.shades].sort(byId)) {
        if (Math.hypot(s.pos[0] - cx, s.pos[1] - cy, s.pos[2] - cz) > T.pulse_radius) continue;
        let dx = s.pos[0] - cx;
        let dz = s.pos[2] - cz;
        const d = Math.hypot(dx, dz);
        if (d > 1e-9) {
          dx /= d;
          dz /= d;
        } else {
          dx = 1;
          dz = 0;
        }
        // G16: a shade stunned while draining scores per_stun_drain instead of per_stun (not both)
        const wasDraining = s.state === "drain";
        s.state = "stunned";
        s.left = Math.round(T.pulse_stun_s * TICK_RATE);
        s.recoil = null;
        s.target_lantern_id = null;
        s.drain_ticks = 0;
        s.push = {
          left: PUSH_TICKS,
          dx: (dx * T.pulse_push_m) / PUSH_TICKS,
          dz: (dz * T.pulse_push_m) / PUSH_TICKS,
        };
        this.score += wasDraining ? T.score.per_stun_drain : T.score.per_stun;
        ids.push(s.id);
      }
      for (const d of this.drifters) {
        if (Math.hypot(d.pos[0] - cx, d.pos[1] - cy, d.pos[2] - cz) > T.pulse_radius) continue;
        if (d.state === "chase") {
          d.state = "flee";
          d.left = DRIFTER_FLEE_TICKS;
        } else if (d.state === "flee" && d.stolen > 0) {
          this.dropMotes(d.stolen, [d.pos[0], this.groundOf(d.pos[0], d.pos[2]), d.pos[2]], false);
          emit("drifter_drop", { drifter_id: d.id, amount: d.stolen });
          d.stolen = 0;
          d.left = Math.min(d.left, DRIFTER_DROP_REMOVE_TICKS);
        }
      }
      emit("pulse", { stunned_ids: ids });
    }

    // 8. move shades and drifters
    this.moveShades();
    this.moveDrifters();

    // 9. contact: drifters steal first, then at most one shade hit (by id)
    if (alive) {
      for (const d of [...this.drifters].sort(byId)) {
        if (d.state !== "chase" || d.stolen > 0) continue;
        if (distXZ(this.pos, d.pos) > DRIFTER_TOUCH) continue;
        const amount = Math.min(DRIFTER_STEAL, this.carried);
        if (amount <= 0) continue;
        this.carried -= amount;
        d.stolen = amount;
        d.state = "flee";
        d.left = DRIFTER_FLEE_TICKS;
        emit("drifter_steal", { drifter_id: d.id, amount, carried: this.carried });
      }
      for (const s of [...this.shades].sort(byId)) {
        if (s.state !== "wander" && s.state !== "chase") continue;
        if (s.eject > 0) continue;
        if (distXZ(this.pos, s.pos) > T.shade_hit_radius) continue;
        if (Math.abs(this.pos[1] - (s.pos[1] - 1)) > HIT_DY) continue;
        if (this.invuln > 0) continue; // touching while invulnerable does nothing
        this.flames -= 1;
        this.invuln = Math.round(T.invuln_s * TICK_RATE);
        const dropped = Math.floor(this.carried * T.hit_drop_ratio);
        this.carried -= dropped;
        this.dropMotes(dropped, this.pos, true);
        emit("player_hit", { by: "shade", flames: this.flames, dropped });
        let dx = s.pos[0] - this.pos[0];
        let dz = s.pos[2] - this.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > 1e-9) {
          dx /= d;
          dz /= d;
        } else {
          dx = 1;
          dz = 0;
        }
        s.state = "recoil";
        s.left = RECOIL_TICKS;
        s.recoil = { dx: (dx * RECOIL_DIST) / RECOIL_TICKS, dz: (dz * RECOIL_DIST) / RECOIL_TICKS };
        break;
      }
    }

    // 10. scheduled spawns (new entities interact from the next tick)
    this.spawnScheduled(emit);

    // 11. win / lose: no flames first (even on the dawn tick); otherwise only the dawn tick decides
    if (this.flames <= 0) this.finish("lost", "no_flames", emit);
    else if (this.timeLeftTicks <= 0) {
      const lit = this.lanterns.filter((l) => l.lit);
      const need = Math.ceil(T.win_ratio * this.lanterns.length - 1e-9);
      if (lit.length >= need) {
        for (const l of lit)
          this.score += T.score.per_lit_lantern_dawn + Math.floor(l.fuel / FUEL_UNITS);
        this.score += this.flames * T.score.per_flame_left;
        this.finish("won", "dawn_survived", emit);
      } else this.finish("lost", "dawn", emit);
    }
    return ev;
  }

  // ------------------------------------------------------------ step 3

  private movePlayer(
    input: InputState,
    edge: { jump: boolean; dash: boolean },
    emit: (n: EventName, d?: Record<string, unknown>) => void,
  ): void {
    const T = this.tuning;
    if (this.respawnWait > 0) {
      if (--this.respawnWait === 0) {
        this.pos = [...this.map.start];
        this.vel = [0, 0, 0];
        this.grounded = true;
        this.launch = null;
        this.dashLeft = 0;
        this.invuln = RESPAWN_INVULN_TICKS;
      }
      return;
    }

    let [mx, mz] = input.move;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const th = (input.cam_yaw_deg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-9) this.facing = [wx / wl, wz / wl];

    if (edge.dash && this.dashLeft === 0 && this.dashCd === 0) {
      this.dashLeft = this.dashTicks;
      this.dashDir = wl > 1e-9 ? [wx / wl, wz / wl] : [...this.facing];
      this.dashCd = this.charm > 0 ? 0 : Math.round(T.dash_cooldown_s * TICK_RATE);
      emit("dash");
    }

    const speed = this.charm > 0 ? CHARM_SPEED : T.player_speed;
    const dashing = this.dashLeft > 0;
    let vx: number;
    let vz: number;
    if (dashing) {
      vx = this.dashDir[0] * T.dash_speed;
      vz = this.dashDir[1] * T.dash_speed;
      this.dashLeft -= 1;
    } else if (this.launch) {
      [vx, vz] = this.launch; // launch velocity is not overridden by the keys
    } else {
      vx = wx * speed;
      vz = wz * speed;
    }

    // jump pads, then jump
    if (this.grounded || this.vel[1] <= 0) {
      for (const p of this.map.pads) {
        if (
          Math.hypot(this.pos[0] - p.pos[0], this.pos[2] - p.pos[2]) <= p.radius &&
          this.pos[1] <= p.pos[1] + 0.5
        ) {
          this.launch = [p.vel[0], p.vel[1]];
          this.vel[1] = p.vy;
          this.grounded = false;
          if (!dashing) [vx, vz] = this.launch;
          break;
        }
      }
    }
    if (edge.jump && this.grounded) {
      this.vel[1] = JUMP_VEL;
      this.grounded = false;
    }

    let dx = vx * DT;
    let dz = vz * DT;
    if (this.wind.active) {
      const a = (this.wind.dir_deg * Math.PI) / 180;
      dx += Math.cos(a) * WIND_PUSH * DT;
      dz += Math.sin(a) * WIND_PUSH * DT;
    }
    const canEnter = (x: number, z: number) => {
      const h = this.map.groundY(x, z);
      return h === VOID || h <= this.pos[1] + STEP;
    };
    const nx = this.pos[0] + dx;
    const nz = this.pos[2] + dz;
    if (canEnter(nx, nz)) {
      this.pos[0] = nx;
      this.pos[2] = nz;
    } else if (canEnter(this.pos[0] + dx, this.pos[2])) this.pos[0] += dx;
    else if (canEnter(this.pos[0], this.pos[2] + dz)) this.pos[2] += dz;

    if (dashing) this.vel[1] = 0;
    else this.vel[1] += GRAVITY * DT;
    this.pos[1] += this.vel[1] * DT;
    const h = this.map.groundY(this.pos[0], this.pos[2]);
    if (h !== VOID && this.vel[1] <= 0 && this.pos[1] <= h + 1e-9) {
      this.pos[1] = h;
      this.vel[1] = 0;
      this.grounded = true;
      this.launch = null;
    } else this.grounded = false;
    this.vel[0] = vx;
    this.vel[2] = vz;

    if (this.pos[1] < FALL_Y) {
      const lost = this.carried;
      this.carried = 0;
      this.flames -= 1; // ignores invulnerability
      this.respawnWait = FALL_WAIT_TICKS;
      this.vel = [0, 0, 0];
      this.launch = null;
      this.dashLeft = 0;
      emit("player_hit", { by: "fall", flames: this.flames, dropped: 0, lost });
    }
  }

  // ------------------------------------------------------------ step 8

  private moveShades(): void {
    for (const s of this.shades) {
      if (s.eject > 0) continue;
      if (s.push && s.push.left > 0) {
        if (!this.shadeMove(s, s.push.dx, s.push.dz)) s.push = null;
        else if (--s.push.left <= 0) s.push = null;
      }
      if (s.state === "spawning" || s.state === "stunned") {
        this.clampSafe(s);
        continue;
      }
      const dxp = this.pos[0] - s.pos[0];
      const dzp = this.pos[2] - s.pos[2];
      const d = Math.hypot(dxp, dzp);
      if (s.state === "recoil") {
        if (s.recoil) this.shadeMove(s, s.recoil.dx, s.recoil.dz);
        if (--s.left <= 0) {
          s.left = 0;
          s.recoil = null;
          s.state = d <= SHADE_DETECT ? "chase" : "wander";
        }
        this.clampSafe(s);
        continue;
      }
      if (s.state === "drain") {
        // drain holds only while Mây is far, the lantern is still weak, and the shade is at its side
        const L = this.lanternById(s.target_lantern_id);
        if (d <= SHADE_DRAIN_CHASE_DIST) {
          s.state = "chase";
          s.target_lantern_id = null;
          s.drain_ticks = 0;
        } else if (L && this.isWeak(L) && distXZ(s.pos, L.pos) <= SHADE_DRAIN_RANGE) {
          this.clampSafe(s);
          continue;
        } else {
          s.state = "wander";
          s.target_lantern_id = null;
          s.drain_ticks = 0;
        }
      }
      if (s.state === "wander" && d <= SHADE_DETECT) {
        // G3: detection at 12 m still wins over the lantern seek; chase shades never retarget
        s.state = "chase";
        s.target_lantern_id = null;
      } else if (s.state === "chase" && d > SHADE_GIVE_UP) s.state = "wander";
      if (s.state === "chase") {
        if (d > 1e-9) {
          const step = Math.min(this.map.shadeSpeed * DT, d);
          this.shadeMove(s, (dxp / d) * step, (dzp / d) * step);
        }
      } else {
        // G1/G2: the Phase 2 random walk stays; a shade with a weak lantern in reach heads for it instead
        let L = this.lanternById(s.target_lantern_id);
        if (!L || !this.isWeak(L)) L = this.nearestLantern(s.pos, Infinity, (x) => this.isWeak(x));
        s.target_lantern_id = L?.id ?? null;
        if (L) {
          const dl = distXZ(s.pos, L.pos);
          if (dl <= SHADE_DRAIN_RANGE) {
            s.state = "drain";
            s.drain_ticks = 0;
          } else {
            const step = Math.min(SHADE_WANDER_SPEED * DT, dl);
            this.shadeMove(
              s,
              ((L.pos[0] - s.pos[0]) / dl) * step,
              ((L.pos[2] - s.pos[2]) / dl) * step,
            );
          }
        } else {
          if (--s.headLeft <= 0) {
            s.heading = this.rng() * 2 * Math.PI;
            s.headLeft = 120;
          }
          const step = SHADE_WANDER_SPEED * DT;
          if (!this.shadeMove(s, Math.cos(s.heading) * step, Math.sin(s.heading) * step))
            s.headLeft = 0;
        }
      }
      this.clampSafe(s);
    }
  }

  /** Shades outside a lit lantern's zone are blocked at its 6 m edge. */
  private clampSafe(s: Shade): void {
    const R = this.tuning.safe_radius;
    const z = this.nearSafeZone(s.pos[0], s.pos[2]);
    if (!z || s.eject > 0) return;
    const dx = s.pos[0] - z.lx;
    const dz = s.pos[2] - z.lz;
    const d = Math.hypot(dx, dz);
    const ux = d > 1e-9 ? dx / d : 1;
    const uz = d > 1e-9 ? dz / d : 0;
    const nx = z.lx + ux * R;
    const nz = z.lz + uz * R;
    if (this.walkable(nx, nz, s.pos[1] - 1)) {
      s.pos[0] = nx;
      s.pos[2] = nz;
      s.pos[1] = this.groundOf(nx, nz) + 1;
    }
  }

  private moveDrifters(): void {
    for (const d of this.drifters) {
      const dxp = this.pos[0] - d.pos[0];
      const dzp = this.pos[2] - d.pos[2];
      const dist = Math.hypot(dxp, dzp);
      if (d.state === "idle" || d.state === "chase") {
        const trigger = this.carried >= DRIFTER_CHASE_CARRY && dist <= DRIFTER_CHASE_DIST;
        d.state = trigger ? "chase" : "idle";
      }
      if (d.state === "chase") {
        if (dist > 1e-9) {
          const step = Math.min(DRIFTER_FAST_SPEED * DT, dist);
          d.pos[0] += (dxp / dist) * step;
          d.pos[2] += (dzp / dist) * step;
        }
      } else if (d.state === "flee") {
        const ux = dist > 1e-9 ? -dxp / dist : 1;
        const uz = dist > 1e-9 ? -dzp / dist : 0;
        d.pos[0] += ux * DRIFTER_FAST_SPEED * DT;
        d.pos[2] += uz * DRIFTER_FAST_SPEED * DT;
      } else if (d.state === "idle") {
        if (--d.headLeft <= 0) {
          d.heading = this.rng() * 2 * Math.PI;
          d.headLeft = 180;
        }
        d.pos[0] += Math.cos(d.heading) * DRIFTER_IDLE_SPEED * DT;
        d.pos[2] += Math.sin(d.heading) * DRIFTER_IDLE_SPEED * DT;
      }
      d.pos[1] = this.groundOf(d.pos[0], d.pos[2]) + 1.5;
    }
  }

  // ------------------------------------------------------------ step 10

  private spawnScheduled(emit: (n: EventName, d?: Record<string, unknown>) => void): void {
    const t = this.simTick;
    if (this.randomMotes && t > 0 && t % MOTE_SPAWN_TICKS === 0) {
      const randoms = this.motes.filter((m) => m.kind === "random");
      if (randoms.length < MOTE_CAP) {
        const free = this.map.motePoints.filter(
          (p) =>
            !randoms.some(
              (m) => Math.abs(m.pos[0] - p[0]) < 0.5 && Math.abs(m.pos[2] - p[2]) < 0.5,
            ),
        );
        if (free.length > 0)
          this.addMote(free[Math.floor(this.rng() * free.length)]!, "random", null);
      }
    }
    if (this.randomShades && t >= SHADE_FIRST_SPAWN_TICK) {
      const since = t - SHADE_FIRST_SPAWN_TICK;
      const count =
        since === 0 ? SHADE_FIRST_SPAWN_COUNT : since % this.map.shadeSpawnTicks === 0 ? 1 : 0;
      for (let i = 0; i < count; i++) {
        if (this.shades.length >= this.map.shadeMax) break;
        const valid = this.map.shadePoints.filter(
          (p) => distXZ(p, this.pos) >= SHADE_MIN_SPAWN_DIST && !this.nearSafeZone(p[0], p[2]),
        );
        if (valid.length === 0) break;
        const p = valid[Math.floor(this.rng() * valid.length)]!;
        const s = this.addShade(p, undefined, "spawning");
        s.left = SHADE_SPAWNING_TICKS;
        emit("shade_spawned", { id: s.id });
      }
    }
    if (this.randomDrifters && t > 0 && t % DRIFTER_SPAWN_TICKS === 0) {
      if (this.drifters.length < DRIFTER_MAX) {
        const p = this.map.shadePoints[Math.floor(this.rng() * this.map.shadePoints.length)]!;
        this.addDrifter([p[0], this.groundOf(p[0], p[2]) + 1.5, p[2]]);
      }
    }
  }

  private finish(
    result: "won" | "lost",
    reason: string,
    emit: (n: EventName, d?: Record<string, unknown>) => void,
  ): void {
    this.outcome = result;
    emit("game_over", { result, reason });
  }

  nightStartEvent(): SimEvent {
    return { type: "event", tick: 0, name: "night_start", data: { night: this.night } };
  }

  snapshot(): Snapshot {
    const sec = (ticks: number) => r3(ticks / TICK_RATE);
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.outcome ?? (this.paused ? "paused" : "playing"),
      night: this.night,
      time_left_s: r3(this.timeLeft),
      score: this.score,
      wind: { active: this.wind.active, dir_deg: this.wind.dir_deg },
      player: {
        pos: rv(this.pos),
        vel: rv(this.vel),
        grounded: this.grounded,
        flames: this.flames,
        carried: this.carried,
        invuln: sec(this.invuln),
        dash_cd_s: sec(this.dashCd),
        pulse_cd_s: sec(this.pulseCd),
        charm_s: sec(this.charm),
        capacity: this.capacity(),
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: rv(l.pos),
        lit: l.lit,
        deposited: l.deposited,
        fuel: l.lit ? fuelOut(l.fuel) : 0,
        ever_lit: l.ever_lit,
        relit_count: l.relit_count,
      })),
      shades: this.shades.map((s) => ({ id: s.id, pos: rv(s.pos), state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: rv(m.pos),
        kind: m.kind,
        ttl_s: m.ttl === null ? null : sec(m.ttl),
      })),
      drifters: this.drifters.map((d) => ({
        id: d.id,
        pos: rv(d.pos),
        state: d.state,
        stolen: d.stolen,
      })),
      charms: this.charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: sec(c.respawn),
      })),
    };
  }
}
