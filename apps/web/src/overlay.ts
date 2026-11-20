import * as THREE from "three";
import { ISLAND_RADIUS, type Sim, type Tuning } from "@ddl/sim";

export const MINIMAP_SIZE = 200;

/**
 * Minimap: the whole island, rotated about its centre so the camera's forward
 * direction points up. Forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw).
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  yaw: number,
  T: Tuning,
  help: boolean,
): void {
  const S = MINIMAP_SIZE;
  const c = S / 2;
  const scale = (c - 8) / ISLAND_RADIUS;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const map = (x: number, z: number): [number, number] => [
    c + (x * rx + z * rz) * scale,
    c - (x * fx + z * fz) * scale,
  ];

  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "rgba(20, 12, 40, 0.78)";
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 176, 74, 0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // safe zones around lit lanterns
  for (const l of sim.lanterns) {
    if (!l.lit) continue;
    const [x, y] = map(l.pos[0], l.pos[2]);
    ctx.fillStyle = "rgba(255, 167, 58, 0.16)";
    ctx.beginPath();
    ctx.arc(x, y, T.safe_radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // fireflies
  ctx.fillStyle = "#fff08a";
  for (const m of sim.motes) {
    const [x, y] = map(m.pos[0], m.pos[2]);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }

  // lanterns
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of sim.lanterns) {
    const [x, y] = map(l.pos[0], l.pos[2]);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = l.lit ? "#ffc35a" : "#2a2145";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = l.lit ? "#fff2c8" : "#9a86d8";
    ctx.stroke();
    if (!l.lit && l.deposited > 0) {
      ctx.beginPath();
      ctx.arc(x, y, 8, -Math.PI / 2, -Math.PI / 2 + (l.deposited / T.lantern_cost) * Math.PI * 2);
      ctx.strokeStyle = "#ffb04a";
      ctx.stroke();
    }
    ctx.fillStyle = l.lit ? "#3a2200" : "#d8cfff";
    ctx.fillText(l.id.slice(1), x, y + 0.5);
  }

  // shades
  for (const s of sim.shades) {
    const [x, y] = map(s.pos[0], s.pos[2]);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = s.state === "stunned" ? "#4a8aff" : "#a23cff";
    ctx.fill();
    ctx.strokeStyle = "#ffffff88";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // player: triangle pointing at the direction of travel's reference (up = camera forward)
  const [px, py] = map(sim.pos[0], sim.pos[2]);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(px, py - 7);
  ctx.lineTo(px + 5, py + 5);
  ctx.lineTo(px - 5, py + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ffa73a";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (help) {
    ctx.fillStyle = "#ffe9c2";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("↑ hướng camera", c, 12);
  }
}

interface LabelSpec {
  id: string;
  pos: [number, number, number];
  text: string;
  cls: string;
}

const v = new THREE.Vector3();

/** Projects every entity to screen space and shows a text label above it (press H). */
export function updateLabels(
  container: HTMLElement,
  pool: Map<string, HTMLDivElement>,
  sim: Sim,
  camera: THREE.Camera,
  T: Tuning,
  help: boolean,
): void {
  const specs: LabelSpec[] = [];
  const near = (x: number, z: number, r: number) => Math.hypot(x - sim.pos[0], z - sim.pos[2]) <= r;
  // Lantern progress badge is always on ("2/4" or "✔"); H expands it to a full sentence.
  for (const l of sim.lanterns) {
    const inRange = near(l.pos[0], l.pos[2], T.interact_radius);
    const short = l.lit ? "✔ sáng" : `${l.deposited}/${T.lantern_cost}`;
    const full = l.lit
      ? "đã sáng ✔"
      : `${l.deposited}/${T.lantern_cost} đom đóm${inRange ? " · nhấn E để nạp" : ""}`;
    specs.push({
      id: `l-${l.id}`,
      pos: [l.pos[0], 5.6, l.pos[2]],
      text: help ? `Đèn ${l.id} · ${full}` : `${l.id} · ${short}`,
      cls: l.lit ? "lit" : "lantern",
    });
  }
  if (help) {
    specs.push({
      id: "may",
      pos: [sim.pos[0], sim.pos[1] + 3, sim.pos[2]],
      text: `Mây (bạn) · mang ${sim.carried}/${T.carry_capacity}`,
      cls: "may",
    });
    for (const s of sim.shades)
      specs.push({
        id: `s-${s.id}`,
        pos: [s.pos[0], 2.2, s.pos[2]],
        text: `Bóng Mực ${s.id} · ${s.state === "stunned" ? "bị choáng" : "đang đuổi — nhấn F để xua"}`,
        cls: "shade",
      });
    for (const m of sim.motes)
      specs.push({ id: `m-${m.id}`, pos: [m.pos[0], 1.3, m.pos[2]], text: "Đom đóm", cls: "mote" });
  }

  const seen = new Set<string>();
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const s of specs) {
    v.set(s.pos[0], s.pos[1], s.pos[2]).project(camera);
    const onScreen = v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1.02 && Math.abs(v.y) <= 1.02;
    if (!onScreen) continue;
    seen.add(s.id);
    let el = pool.get(s.id);
    if (!el) {
      el = document.createElement("div");
      container.appendChild(el);
      pool.set(s.id, el);
    }
    el.className = `lbl ${s.cls}`;
    if (el.textContent !== s.text) el.textContent = s.text;
    el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
  }
  for (const [id, el] of pool) {
    if (!seen.has(id)) {
      el.remove();
      pool.delete(id);
    }
  }
}
