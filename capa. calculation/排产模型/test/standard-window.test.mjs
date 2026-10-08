import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freezeStandardWindow, isFrozenStandardWindowCurrent } from "../dist/engine/standard-window.js";

const event = (id, kind, startMinute, endMinute) => ({
  id, kind, startMinute, endMinute, stationId: "OP10", source: "manual", productId: "A-Housing",
});
const input = events => ({ sourceId: "A-Housing::OP10", version: 1, stationId: "OP10", baseDate: "2026-10-08", events });

describe("standard window freeze", () => {
  it("freezes an explicit complete plan and keeps an independent snapshot", () => {
    const events = [event("p1", "production", 480, 600), event("b1", "break", 600, 630), event("p2", "production", 630, 720)];
    const result = freezeStandardWindow(input(events));
    assert.deepEqual(result.issues, []);
    assert.equal(result.snapshot.startMinute, 480);
    assert.equal(result.snapshot.endMinute, 720);
    assert.equal(isFrozenStandardWindowCurrent(result.snapshot, [...events].reverse()), true);
    events[0].endMinute = 590;
    assert.equal(result.snapshot.events[0].endMinute, 600);
    assert.equal(isFrozenStandardWindowCurrent(result.snapshot, events), false);
  });

  it("rejects gaps, overlap, mixed stations and duplicate ids", () => {
    assert.ok(freezeStandardWindow(input([event("a", "production", 0, 60), event("b", "break", 70, 90)])).issues.includes("gap"));
    assert.ok(freezeStandardWindow(input([event("a", "production", 0, 60), event("b", "break", 50, 90)])).issues.includes("overlap"));
    assert.ok(freezeStandardWindow(input([event("a", "production", 0, 60), { ...event("b", "break", 60, 90), stationId: "OP20" }])).issues.includes("mixed_station"));
    assert.ok(freezeStandardWindow(input([event("a", "production", 0, 60), event("a", "break", 60, 90)])).issues.includes("duplicate_id"));
  });

  it("rejects windows beyond 48 hours and non-plan events", () => {
    assert.ok(freezeStandardWindow(input([event("a", "production", 0, 48 * 60 + 1)])).issues.includes("outside_horizon"));
    assert.ok(freezeStandardWindow(input([event("a", "equipmentFailure", 0, 60)])).issues.includes("invalid_kind"));
  });

  it("freezes two production days with one shift each without treating off-shift hours as gaps", () => {
    const dayConfig = { startMinute: 510, dayCount: 2, shiftMinutes: 720, shiftsPerDay: 1 };
    const events = [event("day1", "production", 510, 1230), event("day2", "production", 1950, 2670)];
    const result = freezeStandardWindow({ ...input(events), dayConfig });
    assert.deepEqual(result.issues, []);
    assert.equal(result.snapshot.startMinute, 510);
    assert.equal(result.snapshot.endMinute, 3390);
    assert.equal(isFrozenStandardWindowCurrent(result.snapshot, events, dayConfig), true);
    assert.equal(isFrozenStandardWindowCurrent(result.snapshot, events, { ...dayConfig, shiftsPerDay: 2 }), false);
  });
});
