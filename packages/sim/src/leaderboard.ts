import { InputError, type LeaderboardEntry, type LeaderboardFile } from "./types.ts";

export const LEADERBOARD_MAX = 10;
const NAME_RE = /^[A-Za-z0-9_]{3,12}$/;

export function isValidLeaderboardName(name: string): boolean {
  return typeof name === "string" && NAME_RE.test(name);
}

export function sortAndTrimLeaderboard(
  entries: readonly LeaderboardEntry[],
  max = LEADERBOARD_MAX,
): LeaderboardEntry[] {
  const indexed = entries.map((e, idx) => ({ e, idx }));
  indexed.sort((a, b) => {
    if (b.e.score !== a.e.score) return b.e.score - a.e.score;
    const ta = Date.parse(a.e.achieved_at);
    const tb = Date.parse(b.e.achieved_at);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.idx - b.idx;
  });
  return indexed.slice(0, max).map((x) => ({ ...x.e }));
}

export function validateLeaderboardEntry(entry: LeaderboardEntry): LeaderboardEntry {
  if (!isValidLeaderboardName(entry.name)) {
    throw new InputError(
      `invalid leaderboard name "${String(entry.name)}" (expected 3-12 [A-Za-z0-9_])`,
    );
  }
  if (typeof entry.score !== "number" || !Number.isFinite(entry.score) || entry.score < 0) {
    throw new InputError(`invalid leaderboard score "${String(entry.score)}"`);
  }
  if (
    typeof entry.nights_won !== "number" ||
    !Number.isInteger(entry.nights_won) ||
    entry.nights_won < 0 ||
    entry.nights_won > 3
  ) {
    throw new InputError(`invalid leaderboard nights_won "${String(entry.nights_won)}"`);
  }
  if (typeof entry.achieved_at !== "string" || Number.isNaN(Date.parse(entry.achieved_at))) {
    throw new InputError(`invalid leaderboard achieved_at "${String(entry.achieved_at)}"`);
  }
  if (typeof entry.seed !== "number" || !Number.isFinite(entry.seed)) {
    throw new InputError(`invalid leaderboard seed "${String(entry.seed)}"`);
  }
  return {
    name: entry.name,
    score: Math.round(entry.score),
    nights_won: entry.nights_won,
    achieved_at: entry.achieved_at,
    seed: entry.seed | 0,
  };
}

export function addLeaderboardEntry(
  existing: readonly LeaderboardEntry[],
  entry: LeaderboardEntry,
): LeaderboardEntry[] {
  const valid = validateLeaderboardEntry(entry);
  return sortAndTrimLeaderboard([...existing, valid], LEADERBOARD_MAX);
}

export function normalizeLeaderboardFile(raw: unknown): LeaderboardFile {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as LeaderboardFile).entries)) {
    return { entries: [] };
  }
  const clean: LeaderboardEntry[] = [];
  for (const item of (raw as LeaderboardFile).entries) {
    try {
      clean.push(validateLeaderboardEntry(item as LeaderboardEntry));
    } catch {
      // skip malformed legacy items
    }
  }
  return { entries: sortAndTrimLeaderboard(clean, LEADERBOARD_MAX) };
}
