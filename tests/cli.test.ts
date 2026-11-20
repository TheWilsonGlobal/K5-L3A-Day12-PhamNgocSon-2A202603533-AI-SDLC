import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "..", "apps", "headless", "dist", "headless.js");
const dir = mkdtempSync(join(tmpdir(), "ddl-"));

function cli(args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status, stderr: r.stderr };
}
const f = (name: string, content: unknown) => {
  const p = join(dir, name);
  writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  return p;
};

describe("headless CLI (built bundle)", () => {
  it("exit 0 and a valid JSONL file", () => {
    const out = join(dir, "ok.jsonl");
    const r = cli(["--seed", "3", "--night", "1", "--ticks", "100", "--out", out]);
    expect(r.code).toBe(0);
    const lines = readFileSync(out, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0].type).toBe("snapshot");
    expect(lines[0].tick).toBe(0);
    expect(lines.at(-1)).toMatchObject({ type: "end", ticks: 100, state: "playing" });
  });

  it("is byte-for-byte deterministic across processes", () => {
    const inputs = f("in.json", {
      frames: [
        { tick: 0, move: [0, 1] },
        { tick: 300, pulse: true },
      ],
    });
    const a = join(dir, "a.jsonl");
    const b = join(dir, "b.jsonl");
    for (const o of [a, b]) {
      expect(
        cli(["--seed", "42", "--night", "1", "--ticks", "2000", "--inputs", inputs, "--out", o])
          .code,
      ).toBe(0);
    }
    expect(readFileSync(a, "utf8")).toBe(readFileSync(b, "utf8"));
  });

  it("honours --snapshot-every, --scenario and --inputs", () => {
    const sc = f("sc.json", {
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 1]],
      shades: [],
    });
    const out = join(dir, "s.jsonl");
    const r = cli([
      "--seed",
      "1",
      "--night",
      "1",
      "--scenario",
      sc,
      "--ticks",
      "30",
      "--snapshot-every",
      "15",
      "--out",
      out,
    ]);
    expect(r.code).toBe(0);
    const lines = readFileSync(out, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.filter((l) => l.type === "snapshot").map((l) => l.tick)).toEqual([0, 15, 30]);
    expect(lines.find((l) => l.name === "mote_picked")).toMatchObject({ tick: 1 });
  });

  it("exit 2 + stderr for malformed inputs / scenario", () => {
    const base = ["--seed", "1", "--night", "1", "--ticks", "10", "--out", join(dir, "x.jsonl")];
    const badTicks = f("bad1.json", { frames: [{ tick: 4 }, { tick: 4 }] });
    const notJson = f("bad2.json", "{nope");
    const badScenario = f("bad3.json", { motes: "many" });
    for (const [flag, file] of [
      ["--inputs", badTicks],
      ["--inputs", notJson],
      ["--scenario", badScenario],
      ["--scenario", join(dir, "missing.json")],
    ] as const) {
      const r = cli([...base, flag, file]);
      expect(r.code, `${flag} ${file}`).toBe(2);
      expect(r.stderr).toMatch(/error:/);
    }
  });

  it("nonzero (not 2) for usage errors", () => {
    expect(cli(["--seed", "1", "--ticks", "5"]).code).toBe(1);
    expect(
      cli(["--seed", "x", "--night", "1", "--ticks", "5", "--out", join(dir, "y.jsonl")]).code,
    ).toBe(1);
    expect(
      cli(["--seed", "1", "--night", "2", "--ticks", "5", "--out", join(dir, "y.jsonl")]).code,
    ).toBe(1);
  });

  it("is fast: a full 5-minute night (18000 ticks) in well under 2 s", () => {
    const sc = f("nosh.json", { random_shades: false, shades: [] });
    const t = Date.now();
    expect(
      cli([
        "--seed",
        "1",
        "--night",
        "1",
        "--scenario",
        sc,
        "--ticks",
        "18000",
        "--snapshot-every",
        "60",
        "--out",
        join(dir, "full.jsonl"),
      ]).code,
    ).toBe(0);
    expect(Date.now() - t).toBeLessThan(2000);
    const endLine = readFileSync(join(dir, "full.jsonl"), "utf8").trim().split("\n").at(-1)!;
    expect(JSON.parse(endLine).ticks).toBe(18000);
  });
});
