import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildParameterSuggestions, confirmParameterSuggestion, effectiveParameterSuggestions,
} from "../dist/index.js";

const event = (id, kind, startMinute, endMinute, extra = {}) => ({
  id, kind, startMinute, endMinute, stationId: "OP10", source: "runRate", ...extra,
});
const parameter = {
  parameterId: "param-op10", operationId: "op10", stationId: "OP10",
  standardCycleSec: 24, piecesPerCycle: 1, performanceRate: 1, qualityRate: 1,
  parameterSource: "engineeringEstimate", approvalStatus: "approved",
};

function input(overrides = {}) {
  return {
    productId: "A", operationId: "op10", stationId: "OP10",
    planned: [event("plan-prod", "production", 0, 60), event("plan-break", "break", 60, 90)],
    actual: [event("actual-prod", "production", 0, 50, { okQty: 95, nokQty: 5 }),
      event("actual-break", "break", 50, 90)],
    parameter, cycleSamplesSec: [24, 25], targetSampleCount: 2,
    speed: { readyForCalibration: true, inferredSaLossMinutes: 0, performanceLossMinutes: 2, segments: [] },
    evidence: { readyForCalculation: true, blockers: [], notices: [], explicit: [], inferred: [], explicitMinutes: 0, inferredMinutes: 0 },
    ...overrides,
  };
}

describe("R&R parameter suggestions", () => {
  it("proposes planned activity, CT, P and Q with original evidence references", () => {
    const source = input();
    const suggestions = buildParameterSuggestions(source);
    assert.deepEqual(suggestions.map(item => item.target), [
      "breakMinutes", "standardCycleSec", "performanceRate", "qualityRate",
    ]);
    assert.deepEqual(suggestions[0].evidenceRefs, ["plan-break", "actual-break"]);
    assert.equal(suggestions[0].currentValue, 30);
    assert.equal(suggestions[0].proposedValue, 40);
    assert.equal(suggestions[0].eligibleForConfirmation, false);
    assert.equal(suggestions[1].proposedValue, 24.5);
    assert.equal(suggestions[1].eligibleForConfirmation, true);
    assert.equal(suggestions[2].proposedValue, 0.96);
    assert.equal(suggestions[3].proposedValue, 0.95);
    assert.equal(source.parameter.standardCycleSec, 24);
    assert.equal(source.parameter.qualityRate, 1);
  });

  it("does not suggest verified CT or P before the cycle sample target is reached", () => {
    const suggestions = buildParameterSuggestions(input({ targetSampleCount: 20 }));
    assert.equal(suggestions.some(item => item.target === "standardCycleSec"), false);
    assert.equal(suggestions.some(item => item.target === "performanceRate"), false);
    assert.equal(suggestions.some(item => item.target === "qualityRate"), true);
  });

  it("keeps incomplete evidence as draft and rejects confirmation", () => {
    const suggestion = buildParameterSuggestions(input({
      evidence: { readyForCalculation: false, blockers: [{ code: "unrecorded_time" }], notices: [],
        explicit: [], inferred: [], explicitMinutes: 0, inferredMinutes: 0 },
    })).find(item => item.target === "qualityRate");
    assert.ok(suggestion);
    assert.equal(suggestion.approvalStatus, "draft");
    assert.equal(suggestion.eligibleForConfirmation, false);
    assert.throws(() => confirmParameterSuggestion(suggestion, "2026-09-26", "2026-09-26", "local-validation"), /Evidence/);
  });

  it("records an effective date without changing the draft or baseline", () => {
    const source = input();
    const draft = buildParameterSuggestions(source).find(item => item.target === "qualityRate");
    assert.ok(draft);
    assert.throws(() => confirmParameterSuggestion(draft, "2026-02-30", "2026-09-26", "local-validation"), /Effective date/);
    const future = confirmParameterSuggestion(draft, "2026-10-01", "2026-09-26", "local-validation");
    assert.equal(future.approvalStatus, "approved");
    assert.deepEqual(effectiveParameterSuggestions([draft, future], "2026-09-26"), []);
    assert.deepEqual(effectiveParameterSuggestions([draft, future], "2026-10-01"), [future]);
    assert.equal(draft.approvalStatus, "draft");
    assert.equal(source.parameter.approvalStatus, "approved");
  });

  it("keeps action deltas out of the parameter confirmation flow", () => {
    const action = buildParameterSuggestions(input()).find(item => item.target === "breakMinutes");
    assert.ok(action);
    assert.equal(action.eligibleForConfirmation, false);
    assert.throws(() => confirmParameterSuggestion(action, "2026-09-26", "2026-09-26", "local-validation"), /CT\/P\/Q/);
  });
});
