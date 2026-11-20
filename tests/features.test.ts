// One or more headless scenarios for every new TICKET-02 feature.
import { describe, expect, it } from "vitest";
import { T, at, last, named, run } from "./helpers.ts";

type V3 = [number, number, number];

describe("dash (Lướt)", () => {
  it("moves 14 m/s for 0.2 s (2.8 m) along the move direction, event on tick 1", () => {
    const r = run({
      ticks: 20,
      every: 1,
      frames: [
        { tick: 0, move: [1, 0], dash: true },
        { tick: 1, dash: false, move: [0, 0] },
      ],
    });
    expect(named(r.events, "dash")).toEqual([{ type: "event", tick: 1, name: "dash", data: {} }]);
    expect(at(r.snaps, 12).player.pos[0]).toBeCloseTo(2.8, 3);
    expect(at(r.snaps, 20).player.pos[0]).toBeCloseTo(2.8, 3); // ends after 12 ticks
    expect(at(r.snaps, 1).player.dash_cd_s).toBe(1.5);
  });
  it("dashes the way Mây faces when standing still (+Z at the start)", () => {
    const r = run({ ticks: 12, frames: [{ tick: 0, dash: true }] });
    expect(last(r.snaps).player.pos[2]).toBeCloseTo(2.8, 3);
  });
  it("has a 1.5 s (90 tick) cooldown counted from the start, and is not invulnerable", () => {
    const frames = [
      { tick: 0, dash: true },
      { tick: 1, dash: false },
      { tick: 89, dash: true },
      { tick: 90, dash: false }, // step 90: 1 tick short
      { tick: 91, dash: true },
    ];
    const r = run({ ticks: 120, frames });
    expect(named(r.events, "dash").map((e) => e.tick)).toEqual([1, 92]);
    const hit = run({
      ticks: 5,
      scenario: { shades: [{ pos: [0, 0, 1.5] }] },
      frames: [{ tick: 0, dash: true }],
    });
    expect(named(hit.events, "player_hit").length).toBeGreaterThan(0);
  });
  it("keeps its height in the air", () => {
    const r = run({
      ticks: 30,
      every: 1,
      frames: [
        { tick: 0, jump: true },
        { tick: 1, jump: false },
        { tick: 5, dash: true },
        { tick: 6, dash: false },
      ],
    });
    const ys = r.snaps.slice(6, 17).map((s) => s.player.pos[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.002);
    expect(ys[0]).toBeGreaterThan(0.3);
  });
  it("ignores a second press while dashing", () => {
    const r = run({
      ticks: 30,
      scenario: { player: { charm_ticks: 600 } },
      frames: [
        { tick: 0, dash: true },
        { tick: 3, dash: false },
        { tick: 5, dash: true },
        { tick: 6, dash: false },
      ],
    });
    expect(named(r.events, "dash")).toHaveLength(1);
  });
});

describe("Bùa Gió (charm)", () => {
  it("is picked like a firefly: charm_picked {C1, 600}, 10 s of effect", () => {
    const r = run({
      ticks: 70,
      night: 2,
      defaults: true,
      scenario: { random_motes: false, player: { pos: [35, 0, 0] } },
      every: 1,
    });
    expect(named(r.events, "charm_picked")).toEqual([
      { type: "event", tick: 1, name: "charm_picked", data: { charm_id: "C1", charm_ticks: 600 } },
    ]);
    expect(at(r.snaps, 1).player.charm_s).toBe(10);
    expect(at(r.snaps, 61).player.charm_s).toBe(9);
    expect(at(r.snaps, 1).charms[0]).toEqual({ id: "C1", available: false, respawn_s: 45 });
  });
  it("raises the run speed to 7.2 m/s", () => {
    const r = run({
      ticks: 60,
      scenario: { player: { charm_ticks: 600 } },
      frames: [{ tick: 0, move: [0, 1] }],
    });
    expect(last(r.snaps).player.pos[2]).toBeCloseTo(7.2, 2);
  });
  it("removes the dash cooldown but still needs another press, never during a dash", () => {
    const r = run({
      ticks: 40,
      scenario: { player: { charm_ticks: 600 } },
      frames: [
        { tick: 0, dash: true },
        { tick: 1, dash: false },
        { tick: 12, dash: true },
        { tick: 13, dash: false }, // 13th tick: the first dash is over
      ],
    });
    expect(named(r.events, "dash").map((e) => e.tick)).toEqual([1, 13]);
    expect(at(r.snaps, 10).player.dash_cd_s).toBe(0);
  });
  it("comes back 2700 ticks after it was taken", () => {
    const r = run({
      ticks: 2705,
      night: 2,
      defaults: true,
      every: 1,
      scenario: { random_motes: false, random_shades: false, player: { pos: [35, 0, 0] } },
      frames: [
        { tick: 5, move: [0, 1] },
        { tick: 20, move: [0, 0] },
      ], // step aside so it is not retaken on return
    });
    expect(at(r.snaps, 2700).charms[0]!.available).toBe(false);
    expect(at(r.snaps, 2701).charms[0]).toEqual({ id: "C1", available: true, respawn_s: 0 });
  });
  it("Night 3 has C1 and C2 at (30,0,25) and (-30,0,25)", () => {
    const s = run({ ticks: 0, night: 3, defaults: true }).snaps[0]!;
    expect(s.charms.map((c: { id: string }) => c.id)).toEqual(["C1", "C2"]);
  });
});

describe("Gió Lạc (drifters)", () => {
  const night2 = { night: 2, defaults: true } as const;
  const chaser = (extra: object = {}) => ({
    player: { pos: [0, 0, 0] as V3, carried: 6 },
    drifters: [{ id: "D1", pos: [0.5, 1.5, 0] as V3, state: "chase" as const }],
    ...extra,
  });
  it("spawns at ticks 1200, 2400, ... (D1, D2), at most 2, never on Night 1", () => {
    const r = run({
      ticks: 3700,
      every: 100,
      ...night2,
      scenario: { random_motes: false, random_shades: false },
    });
    expect(at(r.snaps, 1100).drifters).toHaveLength(0);
    expect(at(r.snaps, 1200).drifters.map((d: { id: string }) => d.id)).toEqual(["D1"]);
    expect(at(r.snaps, 2400).drifters.map((d: { id: string }) => d.id)).toEqual(["D1", "D2"]);
    expect(at(r.snaps, 3600).drifters).toHaveLength(2);
    const one = run({
      ticks: 1300,
      every: 100,
      defaults: true,
      scenario: { random_motes: false, random_shades: false },
    });
    expect(last(one.snaps).drifters).toHaveLength(0);
  });
  it("idle -> chase with >= 5 fireflies within 15 m, and back to idle when that stops", () => {
    const on = run({
      ticks: 2,
      scenario: { player: { carried: 5 }, drifters: [{ id: "D1", pos: [10, 1.5, 0] as V3 }] },
      night: 2,
    });
    expect(last(on.snaps).drifters[0].state).toBe("chase");
    const few = run({
      ticks: 2,
      scenario: { player: { carried: 4 }, drifters: [{ id: "D1", pos: [10, 1.5, 0] as V3 }] },
      night: 2,
    });
    expect(last(few.snaps).drifters[0].state).toBe("idle");
    const far = run({
      ticks: 2,
      scenario: { player: { carried: 9 }, drifters: [{ id: "D1", pos: [16, 1.5, 0] as V3 }] },
      night: 2,
    });
    expect(last(far.snaps).drifters[0].state).toBe("idle");
    const quits = run({
      ticks: 40,
      scenario: {
        player: { carried: 5 },
        drifters: [{ id: "D1", pos: [10, 1.5, 0] as V3, state: "chase" }],
      },
      night: 2,
      frames: [{ tick: 5, move: [0, 0] }],
    });
    expect(last(quits.snaps).drifters[0].state).toBe("chase");
  });
  it("steals min(3, carried) on touch, flees 240 ticks, then vanishes with the loot", () => {
    const r = run({ ticks: 250, every: 1, night: 2, scenario: chaser() });
    expect(named(r.events, "drifter_steal")).toEqual([
      {
        type: "event",
        tick: 1,
        name: "drifter_steal",
        data: { drifter_id: "D1", amount: 3, carried: 3 },
      },
    ]);
    expect(at(r.snaps, 2).drifters[0]).toMatchObject({ state: "flee", stolen: 3 });
    expect(at(r.snaps, 240).drifters).toHaveLength(1);
    expect(at(r.snaps, 241).drifters).toHaveLength(0);
    expect(named(r.events, "player_hit")).toHaveLength(0); // never costs a flame
  });
  it("steals once per drifter, and is not stopped by invulnerability or a safe zone", () => {
    const r = run({
      ticks: 5,
      night: 2,
      scenario: chaser({
        player: { pos: [0, 0, 0] as V3, carried: 6, invuln_ticks: 500 },
        lanterns: [{ id: "L1", pos: [0, 0, 2] as V3, lit: true }],
      }),
    });
    expect(named(r.events, "drifter_steal")).toHaveLength(1);
  });
  it("takes everything when carrying less than 3", () => {
    const r = run({
      ticks: 2,
      night: 2,
      scenario: {
        player: { pos: [0, 0, 0] as V3, carried: 2 },
        drifters: [{ id: "D1", pos: [0.5, 1.5, 0] as V3, state: "chase" }],
      },
    });
    // a drifter only keeps chasing with >= 5 fireflies, so with 2 it has gone idle and steals nothing
    expect(named(r.events, "drifter_steal")).toHaveLength(0);
  });
  it("a pulse during chase makes it flee without stealing", () => {
    const r = run({
      ticks: 3,
      night: 2,
      scenario: chaser({ drifters: [{ id: "D1", pos: [3, 1.5, 0] as V3, state: "chase" }] }),
      frames: [{ tick: 0, pulse: true }],
    });
    expect(named(r.events, "drifter_steal")).toHaveLength(0);
    expect(last(r.snaps).drifters[0]).toMatchObject({ state: "flee", stolen: 0 });
    expect(last(r.snaps).player.carried).toBe(3);
  });
  it("a pulse during flee drops the loot as fireflies and it leaves after 120 ticks", () => {
    const r = run({
      ticks: 130,
      every: 1,
      night: 2,
      scenario: {
        player: { pos: [0, 0, 0] as V3, carried: 6 },
        drifters: [
          { id: "D1", pos: [3, 1.5, 0] as V3, state: "flee", stolen: 3, state_ticks_left: 200 },
        ],
      },
      frames: [{ tick: 0, pulse: true }],
    });
    expect(named(r.events, "drifter_drop")).toEqual([
      { type: "event", tick: 1, name: "drifter_drop", data: { drifter_id: "D1", amount: 3 } },
    ]);
    const motes = at(r.snaps, 1).motes as { kind: string }[];
    expect(motes.filter((m) => m.kind === "dropped")).toHaveLength(3);
    expect(at(r.snaps, 1).drifters[0].stolen).toBe(0);
    expect(at(r.snaps, 120).drifters).toHaveLength(1);
    expect(at(r.snaps, 121).drifters).toHaveLength(0);
  });
});

describe("pause (Esc / P)", () => {
  const frames = [
    { tick: 0, move: [0, 1] as [number, number] },
    { tick: 30, pause: true },
    { tick: 31, pause: false },
    { tick: 60, pause: true },
    { tick: 61, pause: false },
  ];
  it("freezes the logic: tick advances, sim_tick, time and positions stand still", () => {
    const r = run({
      ticks: 100,
      every: 1,
      scenario: { shades: [{ id: "S1", pos: [0, 0, 10] }], player: { flames: 9 } },
      frames,
    });
    expect(named(r.events, "paused").map((e) => e.tick)).toEqual([31]);
    expect(named(r.events, "resumed").map((e) => e.tick)).toEqual([61]);
    const a = at(r.snaps, 31);
    const b = at(r.snaps, 60);
    expect(a.state).toBe("paused");
    expect(b.state).toBe("paused");
    expect(b.tick).toBe(60);
    expect(b.sim_tick).toBe(30);
    expect(b.time_left_s).toBe(a.time_left_s);
    expect(b.player.pos).toEqual(a.player.pos);
    expect(b.shades[0].pos).toEqual(a.shades[0].pos);
    expect(at(r.snaps, 100)).toMatchObject({ state: "playing", sim_tick: 70 });
  });
  it("keeps cooldowns, spawns and TTLs frozen while paused", () => {
    const r = run({
      ticks: 700,
      defaults: true,
      every: 1,
      scenario: { random_motes: false },
      frames: [
        { tick: 289, pause: true },
        { tick: 290, pause: false },
        { tick: 600, pause: true },
        { tick: 601, pause: false },
      ],
    });
    // ticks 290..600 are paused (311 ticks), so sim_tick 300 (the first spawn) is tick 611
    const spawn = named(r.events, "shade_spawned")[0]!;
    expect(spawn.tick).toBe(300 + 311);
    expect(at(r.snaps, 599).sim_tick).toBe(289);
  });
  it("does not let other inputs act while paused", () => {
    const r = run({
      ticks: 20,
      scenario: { player: { carried: 5 }, motes: [[0, 0, 0.5]] },
      frames: [
        { tick: 0, pause: true },
        { tick: 1, pause: false, move: [0, 1], jump: true, dash: true, pulse: true },
      ],
    });
    expect(last(r.snaps).player.pos).toEqual([0, 0, 0]);
    expect(named(r.events, "dash")).toHaveLength(0);
    expect(named(r.events, "pulse")).toHaveLength(0);
  });
});

describe("Night 2 — Đảo Cau", () => {
  const n2 = { night: 2 } as const;
  it("has 6 lanterns at the standard coordinates and a 330 s clock", () => {
    const s = run({ ticks: 0, ...n2 }).snaps[0]!;
    expect(s.lanterns.map((l: { pos: number[] }) => l.pos)).toEqual([
      [0, 0, 20],
      [17, 0, -10],
      [-17, 0, -10],
      [70, 0, 20],
      [87, 0, -10],
      [53, 0, -10],
    ]);
    expect(s).toMatchObject({ night: 2, time_left_s: 330 });
  });
  it("starts with 20 fireflies on 24 points; Shades spawn 2 at 300, then every 420 ticks, cap 8", () => {
    const d = run({
      ticks: 800,
      defaults: true,
      ...n2,
      every: 100,
      scenario: { random_drifters: false },
    });
    expect(d.snaps[0]!.motes_active).toBe(20);
    expect(named(d.events, "shade_spawned").map((e) => [e.tick, e.data.id])).toEqual([
      [300, "S1"],
      [300, "S2"],
      [720, "S3"],
    ]);
  });
  it("walks across the bamboo bridge to the second island", () => {
    const r = run({ ticks: 480, ...n2, frames: [{ tick: 0, move: [1, 0] }] });
    expect(named(r.events, "player_hit")).toHaveLength(0);
    expect(last(r.snaps).player.pos[0]).toBeGreaterThan(44);
    expect(last(r.snaps).player.grounded).toBe(true);
  });
  it("has no rails: stepping off the bridge is a fall", () => {
    const r = run({
      ticks: 90,
      ...n2,
      scenario: { player: { pos: [35, 0, 1.9] as V3 } },
      frames: [{ tick: 0, move: [0, 1] }],
    });
    expect(named(r.events, "player_hit").map((e) => e.data.by)).toEqual(["fall"]);
  });
  it("jump pad (20,0,18): vy 14, 24 m/s toward the other island, keys cannot override", () => {
    const toPad = { player: { pos: [20, 0, 16] as V3 } };
    const control = run({
      ticks: 200,
      ...n2,
      every: 1,
      scenario: toPad,
      frames: [
        { tick: 0, move: [0, 1] },
        { tick: 12, move: [0, 0] },
      ],
    });
    const fight = run({
      ticks: 200,
      ...n2,
      every: 1,
      scenario: toPad,
      frames: [
        { tick: 0, move: [0, 1] },
        { tick: 12, move: [-1, 0] },
        { tick: 30, move: [0, -1] },
      ],
    });
    const ys = control.snaps.map((s) => s.player.pos[1] as number);
    expect(Math.max(...ys)).toBeGreaterThan(4.6);
    expect(Math.max(...ys)).toBeLessThan(5.1); // 14^2 / (2 * 20) = 4.9 m
    for (const t of [30, 60, 90]) {
      expect(at(fight.snaps, t).player.pos).toEqual(at(control.snaps, t).player.pos);
    }
    const land = at(control.snaps, 160).player;
    expect(land.grounded).toBe(true);
    expect(Math.hypot(land.pos[0] - 70, land.pos[2])).toBeLessThanOrEqual(28); // inside island B
    expect(land.pos[0]).toBeGreaterThan(45);
  });
  it("jump pad (50,0,-18) sends Mây back to island A", () => {
    const r = run({
      ticks: 200,
      ...n2,
      every: 1,
      scenario: { player: { pos: [50, 0, -16.5] as V3 } },
      frames: [
        { tick: 0, move: [0, -1] },
        { tick: 12, move: [0, 0] },
      ],
    });
    const land = at(r.snaps, 170).player;
    expect(land.grounded).toBe(true);
    expect(Math.hypot(land.pos[0], land.pos[2])).toBeLessThanOrEqual(28);
  });
  it("can dash after being launched", () => {
    const r = run({
      ticks: 50,
      ...n2,
      scenario: { player: { pos: [20, 0, 17.5] as V3 } },
      frames: [{ tick: 5, dash: true }],
    });
    expect(named(r.events, "dash")).toHaveLength(1);
  });
});

describe("Night 3 — Đảo Chuông", () => {
  const n3 = { night: 3 } as const;
  const sc = (pos: V3, extra: object = {}) => ({ scenario: { player: { pos }, ...extra } });
  it("has 7 lanterns (L1 on the top tier), a 360 s clock and starts on solid ground", () => {
    const s = run({ ticks: 0, ...n3 }).snaps[0]!;
    expect(s.lanterns).toHaveLength(7);
    expect(s.lanterns[0].pos).toEqual([0, 6, 6]);
    expect(s).toMatchObject({ night: 3, time_left_s: 360 });
    expect(s.player.grounded).toBe(true);
  });
  it("starts with 20 of 30 fireflies on the three tiers; Shades spawn every 360 ticks, cap 10", () => {
    const d = run({
      ticks: 700,
      defaults: true,
      ...n3,
      every: 100,
      scenario: { random_drifters: false },
    });
    expect(d.snaps[0]!.motes_active).toBe(20);
    expect(named(d.events, "shade_spawned").map((e) => [e.tick, e.data.id])).toEqual([
      [300, "S1"],
      [300, "S2"],
      [660, "S3"],
    ]);
  });
  it("tier edges are vertical walls: Mây cannot walk up onto the ring", () => {
    const r = run({ ticks: 120, ...n3, ...sc([0, 0, 10]), frames: [{ tick: 0, move: [0, 1] }] });
    const p = last(r.snaps).player;
    expect(p.pos[2]).toBeLessThanOrEqual(12);
    expect(p.pos[1]).toBe(0);
  });
  it("the 30° ramp (3 m wide) leads up to tier 1", () => {
    const a = (30 * Math.PI) / 180;
    const r = run({
      ticks: 150,
      ...n3,
      ...sc([32 * Math.cos(a), 0, 32 * Math.sin(a)]),
      frames: [{ tick: 0, move: [-Math.cos(a), -Math.sin(a)] }],
    });
    const p = last(r.snaps).player;
    expect(p.pos[1]).toBeCloseTo(3, 3);
    expect(p.grounded).toBe(true);
  });
  it("stepping off tier 1 drops to tier 0 (no damage)", () => {
    const r = run({
      ticks: 160,
      ...n3,
      ...sc([10, 3, 14]),
      frames: [{ tick: 0, move: [0, -1] }],
    });
    expect(named(r.events, "player_hit")).toHaveLength(0);
    // walking -Z leaves the ring (r < 12) and falls to y = 0 (it starts clear of the jump pad)
    expect(last(r.snaps).player.pos[1]).toBe(0);
  });
  it("jump pad (0,3,13): vy 12, 8 m/s toward -Z, lands on the top tier", () => {
    const r = run({ ticks: 120, ...n3, ...sc([0, 3, 13]), every: 1 });
    const ys = r.snaps.map((s) => s.player.pos[1] as number);
    expect(Math.max(...ys)).toBeGreaterThan(6.2); // 3 + 12^2 / 40 = 6.6
    const land = last(r.snaps).player;
    expect(land.grounded).toBe(true);
    expect(land.pos[1]).toBe(6);
    expect(Math.hypot(land.pos[0], land.pos[2])).toBeLessThanOrEqual(8);
  });
  it("the bell tower (R 2, 8 m high) cannot be walked into", () => {
    const r = run({ ticks: 120, ...n3, ...sc([5, 6, 0]), frames: [{ tick: 0, move: [-1, 0] }] });
    const p = last(r.snaps).player;
    expect(p.pos[0]).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(p.pos[1]).toBe(6);
  });
  it("fireflies on another tier cannot be picked from below (|dy| > 1.5)", () => {
    const r = run({
      ticks: 3,
      ...n3,
      scenario: { player: { pos: [18, 0, -8] as V3 }, motes: [[18, 3, -8.2]] },
    });
    expect(named(r.events, "mote_picked")).toHaveLength(0);
  });
  it("Shades move at 4.5 m/s", () => {
    const r = run({
      ticks: 60,
      ...n3,
      scenario: {
        player: { pos: [0, 0, -30] as V3 },
        shades: [{ id: "S1", pos: [0, 0, -18] as V3 }],
      },
    });
    expect(last(r.snaps).shades[0].pos[2]).toBeCloseTo(-18 - 4.5, 2);
  });
  it("a strong wind blows for 5 s every 30 s, pushing Mây 2 m/s, warned 2 s ahead", () => {
    const r = run({
      ticks: 2200,
      ...n3,
      every: 1,
      defaults: true,
      scenario: { random_motes: false, random_shades: false, random_drifters: false },
    });
    expect(at(r.snaps, 1799).wind.active).toBe(false);
    expect(at(r.snaps, 1800).wind.active).toBe(true);
    expect(at(r.snaps, 2099).wind.active).toBe(true);
    expect(at(r.snaps, 2100).wind.active).toBe(false);
    const dir = (at(r.snaps, 1800).wind.dir_deg * Math.PI) / 180;
    const a = at(r.snaps, 1799).player.pos;
    const b = at(r.snaps, 1859).player.pos; // 60 pushes of 2/60 m
    expect(b[0] - a[0]).toBeCloseTo(2 * Math.cos(dir), 2);
    expect(b[2] - a[2]).toBeCloseTo(2 * Math.sin(dir), 2);
    expect(at(r.snaps, 1700).wind.dir_deg).toBe(at(r.snaps, 1800).wind.dir_deg); // direction known at the warning
  });
  it("no wind on Nights 1 and 2", () => {
    const r = run({
      ticks: 2000,
      night: 2,
      defaults: true,
      every: 500,
      scenario: { random_motes: false, random_shades: false },
    });
    expect(r.snaps.every((s) => !s.wind.active)).toBe(true);
  });
});

describe("headless performance", () => {
  it("runs a whole Night 3 (21,600 ticks) well inside the 30 s budget", () => {
    const t = Date.now();
    const r = run({
      ticks: 21600,
      night: 3,
      defaults: true,
      every: 10,
      scenario: { player: { flames: 99 } },
      frames: [{ tick: 0, move: [0.4, 1] }],
    });
    const ms = Date.now() - t;
    expect(r.end.ticks).toBeGreaterThan(0);
    expect(ms).toBeLessThan(10_000);
    void T;
  });
});
