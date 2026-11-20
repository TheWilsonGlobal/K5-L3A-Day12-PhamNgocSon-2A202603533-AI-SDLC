import { Sim, defaultInput } from "./sim.ts";
import {
  InputError,
  type DrifterState,
  type InputFrame,
  type InputState,
  type Scenario,
  type ShadeState,
  type Tuning,
  type Vec3,
} from "./types.ts";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNat = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;

function vec3(v: unknown, what: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum))
    throw new InputError(`${what}: expected [x, y, z] numbers`);
  return [v[0] as number, v[1] as number, v[2] as number];
}

const SHADE_STATES: ShadeState[] = ["spawning", "wander", "chase", "recoil", "stunned", "drain"];
const DRIFTER_STATES: DrifterState[] = ["idle", "chase", "flee", "removed"];
const BUTTONS = ["jump", "interact", "pulse", "dash", "pause"] as const;

export function parseInputs(raw: unknown): InputFrame[] {
  if (!isObj(raw) || !Array.isArray(raw.frames))
    throw new InputError('inputs: expected an object with a "frames" array');
  let last = -1;
  return raw.frames.map((f, i) => {
    const w = `inputs.frames[${i}]`;
    if (!isObj(f)) throw new InputError(`${w}: expected an object`);
    const tick = f.tick;
    if (!isNat(tick)) throw new InputError(`${w}.tick: expected a non-negative integer`);
    if (tick <= last) throw new InputError(`${w}.tick: must be strictly increasing`);
    last = tick;
    const out: InputFrame = { tick };
    if (f.move !== undefined) {
      const m = f.move;
      if (!Array.isArray(m) || m.length !== 2 || !m.every(isNum))
        throw new InputError(`${w}.move: expected [x, z] numbers`);
      if (m.some((c) => (c as number) < -1 || (c as number) > 1))
        throw new InputError(`${w}.move: components must be within [-1, 1]`);
      out.move = [m[0] as number, m[1] as number];
    }
    if (f.cam_yaw_deg !== undefined) {
      if (!isNum(f.cam_yaw_deg)) throw new InputError(`${w}.cam_yaw_deg: expected a number`);
      out.cam_yaw_deg = f.cam_yaw_deg;
    }
    for (const k of BUTTONS) {
      if (f[k] !== undefined) {
        if (typeof f[k] !== "boolean") throw new InputError(`${w}.${k}: expected a boolean`);
        out[k] = f[k] as boolean;
      }
    }
    return out;
  });
}

export function parseScenario(raw: unknown): Scenario {
  if (!isObj(raw)) throw new InputError("scenario: expected an object");
  const s: Scenario = {};
  if (raw.player !== undefined) {
    if (!isObj(raw.player)) throw new InputError("scenario.player: expected an object");
    const p = raw.player;
    s.player = {};
    if (p.pos !== undefined) s.player.pos = vec3(p.pos, "scenario.player.pos");
    for (const k of [
      "carried",
      "flames",
      "invuln_ticks",
      "dash_cd_ticks",
      "pulse_cd_ticks",
      "charm_ticks",
      "successful_lights",
    ] as const) {
      if (p[k] !== undefined) {
        if (!isNat(p[k]))
          throw new InputError(`scenario.player.${k}: expected a non-negative integer`);
        s.player[k] = p[k] as number;
      }
    }
  }
  for (const k of ["random_motes", "random_shades", "random_drifters", "wind_enabled"] as const) {
    if (raw[k] !== undefined) {
      if (typeof raw[k] !== "boolean") throw new InputError(`scenario.${k}: expected a boolean`);
      s[k] = raw[k] as boolean;
    }
  }
  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) throw new InputError("scenario.motes: expected an array");
    s.motes = raw.motes.map((m, i) => vec3(m, `scenario.motes[${i}]`));
  }
  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) throw new InputError("scenario.shades: expected an array");
    s.shades = raw.shades.map((x, i) => {
      const w = `scenario.shades[${i}]`;
      if (!isObj(x)) throw new InputError(`${w}: expected an object`);
      const o: NonNullable<Scenario["shades"]>[number] = {};
      if (x.id !== undefined) {
        if (typeof x.id !== "string") throw new InputError(`${w}.id: expected a string`);
        o.id = x.id;
      }
      if (x.pos !== undefined) o.pos = vec3(x.pos, `${w}.pos`);
      if (x.state !== undefined) {
        if (!SHADE_STATES.includes(x.state as ShadeState))
          throw new InputError(`${w}.state: expected one of ${SHADE_STATES.join(", ")}`);
        o.state = x.state as ShadeState;
      }
      if (x.state_ticks_left !== undefined) {
        if (!isNat(x.state_ticks_left))
          throw new InputError(`${w}.state_ticks_left: expected a non-negative integer`);
        o.state_ticks_left = x.state_ticks_left;
      }
      if (x.target_lantern_id !== undefined) {
        if (x.target_lantern_id !== null && typeof x.target_lantern_id !== "string")
          throw new InputError(`${w}.target_lantern_id: expected a string or null`);
        o.target_lantern_id = x.target_lantern_id;
      }
      return o;
    });
  }
  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) throw new InputError("scenario.drifters: expected an array");
    s.drifters = raw.drifters.map((x, i) => {
      const w = `scenario.drifters[${i}]`;
      if (!isObj(x)) throw new InputError(`${w}: expected an object`);
      const o: NonNullable<Scenario["drifters"]>[number] = {};
      if (x.id !== undefined) {
        if (typeof x.id !== "string") throw new InputError(`${w}.id: expected a string`);
        o.id = x.id;
      }
      if (x.pos !== undefined) o.pos = vec3(x.pos, `${w}.pos`);
      if (x.state !== undefined) {
        if (!DRIFTER_STATES.includes(x.state as DrifterState))
          throw new InputError(`${w}.state: expected one of ${DRIFTER_STATES.join(", ")}`);
        o.state = x.state as DrifterState;
      }
      for (const k of ["stolen", "state_ticks_left"] as const) {
        if (x[k] !== undefined) {
          if (!isNat(x[k])) throw new InputError(`${w}.${k}: expected a non-negative integer`);
          o[k] = x[k] as number;
        }
      }
      return o;
    });
  }
  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) throw new InputError("scenario.charms: expected an array");
    s.charms = raw.charms.map((x, i) => {
      const w = `scenario.charms[${i}]`;
      if (!isObj(x)) throw new InputError(`${w}: expected an object`);
      const o: NonNullable<Scenario["charms"]>[number] = {};
      if (x.id !== undefined) {
        if (typeof x.id !== "string") throw new InputError(`${w}.id: expected a string`);
        o.id = x.id;
      }
      if (x.pos !== undefined) o.pos = vec3(x.pos, `${w}.pos`);
      if (x.available !== undefined) {
        if (typeof x.available !== "boolean")
          throw new InputError(`${w}.available: expected a boolean`);
        o.available = x.available;
      }
      if (x.respawn_ticks !== undefined) {
        if (!isNat(x.respawn_ticks))
          throw new InputError(`${w}.respawn_ticks: expected a non-negative integer`);
        o.respawn_ticks = x.respawn_ticks;
      }
      return o;
    });
  }
  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) throw new InputError("scenario.lanterns: expected an array");
    s.lanterns = raw.lanterns.map((x, i) => {
      const w = `scenario.lanterns[${i}]`;
      if (!isObj(x) || typeof x.id !== "string")
        throw new InputError(`${w}: expected an object with an id`);
      const o: NonNullable<Scenario["lanterns"]>[number] = { id: x.id };
      if (x.pos !== undefined) o.pos = vec3(x.pos, `${w}.pos`);
      if (x.lit !== undefined) {
        if (typeof x.lit !== "boolean") throw new InputError(`${w}.lit: expected a boolean`);
        o.lit = x.lit;
      }
      if (x.fuel !== undefined) {
        if (!isNum(x.fuel) || x.fuel < 0 || x.fuel > 100)
          throw new InputError(`${w}.fuel: expected a number in [0, 100]`);
        o.fuel = x.fuel;
      }
      if (x.ever_lit !== undefined) {
        if (typeof x.ever_lit !== "boolean")
          throw new InputError(`${w}.ever_lit: expected a boolean`);
        o.ever_lit = x.ever_lit;
      }
      if (x.deposited !== undefined) {
        if (!isNum(x.deposited) || x.deposited < 0)
          throw new InputError(`${w}.deposited: expected a number >= 0`);
        o.deposited = x.deposited;
      }
      return o;
    });
  }
  if (raw.time_left_s !== undefined) {
    if (!isNum(raw.time_left_s) || raw.time_left_s < 0)
      throw new InputError("scenario.time_left_s: expected a number >= 0");
    s.time_left_s = raw.time_left_s;
  }
  return s;
}

export interface HeadlessOptions {
  tuning: Tuning;
  seed: number;
  ticks: number;
  night?: number;
  snapshotEvery?: number;
  scenario?: Scenario;
  inputs?: InputFrame[];
}

/** Runs the sim headless and returns the JSONL lines (without trailing newlines). */
export function runHeadless(o: HeadlessOptions): string[] {
  const every = o.snapshotEvery ?? 10;
  const sim = new Sim(o.tuning, o.seed, o.scenario, o.night ?? 1);
  const frames = o.inputs ?? [];
  const input: InputState = defaultInput();
  const lines: string[] = [];
  let fi = 0;
  let lastSnap = -1;
  const snap = () => {
    lines.push(JSON.stringify(sim.snapshot()));
    lastSnap = sim.tick;
  };

  snap(); // tick 0: after scenario setup, before inputs
  lines.push(JSON.stringify(sim.nightStartEvent()));
  for (let k = 0; k < o.ticks && !sim.outcome; k++) {
    while (fi < frames.length && frames[fi]!.tick <= k) {
      const f = frames[fi++]!;
      if (f.move) input.move = f.move;
      if (f.cam_yaw_deg !== undefined) input.cam_yaw_deg = f.cam_yaw_deg;
      for (const b of ["jump", "interact", "pulse", "dash", "pause"] as const) {
        if (f[b] !== undefined) input[b] = f[b];
      }
    }
    for (const e of sim.step(input)) lines.push(JSON.stringify(e));
    if (sim.tick % every === 0) snap();
  }
  if (lastSnap !== sim.tick) snap(); // always end on the final state
  lines.push(
    JSON.stringify({
      type: "end",
      ticks: sim.tick,
      state: sim.outcome ?? (sim.paused ? "paused" : "playing"),
      score: sim.score,
    }),
  );
  return lines;
}
