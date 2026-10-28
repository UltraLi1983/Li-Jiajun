import assert from "node:assert/strict";
import { it } from "node:test";
import { appendRouteReportSnapshot, emptyRouteReportArchive, parseRouteReportArchive, replayRouteReportSnapshot } from "../dist/engine/route-report-archive.js";
import { buildPeriodCapacity } from "../dist/engine/week-month-capacity.js";
import { renderScopedWeekReport } from "../dist/ui/route-week-report.js";

const input = role => ({
  productId: "A", routeId: "route-a", weekStartDate: role === "review" ? "2026-10-12" : "2026-10-19",
  role, demandQty: 1800, stations: [], operationOrder: ["op10"],
  operationUnits: [{ operationId: "op10", unitsPerFinishedProduct: 1 }],
});
const snapshot = {
  id: "snapshot-1", createdAt: "2026-10-26T08:00:00Z", productName: "A-Housing",
  productVersion: "A", routeVersion: "v1", operationLabels: { op10: "OP10 Casting" },
  stationLabels: {}, reviewInput: input("review"), outlookInput: input("outlook"),
  demandEvidence: { reviewRecordIds: ["demand-1"], outlookRecordIds: ["demand-2"],
    reviewSource: "daily", outlookSource: "daily" },
};

it("replays saved calculation inputs after current inputs change, preserving missing capacity", () => {
  const archive = appendRouteReportSnapshot(emptyRouteReportArchive(), snapshot);
  const restored = parseRouteReportArchive(JSON.stringify(archive));
  snapshot.outlookInput.demandQty = 2000;
  assert.equal(restored.snapshots[0].outlookInput.demandQty, 1800);
  const replay = replayRouteReportSnapshot(restored.snapshots[0]);
  assert.equal(replay.outlook.demandQty, 1800);
  assert.equal(replay.outlook.mostLikelyPieces, undefined);
  assert.equal(replay.review.actualPieces, undefined);
  assert.deepEqual(restored.snapshots[0].demandEvidence.outlookRecordIds, ["demand-2"]);
});

it("preserves earlier snapshots and rejects duplicate IDs", () => {
  const first = appendRouteReportSnapshot(emptyRouteReportArchive(), snapshot);
  assert.throws(() => appendRouteReportSnapshot(first, snapshot), /already exists/);
  const second = appendRouteReportSnapshot(first, { ...snapshot, id: "snapshot-2" });
  assert.equal(second.snapshots.length, 2);
  assert.equal(second.snapshots[0].id, "snapshot-1");
});

it("keeps calculated week capacity when live parameters change", () => {
  const captured = structuredClone(snapshot);
  const capacity = buildPeriodCapacity({
    operationId: "op10", stationId: "station-1",
    parameters: [{ parameterId: "param-1", operationId: "op10", stationId: "station-1",
      standardCycleSec: 60, piecesPerCycle: 1, performanceRate: 0.9, qualityRate: 1,
      parameterSource: "manual", approvalStatus: "approved", effectiveFrom: "2026-10-01" }],
    days: [{ date: "2026-10-19", workingDay: true, stale: false,
      bestCaseProductionMinutes: 100, mostLikelyProductionMinutes: 80 }],
  });
  captured.outlookInput.stations = [{ productId: "A", routeId: "route-a", operationId: "op10",
    stationId: "station-1", weekStartDate: "2026-10-19", ledgerPresent: true, capacity,
    allocationMode: "fixedShare", plannedShare: 1, planBasis: "currentParameterRecalc" }];
  const archived = appendRouteReportSnapshot(emptyRouteReportArchive(), captured);
  captured.outlookInput.stations[0].capacity.mostLikelyGoodPieces = 999;
  const oldResult = replayRouteReportSnapshot(parseRouteReportArchive(JSON.stringify(archived)).snapshots[0]).outlook;
  assert.equal(oldResult.mostLikelyPieces, 72);
});

it("keeps the selected R&R revision summary with the report snapshot", () => {
  const captured = { ...structuredClone(snapshot), id: "with-rnr", reportSource: "rnr",
    rnrEvidence: [{ sampleId: "sample-1", revisionId: "rev-2", revision: 2,
      operationId: "op10", stationId: "station-1", equipmentId: "machine-1",
      startMinute: 0, endMinute: 60, source: "manual", timeAccount: "complete",
      eligibility: "rulesPending", reasons: ["qualification_rules_pending"],
      plannedProductionMinutes: 60, actualProductionMinutes: 55, okQty: 10, nokQty: 1 }],
    missingRnrStationIds: ["station-2"] };
  const archive = appendRouteReportSnapshot(emptyRouteReportArchive(), captured);
  captured.rnrEvidence[0].okQty = 999;
  const restored = parseRouteReportArchive(JSON.stringify(archive)).snapshots[0];
  assert.equal(restored.rnrEvidence[0].revisionId, "rev-2");
  assert.equal(restored.rnrEvidence[0].okQty, 10);
  assert.deepEqual(restored.missingRnrStationIds, ["station-2"]);
});

it("preserves report scope and rejects a mismatched operation snapshot", () => {
  const scoped = { ...structuredClone(snapshot), id: "operation-report", reportScope: "operation", operationId: "op10" };
  const restored = appendRouteReportSnapshot(emptyRouteReportArchive(), scoped).snapshots[0];
  assert.equal(restored.reportScope, "operation");
  assert.equal(restored.operationId, "op10");
  assert.throws(() => appendRouteReportSnapshot(emptyRouteReportArchive(), { ...scoped, operationId: "op20" }), /Invalid report snapshot/);
});

it("keeps the planned SA week as immutable report evidence", () => {
  const day = index => ({ date: new Date(Date.UTC(2026, 9, 19 + index)).toISOString().slice(0, 10),
    mode: "manual", stale: false, scheduledMinutes: 480, productionMinutes: 420,
    breakMinutes: 30, setupMinutes: 20, maintenanceMinutes: 10, plannedStopMinutes: 0,
    unscheduledMinutes: 960 });
  const captured = { ...structuredClone(snapshot), id: "sa-week", reportScope: "route",
    plannedSaWeeks: [{ role: "outlook", operationId: "op10", stationId: "s1", perShiftUnplanned: 0,
      shiftCounts: Array(7).fill(1), days: Array.from({ length: 7 }, (_, index) => day(index)) }] };
  const archive = appendRouteReportSnapshot(emptyRouteReportArchive(), captured);
  captured.plannedSaWeeks[0].days[0].productionMinutes = 0;
  assert.equal(archive.snapshots[0].plannedSaWeeks[0].days[0].productionMinutes, 420);
  assert.throws(() => appendRouteReportSnapshot(emptyRouteReportArchive(), {
    ...captured, id: "bad-sa-week", plannedSaWeeks: [{ ...captured.plannedSaWeeks[0], days: [] }],
  }), /Invalid report snapshot/);
});

it("reopens the original frozen SA and selected R&R revision after both source drafts change", () => {
  const event = { id: "plan-1", stationId: "s1", kind: "production", startMinute: 100, endMinute: 160,
    source: "manual", note: "original source" };
  const actual = { ...event, id: "actual-1", okQty: 12, nokQty: 1 };
  const record = { revisionId: "revision-1", sampleId: "sample-1", revision: 1,
    capturedAt: "2026-10-26T08:00:00Z", source: "manual", status: "localDraft", inputSignature: "signature-1",
    scope: { productId: "A", routeId: "route-a", routeVersion: "v1", operationId: "op10", stationId: "s1",
      equipmentId: "machine-1", startMinute: 100, endMinute: 160 },
    evidenceJson: JSON.stringify({ snapshot: { plannedEvents: [event], actualEvents: [actual] } }) };
  const captured = { ...structuredClone(snapshot), id: "full-evidence", reportSource: "rnr", reportScope: "operation",
    operationId: "op10", calculationVersion: "project-validation-week-v1",
    saSources: [{ operationId: "op10", stationId: "s1", status: "current",
      dayConfig: { startMinute: 100, dayCount: 1, shiftMinutes: 480, shiftsPerDay: 1 },
      currentEvents: [structuredClone(event)], frozenWindow: { sourceId: "frozen-1", version: 1, stationId: "s1",
        baseDate: "2026-10-26", startMinute: 100, endMinute: 160, fingerprint: "frozen", events: [structuredClone(event)] } }],
    rnrEvidence: [{ revisionId: "revision-1", sampleId: "sample-1", revision: 1, operationId: "op10", stationId: "s1",
      equipmentId: "machine-1", startMinute: 100, endMinute: 160, source: "manual", timeAccount: "complete",
      eligibility: "rulesPending", reasons: [], okQty: 12, nokQty: 1 }], selectedRnrRevisions: [record] };
  const stored = appendRouteReportSnapshot(emptyRouteReportArchive(), captured);
  captured.saSources[0].frozenWindow.events[0].note = "changed source";
  captured.selectedRnrRevisions[0].evidenceJson = JSON.stringify({ snapshot: { plannedEvents: [], actualEvents: [] } });
  const archived = parseRouteReportArchive(JSON.stringify(stored)).snapshots[0];
  const { review, outlook } = replayRouteReportSnapshot(archived);
  const html = renderScopedWeekReport({ zh: true, scope: "operation", operationId: "op10",
    productName: archived.productName, routeId: "route-a", routeVersion: "v1", generatedAt: "2026-10-26 08:00",
    review, outlook, operationLabels: archived.operationLabels, stationLabels: archived.stationLabels,
    evidence: archived.rnrEvidence, missingStationIds: [], saSources: archived.saSources,
    selectedRnrRevisions: archived.selectedRnrRevisions, calculationVersion: archived.calculationVersion });
  assert.match(html, /original source/);
  assert.match(html, /R&R 原始修订证据/);
  assert.match(html, /12 \/ 1/);
  assert.doesNotMatch(html, /changed source/);
  assert.throws(() => appendRouteReportSnapshot(emptyRouteReportArchive(), {
    ...archived, id: "wrong-revision", selectedRnrRevisions: [{ ...record, revisionId: "wrong" }],
  }), /Invalid report snapshot/);
});
