import assert from "node:assert/strict";
import { it } from "node:test";
import { buildRouteReportRnrEvidence } from "../dist/engine/route-report-evidence.js";
import { renderRouteRnrEvidenceAppendix } from "../dist/ui/route-week-report.js";

const revision = {
  revisionId: "r1", sampleId: "sample-1", revision: 1, capturedAt: "2026-10-26T08:00:00Z",
  scope: { productId: "A", routeId: "route-a", routeVersion: "v1", operationId: "op10",
    stationId: "station-1", equipmentId: "machine-1", startMinute: 0, endMinute: 60 },
  source: "manual", status: "localDraft", inputSignature: "sig", evidenceJson: "{}",
};
const event = (id, source, extra = {}) => ({ id, productId: "A", stationId: "station-1",
  source, kind: "production", startMinute: 0, endMinute: 60, ...extra });

it("keeps one R&R observation separate from weekly Actual and records its exact quantities", () => {
  const evidence = buildRouteReportRnrEvidence({ revision,
    planned: [event("plan", "plan")], actual: [event("run", "runRate", { okQty: 10, nokQty: 1 })] });
  assert.equal(evidence.timeAccount, "complete");
  assert.equal(evidence.eligibility, "rulesPending");
  assert.equal(evidence.plannedProductionMinutes, 60);
  assert.equal(evidence.actualProductionMinutes, 60);
  assert.equal(evidence.okQty, 10);
  assert.equal(evidence.nokQty, 1);
  const html = renderRouteRnrEvidenceAppendix({ zh: true, evidence: [evidence], missingStationIds: ["station-2"],
    operationLabels: { op10: "OP10 压铸" }, stationLabels: { "station-1": "压铸01", "station-2": "机加02" } });
  assert.match(html, /不是整周 Actual/);
  assert.match(html, /未选择该工站的 R&R 样本修订/);
});

it("marks a validation fixture as blocked even with complete times", () => {
  const evidence = buildRouteReportRnrEvidence({ revision: { ...revision, source: "validationFixture" },
    planned: [event("plan", "plan")], actual: [event("run", "runRate", { okQty: 10, nokQty: 1 })] });
  assert.equal(evidence.eligibility, "blocked");
  assert.equal(evidence.reasons.includes("validation_fixture"), true);
});
