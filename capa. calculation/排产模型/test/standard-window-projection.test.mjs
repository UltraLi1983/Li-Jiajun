import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freezeStandardWindow } from "../dist/engine/standard-window.js";
import { copyStandardWindowToWeek, expandWeekToFourWeeks } from "../dist/engine/standard-window-projection.js";

const event = (id, kind, startMinute, endMinute, productId = "A") => ({
  id, kind, startMinute, endMinute, stationId: "OP10", source: "manual", productId,
});
const sourceEvents = [event("p1", "production", 480, 660), event("b1", "break", 660, 690), event("p2", "production", 690, 960)];
const source = freezeStandardWindow({ sourceId: "A::OP10", version: 1, stationId: "OP10", baseDate: "2026-10-08", events: sourceEvents }).snapshot;
const input = overrides => ({
  source, currentSourceEvents: sourceEvents, weekStartDate: "2026-10-12",
  repeatDates: ["2026-10-12", "2026-10-13"], ...overrides,
});

describe("standard window copy to a seven-day plan", () => {
  it("groups copied full days from the first-shift clock rather than midnight", () => {
    const dayConfig = { startMinute: 510, dayCount: 1, shiftMinutes: 480, shiftsPerDay: 3 };
    const events = [event("p1", "production", 510, 900), event("b1", "break", 900, 930), event("p2", "production", 930, 1950)];
    const frozen = freezeStandardWindow({ sourceId: "A::OP10", version: 1, stationId: "OP10", baseDate: "2026-10-08", events, dayConfig }).snapshot;
    const result = copyStandardWindowToWeek(input({
      source: frozen, currentSourceEvents: events, currentDayConfig: dayConfig,
      repeatDates: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
    }));
    assert.deepEqual(result.issues, []);
    assert.equal(result.weekStartMinuteOfDay, 510);
    assert.deepEqual(result.days.map(day => day.scheduledMinutes), [1440, 1440, 1440, 1440, 1440, 0, 0]);
    assert.deepEqual(result.days.map(day => day.productionMinutes), [1410, 1410, 1410, 1410, 1410, 0, 0]);
    assert.equal(result.events.at(-1).endMinute, 5 * 1440 + 510);
  });

  it("moves the week boundary with the first-shift time and accepts a full Sunday", () => {
    const dayConfig = { startMinute: 450, dayCount: 1, shiftMinutes: 480, shiftsPerDay: 3 };
    const events = [event("full-day", "production", 450, 1890)];
    const frozen = freezeStandardWindow({ sourceId: "A::OP10", version: 1, stationId: "OP10", baseDate: "2026-10-08", events, dayConfig }).snapshot;
    const result = copyStandardWindowToWeek(input({
      source: frozen, currentSourceEvents: events, currentDayConfig: dayConfig, repeatDates: ["2026-10-18"],
    }));
    assert.deepEqual(result.issues, []);
    assert.equal(result.weekStartMinuteOfDay, 450);
    assert.deepEqual(result.days.map(day => day.scheduledMinutes), [0, 0, 0, 0, 0, 0, 1440]);
    assert.equal(result.events[0].endMinute, 7 * 1440 + 450);
    const fourWeeks = expandWeekToFourWeeks(result, ["copy", "off", "copy"]);
    assert.equal(fourWeeks.days[13].scheduledMinutes, 1440);
    assert.equal(fourWeeks.days[14].scheduledMinutes, 0);
    assert.equal(fourWeeks.days[27].scheduledMinutes, 1440);
  });

  it("copies concrete events with provenance and excludes off-hours from available capacity", () => {
    const result = copyStandardWindowToWeek(input());
    assert.deepEqual(result.issues, []);
    assert.equal(result.events.length, 6);
    assert.equal(result.events[0].sourceEventId, "p1");
    assert.equal(result.events[0].sourceWindowVersion, 1);
    assert.equal(result.days[0].scheduledMinutes, 480);
    assert.equal(result.days[0].bestCaseAvailableMinutes, 450);
    assert.equal(result.days[0].bestCaseSa, 450 / 480);
    assert.equal(result.days[2].scheduledMinutes, 0);
    assert.equal(result.days[2].bestCaseAvailableMinutes, 0);
  });

  it("copies without a predecessor product or synthetic boundary setup", () => {
    const result = copyStandardWindowToWeek(input());
    assert.deepEqual(result.issues, []);
    assert.equal(result.events.every(item => item.origin === "sourceCopy"), true);
    assert.equal(result.days[0].plannedLossMinutes, 30);
    assert.equal(result.days[1].plannedLossMinutes, 30);
  });

  it("blocks a stale source", () => {
    assert.ok(copyStandardWindowToWeek(input({ currentSourceEvents: sourceEvents.map(item => ({ ...item, endMinute: item.endMinute + 1 })) })).issues.some(item => item.code === "source_stale"));
  });

  it("rejects overlapping 48-hour copies and dates beyond the selected week", () => {
    const longEvents = [event("p", "production", 0, 48 * 60)];
    const longSource = freezeStandardWindow({ sourceId: "A::OP10", version: 2, stationId: "OP10", baseDate: "2026-10-08", events: longEvents }).snapshot;
    assert.ok(copyStandardWindowToWeek(input({ source: longSource, currentSourceEvents: longEvents })).issues.some(item => item.code === "repeat_overlap"));
    assert.ok(copyStandardWindowToWeek(input({ repeatDates: ["2026-10-19"] })).issues.some(item => item.code === "outside_week"));
  });

  it("splits a cross-midnight source across calendar days", () => {
    const nightEvents = [event("night", "production", 22 * 60, 26 * 60)];
    const nightSource = freezeStandardWindow({ sourceId: "A::OP10", version: 3, stationId: "OP10", baseDate: "2026-10-08", events: nightEvents }).snapshot;
    const result = copyStandardWindowToWeek(input({ source: nightSource, currentSourceEvents: nightEvents, repeatDates: ["2026-10-12"] }));
    assert.deepEqual(result.issues, []);
    assert.equal(result.days[0].productionMinutes, 120);
    assert.equal(result.days[1].productionMinutes, 120);
  });

  it("copies existing setup segments exactly, regardless of their boundary tags", () => {
    const events = [
      event("a", "production", 480, 600, "A"),
      { ...event("ab", "setup", 600, 630, "B"), changeoverKey: "A->B" },
      event("b", "production", 630, 690, "B"),
      { ...event("ba", "setup", 690, 735, "A"), changeoverKey: "B->A" },
    ];
    const tagged = freezeStandardWindow({ sourceId: "A::OP10", version: 4, stationId: "OP10", baseDate: "2026-10-08", events }).snapshot;
    const result = copyStandardWindowToWeek(input({ source: tagged, currentSourceEvents: events }));
    assert.deepEqual(result.issues, []);
    assert.equal(result.events.filter(item => item.kind === "setup").length, 4);
    assert.equal(result.events.filter(item => item.kind === "setup" && item.changeoverKey === "B->A").length, 2);
  });

  it("expands a defined week to four weeks with individually selected copy or off modes", () => {
    const first = copyStandardWindowToWeek(input());
    const result = expandWeekToFourWeeks(first, ["copy", "off", "copy"]);
    assert.equal(result.weeks.length, 4);
    assert.equal(result.days.length, 28);
    assert.equal(result.weeks[1].weekStartDate, "2026-10-19");
    assert.equal(result.weeks[2].weekStartDate, "2026-10-26");
    assert.equal(result.weeks[3].weekStartDate, "2026-11-02");
    assert.equal(result.weeks[2].events.length, 0);
    assert.equal(result.weeks[1].events[0].startMinute, first.events[0].startMinute + 7 * 1440);
    assert.equal(result.weeks[1].events[0].occurrenceDate, "2026-10-19");
    assert.equal(result.bestCaseAvailableMinutes, 3 * 900);
    assert.equal(result.days[14].scheduledMinutes, 0);
    assert.equal(new Set(result.events.map(item => item.id)).size, result.events.length);
  });

  it("requires a valid first week and three following modes", () => {
    assert.throws(() => expandWeekToFourWeeks(copyStandardWindowToWeek(input({ repeatDates: [] })), ["copy", "off", "off"]));
    assert.throws(() => expandWeekToFourWeeks(copyStandardWindowToWeek(input()), ["copy", "off"]));
  });
});
