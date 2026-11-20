import { describe, expect, it } from "vitest";
import contract from "../game.contract.json" with { type: "json" };
import { Sim, defaultInput, type Contract, type InputState } from "../packages/sim/src/index.ts";

const T = (contract as Contract).tuning;

/** Greedy bot: fetch light, bank it in the nearest unlit lantern, pulse when a shade is close. */
export function playBot(seed: number): {
  state: string;
  score: number;
  ticks: number;
  flames: number;
} {
  const sim = new Sim(T, seed);
  const inp: InputState = defaultInput();
  let toggle = false;
  while (sim.state === "playing") {
    const [px, , pz] = sim.pos;
    const unlit = sim.lanterns.filter((l) => !l.lit);
    const need = (l: { deposited: number }) => T.lantern_cost - l.deposited;
    const wantMore = sim.carried < Math.min(T.carry_capacity, Math.max(...unlit.map(need), 0));
    let tx: number, tz: number;
    const nearestL = unlit.reduce((a, b) =>
      Math.hypot(a.pos[0] - px, a.pos[2] - pz) < Math.hypot(b.pos[0] - px, b.pos[2] - pz) ? a : b,
    );
    if (sim.carried >= 1 && !wantMore) [tx, tz] = [nearestL.pos[0], nearestL.pos[2]];
    else if (sim.motes.length > 0) {
      const m = sim.motes.reduce((a, b) =>
        Math.hypot(a.pos[0] - px, a.pos[2] - pz) < Math.hypot(b.pos[0] - px, b.pos[2] - pz) ? a : b,
      );
      [tx, tz] = [m.pos[0], m.pos[2]];
    } else [tx, tz] = [nearestL.pos[0], nearestL.pos[2]];
    const dx = tx - px;
    const dz = tz - pz;
    const d = Math.hypot(dx, dz) || 1;
    inp.move = d < 0.05 ? [0, 0] : [dx / d, dz / d]; // yaw 0: x -> +X, z -> +Z
    toggle = !toggle;
    inp.interact =
      toggle && Math.hypot(nearestL.pos[0] - px, nearestL.pos[2] - pz) <= T.interact_radius;
    const danger = sim.shades.some(
      (s) =>
        s.state === "chase" && Math.hypot(s.pos[0] - px, s.pos[2] - pz) < T.shade_hit_radius + 2.5,
    );
    inp.pulse = toggle && danger && sim.carried >= T.pulse_cost;
    sim.step(inp);
  }
  return { state: sim.state, score: sim.score, ticks: sim.tick, flames: sim.flames };
}

describe("the level is winnable", () => {
  it("a simple greedy bot wins Night 1 on most seeds", () => {
    const results = Array.from({ length: 20 }, (_, i) => playBot(i + 1));
    const wins = results.filter((r) => r.state === "won");
    console.log(`bot wins ${wins.length}/20`, JSON.stringify(results.slice(0, 5)));
    expect(wins.length).toBeGreaterThanOrEqual(10);
  });
});
