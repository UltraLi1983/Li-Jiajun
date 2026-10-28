import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffFrozenStandardSa } from "../dist/engine/standard-sa-diff.js";
import { freezeStandardWindow } from "../dist/engine/standard-window.js";

const config = { startMinute: 0, dayCount: 1, shiftMinutes: 480, shiftsPerDay: 1 };
const event = { id: "production-1", stationId: "OP20A", productId: "A-Housing", kind: "production", source: "manual", startMinute: 0, endMinute: 480, note: "original" };
const frozen = freezeStandardWindow({ sourceId: "route-v1::A-Housing::OP20A", version: 1, stationId: "OP20A", baseDate: "2026-10-19", dayConfig: config, events: [event] }).snapshot;

describe("standard SA change location", () => {
  it("has no edit target when the frozen source still matches", () => {
    assert.deepEqual(diffFrozenStandardSa(frozen, [event], config), []);
  });

  it("identifies individual shift controls and edited event fields", () => {
    const changes = diffFrozenStandardSa(frozen, [{ ...event, endMinute: 450, note: "revised" }], {
      ...config, startMinute: 60, shiftMinutes: 720,
    });
    assert.deepEqual(changes.map(change => [change.kind, change.field]), [
      ["config", "startMinute"], ["config", "shiftMinutes"],
      ["event", "endMinute"],
    ]);
    assert.equal(changes[2].eventId, "production-1");
    assert.equal(changes[2].before, 480);
    assert.equal(changes[2].after, 450);
  });

  it("does not treat an optional note change as a frozen plan change", () => {
    assert.deepEqual(diffFrozenStandardSa(frozen, [{ ...event, note: "" }], config), []);
  });

  it("distinguishes added and removed events without inventing an editable row", () => {
    const added = { ...event, id: "production-2", startMinute: 480, endMinute: 600 };
    assert.deepEqual(diffFrozenStandardSa(frozen, [event, added], config).map(change => change.field), ["added"]);
    assert.deepEqual(diffFrozenStandardSa(frozen, [], config).map(change => change.field), ["removed"]);
  });
});
