import assert from "node:assert/strict";
import { it } from "node:test";
import { bootstrapLocalState, listRouteHistory, removeLocalState, saveLocalState } from "../dist/ui/local-state-client.js";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

it("loads database values first and imports browser-only records once", async () => {
  const browser = new MemoryStorage();
  browser.setItem("capa-local-validation-v1", "old route");
  browser.setItem("capa-rnr-evidence-v2:OP10", "old evidence");
  const database = new Map([["capa-local-validation-v1", "saved route"]]);
  globalThis.localStorage = browser;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/state") return { ok: true, json: async () => Object.fromEntries(database) };
    if (url.startsWith("/api/state/") && options.method === "PUT") {
      database.set(decodeURIComponent(url.slice("/api/state/".length)), JSON.parse(options.body).value);
      return { ok: true };
    }
    if (url === "/api/route-history") return { ok: true, json: async () => [] };
    throw new Error(`Unexpected request: ${url}`);
  };
  await bootstrapLocalState();
  assert.equal(browser.getItem("capa-local-validation-v1"), "saved route");
  assert.equal(database.get("capa-rnr-evidence-v2:OP10"), "old evidence");
  saveLocalState("capa-local-validation-v1", "new route");
  await listRouteHistory();
  assert.equal(database.get("capa-local-validation-v1"), "new route");
  removeLocalState("capa-rnr-evidence-v2:OP10");
  await listRouteHistory();
  assert.equal(database.get("capa-rnr-evidence-v2:OP10"), null);
});

it("replays an unsynced browser edit before applying an older database value", async () => {
  const browser = new MemoryStorage();
  const database = new Map([["capa-local-validation-v1", "old database route"]]);
  globalThis.localStorage = browser;
  let unavailable = true;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/state") return { ok: true, json: async () => Object.fromEntries(database) };
    if (url.startsWith("/api/state/") && options.method === "PUT") {
      if (unavailable) throw new Error("offline");
      database.set(decodeURIComponent(url.slice("/api/state/".length)), JSON.parse(options.body).value);
      return { ok: true };
    }
    if (url === "/api/route-history") return { ok: true, json: async () => [] };
    throw new Error(`Unexpected request: ${url}`);
  };
  saveLocalState("capa-local-validation-v1", "new browser route");
  await listRouteHistory();
  assert.ok(browser.getItem("__capa-local-sync-pending-v1"));
  unavailable = false;
  await bootstrapLocalState();
  assert.equal(browser.getItem("capa-local-validation-v1"), "new browser route");
  assert.equal(database.get("capa-local-validation-v1"), "new browser route");
  assert.equal(browser.getItem("__capa-local-sync-pending-v1"), null);
});
