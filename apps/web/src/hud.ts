import type { Sim, Snapshot, Tuning } from "@ddl/sim";
import { formatKeyCode, type Settings } from "./settings.ts";

const idNum = (id: string): number => Number(id.slice(1));

const ICON = {
  flame:
    '<svg viewBox="0 0 24 24"><path d="M12 2c.9 3.6 5.2 5.6 5.2 10.6A5.2 5.2 0 0 1 6.8 13c0-2.1 1-3.3 2.1-4.4.3 1.5 1 2.1 1.9 2.3C10.5 8 10.8 4.6 12 2z"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8.5V13l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 2.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.5 5.7 21l1.5-7L2 9.3l7-.8z"/></svg>',
  lantern:
    '<svg viewBox="0 0 24 24"><path d="M10 2h4v2.2h-4zM8.2 5.2h7.6L18 8.4v7.2L15.8 19H8.2L6 15.6V8.4zM10 19.8h4V22h-4z"/></svg>',
  dash: '<svg viewBox="0 0 24 24"><path d="M3 8h9M1 12h12M3 16h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 5l8 7-8 7z"/></svg>',
  pulse:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6"/></svg>',
  charm:
    '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="17" rx="2"/><circle cx="12" cy="10" r="3" fill="none" stroke="#f2c14e" stroke-width="1.6"/><path d="M12 19v3" stroke="currentColor" stroke-width="2"/></svg>',
};

export interface Hud {
  update(sim: Sim, snap: Snapshot, helpLabels: boolean, settings?: Settings): void;
  reset(): void;
}

/**
 * HUD in the ticket's layout: flames (top left), clock (top centre), lanterns + score (top right),
 * a 10-cell firefly bar (bottom centre), dash / pulse cooldowns and the charm (bottom right),
 * and an "E" prompt near an unlit lantern.
 */
export function createHud(root: HTMLElement, promptEl: HTMLElement, T: Tuning): Hud {
  const flames = Array.from(
    { length: T.flames },
    () => `<i class="ic flame">${ICON.flame}</i>`,
  ).join("");
  const cells = Array.from({ length: T.capacity_max }, () => '<i class="cell"></i>').join("");

  root.innerHTML = `
    <div class="z tl"><span class="lab">Ngọn Lửa</span><span class="flames" data-r="flames">${flames}</span></div>
    <div class="z tc" data-r="timeBox"><i class="ic">${ICON.clock}</i><b data-r="time"></b></div>
    <div class="z tr">
      <div class="lamps"><i class="ic">${ICON.lantern}</i><span class="lab">Đèn</span><b data-r="lit"></b></div>
      <div class="score"><i class="ic">${ICON.star}</i><b data-r="score">0</b></div>
    </div>
    <div class="z bc"><div class="fbar" data-r="cells">${cells}</div><div class="fcount"><span class="lab">Đom đóm</span> <b data-r="carryN"></b></div></div>
    <div class="z br">
      <div class="cd" data-r="charmBox"><div class="ring"><i class="ic">${ICON.charm}</i></div><span class="nm">Bùa Gió</span><span class="st" data-r="charmSt"></span></div>
      <div class="cd" data-r="dashBox"><div class="ring"><i class="ic">${ICON.dash}</i></div><span class="nm">Lướt <kbd data-r="kDash">Shift</kbd></span><span class="st" data-r="dashSt"></span></div>
      <div class="cd" data-r="pulseBox"><div class="ring"><i class="ic">${ICON.pulse}</i></div><span class="nm">Tỏa Sáng <kbd data-r="kPulse">F</kbd></span><span class="st" data-r="pulseSt"></span></div>
    </div>
    <div class="keys"><kbd>Esc</kbd>/<kbd data-r="kPause">P</kbd> Tạm dừng · <kbd>H</kbd> Nhãn<span data-r="hOn"></span></div>`;

  const q = <E extends HTMLElement>(k: string) => root.querySelector<E>(`[data-r="${k}"]`)!;
  const flameEls = Array.from(q("flames").children) as HTMLElement[];
  const cellEls = Array.from(q("cells").children) as HTMLElement[];
  const el = {
    time: q("time"),
    timeBox: q("timeBox"),
    lit: q("lit"),
    score: q("score"),
    carryN: q("carryN"),
    charmBox: q("charmBox"),
    charmSt: q("charmSt"),
    dashBox: q("dashBox"),
    dashSt: q("dashSt"),
    pulseBox: q("pulseBox"),
    pulseSt: q("pulseSt"),
    hOn: q("hOn"),
    kDash: q("kDash"),
    kPulse: q("kPulse"),
    kPause: q("kPause"),
  };

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
  const ring = (box: HTMLElement, frac: number) => {
    const v = frac.toFixed(2);
    if (box.dataset.p !== v) {
      box.dataset.p = v;
      box.style.setProperty("--p", v);
    }
  };
  let lastScore = 0;

  return {
    reset() {
      cache.clear();
      lastScore = 0;
    },
    update(sim, snap, helpLabels, settings) {
      if (settings) {
        setText("kDash", el.kDash, formatKeyCode(settings.keys.dash));
        setText("kPulse", el.kPulse, formatKeyCode(settings.keys.pulse));
        setText("kPause", el.kPause, formatKeyCode(settings.keys.pause));
      }
      const interactKey = settings ? formatKeyCode(settings.keys.interact) : "E";
      const cap = snap.player.capacity;
      flameEls.forEach((f, i) => setCls(`f${i}`, f, "off", i >= sim.flames));
      cellEls.forEach((c, i) => {
        setCls(`c${i}`, c, "on", i < sim.carried);
        setCls(`c${i}`, c, "hide", i >= cap);
      });
      setText("carryN", el.carryN, `${snap.player.carried}/${cap}`);

      const left = Math.ceil(sim.timeLeft);
      setText(
        "time",
        el.time,
        `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`,
      );
      setCls("time", el.timeBox, "low", sim.timeLeft <= 30);

      const lit = sim.lanterns.filter((l) => l.lit).length;
      setText("lit", el.lit, `${lit}/${sim.lanterns.length}`);
      if (sim.score !== lastScore) {
        lastScore = sim.score;
        el.score.textContent = String(sim.score);
        el.score.classList.remove("bump");
        void el.score.offsetWidth; // restart the CSS animation
        el.score.classList.add("bump");
      }

      // dash: ready fraction from the cooldown (a charm removes it)
      const dashTotal = T.dash_cooldown_s * 60;
      ring(el.dashBox, sim.dashCd > 0 ? 1 - sim.dashCd / dashTotal : 1);
      setCls("dash", el.dashBox, "ready", sim.dashCd === 0);
      setText(
        "dashSt",
        el.dashSt,
        sim.dashCd > 0 ? `${(sim.dashCd / 60).toFixed(1)}s` : "sẵn sàng",
      );

      const noLight = sim.carried < T.pulse_cost;
      const pulseTotal = T.pulse_cooldown_s * 60;
      ring(el.pulseBox, sim.pulseCd > 0 ? 1 - sim.pulseCd / pulseTotal : 1);
      setCls("pulse", el.pulseBox, "ready", sim.pulseCd === 0 && !noLight);
      setCls("pulse", el.pulseBox, "wait", sim.pulseCd > 0 || noLight);
      setText(
        "pulseSt",
        el.pulseSt,
        sim.pulseCd > 0
          ? `${(sim.pulseCd / 60).toFixed(1)}s`
          : noLight
            ? `cần ${T.pulse_cost}`
            : "sẵn sàng",
      );

      setCls("charm", el.charmBox, "gone", sim.charm === 0);
      ring(el.charmBox, sim.charm / 600);
      setText("charmSt", el.charmSt, sim.charm > 0 ? `${(sim.charm / 60).toFixed(1)}s` : "—");
      setText("hOn", el.hOn, helpLabels ? " · đang bật" : "");

      // display hint only: nearest eligible lantern in range (tie: lower id); the sim decides the action
      let near: Snapshot["lanterns"][number] | undefined;
      let nearD = Infinity;
      for (const l of snap.lanterns) {
        if (l.lit && l.fuel >= T.fuel_max) continue;
        const d = Math.hypot(l.pos[0] - sim.pos[0], l.pos[2] - sim.pos[2]);
        if (d > T.interact_radius) continue;
        if (d < nearD || (d === nearD && near && idNum(l.id) < idNum(near.id))) {
          near = l;
          nearD = d;
        }
      }
      if (near && sim.outcome === null) {
        const cost = near.ever_lit ? T.relight_cost : T.lantern_cost;
        const progress = near.lit ? "" : ` (${near.deposited}/${cost})`;
        const msg =
          snap.player.carried > 0
            ? `<kbd>${interactKey}</kbd> — ${near.lit ? "Châm dầu" : "Nạp ánh sáng"}${progress}`
            : `Đèn ${near.id}${progress} cần đom đóm — hãy đi nhặt thêm`;
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
