import { makeRng } from "./rng.ts";
import type {
  GameState,
  InputState,
  Scenario,
  ShadeState,
  SimEvent,
  Snapshot,
  Tuning,
  Vec3,
} from "./types.ts";

export const TICK_RATE = 60;
const DT = 1 / TICK_RATE;
export const ISLAND_RADIUS = 40;
const LANTERN_RING = 25;
const GRAVITY = 20;
const JUMP_SPEED = 7;
const DEFAULT_MOTES = 30;
const DEFAULT_SHADES = 3;
const SHADE_SPAWN_TICKS = 30 * TICK_RATE;
const SHADE_MAX = 6;

export const r3 = (x: number): number => {
  const v = Math.round(x * 1000) / 1000;
  return v === 0 ? 0 : v;
};
const rv = (p: Vec3): Vec3 => [r3(p[0]), r3(p[1]), r3(p[2])];
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

interface Lantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}
interface Shade {
  id: string;
  pos: Vec3;
  state: ShadeState;
  stunLeft: number;
}
interface Mote {
  id: string;
  pos: Vec3;
}

export const defaultInput = (): InputState => ({
  move: [0, 0],
  cam_yaw_deg: 0,
  jump: false,
  interact: false,
  pulse: false,
});

export class Sim {
  readonly tuning: Tuning;
  tick = 0;
  state: GameState = "playing";
  score = 0;
  pos: Vec3 = [0, 0, 0];
  vy = 0;
  flames: number;
  carried = 0;
  invuln = 0;
  pulseCd = 0;
  lanterns: Lantern[] = [];
  shades: Shade[] = [];
  motes: Mote[] = [];

  private rng: () => number;
  private startTicksLeft: number;
  private randomShades: boolean;
  private prev = { jump: false, interact: false, pulse: false };
  private moteSeq = 0;
  private shadeSeq = 0;

  constructor(tuning: Tuning, seed: number, scenario: Scenario = {}) {
    this.tuning = tuning;
    this.rng = makeRng(seed);
    this.flames = tuning.flames;
    this.startTicksLeft = Math.round(
      (scenario.time_left_s ?? tuning.night1_duration_s) * TICK_RATE,
    );
    this.randomShades = scenario.random_shades ?? true;

    for (let i = 0; i < tuning.lantern_count_night1; i++) {
      const a = (2 * Math.PI * i) / tuning.lantern_count_night1;
      this.lanterns.push({
        id: `L${i + 1}`,
        pos: [r3(LANTERN_RING * Math.sin(a)), 0, r3(LANTERN_RING * Math.cos(a))],
        lit: false,
        deposited: 0,
      });
    }

    // Default entities are always generated in a fixed order so the RNG stream is stable.
    const defMotes = this.randomMotes(DEFAULT_MOTES);
    const defShades = this.randomShadePositions(DEFAULT_SHADES);
    const wantMotes = scenario.random_motes ?? true;
    const wantShades = scenario.random_shades ?? true;
    for (const p of scenario.motes ?? (wantMotes ? defMotes : [])) this.addMote(p);
    const shadeList: { id?: string; pos?: Vec3 }[] =
      scenario.shades ?? (wantShades ? defShades.map((pos) => ({ pos })) : []);
    for (const s of shadeList) this.addShade(s.pos ?? [30, 1, 0], s.id);

    if (scenario.player) {
      if (scenario.player.pos) this.pos = [...scenario.player.pos];
      if (scenario.player.carried !== undefined) this.carried = scenario.player.carried;
      if (scenario.player.flames !== undefined) this.flames = scenario.player.flames;
    }
    for (const u of scenario.lanterns ?? []) {
      const l = this.lanterns.find((x) => x.id === u.id);
      if (!l) continue;
      if (u.pos) l.pos = [...u.pos];
      if (u.deposited !== undefined) l.deposited = u.deposited;
      if (u.lit !== undefined) {
        l.lit = u.lit;
        if (u.lit && l.deposited < tuning.lantern_cost) l.deposited = tuning.lantern_cost;
      } else if (l.deposited >= tuning.lantern_cost) l.lit = true;
    }
  }

  private randomMotes(n: number): Vec3[] {
    const out: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.rng() * 2 * Math.PI;
      const r = 5 + Math.sqrt(this.rng()) * 28;
      out.push([r3(r * Math.sin(a)), 0, r3(r * Math.cos(a))]);
    }
    return out;
  }

  private randomShadePositions(n: number): Vec3[] {
    const out: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.rng() * 2 * Math.PI;
      out.push([r3(36 * Math.sin(a)), 1, r3(36 * Math.cos(a))]);
    }
    return out;
  }

  private addMote(pos: Vec3): void {
    this.motes.push({ id: `M${++this.moteSeq}`, pos: [...pos] });
  }

  private addShade(pos: Vec3, id?: string): Shade {
    let sid = id;
    if (!sid) {
      // never collide with an explicit id from a scenario
      do {
        sid = `S${++this.shadeSeq}`;
      } while (this.shades.some((s) => s.id === sid));
    } else {
      const m = /^S(\d+)$/.exec(sid);
      if (m) this.shadeSeq = Math.max(this.shadeSeq, Number(m[1]));
    }
    const shade: Shade = { id: sid, pos: [...pos], state: "chase", stunLeft: 0 };
    this.shades.push(shade);
    return shade;
  }

  get timeLeft(): number {
    return Math.max(0, this.startTicksLeft - this.tick) / TICK_RATE;
  }

  private clampIsland(p: Vec3): void {
    const d = Math.hypot(p[0], p[2]);
    if (d > ISLAND_RADIUS) {
      p[0] *= ISLAND_RADIUS / d;
      p[2] *= ISLAND_RADIUS / d;
    }
  }

  /** Advance exactly one fixed step. Returns the events of that step (tagged tick = k+1). */
  step(input: InputState): SimEvent[] {
    if (this.state !== "playing") return [];
    const T = this.tuning;
    const ev: SimEvent[] = [];
    this.tick += 1;
    const emit = (name: SimEvent["name"], data: Record<string, unknown>) =>
      ev.push({ type: "event", tick: this.tick, name, data });

    const jumpEdge = input.jump && !this.prev.jump;
    const interactEdge = input.interact && !this.prev.interact;
    const pulseEdge = input.pulse && !this.prev.pulse;
    this.prev = { jump: input.jump, interact: input.interact, pulse: input.pulse };

    this.invuln = Math.max(0, this.invuln - DT);
    this.pulseCd = Math.max(0, this.pulseCd - DT);

    // --- player movement (camera-relative) ---
    let [mx, mz] = input.move;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const th = (input.cam_yaw_deg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    this.pos[0] += wx * T.player_speed * DT;
    this.pos[2] += wz * T.player_speed * DT;
    this.clampIsland(this.pos);
    if (jumpEdge && this.pos[1] === 0 && this.vy === 0) this.vy = JUMP_SPEED;
    this.vy -= GRAVITY * DT;
    this.pos[1] += this.vy * DT;
    if (this.pos[1] <= 0) {
      this.pos[1] = 0;
      this.vy = 0;
    }

    // --- pickup (automatic within pickup_radius, in list order) ---
    for (const m of [...this.motes]) {
      if (this.carried >= T.carry_capacity) break;
      if (dist(this.pos, m.pos) <= T.pickup_radius) {
        this.motes = this.motes.filter((x) => x !== m);
        this.carried += 1;
        this.score += T.score.per_mote;
        emit("mote_picked", { carried: this.carried });
      }
    }

    // --- interact: deposit into the nearest unlit lantern in range ---
    if (interactEdge && this.carried > 0) {
      let best: Lantern | undefined;
      let bestD = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = dist(this.pos, l.pos);
        if (d <= T.interact_radius && d < bestD) {
          best = l;
          bestD = d;
        }
      }
      if (best) {
        const amount = Math.min(this.carried, T.lantern_cost - best.deposited);
        if (amount > 0) {
          this.carried -= amount;
          best.deposited += amount;
          emit("deposit", { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= T.lantern_cost) {
            best.lit = true;
            this.score += T.score.per_lantern;
            emit("lantern_lit", { lantern_id: best.id });
          }
        }
      }
    }

    // --- pulse ---
    if (pulseEdge && this.pulseCd <= 0 && this.carried >= T.pulse_cost) {
      this.carried -= T.pulse_cost;
      this.pulseCd = T.pulse_cooldown_s;
      const ids: string[] = [];
      for (const s of this.shades) {
        if (dist(this.pos, s.pos) > T.pulse_radius) continue;
        const dx = s.pos[0] - this.pos[0];
        const dz = s.pos[2] - this.pos[2];
        const d = Math.hypot(dx, dz);
        const ux = d > 1e-9 ? dx / d : 1;
        const uz = d > 1e-9 ? dz / d : 0;
        s.pos[0] += ux * T.pulse_push_m;
        s.pos[2] += uz * T.pulse_push_m;
        this.clampIsland(s.pos);
        s.state = "stunned";
        s.stunLeft = T.pulse_stun_s;
        this.score += T.score.per_stun;
        ids.push(s.id);
      }
      emit("pulse", { stunned_ids: ids });
    }

    // --- shades: chase the player, fear lit lanterns ---
    for (const s of this.shades) {
      if (s.state === "stunned") {
        s.stunLeft -= DT;
        if (s.stunLeft <= 1e-9) {
          s.state = "chase";
          s.stunLeft = 0;
        }
        continue;
      }
      const dx = this.pos[0] - s.pos[0];
      const dz = this.pos[2] - s.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > 1e-9) {
        const stepLen = Math.min(T.shade_speed * DT, d);
        s.pos[0] += (dx / d) * stepLen;
        s.pos[2] += (dz / d) * stepLen;
      }
      for (const l of this.lanterns) {
        if (!l.lit) continue;
        const lx = s.pos[0] - l.pos[0];
        const lz = s.pos[2] - l.pos[2];
        const ld = Math.hypot(lx, lz);
        if (ld < T.safe_radius) {
          const ux = ld > 1e-9 ? lx / ld : 1;
          const uz = ld > 1e-9 ? lz / ld : 0;
          s.pos[0] = l.pos[0] + ux * T.safe_radius;
          s.pos[2] = l.pos[2] + uz * T.safe_radius;
        }
      }
      this.clampIsland(s.pos);
    }

    // --- periodic shade spawn at the island rim ---
    if (
      this.randomShades &&
      this.tick % SHADE_SPAWN_TICKS === 0 &&
      this.shades.length < SHADE_MAX
    ) {
      const a = this.rng() * 2 * Math.PI;
      const s = this.addShade([r3(36 * Math.sin(a)), 1, r3(36 * Math.cos(a))]);
      emit("shade_spawned", { id: s.id });
    }

    // --- shade contact ---
    if (this.invuln <= 0) {
      const hitter = this.shades.find(
        (s) => s.state !== "stunned" && dist(this.pos, s.pos) <= T.shade_hit_radius,
      );
      if (hitter) {
        this.flames -= 1;
        this.invuln = T.invuln_s;
        const dropped = Math.min(this.carried, Math.ceil(this.carried * T.hit_drop_ratio));
        this.carried -= dropped;
        for (let i = 0; i < dropped; i++) {
          const a = (2 * Math.PI * i) / Math.max(1, dropped);
          const p: Vec3 = [
            r3(this.pos[0] + 1.5 * Math.sin(a)),
            0,
            r3(this.pos[2] + 1.5 * Math.cos(a)),
          ];
          this.clampIsland(p);
          this.addMote(p);
        }
        emit("player_hit", { by: "shade", flames: this.flames, dropped });
      }
    }

    // --- end conditions (win > no_flames > dawn) ---
    const allLit = this.lanterns.length > 0 && this.lanterns.every((l) => l.lit);
    if (allLit) {
      this.score += Math.floor(this.timeLeft) * T.score.per_second_left;
      this.score += Math.max(0, this.flames) * T.score.per_flame_left;
      this.finish("won", "all_lit", emit);
    } else if (this.flames <= 0) {
      this.finish("lost", "no_flames", emit);
    } else if (this.timeLeft <= 0) {
      this.finish("lost", "dawn", emit);
    }
    return ev;
  }

  private finish(
    result: "won" | "lost",
    reason: string,
    emit: (n: SimEvent["name"], d: Record<string, unknown>) => void,
  ): void {
    this.state = result;
    emit("game_over", { result, reason });
  }

  snapshot(): Snapshot {
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.tick,
      state: this.state,
      time_left_s: r3(this.timeLeft),
      score: this.score,
      player: { pos: rv(this.pos), flames: this.flames, carried: this.carried },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: rv(l.pos),
        lit: l.lit,
        deposited: l.deposited,
      })),
      shades: this.shades.map((s) => ({ id: s.id, pos: rv(s.pos), state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: rv(m.pos) })),
    };
  }
}
