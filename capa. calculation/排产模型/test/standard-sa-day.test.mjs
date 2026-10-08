import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStandardSaSampleSlots, reconcileAutoFilledGaps, standardSaOffShiftIntervals, standardSaShiftIntervals, summarizeStandardSaDay, validateStandardSaDay } from "../dist/engine/standard-sa-day.js";

const event = (id, kind, startMinute, endMinute) => ({
  id, kind, startMinute, endMinute, stationId: "OP10", source: "manual",
});
const config = { startMinute: 510, dayCount: 1, shiftMinutes: 720, shiftsPerDay: 1 };
const events = [
  event("production-1", "production", 510, 660),
  event("break-1", "break", 660, 690),
  event("production-2", "production", 690, 1020),
  event("break-2", "break", 1020, 1050),
  event("production-3", "production", 1050, 1140),
  event("setup", "setup", 1140, 1230),
];

describe("standard SA production day", () => {
  it("generates a complete 12-hour sample matching the original one-shift pattern", () => {
    const sample = buildStandardSaSampleSlots(config).map((slot, index) => ({ ...event(`sample-${index}`, slot.kind, slot.startMinute, slot.endMinute) }));
    assert.deepEqual(sample.map(item => [item.kind, item.startMinute, item.endMinute]), events.map(item => [item.kind, item.startMinute, item.endMinute]));
    assert.deepEqual(validateStandardSaDay(sample, config), []);
  });

  it("fills every scheduled shift without filling off-shift hours", () => {
    for (const [shiftMinutes, shiftsPerDay, dayCount] of [[480, 1, 1], [480, 2, 1], [480, 3, 1], [720, 2, 1], [480, 3, 2]]) {
      const schedule = { startMinute: 510, dayCount, shiftMinutes, shiftsPerDay };
      const sample = buildStandardSaSampleSlots(schedule).map((slot, index) => event(`sample-${index}`, slot.kind, slot.startMinute, slot.endMinute));
      assert.deepEqual(validateStandardSaDay(sample, schedule), []);
      assert.equal(sample.reduce((total, item) => total + item.endMinute - item.startMinute, 0), dayCount * shiftsPerDay * shiftMinutes);
      assert.equal(sample.filter(item => item.kind === "setup").length, 1);
      assert.equal(summarizeStandardSaDay(sample, schedule).nonScheduledMinutes, dayCount * (1440 - shiftsPerDay * shiftMinutes));
    }
  });

  it("uses the anchored 24-hour day for with-breaks and planned shift time minus breaks for without-breaks", () => {
    assert.deepEqual(validateStandardSaDay(events, config), []);
    const result = summarizeStandardSaDay(events, config);
    assert.equal(result.horizonMinutes, 1440);
    assert.equal(result.scheduledMinutes, 720);
    assert.equal(result.nonScheduledMinutes, 720);
    assert.equal(result.productionMinutes, 570);
    assert.equal(result.breakMinutes, 60);
    assert.equal(result.setupMinutes, 90);
    assert.equal(result.bestCaseSaWithBreaks, 570 / 1440);
    assert.equal(result.bestCaseSaWithoutBreaks, 570 / 660);
    assert.deepEqual(standardSaOffShiftIntervals(config), [{ startMinute: 1230, endMinute: 1950 }]);
  });

  it("allows one to three 8-hour shifts and anchors the next production day 24 hours later", () => {
    const twoDays = { startMinute: 450, dayCount: 2, shiftMinutes: 480, shiftsPerDay: 2 };
    assert.deepEqual(standardSaShiftIntervals(twoDays), [
      { startMinute: 450, endMinute: 930 },
      { startMinute: 930, endMinute: 1410 },
      { startMinute: 1890, endMinute: 2370 },
      { startMinute: 2370, endMinute: 2850 },
    ]);
    assert.equal(summarizeStandardSaDay([], twoDays).nonScheduledMinutes, 960);
    assert.deepEqual(standardSaOffShiftIntervals(twoDays), [
      { startMinute: 1410, endMinute: 1890 },
      { startMinute: 2850, endMinute: 3330 },
    ]);
  });

  it("keeps the OEE-oriented rate stable when a second identical 12-hour shift is scheduled", () => {
    const nextShift = events.map(item => ({ ...item, id: `${item.id}-night`, startMinute: item.startMinute + 720, endMinute: item.endMinute + 720 }));
    const fullDay = { ...config, shiftsPerDay: 2 };
    assert.deepEqual(validateStandardSaDay([...events, ...nextShift], fullDay), []);
    const result = summarizeStandardSaDay([...events, ...nextShift], fullDay);
    assert.equal(result.nonScheduledMinutes, 0);
    assert.equal(result.bestCaseSaWithBreaks, 1140 / 1440);
    assert.equal(result.bestCaseSaWithoutBreaks, 1140 / 1320);
  });

  it("allows an event to cross the boundary of adjacent 8-hour shifts, but not an off-shift interval", () => {
    const twoShifts = { ...config, shiftMinutes: 480, shiftsPerDay: 2 };
    const filled = [...events, { ...event("auto-gap", "unscheduled", 1230, 1470), autoFilled: true }];
    assert.deepEqual(validateStandardSaDay(filled, twoShifts), []);
    const offShift = { ...twoShifts, shiftsPerDay: 1 };
    assert.ok(validateStandardSaDay(events, offShift).includes("outside_shift"));
  });

  it("rejects the old 750-minute sample, unrecorded scheduled time and events in off-shift time", () => {
    assert.ok(validateStandardSaDay([...events.slice(0, -1), event("setup", "setup", 1140, 1260)], config).includes("outside_shift"));
    assert.ok(validateStandardSaDay(events.slice(0, -1), config).includes("gap"));
    assert.ok(validateStandardSaDay([...events, event("night", "production", 1230, 1290)], config).includes("outside_shift"));
  });

  it("drops only auto-filled gaps from a removed production day", () => {
    const secondDayGap = { ...event("planned-unscheduled-1790000000000-0", "unscheduled", 1950, 2670), label: "未排产" };
    const manualProduction = event("manual-production", "production", 2670, 2700);
    const next = reconcileAutoFilledGaps([...events, secondDayGap, manualProduction], config);
    assert.ok(!next.some(item => item.id === secondDayGap.id));
    assert.ok(next.some(item => item.id === manualProduction.id));
    assert.deepEqual(validateStandardSaDay(reconcileAutoFilledGaps([...events, secondDayGap], config), config), []);
    assert.ok(validateStandardSaDay(next, config).includes("outside_shift"));
  });

  it("clips auto-filled gaps at the new 8-hour boundary and keeps edited gaps", () => {
    const shortShift = { ...config, shiftMinutes: 480 };
    const autoGap = { ...event("auto-gap", "unscheduled", 900, 1230), autoFilled: true };
    const editedGap = { ...event("planned-unscheduled-1790000000000-1", "unscheduled", 1230, 1260), label: "未排产", autoFilled: false };
    const next = reconcileAutoFilledGaps([autoGap, editedGap], shortShift);
    assert.deepEqual(next.map(item => [item.startMinute, item.endMinute]), [[900, 990], [1230, 1260]]);
    assert.ok(validateStandardSaDay(next, shortShift).includes("outside_shift"));
  });
});
