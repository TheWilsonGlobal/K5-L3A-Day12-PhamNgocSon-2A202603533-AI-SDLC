// Headless scenarios for every TICKET-03 rule (C6) and event (C5): Contract v1.2.
// Fuel is counted in 1/60 units: decay = 1 unit per tick, drain = 5 units per tick per shade.
import { describe, expect, it } from "vitest";
import { InputError, parseScenario } from "../packages/sim/src/index.ts";
import { T, at, fuelFromTicks, last, named, run, type Line } from "./helpers.ts";

type V3 = [number, number, number];

const PRESS = [
  { tick: 0, interact: true },
  { tick: 1, interact: false },
];
const lantern = (s: Line, id: string): Line => s.lanterns.find((l: Line) => l.id === id)!;
const shade = (s: Line, id: string): Line => s.shades.find((x: Line) => x.id === id)!;
const dxz = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
const lit = (id: string, extra: object = {}) => ({ id, lit: true, ...extra });
const ev = (tick: number, name: string, data: object) => ({ type: "event", tick, name, data });
/** Dawn tick of a scenario with `time_left_s: 1`. */
const DAWN = 60;

describe("P1/P8/S1/S2/C2 light and relight (lantern_lit.relight)", () => {
  it("first light costs lantern_cost: deposit, lantern_lit relight:false, fuel 100, ever_lit, +5/mote +100", () => {
    const r = run({
      ticks: 1,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: T.lantern_cost },
        lanterns: [{ id: "L1", pos: [1, 0, 0] }],
      },
      frames: PRESS,
    });
    expect(named(r.events, "deposit")).toEqual([
      ev(1, "deposit", { lantern_id: "L1", amount: T.lantern_cost, deposited: T.lantern_cost }),
    ]);
    expect(named(r.events, "lantern_lit")).toEqual([
      ev(1, "lantern_lit", { lantern_id: "L1", relight: false }),
    ]);
    const s = at(r.snaps, 1);
    expect(lantern(s, "L1")).toMatchObject({
      lit: true,
      fuel: T.fuel_max,
      ever_lit: true,
      relit_count: 0,
    });
    expect(s.player.carried).toBe(0);
    expect(s.player.capacity).toBe(T.carry_capacity + 2);
    expect(s.score).toBe(T.score.per_mote * T.lantern_cost + T.score.per_lantern); // 50 + 100
  });

  it("an unlit lantern that was never lit still needs the full price: 5 carried only deposits", () => {
    const r = run({
      ticks: 1,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: T.relight_cost },
        lanterns: [{ id: "L1", pos: [1, 0, 0] }],
      },
      frames: PRESS,
    });
    expect(named(r.events, "lantern_lit")).toEqual([]);
    expect(named(r.events, "deposit")[0]!.data).toEqual({
      lantern_id: "L1",
      amount: T.relight_cost,
      deposited: T.relight_cost,
    });
    expect(lantern(at(r.snaps, 1), "L1")).toMatchObject({ lit: false, fuel: 0, ever_lit: false });
    expect(at(r.snaps, 1).player.capacity).toBe(T.carry_capacity);
  });

  it("relight costs relight_cost: lantern_lit relight:true, relit_count 1, +25 +40, capacity +2", () => {
    const r = run({
      ticks: 1,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: T.relight_cost },
        lanterns: [{ id: "L1", pos: [1, 0, 0], lit: false, ever_lit: true }],
      },
      frames: PRESS,
    });
    expect(named(r.events, "lantern_lit")).toEqual([
      ev(1, "lantern_lit", { lantern_id: "L1", relight: true }),
    ]);
    const s = at(r.snaps, 1);
    expect(lantern(s, "L1")).toMatchObject({
      lit: true,
      fuel: T.fuel_max,
      ever_lit: true,
      relit_count: 1,
    });
    expect(s.player.carried).toBe(0);
    expect(s.player.capacity).toBe(T.carry_capacity + 2);
    expect(s.score).toBe(T.score.per_mote * T.relight_cost + T.score.per_relight); // 25 + 40
  });

  it("P8/G7: a relight with too few motes deposits what it can and keeps it", () => {
    const four = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: T.relight_cost - 1 },
        lanterns: [{ id: "L1", pos: [1, 0, 0], lit: false, ever_lit: true }],
      },
      frames: PRESS,
    });
    expect(named(four.events, "deposit")[0]!.data).toMatchObject({ amount: 4, deposited: 4 });
    expect(named(four.events, "lantern_lit")).toEqual([]);
    expect(lantern(last(four.snaps), "L1")).toMatchObject({ lit: false, deposited: 4 });
    // the earlier deposit counts: 3 already in + 2 carried = 5
    const topUp = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 2 },
        lanterns: [{ id: "L1", pos: [1, 0, 0], lit: false, ever_lit: true, deposited: 3 }],
      },
      frames: PRESS,
    });
    expect(named(topUp.events, "deposit")[0]!.data).toMatchObject({ amount: 2, deposited: 5 });
    expect(named(topUp.events, "lantern_lit")[0]!.data).toEqual({
      lantern_id: "L1",
      relight: true,
    });
  });

  it("C2: refuelling does not add a successful light; scenario-placed lit lanterns do not either", () => {
    const refuel = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3 },
        lanterns: [lit("L1", { pos: [1, 0, 0], fuel: 40 })],
      },
      frames: PRESS,
    });
    expect(named(refuel.events, "refuel")).toHaveLength(1);
    expect(last(refuel.snaps).player.capacity).toBe(T.carry_capacity);
    const placed = run({
      ticks: 5,
      scenario: { lanterns: [lit("L1"), lit("L2"), lit("L3")] },
    });
    expect(last(placed.snaps).player.capacity).toBe(T.carry_capacity);
  });
});

describe("P3/S1 refuel (event refuel)", () => {
  it("fuel 42, carrying 3: used 3, fuel 72, refuel {lantern_id, amount, fuel}, +15", () => {
    const r = run({
      ticks: 1,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3 },
        lanterns: [lit("L1", { pos: [1, 0, 0], fuel: 42 })],
      },
      frames: PRESS,
    });
    expect(named(r.events, "refuel")).toEqual([
      ev(1, "refuel", { lantern_id: "L1", amount: 3, fuel: 72 }),
    ]);
    const s = at(r.snaps, 1);
    expect(lantern(s, "L1").fuel).toBe(72);
    expect(s.player.carried).toBe(0);
    expect(s.score).toBe(3 * T.score.per_mote);
    expect(named(r.events, "lantern_lit")).toEqual([]);
  });

  it("fuel 95, carrying 8: only 1 mote is used (ceil((100-fuel)/10)), fuel 100, 7 left", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 8 },
        lanterns: [lit("L1", { pos: [1, 0, 0], fuel: 95 })],
      },
      frames: PRESS,
    });
    expect(named(r.events, "refuel")[0]!.data).toEqual({ lantern_id: "L1", amount: 1, fuel: 100 });
    expect(last(r.snaps).player.carried).toBe(7);
    expect(last(r.snaps).score).toBe(T.score.per_mote);
  });

  it("G19 boundary: fuel 90 decays to 5399 units before step 5, so used = ceil(601/600) = 2", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 5 },
        lanterns: [lit("L1", { pos: [1, 0, 0], fuel: 90 })],
      },
      frames: PRESS,
    });
    expect(named(r.events, "refuel")[0]!.data).toEqual({ lantern_id: "L1", amount: 2, fuel: 100 });
    expect(last(r.snaps).player.carried).toBe(3);
  });

  it("fuel 40, carrying 2: carried is the limit, fuel 60", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 2 },
        lanterns: [lit("L1", { pos: [1, 0, 0], fuel: 40 })],
      },
      frames: PRESS,
    });
    expect(named(r.events, "refuel")[0]!.data).toEqual({ lantern_id: "L1", amount: 2, fuel: 60 });
    expect(last(r.snaps).player.carried).toBe(0);
  });
});

describe("P4/P5 which lantern the interact key picks", () => {
  // Spec correction, not bending to the sim (PM decision G19, unconfirmed): the ticket's tick
  // order is applied literally, so decay (step 2) runs before interact (step 5). A lantern placed
  // at fuel 100 therefore holds 5999 units at step 5, is NOT "full" (only exactly 6000 units
  // is, which is unreachable at step 5 in a running night) and is a valid refuel candidate.
  it("P4/G19: a lantern placed at fuel 100 has already decayed, so it is still the nearest candidate", () => {
    const r = run({
      ticks: 1,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 5 },
        lanterns: [
          lit("L1", { pos: [0.5, 0, 0], fuel: T.fuel_max }),
          lit("L2", { pos: [1.5, 0, 0], fuel: 40 }),
        ],
      },
      frames: PRESS,
    });
    // used = ceil((6000 - 5999) / 600) = 1
    expect(named(r.events, "refuel")).toEqual([
      ev(1, "refuel", { lantern_id: "L1", amount: 1, fuel: T.fuel_max }),
    ]);
    const s = at(r.snaps, 1);
    expect(lantern(s, "L1").fuel).toBe(T.fuel_max);
    expect(lantern(s, "L2").fuel).toBe(40); // untouched: 2399 units shown to 1 decimal
    expect(s.player.carried).toBe(4);
  });

  it("P4: with two equally near candidates the lower id wins", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3 },
        lanterns: [
          lit("L2", { pos: [0, 0, -1.5], fuel: 40 }),
          lit("L1", { pos: [0, 0, 1.5], fuel: 40 }),
        ],
      },
      frames: PRESS,
    });
    expect(named(r.events, "refuel").map((e) => e.data.lantern_id)).toEqual(["L1"]);
  });

  it("P5: the nearest candidate wins even when it is unlit and a lit one is also in reach", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 10 },
        lanterns: [{ id: "L1", pos: [1, 0, 0] }, lit("L2", { pos: [1.8, 0, 0], fuel: 40 })],
      },
      frames: PRESS,
    });
    expect(named(r.events, "refuel")).toEqual([]);
    expect(named(r.events, "deposit")[0]!.data.lantern_id).toBe("L1");
  });

  it("P5: the nearest candidate wins even when it is lit and an unlit one is also in reach", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 10 },
        lanterns: [{ id: "L1", pos: [1.8, 0, 0] }, lit("L2", { pos: [1, 0, 0], fuel: 40 })],
      },
      frames: PRESS,
    });
    expect(named(r.events, "deposit")).toEqual([]);
    expect(named(r.events, "refuel")[0]!.data.lantern_id).toBe("L2");
  });

  it("P5: reach is interact_radius on XZ, inclusive (2.0 works, 2.01 does not)", () => {
    const edge = T.interact_radius;
    const inside = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3 },
        lanterns: [lit("L1", { pos: [edge, 0, 0], fuel: 40 })],
      },
      frames: PRESS,
    });
    expect(named(inside.events, "refuel")).toHaveLength(1);
    const outside = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3 },
        lanterns: [lit("L1", { pos: [edge + 0.01, 0, 0], fuel: 40 })],
      },
      frames: PRESS,
    });
    expect(named(outside.events, "refuel")).toEqual([]);
    expect(last(outside.snaps).player.carried).toBe(3);
  });

  it("P5: a farther lantern in reach is used when the nearer one is out of reach", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3 },
        lanterns: [
          lit("L1", { pos: [2.5, 0, 0], fuel: 40 }),
          lit("L2", { pos: [0, 0, 1.9], fuel: 40 }),
        ],
      },
      frames: PRESS,
    });
    expect(named(r.events, "refuel").map((e) => e.data.lantern_id)).toEqual(["L2"]);
  });
});

describe("P2/P6/P7 fuel burn and lantern_out", () => {
  it("P2: a lit lantern burns 1 fuel per second: 100 -> 99.0 after 60 ticks", () => {
    const r = run({ ticks: 60, every: 60, scenario: { lanterns: [lit("L1")] } });
    expect(lantern(at(r.snaps, 0), "L1").fuel).toBe(100);
    expect(lantern(at(r.snaps, 60), "L1").fuel).toBe(99);
  });

  it("P2: it dies after fuel_max / fuel_decay_per_s seconds (6000 ticks), not before", () => {
    const dyingTick = (T.fuel_max / T.fuel_decay_per_s) * 60;
    const r = run({ ticks: dyingTick + 10, every: 100, scenario: { lanterns: [lit("L1")] } });
    expect(named(r.events, "lantern_out").map((e) => e.tick)).toEqual([dyingTick]);
    expect(lantern(at(r.snaps, dyingTick - 100), "L1").lit).toBe(true);
    expect(lantern(last(r.snaps), "L1")).toMatchObject({ lit: false, fuel: 0 });
  });

  it("P6: fuel is exact integers: 100 -> 40.0 after 3600 ticks, no drift", () => {
    const r = run({ ticks: 3600, every: 3600, scenario: { lanterns: [lit("L1")] } });
    expect(lantern(at(r.snaps, 3600), "L1").fuel).toBe(40);
  });

  it("P6/V2: snapshot fuel has 1 decimal (nearest), unlit lanterns report 0", () => {
    const r = run({
      ticks: 10,
      every: 1,
      scenario: { lanterns: [lit("L1", { fuel: 77.9 }), lit("L2", { fuel: 12.3 }), { id: "L3" }] },
    });
    expect(lantern(at(r.snaps, 0), "L1").fuel).toBe(77.9);
    expect(lantern(at(r.snaps, 0), "L3").fuel).toBe(0);
    expect(lantern(at(r.snaps, 1), "L2").fuel).toBe(12.3); // 12.3 - 1/60 = 12.283
    expect(lantern(at(r.snaps, 10), "L2").fuel).toBe(12.1); // 12.133
    for (const s of r.snaps)
      for (const l of s.lanterns)
        expect(Math.abs(l.fuel * 10 - Math.round(l.fuel * 10))).toBeLessThan(1e-9);
  });

  it("P7: fuel 1.0 -> lantern_out at tick 60: lit false, deposited 0, ever_lit true, fuel 0", () => {
    const r = run({
      ticks: 61,
      every: 1,
      scenario: { lanterns: [lit("L1", { fuel: fuelFromTicks(60), ever_lit: false })] },
    });
    expect(named(r.events, "lantern_out")).toEqual([ev(60, "lantern_out", { lantern_id: "L1" })]);
    expect(lantern(at(r.snaps, 59), "L1")).toMatchObject({
      lit: true,
      deposited: T.lantern_cost,
      ever_lit: false,
    });
    expect(lantern(at(r.snaps, 60), "L1")).toMatchObject({
      lit: false,
      fuel: 0,
      deposited: 0,
      ever_lit: true,
    });
  });

  it("P7: an extinguished lantern is relit for relight_cost (it is ever_lit), deposits start from 0", () => {
    const frames = [
      { tick: 60, interact: true },
      { tick: 61, interact: false },
    ];
    const relit = run({
      ticks: 61,
      scenario: {
        player: { pos: [0, 0, 0], carried: T.relight_cost },
        lanterns: [lit("L1", { pos: [1, 0, 0], fuel: fuelFromTicks(60), ever_lit: false })],
      },
      frames,
    });
    expect(named(relit.events, "lantern_lit")).toEqual([
      ev(61, "lantern_lit", { lantern_id: "L1", relight: true }),
    ]);
    // 4 motes are not enough: the 10 left over from the scenario-placed lantern are gone
    const short = run({
      ticks: 61,
      scenario: {
        player: { pos: [0, 0, 0], carried: T.relight_cost - 1 },
        lanterns: [lit("L1", { pos: [1, 0, 0], fuel: fuelFromTicks(60), ever_lit: false })],
      },
      frames,
    });
    expect(named(short.events, "deposit")[0]!.data).toMatchObject({ amount: 4, deposited: 4 });
    expect(named(short.events, "lantern_lit")).toEqual([]);
  });

  it("G13: two lanterns dying on the same tick emit lantern_out in ascending id order", () => {
    const r = run({
      ticks: 61,
      scenario: {
        lanterns: [
          lit("L4", { fuel: fuelFromTicks(60) }),
          lit("L2", { fuel: fuelFromTicks(60) }),
          lit("L1", { fuel: T.fuel_max }),
        ],
      },
    });
    expect(named(r.events, "lantern_out").map((e) => [e.tick, e.data.lantern_id])).toEqual([
      [60, "L2"],
      [60, "L4"],
    ]);
  });

  it("G9: pause freezes fuel (and sim_tick), resuming continues the burn", () => {
    const r = run({
      ticks: 200,
      every: 1,
      scenario: { lanterns: [lit("L1")] },
      frames: [
        { tick: 10, pause: true },
        { tick: 11, pause: false },
        { tick: 130, pause: true },
        { tick: 131, pause: false },
      ],
    });
    const before = at(r.snaps, 10);
    expect(before.sim_tick).toBe(10);
    expect(lantern(before, "L1").fuel).toBe(99.8); // 5990 units
    for (const t of [11, 70, 130]) {
      const s = at(r.snaps, t);
      expect(s.state).toBe("paused");
      expect(s.sim_tick).toBe(10);
      expect(lantern(s, "L1").fuel).toBe(99.8);
    }
    const end = at(r.snaps, 200);
    expect(end.sim_tick).toBe(80);
    expect(lantern(end, "L1").fuel).toBe(98.7); // 6000 - 80 = 5920 units
  });
});

describe("D1 the safe zone needs fuel >= low_fuel_threshold", () => {
  // Lantern holds 30.0 + 2 units: 30.03 at tick 0, 30.02 at tick 1, exactly 30.0 at tick 2, 29.98 at tick 3.
  const thr = T.low_fuel_threshold;
  const edge = (thr * 60 + 2) / 60;
  const scenario = {
    player: { pos: [0, 0, 0] as V3 },
    lanterns: [lit("L1", { pos: [0, 0, 0], fuel: edge })],
    shades: [{ id: "S1", pos: [6.1, 0, 0] as V3, state: "chase" as const }],
  };
  const R = T.safe_radius;

  it("exactly 30.0 still blocks a shade at the safe radius; below 30 it walks in", () => {
    const r = run({ ticks: 3, every: 1, scenario });
    expect(lantern(at(r.snaps, 2), "L1").fuel).toBe(30);
    expect(shade(at(r.snaps, 1), "S1").pos[0]).toBeCloseTo(6.033, 3); // approaching
    expect(shade(at(r.snaps, 2), "S1").pos[0]).toBe(R); // held at the edge at exactly 30.0
    expect(lantern(at(r.snaps, 3), "L1").fuel).toBe(30); // prints 30.0 but is 1799 units: below the threshold
    expect(shade(at(r.snaps, 3), "S1").pos[0]).toBeCloseTo(R - 0.067, 3); // 29.98: no zone, shade enters
  });

  it("a strong lantern (fuel 40) keeps the shade out for as long as the run lasts", () => {
    const r = run({
      ticks: 30,
      every: 1,
      scenario: { ...scenario, lanterns: [lit("L1", { pos: [0, 0, 0], fuel: 40 })] },
    });
    for (const s of r.snaps.slice(3)) expect(shade(s, "S1").pos[0]).toBeGreaterThanOrEqual(R);
  });

  it("D1/C6 refuelling to exactly 30.0 counts as safe: shades inside are ejected, at 29.98 they are not", () => {
    // 1201 units -> 1200 after decay, +600 = 1800 (exactly 30.0); 1200 units -> 1799 (29.98)
    const mk = (units: number) =>
      run({
        ticks: 1,
        every: 1,
        scenario: {
          player: { pos: [0, 0, 30], carried: 1 },
          lanterns: [lit("L1", { pos: [0, 0, 30], fuel: units / 60 })],
          shades: [{ id: "S1", pos: [0, 0, 33], state: "wander" as const }],
        },
        frames: PRESS,
      });
    const exact = mk(1201);
    expect(named(exact.events, "refuel")[0]!.data.fuel).toBe(30);
    // ejected: pushed outward by safe_radius / 30 per tick
    expect(shade(last(exact.snaps), "S1").pos[2]).toBeCloseTo(33.2, 3);
    const below = mk(1200);
    expect(named(below.events, "refuel")[0]!.data.fuel).toBe(30);
    // 1799 units: still weak, the shade heads for the lantern instead of being pushed out
    expect(shade(last(below.snaps), "S1").pos[2]).toBeLessThan(33);
  });
});

describe("D2 wander shades go for the nearest weak lit lantern", () => {
  const far: V3 = [0, 0, -30]; // keep Mây out of the 12 m detection range
  const base = { player: { pos: far }, shades: [{ id: "S1", pos: [0, 0, 20] as V3 }] };

  it("two equally weak lanterns: the lower id (to the west) is chosen", () => {
    const r = run({
      ticks: 60,
      every: 60,
      scenario: {
        ...base,
        lanterns: [
          lit("L2", { pos: [10, 0, 20], fuel: 20 }),
          lit("L1", { pos: [-10, 0, 20], fuel: 20 }),
        ],
      },
    });
    const p = shade(at(r.snaps, 60), "S1").pos;
    expect(p[0]).toBeCloseTo(-2, 2); // 2 m/s for 1 s (G2)
    expect(p[2]).toBeCloseTo(20, 2);
  });

  it("the nearer weak lantern wins over a lower id that is farther", () => {
    const r = run({
      ticks: 60,
      every: 60,
      scenario: {
        ...base,
        lanterns: [
          lit("L1", { pos: [-10, 0, 20], fuel: 20 }),
          lit("L2", { pos: [8, 0, 20], fuel: 20 }),
        ],
      },
    });
    expect(shade(at(r.snaps, 60), "S1").pos[0]).toBeCloseTo(2, 2);
  });

  it("a lantern at or above the threshold is not a target even when it is nearer", () => {
    const r = run({
      ticks: 60,
      every: 60,
      scenario: {
        ...base,
        lanterns: [
          lit("L1", { pos: [-8, 0, 20], fuel: 50 }),
          lit("L2", { pos: [12, 0, 20], fuel: 20 }),
        ],
      },
    });
    expect(shade(at(r.snaps, 60), "S1").pos[0]).toBeCloseTo(2, 2);
  });

  it("a chase shade never changes target: it keeps following Mây", () => {
    const r = run({
      ticks: 60,
      every: 60,
      scenario: {
        player: { pos: [0, 0, 5] },
        shades: [{ id: "S1", pos: [0, 0, 20], state: "chase" }],
        lanterns: [lit("L1", { pos: [10, 0, 20], fuel: 20 })],
      },
    });
    const p = shade(at(r.snaps, 60), "S1").pos;
    expect(p[0]).toBeCloseTo(0, 2);
    expect(p[2]).toBeCloseTo(20 - 4, 2); // shade_speed 4 m/s towards Mây
    expect(shade(at(r.snaps, 60), "S1").state).toBe("chase");
  });

  it("G3: a wandering shade within 12 m of Mây still switches to chase", () => {
    const r = run({
      ticks: 15,
      every: 15,
      scenario: {
        player: { pos: [0, 0, 10] },
        shades: [{ id: "S1", pos: [0, 0, 20] }],
        lanterns: [lit("L1", { pos: [10, 0, 20], fuel: 20 })],
      },
    });
    const s = shade(at(r.snaps, 15), "S1");
    expect(s.state).toBe("chase");
    expect(s.pos[0]).toBeCloseTo(0, 2);
    expect(s.pos[2]).toBeCloseTo(19, 2);
  });
});

describe("D3/D7 draining, fuel_drain", () => {
  const L1 = lit("L1", { pos: [0, 0, 20], fuel: 29 });
  const drainer = (id: string, x: number) => ({
    id,
    pos: [x, 0, 20] as V3,
    state: "drain" as const,
    target_lantern_id: "L1",
  });

  it("D3: no shade -> 29 - 1 = 28.0 after 60 ticks", () => {
    const r = run({ ticks: 60, every: 60, scenario: { lanterns: [L1] } });
    expect(lantern(at(r.snaps, 60), "L1").fuel).toBe(28);
  });

  it("D3: one draining shade costs 5 + 1 per second: 29 -> 23.0, and it stands still", () => {
    const r = run({
      ticks: 60,
      every: 60,
      scenario: { lanterns: [L1], shades: [drainer("S1", 1)] },
    });
    const s = at(r.snaps, 60);
    expect(lantern(s, "L1").fuel).toBe(23);
    expect(shade(s, "S1")).toMatchObject({ state: "drain", pos: [1, 1, 20] });
  });

  it("D3: two shades add up: 11 per second, 29 -> 18.0", () => {
    const r = run({
      ticks: 60,
      every: 60,
      scenario: { lanterns: [L1], shades: [drainer("S1", 1), drainer("S2", -1)] },
    });
    expect(lantern(at(r.snaps, 60), "L1").fuel).toBe(18);
  });

  it("D7: fuel_drain every 60 draining ticks per shade, fuel after deduction, ids ascending", () => {
    const r = run({
      ticks: 130,
      every: 130,
      scenario: { lanterns: [L1], shades: [drainer("S2", -1), drainer("S1", 1)] },
    });
    const got = named(r.events, "fuel_drain");
    expect(got).toEqual([
      ev(60, "fuel_drain", { lantern_id: "L1", shade_id: "S1", fuel: 18 }),
      ev(60, "fuel_drain", { lantern_id: "L1", shade_id: "S2", fuel: 18 }),
      ev(120, "fuel_drain", { lantern_id: "L1", shade_id: "S1", fuel: 7 }),
      ev(120, "fuel_drain", { lantern_id: "L1", shade_id: "S2", fuel: 7 }),
    ]);
  });

  it("D7/G5: the 60-tick count starts when the shade enters drain, not at tick 0", () => {
    const r = run({
      ticks: 125,
      every: 1,
      scenario: {
        lanterns: [lit("L1", { pos: [0, 0, 20], fuel: 25 })],
        shades: [{ id: "S1", pos: [3.95, 0, 20] }],
      },
    });
    expect(shade(at(r.snaps, 59), "S1").state).toBe("wander");
    expect(shade(at(r.snaps, 60), "S1").state).toBe("drain"); // 1.95 m at 2 m/s -> arrives on tick 60
    // draining ticks 61..120: 120 decay + 60 x 5 drain from 1500 units = 1080 = 18.0
    expect(named(r.events, "fuel_drain")).toEqual([
      ev(120, "fuel_drain", { lantern_id: "L1", shade_id: "S1", fuel: 18 }),
    ]);
  });
});

describe("D4/D5/S3 leaving drain", () => {
  const L1 = lit("L1", { pos: [0, 0, 20], fuel: 25 });
  const drainAt = (pos: V3) => ({
    id: "S1",
    pos,
    state: "drain" as const,
    target_lantern_id: "L1",
  });

  it("drain -> chase when Mây is within 6 m (inclusive); beyond it the shade keeps draining", () => {
    const near = run({
      ticks: 1,
      scenario: { player: { pos: [0, 0, 14] }, lanterns: [L1], shades: [drainAt([0, 0, 20])] },
    });
    expect(shade(last(near.snaps), "S1").state).toBe("chase");
    const farther = run({
      ticks: 1,
      scenario: { player: { pos: [0, 0, 13.9] }, lanterns: [L1], shades: [drainAt([0, 0, 20])] },
    });
    expect(shade(last(farther.snaps), "S1").state).toBe("drain");
  });

  it("drain -> stunned on Tỏa Sáng: pulse event, stun for 120 ticks, and the drain stops", () => {
    const r = run({
      ticks: 60,
      every: 60,
      scenario: {
        player: { pos: [0, 0, 16], carried: T.pulse_cost },
        lanterns: [L1],
        shades: [drainAt([0, 0, 20])],
      },
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
      ],
    });
    expect(named(r.events, "pulse")[0]!.data.stunned_ids).toEqual(["S1"]);
    expect(shade(at(r.snaps, 60), "S1").state).toBe("stunned");
    // tick 1 still drains (step 2 precedes the pulse): 1500 - 6, then 59 x 1 decay -> 1435 units = 23.9
    expect(lantern(at(r.snaps, 60), "L1").fuel).toBe(23.9);
  });

  it("S3/G16: a shade stunned while draining is worth per_stun_drain (15) instead of per_stun (5)", () => {
    const frames = [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false },
    ];
    const draining = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 16], carried: T.pulse_cost },
        lanterns: [L1],
        shades: [drainAt([0, 0, 20])],
      },
      frames,
    });
    expect(last(draining.snaps).score).toBe(T.score.per_stun_drain);
    const wandering = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 16], carried: T.pulse_cost },
        shades: [{ id: "S1", pos: [0, 0, 20] }],
      },
      frames,
    });
    expect(last(wandering.snaps).score).toBe(T.score.per_stun);
    const both = run({
      ticks: 1,
      scenario: {
        player: { pos: [0, 0, 16], carried: T.pulse_cost },
        lanterns: [L1],
        shades: [drainAt([0, 0, 20]), { id: "S2", pos: [-3, 0, 16] }],
      },
      frames,
    });
    expect(last(both.snaps).score).toBe(T.score.per_stun_drain + T.score.per_stun);
  });

  it("D5: a stunned drain shade goes back to wander once the stun is over", () => {
    const r = run({
      ticks: 125,
      every: 1,
      scenario: {
        player: { pos: [0, 0, 16], carried: T.pulse_cost },
        lanterns: [L1],
        shades: [drainAt([0, 0, 20])],
      },
      frames: [
        { tick: 0, pulse: true, move: [0, -1] }, // walk off so the shade is > 12 m away at the end
        { tick: 1, pulse: false },
      ],
    });
    expect(shade(at(r.snaps, 100), "S1").state).toBe("stunned");
    expect(shade(at(r.snaps, 125), "S1").state).toBe("wander");
  });

  it("drain -> wander when the lantern goes out (and lantern_out is emitted)", () => {
    const r = run({
      ticks: 5,
      every: 1,
      scenario: {
        lanterns: [lit("L1", { pos: [0, 0, 20], fuel: fuelFromTicks(20) })],
        shades: [drainAt([0, 0, 20])],
      },
    });
    // 20 units, 6 per tick: 14, 8, 2, 0 -> out on tick 4
    expect(named(r.events, "lantern_out").map((e) => e.tick)).toEqual([4]);
    expect(shade(at(r.snaps, 3), "S1").state).toBe("drain");
    expect(shade(at(r.snaps, 4), "S1").state).toBe("wander");
  });

  it("drain -> wander when the shade is more than 2 m from the lantern (2.0 m is still drain)", () => {
    const at2 = run({
      ticks: 1,
      scenario: { lanterns: [L1], shades: [drainAt([2, 0, 20])] },
    });
    expect(shade(last(at2.snaps), "S1").state).toBe("drain");
    const at25 = run({
      ticks: 1,
      scenario: { lanterns: [L1], shades: [drainAt([2.5, 0, 20])] },
    });
    expect(shade(last(at25.snaps), "S1").state).toBe("wander");
  });
});

describe("D4/D6 refuel to >= 30 sends shades away", () => {
  const scenario = {
    player: { pos: [0, 0, 19] as V3, carried: 3 },
    lanterns: [lit("L1", { pos: [0, 0, 20], fuel: 10 })],
    shades: [
      { id: "S1", pos: [1, 0, 20] as V3, state: "drain" as const, target_lantern_id: "L1" },
      { id: "S2", pos: [0, 0, 18.6] as V3, state: "wander" as const }, // 0.4 m from Mây
    ],
  };

  it("drain -> wander on refuel (not chase, although Mây is 1.4 m away)", () => {
    const r = run({ ticks: 1, every: 1, scenario, frames: PRESS });
    // the draining shade still takes its 5 units on this tick (step 2 runs before the refuel): 39.9
    expect(named(r.events, "refuel")[0]!.data).toEqual({ lantern_id: "L1", amount: 3, fuel: 39.9 });
    expect(shade(at(r.snaps, 1), "S1").state).toBe("wander");
  });

  it("D6: shades within 6 m are pushed to the edge within 30 ticks and deal no damage meanwhile", () => {
    const r = run({ ticks: 30, every: 1, scenario, frames: PRESS });
    expect(named(r.events, "player_hit")).toEqual([]);
    expect(at(r.snaps, 30).player.flames).toBe(T.flames);
    const l = lantern(at(r.snaps, 30), "L1").pos;
    for (const id of ["S1", "S2"]) {
      const d = dxz(shade(at(r.snaps, 30), id).pos, l);
      expect(d).toBeGreaterThanOrEqual(T.safe_radius - 0.002);
      expect(d).toBeLessThan(T.safe_radius + 0.5);
    }
    // after the first tick they have only moved a little: it really is a push, not a teleport
    expect(dxz(shade(at(r.snaps, 1), "S1").pos, l)).toBeCloseTo(1 + T.safe_radius / 30, 2);
  });

  it("D6 control: without the refuel the same wander shade next to Mây hits her", () => {
    const r = run({
      ticks: 5,
      scenario: {
        ...scenario,
        lanterns: [lit("L1", { pos: [0, 0, 20], fuel: 10 })],
        player: { pos: [0, 0, 19] as V3, carried: 3 },
      },
    });
    expect(named(r.events, "player_hit").length).toBeGreaterThan(0);
  });
});

describe("W1 night length", () => {
  for (const [night, secs] of [
    [1, T.night1_duration_s],
    [2, T.night2_duration_s],
    [3, T.night3_duration_s],
  ] as const) {
    it(`Night ${night} ends at tick ${secs * 60} (${secs} s)`, () => {
      const r = run({ night, ticks: 18100, every: 100000 });
      expect(named(r.events, "game_over")).toEqual([
        ev(secs * 60, "game_over", { result: "lost", reason: "dawn" }),
      ]);
      expect(r.end).toMatchObject({ type: "end", ticks: secs * 60, state: "lost" });
    });
  }
  it("the contract has 240 / 270 / 300", () => {
    expect([T.night1_duration_s, T.night2_duration_s, T.night3_duration_s]).toEqual([
      240, 270, 300,
    ]);
  });
});

describe("W2/S4/S5 winning only at dawn", () => {
  const nights = [
    { night: 1, total: 5, need: 3 },
    { night: 2, total: 6, need: 4 },
    { night: 3, total: 7, need: 5 },
  ];
  const litN = (n: number) => Array.from({ length: n }, (_, i) => lit(`L${i + 1}`));
  // fuel at dawn: 100 - 1 s of decay = 99.0

  for (const { night, total, need } of nights) {
    it(`Night ${night}: ${need}/${total} lit at dawn -> won/dawn_survived with the dawn bonus`, () => {
      const r = run({ night, ticks: 100, scenario: { time_left_s: 1, lanterns: litN(need) } });
      expect(named(r.events, "game_over")).toEqual([
        ev(DAWN, "game_over", { result: "won", reason: "dawn_survived" }),
      ]);
      expect(r.end).toMatchObject({ ticks: DAWN, state: "won" });
      expect(r.end.score).toBe(
        need * (T.score.per_lit_lantern_dawn + 99) + T.flames * T.score.per_flame_left,
      );
    });
    it(`Night ${night}: ${need - 1}/${total} lit at dawn -> lost/dawn, no dawn points`, () => {
      const r = run({ night, ticks: 100, scenario: { time_left_s: 1, lanterns: litN(need - 1) } });
      expect(named(r.events, "game_over")).toEqual([
        ev(DAWN, "game_over", { result: "lost", reason: "dawn" }),
      ]);
      expect(r.end).toMatchObject({ ticks: DAWN, state: "lost", score: 0 });
    });
  }

  it("S4: fuel 77.9 at dawn pays 50 + 77 = 127 per lantern, 2 flames pay 100 (total 481 with 3 lit)", () => {
    // 78.9 minus one second of decay is 77.9 at dawn
    const r = run({
      ticks: 100,
      scenario: {
        time_left_s: 1,
        player: { flames: 2 },
        lanterns: [lit("L1", { fuel: 78.9 }), lit("L2", { fuel: 78.9 }), lit("L3", { fuel: 78.9 })],
      },
    });
    expect(lantern(at(r.snaps, DAWN), "L1").fuel).toBe(77.9);
    expect(r.end.score).toBe(3 * (T.score.per_lit_lantern_dawn + 77) + 2 * T.score.per_flame_left);
    expect(r.end.score).toBe(481);
  });

  it("S5: no time bonus; the same lamps at dawn score the same whatever the night length chosen", () => {
    const a = run({
      ticks: 200,
      scenario: {
        time_left_s: 1,
        lanterns: [lit("L1", { fuel: 50 }), lit("L2", { fuel: 50 }), lit("L3", { fuel: 50 })],
      },
    });
    const b = run({
      ticks: 200,
      scenario: {
        time_left_s: 2,
        lanterns: [lit("L1", { fuel: 51 }), lit("L2", { fuel: 51 }), lit("L3", { fuel: 51 })],
      },
    });
    expect(T.score.per_second_left).toBe(0);
    expect(a.end.score).toBe(b.end.score);
    expect(a.end.score).toBe(
      3 * (T.score.per_lit_lantern_dawn + 49) + T.flames * T.score.per_flame_left,
    );
  });
});

describe("W3 no early win", () => {
  it("lighting the last lantern does not end the night and all_lit never appears", () => {
    const r = run({
      ticks: 300,
      scenario: {
        player: { pos: [0, 0, 0], carried: T.lantern_cost },
        lanterns: [lit("L1"), lit("L2"), lit("L3"), lit("L4"), { id: "L5", pos: [1, 0, 0] }],
      },
      frames: PRESS,
    });
    expect(named(r.events, "lantern_lit")).toHaveLength(1);
    expect(lantern(last(r.snaps), "L5").lit).toBe(true);
    expect(last(r.snaps).lanterns.every((l: Line) => l.lit)).toBe(true);
    expect(named(r.events, "game_over")).toEqual([]);
    expect(r.end).toMatchObject({ ticks: 300, state: "playing" });
    expect(JSON.stringify(r.lines)).not.toContain("all_lit");
  });
});

describe("W4/W5 no_flames comes first", () => {
  const hitter = { id: "S1", pos: [0.5, 0, 0] as V3, state: "chase" as const };
  const three = [lit("L1"), lit("L2"), lit("L3")];

  it("W4: the last flame lost mid-night ends the game at once (lost/no_flames)", () => {
    const r = run({
      ticks: 100,
      scenario: { player: { flames: 1 }, shades: [hitter], lanterns: three },
    });
    expect(named(r.events, "game_over")).toEqual([
      ev(1, "game_over", { result: "lost", reason: "no_flames" }),
    ]);
    expect(r.end).toMatchObject({ ticks: 1, state: "lost" });
  });

  it("W5: on the dawn tick with enough lanterns, losing the last flame is lost/no_flames", () => {
    const scenario = { time_left_s: 1, player: { flames: 1, invuln_ticks: DAWN }, lanterns: three };
    const r = run({ ticks: 100, scenario: { ...scenario, shades: [hitter] } });
    expect(named(r.events, "player_hit").map((e) => e.tick)).toEqual([DAWN]);
    expect(named(r.events, "game_over")).toEqual([
      ev(DAWN, "game_over", { result: "lost", reason: "no_flames" }),
    ]);
    expect(r.end.score).toBe(0); // no dawn points for a lost night
    // same night without the hit is a win, so the shade is what decided it
    const calm = run({ ticks: 100, scenario });
    expect(named(calm.events, "game_over")[0]!.data).toEqual({
      result: "won",
      reason: "dawn_survived",
    });
  });
});

describe("W6/G8 a lantern dying on the dawn tick does not count", () => {
  const mk = (units: number) =>
    run({
      ticks: 100,
      scenario: {
        time_left_s: 1,
        lanterns: [lit("L1"), lit("L2"), lit("L3", { fuel: fuelFromTicks(units) })],
      },
    });

  it("3 lit would be enough, but L3 goes out on tick 60 before the win check: lost/dawn", () => {
    const r = mk(DAWN);
    const names = r.events.map((e) => e.name);
    expect(names.indexOf("lantern_out")).toBeGreaterThan(-1);
    expect(names.indexOf("lantern_out")).toBeLessThan(names.indexOf("game_over"));
    expect(named(r.events, "lantern_out")).toEqual([ev(DAWN, "lantern_out", { lantern_id: "L3" })]);
    expect(named(r.events, "game_over")).toEqual([
      ev(DAWN, "game_over", { result: "lost", reason: "dawn" }),
    ]);
  });

  it("one more unit of fuel keeps it alive on the dawn tick: won, and it pays 50 + floor(1/60)", () => {
    const r = mk(DAWN + 1);
    expect(named(r.events, "lantern_out")).toEqual([]);
    expect(named(r.events, "game_over")[0]!.data).toEqual({
      result: "won",
      reason: "dawn_survived",
    });
    expect(r.end.score).toBe(
      2 * (T.score.per_lit_lantern_dawn + 99) +
        T.score.per_lit_lantern_dawn +
        T.flames * T.score.per_flame_left,
    );
  });
});

describe("C1 capacity", () => {
  const cap = (lights: number) =>
    run({ ticks: 0, scenario: { player: { successful_lights: lights } } }).snaps[0]!.player
      .capacity;

  it("min(capacity_max, carry_capacity + 2 x successful_lights): 0, 3, 5, 9 -> 10, 16, 20, 20", () => {
    expect([0, 3, 5, 9].map(cap)).toEqual([10, 16, 20, 20]);
    expect(T.capacity_max).toBe(20);
  });

  it("pickup stops at capacity (10 with no lights)", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { carried: 10 },
        motes: [
          [0.2, 0, 0],
          [0.3, 0, 0],
          [0.4, 0, 0],
        ],
      },
    });
    expect(named(r.events, "mote_picked")).toEqual([]);
    expect(last(r.snaps).player.carried).toBe(10);
    expect(last(r.snaps).motes_active).toBe(3);
  });

  it("pickup goes on up to the raised capacity (16 after 3 lights)", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { carried: 14, successful_lights: 3 },
        motes: [
          [0.2, 0, 0],
          [0.3, 0, 0],
          [0.4, 0, 0],
        ],
      },
    });
    expect(named(r.events, "mote_picked").map((e) => e.data.carried)).toEqual([15, 16]);
    expect(last(r.snaps).player.carried).toBe(16);
    expect(last(r.snaps).motes_active).toBe(1);
  });

  it("pickup is capped by capacity_max (20) however many lights", () => {
    const r = run({
      ticks: 1,
      scenario: {
        player: { carried: 20, successful_lights: 9 },
        motes: [[0.2, 0, 0]],
      },
    });
    expect(last(r.snaps).player.carried).toBe(20);
    expect(last(r.snaps).motes_active).toBe(1);
  });

  it("C3: successful_lights is per night: a night without the scenario field starts at 10", () => {
    expect(
      run({ night: 1, ticks: 0, scenario: { player: { successful_lights: 3 } } }).snaps[0]!.player
        .capacity,
    ).toBe(16);
    expect(run({ night: 2, ticks: 0 }).snaps[0]!.player.capacity).toBe(10);
  });
});

describe("V2/V3/V4 snapshot, scenario and event shapes", () => {
  it("snapshot lanterns carry fuel, ever_lit, relit_count; player carries capacity; shades can be 'drain'", () => {
    const r = run({
      ticks: 0,
      scenario: {
        lanterns: [lit("L1", { fuel: 55.5 }), { id: "L2", ever_lit: true }],
        shades: [{ id: "S1", pos: [0, 0, 20], state: "drain", target_lantern_id: "L1" }],
      },
    });
    const s = r.snaps[0]!;
    expect(lantern(s, "L1")).toMatchObject({
      lit: true,
      fuel: 55.5,
      ever_lit: true,
      relit_count: 0,
    });
    expect(lantern(s, "L2")).toMatchObject({ lit: false, fuel: 0, ever_lit: true, relit_count: 0 });
    expect(lantern(s, "L3")).toMatchObject({ lit: false, fuel: 0, ever_lit: false });
    expect(typeof s.player.capacity).toBe("number");
    expect(shade(s, "S1").state).toBe("drain");
  });

  it("V3: lit:true without fuel means a full tank; a lit lantern defaults to ever_lit", () => {
    const s = run({ ticks: 0, scenario: { lanterns: [lit("L1")] } }).snaps[0]!;
    expect(lantern(s, "L1")).toMatchObject({ lit: true, fuel: T.fuel_max, ever_lit: true });
  });

  it("V3: building the scenario emits no events (except night_start) and scores nothing", () => {
    const r = run({
      ticks: 0,
      scenario: {
        player: { successful_lights: 4 },
        lanterns: [lit("L1"), lit("L2", { fuel: 10 })],
        shades: [{ id: "S1", pos: [0, 0, 20], state: "drain", target_lantern_id: "L2" }],
      },
    });
    expect(r.events.map((e) => e.name)).toEqual(["night_start"]);
    expect(r.snaps[0]!.score).toBe(0);
  });

  it("V3: wrongly typed new scenario fields are rejected with InputError (CLI exit 2)", () => {
    const bad: object[] = [
      { lanterns: [{ id: "L1", fuel: 101 }] },
      { lanterns: [{ id: "L1", fuel: -1 }] },
      { lanterns: [{ id: "L1", fuel: "40" }] },
      { lanterns: [{ id: "L1", ever_lit: "yes" }] },
      { lanterns: [{ id: "L1", lit: 1 }] },
      { player: { successful_lights: -1 } },
      { player: { successful_lights: 1.5 } },
      { player: { successful_lights: "3" } },
      { shades: [{ target_lantern_id: 5 }] },
      { shades: [{ state: "draining" }] },
    ];
    for (const b of bad) expect(() => parseScenario(b), JSON.stringify(b)).toThrow(InputError);
  });

  it("V3: a shade aimed at a lantern that does not exist is rejected", () => {
    expect(() => run({ ticks: 0, scenario: { shades: [{ target_lantern_id: "L9" }] } })).toThrow(
      /L9/,
    );
  });

  it("V3/X1: a shade target_lantern_id naming no lantern is an InputError (CLI exit 2)", () => {
    const sc = {
      lanterns: [lit("L1")],
      shades: [{ id: "S1", pos: [0, 0, 20], target_lantern_id: "L9" }],
    };
    expect(() => run({ ticks: 0, scenario: sc })).toThrow(InputError);
    expect(() => run({ ticks: 0, scenario: sc })).toThrow(/L9/);
  });

  it("V3/X1: an unlit lantern whose deposited already covers its cost is an InputError", () => {
    const cases: [string, object][] = [
      ["never lit, deposited = lantern_cost", { deposited: T.lantern_cost }],
      ["never lit, deposited > lantern_cost", { deposited: T.lantern_cost + 1 }],
      ["ever_lit, deposited = relight_cost", { ever_lit: true, deposited: T.relight_cost }],
      ["ever_lit, deposited > relight_cost", { ever_lit: true, deposited: T.relight_cost + 3 }],
    ];
    for (const [name, extra] of cases) {
      const sc = { lanterns: [{ id: "L1", lit: false, ...extra }] };
      expect(() => run({ ticks: 0, scenario: sc }), name).toThrow(InputError);
    }
  });

  it("V3/X1: deposited just below the cost is still accepted (boundary)", () => {
    const never = run({
      ticks: 0,
      scenario: { lanterns: [{ id: "L1", lit: false, deposited: T.lantern_cost - 1 }] },
    });
    expect(lantern(never.snaps[0]!, "L1").deposited).toBe(T.lantern_cost - 1);
    const ever = run({
      ticks: 0,
      scenario: {
        lanterns: [{ id: "L1", lit: false, ever_lit: true, deposited: T.relight_cost - 1 }],
      },
    });
    expect(lantern(ever.snaps[0]!, "L1").deposited).toBe(T.relight_cost - 1);
  });

  it("V4: every Phase 3 event is emitted with exactly its documented fields", () => {
    const names = new Set<string>();
    const scenarios: Parameters<typeof run>[0][] = [
      {
        ticks: 1,
        scenario: { player: { carried: 10 }, lanterns: [{ id: "L1", pos: [1, 0, 0] }] },
        frames: PRESS,
      },
      {
        ticks: 1,
        scenario: { player: { carried: 3 }, lanterns: [lit("L1", { pos: [1, 0, 0], fuel: 40 })] },
        frames: PRESS,
      },
      { ticks: 60, scenario: { lanterns: [lit("L1", { fuel: fuelFromTicks(60) })] } },
      {
        ticks: 60,
        scenario: {
          lanterns: [lit("L1", { pos: [0, 0, 20], fuel: 29 })],
          shades: [{ id: "S1", pos: [1, 0, 20], state: "drain", target_lantern_id: "L1" }],
        },
      },
      { ticks: 100, scenario: { time_left_s: 1, lanterns: [lit("L1"), lit("L2"), lit("L3")] } },
      { ticks: 100, scenario: { time_left_s: 1 } },
      {
        ticks: 5,
        scenario: { player: { flames: 1 }, shades: [{ pos: [0.5, 0, 0], state: "chase" }] },
      },
    ];
    for (const o of scenarios) for (const e of run(o).events) names.add(e.name);
    for (const n of ["refuel", "lantern_out", "fuel_drain", "lantern_lit", "game_over"])
      expect(names.has(n), n).toBe(true);
    // reasons seen in the runs above
    const reasons = scenarios.flatMap((o) =>
      named(run(o).events, "game_over").map((e) => e.data.reason),
    );
    expect(reasons.sort()).toEqual(["dawn", "dawn_survived", "no_flames"]);
  });
});

describe("determinism", () => {
  it("the same Phase 3 scenario twice gives identical lines", () => {
    const o = {
      ticks: 400,
      every: 20,
      seed: 7,
      scenario: {
        random_shades: true,
        lanterns: [lit("L1", { pos: [0, 0, 20], fuel: 29 }), lit("L2", { fuel: 60 })],
        shades: [
          { id: "S1", pos: [1, 0, 20] as V3, state: "drain" as const, target_lantern_id: "L1" },
        ],
      },
    };
    expect(run(o).lines).toEqual(run(o).lines);
  });
});
