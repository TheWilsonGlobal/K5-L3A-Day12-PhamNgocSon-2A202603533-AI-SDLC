import { Sim, defaultInput } from "./sim.ts";
import {
  InputError,
  type InputFrame,
  type InputState,
  type Scenario,
  type Tuning,
  type Vec3,
} from "./types.ts";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function vec3(v: unknown, what: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum))
    throw new InputError(`${what}: expected [x, y, z] numbers`);
  return [v[0] as number, v[1] as number, v[2] as number];
}

export function parseInputs(raw: unknown): InputFrame[] {
  if (!isObj(raw) || !Array.isArray(raw.frames))
    throw new InputError('inputs: expected an object with a "frames" array');
  let last = -1;
  return raw.frames.map((f, i) => {
    const w = `inputs.frames[${i}]`;
    if (!isObj(f)) throw new InputError(`${w}: expected an object`);
    const tick = f.tick;
    if (!isNum(tick) || !Number.isInteger(tick) || tick < 0)
      throw new InputError(`${w}.tick: expected a non-negative integer`);
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
    for (const k of ["jump", "interact", "pulse"] as const) {
      if (f[k] !== undefined) {
        if (typeof f[k] !== "boolean") throw new InputError(`${w}.${k}: expected a boolean`);
        out[k] = f[k];
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
    for (const k of ["carried", "flames"] as const) {
      if (p[k] !== undefined) {
        if (!isNum(p[k]) || !Number.isInteger(p[k]) || (p[k] as number) < 0)
          throw new InputError(`scenario.player.${k}: expected a non-negative integer`);
        s.player[k] = p[k] as number;
      }
    }
  }
  for (const k of ["random_motes", "random_shades"] as const) {
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
      if (!isObj(x)) throw new InputError(`scenario.shades[${i}]: expected an object`);
      const o: { id?: string; pos?: Vec3 } = {};
      if (x.id !== undefined) {
        if (typeof x.id !== "string")
          throw new InputError(`scenario.shades[${i}].id: expected a string`);
        o.id = x.id;
      }
      if (x.pos !== undefined) o.pos = vec3(x.pos, `scenario.shades[${i}].pos`);
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
  snapshotEvery?: number;
  scenario?: Scenario;
  inputs?: InputFrame[];
}

/** Runs the sim headless and returns the JSONL lines (without trailing newlines). */
export function runHeadless(o: HeadlessOptions): string[] {
  const every = o.snapshotEvery ?? 10;
  const sim = new Sim(o.tuning, o.seed, o.scenario);
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
  for (let k = 0; k < o.ticks && sim.state === "playing"; k++) {
    while (fi < frames.length && frames[fi]!.tick <= k) {
      const f = frames[fi++]!;
      if (f.move) input.move = f.move;
      if (f.cam_yaw_deg !== undefined) input.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) input.jump = f.jump;
      if (f.interact !== undefined) input.interact = f.interact;
      if (f.pulse !== undefined) input.pulse = f.pulse;
    }
    for (const e of sim.step(input)) lines.push(JSON.stringify(e));
    if (sim.tick % every === 0) snap();
  }
  if (lastSnap !== sim.tick) snap(); // always end on the final state
  lines.push(JSON.stringify({ type: "end", ticks: sim.tick, state: sim.state, score: sim.score }));
  return lines;
}
