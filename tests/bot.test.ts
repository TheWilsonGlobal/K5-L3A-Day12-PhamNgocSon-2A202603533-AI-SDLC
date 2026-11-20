import { describe, expect, it } from "vitest";
import contract from "../game.contract.json" with { type: "json" };
import { Sim, defaultInput, type Contract, type InputState } from "../packages/sim/src/index.ts";

const T = (contract as Contract).tuning;

/**
 * Greedy Night 1 bot: collect up to 10 fireflies, bank them in the nearest unlit lantern,
 * dash out of trouble and pulse when a Shade gets close.
 */
export function playBot(seed: number): {
  state: string;
  score: number;
  ticks: number;
  flames: number;
} {
  const sim = new Sim(T, seed, {}, 1);
  const inp: InputState = defaultInput();
  let toggle = false;
  while (!sim.outcome && sim.simTick < 400 * 60) {
    const [px, , pz] = sim.pos;
    const unlit = sim.lanterns.filter((l) => !l.lit);
    const dist = (p: number[]) => Math.hypot(p[0]! - px, p[2]! - pz);
    const nearestL = unlit.reduce((a, b) => (dist(a.pos) < dist(b.pos) ? a : b));
    const needed = Math.min(T.carry_capacity, T.lantern_cost - nearestL.deposited);
    let target: number[];
    if (sim.carried >= needed || sim.motes.length === 0) target = nearestL.pos;
    else target = sim.motes.reduce((a, b) => (dist(a.pos) < dist(b.pos) ? a : b)).pos;
    // head for the target, bend away from nearby Shades, and use Lướt / Tỏa Sáng when one gets close
    let mx = target[0]! - px;
    let mz = target[2]! - pz;
    const dl = Math.hypot(mx, mz) || 1;
    mx /= dl;
    mz /= dl;
    let nearest = Infinity;
    for (const s of sim.shades) {
      if (s.state === "stunned" || s.state === "spawning") continue;
      const sx = px - s.pos[0];
      const sz = pz - s.pos[2];
      const sd = Math.hypot(sx, sz) || 0.01;
      nearest = Math.min(nearest, sd);
      if (sd < 7) {
        const w = ((7 - sd) / 7) * 2.2;
        mx += (sx / sd) * w;
        mz += (sz / sd) * w;
      }
    }
    const ml = Math.hypot(mx, mz) || 1;
    inp.move = dl < 0.05 && nearest > 7 ? [0, 0] : [mx / ml, mz / ml]; // yaw 0: x -> +X, z -> +Z
    toggle = !toggle;
    inp.interact = toggle && dist(nearestL.pos) <= T.interact_radius;
    inp.pulse = toggle && nearest < 4 && sim.carried >= T.pulse_cost;
    inp.dash = toggle && nearest < 2.2 && nearest >= 0;
    sim.step(inp);
  }
  return {
    state: sim.outcome ?? "playing",
    score: sim.score,
    ticks: sim.simTick,
    flames: sim.flames,
  };
}

describe("Night 1 is winnable", () => {
  it("a crude dodging bot still wins on some seeds (the level is beatable, and not trivially)", () => {
    const results = Array.from({ length: 20 }, (_, i) => playBot(i + 1));
    const wins = results.filter((r) => r.state === "won");
    console.log(`bot wins ${wins.length}/20`, JSON.stringify(results.slice(0, 5)));
    expect(wins.length).toBeGreaterThanOrEqual(1);
    expect(wins.length).toBeLessThan(20);
  });
  it("and standing still loses", () => {
    const sim = new Sim(T, 1, {}, 1);
    const inp = defaultInput();
    while (!sim.outcome) sim.step(inp);
    expect(sim.outcome).toBe("lost");
  });
});
