import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ledgerShiftCount, mostLikelyMonthProduction, observeShiftAllowance, summarizeMostLikely } from "../dist/engine/most-likely-allowance.js";
import { buildWeekMinuteLedger } from "../dist/engine/week-minute-ledger.js";

const shifts = [
  { startMinute: 510, endMinute: 1230 },
  { startMinute: 1230, endMinute: 1950 },
];

describe("most likely shift allowance", () => {
  it("divides observed unplanned minutes by the shifts that were actually recorded", () => {
    const allowance = observeShiftAllowance({
      stationId: "OP10",
      shifts,
      actual: [
        { stationId: "OP10", kind: "production", startMinute: 510, endMinute: 1230 },
        { stationId: "OP10", kind: "equipmentFailure", startMinute: 1320, endMinute: 1350, evidenceSource: "alarm", isEstimated: false },
        { stationId: "OP10", kind: "production", startMinute: 1350, endMinute: 1950 },
      ],
    });
    assert.equal(allowance.observedShiftCount, 2);
    assert.equal(allowance.observedUnplannedMinutes, 30);
    assert.equal(allowance.perShiftMinutes, 15);
    assert.equal(allowance.planningUnplannedMinutes, 30);
    assert.deepEqual(allowance.sources[0], {
      category: "equipmentFailure", stationId: "OP10", shiftNumbers: [2], minutes: 30, recoverableMinutes: 0, planningMinutes: 30, source: "alarm", estimated: false,
    });
  });

  it("keeps the recorded interruption and plans only the minutes that cannot be recovered", () => {
    const allowance = observeShiftAllowance({
      stationId: "OP10",
      shifts,
      actual: [
        { stationId: "OP10", kind: "production", startMinute: 510, endMinute: 1950 },
        { stationId: "OP10", kind: "equipmentFailure", startMinute: 1320, endMinute: 1350, recoverableMinutes: 10 },
      ],
    });
    assert.equal(allowance.observedUnplannedMinutes, 30);
    assert.equal(allowance.recoverableMinutes, 10);
    assert.equal(allowance.planningUnplannedMinutes, 20);
    assert.equal(allowance.perShiftMinutes, 10);
    const over = observeShiftAllowance({
      stationId: "OP10",
      shifts,
      actual: [
        { stationId: "OP10", kind: "production", startMinute: 510, endMinute: 1950 },
        { stationId: "OP10", kind: "equipmentFailure", startMinute: 1320, endMinute: 1350, recoverableMinutes: 40 },
      ],
    });
    assert.equal(over.recoverableMinutes, 30);
    assert.equal(over.planningUnplannedMinutes, 0);
  });

  it("ignores abnormal time outside an observed shift and returns nothing before any run", () => {
    assert.equal(observeShiftAllowance({ stationId: "OP10", shifts, actual: [] }), undefined);
    const allowance = observeShiftAllowance({
      stationId: "OP10",
      shifts,
      actual: [
        { stationId: "OP10", kind: "production", startMinute: 510, endMinute: 600 },
        { stationId: "OP10", kind: "equipmentFailure", startMinute: 2000, endMinute: 2030 },
      ],
    });
    assert.equal(allowance.observedShiftCount, 1);
    assert.equal(allowance.observedUnplannedMinutes, 0);
    assert.equal(allowance.perShiftMinutes, 0);
  });

  it("deducts the per-shift allowance from stable days and copied source days, then from the repeated month", () => {
    const manual = { shiftMinutes: 480, shiftsPerDay: 2, productionMinutes: 700, breakMinutes: 60, setupMinutes: 0, maintenanceMinutes: 0, plannedStopMinutes: 200, unscheduledMinutes: 0 };
    const choices = Array.from({ length: 7 }, () => ({ mode: "off" }));
    choices[0] = { mode: "copy" };
    choices[2] = { mode: "manual", manual };
    const ledger = buildWeekMinuteLedger({ weekStartDate: "2026-10-12", dayStartMinute: 510, choices, sourceCurrent: true });
    const counts = ledger.days.map(day => ledgerShiftCount(day, 2, 1));
    assert.equal(counts[0], 1);
    assert.equal(counts[2], 2);
    const occupied = { ...ledger.days[1], mode: "occupied", workingDay: true, origin: "sourceCopy", productionMinutes: 100 };
    assert.equal(ledgerShiftCount(occupied, 2, 1), 0);
    const summary = summarizeMostLikely(ledger.days, counts, 15);
    assert.equal(summary.productionMinutes, 670);
    assert.equal(summary.withBreaksDenominator, ledger.summary.withBreaksDenominator);
    assert.equal(summary.withoutBreaksDenominator, ledger.summary.withoutBreaksDenominator);
    assert.equal(mostLikelyMonthProduction(670, 4, 60), 2620);
    assert.equal(summarizeMostLikely([{ ...ledger.days[2], productionMinutes: 10 }], [2], 15).productionMinutes, 0);
  });
});
