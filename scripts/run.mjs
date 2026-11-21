#!/usr/bin/env node
// TICKET-04 §3 & §6 Unified run_cmd:
// - `node scripts/run.mjs --export-leaderboard out.json` -> exports {"entries": [...]} from local disk and exits 0
// - `node scripts/run.mjs` -> serves apps/web/dist + /api/leaderboard backed by .data/leaderboard.json
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addLeaderboardEntry, normalizeLeaderboardFile } from "../apps/headless/dist/sim.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const storePath = resolve(root, ".data/leaderboard.json");
const webDist = resolve(root, "apps/web/dist");

function loadStore() {
  try {
    if (existsSync(storePath)) {
      return normalizeLeaderboardFile(JSON.parse(readFileSync(storePath, "utf8")));
    }
  } catch {
    /* fallback to empty */
  }
  return { entries: [] };
}

function saveStore(data) {
  const norm = normalizeLeaderboardFile(data);
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(norm, null, 2) + "\n", "utf8");
  return norm;
}

const argv = process.argv.slice(2);
let exportPath = null;
let port = Number(process.env.PORT || 5173);

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--export-leaderboard") {
    exportPath = argv[++i] ?? "";
  } else if (a === "--port") {
    port = Number(argv[++i]);
  }
}

if (exportPath !== null) {
  if (!exportPath) {
    process.stderr.write("usage: node scripts/run.mjs --export-leaderboard <out.json>\n");
    process.exit(2);
  }
  const store = loadStore();
  const absOut = resolve(process.cwd(), exportPath);
  mkdirSync(dirname(absOut), { recursive: true });
  writeFileSync(absOut, JSON.stringify({ entries: store.entries }, null, 2) + "\n", "utf8");
  process.exit(0);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/api/leaderboard") {
    if (req.method === "GET") {
      const store = loadStore();
      res.writeHead(200, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
      res.end(JSON.stringify(store));
      return;
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body);
          const current = loadStore();
          const entries = addLeaderboardEntry(current.entries, payload);
          const saved = saveStore({ entries });
          res.writeHead(200, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
          res.end(JSON.stringify(saved));
        } catch (err) {
          res.writeHead(400, { "Content-Type": MIME[".json"] });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
      return;
    }
  }

  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(join(webDist, rel));
  if (!safePath.startsWith(webDist) || !existsSync(safePath)) {
    const indexHtml = join(webDist, "index.html");
    if (existsSync(indexHtml)) {
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      res.end(readFileSync(indexHtml));
    } else {
      res.writeHead(404);
      res.end("Not found (run pnpm build first)");
    }
    return;
  }
  const ext = extname(safePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(readFileSync(safePath));
});

server.listen(port, "127.0.0.1", () => {
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  console.log(`Đảo Đèn Lồng running at http://127.0.0.1:${actualPort}`);
});
