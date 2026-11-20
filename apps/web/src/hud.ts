import type { Sim, Tuning } from "@ddl/sim";

const ICON = {
  flame:
    '<svg viewBox="0 0 24 24"><path d="M12 2c.9 3.6 5.2 5.6 5.2 10.6A5.2 5.2 0 0 1 6.8 13c0-2.1 1-3.3 2.1-4.4.3 1.5 1 2.1 1.9 2.3C10.5 8 10.8 4.6 12 2z"/></svg>',
  spark:
    '<svg viewBox="0 0 24 24"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8.5V13l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 2.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.5 5.7 21l1.5-7L2 9.3l7-.8z"/></svg>',
  pulse:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6"/></svg>',
};

const lanternSvg = (i: number) =>
  `<svg viewBox="0 0 24 24"><defs><linearGradient id="hl${i}" x1="0" y1="1" x2="0" y2="0">` +
  `<stop id="hla${i}" offset="0" stop-color="#ffc35a"/><stop id="hlb${i}" offset="0" stop-color="#3a2f66"/>` +
  `</linearGradient></defs><path fill="url(#hl${i})" d="M10 2h4v2.2h-4zM8.2 5.2h7.6L18 8.4v7.2L15.8 19H8.2L6 15.6V8.4zM10 19.8h4V22h-4z"/>` +
  `<path fill="none" stroke="#9a86d8" stroke-width="1" d="M8.2 5.2h7.6L18 8.4v7.2L15.8 19H8.2L6 15.6V8.4z"/></svg>`;

export interface Hud {
  update(sim: Sim, helpLabels: boolean): void;
  reset(): void;
}

/** Game-style HUD: flames, fireflies, lanterns, time bar, score, pulse cooldown and an E prompt. */
export function createHud(root: HTMLElement, promptEl: HTMLElement, T: Tuning): Hud {
  const flames = Array.from(
    { length: T.flames },
    () => `<i class="ic flame">${ICON.flame}</i>`,
  ).join("");
  const pips = Array.from({ length: T.carry_capacity }, () => '<i class="pip"></i>').join("");
  const lanterns = Array.from(
    { length: T.lantern_count_night1 },
    (_, i) => `<i class="ic lantern">${lanternSvg(i)}</i>`,
  ).join("");

  root.innerHTML = `
    <div class="hud-card">
      <div class="hud-row"><span class="lab">Ngọn lửa</span><span class="icons" data-r="flames">${flames}</span></div>
      <div class="hud-row"><span class="lab">Đom đóm</span><span class="pips" data-r="pips">${pips}</span><b class="val" data-r="carryN"></b></div>
      <div class="hud-row"><span class="lab">Đèn lồng</span><span class="icons" data-r="lanterns">${lanterns}</span><b class="val" data-r="lit"></b></div>
      <div class="hud-time" data-r="timeBox"><i class="ic">${ICON.clock}</i><b data-r="time"></b><div class="bar"><i data-r="timeBar"></i></div></div>
      <div class="hud-bottom">
        <div class="score"><i class="ic">${ICON.star}</i><b data-r="score">0</b></div>
        <div class="pulse" data-r="pulseBox"><i class="ic">${ICON.pulse}</i><span class="lab">Xung sáng <kbd>F</kbd></span><div class="bar"><i data-r="pulseBar"></i></div><span class="state" data-r="pulseState"></span></div>
      </div>
      <div class="hud-keys"><kbd>P</kbd> Hướng dẫn <kbd>H</kbd> Nhãn<span data-r="hOn"></span></div>
    </div>`;

  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-r="${k}"]`)!;
  const flameEls = Array.from(q("flames").children) as HTMLElement[];
  const pipEls = Array.from(q("pips").children) as HTMLElement[];
  const lanternEls = Array.from(q("lanterns").children) as HTMLElement[];
  const el = {
    carryN: q("carryN"),
    lit: q("lit"),
    time: q("time"),
    timeBox: q("timeBox"),
    timeBar: q("timeBar"),
    score: q("score"),
    pulseBox: q("pulseBox"),
    pulseBar: q("pulseBar"),
    pulseState: q("pulseState"),
    hOn: q("hOn"),
  };
  const gradA = lanternEls.map((_, i) => root.querySelector<SVGStopElement>(`#hla${i}`)!);
  const gradB = lanternEls.map((_, i) => root.querySelector<SVGStopElement>(`#hlb${i}`)!);

  const cache = new Map<string, string>();
  const setText = (key: string, node: HTMLElement, v: string) => {
    if (cache.get(key) !== v) {
      cache.set(key, v);
      node.textContent = v;
    }
  };
  const setCls = (key: string, node: HTMLElement, cls: string, on: boolean) => {
    const k = `${key}:${cls}`;
    const v = on ? "1" : "0";
    if (cache.get(k) !== v) {
      cache.set(k, v);
      node.classList.toggle(cls, on);
    }
  };
  let lastScore = 0;

  return {
    reset() {
      cache.clear();
      lastScore = 0;
    },
    update(sim, helpLabels) {
      flameEls.forEach((f, i) => setCls(`f${i}`, f, "off", i >= sim.flames));
      pipEls.forEach((p, i) => setCls(`p${i}`, p, "on", i < sim.carried));
      setText("carryN", el.carryN, `${sim.carried}/${T.carry_capacity}`);

      let lit = 0;
      sim.lanterns.forEach((l, i) => {
        const frac = l.lit ? 1 : Math.min(1, l.deposited / T.lantern_cost);
        if (l.lit) lit++;
        const a = gradA[i];
        const b = gradB[i];
        const k = `g${i}`;
        const v = String(frac);
        if (a && b && cache.get(k) !== v) {
          cache.set(k, v);
          a.setAttribute("offset", String(frac));
          b.setAttribute("offset", String(frac));
        }
        const node = lanternEls[i];
        if (node) {
          setCls(`l${i}`, node, "lit", l.lit);
          setCls(`l${i}`, node, "part", !l.lit && frac > 0);
        }
      });
      setText("lit", el.lit, `${lit}/${sim.lanterns.length}`);

      const left = Math.ceil(sim.timeLeft);
      setText("time", el.time, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
      const tf = sim.timeLeft / T.night1_duration_s;
      el.timeBar.style.width = `${Math.max(0, Math.min(1, tf)) * 100}%`;
      setCls("time", el.timeBox, "low", sim.timeLeft <= 30);

      if (sim.score !== lastScore) {
        lastScore = sim.score;
        el.score.textContent = String(sim.score);
        el.score.classList.remove("bump");
        void el.score.offsetWidth; // restart the CSS animation
        el.score.classList.add("bump");
      }

      const noLight = sim.carried < T.pulse_cost;
      const cooling = sim.pulseCd > 0;
      el.pulseBar.style.width = `${(cooling ? 1 - sim.pulseCd / T.pulse_cooldown_s : 1) * 100}%`;
      setCls("pulse", el.pulseBox, "ready", !cooling && !noLight);
      setCls("pulse", el.pulseBox, "wait", cooling || noLight);
      setText(
        "pulseState",
        el.pulseState,
        cooling ? `${sim.pulseCd.toFixed(1)}s` : noLight ? "cần đom đóm" : "sẵn sàng",
      );
      setText("hOn", el.hOn, helpLabels ? " · đang bật" : "");

      const near = sim.lanterns.find(
        (l) =>
          !l.lit && Math.hypot(l.pos[0] - sim.pos[0], l.pos[2] - sim.pos[2]) <= T.interact_radius,
      );
      if (near && sim.state === "playing") {
        const msg =
          sim.carried > 0
            ? `Nhấn <kbd>E</kbd> để nạp đèn ${near.id} (${near.deposited}/${T.lantern_cost})`
            : `Đèn ${near.id} cần đom đóm — hãy đi nhặt thêm`;
        if (cache.get("prompt") !== msg) {
          cache.set("prompt", msg);
          promptEl.innerHTML = msg;
        }
        promptEl.classList.add("show");
        promptEl.classList.toggle("warn", sim.carried === 0);
      } else {
        promptEl.classList.remove("show");
      }
    },
  };
}
