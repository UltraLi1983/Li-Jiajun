import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freezeStandardWindow } from "../dist/engine/standard-window.js";
import { emptyStandardSaLocalState, parseStandardSaLocalState, weekMatchesStandardSaSource } from "../dist/ui/standard-sa-local-state.js";

const config = { startMinute: 0, dayCount: 1, shiftMinutes: 480, shiftsPerDay: 1 };
const events = [{ id: "production", stationId: "OP10A", productId: "A-Housing", kind: "production", source: "manual", startMinute: 0, endMinute: 480 }];

describe("persisted standard SA", () => {
  it("restores independent route versions and a complete saved week", () => {
    const state = emptyStandardSaLocalState();
    for (const routeId of ["local-route-v1", "local-route-v2"]) {
      const key = `${routeId}::A-Housing::OP10A`;
      const frozen = freezeStandardWindow({ sourceId: key, version: 1, stationId: "OP10A", baseDate: "2026-10-19", dayConfig: config, events });
      assert.ok(frozen.snapshot);
      state.configs[key] = config;
      state.plans[key] = { events, areDefault: false };
      state.frozen[key] = frozen.snapshot;
      state.weeks[`${key}::2026-10-19`] = {
        days: Array.from({ length: 7 }, (_, dayIndex) => ({
          date: `2026-10-${19 + dayIndex}`, dayIndex, mode: "copy", workingDay: true, stale: false,
          bestCaseAvailableMinutes: 480,
        })),
        shiftCounts: Array(7).fill(1), perShiftUnplanned: 0, sourceVersion: 1, sourceSignature: "original",
      };
    }
    const restored = parseStandardSaLocalState(JSON.stringify(state));
    assert.equal(Object.keys(restored.frozen).length, 2);
    assert.equal(Object.keys(restored.weeks).length, 2);
    assert.notEqual(restored.frozen["local-route-v1::A-Housing::OP10A"].sourceId,
      restored.frozen["local-route-v2::A-Housing::OP10A"].sourceId);
  });

  it("rejects a tampered frozen window without discarding its plan", () => {
    const state = emptyStandardSaLocalState();
    const key = "local-route-v1::A-Housing::OP10A";
    state.configs[key] = config;
    state.plans[key] = { events, areDefault: false };
    state.frozen[key] = { ...freezeStandardWindow({ sourceId: key, version: 1, stationId: "OP10A", baseDate: "2026-10-19", dayConfig: config, events }).snapshot, fingerprint: "wrong" };
    const restored = parseStandardSaLocalState(JSON.stringify(state));
    assert.equal(restored.frozen[key], undefined);
    assert.deepEqual(restored.plans[key].events, events);
  });

  it("migrates legacy note-sensitive freezes and week signatures", () => {
    const key = "local-route-v1::A-Housing::OP10A";
    const state = emptyStandardSaLocalState();
    const oldEvents = [{ ...events[0], label: "production 08:30-09:30", note: "operator note" }];
    const frozen = freezeStandardWindow({ sourceId: key, version: 1, stationId: "OP10A", baseDate: "2026-10-19", dayConfig: config, events: oldEvents }).snapshot;
    const oldFingerprint = JSON.stringify(oldEvents.map(event => ({
      id: event.id, stationId: event.stationId, kind: event.kind, startMinute: event.startMinute,
      endMinute: event.endMinute, source: event.source, productId: event.productId,
      orderId: null, changeoverKey: null, label: event.label, note: event.note,
    })));
    state.configs[key] = config;
    state.plans[key] = { events: [{ ...oldEvents[0], note: "" }], areDefault: false };
    state.frozen[key] = { ...frozen, fingerprint: oldFingerprint };
    state.weeks[`${key}::2026-10-19`] = {
      days: Array.from({ length: 7 }, (_, dayIndex) => ({ date: `2026-10-${19 + dayIndex}`, dayIndex, mode: "copy", workingDay: true, stale: false, bestCaseAvailableMinutes: 480 })),
      shiftCounts: Array(7).fill(1), perShiftUnplanned: 0,
      sourceSignature: `${JSON.stringify(config)}::${oldFingerprint}`,
    };
    const restored = parseStandardSaLocalState(JSON.stringify(state));
    assert.equal(restored.frozen[key].fingerprint, frozen.fingerprint);
    assert.equal(weekMatchesStandardSaSource(restored.weeks[`${key}::2026-10-19`], `${JSON.stringify(config)}::${frozen.fingerprint}`), true);
  });

  it("excludes a saved week after its source window changes", () => {
    const week = { sourceSignature: "route-v1::original" };
    assert.equal(weekMatchesStandardSaSource(week, "route-v1::original"), true);
    assert.equal(weekMatchesStandardSaSource(week, "route-v1::edited"), false);
    assert.equal(weekMatchesStandardSaSource(week, "route-v2::original"), false);
    assert.equal(weekMatchesStandardSaSource({ ...week, sourceSignature: undefined }, "route-v1::original"), false);
  });
});
