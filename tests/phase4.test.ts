import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InputError,
  LEADERBOARD_MAX,
  Sim,
  addLeaderboardEntry,
  computeBenchMetrics,
  defaultInput,
  isValidLeaderboardName,
  normalizeLeaderboardFile,
  runSoakNight,
  type Contract,
  type LeaderboardEntry,
} from "../packages/sim/src/index.ts";
import rawContract from "../game.contract.json";

const contract = rawContract as Contract;
const T = contract.tuning;

describe("Contract v1.3", () => {
  it("declares contract_version 1.3 and required bench_cmd / soak_cmd / run_cmd", () => {
    expect(contract.contract_version).toBe("1.3");
    expect(contract.bench_cmd).toBeTruthy();
    expect(contract.soak_cmd).toBeTruthy();
    expect(contract.run_cmd).toBeTruthy();
    expect(contract.headless_cmd).toBeTruthy();
  });
});

describe("Benchmark scene & metric formulas (TICKET-04 §1)", () => {
  it("Sim.createBench sets up 200 wandering shades, 100 motes, and L1-L3 lit at fuel 100", () => {
    const sim = Sim.createBench(T, 42);
    const snap0 = sim.snapshot();
    expect(snap0.night).toBe(1);
    expect(snap0.player.pos).toEqual([0, 0, 0]);
    expect(snap0.shades.length).toBe(200);
    expect(snap0.shades.every((s) => s.state === "wander")).toBe(true);
    expect(snap0.motes.length).toBe(100);
    expect(snap0.lanterns.filter((l) => l.lit).map((l) => l.id)).toEqual(["L1", "L2", "L3"]);
    expect(snap0.lanterns.slice(0, 3).every((l) => l.fuel === 100)).toBe(true);
  });

  it("Bench scene disables fuel decay, mote pickup, damage, new spawns, and game_over while shades wander", () => {
    const sim = Sim.createBench(T, 42);
    const initialPos0 = [...sim.shades[0]!.pos];
    for (let t = 0; t < 600; t++) {
      const ev = sim.step(defaultInput());
      expect(ev.length).toBe(0);
    }
    const snap = sim.snapshot();
    expect(snap.player.pos).toEqual([0, 0, 0]);
    expect(snap.player.flames).toBe(3);
    expect(snap.player.carried).toBe(0);
    expect(snap.motes.length).toBe(100);
    expect(snap.shades.length).toBe(200);
    expect(snap.shades.every((s) => s.state === "wander")).toBe(true);
    expect(snap.lanterns.slice(0, 3).every((l) => l.lit && l.fuel === 100)).toBe(true);
    expect(snap.state).toBe("playing");
    const afterPos0 = sim.shades[0]!.pos;
    expect(
      Math.hypot(afterPos0[0] - initialPos0[0], afterPos0[2] - initialPos0[2]),
    ).toBeGreaterThan(0.1);
  });

  it("computeBenchMetrics matches exact avg_fps, p1_low_fps, and frame_ms_p95 formulas", () => {
    // 100 frames: 98 frames at 10 ms (100 FPS), 1 frame at 20 ms, 1 frame at 40 ms
    const dts = [...Array.from({ length: 98 }, () => 10), 20, 40];
    const m = computeBenchMetrics(dts);
    expect(m.frames).toBe(100);
    // sum = 980 + 60 = 1040 ms -> avg_fps = 100000 / 1040 = 96.1538 -> 96.2
    expect(m.avg_fps).toBe(96.2);
    // k = max(1, ceil(0.01 * 100)) = 1 -> largest dt = 40 ms -> p1_low_fps = 1000 / 40 = 25
    expect(m.p1_low_fps).toBe(25);
    // 95th percentile of sorted dts (index 94) is 10 ms
    expect(m.frame_ms_p95).toBe(10);
  });
});

describe("Soak test (TICKET-04 §2)", () => {
  it("runSoakNight runs deterministically and completes without crashing", () => {
    const r1 = runSoakNight(T, 7, 1);
    const r2 = runSoakNight(T, 7, 1);
    expect(r1).toBe(r2);
    expect(["won", "lost"]).toContain(r1);
  });

  it("scripts/soak.mjs runs multiple nights in a single process within memory threshold", () => {
    const dir = mkdtempSync(join(tmpdir(), "ddl-soak-"));
    const out = join(dir, "soak.json");
    try {
      execFileSync("node", [
        resolve("scripts/soak.mjs"),
        "--seed",
        "7",
        "--nights",
        "3",
        "--out",
        out,
      ]);
      const data = JSON.parse(readFileSync(out, "utf8"));
      expect(data.nights).toBe(3);
      expect(data.crashes).toBe(0);
      expect(data.results).toHaveLength(3);
      expect(data.mem_start_mb).toBeGreaterThan(0);
      expect(data.mem_end_mb).toBeLessThanOrEqual(data.mem_start_mb * 1.2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Local leaderboard & --export-leaderboard (TICKET-04 §3)", () => {
  it("validates 3-12 char [A-Za-z0-9_] names", () => {
    expect(isValidLeaderboardName("May_01")).toBe(true);
    expect(isValidLeaderboardName("ABC")).toBe(true);
    expect(isValidLeaderboardName("A23456789012")).toBe(true);
    expect(isValidLeaderboardName("ab")).toBe(false);
    expect(isValidLeaderboardName("A234567890123")).toBe(false);
    expect(isValidLeaderboardName("May-01")).toBe(false);
    expect(isValidLeaderboardName("May 01")).toBe(false);
  });

  it("sorts by score descending, ties by earlier achieved_at first, and keeps top 10", () => {
    const entries: LeaderboardEntry[] = [];
    for (let i = 1; i <= 12; i++) {
      entries.push({
        name: `Player_${String(i).padStart(2, "0")}`,
        score: i * 100,
        nights_won: i % 4,
        achieved_at: `2026-11-20T12:${String(i).padStart(2, "0")}:00.000Z`,
        seed: 42 + i,
      });
    }
    // Add a tie for 1200 points achieved earlier
    const withTie = addLeaderboardEntry(entries, {
      name: "EarlyChamp",
      score: 1200,
      nights_won: 3,
      achieved_at: "2026-11-20T10:00:00.000Z",
      seed: 99,
    });
    expect(withTie).toHaveLength(LEADERBOARD_MAX);
    expect(withTie[0]!.name).toBe("EarlyChamp");
    expect(withTie[1]!.name).toBe("Player_12");
    expect(withTie[9]!.score).toBe(400);
  });

  it("rejects invalid leaderboard entries with InputError", () => {
    expect(() =>
      addLeaderboardEntry([], {
        name: "x",
        score: 100,
        nights_won: 1,
        achieved_at: new Date().toISOString(),
        seed: 1,
      }),
    ).toThrow(InputError);
  });

  it("run_cmd --export-leaderboard writes sorted top-10 JSON and exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "ddl-lb-"));
    const out = join(dir, "out.json");
    const storePath = resolve(".data/leaderboard.json");
    const hadStore = (() => {
      try {
        return readFileSync(storePath, "utf8");
      } catch {
        return null;
      }
    })();
    try {
      mkdirSync(resolve(".data"), { recursive: true });
      const sample = normalizeLeaderboardFile({
        entries: [
          {
            name: "Son_02",
            score: 850,
            nights_won: 2,
            achieved_at: "2026-11-20T15:00:00+07:00",
            seed: 102,
          },
          {
            name: "Son_01",
            score: 1420,
            nights_won: 3,
            achieved_at: "2026-11-20T14:00:00+07:00",
            seed: 101,
          },
        ],
      });
      writeFileSync(storePath, JSON.stringify(sample, null, 2));
      execFileSync("node", [resolve("scripts/run.mjs"), "--export-leaderboard", out]);
      const exported = JSON.parse(readFileSync(out, "utf8"));
      expect(exported.entries).toHaveLength(2);
      expect(exported.entries[0].name).toBe("Son_01");
      expect(exported.entries[1].name).toBe("Son_02");
    } finally {
      if (hadStore !== null) writeFileSync(storePath, hadStore);
      else rmSync(storePath, { force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
