import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const [out, prof, url, port = "9340", gpuMode = "swiftshader"] = process.argv.slice(2);
const flags =
  gpuMode === "gpu"
    ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const chrome = spawn(
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", ...flags, `--remote-debugging-port=${port}`, "--window-size=1280,720", `--user-data-dir=${prof}`, "--autoplay-policy=no-user-gesture-required", "about:blank"],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    if (targets.find((t) => t.type === "page")) break;
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) pend.get(d.id)(d);
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails)); return r.result.result.value; };
const key = async (code, k, hold = 130) => { const vk = k.length === 1 ? k.toUpperCase().charCodeAt(0) : ({ Enter: 13, Escape: 27, Shift: 16 }[k] ?? 0); await send("Input.dispatchKeyEvent", { type: "keyDown", code, key: k, windowsVirtualKeyCode: vk }); await sleep(hold); await send("Input.dispatchKeyEvent", { type: "keyUp", code, key: k, windowsVirtualKeyCode: vk }); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, "base64")); };
const click = (i) => ev(`document.getElementById('${i}').click()`);
const screenNow = () => ev("document.querySelector('.screen.show')?.id ?? 'none'");
const S = (expr) => ev(`(() => { const s = window.__ddl.sim; return ${expr}; })()`);
const log = (k, v) => console.log(k.padEnd(28), typeof v === "string" ? v : JSON.stringify(v));

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
await sleep(4000);

// ---- menu -> intro -> night 1
log("screen at start", await screenNow());
await shot("p2-menu");
await click("btnPlay");
await sleep(700);
log("screen after Play", await screenNow());
await shot("p2-intro-1");
await key("Enter", "Enter");
await sleep(900);
log("screen after Enter", await screenNow());
await S("(s.carried = 6, 0)");
await sleep(500);
await shot("p2-night1");

// dash
await key("ShiftLeft", "Shift", 100);
await sleep(250);
log("dashCd after Shift (ticks)", await S("s.dashCd"));

// ---- pause freezes the logic
await sleep(400);
const t0 = await S("s.simTick");
await key("Escape", "Escape");
await sleep(300);
const tA = await S("s.simTick");
await sleep(1500);
const tB = await S("s.simTick");
log("pause: screen / frozen", [await screenNow(), tA === tB, tB - t0]);
await shot("p2-pause");

// ---- settings persist across a reload
await click("btnSettingsPause");
await sleep(200);
await ev("(() => { const v = document.getElementById('optVolume'); v.value = 35; v.dispatchEvent(new Event('input')); const s = document.getElementById('optSens'); s.value = 150; s.dispatchEvent(new Event('input')); })()");
await sleep(200);
log("localStorage", await ev("localStorage.getItem('ddl.settings.v2')"));
await shot("p2-settings");
await click("btnSettingsBack");
await sleep(150);
log("after settings back", await screenNow());
await click("btnGuidePause");
await sleep(200);
await shot("p2-guide");
await ev("document.querySelector('#guide .card').scrollTo(0, 99999)");
await sleep(150);
await shot("p2-guide2");
await click("btnGuideBack");
await click("btnResume");
await sleep(500);
log("resumed: simTick grows", (await S("s.simTick")) > tB);
await send("Page.reload");
await sleep(3500);
log("after reload volume/sens", await ev("[document.getElementById('optVolume').value, document.getElementById('optSens').value]"));

// ---- night 2
await click("btnSettingsMenu"); // exercises the menu route too
await sleep(100);
await click("btnSettingsBack");
await ev("document.querySelector('[data-night=\"2\"]').click()");
await sleep(600);
await shot("p2-intro-2");
await key("Enter", "Enter");
await sleep(800);
await S("(s.pos[0] = 33, s.pos[2] = 0, s.carried = 7, s.addDrifter([39, 1.5, 4]), 0)");
await key("KeyH", "h", 80);
await sleep(900);
await shot("p2-night2-labels");
await key("KeyH", "h", 80);
await S("(s.pos[0] = 20, s.pos[1] = 0, s.pos[2] = 17.2, 0)");
await sleep(650);
await shot("p2-night2-pad");
log("night2 airborne", await S("[s.grounded, +s.pos[1].toFixed(2)]"));
await sleep(2500);
log("night2 landed (island B?)", await S("[s.grounded, +s.pos[0].toFixed(1), +s.pos[2].toFixed(1)]"));

// ---- night 3
await key("Escape", "Escape");
await sleep(200);
await click("btnPauseMenu");
await sleep(500);
await ev("document.querySelector('[data-night=\"3\"]').click()");
await sleep(500);
await shot("p2-intro-3");
await key("Enter", "Enter");
await sleep(800);
await S("(s.pos[0] = 12, s.pos[1] = 3, s.pos[2] = 15, 0)");
await sleep(700);
await shot("p2-night3-tier");
await S("(s.simTick = 1700, 0)");
await sleep(700);
await shot("p2-night3-warning");
log("night3 warning/active", await S("[s.windWarning, s.wind.active]"));
await S("(s.simTick = 1850, 0)");
await sleep(700);
await shot("p2-night3-wind");
log("night3 warning/active", await S("[s.windWarning, s.wind.active]"));
await S("(s.pos[0] = 0, s.pos[1] = 0, s.pos[2] = -20, 0)");
await sleep(600);
await shot("p2-night3-ground");

// ---- frame rate while playing night 3 (average of 5 one-second samples)
const samples = [];
for (let i = 0; i < 5; i++) {
  await sleep(1000);
  samples.push(await ev("window.__ddl.fps"));
}
log("fps samples (night 3)", samples.map((x) => +x.toFixed(1)));
log("fps average", +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1));

// ---- results and dawn
await S("(s.lanterns.forEach((l) => { l.lit = true; l.deposited = 10; }), 0)");
await sleep(2200);
log("screen after winning night 3", await screenNow());
await shot("p2-result-3");
await key("Enter", "Enter");
await sleep(600);
log("screen after Enter", await screenNow());
await shot("p2-dawn");
await click("btnDawnMenu");
await sleep(400);
await ev("document.querySelector('[data-night=\"1\"]').click()");
await sleep(400);
await key("Enter", "Enter");
await sleep(600);
await S("(s.flames = 0, 0)");
await sleep(2200);
log("screen after losing night 1", await screenNow());
await shot("p2-result-lost");
log("retry visible / next hidden", await ev("[getComputedStyle(document.getElementById('btnRetry')).display, getComputedStyle(document.getElementById('btnNext')).display]"));
log("errors", errors);
ws.close();
chrome.kill();
