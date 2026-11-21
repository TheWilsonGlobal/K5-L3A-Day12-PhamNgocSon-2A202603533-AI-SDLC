#!/usr/bin/env node
// TICKET-04 §2 Soak test CLI:
//   node scripts/soak.mjs --seed 7 --nights 10 --out soak.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSoakNight } from "../apps/headless/dist/sim.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const contract = JSON.parse(readFileSync(resolve(root, "game.contract.json"), "utf8"));

let seed = 7;
let nights = 10;
let outPath = "soak.json";

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--seed") {
    seed = Number(argv[++i]);
  } else if (a === "--nights") {
    nights = Number(argv[++i]);
  } else if (a === "--out") {
    outPath = argv[++i] ?? "";
  } else {
    process.stderr.write(`unknown option: ${a}\n`);
    process.exit(1);
  }
}

if (!Number.isInteger(seed) || !Number.isInteger(nights) || nights <= 0 || !outPath) {
  process.stderr.write("usage: node scripts/soak.mjs --seed <int> --nights <int> --out <path>\n");
  process.exit(2);
}

const rssMb = () => Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;

const t0 = performance.now();
let memStartMb = 0;
let crashes = 0;
const results = [];

for (let i = 0; i < nights; i++) {
  const nightNo = /** @type {1 | 2 | 3} */ ((i % 3) + 1);
  const nightSeed = seed + i;
  try {
    const res = runSoakNight(contract.tuning, nightSeed, nightNo, () => {
      if (i === 0) memStartMb = rssMb();
    });
    results.push(res);
  } catch (err) {
    crashes += 1;
    results.push("lost");
    process.stderr.write(
      `soak night ${i + 1} crashed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

const memEndMb = rssMb();
const durationS = Math.round(((performance.now() - t0) / 1000) * 10) / 10;

const payload = {
  nights,
  crashes,
  results,
  mem_start_mb: memStartMb,
  mem_end_mb: memEndMb,
  duration_s: durationS,
};

const absOut = resolve(process.cwd(), outPath);
mkdirSync(dirname(absOut), { recursive: true });
writeFileSync(absOut, JSON.stringify(payload, null, 2) + "\n", "utf8");
process.exit(crashes === 0 ? 0 : 1);
