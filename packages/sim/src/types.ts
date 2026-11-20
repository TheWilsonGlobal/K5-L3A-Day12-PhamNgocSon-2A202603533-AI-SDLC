export type Vec3 = [number, number, number];

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
  per_relight: number;
  per_stun_drain: number;
  per_lit_lantern_dawn: number;
}

export interface Tuning {
  player_speed: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  night2_duration_s: number;
  night3_duration_s: number;
  fuel_max: number;
  fuel_decay_per_s: number;
  fuel_per_mote: number;
  relight_cost: number;
  win_ratio: number;
  drain_per_s: number;
  low_fuel_threshold: number;
  capacity_max: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
  fall_enabled: boolean;
  score: ScoreTuning;
}

export interface Contract {
  contract_version: string;
  team: string;
  build_cmd: string;
  run_cmd: string;
  headless_cmd: string;
  tuning: Tuning;
}

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export type InputFrame = Partial<InputState> & { tick: number };

export type ShadeState = "spawning" | "wander" | "chase" | "recoil" | "stunned" | "drain";
export type DrifterState = "idle" | "chase" | "flee" | "removed";

export interface Scenario {
  player?: {
    pos?: Vec3;
    carried?: number;
    flames?: number;
    invuln_ticks?: number;
    dash_cd_ticks?: number;
    pulse_cd_ticks?: number;
    charm_ticks?: number;
    successful_lights?: number;
  };
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: Vec3[];
  shades?: {
    id?: string;
    pos?: Vec3;
    state?: ShadeState;
    state_ticks_left?: number;
    target_lantern_id?: string | null;
  }[];
  drifters?: {
    id?: string;
    pos?: Vec3;
    state?: DrifterState;
    stolen?: number;
    state_ticks_left?: number;
  }[];
  charms?: { id?: string; pos?: Vec3; available?: boolean; respawn_ticks?: number }[];
  lanterns?: {
    id: string;
    pos?: Vec3;
    lit?: boolean;
    fuel?: number;
    ever_lit?: boolean;
    deposited?: number;
  }[];
  time_left_s?: number;
}

export type GameState = "playing" | "paused" | "won" | "lost";

export type GameOverReason = "dawn_survived" | "dawn" | "no_flames";

export type EventName =
  | "mote_picked"
  | "deposit"
  | "lantern_lit"
  | "pulse"
  | "player_hit"
  | "shade_spawned"
  | "game_over"
  | "dash"
  | "charm_picked"
  | "drifter_steal"
  | "drifter_drop"
  | "night_start"
  | "paused"
  | "resumed"
  | "refuel"
  | "lantern_out"
  | "fuel_drain";

export interface SimEvent {
  type: "event";
  tick: number;
  name: EventName;
  data: Record<string, unknown>;
}

export interface Snapshot {
  type: "snapshot";
  tick: number;
  sim_tick: number;
  state: GameState;
  night: number;
  time_left_s: number;
  score: number;
  wind: { active: boolean; dir_deg: number };
  player: {
    pos: Vec3;
    vel: Vec3;
    grounded: boolean;
    flames: number;
    carried: number;
    invuln: number;
    dash_cd_s: number;
    pulse_cd_s: number;
    charm_s: number;
    capacity: number;
  };
  lanterns: {
    id: string;
    pos: Vec3;
    lit: boolean;
    deposited: number;
    fuel: number;
    ever_lit: boolean;
    relit_count: number;
  }[];
  shades: { id: string; pos: Vec3; state: ShadeState }[];
  motes_active: number;
  motes: { id: string; pos: Vec3; kind: "random" | "dropped"; ttl_s: number | null }[];
  drifters: { id: string; pos: Vec3; state: DrifterState; stolen: number }[];
  charms: { id: string; available: boolean; respawn_s: number }[];
}

/** Raised for malformed scenario / inputs files; the CLI maps it to exit code 2. */
export class InputError extends Error {}
