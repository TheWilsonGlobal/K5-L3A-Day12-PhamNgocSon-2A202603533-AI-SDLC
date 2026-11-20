import * as THREE from "three";
import type { Sim, Snapshot, Tuning } from "@ddl/sim";
import { PAL, css, isColorBlind } from "./palette.ts";
import type { TerrainImage } from "./world.ts";

export const MINIMAP_SIZE = 180;
const VIEW_RADIUS_M = 42;

/**
 * Minimap: a window of ~42 m around Mây, rotated so the camera's forward direction points up.
 * Forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw).
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  snap: Snapshot,
  yaw: number,
  T: Tuning,
  terrain: TerrainImage,
  help: boolean,
  blinkOn: boolean,
): void {
  const S = MINIMAP_SIZE;
  const c = S / 2;
  const scale = (c - 6) / VIEW_RADIUS_M;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const px = sim.pos[0];
  const pz = sim.pos[2];
  const map = (x: number, z: number): [number, number] => [
    c + ((x - px) * rx + (z - pz) * rz) * scale,
    c - ((x - px) * fx + (z - pz) * fz) * scale,
  ];

  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "rgba(8, 12, 30, 0.9)";
  ctx.fillRect(0, 0, S, S);

  // terrain, drawn in world metres through the same rotation
  ctx.save();
  ctx.setTransform(
    rx * scale,
    -fx * scale,
    rz * scale,
    -fz * scale,
    c - (rx * px + rz * pz) * scale,
    c + (fx * px + fz * pz) * scale,
  );
  ctx.drawImage(terrain.canvas, terrain.minX, terrain.minZ, terrain.widthM, terrain.heightM);
  ctx.restore();

  for (const l of sim.lanterns) {
    if (!l.lit) continue;
    const [x, y] = map(l.pos[0], l.pos[2]);
    ctx.fillStyle = "rgba(255, 179, 71, 0.16)";
    ctx.beginPath();
    ctx.arc(x, y, T.safe_radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const m of sim.motes) {
    const [x, y] = map(m.pos[0], m.pos[2]);
    ctx.fillStyle = css(PAL.mapMoteBack);
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = css(PAL.mapMote);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  for (const ch of sim.charms) {
    if (!ch.available) continue;
    const [x, y] = map(ch.pos[0], ch.pos[2]);
    ctx.fillStyle = css(PAL.scarf);
    ctx.strokeStyle = css(PAL.gold);
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 3, y - 4, 6, 8);
    ctx.strokeRect(x - 3, y - 4, 6, 8);
  }

  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of snap.lanterns) {
    const [x, y] = map(l.pos[0], l.pos[2]);
    const low = l.lit && l.fuel < T.low_fuel_threshold;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = css(l.lit ? PAL.lanternOn : PAL.mapUnlit);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(
      low && blinkOn ? PAL.danger : l.lit ? PAL.mapLanternRimOn : PAL.mapLanternRimOff,
    );
    ctx.stroke();
    if (!l.lit && l.deposited > 0) {
      const cost = l.ever_lit ? T.relight_cost : T.lantern_cost;
      ctx.beginPath();
      ctx.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + (l.deposited / cost) * Math.PI * 2);
      ctx.strokeStyle = css(PAL.lanternOn);
      ctx.stroke();
    }
    ctx.fillStyle = css(l.lit ? PAL.mapLanternTextOn : PAL.mapLanternTextOff);
    ctx.fillText(l.id.slice(1), x, y + 0.5);
    if (low && blinkOn && isColorBlind()) {
      // white warning is not enough on its own: add the glyph above the lantern
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillStyle = css(PAL.danger);
      ctx.fillText("⚠", x, y - 13);
      ctx.font = "bold 10px system-ui, sans-serif";
    }
  }
  for (const s of sim.shades) {
    const [x, y] = map(s.pos[0], s.pos[2]);
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = css(
      s.state === "stunned"
        ? PAL.mapShadeStun
        : s.state === "drain"
          ? PAL.shadeDrain
          : PAL.shadeRim,
    );
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.53)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (s.state === "drain") {
      const tl = sim.lanterns.find((l) => l.id === s.target_lantern_id);
      if (!tl) throw new Error(`shade ${s.id} in drain without a known target lantern`);
      const [lx, ly] = map(tl.pos[0], tl.pos[2]);
      ctx.strokeStyle = css(PAL.shadeDrain);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const d of sim.drifters) {
    const [x, y] = map(d.pos[0], d.pos[2]);
    ctx.strokeStyle = css(PAL.drifter);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 2);
    ctx.quadraticCurveTo(x, y - 4, x + 5, y + 2);
    ctx.stroke();
  }

  // Mây at the centre
  ctx.fillStyle = css(PAL.mapPlayer);
  ctx.beginPath();
  ctx.moveTo(c, c - 7);
  ctx.lineTo(c + 5, c + 5);
  ctx.lineTo(c - 5, c + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(PAL.lanternOn);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "rgba(242, 193, 78, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.stroke();
  if (help) {
    ctx.fillStyle = css(PAL.text);
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("↑ hướng camera", c, 12);
  }
}

const STATE_VI: Record<string, string> = {
  spawning: "đang hiện ra",
  wander: "lang thang",
  chase: "đang đuổi",
  recoil: "lùi lại",
  stunned: "bị choáng",
  drain: "đang hút dầu đèn",
  idle: "lượn chậm",
  flee: "bay trốn",
};

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
  snap: Snapshot,
  camera: THREE.Camera,
  T: Tuning,
  help: boolean,
): void {
  const specs: LabelSpec[] = [];
  const near = (x: number, z: number, r: number) => Math.hypot(x - sim.pos[0], z - sim.pos[2]) <= r;
  // Lantern badge is always on ("4/10", or "✔ 72" = lit with 72 fuel); H expands it to a sentence.
  for (const l of snap.lanterns) {
    const inRange = near(l.pos[0], l.pos[2], T.interact_radius);
    const cost = l.ever_lit ? T.relight_cost : T.lantern_cost;
    const fuel = Math.round(l.fuel);
    const short = l.lit ? `✔ ${fuel}` : `${l.deposited}/${cost}`;
    const full = l.lit
      ? `đang sáng · dầu ${fuel}/${T.fuel_max}${inRange && l.fuel < T.fuel_max ? " · nhấn E để châm dầu" : ""}`
      : `${l.deposited}/${cost} đom đóm${inRange ? " · nhấn E để nạp" : ""}`;
    specs.push({
      id: `l-${l.id}`,
      pos: [l.pos[0], l.pos[1] + 5.6, l.pos[2]],
      text: help ? `Đèn ${l.id} · ${full}` : `${l.id} · ${short}`,
      cls: l.lit ? "lit" : "lantern",
    });
  }
  if (help) {
    specs.push({
      id: "may",
      pos: [sim.pos[0], sim.pos[1] + 3, sim.pos[2]],
      text: `Mây (bạn) · mang ${snap.player.carried}/${snap.player.capacity}`,
      cls: "may",
    });
    for (const s of sim.shades)
      specs.push({
        id: `s-${s.id}`,
        pos: [s.pos[0], s.pos[1] + 1.4, s.pos[2]],
        text: `Bóng Mực ${s.id} · ${STATE_VI[s.state]}${s.state === "chase" ? " — nhấn F để xua" : ""}`,
        cls: "shade",
      });
    for (const d of sim.drifters)
      specs.push({
        id: `d-${d.id}`,
        pos: [d.pos[0], d.pos[1] + 0.9, d.pos[2]],
        text: `Gió Lạc ${d.id} · ${STATE_VI[d.state]}${d.stolen ? ` · giữ ${d.stolen} đom đóm` : ""}`,
        cls: "drifter",
      });
    for (const c of sim.charms)
      specs.push({
        id: `c-${c.id}`,
        pos: [c.pos[0], c.pos[1] + 2.2, c.pos[2]],
        text: `Bùa Gió ${c.id} · ${c.available ? "chạy nhanh + lướt liên tục" : `hồi sau ${Math.ceil(c.respawn / 60)}s`}`,
        cls: "charm",
      });
    for (const m of sim.motes)
      specs.push({
        id: `m-${m.id}`,
        pos: [m.pos[0], m.pos[1] + 1.3, m.pos[2]],
        text: m.kind === "dropped" ? "Đom đóm rơi" : "Đom đóm",
        cls: "mote",
      });
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

/** Arrow at the screen edge pointing to the nearest unlit lantern when it is off screen. */
export function updateArrow(el: HTMLElement, sim: Sim, camera: THREE.Camera): void {
  let best: Sim["lanterns"][number] | undefined;
  let bestD = Infinity;
  for (const l of sim.lanterns) {
    if (l.lit) continue;
    const d = Math.hypot(l.pos[0] - sim.pos[0], l.pos[1] - sim.pos[1], l.pos[2] - sim.pos[2]);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  if (!best || sim.outcome) {
    el.style.display = "none";
    return;
  }
  v.set(best.pos[0], best.pos[1] + 4.4, best.pos[2]).project(camera);
  const behind = v.z > 1;
  let nx = behind ? -v.x : v.x;
  let ny = behind ? -v.y : v.y;
  const inside = !behind && Math.abs(v.x) <= 0.94 && Math.abs(v.y) <= 0.9;
  if (inside) {
    el.style.display = "none";
    return;
  }
  const m = Math.max(Math.abs(nx) / 0.9, Math.abs(ny) / 0.82, 1e-6);
  nx /= m;
  ny /= m;
  const w = window.innerWidth;
  const h = window.innerHeight;
  el.style.display = "flex";
  el.style.transform = `translate(${((nx * 0.9 + 1) / 2) * w}px, ${((1 - ny * 0.82) / 2) * h}px) translate(-50%, -50%)`;
  const ang = Math.atan2(nx * w, ny * h); // clockwise from "up" toward the lantern
  const tip = el.querySelector<HTMLElement>(".tip");
  if (tip) tip.style.transform = `rotate(${ang}rad)`;
  const lab = el.querySelector<HTMLElement>(".dist");
  if (lab) lab.textContent = `${best.id} · ${Math.round(bestD)} m`;
}
