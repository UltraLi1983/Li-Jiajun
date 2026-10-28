import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrangeFourWeekLedger, buildWeekMinuteLedger, repeatWeekForMonth, validateManualMinutes } from "../dist/engine/week-minute-ledger.js";

const blank = () => ({ mode: "off" });
const week = choices => ({ weekStartDate: "2026-10-12", dayStartMinute: 510, choices, sourceCurrent: true });
const manual = (production, rest = {}) => {
  const shiftMinutes = rest.shiftMinutes ?? 480;
  const shiftsPerDay = rest.shiftsPerDay ?? 2;
  const breakMinutes = rest.breakMinutes ?? 0;
  const setupMinutes = rest.setupMinutes ?? 0;
  const maintenanceMinutes = rest.maintenanceMinutes ?? 0;
  const opened = shiftMinutes * shiftsPerDay;
  const plannedStopMinutes = rest.plannedStopMinutes ?? Math.max(0, opened - production - breakMinutes - setupMinutes - maintenanceMinutes);
  return { shiftMinutes, shiftsPerDay, productionMinutes: production, breakMinutes, setupMinutes, maintenanceMinutes, plannedStopMinutes, unscheduledMinutes: 0 };
};

describe("independent week minute ledger", () => {
  it("fills an opened 8-hour two-shift window and records the unopened shift as unscheduled", () => {
    const saved = manual(700, { breakMinutes: 60 });
    assert.equal(saved.plannedStopMinutes, 200);
    assert.deepEqual(validateManualMinutes(saved, "2026-10-14"), []);
    const choices = Array.from({ length: 7 }, () => blank());
    choices[2] = { mode: "manual", manual: saved };
    const result = buildWeekMinuteLedger(week(choices));
    assert.deepEqual(result.issues, []);
    assert.equal(result.days[2].scheduledMinutes, 960);
    assert.equal(result.days[2].unscheduledMinutes, 480);
    assert.equal(result.days[2].offShiftMinutes, 0);
    assert.equal(result.summary.withoutBreaksDenominator, 960 - 60);
    assert.equal(result.days[2].workingDay, true);
    assert.equal(result.days[2].origin, "manualMinutes");
    assert.equal(result.days[2].sourceEventIds, undefined);
    assert.equal(result.summary.withBreaksDenominator, 1440);
    assert.equal(result.summary.withBreaksSa, 700 / 1440);
  });

  it("rejects 900 + 200 + 340 because the total exceeds the 960 scheduled minutes", () => {
    const saved = manual(900, { breakMinutes: 200, setupMinutes: 340, plannedStopMinutes: 0 });
    const issues = validateManualMinutes(saved, "2026-10-14");
    assert.equal(issues[0].date, "2026-10-14");
    assert.equal(issues[0].field, "total");
    const choices = Array.from({ length: 7 }, () => blank());
    choices[2] = { mode: "manual", manual: saved };
    assert.equal(buildWeekMinuteLedger(week(choices)).summary, undefined);
  });

  it("keeps a zero-production working day in the With breaks denominator and can schedule Sunday", () => {
    const choices = Array.from({ length: 7 }, () => blank());
    choices[5] = { mode: "manual", manual: manual(0) };
    choices[6] = { mode: "manual", manual: manual(100) };
    const result = buildWeekMinuteLedger(week(choices));
    assert.equal(result.days[5].workingDay, true);
    assert.equal(result.days[5].productionMinutes, 0);
    assert.equal(result.days[6].date, "2026-10-18");
    assert.equal(result.summary.workingDayCount, 2);
    assert.equal(result.summary.withBreaksSa, 100 / (2 * 1440));
    assert.equal(result.summary.calendarDenominator, 7 * 1440);
    assert.equal(result.summary.calendarUtilization, 100 / (7 * 1440));
  });

  it("repeats one stable day across the month and deducts a changeover that happens twice", () => {
    const stable = manual(800, { setupMinutes: 60 });
    const choices = Array.from({ length: 7 }, () => blank());
    choices[2] = { mode: "manual", manual: stable };
    choices[3] = { mode: "manual", manual: stable };
    const first = buildWeekMinuteLedger(week(choices));
    assert.equal(first.days[2].productionMinutes, first.days[3].productionMinutes);
    assert.equal(first.days[2].setupMinutes, 60);
    const month = repeatWeekForMonth(first, { occurrences: 2, minutesPerOccurrence: 30 });
    assert.equal(month.issues.length, 0);
    assert.equal(month.weeks[1].days[2].setupMinutes, 60);
    assert.equal(month.weeks[1].days[2].date, "2026-10-21");
    assert.equal(month.setupAllowanceMinutes, 60);
    assert.equal(month.summary.productionMinutes, first.summary.productionMinutes * 4 - 60);
    assert.equal(month.summary.withBreaksDenominator, first.summary.withBreaksDenominator * 4);
    assert.equal(month.summary.calendarDenominator, 28 * 1440);
    const tooMuch = repeatWeekForMonth(first, { occurrences: 3, minutesPerOccurrence: 100000 });
    assert.equal(tooMuch.issues[0].code, "monthly_setup");
    assert.equal(tooMuch.setupAllowanceMinutes, 0);
    assert.equal(tooMuch.summary.productionMinutes, first.summary.productionMinutes * 4);
  });

  it("copies source setup minutes and lets an independent week remove a one-off setup", () => {
    const choices = Array.from({ length: 7 }, () => blank());
    choices[0] = { mode: "manual", manual: manual(800, { setupMinutes: 60 }) };
    choices[5] = { mode: "manual", manual: manual(0) };
    const first = buildWeekMinuteLedger(week(choices));
    const independentChoices = Array.from({ length: 7 }, () => blank());
    independentChoices[0] = { mode: "manual", manual: manual(860) };
    const independent = buildWeekMinuteLedger({ ...week(independentChoices), weekStartDate: "2026-10-26" });
    const four = arrangeFourWeekLedger(first, [
      { mode: "copy" },
      { mode: "independent", week: independent },
      { mode: "off" },
    ]);
    assert.equal(four.weeks[1].days[0].setupMinutes, 60);
    assert.equal(four.weeks[2].days[0].setupMinutes, 0);
    assert.equal(four.weeks[3].days.every(day => !day.workingDay && day.productionMinutes === 0), true);
    assert.equal(first.days[0].setupMinutes, 60);
    assert.equal(four.days.length, 28);
    assert.equal(four.summary.calendarDenominator, 28 * 1440);
    const averaged = (four.weeks[0].summary.withBreaksSa + four.weeks[1].summary.withBreaksSa + four.weeks[2].summary.withBreaksSa) / 3;
    assert.notEqual(four.summary.withBreaksSa, averaged);
  });

  it("blocks a 48-hour copy from covering the next day and keeps a pure manual day when the source is stale", () => {
    const copy = {
      issues: [], weekStartMinuteOfDay: 480, events: [{
        id: "span", kind: "production", startMinute: 480, endMinute: 480 + 1500, occurrenceDate: "2026-10-12",
        sourceEventId: "source-1", origin: "sourceCopy", sourceWindowId: "window", sourceWindowVersion: 1, stationId: "OP20A", source: "manual",
      }],
    };
    const conflict = Array.from({ length: 7 }, () => blank());
    conflict[0] = { mode: "copy" };
    conflict[1] = { mode: "manual", manual: manual(100) };
    const blocked = buildWeekMinuteLedger({ ...week(conflict), dayStartMinute: 480, copy });
    assert.equal(blocked.issues.some(issue => issue.code === "span_conflict" && issue.date === "2026-10-13"), true);
    const staleChoices = Array.from({ length: 7 }, () => blank());
    staleChoices[0] = { mode: "copy" };
    staleChoices[2] = { mode: "manual", manual: manual(500) };
    assert.equal(validateManualMinutes(manual(0, { shiftMinutes: 720, shiftsPerDay: 3 }), "2026-10-14")[0].field, "shiftsPerDay");
    const oneLongShift = buildWeekMinuteLedger(week([{ mode: "manual", manual: manual(720, { shiftMinutes: 720, shiftsPerDay: 1 }) }, blank(), blank(), blank(), blank(), blank(), blank()]));
    assert.equal(oneLongShift.days[0].unscheduledMinutes, 720);
    assert.equal(oneLongShift.days[0].scheduledMinutes, 720);
    assert.equal(oneLongShift.summary.withoutBreaksDenominator, 720);
    const stale = buildWeekMinuteLedger({ ...week(staleChoices), dayStartMinute: 480, copy: { ...copy, events: [{ ...copy.events[0], endMinute: 480 + 1440 }] }, sourceCurrent: false });
    assert.equal(stale.issues.some(issue => issue.code === "source_stale"), true);
    assert.equal(stale.days[2].productionMinutes, 500);
    assert.equal(stale.days[2].stale, false);
    assert.equal(stale.days[0].stale, true);
  });
});
