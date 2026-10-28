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
      } catch { /* The page or debugger may still be starting. */ }
      if (Date.now() >= deadline) return reject(new Error("Browser smoke test timed out"));
      setTimeout(poll, 100);
    };
    void poll();
  });
}

function createStaticServer() {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const path = normalize(join(root, pathname));
    if (!path.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
    try {
      await stat(path);
      response.writeHead(200, { "content-type": mimeTypes[extname(path)] ?? "application/octet-stream" });
      const file = await readFile(path);
      response.end(file);
    } catch { response.writeHead(404).end(); }
  });
}

async function main() {
  await stat(chromePath).catch(() => { throw new Error(`Chrome not found: ${chromePath}`); });
  const server = createStaticServer();
  const profile = await mkdtemp(join(tmpdir(), "capa-route-browser-"));
  let chrome;
  let socket;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const port = server.address().port;
    chrome = spawn(chromePath, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--remote-debugging-port=0", `--user-data-dir=${profile}`,
      `http://127.0.0.1:${port}/formal.html`,
    ], { stdio: "ignore" });
    const debuggerPort = await waitUntil(async () => {
      const file = await readFile(join(profile, "DevToolsActivePort"), "utf8");
      return Number(file.split("\n")[0]) || undefined;
    });
    const page = await waitUntil(async () => {
      const pages = await fetch(`http://127.0.0.1:${debuggerPort}/json/list`).then(result => result.json());
      return pages.find(item => item.type === "page" && item.url.includes("formal.html"));
    });
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
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
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 10000);
      pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const choose = (selector, value) => evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error("Missing control: " + ${JSON.stringify(selector)});
      input.value = ${JSON.stringify(value)};
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    const click = selector => evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!button) throw new Error("Missing button: " + ${JSON.stringify(selector)});
      button.click();
      return true;
    })()`);
    const routeValue = () => evaluate(`(() => {
      const panel = document.querySelector("#calibrationPanel [data-whole-route-scope]");
      const field = [...panel.querySelectorAll(".field")].find(item => item.querySelector("span")?.textContent === "路线实跑等效成品上限");
      return field?.querySelector("strong")?.textContent ?? null;
    })()`);
    await waitUntil(() => evaluate('document.querySelector("#operationSelect")?.options.length > 1'));
    await evaluate("globalThis.confirm = () => true");
    assert.equal(await evaluate('document.querySelector("#operationSelect").value'), "op-a-10");
    await click('[data-stage-nav="baseline"]');
    const plannedRows = () => evaluate(`[...document.querySelectorAll("#plannedSaPanel [data-sa-event-row]")].map(row => row.textContent)`);
    await click('[data-stage-nav="reality"]');
    await click("[data-load-rnr-validation]");
    assert.equal(await evaluate('document.querySelectorAll("#rnrPanel [data-rnr-row]").length'), 0);
    assert.ok(await evaluate('document.querySelector("#rnrPanel").textContent.includes("非排班")'));
    await click('[data-stage-nav="baseline"]');
    await choose("#standardShiftsPerDay", "2");
    const planBeforeFixture = await plannedRows();
    await click('[data-stage-nav="reality"]');
    await click("[data-load-rnr-validation]");
    assert.ok(await evaluate('document.querySelectorAll("#rnrPanel [data-rnr-row]").length') > 0);
    await click('[data-stage-nav="baseline"]');
    assert.deepEqual(await plannedRows(), planBeforeFixture);
    await click('[data-stage-nav="reality"]');
    await choose("#operationSelect", "op-a-20");
    assert.equal(await evaluate('document.querySelector("#stationSelect").value'), "OP30");
    await click('[data-stage-nav="calibration"]');
    assert.equal(await routeValue(), "-");
    assert.ok(await evaluate('document.querySelector("#calibrationPanel [data-whole-route-scope]").textContent.includes("OP20B")'));
    await choose("#operationSelect", "op-a-10");
    await click('[data-stage-nav="reality"]');
    assert.ok(await evaluate('document.querySelectorAll("#rnrPanel [data-rnr-row]").length') > 0);
    await send("Page.reload", { ignoreCache: true });
    await waitUntil(() => evaluate('document.querySelectorAll("#rnrPanel [data-rnr-row]").length > 0'));

    await choose("#stationSelect", "OP20B");
    await click('[data-stage-nav="baseline"]');
    await choose("#standardShiftsPerDay", "2");
    await click('[data-stage-nav="reality"]');
    await click("[data-load-rnr-validation]");
    await choose("#operationSelect", "op-a-20");
    await click('[data-stage-nav="baseline"]');
    await choose("#standardShiftsPerDay", "2");
    await click('[data-stage-nav="reality"]');
    await click("[data-load-rnr-validation]");
    await click('[data-stage-nav="calibration"]');
    assert.equal(await routeValue(), "4,857");
    const routeTableText = await evaluate('document.querySelector("#calibrationPanel [data-whole-route-scope]").textContent');
    assert.match(routeTableText, /100% 的生产时间/);
    assert.doesNotMatch(routeTableText, /70\.0%/);
    await choose("#operationSelect", "op-a-10");
    assert.equal(await routeValue(), "4,857");

    await click('[data-stage-nav="routing"]');
    assert.ok(await evaluate('document.querySelector("#operationDetailPanel").textContent.includes("1 件")'));
    const cavities = () => evaluate(`[...document.querySelectorAll("#operationDetailPanel .assignment-card")].map(card =>
      [...card.querySelectorAll(".field")].find(field => field.querySelector("span")?.textContent === "每循环件数")?.querySelector("strong")?.textContent)`);
    const cavitiesBefore = await cavities();
    await click("#toggleMockEdit");
    await evaluate(`(() => {
      const form = document.querySelector("[data-operation-quantity-form]");
      form.querySelector('[name="units"]').value = "2";
      form.requestSubmit();
    })()`);
    assert.deepEqual(await cavities(), cavitiesBefore);
    await click('[data-stage-nav="calibration"]');
    assert.equal(await routeValue(), "2,973");
    await choose("[data-window-demand]", "3000");
    assert.ok(await evaluate('document.querySelector("#calibrationPanel [data-whole-route-scope]").textContent.includes("-27")'));
    await send("Page.reload", { ignoreCache: true });
    await waitUntil(() => evaluate('document.querySelector("#calibrationPanel [data-whole-route-scope]") !== null'));
    await evaluate("globalThis.confirm = () => true");
    await click('[data-stage-nav="calibration"]');
    assert.equal(await routeValue(), "2,973");
    assert.equal(await evaluate('document.querySelector("[data-window-demand]").value'), "");

    await choose("#operationSelect", "op-a-20");
    console.log("Checking incomplete OP20 actual track");
    await click('[data-stage-nav="reality"]');
    await evaluate('document.querySelectorAll("#rnrPanel [data-rnr-row]").item(document.querySelectorAll("#rnrPanel [data-rnr-row]").length - 1).click()');
    await click('[data-rnr-delete-selected]');
    await click('[data-stage-nav="calibration"]');
    assert.equal(await routeValue(), "-");
    assert.ok(await evaluate('document.querySelector("#calibrationPanel [data-whole-route-scope]").textContent.includes("实跑时间未覆盖整个窗口")'));
    await click('[data-stage-nav="reality"]');
    await click("[data-load-rnr-validation]");
    await click('[data-stage-nav="calibration"]');
    assert.equal(await routeValue(), "2,973");
    console.log("Checking stale route window");
    await click('[data-stage-nav="baseline"]');
    await choose("#standardDayStartHour", "9");
    await click('[data-stage-nav="calibration"]');
    const otherWindow = await evaluate(`[...document.querySelector("[data-route-window]").options].find(option => option.textContent.endsWith("OP30"))?.value`);
    assert.ok(otherWindow);
    await choose("[data-route-window]", otherWindow);
    await click('[data-stage-nav="baseline"]');
    await choose("#standardDayStartHour", "8");
    await click('[data-stage-nav="calibration"]');
    assert.equal(await routeValue(), "-");
    assert.equal(await evaluate('document.querySelector("[data-route-window]").disabled'), false);
    assert.equal(await evaluate('document.querySelector("[data-route-window]").value'), "");
    console.log("Checking mobile layout");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const mobileLayout = await evaluate(`(() => {
      const operation = document.querySelector("#operationSelect").getBoundingClientRect();
      const station = document.querySelector("#stationSelect").getBoundingClientRect();
      const scope = document.querySelector("#scopeStrip").getBoundingClientRect();
      return { scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
        operationRight: operation.right, stationRight: station.right, scopeRight: scope.right,
        operationBottom: operation.bottom, stationTop: station.top };
    })()`);
    assert.ok(mobileLayout.scrollWidth <= mobileLayout.viewportWidth + 1, JSON.stringify(mobileLayout));
    assert.ok(mobileLayout.operationRight <= mobileLayout.viewportWidth && mobileLayout.stationRight <= mobileLayout.viewportWidth);
    assert.ok(mobileLayout.scopeRight <= mobileLayout.viewportWidth && mobileLayout.operationBottom <= mobileLayout.stationTop);
    console.log("Browser navigation smoke passed: switching, refresh, route Actual, stale explicit window.");
  } finally {
    console.log("Closing isolated browser");
    socket?.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once("exit", resolve));
      chrome.kill("SIGTERM");
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    }
    if (server.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

await main();
