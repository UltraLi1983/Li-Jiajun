import assert from "node:assert/strict";
import test from "node:test";
import { resolveDailyDemandWeek } from "../dist/engine/daily-demand-ledger.js";

const dates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
const base = { productId: "housing", productVersion: "v1", weekStartDate: dates[0], legacyWeeklyDemand: 1800 };
const entries = dates.map((dueDate, day) => ({ recordId: `d${day}`, productId: "housing", productVersion: "v1", dueDate, quantity: day === 6 ? 0 : 300, sourceId: "customer-plan", revision: 1 }));

test("complete daily week uses seven explicit dates, including zero, instead of legacy demand", () => {
  assert.deepEqual(resolveDailyDemandWeek({ ...base, entries }), {
    status: "complete", source: "daily", quantity: 1800, missingDates: [], issues: [], recordIds: entries.map(entry => entry.recordId),
  });
});

test("partial daily week does not add or fall back to legacy weekly demand", () => {
  const result = resolveDailyDemandWeek({ ...base, entries: entries.slice(0, 2) });
  assert.equal(result.status, "incomplete");
  assert.equal(result.quantity, undefined);
  assert.deepEqual(result.missingDates, dates.slice(2));
});

test("legacy demand is used only when there are no daily entries for the selected product and week", () => {
  const result = resolveDailyDemandWeek({ ...base, entries: [{ ...entries[0], dueDate: "2026-11-02" }] });
  assert.equal(result.status, "legacy");
  assert.equal(result.quantity, 1800);
});

test("a higher revision replaces the same daily record without double counting", () => {
  const result = resolveDailyDemandWeek({ ...base, entries: [...entries, { ...entries[0], revision: 2, quantity: 350 }] });
  assert.equal(result.status, "complete");
  assert.equal(result.quantity, 1850);
});

test("conflicting active records and invalid quantities block a determined weekly result", () => {
  const duplicate = resolveDailyDemandWeek({ ...base, entries: [...entries, { ...entries[0], recordId: "other" }] });
  assert.equal(duplicate.status, "conflict");
  assert.equal(duplicate.quantity, undefined);
  const invalid = resolveDailyDemandWeek({ ...base, entries: [{ ...entries[0], quantity: -1 }, ...entries.slice(1)] });
  assert.equal(invalid.status, "conflict");
});

test("invalid or non-Monday week start is rejected", () => {
  assert.equal(resolveDailyDemandWeek({ ...base, weekStartDate: "2026-10-27", entries }).status, "conflict");
  assert.equal(resolveDailyDemandWeek({ ...base, weekStartDate: "2026-02-30", entries }).status, "conflict");
});
