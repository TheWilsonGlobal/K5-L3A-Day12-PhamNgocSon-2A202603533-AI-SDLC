import * as THREE from "three";
import { ISLAND_RADIUS, Sim, defaultInput, type Contract, type InputState } from "@ddl/sim";
import contract from "../../../game.contract.json";
import { MINIMAP_SIZE, drawMinimap, updateLabels } from "./overlay.ts";
import { createMay, createShade, type ShadeRig } from "./characters.ts";
import { createHud } from "./hud.ts";

const T = (contract as Contract).tuning;
const DT = 1 / 60;

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120a26);
scene.fog = new THREE.FogExp2(0x120a26, 0.022);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener("resize", resize);
resize();

scene.add(new THREE.HemisphereLight(0x7a6ad8, 0x2a1d4a, 1.5));
const ground = new THREE.Mesh(
  new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 1.5, 2, 48),
  new THREE.MeshStandardMaterial({ color: 0x3a3160, roughness: 1 }),
);
ground.position.y = -1;
scene.add(ground);

// Mây: character rig (head, hair, áo dài, limbs, nón lá with a hanging lantern).
const may = createMay();
scene.add(may.group);
const mayLight = may.light;

const lanternMeshes = new Map<
  string,
  { glow: THREE.Mesh; light: THREE.PointLight; ring: THREE.Mesh; pips: THREE.Mesh[] }
>();
const lanternGroup = new THREE.Group();
scene.add(lanternGroup);
const COLOR_DIM = new THREE.Color(0x4a3a7a);
const COLOR_LIT = new THREE.Color(0xffc35a);
const PIP_OFF = 0x2a2145;
const PIP_ON = 0xffb04a;
const shadeMeshes = new Map<string, ShadeRig>();
const idSeed = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
let lastT = 0;
const moteMeshes = new Map<string, THREE.Mesh>();
const moteGeo = new THREE.SphereGeometry(0.18, 8, 8);
const moteMat = new THREE.MeshBasicMaterial({ color: 0xfff08a });
const ringGeo = new THREE.RingGeometry(T.safe_radius - 0.15, T.safe_radius, 48);

// ---------- game state ----------
let sim = new Sim(T, 1);
let seed = 1;
let pulseFx = 0;
const hud = createHud(document.getElementById("hud")!, document.getElementById("prompt")!, T);
const endEl = document.getElementById("end")!;
const guideEl = document.getElementById("guide")!;
const labelsEl = document.getElementById("labels")!;
const labelPool = new Map<string, HTMLDivElement>();
const miniCanvas = document.getElementById("minimap") as HTMLCanvasElement;
miniCanvas.width = miniCanvas.height = MINIMAP_SIZE;
const miniCtx = miniCanvas.getContext("2d")!;
let paused = false;
let helpLabels = false;

function setPaused(p: boolean): void {
  paused = p && sim.state === "playing";
  guideEl.classList.toggle("show", paused);
}

function buildWorld(): void {
  lanternGroup.clear(); // poles, glows, lights, rings and pips of the previous game
  lanternMeshes.clear();
  for (const r of shadeMeshes.values()) scene.remove(r.group);
  shadeMeshes.clear();
  for (const m of moteMeshes.values()) scene.remove(m);
  moteMeshes.clear();
  for (const l of sim.lanterns) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3a5e }),
    );
    pole.position.set(l.pos[0], 2, l.pos[2]);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x4a3a7a }),
    );
    glow.position.set(l.pos[0], 4.4, l.pos[2]);
    const light = new THREE.PointLight(0xffa73a, 0, 30);
    light.position.copy(glow.position);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffa73a,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(l.pos[0], 0.03, l.pos[2]);
    ring.visible = false;
    ring.name = `ring-${l.id}`;
    // one pip per firefly the lantern needs; they light up as fireflies are deposited
    const pips: THREE.Mesh[] = [];
    for (let i = 0; i < T.lantern_cost; i++) {
      const a = (2 * Math.PI * i) / T.lantern_cost;
      const pip = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 10, 10),
        new THREE.MeshBasicMaterial({ color: PIP_OFF }),
      );
      pip.position.set(l.pos[0] + 1.2 * Math.sin(a), 4.4, l.pos[2] + 1.2 * Math.cos(a));
      pips.push(pip);
      lanternGroup.add(pip);
    }
    lanternGroup.add(pole, glow, light, ring);
    lanternMeshes.set(l.id, { glow, light, ring, pips });
  }
}

function restart(): void {
  seed += 1;
  sim = new Sim(T, seed);
  hud.reset();
  setPaused(false);
  pulseFx = 0;
  endEl.classList.remove("show");
  buildWorld();
}
buildWorld();

// ---------- input ----------
const keys = new Set<string>();
const tapped = new Set<string>();
let yaw = 0;
let prevJump = false;
addEventListener("keydown", (e) => {
  keys.add(e.code);
  tapped.add(e.code);
  if (e.code === "Space") e.preventDefault();
  if (e.code === "Enter" && sim.state !== "playing") restart();
  if (e.repeat) return;
  if (e.code === "KeyH") helpLabels = !helpLabels;
  if (e.code === "KeyP" || e.code === "KeyG" || e.code === "Escape") setPaused(!paused);
});
document.getElementById("resume")!.addEventListener("click", () => setPaused(false));
addEventListener("keyup", (e) => keys.delete(e.code));
let dragging = false;
addEventListener("pointerdown", () => (dragging = true));
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (dragging) yaw -= e.movementX * 0.006;
});
document.getElementById("again")!.addEventListener("click", restart);

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
  if (keys.has("KeyQ")) yaw += 0.03;
  if (keys.has("KeyR")) yaw -= 0.03;
  i.cam_yaw_deg = (yaw * 180) / Math.PI;
  // A tap shorter than one rendered frame must still count, so taps are latched until read.
  i.jump = keys.has("Space") || tapped.has("Space");
  i.interact = keys.has("KeyE") || tapped.has("KeyE");
  i.pulse = keys.has("KeyF") || tapped.has("KeyF");
  tapped.clear();
  return i;
}

// ---------- loop ----------
let acc = 0;
let last = performance.now();
let lanternAnim = 0;

function frame(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  const input = readInput();
  if (paused) acc = 0; // frozen: no sim steps, no time passing
  while (acc >= DT) {
    for (const e of sim.step(input)) {
      if (e.name === "pulse") pulseFx = 0.5;
      if (e.name === "game_over") showEnd();
    }
    acc -= DT;
  }
  prevJump = input.jump;
  void prevJump;
  render(now / 1000);
  requestAnimationFrame(frame);
}

function showEnd(): void {
  const won = sim.state === "won";
  document.getElementById("endTitle")!.textContent = won
    ? "Đảo đã sáng! 🏮"
    : "Sương đen nuốt mất ánh sáng…";
  document.getElementById("endText")!.textContent =
    `Điểm: ${sim.score} · Đèn đã thắp: ${sim.lanterns.filter((l) => l.lit).length}/${sim.lanterns.length}`;
  endEl.classList.add("show");
}

function syncMeshes<M extends THREE.Mesh>(
  map: Map<string, M>,
  items: { id: string; pos: [number, number, number] }[],
  make: () => M,
): void {
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(it.id);
    let m = map.get(it.id);
    if (!m) {
      m = make();
      map.set(it.id, m);
      scene.add(m);
    }
    m.position.set(it.pos[0], m.userData.lift ?? it.pos[1], it.pos[2]);
  }
  for (const [id, m] of map) {
    if (!seen.has(id)) {
      scene.remove(m);
      map.delete(id);
    }
  }
}

function render(t: number): void {
  const [px, py, pz] = sim.pos;
  const dt = lastT === 0 ? 1 / 60 : t - lastT;
  lastT = t;
  may.update(t, paused ? 1e-4 : dt, px, py, pz);
  may.group.visible = !(sim.invuln > 0 && Math.floor(t * 12) % 2 === 0);

  syncMeshes(
    moteMeshes,
    sim.motes.map((m) => ({
      id: m.id,
      pos: [m.pos[0], 0.8 + Math.sin(t * 3 + m.pos[0]) * 0.2, m.pos[2]],
    })),
    () => new THREE.Mesh(moteGeo, moteMat),
  );
  const seenShades = new Set<string>();
  for (const s of sim.shades) {
    seenShades.add(s.id);
    let rig = shadeMeshes.get(s.id);
    if (!rig) {
      rig = createShade(idSeed(s.id));
      shadeMeshes.set(s.id, rig);
      scene.add(rig.group);
    }
    rig.update(t, dt, s.state === "stunned", s.pos[0], s.pos[2], px, pz);
  }
  for (const [id, rig] of shadeMeshes) {
    if (!seenShades.has(id)) {
      scene.remove(rig.group);
      shadeMeshes.delete(id);
    }
  }

  lanternAnim += 0.02;
  for (const l of sim.lanterns) {
    const lm = lanternMeshes.get(l.id);
    if (!lm) continue;
    const frac = l.lit ? 1 : l.deposited / T.lantern_cost;
    // glow warms and grows continuously with the deposited fraction
    (lm.glow.material as THREE.MeshBasicMaterial).color.copy(COLOR_DIM).lerp(COLOR_LIT, frac);
    lm.glow.scale.setScalar(l.lit ? 1.35 : 0.85 + 0.4 * frac);
    lm.light.intensity = l.lit ? 60 + Math.sin(t * 5 + lanternAnim) * 6 : 3 + frac * 22;
    lm.pips.forEach((p, i) =>
      (p.material as THREE.MeshBasicMaterial).color.setHex(
        l.lit || i < l.deposited ? PIP_ON : PIP_OFF,
      ),
    );
    lm.ring.visible = l.lit;
  }

  pulseFx = Math.max(0, pulseFx - 1 / 60);
  mayLight.intensity = 14 + (pulseFx > 0 ? 120 * pulseFx : 0);

  const dist = 11;
  camera.position.set(px - Math.sin(yaw) * dist, py + 7, pz - Math.cos(yaw) * dist);
  camera.lookAt(px, py + 1.5, pz);

  hud.update(sim, helpLabels);
  drawMinimap(miniCtx, sim, yaw, T, helpLabels);
  updateLabels(labelsEl, labelPool, sim, camera, T, helpLabels);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);

// Dev-only test hook (stripped from production builds): lets browser tests set up a situation.
if (import.meta.env.DEV) {
  (window as unknown as { __ddl: unknown }).__ddl = {
    get sim() {
      return sim;
    },
  };
}
