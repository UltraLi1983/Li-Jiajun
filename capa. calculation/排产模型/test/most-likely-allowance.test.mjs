import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ledgerShiftCount, lossPlanSignature, mostLikelyMonthProduction, observeShiftAllowance, plannedActionShortfalls, plannedTimingShifts, projectedMostLikelyMinutes, summarizeMostLikely } from "../dist/engine/most-likely-allowance.js";
import { buildWeekMinuteLedger } from "../dist/engine/week-minute-ledger.js";

const shifts = [
  { startMinute: 510, endMinute: 1230 },
  { startMinute: 1230, endMinute: 1950 },
];

describe("most likely shift allowance", () => {
  it("notices shorter planned actions without accepting a loss or crediting extra capacity", () => {
    const planned = [
      { kind: "break", startMinute: 100, endMinute: 130 },
      { kind: "break", startMinute: 300, endMinute: 330 },
      { kind: "maintenance", startMinute: 400, endMinute: 430 },
      { kind: "plannedStop", startMinute: 500, endMinute: 530 },
    ];
    const actual = [
      { stationId: "OP10", kind: "break", startMinute: 110, endMinute: 130 },
      { stationId: "OP10", kind: "break", startMinute: 300, endMinute: 320 },
      { stationId: "OP10", kind: "maintenance", startMinute: 400, endMinute: 430 },
    ];
    assert.deepEqual(plannedActionShortfalls(planned, actual).map(item => [item.kind, item.savedMinutes]),
      [["break", 20], ["plannedStop", 30]]);
    assert.deepEqual(plannedTimingShifts(planned, actual), []);
  });

  it("flags equal-total shifted planned actions for separate review without treating them as overruns", () => {
    const planned = [
      { kind: "production", startMinute: 0, endMinute: 100 },
      { kind: "break", startMinute: 100, endMinute: 130 },
      { kind: "production", startMinute: 130, endMinute: 300 },
      { kind: "break", startMinute: 300, endMinute: 330 },
      { kind: "production", startMinute: 330, endMinute: 500 },
      { kind: "plannedStop", startMinute: 500, endMinute: 530 },
    ];
    const actual = [
      { stationId: "OP20A", kind: "break", startMinute: 110, endMinute: 140 },
      { stationId: "OP20A", kind: "break", startMinute: 290, endMinute: 320 },
      { stationId: "OP20A", kind: "plannedStop", startMinute: 510, endMinute: 540 },
    ];
    const shifts = plannedTimingShifts(planned, actual);
    assert.deepEqual(shifts.map(item => [item.kind, item.minutes, item.displacedMinutes, item.confirmed]),
      [["break", 60, 20, false], ["plannedStop", 30, 10, false]]);
    const allowance = observeShiftAllowance({ stationId: "OP20A", shifts: [{ startMinute: 0, endMinute: 540 }], planned, actual });
    assert.equal(allowance.pendingLossMinutes, 0);
    assert.equal(allowance.plannedOverrunMinutes, 0);
    const reviewed = actual.map(event => ({ ...event, timingShiftConfirmed: true,
      timingShiftSignature: shifts.find(item => item.kind === event.kind)?.signature }));
    assert.ok(plannedTimingShifts(planned, reviewed).every(item => item.confirmed));
    assert.ok(!plannedTimingShifts(planned, reviewed.slice(1)).some(item => item.kind === "break" && item.confirmed));
    assert.ok(plannedTimingShifts(planned, reviewed.map(event => event.kind === "break" && event.startMinute === 110
      ? { ...event, startMinute: 105, endMinute: 135 } : event)).some(item => item.kind === "break" && !item.confirmed));
  });

  it("ignores split-only boundaries and leaves real overruns to loss review", () => {
    const planned = [{ kind: "maintenance", startMinute: 100, endMinute: 130 }];
    const split = [{ stationId: "OP10", kind: "maintenance", startMinute: 100, endMinute: 115 },
      { stationId: "OP10", kind: "maintenance", startMinute: 115, endMinute: 130 }];
    assert.deepEqual(plannedTimingShifts(planned, split), []);
    assert.deepEqual(plannedTimingShifts(planned, [{ ...split[0], endMinute: 140 }]), []);
  });

  it("divides observed unplanned minutes by the shifts that were actually recorded", () => {
    const allowance = observeShiftAllowance({
      stationId: "OP20A",
      shifts,
      actual: [
        { stationId: "OP20A", kind: "production", startMinute: 510, endMinute: 1230 },
        { stationId: "OP20A", kind: "equipmentFailure", startMinute: 1320, endMinute: 1350, evidenceSource: "alarm", isEstimated: false, mlLossConfirmed: true, mlLossPlanSignature: "[]" },
        { stationId: "OP20A", kind: "production", startMinute: 1350, endMinute: 1950 },
      ],
    });
    assert.equal(allowance.observedShiftCount, 2);
    assert.equal(allowance.observedUnplannedMinutes, 30);
    assert.equal(allowance.perShiftMinutes, 15);
    assert.equal(allowance.planningUnplannedMinutes, 30);
    assert.deepEqual(allowance.sources[0], {
      category: "equipmentFailure", stationId: "OP20A", shiftNumbers: [2], minutes: 30, recoverableMinutes: 0, planningMinutes: 30, source: "alarm", estimated: false,
    });
  });

  it("keeps the recorded interruption and plans only the minutes that cannot be recovered", () => {
    const allowance = observeShiftAllowance({
      stationId: "OP20A",
      shifts,
      actual: [
        { stationId: "OP20A", kind: "production", startMinute: 510, endMinute: 1950 },
        { stationId: "OP20A", kind: "equipmentFailure", startMinute: 1320, endMinute: 1350, recoverableMinutes: 10, recoverableConfirmed: true, mlLossConfirmed: true, mlLossPlanSignature: "[]" },
      ],
    });
    assert.equal(allowance.observedUnplannedMinutes, 30);
    assert.equal(allowance.recoverableMinutes, 10);
    assert.equal(allowance.planningUnplannedMinutes, 20);
    assert.equal(allowance.perShiftMinutes, 10);
    const over = observeShiftAllowance({
      stationId: "OP20A",
      shifts,
      actual: [
        { stationId: "OP20A", kind: "production", startMinute: 510, endMinute: 1950 },
        { stationId: "OP20A", kind: "equipmentFailure", startMinute: 1320, endMinute: 1350, recoverableMinutes: 40, recoverableConfirmed: true, mlLossConfirmed: true, mlLossPlanSignature: "[]" },
      ],
    });
    assert.equal(over.recoverableMinutes, 30);
    assert.equal(over.planningUnplannedMinutes, 0);
  });

  it("does not apply a recoverable-minute proposal before confirmation", () => {
    const allowance = observeShiftAllowance({ stationId: "OP20A", shifts, actual: [
      { stationId: "OP20A", kind: "production", startMinute: 510, endMinute: 1230 },
      { stationId: "OP20A", kind: "equipmentFailure", startMinute: 1320, endMinute: 1350, recoverableMinutes: 10 },
      { stationId: "OP20A", kind: "production", startMinute: 1350, endMinute: 1950 },
    ] });
    assert.equal(allowance.recoverableMinutes, 0);
    assert.equal(allowance.perShiftMinutes, 0);
    assert.equal(allowance.pendingLossMinutes, 30);
  });

  it("dilutes confirmed production loss over planned production in copied windows", () => {
    const planned = [
      { kind: "production", startMinute: 0, endMinute: 600 },
    ];
    const signature = lossPlanSignature(planned);
    const actual = [
      { stationId: "OP20A", kind: "production", startMinute: 0, endMinute: 240 },
      { stationId: "OP20A", kind: "equipmentFailure", startMinute: 240, endMinute: 300,
        mlLossConfirmed: true, mlLossPlanSignature: signature },
      { stationId: "OP20A", kind: "production", startMinute: 300, endMinute: 600 },
    ];
    const allowance = observeShiftAllowance({ stationId: "OP20A", shifts: [{ startMinute: 0, endMinute: 600 }], planned, actual });
    assert.equal(allowance.sourceProductionMinutes, 600);
    assert.equal(allowance.projectedLossRate, 0.1);
    assert.equal(projectedMostLikelyMinutes({ workingDay: true, stale: false, origin: "sourceCopy", productionMinutes: 480 }, 1, allowance), 432);
    const stale = observeShiftAllowance({ stationId: "OP20A", shifts: [{ startMinute: 0, endMinute: 600 }],
      planned: [{ kind: "production", startMinute: 0, endMinute: 540 }], actual });
    assert.equal(stale.planningUnplannedMinutes, 0);
    assert.equal(stale.pendingLossMinutes, 60);
  });

  it("counts only confirmed planned-stop overrun intruding on planned production", () => {
    const planned = [
      { kind: "production", startMinute: 0, endMinute: 300 },
      { kind: "plannedStop", startMinute: 300, endMinute: 330 },
      { kind: "production", startMinute: 330, endMinute: 600 },
    ];
    const signature = lossPlanSignature(planned);
    const actual = [
      { stationId: "OP20A", kind: "production", startMinute: 0, endMinute: 300 },
      { stationId: "OP20A", kind: "plannedStop", startMinute: 300, endMinute: 360 },
      { stationId: "OP20A", kind: "production", startMinute: 360, endMinute: 600 },
    ];
    const before = observeShiftAllowance({ stationId: "OP20A", shifts: [{ startMinute: 0, endMinute: 600 }], planned, actual });
    assert.equal(before.pendingLossMinutes, 30);
    assert.equal(before.planningUnplannedMinutes, 0);
    actual[1].mlLossConfirmed = true;
    actual[1].mlLossPlanSignature = signature;
    const after = observeShiftAllowance({ stationId: "OP20A", shifts: [{ startMinute: 0, endMinute: 600 }], planned, actual });
    assert.equal(after.plannedOverrunMinutes, 30);
    assert.equal(after.sourceProductionMinutes, 570);
    assert.equal(after.projectedLossRate, 30 / 570);
    assert.equal(after.perShiftMinutes, 0);
    assert.equal(projectedMostLikelyMinutes({ workingDay: true, stale: false, origin: "sourceCopy", productionMinutes: 570 }, 1, after), 540);
    assert.equal(projectedMostLikelyMinutes({ workingDay: true, stale: false, origin: "manualMinutes", productionMinutes: 570, plannedStopMinutes: 0 }, 1, after), 570);
    assert.equal(projectedMostLikelyMinutes({ workingDay: true, stale: false, origin: "manualMinutes", productionMinutes: 570, plannedStopMinutes: 20 }, 1, after), 540);
  });

  it("projects a stable day only with losses for its configured actions plus production interruptions", () => {
    const allowance = { sourceProductionMinutes: 600, planningUnplannedMinutes: 60, projectedLossRate: 0.1,
      perShiftMinutes: 30, sources: [
        { category: "equipmentFailure", planningMinutes: 30 },
        { category: "breakOverrun", planningMinutes: 20 },
        { category: "setupOverrun", planningMinutes: 10 },
      ] };
    const base = { workingDay: true, stale: false, productionMinutes: 500, origin: "manualMinutes",
      breakMinutes: 0, setupMinutes: 0, maintenanceMinutes: 0, plannedStopMinutes: 0 };
    assert.equal(projectedMostLikelyMinutes({ ...base, origin: "sourceCopy" }, 1, allowance), 450);
    assert.equal(projectedMostLikelyMinutes(base, 1, allowance), 475);
    assert.ok(Math.abs(projectedMostLikelyMinutes({ ...base, breakMinutes: 30 }, 1, allowance) - (500 - 500 * 50 / 600)) < 1e-9);
    assert.equal(projectedMostLikelyMinutes({ ...base, breakMinutes: 30, setupMinutes: 20 }, 1, allowance), 450);
  });

  it("ignores abnormal time outside an observed shift and returns nothing before any run", () => {
    assert.equal(observeShiftAllowance({ stationId: "OP20A", shifts, actual: [] }), undefined);
    const allowance = observeShiftAllowance({
      stationId: "OP20A",
      shifts,
      actual: [
        { stationId: "OP20A", kind: "production", startMinute: 510, endMinute: 600 },
        { stationId: "OP20A", kind: "equipmentFailure", startMinute: 2000, endMinute: 2030 },
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
