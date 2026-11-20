// Phase 1 behaviours re-checked against the TICKET-02 standard numbers (regression suite).
import { describe, expect, it } from "vitest";
import { InputError, parseInputs, parseScenario } from "../packages/sim/src/index.ts";
import { T, at, last, named, run } from "./helpers.ts";

describe("contract v1.2", () => {
  it("carries the standard numbers", () => {
    expect(T).toMatchObject({
      player_speed: 6,
      carry_capacity: 10,
      lantern_cost: 10,
      pickup_radius: 1,
      interact_radius: 2,
      pulse_cost: 3,
      pulse_radius: 5,
      pulse_cooldown_s: 3,
      pulse_stun_s: 2,
      pulse_push_m: 4,
      safe_radius: 6,
      shade_speed: 4,
      shade_hit_radius: 1,
      invuln_s: 1.5,
      flames: 3,
      dash_speed: 14,
      dash_duration_s: 0.2,
      dash_cooldown_s: 1.5,
      night1_duration_s: 240, // Ticket-03 [THAY THẾ]: 300/330/360 -> 240/270/300
      night2_duration_s: 270,
      night3_duration_s: 300,
      fall_enabled: true,
      fuel_max: 100,
      fuel_decay_per_s: 1,
      fuel_per_mote: 10,
      relight_cost: 5,
      win_ratio: 0.6,
      drain_per_s: 5,
      low_fuel_threshold: 30,
      capacity_max: 20,
      score: {
        per_mote: 5, // Ticket-03 [THAY THẾ]: 10 -> 5, time bonus 2 -> 0
        per_lantern: 100,
        per_stun: 5,
        per_second_left: 0,
        per_flame_left: 50,
      },
    });
  });
});

describe("movement", () => {
  it("runs at 6 m/s and stops at once", () => {
    const r = run({
      ticks: 90,
      every: 1,
      frames: [
        { tick: 0, move: [0, 1] },
        { tick: 60, move: [0, 0] },
      ],
    });
    expect(at(r.snaps, 60).player.pos).toEqual([0, 0, 6]);
    expect(at(r.snaps, 90).player.pos).toEqual([0, 0, 6]);
  });
  it("rotates movement by cam_yaw_deg and normalises long vectors", () => {
    const yaw = run({ ticks: 60, frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] });
    expect(last(yaw.snaps).player.pos[0]).toBeCloseTo(6, 2);
    const diag = run({ ticks: 60, frames: [{ tick: 0, move: [1, 1] }] });
    const [x, , z] = last(diag.snaps).player.pos;
    expect(Math.hypot(x, z)).toBeCloseTo(6, 2);
  });
  it("jumps at 7 m/s only from the ground", () => {
    const r = run({
      ticks: 120,
      every: 1,
      frames: [
        { tick: 0, jump: true },
        { tick: 1, jump: false },
        { tick: 10, jump: true }, // in the air: ignored
        { tick: 11, jump: false },
      ],
    });
    const ys = r.snaps.map((s) => s.player.pos[1] as number);
    expect(Math.max(...ys)).toBeGreaterThan(1.1);
    expect(Math.max(...ys)).toBeLessThan(1.3); // 7^2 / (2*20) = 1.225 m
    expect(last(ys)).toBe(0);
  });
  it("starts at the Night 1 spawn point facing +Z", () => {
    const r = run({ ticks: 0 });
    expect(r.snaps[0]!.player.pos).toEqual([0, 0, 0]);
    expect(r.snaps[0]!.player.grounded).toBe(true);
  });
});

describe("fireflies", () => {
  it("picks up at XZ <= 1.0 m and |dy| <= 1.5 m", () => {
    const inside = run({ ticks: 1, scenario: { motes: [[0, 0, 1]] } });
    expect(named(inside.events, "mote_picked")).toEqual([
      { type: "event", tick: 1, name: "mote_picked", data: { carried: 1 } },
    ]);
    const outside = run({ ticks: 1, scenario: { motes: [[0, 0, 1.01]] } });
    expect(outside.events.filter((e) => e.name === "mote_picked")).toHaveLength(0);
    const tooHigh = run({ ticks: 1, scenario: { motes: [[0, 1.6, 0.5]] } });
    expect(tooHigh.events.filter((e) => e.name === "mote_picked")).toHaveLength(0);
    const justLow = run({ ticks: 1, scenario: { motes: [[0, 1.5, 0.5]] } });
    expect(named(justLow.events, "mote_picked")).toHaveLength(1);
  });
  it("picking up gives no score (score comes from lighting)", () => {
    const r = run({ ticks: 1, scenario: { motes: [[0, 0, 0.5]] } });
    expect(last(r.snaps).score).toBe(0);
  });
  it("holds at most 10", () => {
    const r = run({ ticks: 3, scenario: { player: { carried: 10 }, motes: [[0, 0, 0.5]] } });
    expect(named(r.events, "mote_picked")).toHaveLength(0);
    expect(last(r.snaps).motes_active).toBe(1);
  });
  it("starts with 20 motes on 20 different Night 1 points", () => {
    const r = run({ ticks: 0, defaults: true });
    const motes = r.snaps[0]!.motes as Line2[];
    expect(motes).toHaveLength(20);
    expect(new Set(motes.map((m) => m.pos.join(","))).size).toBe(20);
    expect(motes.every((m) => m.kind === "random" && m.ttl_s === null)).toBe(true);
  });
  it("adds one at ticks 240, 480, ... until the points run out (24 on Night 1)", () => {
    const r = run({ ticks: 2500, defaults: true, every: 1 });
    expect(at(r.snaps, 239).motes_active).toBe(20);
    expect(at(r.snaps, 240).motes_active).toBe(21);
    expect(at(r.snaps, 479).motes_active).toBe(21);
    expect(at(r.snaps, 480).motes_active).toBe(22);
    expect(last(r.snaps).motes_active).toBe(24); // 8 + 16 points, the rest of the turns are skipped
  });
});
type Line2 = { pos: number[]; kind: string; ttl_s: number | null };

describe("lanterns", () => {
  const atL1 = [0, 0, 25] as [number, number, number];

  it("deposits min(carried, missing), remembers progress and scores 5 per firefly", () => {
    const r = run({
      ticks: 5,
      scenario: { player: { pos: atL1, carried: 4 } },
      frames: [
        { tick: 0, interact: true },
        { tick: 1, interact: false },
      ],
    });
    expect(named(r.events, "deposit")[0]).toMatchObject({
      tick: 1,
      data: { lantern_id: "L1", amount: 4, deposited: 4 },
    });
    expect(named(r.events, "lantern_lit")).toHaveLength(0);
    expect(last(r.snaps).score).toBe(4 * 5); // per_mote 5 (Ticket-03)
    expect(last(r.snaps).lanterns[0]).toMatchObject({ lit: false, deposited: 4 });
  });
  it("lights at 10 (+100) and only the missing amount is taken", () => {
    const r = run({
      ticks: 5,
      scenario: { player: { pos: atL1, carried: 10 }, lanterns: [{ id: "L1", deposited: 7 }] },
      frames: [{ tick: 0, interact: true }],
    });
    expect(named(r.events, "deposit")[0]!.data).toEqual({
      lantern_id: "L1",
      amount: 3,
      deposited: 10,
    });
    expect(named(r.events, "lantern_lit")).toHaveLength(1);
    expect(last(r.snaps).player.carried).toBe(7);
    expect(last(r.snaps).score).toBe(3 * 5 + 100); // per_mote 5 (Ticket-03)
  });
  it("needs a rising edge and interact_radius 2.0", () => {
    const far = run({
      ticks: 2,
      scenario: { player: { pos: [0, 0, 25 - 2.01], carried: 4 } },
      frames: [{ tick: 0, interact: true }],
    });
    expect(named(far.events, "deposit")).toHaveLength(0);
    const edge = run({
      ticks: 2,
      scenario: { player: { pos: [0, 0, 25 - 2], carried: 4 } },
      frames: [{ tick: 0, interact: true }],
    });
    expect(named(edge.events, "deposit")).toHaveLength(1);
    const held = run({
      ticks: 30,
      scenario: { player: { pos: atL1, carried: 5 } },
      frames: [{ tick: 0, interact: true }],
    });
    expect(named(held.events, "deposit")).toHaveLength(1);
  });
  it("picks the nearest receptive lantern and the smaller id on a tie; a lit lantern that has burnt a little accepts motes", () => {
    const tie = run({
      ticks: 2,
      scenario: {
        player: { pos: [0, 0, 0], carried: 2 },
        lanterns: [
          { id: "L1", pos: [0, 0, 1.5] },
          { id: "L2", pos: [0, 0, -1.5] },
        ],
      },
      frames: [{ tick: 0, interact: true }],
    });
    expect(named(tie.events, "deposit")[0]!.data.lantern_id).toBe("L1");
    const skip = run({
      ticks: 2,
      scenario: {
        player: { pos: [0, 0, 0], carried: 2 },
        lanterns: [
          { id: "L1", pos: [0, 0, 0.5], lit: true },
          { id: "L2", pos: [0, 0, 1.9] },
        ],
      },
      frames: [{ tick: 0, interact: true }],
    });
    // Ticket-03: lit lanterns accept motes. Fuel is burnt at step 2, before interaction at step 5,
    // so even a freshly placed full lantern is 1/60 short and is the nearest receptive one.
    expect(named(skip.events, "deposit")).toHaveLength(0);
    expect(named(skip.events, "refuel")[0]).toMatchObject({
      tick: 1,
      data: { lantern_id: "L1", amount: 1, fuel: 100 },
    });
  });
  it("scenario lit:true gives no event and no score", () => {
    const r = run({ ticks: 5, scenario: { lanterns: [{ id: "L2", lit: true }] } });
    expect(r.events.filter((e) => e.name !== "night_start")).toHaveLength(0);
    expect(last(r.snaps).score).toBe(0);
    expect(last(r.snaps).lanterns[1]).toMatchObject({ lit: true, deposited: 10 });
  });
  it("uses the standard Night 1 coordinates", () => {
    const r = run({ ticks: 0 });
    expect(r.snaps[0]!.lanterns.map((l: Line2 & { pos: number[] }) => l.pos)).toEqual([
      [0, 0, 25],
      [23.8, 0, 7.7],
      [14.7, 0, -20.2],
      [-14.7, 0, -20.2],
      [-23.8, 0, 7.7],
    ]);
  });
});

describe("win, lose and score", () => {
  const lastLit = (extra: object = {}) => ({
    player: { pos: [0, 0, 25] as [number, number, number], carried: 10 },
    lanterns: ["L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })),
    ...extra,
  });
  // Ticket-03 [THAY THẾ]: no early win (all_lit gone), no time bonus; win only at dawn.
  it("lighting the last lantern no longer ends the night", () => {
    const r = run({
      ticks: 10,
      scenario: lastLit({ time_left_s: 100 }),
      frames: [{ tick: 0, interact: true }],
    });
    expect(named(r.events, "lantern_lit")).toHaveLength(1);
    expect(named(r.events, "game_over")).toHaveLength(0);
    expect(r.end).toEqual({ type: "end", ticks: 10, state: "playing", score: 50 + 100 });
  });
  it("dawn win scores 50 + floor(fuel) per lit lantern and 50 per flame, no time bonus", () => {
    const r = run({
      ticks: 1000,
      scenario: {
        time_left_s: 1,
        lanterns: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })),
      },
    });
    expect(named(r.events, "game_over")[0]!.data).toEqual({
      result: "won",
      reason: "dawn_survived",
    });
    // 60 ticks of decay: fuel 100 - 1 = 99 exactly on every lantern
    expect(r.end).toEqual({ type: "end", ticks: 60, state: "won", score: 5 * (50 + 99) + 3 * 50 });
  });
  it("lighting the last lantern on the very last tick still counts at dawn", () => {
    const r = run({
      ticks: 10,
      scenario: lastLit({ time_left_s: 1 / 60 }),
      frames: [{ tick: 0, interact: true }],
    });
    expect(named(r.events, "game_over")[0]!.data).toEqual({
      result: "won",
      reason: "dawn_survived",
    });
    // 50 (10 motes) + 100 first light; dawn: L1 fuel 100, L2-L5 fuel 99.98 -> 99; + 3 flames
    expect(r.end.score).toBe(50 + 100 + (50 + 100) + 4 * (50 + 99) + 3 * 50);
  });
  it("no flames always loses, even with every lantern lit", () => {
    const r = run({
      ticks: 10,
      scenario: {
        player: { flames: 0 },
        lanterns: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })),
      },
    });
    expect(named(r.events, "game_over")[0]!.data).toEqual({ result: "lost", reason: "no_flames" });
  });
  it("dawn loses when time runs out", () => {
    const r = run({ ticks: 1000, scenario: { time_left_s: 1 } });
    expect(named(r.events, "game_over")[0]!.data).toEqual({ result: "lost", reason: "dawn" });
    expect(r.end.ticks).toBe(60);
  });
});

describe("shades", () => {
  it("chase at 4.0 m/s once within 12 m", () => {
    const r = run({ ticks: 60, scenario: { shades: [{ id: "S1", pos: [0, 0, 12] }] } });
    expect(last(r.snaps).shades[0]).toMatchObject({ id: "S1", state: "chase" });
    expect(last(r.snaps).shades[0].pos[2]).toBeCloseTo(12 - 4, 2);
  });
  it("only wander beyond 12 m and give up chasing beyond 18 m", () => {
    const far = run({ ticks: 2, scenario: { shades: [{ id: "S1", pos: [0, 0, 12.5] }] } });
    expect(last(far.snaps).shades[0].state).toBe("wander");
    const quits = run({
      ticks: 300,
      every: 1,
      scenario: { shades: [{ id: "S1", pos: [0, 0, 10], state: "chase" }] },
      frames: [{ tick: 0, move: [0, -1] }],
    });
    expect(at(quits.snaps, 10).shades[0].state).toBe("chase");
    expect(last(quits.snaps).shades[0].state).toBe("wander"); // Mây (6 m/s) outran it past 18 m
  });
  it("a hit: -1 flame, drops floor(carried / 2) on a 1.5-2.5 m ring, invulnerable 90 ticks", () => {
    const r = run({
      ticks: 200,
      every: 1,
      scenario: { player: { carried: 5 }, shades: [{ id: "S1", pos: [0, 0, 0] }] },
    });
    const hits = named(r.events, "player_hit");
    expect(hits[0]).toEqual({
      type: "event",
      tick: 1,
      name: "player_hit",
      data: { by: "shade", flames: 2, dropped: 2 },
    });
    const s1 = at(r.snaps, 1);
    expect(s1.player).toMatchObject({ carried: 3, flames: 2, invuln: 1.5 });
    const dropped = s1.motes as { pos: number[]; kind: string; ttl_s: number }[];
    expect(dropped).toHaveLength(2);
    for (const m of dropped) {
      expect(m.kind).toBe("dropped");
      expect(m.ttl_s).toBe(8);
      const d = Math.hypot(m.pos[0]! - s1.player.pos[0], m.pos[2]! - s1.player.pos[2]);
      expect(d).toBeGreaterThanOrEqual(1.5 - 0.002);
      expect(d).toBeLessThanOrEqual(2.5 + 0.002);
    }
    expect(hits[1]!.tick).toBeGreaterThanOrEqual(91);
  });
  it("recoils 2 m over 60 ticks after a hit and does nothing while Mây is invulnerable", () => {
    const r = run({
      ticks: 70,
      every: 1,
      scenario: { shades: [{ id: "S1", pos: [0, 0, 0.5] }], player: { flames: 9 } },
    });
    expect(at(r.snaps, 1).shades[0].state).toBe("recoil");
    // on the hit tick the shade first walks 4/60 m toward Mây, then recoils 2 m over 60 ticks
    expect(at(r.snaps, 61).shades[0].pos[2]).toBeCloseTo(0.5 - 4 / 60 + 2, 2);
    expect(named(r.events, "player_hit")).toHaveLength(1);
    const inv = run({
      ticks: 5,
      scenario: { shades: [{ pos: [0, 0, 0] }], player: { invuln_ticks: 50 } },
    });
    expect(named(inv.events, "player_hit")).toHaveLength(0);
    expect(last(inv.snaps).shades[0].state).not.toBe("recoil");
  });
  it("at most one flame per tick, even with two shades on top of Mây", () => {
    const r = run({
      ticks: 2,
      scenario: {
        shades: [
          { id: "S1", pos: [0, 0, 0] },
          { id: "S2", pos: [0, 0, 0.2] },
        ],
      },
    });
    expect(named(r.events, "player_hit")).toHaveLength(1);
    expect(last(r.snaps).player.flames).toBe(2);
  });
  it("touch needs |dy| <= 1.5", () => {
    const r = run({
      ticks: 2,
      scenario: { player: { pos: [0, 2, 0] }, shades: [{ pos: [0, 0, 0] }] },
    });
    expect(named(r.events, "player_hit")).toHaveLength(0);
  });
  it("dropped fireflies vanish after 480 ticks", () => {
    const r = run({
      ticks: 481,
      every: 1,
      scenario: { player: { carried: 2, flames: 9 }, shades: [{ pos: [0, 0, 0] }] },
    });
    expect(at(r.snaps, 480).motes_active).toBe(1);
    expect(at(r.snaps, 481).motes_active).toBe(0);
  });
  it("spawn 2 at tick 300 (S1, S2), then 1 every 480 ticks on Night 1, at >= 15 m", () => {
    const r = run({ ticks: 790, defaults: true, every: 1, scenario: { random_motes: false } });
    const spawns = named(r.events, "shade_spawned");
    expect(spawns.map((e) => [e.tick, e.data.id])).toEqual([
      [300, "S1"],
      [300, "S2"],
      [780, "S3"],
    ]);
    for (const s of at(r.snaps, 300).shades) {
      expect(s.state).toBe("spawning");
      expect(Math.hypot(s.pos[0], s.pos[2])).toBeGreaterThanOrEqual(15);
      expect(Math.hypot(s.pos[0], s.pos[2])).toBeCloseTo(37, 0);
    }
  });
  it("never exceed 6 on Night 1", () => {
    const r = run({
      ticks: 6000,
      defaults: true,
      every: 600,
      scenario: { random_motes: false, player: { flames: 99, pos: [0, 0, 0] } },
    });
    expect(Math.max(...r.snaps.map((s) => s.shades.length))).toBeLessThanOrEqual(6);
  });
});

describe("safe zones", () => {
  it("block shades at the 6 m edge", () => {
    const r = run({
      ticks: 600,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 25], flames: 99 },
        lanterns: [{ id: "L1", lit: true }],
        shades: [{ pos: [0, 0, -10] }, { pos: [10, 0, 25] }],
      },
    });
    for (const s of r.snaps)
      for (const sh of s.shades)
        expect(Math.hypot(sh.pos[0], sh.pos[2] - 25)).toBeGreaterThanOrEqual(6 - 0.002);
  });
  it("push out a shade caught inside a lantern that was just lit, within 30 ticks and harmlessly", () => {
    const r = run({
      ticks: 300,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 23], flames: 3 },
        lanterns: [{ id: "L1", lit: true }],
        shades: [{ id: "S1", pos: [0, 0, 24] }],
      },
    });
    const inside = (s: Line) => Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2] - 25) < 6 - 0.002;
    const firstOutside = r.snaps.findIndex((s) => !inside(s));
    expect(firstOutside).toBeGreaterThan(0);
    expect(firstOutside).toBeLessThanOrEqual(30);
    expect(named(r.events, "player_hit")).toHaveLength(0);
  });
});

describe("pulse (Tỏa Sáng)", () => {
  const base = {
    player: { carried: 6, flames: 9 },
    shades: [{ id: "S1", pos: [4.9, 0, 0] as [number, number, number] }],
  };
  it("costs 3, stuns 120 ticks, pushes 4 m in 15 ticks and scores 5 per shade", () => {
    const r = run({ ticks: 130, every: 1, scenario: base, frames: [{ tick: 0, pulse: true }] });
    expect(named(r.events, "pulse")[0]).toEqual({
      type: "event",
      tick: 1,
      name: "pulse",
      data: { stunned_ids: ["S1"] },
    });
    expect(at(r.snaps, 1).player.carried).toBe(3);
    expect(at(r.snaps, 1).score).toBe(5);
    expect(at(r.snaps, 1).shades[0].state).toBe("stunned");
    expect(at(r.snaps, 15).shades[0].pos[0]).toBeCloseTo(4.9 + 4, 2);
    expect(at(r.snaps, 30).shades[0].pos[0]).toBeCloseTo(4.9 + 4, 2); // no more push after 15 ticks
    expect(at(r.snaps, 120).shades[0].state).toBe("stunned");
    expect(at(r.snaps, 121).shades[0].state).toBe("chase");
  });
  it("targets by 3D distance <= 5 m from the point 0.8 m above Mây's feet", () => {
    const out = run({
      ticks: 2,
      scenario: { ...base, shades: [{ id: "S1", pos: [5.1, 0, 0] }] },
      frames: [{ tick: 0, pulse: true }],
    });
    expect(named(out.events, "pulse")[0]!.data.stunned_ids).toEqual([]);
    const high = run({
      ticks: 2,
      scenario: {
        ...base,
        player: { carried: 6, pos: [0, 6, 0] },
        shades: [{ id: "S1", pos: [3, 0, 0] }],
      },
      frames: [{ tick: 0, pulse: true }],
    });
    expect(named(high.events, "pulse")[0]!.data.stunned_ids).toEqual([]); // 3D: too far below
  });
  it("needs 3 fireflies and the cooldown of 3 s (180 ticks)", () => {
    const poor = run({
      ticks: 2,
      scenario: { ...base, player: { carried: 2 } },
      frames: [{ tick: 0, pulse: true }],
    });
    expect(named(poor.events, "pulse")).toHaveLength(0);
    const frames = [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false },
      { tick: 179, pulse: true },
      { tick: 180, pulse: false }, // step 180: still cooling
      { tick: 180 + 1, pulse: true },
    ];
    const r = run({ ticks: 200, scenario: base, frames });
    expect(named(r.events, "pulse").map((e) => e.tick)).toEqual([1, 182]);
  });
  it("re-stuns (and scores again) a shade that is already stunned; overlap pushes +X", () => {
    const r = run({
      ticks: 200,
      every: 1,
      scenario: { player: { carried: 9, flames: 9 }, shades: [{ id: "S1", pos: [0, 0, 0] }] },
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
        { tick: 181, pulse: true },
        { tick: 182, pulse: false },
      ],
    });
    expect(at(r.snaps, 15).shades[0].pos[0]).toBeCloseTo(4, 2);
    expect(last(r.snaps).score).toBe(10);
  });
});

describe("falling off the island", () => {
  const walkOff = { player: { pos: [39.9, 0, 0] as [number, number, number], carried: 4 } };
  it("costs 1 flame once, drops everything, waits 60 ticks, respawns invulnerable", () => {
    const r = run({
      ticks: 140,
      every: 1,
      scenario: walkOff,
      frames: [
        { tick: 0, move: [1, 0] },
        { tick: 5, move: [0, 0] },
      ],
    });
    const falls = named(r.events, "player_hit").filter((e) => e.data.by === "fall");
    expect(falls).toHaveLength(1);
    expect(falls[0]!.data).toEqual({ by: "fall", flames: 2, dropped: 0, lost: 4 });
    const t = falls[0]!.tick;
    expect(at(r.snaps, t).player.pos[1]).toBeLessThan(-10);
    expect(at(r.snaps, t + 59).player.pos[1]).toBeLessThan(-10); // still waiting
    const back = at(r.snaps, t + 60).player;
    expect(back.pos).toEqual([0, 0, 0]);
    expect(back.vel).toEqual([0, 0, 0]);
    expect(back.carried).toBe(0);
    expect(back.invuln).toBe(1.5);
  });
  it("ignores invulnerability", () => {
    const r = run({
      ticks: 90,
      scenario: { player: { ...walkOff.player, invuln_ticks: 1000 } },
      frames: [{ tick: 0, move: [1, 0] }],
    });
    expect(named(r.events, "player_hit").some((e) => e.data.by === "fall")).toBe(true);
  });
  it("the last flame ends the game at once, with no respawn", () => {
    const r = run({
      ticks: 300,
      scenario: { player: { ...walkOff.player, flames: 1 } },
      frames: [{ tick: 0, move: [1, 0] }],
    });
    expect(named(r.events, "game_over")[0]!.data).toEqual({ result: "lost", reason: "no_flames" });
    expect(r.end.ticks).toBeLessThan(80);
  });
});

describe("tick model & output format", () => {
  it("snapshot 0 is after scenario setup, before inputs; night_start follows it", () => {
    const r = run({
      ticks: 1,
      scenario: { player: { pos: [3, 0, 4] } },
      frames: [{ tick: 0, move: [0, 1] }],
    });
    expect(r.lines[0]!.type).toBe("snapshot");
    expect(r.snaps[0]!.tick).toBe(0);
    expect(r.snaps[0]!.player.pos).toEqual([3, 0, 4]);
    expect(r.lines[1]).toEqual({ type: "event", tick: 0, name: "night_start", data: { night: 1 } });
  });
  it("--ticks N runs exactly N ticks; time_left_s = duration - sim_tick / 60", () => {
    const r = run({ ticks: 90 });
    expect(r.end).toEqual({ type: "end", ticks: 90, state: "playing", score: 0 });
    expect(last(r.snaps)).toMatchObject({
      tick: 90,
      sim_tick: 90,
      time_left_s: 238.5,
      night: 1,
      state: "playing",
    });
  });
  it("snapshots every N ticks and always the final state; the end line is last", () => {
    const r = run({ ticks: 25, every: 10 });
    expect(r.snaps.map((s) => s.tick)).toEqual([0, 10, 20, 25]);
    expect(r.lines.filter((l) => l.type === "end")).toHaveLength(1);
    expect(r.end.type).toBe("end");
  });
  it("v1.1 snapshot fields are all present", () => {
    const s = run({ ticks: 0, night: 2, defaults: true }).snaps[0]!;
    expect(s).toMatchObject({ night: 2, wind: { active: false, dir_deg: 0 } });
    expect(Object.keys(s.player).sort()).toEqual(
      [
        "capacity",
        "carried",
        "charm_s",
        "dash_cd_s",
        "flames",
        "grounded",
        "invuln",
        "pos",
        "pulse_cd_s",
        "vel",
      ].sort(),
    );
    expect(Array.isArray(s.motes) && Array.isArray(s.drifters) && Array.isArray(s.charms)).toBe(
      true,
    );
    expect(s.charms).toEqual([{ id: "C1", available: true, respawn_s: 0 }]);
  });
  it("rounds coordinates to 3 decimals", () => {
    const r = run({ ticks: 400, defaults: true, every: 50 });
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
  const frames = [
    { tick: 0, move: [0.3, 1] as [number, number] },
    { tick: 200, move: [-1, 0.2] as [number, number], cam_yaw_deg: 45, pulse: true, dash: true },
    { tick: 201, pulse: false, dash: false },
  ];
  for (const night of [1, 2, 3]) {
    it(`same seed + scenario + inputs = identical output (night ${night})`, () => {
      const a = run({ ticks: 4000, night, defaults: true, frames });
      const b = run({ ticks: 4000, night, defaults: true, frames });
      expect(JSON.stringify(a.lines)).toBe(JSON.stringify(b.lines));
    });
  }
  it("different seeds give different worlds", () => {
    const a = run({ ticks: 10, defaults: true, seed: 7 });
    const b = run({ ticks: 10, defaults: true, seed: 8 });
    expect(JSON.stringify(a.lines)).not.toBe(JSON.stringify(b.lines));
  });
});

describe("input validation", () => {
  it("rejects non-increasing ticks, bad move and non-boolean buttons (incl. dash, pause)", () => {
    expect(() => parseInputs({ frames: [{ tick: 5 }, { tick: 5 }] })).toThrow(InputError);
    expect(() => parseInputs({ frames: [{ tick: 5 }, { tick: 3 }] })).toThrow(InputError);
    expect(() => parseInputs({ frames: [{ tick: 0, move: [2, 0] }] })).toThrow(InputError);
    expect(() => parseInputs({ frames: [{ tick: 0, jump: "yes" }] })).toThrow(InputError);
    expect(() => parseInputs({ frames: [{ tick: 0, dash: 1 }] })).toThrow(InputError);
    expect(() => parseInputs({ frames: [{ tick: 0, pause: "x" }] })).toThrow(InputError);
    expect(parseInputs({ frames: [{ tick: 0, dash: true, pause: false }] })).toEqual([
      { tick: 0, dash: true, pause: false },
    ]);
    expect(() => parseInputs({})).toThrow(InputError);
  });
  it("rejects malformed scenarios, including the v1.1 fields", () => {
    expect(() => parseScenario([])).toThrow(InputError);
    expect(() => parseScenario({ motes: [[1, 2]] })).toThrow(InputError);
    expect(() => parseScenario({ player: { flames: -1 } })).toThrow(InputError);
    expect(() => parseScenario({ player: { dash_cd_ticks: 1.5 } })).toThrow(InputError);
    expect(() => parseScenario({ shades: [{ state: "angry" }] })).toThrow(InputError);
    expect(() => parseScenario({ shades: [{ state: "stunned", state_ticks_left: -3 }] })).toThrow(
      InputError,
    );
    expect(() => parseScenario({ drifters: "no" })).toThrow(InputError);
    expect(() => parseScenario({ drifters: [{ state: "lost" }] })).toThrow(InputError);
    expect(() => parseScenario({ charms: [{ available: "yes" }] })).toThrow(InputError);
    expect(() => parseScenario({ wind_enabled: 1 })).toThrow(InputError);
    expect(() => parseScenario({ lanterns: [{ pos: [0, 0, 0] }] })).toThrow(InputError);
    expect(
      parseScenario({
        player: { invuln_ticks: 5, dash_cd_ticks: 6, pulse_cd_ticks: 7, charm_ticks: 8 },
        shades: [{ state: "recoil", state_ticks_left: 9 }],
        drifters: [{ state: "flee", stolen: 3 }],
        charms: [{ id: "C1", available: false, respawn_ticks: 10 }],
        random_drifters: false,
        wind_enabled: true,
      }),
    ).toMatchObject({ random_drifters: false, wind_enabled: true });
  });
});
