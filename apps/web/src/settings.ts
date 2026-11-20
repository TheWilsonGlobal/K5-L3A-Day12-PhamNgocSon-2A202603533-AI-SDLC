export interface Settings {
  /** 0..1 master volume. */
  volume: number;
  /** Mouse drag sensitivity multiplier. */
  sensitivity: number;
  /** "Bảng màu dễ phân biệt": colour-blind-friendly palette. */
  colorBlind: boolean;
}

const KEY = "ddl.settings.v2";
const DEFAULTS: Settings = { volume: 0.7, sensitivity: 1, colorBlind: false };

const clamp = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Settings survive reloads (localStorage); a blocked or empty store just gives the defaults. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Settings>;
      return {
        volume: clamp(o.volume, 0, 1, DEFAULTS.volume),
        sensitivity: clamp(o.sensitivity, 0.2, 3, DEFAULTS.sensitivity),
        colorBlind: o.colorBlind === true,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
