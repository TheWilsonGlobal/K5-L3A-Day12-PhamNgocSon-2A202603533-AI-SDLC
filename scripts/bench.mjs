#!/usr/bin/env node
// TICKET-04 §1 Benchmark CLI:
//   node scripts/bench.mjs --seed 42 --duration 30 --out bench.json
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const webDist = resolve(root, "apps/web/dist");

let seed = 42;
let duration = 30;
let outPath = "bench.json";

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--seed") seed = Number(argv[++i]);
  else if (a === "--duration") duration = Number(argv[++i]);
  else if (a === "--out") outPath = argv[++i] ?? "";
  else {
    process.stderr.write(`unknown option: ${a}\n`);
    process.exit(1);
  }
}

if (!Number.isInteger(seed) || !Number.isFinite(duration) || duration <= 0 || !outPath) {
  process.stderr.write(
    "usage: node scripts/bench.mjs --seed <int> --duration <sec> --out <path>\n",
  );
  process.exit(2);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  throw new Error("Chrome/Chromium executable not found (set CHROME_BIN)");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(join(webDist, rel));
  if (!safePath.startsWith(webDist) || !existsSync(safePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = extname(safePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(readFileSync(safePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const httpPort = /** @type {{ port: number }} */ (server.address()).port;
const debugPort = 9400 + Math.floor(Math.random() * 400);
const prof = resolve(root, `out/bench-profile-${process.pid}`);
mkdirSync(prof, { recursive: true });

const chromeBin = findChrome();
const isWin = platform() === "win32";
const chromeArgs = [
  "--headless=new",
  ...(isWin ? ["--use-angle=d3d11"] : []),
  "--ignore-gpu-blocklist",
  "--enable-gpu-rasterization",
  "--disable-gpu-vsync",
  "--disable-frame-rate-limit",
  `--remote-debugging-port=${debugPort}`,
  "--window-size=1280,720",
  `--user-data-dir=${prof}`,
  "--autoplay-policy=no-user-gesture-required",
  "about:blank",
];

const procStartMs = performance.now();
const chrome = spawn(chromeBin, chromeArgs, { stdio: "ignore" });
const killChrome = () => {
  try {
    if (isWin) spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    else chrome.kill("SIGKILL");
  } catch {
    /* ignore */
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sampleChromeRssMb(pid) {
  try {
    if (isWin) {
      const out = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
        encoding: "utf8",
      }).stdout;
      const m = /"([\d,.\s]+)\s*K"/i.exec(out ?? "");
      if (m) {
        const kb = Number(m[1].replace(/[^\d]/g, ""));
        if (Number.isFinite(kb) && kb > 0) return Math.round((kb / 1024) * 10) / 10;
      }
    } else {
      const out = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).stdout;
      const kb = Number((out ?? "").trim());
      if (Number.isFinite(kb) && kb > 0) return Math.round((kb / 1024) * 10) / 10;
    }
  } catch {
    /* ignore */
  }
  return null;
}

let ws;
let id = 0;
const pend = new Map();

try {
  let pageTarget = null;
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      pageTarget = targets.find((t) => t.type === "page");
      if (pageTarget) break;
    } catch {
      /* wait */
    }
    await sleep(150);
  }
  if (!pageTarget) throw new Error("CDP page target did not appear");

  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) pend.get(d.id)(d);
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pend.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return r.result?.result?.value;
  };

  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const targetUrl = `http://127.0.0.1:${httpPort}/?bench=1&seed=${seed}&duration=${duration}&t0=${Math.round(procStartMs)}`;
  await send("Page.navigate", { url: targetUrl });

  let peakMemMb = sampleChromeRssMb(chrome.pid);
  let result = null;
  const maxWaitMs = (duration + 25) * 1000;
  const waitStart = performance.now();

  while (performance.now() - waitStart < maxWaitMs) {
    await sleep(250);
    const rss = sampleChromeRssMb(chrome.pid);
    if (rss !== null && (peakMemMb === null || rss > peakMemMb)) peakMemMb = rss;
    const state = await ev("window.__ddlBenchResult ?? null");
    if (state && state.done) {
      result = state;
      if (
        typeof state.js_heap_mb === "number" &&
        (peakMemMb === null || state.js_heap_mb > peakMemMb)
      ) {
        peakMemMb = state.js_heap_mb;
      }
      break;
    }
  }

  if (!result) throw new Error("Benchmark timed out waiting for window.__ddlBenchResult");

  const benchJson = {
    contract_version: "1.3",
    avg_fps: result.avg_fps,
    p1_low_fps: result.p1_low_fps,
    frame_ms_p95: result.frame_ms_p95,
    frames: result.frames,
    load_ms: Math.round(result.load_ms),
    peak_mem_mb: peakMemMb,
    vsync_off: true,
    renderer: `Three.js r175 / WebGL2 (${result.renderer || "GPU"})`,
    os: `${platform()} ${release()} (${arch()})`,
  };

  const absOut = resolve(process.cwd(), outPath);
  mkdirSync(dirname(absOut), { recursive: true });
  writeFileSync(absOut, JSON.stringify(benchJson, null, 2) + "\n", "utf8");
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  killChrome();
  server.close();
  try {
    rmSync(prof, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
process.exit(0);
