import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CAPA_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const mimeTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function waitUntil(check, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const value = await check();
        if (value) return resolve(value);
      } catch { /* The page may still be starting. */ }
      if (Date.now() >= deadline) return reject(new Error("Week ledger browser smoke timed out"));
      setTimeout(poll, 100);
    };
    void poll();
  });
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const path = normalize(join(root, pathname));
  if (!path.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
  try {
    await stat(path);
    response.writeHead(200, { "content-type": mimeTypes[extname(path)] ?? "application/octet-stream" });
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});

await stat(chromePath);
const profile = await mkdtemp(join(tmpdir(), "capa-week-ledger-"));
let chrome;
let socket;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const port = server.address().port;
  chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/formal.html`], { stdio: "ignore" });
  const debuggerPort = await waitUntil(async () => Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]) || undefined);
  const page = await waitUntil(async () => (await fetch(`http://127.0.0.1:${debuggerPort}/json/list`).then(result => result.json())).find(item => item.type === "page" && item.url.includes("formal.html")));
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 10000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Evaluation failed");
    return result.result.value;
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await waitUntil(() => evaluate("Boolean(document.querySelector('[data-stage-nav=\"baseline\"]'))"));
  await click('[data-stage-nav="baseline"]');
  await waitUntil(() => evaluate("Boolean(document.querySelector('#generateCopyProjection'))"));
  const order = await evaluate(`(() => {
    const timeline = document.querySelector(".timeline-wrap");
    const projection = document.querySelector("[data-week-ledger]");
    const weekButton = document.querySelector("#generateCopyProjection");
    const monthButton = document.querySelector("#generateMonthLedger");
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    return {
      projectionAfterTimeline: Boolean(timeline && projection && (timeline.compareDocumentPosition(projection) & following)),
      weekBeforeMonth: Boolean(weekButton && monthButton && (weekButton.compareDocumentPosition(monthButton) & following)),
    };
  })()`);
  assert.equal(order.projectionAfterTimeline, true);
  assert.equal(order.weekBeforeMonth, true);
  await evaluate(`(() => {
    for (const day of [2, 3]) {
      const mode = document.querySelector('[data-week-day-mode="' + day + '"]');
      mode.value = "manual";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    }
  })()`);
  assert.match(await evaluate("document.querySelector('[data-week-ledger]').textContent"), /套用到/);
  await evaluate(`(() => {
    const shift = document.querySelector('[data-manual-field="shiftMinutes"]');
    shift.value = "720";
    shift.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  const shiftChoices = await evaluate(`[...document.querySelectorAll('[data-manual-field="shiftsPerDay"] option')].map(option => option.value)`);
  assert.deepEqual(shiftChoices, ["1", "2"]);
  await evaluate(`(() => {
    const shift = document.querySelector('[data-manual-field="shiftMinutes"]');
    shift.value = "480";
    shift.dispatchEvent(new Event("change", { bubbles: true }));
    const count = document.querySelector('[data-manual-field="shiftsPerDay"]');
    count.value = "2";
    count.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector('[data-manual-field="productionMinutes"]').value = "960";
    document.querySelector('[data-manual-field="productionMinutes"]').dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await click("#generateCopyProjection");
  const saved = await evaluate("document.querySelector('[data-week-ledger]').textContent");
  assert.match(saved, /960 分钟，-960 分钟生产，已排满/);
  assert.match(saved, /480/);
  assert.match(saved, /With breaks SA/);
  assert.match(saved, /无样本，按 0 预留的假设/);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-week-capacity]'))"), true);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-month-capacity]'))"), false);
  await evaluate(`(() => {
    for (const [field, value] of [["productionMinutes", "900"], ["breakMinutes", "200"], ["setupMinutes", "340"], ["plannedStopMinutes", "0"]]) {
      const input = document.querySelector('[data-manual-field="' + field + '"]');
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  })()`);
  await click("#generateCopyProjection");
  assert.match(await evaluate("document.querySelector('[data-week-ledger]').textContent"), /须排满/);
  await evaluate(`(() => {
    for (const [field, value] of [["productionMinutes", "800"], ["breakMinutes", "0"], ["setupMinutes", "0"], ["plannedStopMinutes", "160"]]) {
      const input = document.querySelector('[data-manual-field="' + field + '"]');
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.querySelector("#monthlySetupOccurrences").value = "2";
    document.querySelector("#monthlySetupOccurrences").dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#monthlySetupMinutes").value = "30";
    document.querySelector("#monthlySetupMinutes").dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await click("#generateCopyProjection");
  await click("#generateMonthLedger");
  assert.match(await evaluate("document.querySelector('[data-week-ledger]').textContent"), /重复第 1 周/);
  assert.match(await evaluate("document.querySelector('[data-week-ledger]').textContent"), /扣除 60 分钟/);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-month-capacity]'))"), true);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const layout = await evaluate(`(() => {
    const panel = document.querySelector("[data-week-ledger]").getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, panelRight: panel.right };
  })()`);
  assert.ok(layout.scrollWidth <= layout.viewportWidth + 1, JSON.stringify(layout));
  assert.ok(layout.panelRight <= layout.viewportWidth + 1);
  console.log("Week ledger browser smoke passed.");
} finally {
  socket?.close();
  chrome?.kill();
  server.close();
  await new Promise(resolve => setTimeout(resolve, 200));
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
