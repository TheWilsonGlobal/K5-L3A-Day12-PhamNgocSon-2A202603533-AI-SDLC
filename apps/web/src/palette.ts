/** Standard palette of TICKET-02 (max 10% deviation per RGB channel). */
export const PAL = {
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
} as const;

export const css = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;
