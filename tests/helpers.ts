import contract from "../game.contract.json" with { type: "json" };
import {
  parseScenario,
  runHeadless,
  type Contract,
  type InputFrame,
  type Scenario,
} from "../packages/sim/src/index.ts";

export const T = (contract as Contract).tuning;

/** A bare world: nothing spawns by itself unless a test opts in. */
export const EMPTY: Scenario = {
  random_motes: false,
  random_shades: false,
  random_drifters: false,
  wind_enabled: false,
  motes: [],
  shades: [],
  drifters: [],
};

export type Line = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RunOpts {
  scenario?: Scenario;
  /** Use the night's default entities instead of a bare world. */
  defaults?: boolean;
  frames?: InputFrame[];
  ticks: number;
  seed?: number;
  night?: number;
  every?: number;
}

export function run(o: RunOpts): { lines: Line[]; events: Line[]; snaps: Line[]; end: Line } {
  const sc = o.defaults ? (o.scenario ?? {}) : { ...EMPTY, ...o.scenario };
  const raw = runHeadless({
    tuning: T,
    seed: o.seed ?? 1,
    ticks: o.ticks,
    night: o.night ?? 1,
    snapshotEvery: o.every ?? 10,
    scenario: parseScenario(sc),
    inputs: o.frames,
  });
  const lines = raw.map((l) => JSON.parse(l) as Line);
  return {
    lines,
    events: lines.filter((l) => l.type === "event"),
    snaps: lines.filter((l) => l.type === "snapshot"),
    end: lines[lines.length - 1]!,
  };
}

/** Fuel (as written in a scenario) that a lit lantern burns through in exactly `n` ticks of decay. */
export const fuelFromTicks = (n: number): number => n / 60;

export const last = <A>(a: A[]): A => a[a.length - 1]!;
export const named = (events: Line[], name: string): Line[] =>
  events.filter((e) => e.name === name);
export const at = (snaps: Line[], tick: number): Line => snaps.find((s) => s.tick === tick)!;
