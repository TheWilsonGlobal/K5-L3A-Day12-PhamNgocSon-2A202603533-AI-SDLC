export type KeyAction =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "dash"
  | "interact"
  | "pulse"
  | "pause";

export type KeyBindings = Record<KeyAction, string>;

export const DEFAULT_KEYS: KeyBindings = {
  moveUp: "KeyW",
  moveDown: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  jump: "Space",
  dash: "ShiftLeft",
  interact: "KeyE",
  pulse: "KeyF",
  pause: "KeyP",
};

export const KEY_ACTION_LIST: { id: KeyAction; label: string }[] = [
  { id: "moveUp", label: "Đi lên (Tiến)" },
  { id: "moveDown", label: "Đi xuống (Lùi)" },
  { id: "moveLeft", label: "Sang trái" },
  { id: "moveRight", label: "Sang phải" },
  { id: "jump", label: "Nhảy" },
  { id: "dash", label: "Lướt" },
  { id: "interact", label: "Tương tác / Nạp đèn" },
  { id: "pulse", label: "Tỏa Sáng" },
  { id: "pause", label: "Tạm dừng" },
];

export function formatKeyCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = {
    Space: "Space",
    ShiftLeft: "Shift",
    ShiftRight: "R-Shift",
    ControlLeft: "Ctrl",
    ControlRight: "R-Ctrl",
    AltLeft: "Alt",
    AltRight: "R-Alt",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Escape: "Esc",
    Enter: "Enter",
    Tab: "Tab",
  };
  return map[code] ?? code;
}

/** Returns groups of actions that share the exact same key code. */
export function findKeyConflicts(keys: KeyBindings): { code: string; actions: KeyAction[] }[] {
  const byCode = new Map<string, KeyAction[]>();
  for (const { id } of KEY_ACTION_LIST) {
    const code = keys[id];
    const list = byCode.get(code) ?? [];
    list.push(id);
    byCode.set(code, list);
  }
  const conflicts: { code: string; actions: KeyAction[] }[] = [];
  for (const [code, actions] of byCode) {
    if (actions.length > 1) conflicts.push({ code, actions });
  }
  return conflicts;
}

export interface Settings {
  /** 0..1 master volume. */
  volume: number;
  /** Mouse drag sensitivity multiplier. */
  sensitivity: number;
  /** "Bảng màu dễ phân biệt": colour-blind-friendly palette. */
  colorBlind: boolean;
  /** "Giảm chuyển động": disable camera shake and screen flash. */
  reduceMotion: boolean;
  /** "Chữ lớn (×1.25)": scale UI text by 1.25x. */
  largeText: boolean;
  /** Remappable key bindings for all 9 actions. */
  keys: KeyBindings;
}

const KEY = "ddl.settings.v2";
const DEFAULTS: Settings = {
  volume: 0.7,
  sensitivity: 1,
  colorBlind: false,
  reduceMotion: false,
  largeText: false,
  keys: { ...DEFAULT_KEYS },
};

const clamp = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

function loadKeys(raw: unknown): KeyBindings {
  const out: KeyBindings = { ...DEFAULT_KEYS };
  if (raw && typeof raw === "object") {
    for (const { id } of KEY_ACTION_LIST) {
      const v = (raw as Record<string, unknown>)[id];
      if (typeof v === "string" && v.length > 0) out[id] = v;
    }
  }
  return out;
}

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
        reduceMotion: o.reduceMotion === true,
        largeText: o.largeText === true,
        keys: loadKeys(o.keys),
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS, keys: { ...DEFAULT_KEYS } };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
