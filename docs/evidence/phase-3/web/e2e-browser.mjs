// Phase 3 browser end-to-end check (real GPU Chrome via DevTools).
// usage: node e2e-browser.mjs [url] [profileDir] [port]   (Vite dev server must be running; dev hook window.__ddl)
// Staging through window.__ddl.sim is dev-only and is stated per step in the log.
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? "http://127.0.0.1:5465/";
const prof = resolve(process.argv[3] ?? resolve(here, "../../../../out/tr2-profile"));
const port = process.argv[4] ?? "9361";
mkdirSync(prof, { recursive: true });

const lines = [];
const log = (k, v) => {
  const l = k.padEnd(34) + (typeof v === "string" ? v : JSON.stringify(v));
  console.log(l);
  lines.push(l);
};
const checks = [];
const check = (id, name, pass, detail) => {
  checks.push({ id, name, pass });
  log(`[${pass ? "PASS" : "FAIL"}] ${id} ${name}`, detail);
};

const chrome = spawn(
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--use-angle=d3d11",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    `--remote-debugging-port=${port}`,
    "--window-size=1280,720",
    `--user-data-dir=${prof}`,
    "--autoplay-policy=no-user-gesture-required",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const killChrome = () => spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let id = 0;
const pend = new Map();
const errors = [];
let exitCode = 1;

try {
  let targets;
  for (let i = 0; i < 80; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.find((t) => t.type === "page")) break;
    } catch {}
    await sleep(250);
  }
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) pend.get(d.id)(d);
    if (d.method === "Runtime.exceptionThrown")
      errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error")
      errors.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pend.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails)
      throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
    return r.result.result.value;
  };
  const VK = { Enter: 13, Escape: 27, Shift: 16 };
  const vkOf = (k) => (k.length === 1 ? k.toUpperCase().charCodeAt(0) : (VK[k] ?? 0));
  const down = (code, k) => send("Input.dispatchKeyEvent", { type: "keyDown", code, key: k, windowsVirtualKeyCode: vkOf(k) });
  const up = (code, k) => send("Input.dispatchKeyEvent", { type: "keyUp", code, key: k, windowsVirtualKeyCode: vkOf(k) });
  const key = async (code, k, hold = 130) => {
    await down(code, k);
    await sleep(hold);
    await up(code, k);
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${here}/${name}.png`, Buffer.from(r.result.data, "base64"));
    log("screenshot", `${name}.png`);
  };
  const click = (i) => ev(`document.getElementById('${i}').click()`);
  const screenNow = () => ev("document.querySelector('.screen.show')?.id ?? 'none'");
  const S = (expr) => ev(`(() => { const s = window.__ddl.sim; return ${expr}; })()`);
  // lantern i + its rig
  const R = (i, expr) =>
    ev(`(() => { const s = window.__ddl.sim; const l = s.lanterns[${i}]; const r = window.__ddl.lanternRigs.get(l.id); return ${expr}; })()`);
  const banner = () => ev("(() => { const b = document.getElementById('fatalBanner'); return !b || b.hidden || getComputedStyle(b).display === 'none'; })()");
  const waitFor = async (expr, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await ev(expr)) return true;
      await sleep(30);
    }
    return false;
  };
  const patchWarn = () =>
    ev(`(() => { window.__warn = []; const o = CanvasRenderingContext2D.prototype.fillText; if (!o.__p) { const f = function (t, ...a) { if (t === '\\u26a0') window.__warn.push(String(this.fillStyle)); return o.call(this, t, ...a); }; f.__p = true; CanvasRenderingContext2D.prototype.fillText = f; } return true; })()`);
  const goNight = async (n, fromScreen) => {
    if (fromScreen === "play") {
      await key("Escape", "Escape");
      await sleep(250);
      await click("btnPauseMenu");
    } else if (fromScreen === "result") await click("btnResMenu");
    await sleep(500);
    await ev(`document.querySelector('[data-night="${n}"]').click()`);
    await sleep(500);
    await key("Enter", "Enter");
    await sleep(800);
    return screenNow();
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await sleep(4500);

  // ---- 10a. GPU proof
  const gpu = await ev(`(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return null; const e = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: e ? gl.getParameter(e.UNMASKED_VENDOR_WEBGL) : '' }; })()`);
  log("GL renderer", gpu);
  const hw = !!gpu && /ANGLE/i.test(gpu.renderer) && /D3D11|Direct3D11/i.test(gpu.renderer) && !/swiftshader|software|llvmpipe/i.test(gpu.renderer);
  check("10a", "WebGL is ANGLE D3D11 hardware (not SwiftShader)", hw, gpu?.renderer ?? "no webgl");
  const normalVars = await ev("(() => { const cs = getComputedStyle(document.documentElement); return { danger: cs.getPropertyValue('--danger').trim(), rim: cs.getPropertyValue('--shade-rim').trim(), cb: document.documentElement.classList.contains('cb') }; })()");
  log("css vars (default palette)", normalVars);

  // ---- menu -> intro -> night 1 (real clicks/keys)
  log("screen at start", await screenNow());
  await click("btnPlay");
  await sleep(700);
  const afterPlay = await screenNow();
  await key("Enter", "Enter");
  await sleep(900);
  const inPlay = await screenNow();
  check("8a", "start from menu: Play -> intro -> Enter -> play", afterPlay !== "none" && afterPlay !== "menu" && inPlay === "none", { afterPlay, inPlay });
  await S("(s.shades.length = 0, 0)"); // staging: remove scheduled/initial shades for a clean read

  // ---- 8b WASD
  const p0 = await S("[s.pos[0], s.pos[2]]");
  await down("KeyW", "w"); await sleep(600); await up("KeyW", "w"); await sleep(150);
  const p1 = await S("[s.pos[0], s.pos[2]]");
  await down("KeyS", "s"); await sleep(600); await up("KeyS", "s"); await sleep(150);
  const p2 = await S("[s.pos[0], s.pos[2]]");
  await down("KeyA", "a"); await sleep(600); await up("KeyA", "a"); await sleep(150);
  const p3 = await S("[s.pos[0], s.pos[2]]");
  await down("KeyD", "d"); await sleep(600); await up("KeyD", "d"); await sleep(150);
  const p4 = await S("[s.pos[0], s.pos[2]]");
  const dz1 = p1[1] - p0[1], dz2 = p2[1] - p1[1], dxA = p3[0] - p2[0], dxD = p4[0] - p3[0];
  check("8b", "WASD move Mây (W forward, S back, A/D opposite sideways)", dz1 > 0.5 && dz2 < -0.5 && Math.abs(dxA) > 0.5 && Math.abs(dxD) > 0.5 && dxA * dxD < 0, { W_dz: +dz1.toFixed(2), S_dz: +dz2.toFixed(2), A_dx: +dxA.toFixed(2), D_dx: +dxD.toFixed(2) });

  // ---- 8c/5/1 walk to lantern 0 with W, press E
  // staging: pos near lantern 0 (0,0,25) but outside interact radius, carried = 10 (the cost)
  await S("(s.pos[0] = 0, s.pos[1] = 0, s.pos[2] = 17, s.carried = 10, s.shades.length = 0, 0)");
  await sleep(300);
  const capBefore = await S("s.successfulLights");
  const hudBefore = await ev('document.querySelector("[data-r=carryN]")?.textContent');
  await down("KeyW", "w");
  await waitFor("(() => { const s = window.__ddl.sim; const l = s.lanterns[0]; return Math.hypot(s.pos[0]-l.pos[0], s.pos[2]-l.pos[2]) < 1.7; })()", 5000);
  await up("KeyW", "w");
  const dist = await S("Math.hypot(s.pos[0]-s.lanterns[0].pos[0], s.pos[2]-s.lanterns[0].pos[2])");
  await key("KeyE", "e", 160);
  await sleep(700);
  const lit0 = await S("s.lanterns[0].lit");
  const sl = await S("s.successfulLights");
  const hudAfter = await ev('document.querySelector("[data-r=carryN]")?.textContent');
  check("8c", "E (real key) at a lantern lights it", lit0 === true, { walkedDist: +dist.toFixed(2), lit: lit0 });
  check("5", "HUD carried/capacity after successfulLights=1", sl === 1 && /\/12$/.test(hudAfter ?? ""), { hudBefore, hudAfter, successfulLights: sl, capBefore });
  await S("(s.pos[2] = 11, s.pos[0] = 0, 0)"); // staging: step back so lantern + bar are in frame
  await sleep(700);
  const bar = await R(0, "({ vis: r.bar.visible, scale: r.barFill.scale.x, fuel: l.fuel / 60, lit: l.lit, ratio: r.glow.scale.y / r.glow.scale.x, tears: r.tears.visible })");
  log("lit lantern rig", bar);
  check("1", "fuel bar visible over lit lantern, fill == fuel/100", bar.vis && bar.lit && Math.abs(bar.scale - bar.fuel / 100) < 0.03, bar);
  check("4a", "lit lantern: glow ratio 1, tears hidden", Math.abs(bar.ratio - 1) < 0.01 && bar.tears === false, { ratio: +bar.ratio.toFixed(3), tears: bar.tears });
  await shot("p3-fuel-bar");

  // ---- 2 low-fuel blink
  await S("(s.lanterns[0].fuel = 25 * 60, s.shades.length = 0, 0)"); // staging: weak lantern
  await sleep(200);
  const smp = await ev(`(async () => { const out = []; const t0 = performance.now(); while (performance.now() - t0 < 3600) { const s = window.__ddl.sim; const l = s.lanterns[0]; const r = window.__ddl.lanternRigs.get(l.id); out.push([performance.now() - t0, r.bar.visible, r.glow.scale.y / r.glow.scale.x, l.fuel / 60]); await new Promise((r) => setTimeout(r, 50)); } return out; })()`);
  const runs = [];
  let start = 0;
  for (let i = 1; i < smp.length; i++) if (smp[i][1] !== smp[i - 1][1]) { runs.push({ vis: smp[i - 1][1], dur: (smp[i][0] - smp[start][0]) / 1000 }); start = i; }
  const full = runs.slice(1); // first run is partial
  const meanDur = full.reduce((a, r) => a + r.dur, 0) / Math.max(1, full.length);
  const onOff = runs.filter((r, i) => i > 0 && runs[i - 1].vis && !r.vis).length + (runs.length > 1 && !runs[0].vis ? 0 : 0);
  const states = new Set(smp.map((x) => x[1]));
  const span = (smp.at(-1)[0] - smp[0][0]) / 1000;
  check("2", "low-fuel lantern blinks ~1 Hz", smp.length >= 8 && span >= 2 && states.size === 2 && full.length >= 4 && meanDur > 0.4 && meanDur < 0.6, { samples: smp.length, spanS: +span.toFixed(2), halfPeriodMeanS: +meanDur.toFixed(3), fullRuns: full.map((r) => +r.dur.toFixed(2)), fuelRange: [+smp[0][3].toFixed(1), +smp.at(-1)[3].toFixed(1)] });
  await waitFor("!window.__ddl.lanternRigs.get(window.__ddl.sim.lanterns[0].id).bar.visible", 2000);
  await shot("p3-lowfuel-off-phase");
  const offGlow = await R(0, "({ vis: r.bar.visible, ratio: r.glow.scale.y / r.glow.scale.x, core: r.core.visible })");
  log("off-phase rig after shot", offGlow);
  await waitFor("window.__ddl.lanternRigs.get(window.__ddl.sim.lanterns[0].id).bar.visible", 2000);
  await shot("p3-lowfuel-on-phase");

  // ---- 3 drain: weak lantern + wander shade within ~3 m
  // staging: lantern 0 fuel 29, shade (wander) 3 m behind the lantern, Mây 14 m away (> detect range)
  await S("(s.lanterns[0].fuel = 29 * 60, s.shades.length = 0, s.addShade([0, 0, 28], undefined, 'wander'), 0)");
  const drained = await waitFor("window.__ddl.sim.shades.some((x) => x.state === 'drain')", 4000);
  const f0 = await S("[s.lanterns[0].fuel, s.simTick, s.shades[0]?.state]");
  await sleep(300);
  await shot("p3-shade-drain");
  await sleep(900);
  const f1 = await S("[s.lanterns[0].fuel, s.simTick, s.shades[0]?.state]");
  const rate = ((f0[0] - f1[0]) / 60) / ((f1[1] - f0[1]) / 60);
  check("3", "shade reaches state drain beside weak lantern; fuel falls > 1/s", drained && f1[2] === "drain" && rate > 1.0, { transitioned: drained, stateAfter: f1[2], fuelPerS: +rate.toFixed(2), expected: "~6 (1 decay + 5 drain)" });

  // ---- 4 lantern goes out
  await S("(s.lanterns[0].fuel = 90, 0)"); // staging: 1.5 fuel left, still draining
  const out = await waitFor("!window.__ddl.sim.lanterns[0].lit", 4000);
  await sleep(500);
  const dead = await R(0, "({ lit: l.lit, ratio: r.glow.scale.y / r.glow.scale.x, tears: r.tears.visible, barVis: r.bar.visible })");
  check("4", "lantern goes out -> collapsed (ratio 0.8), tears visible", out && dead.lit === false && Math.abs(dead.ratio - 0.8) < 0.01 && dead.tears === true, { wentOut: out, ...dead, ratio: +dead.ratio.toFixed(3) });
  await shot("p3-lantern-out");

  // ---- 6 colour-blind
  await ev("window.__ddl.setColorBlind(true)");
  await sleep(300);
  const cb = await ev("(() => { const cs = getComputedStyle(document.documentElement); return { danger: cs.getPropertyValue('--danger').trim().toLowerCase(), rim: cs.getPropertyValue('--shade-rim').trim().toLowerCase(), cb: document.documentElement.classList.contains('cb'), stored: localStorage.getItem('ddl.settings.v2') }; })()");
  log("colour-blind css", cb);
  // staging: lit weak lantern 0 + shade nearby, glyph recorder on canvas fillText
  await patchWarn();
  await S("(s.lanterns[0].lit = true, s.lanterns[0].fuel = 28 * 60, s.shades.length = 0, s.addShade([0, 0, 21], undefined, 'wander'), 0)");
  const gotWarn = await waitFor("window.__warn.length > 0", 3000);
  await S("(s.lanterns[0].fuel = Math.max(s.lanterns[0].fuel, 24 * 60), 0)");
  await shot("p3-colorblind-shade-warning");
  const warnStyles = await ev("[...new Set(window.__warn)]");
  log("warning glyph fillStyles", warnStyles);
  const storedOn = /"colorBlind":\s*true/.test(cb.stored ?? "");
  check("6a", "cb on: --shade-rim #00b3ff, --danger #ffffff, html.cb, stored", cb.rim === "#00b3ff" && cb.danger === "#ffffff" && cb.cb === true && storedOn, { ...cb, stored: undefined, storedOn });
  check("6b", "cb on: warning glyph drawn on low-fuel lantern", gotWarn, { glyphCalls: await ev("window.__warn.length"), defaultVarsWere: normalVars });
  await send("Page.reload");
  await sleep(4000);
  const cb2 = await ev("(() => { const cs = getComputedStyle(document.documentElement); return { danger: cs.getPropertyValue('--danger').trim().toLowerCase(), rim: cs.getPropertyValue('--shade-rim').trim().toLowerCase(), cb: document.documentElement.classList.contains('cb'), checkbox: document.getElementById('optColorBlind').checked }; })()");
  check("6c", "cb persisted across reload", cb2.rim === "#00b3ff" && cb2.danger === "#ffffff" && cb2.cb && cb2.checkbox, cb2);
  await ev("window.__ddl.setColorBlind(false)");
  await sleep(200);
  const cbOff = await ev("(() => { const cs = getComputedStyle(document.documentElement); return { danger: cs.getPropertyValue('--danger').trim(), rim: cs.getPropertyValue('--shade-rim').trim(), cb: document.documentElement.classList.contains('cb') }; })()");
  log("cb switched back off", { ...cbOff, stored: await ev("localStorage.getItem('ddl.settings.v2')") });

  // ---- 7 results (staged)
  await click("btnPlay");
  await sleep(600);
  await key("Enter", "Enter");
  await sleep(900);
  // staging: every lantern lit with full fuel, 0.5 s to dawn
  await S("(s.shades.length = 0, s.lanterns.forEach((l) => { l.lit = true; l.fuel = 100 * 60; }), s.simTick = s.startTicksLeft - 30, 0)");
  await waitFor("document.querySelector('.screen.show')?.id === 'result'", 4000);
  await sleep(500);
  const r1 = await ev("({ screen: document.querySelector('.screen.show')?.id, title: document.getElementById('resTitle').textContent, stats: document.getElementById('resStats').textContent })");
  check("7a", "result screen: dawn_survived", r1.screen === "result" && /sáng đèn/.test(r1.title) && /Sống sót đến bình minh/.test(r1.stats), r1);
  await shot("p3-result-dawn-survived");
  const o1 = await S("s.outcome");
  log("sim outcome", o1);

  let screen = await goNight(1, "result");
  // staging: no lantern lit, 0.5 s to dawn
  await S("(s.shades.length = 0, s.simTick = s.startTicksLeft - 30, 0)");
  await waitFor("document.querySelector('.screen.show')?.id === 'result'", 4000);
  await sleep(500);
  const r2 = await ev("({ screen: document.querySelector('.screen.show')?.id, title: document.getElementById('resTitle').textContent, stats: document.getElementById('resStats').textContent })");
  check("7b", "result screen: dawn loss", r2.screen === "result" && /chưa đủ sáng/.test(r2.title) && /Chưa đủ đèn sáng/.test(r2.stats), r2);
  await shot("p3-result-dawn-loss");

  screen = await goNight(1, "result");
  await S("(s.flames = 0, 0)"); // staging
  await waitFor("document.querySelector('.screen.show')?.id === 'result'", 4000);
  await sleep(500);
  const r3 = await ev("({ screen: document.querySelector('.screen.show')?.id, title: document.getElementById('resTitle').textContent, stats: document.getElementById('resStats').textContent })");
  check("7c", "result screen: no_flames loss", r3.screen === "result" && /Sương đen/.test(r3.title) && /Hết Ngọn Lửa/.test(r3.stats), r3);
  await shot("p3-result-no-flames");

  // ---- 10b FPS on night 3
  screen = await goNight(3, "result");
  log("night 3 screen", screen);
  await sleep(1500);
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await sleep(1000);
    samples.push(await ev("window.__ddl.fps"));
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  log("fps samples (night 3)", samples.map((x) => +x.toFixed(1)));
  log("fps average", +avg.toFixed(1));
  check("10b", "avg FPS over ~5 s on Night 3 (informational: > 30 expected on GPU)", avg > 30, { average: +avg.toFixed(1) });
  await shot("p3-night3-fps");

  // ---- 9 errors / banner
  const bn = await banner();
  check("9", "zero JS exceptions / console.error, no #fatalBanner", errors.length === 0 && bn, { errors, bannerHidden: bn });

  const failed = checks.filter((c) => !c.pass);
  log("SUMMARY", `${checks.length - failed.length}/${checks.length} passed; failed: ${failed.map((c) => c.id).join(",") || "none"}`);
  exitCode = failed.length ? 1 : 0;
} catch (e) {
  log("SCRIPT ERROR", String(e?.stack ?? e));
  log("errors so far", errors);
  exitCode = 2;
} finally {
  try { ws?.close(); } catch {}
  killChrome();
  writeFileSync(`${here}/e2e-browser.log`, lines.join("\n") + "\n");
  process.exit(exitCode);
}
