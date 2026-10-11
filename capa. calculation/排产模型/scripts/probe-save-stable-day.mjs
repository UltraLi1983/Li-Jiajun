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
      try { const value = await check(); if (value) return resolve(value); } catch { /* starting */ }
      if (Date.now() >= deadline) return reject(new Error("timed out"));
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
const profile = await mkdtemp(join(tmpdir(), "capa-save-probe-"));
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
  const text = () => evaluate(`(() => {
    const root = document.querySelector('[data-week-ledger]');
    const table = root.querySelector('table');
    return { note: document.querySelector('#stableDayFillNote')?.textContent ?? '', error: root.querySelector('.form-error, .message-list')?.textContent ?? '', table: table?.innerText ?? '' };
  })()`);
  await waitUntil(() => evaluate("Boolean(document.querySelector('[data-stage-nav=\"baseline\"]'))"));
  await click('[data-stage-nav="baseline"]');
  await waitUntil(() => evaluate("Boolean(document.querySelector('#saveManualDay'))"));
  await evaluate(`(() => {
    const mode = document.querySelector('[data-week-day-mode="2"]');
    mode.value = "manual";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    const production = document.querySelector('[data-manual-field="productionMinutes"]');
    production.value = "960";
    production.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await click("#generateCopyProjection");
  const generatedWithoutSave = await text();
  await click("#saveManualDay");
  const afterSave = await text();
  await click("#generateCopyProjection");
  const generatedAfterSave = await text();
  await evaluate(`(() => {
    const production = document.querySelector('[data-manual-field="productionMinutes"]');
    production.value = "800";
    production.dispatchEvent(new Event("input", { bubbles: true }));
    const stop = document.querySelector('[data-manual-field="plannedStopMinutes"]');
    stop.value = "160";
    stop.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await click("#generateCopyProjection");
  const generatedStale = await text();
  console.log(JSON.stringify({ generatedWithoutSave, afterSave, generatedAfterSave, generatedStale }, null, 2));
} finally {
  socket?.close();
  chrome?.kill();
  server.close();
  await new Promise(resolve => setTimeout(resolve, 200));
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
