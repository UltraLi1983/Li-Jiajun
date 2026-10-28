import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import {
  applyLocalValidation,
  assessLocalTrial,
  assignLocalStation,
  clearLocalValidation,
  createLocalProcess,
  createLocalProcessType,
  createLocalRouteCopy,
  createLocalStation,
  createLocalStationGroup,
  extractLocalValidation,
  groupProductRoutes,
  insertLocalOperation,
  insertLocalOperationAt,
  listProcessRouteReferences,
  parseLocalValidationStore,
  removeLocalOperation,
  reorderLocalOperations,
  renameLocalOperation,
  saveLocalStationParameter,
  setLocalStationFlowPolicy,
  setLocalProcessStationGroups,
} from "../dist/engine/local-validation-route.js";
import { localRouteReviewState, submitLocalRouteForReview } from "../dist/engine/route-review.js";
import { validateProductRoutingMasterData } from "../dist/engine/routing-master-data-engine.js";

const clone = () => structuredClone(sampleScenario);
const sourceRoute = () => clone().routes.find(route => route.routeId === "route-a-housing-v1");
const addCleaningType = scenario => createLocalProcessType(scenario, { name: "Cleaning", family: "manufacturing" });
const addWash = scenario => {
  const type = addCleaningType(scenario);
  return createLocalProcess(scenario, {
    name: "Wash",
    processTypeId: type.processType.processTypeId,
    description: "local wash",
    compatibleStationGroupIds: ["grp-machining"],
    createdAt: "2026-10-18T00:00:00.000Z",
  });
};

describe("local validation process and route", () => {
  it("submits a draft for local review without releasing it, and invalidates the request after edits", () => {
    const scenario = clone();
    const draft = createLocalRouteCopy(scenario, "route-a-housing-v1").route;
    assert.equal(submitLocalRouteForReview(scenario, "route-a-housing-v1", "2026-10-24T00:00:00.000Z").issues[0].code, "not_local_draft");
    assert.equal(submitLocalRouteForReview(scenario, draft.routeId, "2026-10-24T00:00:00.000Z").issues[0].code, "station_missing");
    for (const operation of draft.operations) {
      const stationId = operation.sequence === 10 ? "OP20A" : "OP30";
      assignLocalStation(scenario, { routeId: draft.routeId, operationId: operation.operationId, stationId, role: "primary" });
    }
    const submitted = submitLocalRouteForReview(scenario, draft.routeId, "2026-10-24T00:00:00.000Z");
    assert.equal(submitted.route.status, "draft");
    assert.equal(localRouteReviewState(scenario, draft.routeId), "pending");
    assert.equal(validateProductRoutingMasterData(scenario, draft.productId, draft.routeId).formalReady, false);
    const restored = applyLocalValidation(clone(), extractLocalValidation(scenario));
    assert.equal(localRouteReviewState(restored, draft.routeId), "pending");
    renameLocalOperation(restored, { routeId: draft.routeId, operationId: draft.operations[0].operationId, name: "Reviewed name changed" });
    assert.equal(localRouteReviewState(restored, draft.routeId), "stale");
    submitLocalRouteForReview(restored, draft.routeId, "2026-10-24T01:00:00.000Z");
    assert.equal(localRouteReviewState(restored, draft.routeId), "pending");
    assert.equal(restored.routes.find(item => item.routeId === draft.routeId).reviewRequest.submittedAt, "2026-10-24T01:00:00.000Z");
    restored.operationStationAssignments.find(item => item.routeId === draft.routeId).plannedShare = 0.5;
    assert.equal(localRouteReviewState(restored, draft.routeId), "stale");
    submitLocalRouteForReview(restored, draft.routeId, "2026-10-24T02:00:00.000Z");
    restored.processMasters.find(item => item.processId === draft.operations[0].processId).name = "Changed process name";
    assert.equal(localRouteReviewState(restored, draft.routeId), "stale");
  });

  it("stores station transfer pairs on a draft route and can clear stale pairs after reordering", () => {
    const scenario = clone();
    const draft = createLocalRouteCopy(scenario, "route-a-housing-v1").route;
    const [from, to] = [...draft.operations].sort((a, b) => a.sequence - b.sequence);
    for (const stationId of ["OP20A", "OP20B"]) {
      assert.equal(assignLocalStation(scenario, { routeId: draft.routeId, operationId: from.operationId,
        stationId, role: "parallel" }).assignment.planningAllowed, true);
    }
    assert.equal(assignLocalStation(scenario, { routeId: draft.routeId, operationId: to.operationId,
      stationId: "OP30", role: "primary" }).assignment.planningAllowed, true);
    const link = { fromStationId: "OP20A", toStationId: "OP30" };
    assert.equal(setLocalStationFlowPolicy(scenario, { routeId: "route-a-housing-v1", fromOperationId: from.operationId,
      toOperationId: to.operationId, allowedPairs: [link] }).issues[0].code, "not_local_draft");
    assert.equal(setLocalStationFlowPolicy(scenario, { routeId: draft.routeId, fromOperationId: from.operationId,
      toOperationId: to.operationId, allowedPairs: [{ fromStationId: "OP22", toStationId: "OP30" }] }).issues[0].code, "invalid_station_flow");
    assert.equal(setLocalStationFlowPolicy(scenario, { routeId: draft.routeId, fromOperationId: from.operationId,
      toOperationId: to.operationId, allowedPairs: [link] }).route.stationFlowPolicies.length, 1);
    const saved = extractLocalValidation(scenario);
    const restored = applyLocalValidation(clone(), saved);
    const restoredRoute = restored.routes.find(item => item.routeId === draft.routeId);
    assert.deepEqual(restoredRoute.stationFlowPolicies[0].allowedPairs, [link]);
    reorderLocalOperations(restored, draft.routeId, [to.operationId, from.operationId]);
    assert.equal(setLocalStationFlowPolicy(restored, { routeId: draft.routeId, fromOperationId: from.operationId,
      toOperationId: to.operationId, allowedPairs: [link] }).issues[0].code, "invalid_station_flow");
    assert.deepEqual(setLocalStationFlowPolicy(restored, { routeId: draft.routeId, fromOperationId: from.operationId,
      toOperationId: to.operationId }).route.stationFlowPolicies, []);
  });
  it("opens the newest local copy first without hiding earlier copies or reusing a gap", () => {
    const scenario = clone();
    const first = createLocalRouteCopy(scenario, "route-a-housing-v1").route;
    const second = createLocalRouteCopy(scenario, "route-a-housing-v1").route;
    const third = createLocalRouteCopy(scenario, "route-a-housing-v1").route;
    scenario.routes = scenario.routes.filter(route => route.routeId !== second.routeId);
    const grouped = groupProductRoutes(scenario, "A-Housing");
    assert.equal(grouped.latestDraft.routeId, third.routeId);
    assert.deepEqual(grouped.historicalDrafts.map(route => route.routeId), [first.routeId]);
    assert.equal(grouped.released.some(route => route.routeId === "route-a-housing-v1"), true);
    assert.equal(createLocalRouteCopy(scenario, "route-a-housing-v1").route.routeId, "local-route-a-housing-v1-4");
  });

  it("renames only a local route operation and keeps its stable ID and sequence", () => {
    const scenario = clone();
    const draft = createLocalRouteCopy(scenario, "route-a-housing-v1").route;
    const operation = draft.operations[0];
    const released = sourceRoute().operations[0];
    assert.equal(renameLocalOperation(scenario, { routeId: "route-a-housing-v1", operationId: released.operationId, name: "Altered" }).issues[0].code, "not_local_draft");
    assert.equal(renameLocalOperation(scenario, { routeId: draft.routeId, operationId: operation.operationId, name: " " }).issues[0].code, "invalid_name");
    assert.equal(renameLocalOperation(scenario, { routeId: draft.routeId, operationId: operation.operationId, name: "x".repeat(81) }).issues[0].code, "invalid_name");
    const renamed = renameLocalOperation(scenario, { routeId: draft.routeId, operationId: operation.operationId, name: " 外尺寸粗车削 " }).operation;
    assert.equal(renamed.name, "外尺寸粗车削");
    assert.equal(renamed.operationId, operation.operationId);
    assert.equal(renamed.sequence, operation.sequence);
    assert.equal(extractLocalValidation(scenario).routes.find(route => route.routeId === draft.routeId).operations[0].name, "外尺寸粗车削");
    assert.equal(scenario.routes.find(route => route.routeId === "route-a-housing-v1").operations[0].name, released.name);
  });
  it("registers a qualified existing station before routing and retains it independently of drafts", () => {
    const scenario = clone();
    const type = createLocalProcessType(scenario, { name: "Die casting", family: "manufacturing" }).processType;
    const process = createLocalProcess(scenario, { name: "Die casting", processTypeId: type.processTypeId }).process;
    const input = { stationId: "CAST-01", equipmentId: "EQ-CAST-01", name: "Casting machine 01",
      investmentStatus: "existing", sourceReference: "equipment register 2026", qualifiedProcessTypeIds: [type.processTypeId] };
    assert.equal(createLocalStation(scenario, input).issues[0].field, "qualificationConfirmed");
    const created = createLocalStation(scenario, { ...input, qualificationConfirmed: true });
    assert.equal(created.station.investmentStatus, "existing");
    assert.equal(created.station.equipmentId, "EQ-CAST-01");
    assert.equal(created.station.sourceReference, "equipment register 2026");
    assert.equal(created.station.identityVerificationStatus, "localDeclaration");
    assert.equal(created.station.equipmentUid, undefined);
    assert.equal(created.station.stationGroupId, undefined);
    assert.deepEqual(created.station.qualifiedProcessTypeIds, [type.processTypeId]);
    assert.equal(created.station.qualifiedProcessIds, undefined);
    assert.equal(createLocalStation(scenario, { ...input, qualificationConfirmed: true }).issues[0].code, "duplicate_station");
    const saved = extractLocalValidation(scenario);
    assert.equal(saved.stations.some(station => station.stationId === "CAST-01"), true);
    const restored = applyLocalValidation(clone(), saved);
    assert.equal(restored.stations.some(station => station.stationId === "CAST-01"), true);
    const route = createLocalRouteCopy(restored, "route-a-housing-v1").route;
    const inserted = insertLocalOperationAt(restored, { routeId: route.routeId, processId: process.processId, index: 0 }).operation;
    assert.equal(assignLocalStation(restored, { routeId: route.routeId, operationId: inserted.operationId, stationId: "CAST-01", role: "primary" }).assignment.planningAllowed, true);
    clearLocalValidation(restored);
    assert.equal(restored.stations.some(station => station.stationId === "CAST-01"), true);
  });
  it("keeps a planned resource separate from physical equipment identity", () => {
    const scenario = clone();
    const type = createLocalProcessType(scenario, { name: "Die casting", family: "manufacturing" }).processType;
    const process = createLocalProcess(scenario, { name: "Die casting", processTypeId: type.processTypeId }).process;
    const input = { stationId: "PLAN-CAST-01", name: "Future casting machine",
      investmentStatus: "plannedInvestment", sourceReference: "investment scenario", qualifiedProcessTypeIds: [type.processTypeId] };
    assert.equal(createLocalStation(scenario, { ...input, equipmentId: "EQ-UNBOUGHT" }).issues[0].field, "equipmentId");
    const created = createLocalStation(scenario, input).station;
    assert.equal(created.equipmentId, undefined);
    assert.equal(created.identityVerificationStatus, "localDeclaration");
    const route = createLocalRouteCopy(scenario, "route-a-housing-v1").route;
    const operation = insertLocalOperationAt(scenario, { routeId: route.routeId, processId: process.processId, index: 0 }).operation;
    assert.equal(assignLocalStation(scenario, { routeId: route.routeId, operationId: operation.operationId,
      stationId: created.stationId, role: "primary" }).assignment.planningAllowed, false);
  });
  it("keeps the existing machining and assembly groups bound to their released processes", () => {
    const scenario = clone();
    const machining = scenario.processMasters.find(item => item.processId === "process-machining");
    const assembly = scenario.processMasters.find(item => item.processId === "process-assembly");
    assert.deepEqual(machining.compatibleStationGroupIds, ["grp-machining"]);
    assert.deepEqual(assembly.compatibleStationGroupIds, ["grp-assembly"]);
    assert.equal(setLocalProcessStationGroups(scenario, machining.processId, ["grp-assembly"]).issues[0].code, "not_local_draft");
    assert.deepEqual(machining.compatibleStationGroupIds, ["grp-machining"]);
  });
  it("uses process-type candidacy without a mandatory group and keeps legacy groups readable", () => {
    const scenario = clone();
    const type = createLocalProcessType(scenario, { name: "Die casting", family: "manufacturing" });
    const process = createLocalProcess(scenario, { name: "Die casting", processTypeId: type.processType.processTypeId });
    const copy = createLocalRouteCopy(scenario, "route-a-housing-v1");
    const inserted = insertLocalOperationAt(scenario, { routeId: copy.route.routeId, processId: process.process.processId, index: 1 });
    const input = { routeId: copy.route.routeId, operationId: inserted.operation.operationId, stationId: "OP20A", role: "primary" };
    assert.equal(assignLocalStation(scenario, input).issues[0].code, "station_incompatible");
    assert.equal(createLocalStation(scenario, { stationId: "CAST-01", name: "Casting 01" }).issues[0].field, "qualifiedProcessTypeIds");
    assert.equal(createLocalStation(scenario, { stationId: "CAST-01", name: "Casting 01", qualifiedProcessTypeIds: ["missing"] }).issues[0].code, "missing_process_type");
    const casting = createLocalStation(scenario, { stationId: "CAST-01", name: "Casting 01", investmentStatus: "plannedInvestment",
      qualifiedProcessTypeIds: [type.processType.processTypeId, "machining"] });
    assert.equal(casting.station.stationGroupId, undefined);
    assert.deepEqual(casting.station.qualifiedProcessTypeIds, [type.processType.processTypeId, "machining"]);
    assert.equal(assignLocalStation(scenario, { ...input, stationId: "CAST-01" }).assignment.stationId, "CAST-01");
    assert.equal(assignLocalStation(scenario, { routeId: copy.route.routeId, operationId: copy.route.operations.find(item => item.processType === "machining").operationId,
      stationId: "CAST-01", role: "parallel" }).assignment.planningAllowed, false);
    const restored = clone();
    applyLocalValidation(restored, extractLocalValidation(scenario));
    assert.deepEqual(restored.stations.find(item => item.stationId === "CAST-01").qualifiedProcessTypeIds, [type.processType.processTypeId, "machining"]);
    assert.deepEqual(restored.stationGroups.find(item => item.stationGroupId === "grp-machining").stationIds, ["OP20A", "OP20B", "OP22"]);
  });
  it("files a draft process without a route and keeps generated identity separate from business codes", () => {
    const scenario = clone();
    const routeCount = scenario.routes.length;
    const operationCount = scenario.routes.reduce((sum, route) => sum + route.operations.length, 0);
    const created = addWash(scenario);
    assert.equal(created.process.status, "draft");
    assert.equal(created.process.sourceSystem, "local-validation");
    assert.equal(created.process.processId, "local-process-1");
    assert.equal(created.process.version, "local-1");
    assert.equal(created.process.createdAt, "2026-10-18T00:00:00.000Z");
    assert.equal(created.process.externalProcessId, undefined);
    assert.equal(created.process.businessCode, undefined);
    assert.equal(scenario.processTypes.find(item => item.processTypeId === "qualityGate").family, "quality");
    assert.equal(scenario.processTypes.find(item => item.processTypeId === "local-type-1").family, "manufacturing");
    assert.equal(createLocalProcessType(scenario, { name: "机加工", family: "manufacturing" }).issues[0].code, "duplicate_process_type");
    assert.equal(createLocalProcessType(scenario, { name: " cleaning ", family: "manufacturing" }).issues[0].code, "duplicate_process_type");
    assert.equal(scenario.routes.length, routeCount);
    assert.equal(scenario.routes.reduce((sum, route) => sum + route.operations.length, 0), operationCount);
    assert.equal(createLocalProcess(scenario, { name: " ", processTypeId: "local-type-1" }).issues[0].field, "name");
    assert.equal(createLocalProcess(scenario, { name: "Again", processTypeId: "missing-type" }).issues[0].code, "missing_process_type");
    const again = createLocalProcess(scenario, { name: "Wash again", processTypeId: "local-type-1", businessCode: "W-1" });
    assert.equal(again.process.processId, "local-process-2");
    assert.equal(createLocalProcess(scenario, { name: "Third", processTypeId: "local-type-1", businessCode: "w-1" }).issues[0].code, "duplicate_business_code");
    assert.equal(sourceRoute().operations.map(operation => operation.operationId).join(), "op-a-10,op-a-20");
  });

  it("warns on a similar name without merging or rewriting an existing process id", () => {
    const scenario = clone();
    addCleaningType(scenario);
    const first = createLocalProcess(scenario, { name: "超声清洗", processTypeId: "local-type-1" });
    const second = createLocalProcess(scenario, { name: "超音波清洗", processTypeId: "local-type-1" });
    assert.equal(second.warnings[0].code, "similar_name");
    assert.notEqual(first.process.processId, second.process.processId);
    assert.equal(scenario.processMasters.filter(process => process.processId === first.process.processId || process.processId === second.process.processId).map(process => process.name).join(), "超声清洗,超音波清洗");
    assert.equal(scenario.processMasters.find(process => process.processId === first.process.processId).name, "超声清洗");
  });

  it("copies a route without rewriting the source, then inserts an operation between the existing ones", () => {
    const scenario = clone();
    const wash = addWash(scenario);
    const before = JSON.stringify(scenario.routes.find(route => route.routeId === "route-a-housing-v1"));
    const copy = createLocalRouteCopy(scenario, "route-a-housing-v1");
    assert.equal(JSON.stringify(scenario.routes.find(route => route.routeId === "route-a-housing-v1")), before);
    assert.equal(copy.route.status, "draft");
    assert.notEqual(copy.route.routeId, "route-a-housing-v1");
    assert.deepEqual(copy.route.operations.map(operation => operation.sequence), [10, 20]);
    const inserted = insertLocalOperation(scenario, {
      routeId: copy.route.routeId, processId: wash.process.processId, operationId: "op-a-wash", sequence: 15, name: "Wash",
    });
    assert.equal(inserted.issues, undefined);
    const sequences = copy.route.operations.map(operation => [operation.sequence, operation.operationId, operation.predecessorOperationIds, operation.successorOperationIds]);
    assert.equal(sequences[1][0], 15);
    assert.deepEqual(sequences[0][3], [sequences[1][1]]);
    assert.deepEqual(sequences[1][2], [sequences[0][1]]);
    assert.deepEqual(sequences[1][3], [sequences[2][1]]);
    assert.equal(inserted.operation.standardCycleSec, undefined);
    assert.equal(inserted.operation.stationId, undefined);
    assert.equal(insertLocalOperation(scenario, {
      routeId: copy.route.routeId, processId: "missing", operationId: "op-missing", sequence: 16, name: "Missing",
    }).issues[0].code, "missing_process");
    assert.equal(insertLocalOperation(scenario, {
      routeId: copy.route.routeId, processId: wash.process.processId, operationId: "op-a-wash", sequence: 16, name: "Again",
    }).issues[0].code, "duplicate_operation");
    assert.equal(insertLocalOperation(scenario, {
      routeId: copy.route.routeId, processId: wash.process.processId, operationId: "op-a-wash-2", sequence: 15, name: "Clash",
    }).issues[0].code, "duplicate_sequence");
    const reused = insertLocalOperation(scenario, {
      routeId: copy.route.routeId, processId: "process-gp12", operationId: "op-a-gp12", sequence: 25, name: "GP12",
    });
    assert.equal(reused.operation.processId, "process-gp12");
    assert.equal(JSON.stringify(scenario.routes.find(route => route.routeId === "route-a-housing-v1")), before);
    assert.equal(scenario.routes.find(route => route.productId === "B-Housing").operations[0].operationId, "op-b-10");
  });

  it("inserts and reorders a visual draft route without changing operation identity or the released source", () => {
    const scenario = clone();
    const wash = addWash(scenario);
    const sourceBefore = JSON.stringify(scenario.routes.find(route => route.routeId === "route-a-housing-v1"));
    const copy = createLocalRouteCopy(scenario, "route-a-housing-v1");
    const inserted = insertLocalOperationAt(scenario, { routeId: copy.route.routeId, processId: wash.process.processId, index: 1 });
    assert.equal(inserted.issues, undefined);
    assert.deepEqual(copy.route.operations.map(item => item.sequence), [10, 20, 30]);
    assert.equal(copy.route.operations[1].operationId, inserted.operation.operationId);
    const first = copy.route.operations[0].operationId;
    const last = copy.route.operations[2].operationId;
    const reordered = reorderLocalOperations(scenario, copy.route.routeId, [last, first, inserted.operation.operationId]);
    assert.equal(reordered.issues, undefined);
    assert.deepEqual(copy.route.operations.map(item => item.operationId), [last, first, inserted.operation.operationId]);
    assert.deepEqual(copy.route.operations[0].successorOperationIds, [first]);
    assert.deepEqual(copy.route.operations[1].predecessorOperationIds, [last]);
    assert.deepEqual(copy.route.operations[2].predecessorOperationIds, [first]);
    const beforeInvalid = JSON.stringify(copy.route.operations);
    assert.equal(reorderLocalOperations(scenario, copy.route.routeId, [first, first, last]).issues[0].code, "invalid_order");
    assert.equal(JSON.stringify(copy.route.operations), beforeInvalid);
    assert.equal(reorderLocalOperations(scenario, "route-a-housing-v1", ["op-a-20", "op-a-10"]).issues[0].code, "not_local_draft");
    assert.equal(JSON.stringify(scenario.routes.find(route => route.routeId === "route-a-housing-v1")), sourceBefore);
  });

  it("removes a local operation together with its assignment and does not invent a stage BOM", () => {
    const scenario = clone();
    const copy = createLocalRouteCopy(scenario, "route-a-housing-v1");
    insertLocalOperation(scenario, { routeId: copy.route.routeId, processId: "process-machining", operationId: "op-a-extra", sequence: 15, name: "Extra" });
    assignLocalStation(scenario, { routeId: copy.route.routeId, operationId: "op-a-extra", stationId: "OP20A", role: "primary" });
    removeLocalOperation(scenario, copy.route.routeId, "op-a-extra");
    assert.equal(copy.route.operations.some(operation => operation.operationId === "op-a-extra"), false);
    assert.equal((scenario.operationStationAssignments ?? []).some(item => item.operationId === "op-a-extra"), false);
    assert.equal((scenario.stageBoms ?? []).some(item => item.routeId === copy.route.routeId), false);
    assert.deepEqual(copy.route.operations[0].successorOperationIds, [copy.route.operations[1].operationId]);
  });

  it("keeps backup and planned-investment stations out of planning and requires an explicit parameter", () => {
    const scenario = clone();
    const copy = createLocalRouteCopy(scenario, "route-a-housing-v1");
    const routeId = copy.route.routeId;
    const operationId = copy.route.operations[0].operationId;
    const primary = assignLocalStation(scenario, { routeId, operationId, stationId: "OP20A", role: "primary" });
    assert.equal(primary.assignment.planningAllowed, true);
    assert.equal(primary.assignment.allocationMode, "forecastCalculated");
    assert.equal(primary.assignment.plannedShare, undefined);
    const backup = assignLocalStation(scenario, { routeId, operationId, stationId: "OP20B", role: "backup", backupCondition: "after approval" });
    assert.equal(backup.assignment.planningAllowed, false);
    assert.equal(backup.assignment.customerApprovalRequired, true);
    const station = createLocalStation(scenario, { stationId: "OP10-FUTURE", name: "Future machining", qualifiedProcessTypeIds: ["machining"] });
    assert.equal(station.station.investmentStatus, "plannedInvestment");
    const future = assignLocalStation(scenario, { routeId, operationId, stationId: "OP10-FUTURE", role: "primary" });
    assert.equal(future.assignment.planningAllowed, false);
    const saved = saveLocalStationParameter(scenario, {
      routeId, operationId, stationId: "OP20A", standardCycleSec: 30, piecesPerCycle: 1, performanceRate: 0.9, qualityRate: 0.95, effectiveFrom: "2026-10-18",
    });
    assert.equal(saved.parameter.standardCycleSec, 30);
    assert.equal(saved.parameter.performanceRate, 0.9);
    assert.equal(saveLocalStationParameter(scenario, {
      routeId, operationId, stationId: "OP20B", standardCycleSec: 30, piecesPerCycle: 1, performanceRate: 1, qualityRate: 1, effectiveFrom: "2026-10-18",
    }).issues[0].code, "backup_not_plannable");
  });

  it("opens a local flow while formal validation still rejects the draft route and process", () => {
    const scenario = clone();
    const wash = addWash(scenario);
    const copy = createLocalRouteCopy(scenario, "route-a-housing-v1");
    insertLocalOperation(scenario, { routeId: copy.route.routeId, processId: wash.process.processId, operationId: "op-a-wash", sequence: 15, name: "Wash" });
    const beforeParameter = assessLocalTrial(scenario, "A-Housing", copy.route.routeId);
    assert.equal(beforeParameter.localFlowOpen, true);
    assert.equal(beforeParameter.formalReady, false);
    assert.equal(beforeParameter.formalIssues.some(issue => issue.code === "route_not_released"), true);
    assert.equal(beforeParameter.formalIssues.some(issue => issue.code === "process_master_not_released"), true);
    assert.equal(beforeParameter.gaps.some(issue => issue.code === "stage_reference_missing"), true);
    assert.equal(validateProductRoutingMasterData(scenario, "A-Housing", "route-a-housing-v1").formalReady, true);
    assignLocalStation(scenario, { routeId: copy.route.routeId, operationId: "op-a-wash", stationId: "OP20A", role: "primary" });
    saveLocalStationParameter(scenario, {
      routeId: copy.route.routeId, operationId: "op-a-wash", stationId: "OP20A",
      standardCycleSec: 22, piecesPerCycle: 1, performanceRate: 1, qualityRate: 1, effectiveFrom: "2026-10-18",
    });
    const after = assessLocalTrial(scenario, "A-Housing", copy.route.routeId);
    assert.equal(after.calculable, true);
    assert.equal(after.formalReady, false);
  });

  it("restores version 1 storage and clears routes without deleting the process library", () => {
    const scenario = clone();
    const sampleRoute = JSON.stringify(scenario.routes.find(route => route.routeId === "route-a-housing-v1"));
    const wash = addWash(scenario);
    const copy = createLocalRouteCopy(scenario, "route-a-housing-v1");
    const second = createLocalRouteCopy(scenario, "route-a-housing-v1");
    insertLocalOperation(scenario, { routeId: copy.route.routeId, processId: wash.process.processId, operationId: "op-a-wash", sequence: 15, name: "Wash" });
    insertLocalOperation(scenario, { routeId: second.route.routeId, processId: wash.process.processId, operationId: "op-a-wash-b", sequence: 15, name: "Wash" });
    assert.equal(listProcessRouteReferences(scenario, wash.process.processId).length, 2);
    createLocalStation(scenario, { stationId: "OP-NEW", name: "New station", stationGroupId: "grp-machining" });
    assignLocalStation(scenario, { routeId: copy.route.routeId, operationId: copy.route.operations[0].operationId, stationId: "OP-NEW", role: "backup" });
    const stored = extractLocalValidation(scenario);
    assert.equal(stored.schemaVersion, 2);
    const fresh = clone();
    applyLocalValidation(fresh, stored);
    assert.equal(fresh.routes.some(route => route.routeId === copy.route.routeId), true);
    assert.equal(fresh.processMasters.some(process => process.processId === wash.process.processId), true);
    const legacy = parseLocalValidationStore({
      schemaVersion: 1,
      processes: [{ processId: "process-wash", name: "Wash", processType: "cleaning", sourceSystem: "local-validation", status: "draft", version: "local-1" }],
      routes: [],
      assignments: [],
      stations: [],
      parameters: [],
    });
    assert.equal(legacy.migratedFrom, 1);
    applyLocalValidation(fresh, legacy.store);
    assert.equal(fresh.processMasters.find(process => process.processId === "process-wash").processType, "cleaning");
    const beforeReject = JSON.stringify(fresh);
    assert.equal(parseLocalValidationStore({ schemaVersion: 9, processes: [], routes: [] }).ok, false);
    applyLocalValidation(fresh, { schemaVersion: 9, processes: [], processTypes: [], routes: [], assignments: [], stations: [], parameters: [] });
    assert.equal(JSON.stringify(fresh), beforeReject);
    clearLocalValidation(fresh);
    assert.equal(fresh.processMasters.some(process => process.processId === wash.process.processId), true);
    assert.equal(fresh.processMasters.some(process => process.processId === "process-wash"), true);
    assert.equal(fresh.processTypes.some(item => item.processTypeId === "local-type-1"), true);
    assert.equal(fresh.routes.some(route => String(route.routeId).startsWith("local-")), false);
    assert.equal(JSON.stringify(fresh.routes.find(route => route.routeId === "route-a-housing-v1")), sampleRoute);
    assert.equal(JSON.stringify(clearLocalValidation(scenario).routes.find(route => route.routeId === "route-a-housing-v1")), sampleRoute);
    assert.equal(scenario.processMasters.some(process => process.processId === wash.process.processId), true);
  });
});
