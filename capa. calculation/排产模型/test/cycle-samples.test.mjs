import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCycleSample, correctPlannedCycleFromCheck, diagnosePlannedCycle, emptyCycleSampleDraft, establishInitialLocalPreset,
  formatStopwatch, migrateLegacyCycleDraft, performanceAgainstCycle, removeCycleSample, replaceCycleSample,
  setCycleSampleMark, setTargetSampleCount, summarizeCycleSamples,
} from "../dist/index.js";
import { buildPeriodCapacity } from "../dist/engine/week-month-capacity.js";

function fill(draft, values) {
  return values.reduce((current, value) => addCycleSample(current, String(value), `s-${current.samples.length + 1}`).draft, draft);
}

describe("per-sample cycle entry", () => {
  it("adds, edits and deletes finite positive samples without mixing invalid values into the mean", () => {
    const empty = emptyCycleSampleDraft(15);
    assert.equal(addCycleSample(empty, "").error, "invalid");
    assert.equal(addCycleSample(empty, "0").error, "invalid");
    assert.equal(addCycleSample(empty, "-1").error, "invalid");
    assert.equal(addCycleSample(empty, "24s").error, "invalid");
    assert.equal(addCycleSample(empty, "Infinity").error, "invalid");
    const added = addCycleSample(empty, "337", "a");
    const edited = replaceCycleSample(added.draft, "a", "10337");
    const rejected = replaceCycleSample(edited.draft, "a", " ");
    const removed = removeCycleSample(edited.draft, "a");
    assert.equal(added.draft.samples[0].seconds, 3.37);
    assert.equal(formatStopwatch(added.draft.samples[0].seconds), "00:03.37");
    assert.equal(edited.draft.samples[0].seconds, 63.37);
    assert.equal(formatStopwatch(edited.draft.samples[0].seconds), "01:03.37");
    assert.equal(addCycleSample(empty, "3.37").error, "invalid");
    assert.equal(rejected.error, "invalid");
    assert.equal(rejected.draft.samples[0].seconds, 63.37);
    assert.equal(removed.samples.length, 0);
    assert.equal(empty.targetSamples, 15);
  });

  it("keeps an existing target of 20 and can be set to the original sheet size of 15", () => {
    const draft = emptyCycleSampleDraft(20);
    const invalid = setTargetSampleCount(draft, "0");
    const fifteen = setTargetSampleCount(draft, "15");
    assert.equal(invalid.error, "invalid");
    assert.equal(invalid.draft.targetSamples, 20);
    assert.equal(fifteen.draft.targetSamples, 15);
  });

  it("counts collected, valid and excluded laps, and averages the valid ones in entry order", () => {
    const open = summarizeCycleSamples(fill(emptyCycleSampleDraft(3), [3000, 2400]));
    const reached = summarizeCycleSamples(fill(emptyCycleSampleDraft(2), [3000, 2400, 1800]));
    assert.equal(open.recordedCount, 2);
    assert.equal(open.validCount, 2);
    assert.equal(open.excludedCount, 0);
    assert.equal(open.status, "verified");
    assert.equal(open.observedMeanSec, 27);
    assert.deepEqual(reached.orderedSeconds, [30, 24, 18]);
    assert.equal(reached.observedMeanSec, 24);
    const stoppedOnly = setCycleSampleMark(fill(emptyCycleSampleDraft(2), [3000]), "s-1", "lineStop", true);
    const excluded = summarizeCycleSamples(stoppedOnly);
    assert.equal(excluded.recordedCount, 1);
    assert.equal(excluded.validCount, 0);
    assert.equal(excluded.excludedCount, 1);
    assert.equal(excluded.status, "below-target");
  });

  it("keeps a stopped lap out of the average and flags the laps slower than that average", () => {
    let draft = fill(emptyCycleSampleDraft(3), [337, 279, 357]);
    draft = setCycleSampleMark(draft, "s-2", "lineStop", true);
    draft = setCycleSampleMark(draft, "s-3", "nok", true);
    const summary = summarizeCycleSamples(draft);
    assert.equal(summary.validCount, 2);
    assert.equal(summary.recordedCount, 3);
    assert.equal(summary.excludedCount, 1);
    assert.equal(summary.lineStopCount, 1);
    assert.equal(summary.nokCount, 1);
    assert.ok(Math.abs(summary.observedMeanSec - (3.37 + 3.57) / 2) < 1e-9);
    assert.deepEqual(summary.slowerSampleIds, ["s-3"]);
    assert.equal(summary.orderedSeconds.includes(2.79), false);
  });
});

describe("legacy cycle draft migration", () => {
  it("keeps order, target count and parseable values, and retains invalid source text", () => {
    const migrated = migrateLegacyCycleDraft({
      samples: "24, 25，bad / 26",
      targetSamples: 20,
      standardCycleSec: 24,
      acceptableSlowDeviationPercent: 2,
    });
    assert.deepEqual(migrated.draft.samples.map(sample => sample.seconds), [24, 25, 26]);
    assert.equal(migrated.draft.targetSamples, 20);
    assert.equal(migrated.draft.acceptableSlowDeviationPercent, 2);
    assert.equal(migrated.draft.legacyUnparsed, "24, 25，bad / 26");
    assert.deepEqual(migrated.issues, ["bad"]);
    assert.equal("standardCycleSec" in migrated.draft, false);
  });

  it("does not rewrite a saved target and accepts an already ordered sample list", () => {
    const saved = migrateLegacyCycleDraft({
      samples: [{ id: "kept", seconds: 15 }, { id: "bad", seconds: 0 }, { id: "next", seconds: 16 }],
      targetSamples: 15,
    });
    assert.equal(saved.draft.targetSamples, 15);
    assert.deepEqual(saved.draft.samples.map(sample => sample.seconds), [15, 16]);
    assert.deepEqual(saved.issues, ["sample-2:0"]);
  });
});

describe("initial local preset from cycle samples", () => {
  const samples = fill(emptyCycleSampleDraft(2), [2200, 2200]);
  const request = {
    operationId: "op-b-10", stationId: "OP10", standardCycleSec: 22, piecesPerCycle: 2,
    performanceRate: 0.9, performanceReviewed: true, performanceOverrideConfirmed: true, samples, evidenceRef: "cycle-check:B:op-b-10:OP10",
    parameterId: "local-baseline-test", effectiveFrom: "2026-10-15",
  };

  it("requires a valid lap, clean samples and an explicit P review, and does not use a hidden 24 second CT", () => {
    const source = structuredClone(samples);
    assert.throws(() => establishInitialLocalPreset({ ...request, samples: emptyCycleSampleDraft(3) }), /not ready/);
    const stopped = setCycleSampleMark(fill(emptyCycleSampleDraft(3), [2200]), "s-1", "lineStop", true);
    assert.throws(() => establishInitialLocalPreset({ ...request, samples: stopped }), /not ready/);
    const oneLap = establishInitialLocalPreset({
      ...request, samples: fill(emptyCycleSampleDraft(20), [2200]), parameterId: "local-one-lap",
    });
    assert.equal(oneLap.standardCycleSec, 22);
    assert.throws(() => establishInitialLocalPreset({
      ...request,
      samples: migrateLegacyCycleDraft({ samples: "22, bad", targetSamples: 1 }).draft,
    }), /not ready/);
    assert.throws(() => establishInitialLocalPreset({ ...request, performanceReviewed: false }), /reviewed/);
    assert.throws(() => establishInitialLocalPreset({
      ...request,
      existingParameters: [{
        parameterId: "planned", operationId: "op-b-10", stationId: "OP10", standardCycleSec: 24,
        piecesPerCycle: 1, performanceRate: 1, qualityRate: 1, parameterSource: "engineeringEstimate",
        approvalStatus: "approved",
      }],
    }), /already exists/);
    const preset = establishInitialLocalPreset(request);
    assert.equal(preset.standardCycleSec, 22);
    assert.equal(preset.piecesPerCycle, 2);
    assert.equal(preset.performanceRate, 0.9);
    assert.equal(preset.performanceInputSource, "manualJudgement");
    assert.ok(preset.calibrationRefs?.includes("manual-p-override-confirmed:not-derived-from-time-window"));
    assert.throws(() => establishInitialLocalPreset({ ...request, performanceOverrideConfirmed: false }), /override confirmation/);
    assert.throws(() => establishInitialLocalPreset({ ...request, performanceRate: 0 }), /at most 100%/);
    assert.throws(() => establishInitialLocalPreset({ ...request, performanceRate: 1.1, performanceOverrideConfirmed: true }), /at most 100%/);
    const standard = establishInitialLocalPreset({
      ...request, performanceRate: 1, performanceOverrideConfirmed: false, parameterId: "local-baseline-default-p",
    });
    assert.equal(standard.performanceRate, 1);
    assert.equal(standard.performanceInputSource, "defaultHundred");
    assert.equal(preset.qualityRate, 1);
    assert.equal(preset.parameterSource, "manual");
    assert.deepEqual(preset.calibrationRefs, ["cycle-check:B:op-b-10:OP10", "manual-p-override-confirmed:not-derived-from-time-window"]);
    assert.deepEqual(source, samples);
    assert.equal(preset.standardCycleSec === 24, false);
  });

  it("changes week pieces only from the effective date and leaves the minute ledger untouched", () => {
    const days = [
      { date: "2026-10-12", workingDay: true, stale: false, bestCaseProductionMinutes: 400, mostLikelyProductionMinutes: 380 },
      { date: "2026-10-15", workingDay: true, stale: false, bestCaseProductionMinutes: 400, mostLikelyProductionMinutes: 380 },
    ];
    const ledger = structuredClone(days);
    const before = buildPeriodCapacity({ operationId: "op-b-10", stationId: "OP10", parameters: [], days });
    const preset = establishInitialLocalPreset(request);
    const after = buildPeriodCapacity({ operationId: "op-b-10", stationId: "OP10", parameters: [preset], days });
    assert.equal(before.calculable, false);
    assert.equal(before.bestCaseGoodPieces, undefined);
    assert.equal(after.days[0].status, "blocked");
    assert.equal(after.days[1].status, "calculated");
    assert.equal(after.days[1].bestCaseMinutes, 400);
    assert.ok(after.days[1].bestCaseGoodRaw > 0);
    assert.deepEqual(days, ledger);
  });
});

describe("correct an existing planned CT from a confirmed cycle check", () => {
  const existing = {
    parameterId: "planned", operationId: "op-a-10", stationId: "OP10", standardCycleSec: 24,
    piecesPerCycle: 1, performanceRate: 0.97, qualityRate: 0.99, parameterSource: "engineeringEstimate",
    approvalStatus: "approved", effectiveFrom: "2026-01-01",
  };
  const samples = fill(emptyCycleSampleDraft(2), [2200, 2300]);
  const request = {
    operationId: "op-a-10", stationId: "OP10", existingParameters: [existing], standardCycleSec: 22.5,
    ctConfirmed: true, samples, evidenceRef: "cycle-check:A:op-a-10:OP10",
    parameterId: "local-correct-ct", effectiveFrom: "2026-10-15",
  };

  it("writes the confirmed CT and keeps P, Q and pieces per cycle", () => {
    const source = structuredClone(samples);
    assert.throws(() => correctPlannedCycleFromCheck({ ...request, ctConfirmed: false }), /confirmation/);
    assert.throws(() => correctPlannedCycleFromCheck({ ...request, existingParameters: [] }), /No planned CT/);
    assert.throws(() => correctPlannedCycleFromCheck({ ...request, standardCycleSec: 24 }), /matches/);
    const corrected = correctPlannedCycleFromCheck(request);
    assert.equal(corrected.standardCycleSec, 22.5);
    assert.equal(corrected.piecesPerCycle, 1);
    assert.equal(corrected.performanceRate, 0.97);
    assert.equal(corrected.qualityRate, 0.99);
    assert.equal(corrected.supersedesParameterId, "planned");
    assert.deepEqual(corrected.calibrationRefs, ["cycle-check:A:op-a-10:OP10"]);
    assert.deepEqual(source, samples);
    assert.equal(existing.standardCycleSec, 24);
  });

  it("recalculates P from an earlier time window and leaves that window unchanged", () => {
    const window = [
      { startMinute: 0, endMinute: 4, okQty: 10, nokQty: 0, piecesPerCycle: 1 },
      { startMinute: 20, endMinute: 26, okQty: 8, nokQty: 2, piecesPerCycle: 2 },
    ];
    const source = structuredClone(window);
    const linked = performanceAgainstCycle(24, window);
    assert.equal(linked.observedCycleSec, 40);
    assert.equal(linked.performanceRate, 0.6);
    assert.equal(linked.fasterThanCorrectedCt, false);
    const corrected = correctPlannedCycleFromCheck({
      ...request, standardCycleSec: 24.5, timeWindowProduction: window,
      windowEvidenceRef: "time-window:A:op-a-10:OP10",
    });
    assert.equal(corrected.standardCycleSec, 24.5);
    assert.equal(corrected.performanceRate, 24.5 / 40);
    assert.equal(corrected.qualityRate, 0.99);
    assert.equal(corrected.piecesPerCycle, 1);
    assert.deepEqual(corrected.calibrationRefs, ["cycle-check:A:op-a-10:OP10", "time-window:A:op-a-10:OP10"]);
    assert.deepEqual(window, source);
    const faster = performanceAgainstCycle(24, [{ startMinute: 0, endMinute: 10, okQty: 40, nokQty: 0, piecesPerCycle: 1 }]);
    assert.equal(faster.fasterThanCorrectedCt, true);
    assert.equal(faster.performanceRate, 1);
    const kept = correctPlannedCycleFromCheck({
      ...request,
      timeWindowProduction: [{ startMinute: 0, endMinute: 10, okQty: 0, nokQty: 0, piecesPerCycle: 1 }],
    });
    assert.equal(kept.performanceRate, 0.97);
  });
});

describe("planned CT diagnosis", () => {
  it("reports a faster sample mean without raising the standard", () => {
    const summary = summarizeCycleSamples(fill(emptyCycleSampleDraft(2), [2000, 2200]));
    const diagnosis = diagnosePlannedCycle(summary, 24);
    assert.equal(diagnosis.hasPlannedCycle, true);
    assert.equal(diagnosis.fasterThanPlanned, true);
    assert.equal(diagnosis.plannedCycleSec, 24);
    const missing = diagnosePlannedCycle(summary, undefined);
    assert.equal(missing.hasPlannedCycle, false);
    assert.equal(missing.plannedCycleSec, undefined);
  });
});
