import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addLeaderboardEntry, normalizeLeaderboardFile, type LeaderboardEntry } from "@ddl/sim";

const here = dirname(fileURLToPath(import.meta.url));
const storePath = resolve(here, "../../.data/leaderboard.json");

function loadStore() {
  try {
    if (existsSync(storePath)) {
      return normalizeLeaderboardFile(JSON.parse(readFileSync(storePath, "utf8")));
    }
  } catch {
    /* ignore */
  }
  return { entries: [] };
}

function saveStore(entries: LeaderboardEntry[]) {
  const norm = normalizeLeaderboardFile({ entries });
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(norm, null, 2) + "\n", "utf8");
  return norm;
}

export default {
  plugins: [
    {
      name: "ddl-local-leaderboard",
      configureServer(server: {
        middlewares: {
          use: (
            fn: (
              req: {
                url?: string;
                method?: string;
                on: (e: string, cb: (c?: unknown) => void) => void;
              },
              res: {
                writeHead: (code: number, h: Record<string, string>) => void;
                end: (s: string) => void;
              },
              next: () => void,
            ) => void,
          ) => void;
        };
      }) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/api/leaderboard")) {
            next();
            return;
          }
          if (req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(loadStore()));
            return;
          }
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += String(chunk ?? "")));
            req.on("end", () => {
              try {
                const payload = JSON.parse(body) as LeaderboardEntry;
                const current = loadStore();
                const updated = addLeaderboardEntry(current.entries, payload);
                const saved = saveStore(updated);
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify(saved));
              } catch (err) {
                res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
                res.end(
                  JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
                );
              }
            });
            return;
          }
          next();
        });
      },
    },
  ],
};
