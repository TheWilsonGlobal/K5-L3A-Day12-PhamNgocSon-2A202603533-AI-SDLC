import { durationKey } from "./maps.ts";
import { makeRng } from "./rng.ts";
import { Sim, TICK_RATE, defaultInput } from "./sim.ts";
import type { Tuning } from "./types.ts";

export interface BenchMetrics {
  frames: number;
  avg_fps: number;
  p1_low_fps: number;
  frame_ms_p95: number;
}

const r1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * TICKET-04 §1 exact benchmark metric definitions:
 * - frames: N
 * - avg_fps: 1000 * N / sum(dt_i)
 * - p1_low_fps: k = max(1, ceil(0.01 * N)); mean of k largest dt_i; 1000 / mean
 * - frame_ms_p95: 95th percentile of dt_i (ms)
 */
export function computeBenchMetrics(dtsMs: readonly number[]): BenchMetrics {
  const N = dtsMs.length;
  if (N === 0) {
    return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  }
  let sum = 0;
  for (let i = 0; i < N; i++) sum += dtsMs[i]!;
  const avgFps = sum > 0 ? (1000 * N) / sum : 0;

  const sortedDesc = [...dtsMs].sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil(0.01 * N));
  let slowSum = 0;
  for (let i = 0; i < k; i++) slowSum += sortedDesc[i]!;
  const meanSlow = slowSum / k;
  const p1LowFps = meanSlow > 0 ? 1000 / meanSlow : 0;

  const sortedAsc = [...dtsMs].sort((a, b) => a - b);
  const idx95 = Math.min(N - 1, Math.max(0, Math.ceil(0.95 * N) - 1));
  const p95 = sortedAsc[idx95]!;

  return {
    frames: N,
    avg_fps: r1(avgFps),
    p1_low_fps: r1(p1LowFps),
    frame_ms_p95: r1(p95),
  };
}

/**
 * Runs a single soak night with seeded random inputs (TICKET-04 §2):
 * - Every 30 ticks choose a new move direction.
 * - Each tick: 5% jump, 3% dash, 2% pulse, 10% interact.
 */
export function runSoakNight(
  tuning: Tuning,
  seed: number,
  night: 1 | 2 | 3,
  onLoaded?: (sim: Sim) => void,
): "won" | "lost" {
  const sim = new Sim(tuning, seed, {}, night);
  onLoaded?.(sim);
  const rng = makeRng(seed ^ 0x534f414b);
  const maxTicks = Math.round(tuning[durationKey(night)] * TICK_RATE) + 10;
  let move: [number, number] = [0, 1];
  for (let t = 0; t < maxTicks && sim.outcome === null; t++) {
    if (t % 30 === 0) {
      const angle = rng() * 2 * Math.PI;
      move = [Math.cos(angle), Math.sin(angle)];
    }
    const input = defaultInput();
    input.move = move;
    input.jump = rng() < 0.05;
    input.dash = rng() < 0.03;
    input.pulse = rng() < 0.02;
    input.interact = rng() < 0.1;
    sim.step(input);
  }
  return sim.outcome ?? "lost";
}
