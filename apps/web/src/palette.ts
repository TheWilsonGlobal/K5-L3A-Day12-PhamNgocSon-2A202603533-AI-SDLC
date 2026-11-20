/** Standard palette of TICKET-02 (max 10% deviation per RGB channel). */
const BASE = {
  sky: 0x0e1430,
  mist: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  cloudSea: 0x12384a,
  lanternOn: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternOff: 0x5b5f6e,
  moteCore: 0xfff6c2,
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeRim: 0x7a3cff,
  shadeStun: 0x3a3450,
  robe: 0xe8e2d0,
  scarf: 0xc8102e,
  gold: 0xf2c14e,
  drifter: 0x8fa3b8,
  danger: 0xff5a5f,
  text: 0xf5f1e6,
  // shade look (rim / eyes / glow); a colour-blind palette swaps these without touching logic
  shadeDrain: 0xe05cff,
  shadeStunGlow: 0x5aa8ff,
  shadeEye: 0xf1eaff,
  shadeEyeStun: 0x9ad0ff,
  shadeInkEmit: 0x24104a,
  shadeInkEmitStun: 0x103a78,
  shadeWispEmit: 0x3a1a78,
  shadeWispEmitStun: 0x1a4a90,
  // lantern fuel bar and minimap
  fuelTrack: 0x2a2f4a,
  fuelFill: 0xffb347,
  mapUnlit: 0x2a2f4a,
  mapShadeStun: 0x6a6a98,
  mapMote: 0xfff6a0,
  mapMoteBack: 0x1c2440,
  mapLanternRimOn: 0xfff3c8,
  mapLanternRimOff: 0xe4e8ff,
  mapLanternTextOn: 0x3a2200,
  mapLanternTextOff: 0xd8d8e8,
  mapPlayer: 0xffffff,
  // torn paper patch on an unlit lantern (a shape cue, not a colour cue)
  lanternTear: 0x07080f,
} as const;

type Tokens = { -readonly [K in keyof typeof BASE]: number };

/** Live palette: read tokens at draw time (never cache them at module load) so a switch applies at once. */
export const PAL: Tokens = { ...BASE };

/**
 * "Bảng màu dễ phân biệt": shade rim and eyes violet -> blue, UI warning red -> white.
 * The shade's other states are moved off the blue/violet axis so chase, stun and drain stay apart.
 */
const COLOR_BLIND: Partial<Tokens> = {
  shadeRim: 0x00b3ff,
  danger: 0xffffff,
  shadeEye: 0x00b3ff,
  shadeEyeStun: 0xffffff,
  shadeDrain: 0xffd400,
  shadeStunGlow: 0xd8dce8,
  shadeInkEmit: 0x06344f,
  shadeInkEmitStun: 0x30343e,
  shadeWispEmit: 0x0a4466,
  shadeWispEmitStun: 0x3a4050,
};

let colorBlind = false;
const listeners: Array<() => void> = [];

export const isColorBlind = (): boolean => colorBlind;

/** Run `fn` after every palette switch (including the boot-time one). */
export function onPaletteChange(fn: () => void): void {
  listeners.push(fn);
}

export function setColorBlind(on: boolean): void {
  colorBlind = on;
  Object.assign(PAL, BASE, on ? COLOR_BLIND : {});
  for (const fn of listeners) fn();
}

export const css = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;
