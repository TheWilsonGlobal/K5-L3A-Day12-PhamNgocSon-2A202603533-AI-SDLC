import * as THREE from "three";
import { Sim, defaultInput, type Contract, type InputState, type SimEvent } from "@ddl/sim";
import contract from "../../../game.contract.json";
import { createAudio, type Sfx } from "./audio.ts";
import { createMay, createShade, type ShadeRig } from "./characters.ts";
import { createCharm, createDrifter, type CharmRig, type DrifterRig } from "./creatures.ts";
import { createHud } from "./hud.ts";
import { MINIMAP_SIZE, drawMinimap, updateArrow, updateLabels } from "./overlay.ts";
import { PAL, css, isColorBlind, onPaletteChange, setColorBlind } from "./palette.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import { buildWorld, renderTerrain, type TerrainImage, type World } from "./world.ts";

const T = (contract as Contract).tuning;
const DT = 1 / 60;
const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

// ---------------------------------------------------------------- night texts
const NIGHTS = {
  1: {
    name: "Đảo Bến",
    quote:
      "Con ơi, sương đen đã nuốt hết đèn bến. Gom đom đóm, thắp lại năm ngọn đèn lồng — ánh sáng sẽ giữ bọn Bóng Mực ở ngoài vòng sáng.",
    facts: "5 đèn lồng · 300 giây · Bóng Mực xuất hiện từ giây thứ 5",
  },
  2: {
    name: "Đảo Cau",
    quote:
      "Hai đảo cau cách nhau một nhịp cầu tre không lan can — đừng nhìn xuống nhé. Bục nhảy sẽ đưa con sang bờ bên kia. Coi chừng Gió Lạc, nó mê đom đóm lắm.",
    facts: "6 đèn lồng · 330 giây · cầu tre, bục nhảy, Bùa Gió, Gió Lạc",
  },
  3: {
    name: "Đảo Chuông",
    quote:
      "Chuông cổ trên đỉnh đảo đã im tiếng từ lâu. Đêm nay gió rất mạnh. Leo dốc, nhảy bục, thắp đủ bảy ngọn đèn trước khi trời sáng, con nhé.",
    facts: "7 đèn lồng · 360 giây · ba tầng, dốc, gió mạnh, Bóng Mực nhanh hơn",
  },
} as const;
type NightNo = 1 | 2 | 3;

// ---------------------------------------------------------------- settings + audio
const settings = loadSettings();
const audio = createAudio(settings.volume);

// ---------------------------------------------------------------- renderer + scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.insertBefore(renderer.domElement, document.body.firstChild);
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.FogExp2(PAL.mist, 0.011);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener("resize", resize);
resize();

// ambient light grows with progress: 0.15 + 0.55 x (lit / total)
const AMBIENT_SCALE = 4;
const hemi = new THREE.HemisphereLight(0x8a96d8, PAL.mist, 0.15 * AMBIENT_SCALE);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9aa8e0, 0.5);
moon.position.set(-30, 60, 20);
scene.add(moon);

const may = createMay();
scene.add(may.group);
const mayLight = may.light;

// ---------------------------------------------------------------- per-night world
const lanternGroup = new THREE.Group();
scene.add(lanternGroup);
interface LanternRig {
  glow: THREE.Mesh;
  /** torn-paper patches on the glow; shown only while the lantern is unlit */
  tears: THREE.Group;
  core: THREE.Mesh;
  light: THREE.PointLight;
  ring: THREE.Mesh;
  pips: THREE.Mesh[];
  baseY: number;
  bar: THREE.Group;
  barFill: THREE.Mesh;
}
const BAR_W = 1.8;
const BAR_H = 0.2;
/** An unlit lantern is collapsed to this fraction of its height (a shape cue, independent of colour). */
const COLLAPSE_Y = 0.8;
const GLOW_R = 0.7;

// jagged torn-paper patch (local XY plane, normal +Z); shared by every lantern
const tearGeo = new THREE.ShapeGeometry(
  new THREE.Shape(
    [
      [-0.2, 0.05],
      [-0.1, 0.22],
      [0, 0.08],
      [0.1, 0.3],
      [0.18, 0.1],
      [0.12, -0.05],
      [0.2, -0.25],
      [0.02, -0.12],
      [-0.08, -0.28],
      [-0.12, -0.1],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  ),
);
const tearMat = new THREE.MeshBasicMaterial({ color: PAL.lanternTear, side: THREE.DoubleSide });
function makeTears(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const az = (i * 2 * Math.PI) / 3 + 0.4;
    const el = 0.12 + 0.1 * i;
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az),
    );
    const m = new THREE.Mesh(tearGeo, tearMat);
    m.position.copy(dir).multiplyScalar(GLOW_R * 0.985);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    m.rotateZ(i * 1.7);
    g.add(m);
  }
  return g;
}
const lanternRigs = new Map<string, LanternRig>();
const moteRigs = new Map<string, THREE.Group>();
const shadeRigs = new Map<string, ShadeRig>();
const drifterRigs = new Map<string, DrifterRig>();
const charmRigs = new Map<string, CharmRig>();
const entityGroup = new THREE.Group();
scene.add(entityGroup);

// leaves that fly across the screen while a strong wind is coming (2 s warning) and blowing
const LEAVES = 80;
const leafMesh = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.34, 0.2),
  new THREE.MeshBasicMaterial({ color: 0x7fb069, side: THREE.DoubleSide }),
  LEAVES,
);
leafMesh.frustumCulled = false;
leafMesh.visible = false;
scene.add(leafMesh);
const leafDummy = new THREE.Object3D();
const leafHash = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function updateLeaves(t: number): void {
  const on = sim.windWarning || sim.wind.active;
  leafMesh.visible = on;
  if (!on) return;
  const a = (sim.wind.dir_deg * Math.PI) / 180;
  const wx = Math.cos(a);
  const wz = Math.sin(a);
  const speed = sim.wind.active ? 16 : 7; // warning: a few drifting leaves, then a gust
  for (let i = 0; i < LEAVES; i++) {
    const along = ((t * speed + i * 7.3) % 70) - 35;
    const lateral = (leafHash(i, 1) - 0.5) * 60;
    const x = sim.pos[0] + wx * along - wz * lateral;
    const z = sim.pos[2] + wz * along + wx * lateral;
    const y = sim.pos[1] + 0.8 + leafHash(i, 2) * 7 + Math.sin(t * 3 + i) * 0.4;
    leafDummy.position.set(x, y, z);
    leafDummy.rotation.set(t * 3 + i, t * 2 + i * 0.5, t * 4);
    leafDummy.scale.setScalar(sim.wind.active || i % 3 === 0 ? 1 : 0.001);
    leafDummy.updateMatrix();
    leafMesh.setMatrixAt(i, leafDummy.matrix);
  }
  leafMesh.instanceMatrix.needsUpdate = true;
}

const COLOR_OFF = new THREE.Color(PAL.lanternOff);
const COLOR_ON = new THREE.Color(PAL.lanternOn);
const PIP_OFF = 0x2a2a3a;
const idSeed = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0);

const moteCoreGeo = new THREE.SphereGeometry(0.15, 10, 8);
const moteHaloGeo = new THREE.SphereGeometry(0.42, 12, 8);
const moteCoreMat = new THREE.MeshBasicMaterial({ color: PAL.moteCore });
const moteHaloMat = new THREE.MeshBasicMaterial({
  color: PAL.moteHalo,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const safeRingGeo = new THREE.RingGeometry(T.safe_radius - 0.15, T.safe_radius, 64);

let sim = new Sim(T, 1, {}, 1);
let world: World | null = null;
let terrain: TerrainImage = renderTerrain(sim.map);

function loadNight(n: NightNo, seed: number): void {
  sim = new Sim(T, seed, {}, n);
  if (world) scene.remove(world.group);
  world = buildWorld(sim.map);
  scene.add(world.group);
  terrain = renderTerrain(sim.map);

  lanternGroup.clear();
  lanternRigs.clear();
  entityGroup.clear();
  moteRigs.clear();
  shadeRigs.clear();
  drifterRigs.clear();
  charmRigs.clear();
  for (const l of sim.lanterns) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 4, 8),
      new THREE.MeshStandardMaterial({ color: PAL.wood }),
    );
    pole.position.set(l.pos[0], l.pos[1] + 2, l.pos[2]);
    const baseY = l.pos[1] + 4.4;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(GLOW_R, 18, 14),
      new THREE.MeshBasicMaterial({ color: PAL.lanternOff }),
    );
    glow.position.set(l.pos[0], baseY, l.pos[2]);
    const tears = makeTears();
    glow.add(tears);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 14, 10),
      new THREE.MeshBasicMaterial({ color: PAL.lanternCore }),
    );
    core.position.copy(glow.position);
    const light = new THREE.PointLight(PAL.lanternOn, 0, 30);
    light.position.copy(glow.position);
    const ring = new THREE.Mesh(
      safeRingGeo,
      new THREE.MeshBasicMaterial({
        color: PAL.lanternOn,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(l.pos[0], l.pos[1] + 0.04, l.pos[2]);
    ring.visible = false;
    const pips: THREE.Mesh[] = [];
    for (let i = 0; i < T.lantern_cost; i++) {
      const a = (2 * Math.PI * i) / T.lantern_cost;
      const pip = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: PIP_OFF }),
      );
      pip.position.set(l.pos[0] + 1.25 * Math.sin(a), baseY, l.pos[2] + 1.25 * Math.cos(a));
      pips.push(pip);
      lanternGroup.add(pip);
    }
    // fuel bar: a billboard above the lantern, only shown while lit
    const bar = new THREE.Group();
    bar.position.set(l.pos[0], baseY + 1.5, l.pos[2]);
    bar.visible = false;
    const barMat = (color: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthTest: false,
        side: THREE.DoubleSide,
      });
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(BAR_W + 0.12, BAR_H + 0.12),
      barMat(PAL.fuelTrack),
    );
    track.renderOrder = 10;
    const barFill = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W, BAR_H), barMat(PAL.fuelFill));
    barFill.renderOrder = 11;
    barFill.position.z = 0.01;
    bar.add(track, barFill);
    lanternGroup.add(pole, glow, core, light, ring, bar);
    lanternRigs.set(l.id, { glow, tears, core, light, ring, pips, baseY, bar, barFill });
  }
  yaw = 0;
  hud.reset();
  gameOverReason = null;
  lastTimeTick = -1;
  wasWarning = false;
}

// ---------------------------------------------------------------- UI plumbing
const hud = createHud($("hud"), $("prompt"), T);
const labelsEl = $("labels");
const labelPool = new Map<string, HTMLDivElement>();
const miniCanvas = $<HTMLCanvasElement>("minimap");
miniCanvas.width = miniCanvas.height = MINIMAP_SIZE;
const miniCtx = miniCanvas.getContext("2d")!;
const arrowEl = $("arrow");

type ScreenId = "menu" | "intro" | "result" | "dawn" | "pause" | "settings" | "guide";
const SCREENS: ScreenId[] = ["menu", "intro", "result", "dawn", "pause", "settings", "guide"];
let screen: "menu" | "intro" | "play" | "result" | "dawn" = "menu";
let overlay: "pause" | "settings" | "guide" | null = null;
let overlayReturn: "pause" | "menu" | null = null;
let helpLabels = false;
let yaw = 0;

function showOnly(id: ScreenId | null): void {
  for (const s of SCREENS) $(s).classList.toggle("show", s === id);
}
function setHudVisible(v: boolean): void {
  for (const id of ["hud", "minimap", "labels", "prompt"]) $(id).style.display = v ? "" : "none";
  if (!v) arrowEl.style.display = "none";
}

// ---------------------------------------------------------------- game flow
const SEED_BASE = 20261120;
let night: NightNo = 1;
let attempt = 0;
const nightScores: (number | null)[] = [null, null, null];
let resultTimer = 0;

const totalScore = () => nightScores.reduce<number>((a, s) => a + (s ?? 0), 0);

function startRun(n: NightNo): void {
  nightScores.fill(null);
  attempt = 0;
  openIntro(n);
}

function openIntro(n: NightNo): void {
  night = n;
  loadNight(n, SEED_BASE + n * 101 + attempt);
  screen = "intro";
  overlay = null;
  setHudVisible(false);
  const info = NIGHTS[n];
  $("introKicker").textContent = `Đêm ${n} / 3`;
  $("introName").textContent = info.name;
  $("introQuote").textContent = info.quote;
  $("introFacts").textContent = info.facts;
  showOnly("intro");
}

function beginPlay(): void {
  screen = "play";
  overlay = null;
  showOnly(null);
  setHudVisible(true);
  audio.unlock();
  audio.music(true);
}

function toMenu(): void {
  screen = "menu";
  overlay = null;
  resultTimer = 0;
  setHudVisible(false);
  audio.music(false);
  loadNight(1, SEED_BASE);
  showOnly("menu");
}

function retryNight(): void {
  attempt += 1;
  openIntro(night);
}

// game_over.reason (contract v1.2) -> result screen text; anything else renders as unknown
const RESULT_TEXT: Record<string, { title: string; detail: string }> = {
  dawn_survived: {
    title: "Đảo đã sáng đèn! 🏮",
    detail: "Sống sót đến bình minh",
  },
  dawn: {
    title: "Bình minh đến, nhưng đèn chưa đủ sáng…",
    detail: "Chưa đủ đèn sáng khi bình minh",
  },
  no_flames: {
    title: "Sương đen nuốt mất ánh sáng…",
    detail: "Hết Ngọn Lửa",
  },
};

function showResult(): void {
  const won = sim.outcome === "won";
  screen = "result";
  setHudVisible(false);
  audio.music(false);
  if (won) nightScores[night - 1] = sim.score;
  const lit = sim.lanterns.filter((l) => l.lit).length;
  $("resKicker").textContent = `Đêm ${night} · ${NIGHTS[night].name}`;
  const reason = RESULT_TEXT[String(gameOverReason)];
  $("resTitle").textContent = reason
    ? reason.title
    : `Kết thúc không rõ lý do (reason: ${String(gameOverReason)})`;
  const rows: [string, string][] = [
    ["Kết quả", reason ? reason.detail : `không rõ: ${String(gameOverReason)}`],
    ["Đèn đã thắp", `${lit}/${sim.lanterns.length}`],
    ["Ngọn Lửa còn lại", String(Math.max(0, sim.flames))],
    ["Điểm đêm này", String(sim.score)],
    ["Tổng điểm game", String(totalScore())],
  ];
  $("resStats").innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join("");
  const last = night === 3;
  $("btnNext").style.display = won ? "" : "none";
  $("btnNext").textContent = last ? "Tới Bình Minh (Enter)" : "Đêm kế tiếp (Enter)";
  $("btnRetry").style.display = won ? "none" : "";
  showOnly("result");
}

function showDawn(): void {
  screen = "dawn";
  setHudVisible(false);
  $("dawnScore").textContent = String(totalScore());
  $("dawnStats").innerHTML = ([1, 2, 3] as NightNo[])
    .map((n) => `<span>Đêm ${n} · ${NIGHTS[n].name}</span><b>${nightScores[n - 1] ?? 0}</b>`)
    .join("");
  audio.sfx("win");
  showOnly("dawn");
}

function nextAfterResult(): void {
  if (sim.outcome === "won") {
    if (night === 3) showDawn();
    else {
      attempt = 0;
      openIntro((night + 1) as NightNo);
    }
  } else retryNight();
}

function openOverlay(o: "pause" | "settings" | "guide", back: "pause" | "menu" | null): void {
  overlay = o;
  overlayReturn = back;
  if (o === "pause") audio.music(false);
  showOnly(o);
}
function closeOverlay(): void {
  if (!overlay) return;
  const back = overlayReturn;
  overlay = null;
  overlayReturn = null;
  if (back === "pause") {
    overlay = "pause";
    showOnly("pause");
  } else if (back === "menu") showOnly("menu");
  else {
    showOnly(null);
    if (screen === "play" && !sim.outcome) audio.music(true);
  }
}
function togglePause(): void {
  if (screen !== "play" || sim.outcome) return;
  if (overlay === "settings" || overlay === "guide") closeOverlay();
  else if (overlay === "pause") closeOverlay();
  else openOverlay("pause", null);
}

// buttons
$("btnPlay").addEventListener("click", () => startRun(1));
document
  .querySelectorAll<HTMLElement>("[data-night]")
  .forEach((b) => b.addEventListener("click", () => startRun(Number(b.dataset.night) as NightNo)));
$("btnStart").addEventListener("click", beginPlay);
$("btnNext").addEventListener("click", nextAfterResult);
$("btnRetry").addEventListener("click", nextAfterResult);
$("btnResMenu").addEventListener("click", toMenu);
$("btnDawnAgain").addEventListener("click", () => startRun(1));
$("btnDawnMenu").addEventListener("click", toMenu);
$("btnResume").addEventListener("click", togglePause);
$("btnRestart").addEventListener("click", () => {
  overlay = null;
  retryNight();
});
$("btnPauseMenu").addEventListener("click", toMenu);
$("btnSettingsPause").addEventListener("click", () => openOverlay("settings", "pause"));
$("btnGuidePause").addEventListener("click", () => openOverlay("guide", "pause"));
$("btnSettingsMenu").addEventListener("click", () => openOverlay("settings", "menu"));
$("btnGuideMenu").addEventListener("click", () => openOverlay("guide", "menu"));
$("btnSettingsBack").addEventListener("click", closeOverlay);
$("btnGuideBack").addEventListener("click", closeOverlay);

// settings sliders (saved on every change)
const optVolume = $<HTMLInputElement>("optVolume");
const optSens = $<HTMLInputElement>("optSens");
const optColorBlind = $<HTMLInputElement>("optColorBlind");
const syncSettingsUi = () => {
  optColorBlind.checked = settings.colorBlind;
  optVolume.value = String(Math.round(settings.volume * 100));
  optSens.value = String(Math.round(settings.sensitivity * 100));
  $("optVolumeV").textContent = `${Math.round(settings.volume * 100)}%`;
  $("optSensV").textContent = `${settings.sensitivity.toFixed(2)}×`;
};
syncSettingsUi();
optVolume.addEventListener("input", () => {
  settings.volume = Number(optVolume.value) / 100;
  audio.setVolume(settings.volume);
  saveSettings(settings);
  syncSettingsUi();
});
optColorBlind.addEventListener("change", () => {
  settings.colorBlind = optColorBlind.checked;
  saveSettings(settings);
  setColorBlind(settings.colorBlind); // live: tokens + CSS vars switch now, no reload
});
optSens.addEventListener("input", () => {
  settings.sensitivity = Number(optSens.value) / 100;
  saveSettings(settings);
  syncSettingsUi();
});

// ---------------------------------------------------------------- input
const keys = new Set<string>();
const tapped = new Set<string>();
addEventListener("keydown", (e) => {
  keys.add(e.code);
  tapped.add(e.code);
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "ArrowDown") e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Enter") {
    if (screen === "intro") beginPlay();
    else if (screen === "result") nextAfterResult();
  }
  if (e.code === "Escape" || e.code === "KeyP") {
    if (overlay === "settings" || overlay === "guide") closeOverlay();
    else togglePause();
  }
  if (e.code === "KeyH" && screen === "play") helpLabels = !helpLabels;
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
let dragging = false;
addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).tagName === "CANVAS") dragging = true;
});
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (dragging) yaw -= e.movementX * 0.006 * settings.sensitivity;
});

function readInput(): InputState {
  const i = defaultInput();
  // yaw convention follows the contract: forward = (sin t, cos t); +x input = camera-left.
  const fwd =
    (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
    (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  const left =
    (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) -
    (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
  i.move = [left, fwd];
  if (keys.has("KeyQ")) yaw += 0.03 * settings.sensitivity;
  if (keys.has("KeyR")) yaw -= 0.03 * settings.sensitivity;
  i.cam_yaw_deg = (yaw * 180) / Math.PI;
  // A tap shorter than one rendered frame must still count, so taps are latched until read.
  const down = (...codes: string[]) => codes.some((c) => keys.has(c) || tapped.has(c));
  i.jump = down("Space");
  i.interact = down("KeyE");
  i.pulse = down("KeyF");
  i.dash = down("ShiftLeft", "ShiftRight");
  tapped.clear();
  return i;
}

// ---------------------------------------------------------------- events -> sound and feedback
let pulseFx = 0;
let shake = 0;
let lastTimeTick = -1;
let wasWarning = false;
let prevJump = false;
let gameOverReason: unknown = null; // `reason` of the last game_over event, shown on the result screen

function onEvent(e: SimEvent): void {
  const map: Partial<Record<SimEvent["name"], Sfx>> = {
    mote_picked: "pick",
    deposit: "deposit",
    lantern_lit: "light",
    pulse: "pulse",
    dash: "dash",
    charm_picked: "charm",
    drifter_steal: "steal",
    shade_spawned: "spawn",
  };
  const s = map[e.name];
  if (s) audio.sfx(s);
  if (e.name === "pulse") pulseFx = 0.5;
  if (e.name === "player_hit") {
    audio.sfx(e.data.by === "fall" ? "fall" : "hit");
    shake = 0.5;
  }
  if (e.name === "game_over") {
    gameOverReason = e.data.reason;
    audio.sfx(e.data.result === "won" ? "win" : "lose");
    resultTimer = performance.now() + 1100;
  }
}

// ---------------------------------------------------------------- loop
let acc = 0;
let last = performance.now();
let lastT = 0;
let fpsFrames = 0;
let fpsT = performance.now();
export const fps = { value: 0 };

function frame(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  fpsFrames += 1;
  if (now - fpsT >= 1000) {
    fps.value = (fpsFrames * 1000) / (now - fpsT);
    fpsFrames = 0;
    fpsT = now;
  }
  const input = readInput();
  const playing = screen === "play" && overlay === null;
  if (!playing) acc = 0; // menus, pause and results freeze the logic completely
  while (acc >= DT) {
    const jumpEdge = input.jump && !prevJump && sim.grounded;
    if (jumpEdge) audio.sfx("jump");
    prevJump = input.jump;
    for (const e of sim.step(input)) onEvent(e);
    acc -= DT;
  }
  if (playing) {
    const tl = Math.ceil(sim.timeLeft);
    if (sim.timeLeft <= 10 && sim.timeLeft > 0 && tl !== lastTimeTick) {
      lastTimeTick = tl;
      audio.sfx("tick");
    }
    if (sim.windWarning && !wasWarning) audio.sfx("wind");
    wasWarning = sim.windWarning;
  }
  if (resultTimer && now >= resultTimer && screen === "play") {
    resultTimer = 0;
    showResult();
  }
  try {
    render(now / 1000, playing);
  } catch (e) {
    showFatal(e);
    throw e; // stop the loop: do not pretend the game is still running
  }
  requestAnimationFrame(frame);
}

function showFatal(e: unknown): void {
  const el = document.getElementById("fatalBanner");
  if (el) {
    el.textContent = `Lỗi hiển thị, trò chơi đã dừng: ${e instanceof Error ? e.message : String(e)}`;
    el.hidden = false;
  }
  console.error("render failed", e);
}

function render(t: number, playing: boolean): void {
  const dt = lastT === 0 ? 1 / 60 : Math.min(0.1, t - lastT);
  lastT = t;
  // read-only view of the sim's public snapshot: fuel (display units) and capacity come from here
  const snap = sim.snapshot();
  const [px, py, pz] = sim.pos;
  may.update(t, playing ? dt : 1e-4, px, py, pz);
  may.group.visible = !(sim.invuln > 0 && Math.floor(t * 12) % 2 === 0) && sim.respawnWait === 0;
  world?.update(t);
  updateLeaves(t);

  // fireflies: bright core + soft halo, bobbing; dropped ones blink before they vanish
  const seenMotes = new Set<string>();
  for (const m of sim.motes) {
    seenMotes.add(m.id);
    let g = moteRigs.get(m.id);
    if (!g) {
      g = new THREE.Group();
      g.add(new THREE.Mesh(moteCoreGeo, moteCoreMat), new THREE.Mesh(moteHaloGeo, moteHaloMat));
      moteRigs.set(m.id, g);
      entityGroup.add(g);
    }
    g.position.set(m.pos[0], m.pos[1] + 0.8 + Math.sin(t * 3 + m.pos[0]) * 0.2, m.pos[2]);
    g.visible = m.ttl === null || m.ttl > 120 || Math.floor(t * 8) % 2 === 0;
  }
  for (const [id, g] of moteRigs)
    if (!seenMotes.has(id)) {
      entityGroup.remove(g);
      moteRigs.delete(id);
    }

  const seenShades = new Set<string>();
  for (const s of sim.shades) {
    seenShades.add(s.id);
    let rig = shadeRigs.get(s.id);
    if (!rig) {
      rig = createShade(idSeed(s.id));
      shadeRigs.set(s.id, rig);
      entityGroup.add(rig.group);
    }
    // the rig is positioned at ground level; the sim keeps the body centre 1 m above it
    rig.group.position.y = s.pos[1] - 1;
    let drainTarget: [number, number, number] | null = null;
    if (s.state === "drain") {
      const tl = sim.lanterns.find((l) => l.id === s.target_lantern_id);
      if (!tl) throw new Error(`shade ${s.id} in drain without a known target lantern`);
      drainTarget = [tl.pos[0], tl.pos[1] + 4.4, tl.pos[2]];
    }
    rig.update(t, dt, s.state === "stunned", s.pos[0], s.pos[2], px, pz, drainTarget);
    rig.group.scale.setScalar(
      s.state === "spawning" ? 0.35 + 0.65 * (1 - Math.min(1, s.left / 60)) : 1,
    );
  }
  for (const [id, rig] of shadeRigs)
    if (!seenShades.has(id)) {
      entityGroup.remove(rig.group);
      shadeRigs.delete(id);
    }

  const seenDrifters = new Set<string>();
  for (const d of sim.drifters) {
    seenDrifters.add(d.id);
    let rig = drifterRigs.get(d.id);
    if (!rig) {
      rig = createDrifter(idSeed(d.id));
      drifterRigs.set(d.id, rig);
      entityGroup.add(rig.group);
    }
    rig.update(t, dt, d.state, d.stolen, d.pos[0], d.pos[1], d.pos[2]);
  }
  for (const [id, rig] of drifterRigs)
    if (!seenDrifters.has(id)) {
      entityGroup.remove(rig.group);
      drifterRigs.delete(id);
    }

  for (const c of sim.charms) {
    let rig = charmRigs.get(c.id);
    if (!rig) {
      rig = createCharm();
      charmRigs.set(c.id, rig);
      entityGroup.add(rig.group);
    }
    rig.group.position.x = c.pos[0];
    rig.group.position.z = c.pos[2];
    const baseY = c.pos[1];
    rig.update(t, c.available, c.respawn / 2700);
    rig.group.position.y += baseY;
  }

  let lit = 0;
  // 1 Hz blink for low fuel: on for the first half of every second
  const blinkOn = t % 1 < 0.5;
  for (const [i, l] of sim.lanterns.entries()) {
    const lr = lanternRigs.get(l.id);
    if (!lr) continue;
    const sl = snap.lanterns[i];
    if (sl?.id !== l.id) throw new Error(`snapshot lantern order mismatch at ${l.id}`);
    const lowFuel = l.lit && sl.fuel < T.low_fuel_threshold;
    const frac = l.lit ? 1 : l.deposited / T.lantern_cost;
    if (l.lit) lit++;
    // dim grey-violet when off, warm amber as it fills, bright core when lit
    (lr.glow.material as THREE.MeshBasicMaterial).color.copy(COLOR_OFF).lerp(COLOR_ON, frac);
    lr.glow.scale.setScalar(l.lit ? 1.35 : 0.85 + 0.4 * frac);
    lr.core.visible = l.lit || frac > 0.3;
    lr.core.scale.setScalar(l.lit ? 1.2 + Math.sin(t * 5) * 0.05 : frac * 0.8);
    lr.light.intensity = l.lit ? 60 + Math.sin(t * 5 + idSeed(l.id)) * 6 : 3 + frac * 22;
    // unlit: collapsed to 80% height with its bottom kept in place, and torn paper showing
    lr.tears.visible = !l.lit;
    if (l.lit) {
      lr.glow.position.y = lr.baseY;
      lr.core.position.y = lr.baseY;
    } else {
      lr.glow.scale.y *= COLLAPSE_Y;
      lr.core.scale.y *= COLLAPSE_Y;
      lr.glow.position.y = lr.baseY - GLOW_R * lr.glow.scale.x * (1 - COLLAPSE_Y);
      lr.core.position.y = lr.glow.position.y;
    }
    if (lowFuel && !blinkOn) {
      lr.light.intensity *= 0.2;
      lr.glow.scale.multiplyScalar(0.8);
      lr.core.visible = false;
    }
    lr.bar.visible = l.lit && (!lowFuel || blinkOn);
    if (l.lit) {
      const f = Math.min(1, Math.max(0, sl.fuel / T.fuel_max));
      lr.barFill.scale.x = Math.max(f, 1e-3);
      lr.barFill.position.x = -(BAR_W / 2) * (1 - f);
      (lr.barFill.material as THREE.MeshBasicMaterial).color.setHex(
        lowFuel ? PAL.danger : PAL.fuelFill,
      );
      lr.bar.quaternion.copy(camera.quaternion);
    }
    lr.pips.forEach((p, i) =>
      (p.material as THREE.MeshBasicMaterial).color.setHex(
        l.lit || i < l.deposited ? PAL.lanternOn : PIP_OFF,
      ),
    );
    lr.ring.visible = l.lit;
  }
  hemi.intensity = (0.15 + 0.55 * (lit / Math.max(1, sim.lanterns.length))) * AMBIENT_SCALE;

  pulseFx = Math.max(0, pulseFx - dt);
  shake = Math.max(0, shake - dt * 2.2);
  mayLight.intensity = 14 + (pulseFx > 0 ? 120 * pulseFx : 0);

  if (screen === "play" || screen === "result") {
    const dist = 11;
    camera.position.set(px - Math.sin(yaw) * dist, py + 7, pz - Math.cos(yaw) * dist);
    if (shake > 0)
      camera.position.add(
        new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0),
      );
    camera.lookAt(px, py + 1.5, pz);
  } else {
    // menus: a slow orbit around the island
    const cx = sim.map.night === 2 ? 35 : 0;
    const r = sim.map.night === 2 ? 95 : 70;
    camera.position.set(cx + Math.cos(t * 0.08) * r, 32, Math.sin(t * 0.08) * r);
    camera.lookAt(cx, 2, 0);
  }

  if (screen === "play" || screen === "result") {
    hud.update(sim, snap, helpLabels);
    drawMinimap(miniCtx, sim, snap, yaw, T, terrain, helpLabels, blinkOn);
    updateLabels(labelsEl, labelPool, sim, snap, camera, T, helpLabels);
    updateArrow(arrowEl, sim, camera);
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- boot
// CSS reads the warning / shade colours from the palette so there is one place to change them
// (re-applied on boot and on every palette switch); the `cb` class turns on the warning glyphs
onPaletteChange(() => {
  const root = document.documentElement;
  root.style.setProperty("--danger", css(PAL.danger));
  root.style.setProperty("--shade-rim", css(PAL.shadeRim));
  root.classList.toggle("cb", isColorBlind());
});
setColorBlind(settings.colorBlind);
loadNight(1, SEED_BASE);
setHudVisible(false);
requestAnimationFrame(frame);

// Dev-only test hook (stripped from production builds): lets browser tests set up a situation.
if (import.meta.env.DEV) {
  (window as unknown as { __ddl: unknown }).__ddl = {
    get sim() {
      return sim;
    },
    get fps() {
      return fps.value;
    },
    /** toggle the colour-blind palette exactly like the settings checkbox (persists too) */
    setColorBlind(on: boolean) {
      optColorBlind.checked = on;
      optColorBlind.dispatchEvent(new Event("change"));
    },
    /** lantern id -> { glow, tears, core, bar, ... } three.js objects, for visual assertions */
    get lanternRigs() {
      return lanternRigs;
    },
  };
}
