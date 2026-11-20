import { describe, expect, it } from "vitest";
import contract from "../game.contract.json" with { type: "json" };
import {
  parseInputs,
  parseScenario,
  runHeadless,
  InputError,
  type Contract,
  type InputFrame,
  type Scenario,
} from "../packages/sim/src/index.ts";

const T = (contract as Contract).tuning;
const EMPTY: Scenario = { random_motes: false, random_shades: false, motes: [], shades: [] };

type Line = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function run(opts: {
  scenario?: Scenario;
  frames?: InputFrame[];
  ticks: number;
  seed?: number;
  every?: number;
}): { lines: Line[]; events: Line[]; snaps: Line[]; end: Line } {
  const raw = runHeadless({
    tuning: T,
    seed: opts.seed ?? 1,
    ticks: opts.ticks,
    snapshotEvery: opts.every ?? 10,
    scenario: opts.scenario ? parseScenario({ ...EMPTY, ...opts.scenario }) : parseScenario(EMPTY),
    inputs: opts.frames,
  });
  const lines = raw.map((l) => JSON.parse(l) as Line);
  return {
    lines,
    events: lines.filter((l) => l.type === "event"),
    snaps: lines.filter((l) => l.type === "snapshot"),
    end: lines[lines.length - 1]!,
  };
}
const last = <A>(a: A[]): A => a[a.length - 1]!;

describe("tuning is the single source", () => {
  it("lists exactly 5 lanterns and the contract keys", () => {
    expect(T.lantern_count_night1).toBe(5);
    const r = run({ ticks: 0 });
    expect(r.snaps[0]!.lanterns).toHaveLength(5);
  });
});

describe("movement", () => {
  it("moves player_speed metres per second", () => {
    const r = run({ ticks: 60, frames: [{ tick: 0, move: [0, 1] }] });
    expect(last(r.snaps).player.pos).toEqual([0, 0, T.player_speed]);
  });
  it("rotates movement by cam_yaw_deg (yaw 90: forward -> +X)", () => {
    const r = run({ ticks: 60, frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] });
    const p = last(r.snaps).player.pos;
    expect(p[0]).toBeCloseTo(T.player_speed, 2);
    expect(p[2]).toBeCloseTo(0, 2);
  });
  it("x input at yaw 0 is +X", () => {
    const r = run({ ticks: 60, frames: [{ tick: 0, move: [1, 0] }] });
    expect(last(r.snaps).player.pos[0]).toBeCloseTo(T.player_speed, 2);
  });
  it("normalises move vectors longer than 1", () => {
    const r = run({ ticks: 60, frames: [{ tick: 0, move: [1, 1] }] });
    const [x, , z] = last(r.snaps).player.pos;
    expect(Math.hypot(x, z)).toBeCloseTo(T.player_speed, 2);
  });
  it("does not move before the frame tick, and keeps omitted fields", () => {
    const r = run({
      ticks: 120,
      every: 1,
      frames: [
        { tick: 60, move: [0, 1] },
        { tick: 90, jump: false },
      ],
    });
    expect(r.snaps[60]!.player.pos[2]).toBe(0);
    expect(r.snaps[120]!.player.pos[2]).toBeCloseTo(T.player_speed * 1, 2);
  });
  it("jump leaves the ground and lands again", () => {
    const r = run({
      ticks: 120,
      every: 1,
      frames: [
        { tick: 0, jump: true },
        { tick: 1, jump: false },
      ],
    });
    const ys = r.snaps.map((s) => s.player.pos[1] as number);
    expect(Math.max(...ys)).toBeGreaterThan(0.5);
    expect(last(ys)).toBe(0);
  });
  it("stays on the island (fall_enabled=false)", () => {
    const r = run({ ticks: 1200, frames: [{ tick: 0, move: [0, 1] }] });
    const [x, , z] = last(r.snaps).player.pos;
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(40.001);
    expect(r.events.find((e) => e.name === "player_hit" && e.data.by === "fall")).toBeUndefined();
  });
});

describe("motes", () => {
  it("picks up at distance <= pickup_radius (inclusive)", () => {
    const r = run({ ticks: 1, scenario: { motes: [[0, 0, T.pickup_radius]] } });
    expect(r.events).toEqual([
      { type: "event", tick: 1, name: "mote_picked", data: { carried: 1 } },
    ]);
    expect(last(r.snaps).motes_active).toBe(0);
    expect(last(r.snaps).score).toBe(T.score.per_mote);
  });
  it("does not pick up just outside pickup_radius", () => {
    const r = run({ ticks: 1, scenario: { motes: [[0, 0, T.pickup_radius + 0.01]] } });
    expect(r.events).toHaveLength(0);
    expect(last(r.snaps).motes_active).toBe(1);
  });
  it("respects carry_capacity", () => {
    const r = run({
      ticks: 5,
      scenario: {
        player: { carried: T.carry_capacity },
        motes: [[0, 0, 0.5]],
      },
    });
    expect(r.events).toHaveLength(0);
    expect(last(r.snaps).motes_active).toBe(1);
  });
});

describe("lanterns", () => {
  const atL1 = { pos: [0, 0, 25] as [number, number, number] };

  it("deposit + lantern_lit when lantern_cost is reached", () => {
    const r = run({
      ticks: 2,
      scenario: { player: { ...atL1, carried: T.lantern_cost } },
      frames: [{ tick: 0, interact: true }],
    });
    expect(r.events.map((e) => e.name)).toEqual(["deposit", "lantern_lit"]);
    expect(r.events[0]).toMatchObject({
      tick: 1,
      data: { lantern_id: "L1", amount: T.lantern_cost, deposited: T.lantern_cost },
    });
    expect(last(r.snaps).score).toBe(T.score.per_lantern);
    expect(last(r.snaps).lanterns[0]).toMatchObject({ id: "L1", lit: true });
  });
  it("partial deposit does not light", () => {
    const r = run({
      ticks: 2,
      scenario: { player: { ...atL1, carried: 2 } },
      frames: [{ tick: 0, interact: true }],
    });
    expect(r.events.map((e) => e.name)).toEqual(["deposit"]);
    expect(last(r.snaps).player.carried).toBe(0);
    expect(last(r.snaps).lanterns[0]).toMatchObject({ lit: false, deposited: 2 });
  });
  it("needs interact_radius and a rising edge", () => {
    const far = run({
      ticks: 2,
      scenario: { player: { pos: [0, 0, 25 - T.interact_radius - 0.1], carried: 4 } },
      frames: [{ tick: 0, interact: true }],
    });
    expect(far.events).toHaveLength(0);
    const held = run({
      ticks: 30,
      scenario: { player: { ...atL1, carried: 2 } },
      frames: [{ tick: 0, interact: true }],
    });
    expect(held.events.filter((e) => e.name === "deposit")).toHaveLength(1);
  });
  it("scenario lit:true gives no event and no score", () => {
    const r = run({ ticks: 5, scenario: { lanterns: [{ id: "L2", lit: true }] } });
    expect(r.events).toHaveLength(0);
    expect(last(r.snaps).score).toBe(0);
    expect(last(r.snaps).lanterns[1]).toMatchObject({ lit: true, deposited: T.lantern_cost });
  });
  it("lighting the last lantern wins with time + flame bonus", () => {
    const r = run({
      ticks: 10,
      scenario: {
        player: { ...atL1, carried: T.lantern_cost },
        lanterns: ["L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })),
        time_left_s: 100,
      },
      frames: [{ tick: 0, interact: true }],
    });
    expect(r.events.map((e) => e.name)).toEqual(["deposit", "lantern_lit", "game_over"]);
    expect(last(r.events).data).toEqual({ result: "won", reason: "all_lit" });
    const bonus =
      Math.floor(100 - 1 / 60) * T.score.per_second_left + T.flames * T.score.per_flame_left;
    expect(r.end).toEqual({
      type: "end",
      ticks: 1,
      state: "won",
      score: T.score.per_lantern + bonus,
    });
  });
});

describe("shades", () => {
  it("contact costs a flame, drops motes, then grants invulnerability", () => {
    const r = run({
      ticks: 200,
      every: 1,
      scenario: { player: { carried: 4 }, shades: [{ pos: [0, 1, 0] }] },
    });
    const hits = r.events.filter((e) => e.name === "player_hit");
    expect(hits[0]).toEqual({
      type: "event",
      tick: 1,
      name: "player_hit",
      data: { by: "shade", flames: T.flames - 1, dropped: Math.ceil(4 * T.hit_drop_ratio) },
    });
    // invuln_s = 2s -> next hit no earlier than tick 1 + 120
    expect(hits[1]!.tick).toBeGreaterThanOrEqual(1 + T.invuln_s * 60);
    expect(r.snaps[1]!.motes_active).toBe(Math.ceil(4 * T.hit_drop_ratio));
    expect(r.snaps[1]!.player.carried).toBe(4 - Math.ceil(4 * T.hit_drop_ratio));
  });
  it("losing the last flame ends the game early with no_flames", () => {
    const r = run({
      ticks: 1000,
      scenario: { player: { flames: 1 }, shades: [{ pos: [0, 1, 0] }] },
    });
    expect(last(r.events)).toEqual({
      type: "event",
      tick: 1,
      name: "game_over",
      data: { result: "lost", reason: "no_flames" },
    });
    expect(r.end).toEqual({ type: "end", ticks: 1, state: "lost", score: 0 });
  });
  it("dawn ends the game when time runs out", () => {
    const r = run({ ticks: 1000, scenario: { time_left_s: 1 } });
    expect(last(r.events).data).toEqual({ result: "lost", reason: "dawn" });
    expect(r.end.ticks).toBe(60);
  });
  it("chase the player at shade_speed", () => {
    const r = run({
      ticks: 60,
      scenario: { shades: [{ id: "S9", pos: [20, 1, 0] }], player: { flames: 9 } },
    });
    expect(last(r.snaps).shades[0]).toMatchObject({ id: "S9", state: "chase" });
    expect(last(r.snaps).shades[0].pos[0]).toBeCloseTo(20 - T.shade_speed, 2);
  });
  it("never enter safe_radius of a lit lantern", () => {
    const r = run({
      ticks: 900,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 25], flames: 99 },
        lanterns: [{ id: "L1", lit: true }],
        shades: [{ pos: [0, 1, -10] }, { pos: [10, 1, 25] }],
      },
    });
    for (const s of r.snaps)
      for (const sh of s.shades)
        expect(Math.hypot(sh.pos[0] - 0, sh.pos[2] - 25)).toBeGreaterThanOrEqual(
          T.safe_radius - 0.002,
        );
  });
  it("spawn one more shade every 30 s with a deterministic id", () => {
    const sc = {
      random_shades: true,
      shades: [{ id: "S1", pos: [0, 1, 38] as [number, number, number] }],
      player: { flames: 99 },
    };
    const r = run({ ticks: 1800, scenario: sc });
    const sp = r.events.filter((e) => e.name === "shade_spawned");
    expect(sp).toEqual([{ type: "event", tick: 1800, name: "shade_spawned", data: { id: "S2" } }]);
    expect(last(r.snaps).shades.map((s: Line) => s.id)).toEqual(["S1", "S2"]);
  });
});

describe("pulse", () => {
  const base: Scenario = {
    player: { carried: 3, flames: 9 },
    shades: [{ id: "S1", pos: [5, 1, 0] }],
  };
  it("stuns and pushes shades in range, costs pulse_cost, scores per_stun", () => {
    const r = run({ ticks: 2, scenario: base, frames: [{ tick: 0, pulse: true }] });
    expect(r.events[0]).toEqual({
      type: "event",
      tick: 1,
      name: "pulse",
      data: { stunned_ids: ["S1"] },
    });
    const s = last(r.snaps);
    expect(s.player.carried).toBe(3 - T.pulse_cost);
    expect(s.shades[0].state).toBe("stunned");
    expect(s.shades[0].pos[0]).toBeCloseTo(5 + T.pulse_push_m, 2);
    expect(s.score).toBe(T.score.per_stun);
  });
  it("stun lasts pulse_stun_s then the shade chases again", () => {
    const r = run({ ticks: 240, every: 1, scenario: base, frames: [{ tick: 0, pulse: true }] });
    expect(r.snaps[100]!.shades[0].state).toBe("stunned");
    expect(r.snaps[100]!.shades[0].pos[0]).toBeCloseTo(9, 2);
    expect(r.snaps[200]!.shades[0].state).toBe("chase");
  });
  it("ignores shades outside pulse_radius (empty stunned_ids)", () => {
    const r = run({
      ticks: 2,
      scenario: { ...base, shades: [{ id: "S1", pos: [T.pulse_radius + 1, 1, 0] }] },
      frames: [{ tick: 0, pulse: true }],
    });
    expect(r.events[0]!.data.stunned_ids).toEqual([]);
  });
  it("needs carried light, a rising edge and respects the cooldown", () => {
    const empty = run({
      ticks: 2,
      scenario: { ...base, player: { carried: 0 } },
      frames: [{ tick: 0, pulse: true }],
    });
    expect(empty.events).toHaveLength(0);
    const held = run({ ticks: 60, scenario: base, frames: [{ tick: 0, pulse: true }] });
    expect(held.events.filter((e) => e.name === "pulse")).toHaveLength(1);
    const early = run({
      ticks: 200,
      scenario: base,
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
        { tick: 60, pulse: true },
        { tick: 61, pulse: false },
        { tick: 301, pulse: true },
        { tick: 302, pulse: false },
      ],
    });
    expect(early.events.filter((e) => e.name === "pulse")).toHaveLength(1);
    const later = run({
      ticks: 400,
      scenario: base,
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
        { tick: 301, pulse: true },
        { tick: 302, pulse: false },
      ],
    });
    expect(later.events.filter((e) => e.name === "pulse")).toHaveLength(2);
  });
});

describe("tick model & output format", () => {
  it("snapshot 0 is after scenario setup and before inputs", () => {
    const r = run({
      ticks: 1,
      scenario: { player: { pos: [3, 0, 4] } },
      frames: [{ tick: 0, move: [0, 1] }],
    });
    expect(r.snaps[0]!.tick).toBe(0);
    expect(r.snaps[0]!.player.pos).toEqual([3, 0, 4]);
  });
  it("--ticks N runs exactly N steps; time_left_s = duration - steps/60", () => {
    const r = run({ ticks: 90 });
    expect(r.end).toEqual({ type: "end", ticks: 90, state: "playing", score: 0 });
    expect(last(r.snaps)).toMatchObject({ tick: 90, sim_tick: 90, time_left_s: 298.5 });
  });
  it("snapshot-every controls cadence and always ends on the final state", () => {
    const r = run({ ticks: 25, every: 10 });
    expect(r.snaps.map((s) => s.tick)).toEqual([0, 10, 20, 25]);
  });
  it("the end line is last and required", () => {
    const r = run({ ticks: 5 });
    expect(r.lines.filter((l) => l.type === "end")).toHaveLength(1);
    expect(r.end.type).toBe("end");
  });
  it("rounds coordinates to 3 decimals and exposes shade state 'stunned'", () => {
    const r = run({
      ticks: 300,
      scenario: {
        random_motes: true,
        random_shades: true,
        shades: undefined,
        motes: undefined,
      } as Scenario,
    });
    for (const s of r.snaps) {
      const nums = [
        ...s.player.pos,
        ...s.shades.flatMap((x: Line) => x.pos),
        ...s.motes.flatMap((m: Line) => m.pos),
      ];
      for (const n of nums) expect(Math.abs(n * 1000 - Math.round(n * 1000))).toBeLessThan(1e-6);
    }
  });
});

describe("determinism", () => {
  const sc: Scenario = {
    random_motes: true,
    random_shades: true,
    motes: undefined,
    shades: undefined,
  } as Scenario;
  const frames: InputFrame[] = [
    { tick: 0, move: [0.3, 1] },
    { tick: 200, move: [-1, 0.2], cam_yaw_deg: 45, pulse: true },
    { tick: 201, pulse: false },
  ];
  it("same seed + scenario + inputs = identical output", () => {
    const run1 = runHeadless({
      tuning: T,
      seed: 7,
      ticks: 3000,
      scenario: parseScenario({ ...sc }),
      inputs: frames,
    });
    const run2 = runHeadless({
      tuning: T,
      seed: 7,
      ticks: 3000,
      scenario: parseScenario({ ...sc }),
      inputs: frames,
    });
    expect(run1.join("\n")).toBe(run2.join("\n"));
  });
  it("different seeds give different worlds", () => {
    const a = runHeadless({ tuning: T, seed: 7, ticks: 10, scenario: parseScenario({ ...sc }) });
    const b = runHeadless({ tuning: T, seed: 8, ticks: 10, scenario: parseScenario({ ...sc }) });
    expect(a.join("\n")).not.toBe(b.join("\n"));
  });
});

describe("input validation", () => {
  it("rejects non-increasing ticks, bad move and non-boolean buttons", () => {
    expect(() => parseInputs({ frames: [{ tick: 5 }, { tick: 5 }] })).toThrow(InputError);
    expect(() => parseInputs({ frames: [{ tick: 5 }, { tick: 3 }] })).toThrow(InputError);
    expect(() => parseInputs({ frames: [{ tick: 0, move: [2, 0] }] })).toThrow(InputError);
    expect(() => parseInputs({ frames: [{ tick: 0, jump: "yes" }] })).toThrow(InputError);
    expect(() => parseInputs({})).toThrow(InputError);
  });
  it("rejects malformed scenarios", () => {
    expect(() => parseScenario([])).toThrow(InputError);
    expect(() => parseScenario({ motes: [[1, 2]] })).toThrow(InputError);
    expect(() => parseScenario({ player: { flames: -1 } })).toThrow(InputError);
    expect(() => parseScenario({ lanterns: [{ pos: [0, 0, 0] }] })).toThrow(InputError);
  });
});
