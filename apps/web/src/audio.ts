export type Sfx =
  | "pick"
  | "deposit"
  | "light"
  | "pulse"
  | "hit"
  | "jump"
  | "dash"
  | "charm"
  | "steal"
  | "spawn"
  | "win"
  | "lose"
  | "tick"
  | "wind"
  | "fall";

export interface AudioEngine {
  /** Must be called from a user gesture (browsers keep audio locked until then). */
  unlock(): void;
  setVolume(v: number): void;
  music(on: boolean): void;
  sfx(name: Sfx): void;
}

const PENTATONIC = [196, 220, 247, 294, 330, 392, 440, 494, 587];

/** Fully procedural audio: a soft night pad with occasional bell notes, plus synthesized effects. */
export function createAudio(initialVolume: number): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let musicBus: GainNode;
  let padNodes: OscillatorNode[] = [];
  let bellTimer: number | undefined;
  let volume = initialVolume;
  let wantMusic = false;

  const build = () => {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.0;
    musicBus.connect(master);
  };

  const tone = (
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
    slideTo?: number,
    bus?: AudioNode,
  ) => {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? master);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const noise = (dur: number, vol: number, from: number, to: number, delay = 0) => {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  };

  const startMusic = () => {
    if (!ctx || bellTimer !== undefined) return;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.8);
    // Gentle pentatonic night motif (short enveloped notes only — no continuous drone hum)
    const motif = [294, 330, 392, 440, 392, 330, 294, 247];
    let step = 0;
    const playNote = () => {
      const f = motif[step % motif.length]!;
      step += 1;
      tone(f, 1.8, "sine", 0.09, 0, undefined, musicBus);
      if (step % 4 === 0) {
        const hi = PENTATONIC[(step + 2) % PENTATONIC.length]!;
        tone(hi, 2.2, "sine", 0.04, 0.25, undefined, musicBus);
      }
    };
    playNote();
    bellTimer = window.setInterval(playNote, 1800);
  };

  const stopMusic = () => {
    if (!ctx) return;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    const nodes = padNodes;
    padNodes = [];
    nodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        // already stopped
      }
    });
    if (bellTimer !== undefined) window.clearInterval(bellTimer);
    bellTimer = undefined;
  };

  return {
    unlock() {
      if (!ctx) build();
      void ctx!.resume();
      if (wantMusic) startMusic();
    },
    setVolume(v) {
      volume = v;
      if (ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    },
    music(on) {
      wantMusic = on;
      if (!ctx) return;
      if (on) startMusic();
      else stopMusic();
    },
    sfx(name) {
      if (!ctx || volume <= 0) return;
      switch (name) {
        case "pick":
          tone(880, 0.12, "sine", 0.18, 0, 1320);
          break;
        case "deposit":
          tone(520, 0.18, "triangle", 0.2, 0, 700);
          break;
        case "light":
          [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, "sine", 0.2, i * 0.09));
          break;
        case "pulse":
          tone(300, 0.5, "sawtooth", 0.1, 0, 1200);
          noise(0.5, 0.18, 400, 3000);
          break;
        case "hit":
          tone(160, 0.35, "square", 0.22, 0, 55);
          noise(0.25, 0.25, 900, 200);
          break;
        case "jump":
          tone(330, 0.16, "sine", 0.16, 0, 560);
          break;
        case "dash":
          noise(0.22, 0.2, 1800, 500);
          break;
        case "charm":
          [659, 880, 1175].forEach((f, i) => tone(f, 0.35, "triangle", 0.18, i * 0.07));
          break;
        case "steal":
          tone(700, 0.3, "sawtooth", 0.14, 0, 180);
          break;
        case "spawn":
          tone(110, 0.9, "sine", 0.22, 0, 70);
          tone(116, 0.9, "sine", 0.18, 0.02, 74);
          break;
        case "win":
          [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.6, "sine", 0.22, i * 0.14));
          break;
        case "lose":
          [440, 392, 330, 262].forEach((f, i) => tone(f, 0.7, "triangle", 0.2, i * 0.22));
          break;
        case "tick":
          tone(1100, 0.07, "square", 0.1);
          break;
        case "wind":
          noise(1.8, 0.2, 200, 1400);
          break;
        case "fall":
          tone(520, 0.9, "sine", 0.18, 0, 90);
          break;
      }
    },
  };
}
