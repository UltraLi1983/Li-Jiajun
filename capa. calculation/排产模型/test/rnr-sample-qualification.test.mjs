import assert from "node:assert/strict";
import { it } from "node:test";
import { assessRnrSampleTechnical } from "../dist/engine/rnr-sample-qualification.js";

const revision = {
  revisionId: "rev-1", sampleId: "sample-1", revision: 1, capturedAt: "2026-10-25T08:00:00Z",
  scope: { productId: "A", routeId: "route-a", routeVersion: "v1", operationId: "op10",
    stationId: "station-1", equipmentId: "machine-1", shiftLabel: "day", startMinute: 0, endMinute: 60,
    shiftCoverage: [{ startMinute: 0, endMinute: 60, label: "day" }] },
  source: "manual", status: "localDraft", inputSignature: "sig", evidenceJson: "{}",
};
const event = (id, startMinute, endMinute, extra = {}) => ({
  id, productId: "A", stationId: "station-1", source: "runRate", kind: "production",
  startMinute, endMinute, ...extra,
});
const planned = [event("plan", 0, 60)];
const completeActual = [event("actual", 0, 60, { okQty: 10, nokQty: 1 })];

it("separates complete time accounting from unresolved formal qualification", () => {
  const result = assessRnrSampleTechnical({ revision, planned, actual: completeActual });
  assert.equal(result.timeAccount, "complete");
  assert.equal(result.eligibility, "rulesPending");
  assert.deepEqual(result.reasons, ["qualification_rules_pending"]);
});

it("reports unrecorded minutes and missing quantities without labelling the sample qualified", () => {
  const result = assessRnrSampleTechnical({ revision, planned,
    actual: [event("actual", 0, 30, { okQty: 0, nokQty: 0 })] });
  assert.equal(result.timeAccount, "incomplete");
  assert.equal(result.eligibility, "blocked");
  assert.equal(result.unrecordedMinutes, 30);
  assert.equal(result.reasons.includes("production_quantity_missing"), true);
});

it("never promotes a validation fixture even when its time account is complete", () => {
  const result = assessRnrSampleTechnical({ revision: { ...revision, source: "validationFixture" },
    planned, actual: completeActual });
  assert.equal(result.timeAccount, "complete");
  assert.equal(result.eligibility, "blocked");
  assert.equal(result.reasons.includes("validation_fixture"), true);
});

it("does not require shift metadata for whole-window review", () => {
  const noShift = { ...revision, scope: { ...revision.scope, shiftLabel: undefined, shiftCoverage: undefined } };
  const result = assessRnrSampleTechnical({ revision: noShift, planned, actual: completeActual });
  assert.equal(result.timeAccount, "complete");
  assert.equal(result.eligibility, "rulesPending");
});

it("keeps whole-window quantities valid across a SA period boundary", () => {
  const multishift = { ...revision, scope: { ...revision.scope, shiftLabel: "day / night",
    shiftCoverage: [{ startMinute: 0, endMinute: 30, label: "day" }, { startMinute: 30, endMinute: 60, label: "night" }] } };
  const unsplit = assessRnrSampleTechnical({ revision: multishift, planned, actual: completeActual });
  assert.equal(unsplit.eligibility, "rulesPending");
  assert.deepEqual(unsplit.reasons, ["qualification_rules_pending"]);
});
