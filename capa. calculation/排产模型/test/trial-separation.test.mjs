import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import {
  assessLocalTrial,
  assignLocalStation,
  createLocalProcess,
  createLocalProcessType,
  createLocalRouteCopy,
  createLocalStation,
  insertLocalOperation,
  saveLocalStationParameter,
} from "../dist/engine/local-validation-route.js";
import { presentTrialSeparation } from "../dist/engine/preflight-display.js";
import { createRnrValidationFixture } from "../dist/engine/rnr-validation-fixture.js";
import { validateProductRoutingMasterData } from "../dist/engine/routing-master-data-engine.js";
import { buildRouteWindowCapacityView } from "../dist/ui/route-navigation.js";

const ok = result => {
  assert.equal(result.issues, undefined);
  return result;
};

function catalogOf(route, stations) {
  return {
    operations: route.operations.map(operation => ({
      operationId: operation.operationId,
      sequence: operation.sequence,
      name: operation.name,
    })),
    stations,
  };
}

function fourStationDraft() {
  const scenario = structuredClone(sampleScenario);
  const releasedBefore = validateProductRoutingMasterData(scenario, "A-Housing", "route-a-housing-v1");
  const processType = ok(createLocalProcessType(scenario, { name: "压铸", family: "manufacturing" }));
  const process = ok(createLocalProcess(scenario, { name: "压铸", processTypeId: processType.processType.processTypeId }));
  const copy = ok(createLocalRouteCopy(scenario, "route-a-housing-v1"));
  const route = copy.route;
  const dieCast = ok(insertLocalOperation(scenario, {
    routeId: route.routeId, processId: process.process.processId, operationId: "op-cast", sequence: 5, name: "压铸",
  }));
  ok(createLocalStation(scenario, {
    stationId: "OP10", equipmentId: "EQ-CAST-01", name: "压铸01", investmentStatus: "existing",
    sourceReference: "local-test", qualifiedProcessTypeIds: [processType.processType.processTypeId],
    qualifiedProcessId: process.process.processId, qualificationConfirmed: true,
  }));
  const machining = route.operations.find(operation => operation.processType === "machining");
  const assembly = route.operations.find(operation => operation.processType === "assembly");
  const links = [
    [dieCast.operation.operationId, "OP10", "primary", 30],
    [machining.operationId, "OP20A", "primary", 24],
    [machining.operationId, "OP20B", "parallel", 25],
    [assembly.operationId, "OP30", "primary", 15],
  ];
  for (const [operationId, stationId, role, standardCycleSec] of links) {
    ok(assignLocalStation(scenario, { routeId: route.routeId, operationId, stationId, role }));
    ok(saveLocalStationParameter(scenario, {
      routeId: route.routeId, operationId, stationId, standardCycleSec, piecesPerCycle: 1,
      performanceRate: 1, qualityRate: 1, effectiveFrom: "2026-10-22",
    }));
  }
  return { scenario, route, process: process.process, releasedBefore, dieCast: dieCast.operation, machining, assembly };
}

describe("trial layers stay separate from formal release", () => {
  it("calculates the same window for four stations with SA and R&R while formal release stays rejected", () => {
    const { scenario, route, process, releasedBefore, dieCast, machining, assembly } = fourStationDraft();
    const parameters = new Map((scenario.operationStationParameters ?? [])
      .filter(item => item.parameterId.startsWith("local-baseline-"))
      .map(item => [`${item.operationId}::${item.stationId}`, item]));
    const stations = [
      [dieCast.operationId, "OP10"],
      [machining.operationId, "OP20A"],
      [machining.operationId, "OP20B"],
      [assembly.operationId, "OP30"],
    ].map(([operationId, stationId]) => {
      const parameter = parameters.get(`${operationId}::${stationId}`);
      const fixture = createRnrValidationFixture("A-Housing", stationId, parameter.standardCycleSec, parameter.piecesPerCycle);
      return {
        productId: "A-Housing", operationId, stationId, shareCeiling: 1, parameter,
        planned: fixture.planned, actual: fixture.actual,
        speedOptions: { verifiedStandardCycleSec: parameter.standardCycleSec },
        standardWindow: { startMinute: 480, endMinute: 1920 },
      };
    });
    const view = buildRouteWindowCapacityView({
      stations,
      operationIds: route.operations.map(operation => operation.operationId),
      operationUnitsPerProduct: Object.fromEntries(route.operations.map(operation => [operation.operationId, 1])),
    });
    assert.equal(view.stations.length, 4);
    assert.equal(view.stations.every(item => item.blockers.length === 0), true);
    assert.equal(view.stations.every(item => item.bestGoodCapacity > 0 && item.actualGoodOutput > 0), true);
    assert.equal(view.bestGoodCapacity > 0, true);
    assert.equal(view.actualGoodOutput > 0, true);

    const trial = assessLocalTrial(scenario, "A-Housing", route.routeId);
    assert.equal(trial.localFlowOpen, true);
    assert.equal(trial.calculable, true);
    assert.equal(trial.formalReady, false);
    assert.equal(route.status, "draft");
    assert.equal(process.status, "draft");
    assert.equal((scenario.stageBoms ?? []).some(item => item.routeId === route.routeId), false);
    assert.equal((scenario.wipStates ?? []).some(item => item.routeId === route.routeId), false);
    assert.equal(validateProductRoutingMasterData(scenario, "A-Housing", "route-a-housing-v1").formalReady, releasedBefore.formalReady);
    assert.equal(releasedBefore.formalReady, true);

    const separation = presentTrialSeparation({
      locale: "zh",
      routeId: route.routeId,
      localFlowOpen: trial.localFlowOpen,
      formalReady: trial.formalReady,
      formalIssues: trial.formalIssues,
      gaps: trial.gaps,
      catalog: catalogOf(route, stations.map(item => ({ operationId: item.operationId, stationId: item.stationId, name: item.stationId }))),
      processNames: { [process.processId]: process.name },
      stationWindowBlockers: view.stations.map(item => item.blockers),
    });
    assert.equal(separation.sameWindowComplete, true);
    assert.equal(separation.sameWindowLabel, "已完成");
    assert.match(separation.sameWindowNote, /待补条件为「-」/);
    assert.equal(separation.localTrialOpen, true);
    assert.equal(separation.localTrialLabel, "仍可试算");
    assert.equal(separation.formalSatisfied, false);
    assert.equal(separation.formalLabel, "门禁未满足");
    assert.deepEqual([...new Set(separation.formalItems.map(item => item.owner))].sort(), ["draftProcess", "draftRoute", "stageMaterial"]);
    assert.equal(separation.formalItems.some(item => item.owner === "draftRoute" && item.routeId === route.routeId && item.reason.includes("草稿")), true);
    assert.equal(separation.formalItems.some(item => item.owner === "draftProcess" && item.subjectId === process.processId && item.subject.includes("压铸")), true);
    assert.equal(separation.formalItems.filter(item => item.owner === "stageMaterial").length, route.operations.length);
    assert.equal(separation.formalItems.some(item => item.reason.includes("actual_window_incomplete")), false);
    assert.equal(separation.localGaps.some(item => item.code === "stage_reference_missing"), false);

    const withGap = presentTrialSeparation({
      locale: "zh", routeId: route.routeId, localFlowOpen: true, formalReady: false,
      formalIssues: trial.formalIssues, gaps: trial.gaps,
      catalog: catalogOf(route, []),
      processNames: { [process.processId]: process.name },
      stationWindowBlockers: [[], ["actual_window_incomplete"], [], []],
    });
    assert.equal(withGap.sameWindowComplete, false);
    assert.equal(withGap.formalSatisfied, false);
    assert.equal(withGap.formalItems.length, separation.formalItems.length);
  });

  it("keeps formal reasons on the route that owns them after switching routes", () => {
    const { scenario, route, process, dieCast } = fourStationDraft();
    const other = ok(createLocalRouteCopy(scenario, "route-a-housing-v1"));
    const trialA = assessLocalTrial(scenario, "A-Housing", route.routeId);
    const trialB = assessLocalTrial(scenario, "A-Housing", other.route.routeId);
    const names = { [process.processId]: process.name };
    const shownA = presentTrialSeparation({
      locale: "zh", routeId: route.routeId, localFlowOpen: trialA.localFlowOpen, formalReady: trialA.formalReady,
      formalIssues: trialA.formalIssues, gaps: trialA.gaps,
      catalog: catalogOf(route, []), processNames: names, stationWindowBlockers: [[], [], [], []],
    });
    const shownB = presentTrialSeparation({
      locale: "zh", routeId: other.route.routeId, localFlowOpen: trialB.localFlowOpen, formalReady: trialB.formalReady,
      formalIssues: trialB.formalIssues, gaps: trialB.gaps,
      catalog: catalogOf(other.route, []), processNames: names, stationWindowBlockers: [[], []],
    });
    assert.equal(shownA.formalItems.some(item => item.subjectId === process.processId), true);
    assert.equal(shownB.formalItems.some(item => item.subjectId === process.processId || item.operationId === dieCast.operationId), false);
    assert.equal(shownB.formalItems.every(item => item.routeId === other.route.routeId), true);
    assert.equal(shownA.formalItems.every(item => item.routeId === route.routeId), true);
    assert.equal(trialA.formalIssues.some(item => item.subjectId === process.processId), true);
    assert.equal(trialB.formalIssues.some(item => item.subjectId === process.processId), false);

    const crossed = presentTrialSeparation({
      locale: "zh", routeId: route.routeId, localFlowOpen: true, formalReady: false,
      formalIssues: trialA.formalIssues, gaps: trialA.gaps,
      catalog: catalogOf(other.route, []), processNames: names, stationWindowBlockers: [[], [], [], []],
    });
    const borrowed = crossed.formalItems.find(item => item.operationId === dieCast.operationId);
    assert.equal(borrowed.subject.startsWith("当前路线未找到对应对象"), true);
    assert.equal(borrowed.subject.includes(other.route.operations[0].name) && borrowed.subject.startsWith("OP"), false);
    assert.equal(other.route.operations.some(operation => operation.operationId === dieCast.operationId), false);
    assert.equal(route.status, "draft");
    assert.equal(process.status, "draft");
  });
});
