import { readFileSync, writeFileSync } from "node:fs";
import { InputError, parseInputs, parseScenario, runHeadless, type Contract } from "@ddl/sim";
import contract from "../../../game.contract.json" with { type: "json" };

const USAGE =
  "usage: headless --seed <int> --night 1 [--scenario <file.json>] [--inputs <file.json>] " +
  "--ticks <int> --out <file.jsonl> [--snapshot-every <int>]";

function fail(code: number, msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) fail(1, `unexpected argument "${a}"\n${USAGE}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) fail(1, `missing value for ${a}\n${USAGE}`);
    m.set(a.slice(2), v);
    i++;
  }
  return m;
}

function int(args: Map<string, string>, name: string, opts: { min: number; def?: number }): number {
  const raw = args.get(name);
  if (raw === undefined) {
    if (opts.def !== undefined) return opts.def;
    fail(1, `--${name} is required\n${USAGE}`);
  }
  if (!/^-?\d+$/.test(raw)) fail(1, `--${name} must be an integer, got "${raw}"`);
  const n = Number(raw);
  if (n < opts.min) fail(1, `--${name} must be >= ${opts.min}`);
  return n;
}

function readJson(path: string, what: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    fail(2, `cannot read ${what} file "${path}": ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(2, `${what} file "${path}" is not valid JSON: ${(e as Error).message}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const seed = int(args, "seed", { min: -2147483648 });
const night = int(args, "night", { min: 1 });
if (night !== 1) fail(1, "only --night 1 exists in phase 1");
const ticks = int(args, "ticks", { min: 0 });
const every = int(args, "snapshot-every", { min: 1, def: 10 });
const out = args.get("out");
if (!out) fail(1, `--out is required\n${USAGE}`);

try {
  const scenarioPath = args.get("scenario");
  const inputsPath = args.get("inputs");
  const scenario = scenarioPath ? parseScenario(readJson(scenarioPath, "scenario")) : undefined;
  const inputs = inputsPath ? parseInputs(readJson(inputsPath, "inputs")) : undefined;
  const lines = runHeadless({
    tuning: (contract as Contract).tuning,
    seed,
    ticks,
    snapshotEvery: every,
    scenario,
    inputs,
  });
  writeFileSync(out, lines.join("\n") + "\n");
} catch (e) {
  if (e instanceof InputError) fail(2, e.message);
  fail(1, (e as Error).message);
}
