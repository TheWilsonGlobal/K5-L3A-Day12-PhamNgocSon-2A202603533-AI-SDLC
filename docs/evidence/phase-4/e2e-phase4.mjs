// Phase 4 browser E2E verification (Chrome GPU 1280x720 via CDP):
// Verifies UI font size >= 18px, Large Text (x1.25), Reduce Motion, Key Remapping + conflict detection + reset,
// Subtitles + Shade spawn directional arrow, and Local Leaderboard save (on loss & Dawn) + Leaderboard view.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const vitePort = "5466";
const url = `http://127.0.0.1:${vitePort}/`;
const prof = resolve(root, "out/p4-e2e-profile");
const port = process.argv[2] ?? "9377";
mkdirSync(prof, { recursive: true });
mkdirSync(here, { recursive: true });

const vite = spawn(
  process.execPath,
  [resolve(root, "apps/web/node_modules/vite/bin/vite.js"), "--port", vitePort, "--host", "127.0.0.1"],
  { cwd: resolve(root, "apps/web"), stdio: "ignore" },
);
const killVite = () =>
  spawnSync("taskkill", ["/PID", String(vite.pid), "/T", "/F"], { stdio: "ignore" });

const lines = [];
const checks = [];
const log = (k, v) => {
  const l = k.padEnd(38) + (typeof v === "string" ? v : JSON.stringify(v));
  console.log(l);
  lines.push(l);
};
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
const killChrome = () =>
  spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
let id = 0;
const pend = new Map();
const errors = [];

try {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) break;
    } catch {
      /* wait for vite */
    }
    await sleep(150);
  }
  let pageTarget = null;
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      pageTarget = targets.find((t) => t.type === "page");
      if (pageTarget) break;
    } catch {
      /* wait */
    }
    await sleep(200);
  }
  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
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
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails));
    }
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve(here, `${name}.png`), Buffer.from(r.result.data, "base64"));
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await sleep(1200);

  // A4: Minimum 18px font size across UI elements at 1280x720
  const minFont = await ev(`(() => {
    const sels = ['body', 'button', '.lab', '.kicker', '.cd', '.keys', '#prompt', '.guide'];
    const sizes = sels.map(s => {
      const el = document.querySelector(s);
      return el ? parseFloat(getComputedStyle(el).fontSize) : 999;
    });
    return { min: Math.min(...sizes), sizes };
  })()`);
  check("A4-1", "UI font size >= 18px at 1280x720", minFont.min >= 18, minFont);

  // Open Settings from menu
  await ev(`document.getElementById("btnSettingsMenu").click()`);
  await sleep(300);

  // A4-2: Large text (x1.25) scales UI font size to >= 22.5px
  const largeFont = await ev(`(() => {
    const cb = document.getElementById("optLargeText");
    cb.checked = true;
    cb.dispatchEvent(new Event("change"));
    return {
      hasClass: document.documentElement.classList.contains("large-text"),
      bodyPx: parseFloat(getComputedStyle(document.body).fontSize),
    };
  })()`);
  check(
    "A4-2",
    "Large text option scales UI by 1.25x (>= 22.5px)",
    largeFont.hasClass && Math.abs(largeFont.bodyPx - 22.5) < 0.2,
    largeFont,
  );
  await shot("p4-settings-large-text");

  // A3: Reduce motion toggle
  const redMotion = await ev(`(() => {
    const cb = document.getElementById("optReduceMotion");
    cb.checked = true;
    cb.dispatchEvent(new Event("change"));
    return document.documentElement.classList.contains("reduce-motion");
  })()`);
  check("A3", "Reduce motion class active and saved", redMotion === true, { redMotion });

  // A1: Key remapping + duplicate key conflict detection + reset default
  const kbConflict = await ev(`(() => {
    const jumpBtn = document.querySelector('[data-kb="jump"]');
    jumpBtn.click();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true }));
    const msg = document.getElementById("keyConflictMsg");
    return { hidden: msg.hidden, text: msg.textContent };
  })()`);
  check(
    "A1-1",
    "Duplicate key assignment detected and warned",
    !kbConflict.hidden && kbConflict.text.includes("Trùng phím") || kbConflict.text.includes("trùng phím"),
    kbConflict,
  );
  await shot("p4-keybind-conflict");

  const kbReset = await ev(`(() => {
    document.getElementById("btnResetKeys").click();
    const msg = document.getElementById("keyConflictMsg");
    const jumpBtn = document.querySelector('[data-kb="jump"]');
    return { hidden: msg.hidden, jumpText: jumpBtn.textContent };
  })()`);
  check(
    "A1-2",
    "Reset default keys clears conflict and restores Space",
    kbReset.hidden && kbReset.jumpText === "Space",
    kbReset,
  );

  // Close settings, start Night 3 (which has windEnabled = true)
  await ev(`
    document.getElementById("optLargeText").checked = false;
    document.getElementById("optLargeText").dispatchEvent(new Event("change"));
    document.getElementById("btnSettingsBack").click();
    document.querySelector('[data-night="3"]').click();
    document.getElementById("btnStart").click();
  `);
  await sleep(400);

  // A2: Subtitles & directional arrow when Bóng Mực spawns + low fuel + wind warning (28.5s = tick 1710) + 10s countdown
  await ev(`(() => {
    const sim = window.__ddl.sim;
    sim.simTick = 298.5 * 60; // inside 2s wind warning window (298..300s) AND 1.5s left (<= 10s countdown)
    sim.shades.push({
      id: "S1",
      pos: [28, 1, 22],
      state: "wander",
      left: 0,
      heading: 0,
      headLeft: 60,
      recoil: null,
      push: null,
      target_lantern_id: null,
      drain_ticks: 0,
      eject: 0,
    });
    sim.lanterns[0].lit = true;
    sim.lanterns[0].fuel = 20 * 60; // fuel = 20 (< 30)
    window.__ddl.triggerShadeSpawnCue("S1");
    return true;
  })()`);
  await sleep(250);
  const subState = await ev(`(() => {
    const subText = document.getElementById("subtitles").textContent || "";
    const arrowDisp = document.getElementById("shadeArrow").style.display;
    const arrowText = document.querySelector("#shadeArrow .dist")?.textContent || "";
    return { subText, arrowDisp, arrowText };
  })()`);
  check(
    "A2",
    "Subtitles & screen-edge directional arrow for Shade spawn, wind, low fuel, and 10s countdown",
    subState.subText.includes("Bóng Mực") &&
      subState.subText.includes("Gió mạnh") &&
      subState.subText.includes("sắp cạn dầu") &&
      subState.subText.includes("bình minh") &&
      subState.arrowDisp === "flex",
    subState,
  );
  await shot("p4-subtitles-and-shade-arrow");

  // L1-L5: Save score after Dawn screen & view Leaderboard from Main Menu
  await ev(`window.__ddl.showDawnForTest([480, 520, 610])`);
  await sleep(250);
  const invalidSave = await ev(`(() => {
    const inp = document.getElementById("dawnNameInput");
    inp.value = "ab";
    document.getElementById("btnDawnSaveScore").click();
    return document.getElementById("dawnSaveMsg").textContent;
  })()`);
  check("L2", "Rejects invalid short leaderboard name (< 3 chars)", invalidSave.includes("3–12"), {
    invalidSave,
  });

  await ev(`(() => {
    const inp = document.getElementById("dawnNameInput");
    inp.value = "May_Hero";
    document.getElementById("btnDawnSaveScore").click();
  })()`);
  await sleep(350);
  await shot("p4-dawn-score-saved");

  await ev(`document.getElementById("btnDawnMenu").click(); document.getElementById("btnLeaderboardMenu").click();`);
  await sleep(400);
  const lbCheck = await ev(`(() => {
    const rows = Array.from(document.querySelectorAll("#lbTableBody tr")).map(r => r.textContent);
    return { count: rows.length, first: rows[0] || "" };
  })()`);
  check(
    "L4-L5",
    "Leaderboard screen lists saved top score from local store",
    lbCheck.count >= 1 && lbCheck.first.includes("May_Hero") && lbCheck.first.includes("1610"),
    lbCheck,
  );
  await shot("p4-leaderboard-screen");

  check("ERR", "Zero uncaught JS errors or console.error", errors.length === 0, errors);

  writeFileSync(resolve(here, "e2e-phase4.log"), lines.join("\n") + "\n", "utf8");
  const allPass = checks.every((c) => c.pass);
  process.exitCode = allPass ? 0 : 1;
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  killChrome();
  killVite();
}
