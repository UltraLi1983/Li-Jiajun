import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import { fillGapsAsUnscheduled, findTimelineGaps, validateTimelineEvents } from "../dist/engine/timeline-engine.js";
import { generateSetupEvents } from "../dist/engine/setup-matrix.js";
import { calculateProductionSegment } from "../dist/engine/run-rate-segment.js";
import { calculatePlannedSA, calculateRealSA } from "../dist/engine/calendar-sa.js";
import { calculateCapacityScenario } from "../dist/engine/capacity-engine.js";
import { normalizeWeeklyDemand, resolveWeeklyDemand } from "../dist/engine/demand-engine.js";
import { canAssignmentBePlanned, releasePlanningGate } from "../dist/engine/approval-gate-engine.js";
import { checkBatchHUCompliance } from "../dist/engine/batch-hu-engine.js";
import { calculateActualCapacityShare, calculateRequiredCapacityShare, evaluateCapacityShare, findCapacityShareProfile } from "../dist/engine/capacity-share-engine.js";
import { expandPlannedActivityRules } from "../dist/engine/planned-activity-engine.js";
import { checkProductReadiness } from "../dist/engine/readiness-engine.js";
import { runCapacityAnalysisPreflight } from "../dist/engine/analysis-summary-engine.js";
import { buildProductRoutingConfiguration } from "../dist/engine/routing-configuration-engine.js";
import { validateProductRoutingMasterData } from "../dist/engine/routing-master-data-engine.js";

function cloneScenario(overrides = {}) {
  return structuredClone({ ...sampleScenario, ...overrides });
}

describe("routing master-data boundary smoke test", () => {
  it("keeps released routing and stage WIP context explicit", () => {
    const route = sampleScenario.routes.find(item => item.routeId === "route-a-housing-v1");
    assert.equal(route?.status, "released");
    assert.equal(route?.operations.map(item => item.sequence).join(","), "10,20");
    assert.equal(sampleScenario.processMasters?.some(item => item.processId === "process-machining"), true);
    assert.equal(sampleScenario.stageBoms?.find(item => item.stageBomId === "bom-a-op20-out")?.operationId, "op-a-20");
    assert.equal(sampleScenario.wipStates?.find(item => item.wipStateId === "wip-a-op10")?.operationId, "op-a-10");
  });
});

describe("routing master-data validator", () => {
  it("accepts a released route and links input WIP to the predecessor output", () => {
    const result = validateProductRoutingMasterData(sampleScenario, "A-Housing", "route-a-housing-v1", { asOfDate: "2026-09-25" });

    assert.equal(result.formalReady, true);
    assert.equal(result.issues.length, 0);
  });

  it("blocks a draft route from formal selection", () => {
    const scenario = cloneScenario({
      routes: sampleScenario.routes.map(route => route.productId === "A-Housing" ? { ...route, status: "draft" } : route),
    });
    const result = validateProductRoutingMasterData(scenario, "A-Housing");

    assert.equal(result.formalReady, false);
    assert.equal(result.issues.some(issue => issue.code === "route_not_released"), true);
  });

  it("blocks a route when a stage BOM points to the wrong operation", () => {
    const scenario = cloneScenario({
      stageBoms: sampleScenario.stageBoms?.map(item => item.stageBomId === "bom-a-op20-out" ? { ...item, operationId: "op-a-10" } : item),
    });
    const result = validateProductRoutingMasterData(scenario, "A-Housing");

    assert.equal(result.formalReady, false);
    assert.equal(result.issues.some(issue => issue.code === "stage_bom_mismatch"), true);
  });
});

describe("product readiness smoke test", () => {
  it("marks Product A ready while keeping pending backup blocked", () => {
    const result = checkProductReadiness(sampleScenario, "A-Housing");

    assert.equal(result.ready, true);
    assert.equal(result.operationsChecked, 2);
    assert.deepEqual(
      result.planningAllowedAssignments.map(item => item.assignmentId),
      ["assign-a-op10-op10", "assign-a-op10-op10b", "assign-a-op20-op20"],
    );
    assert.deepEqual(
      result.blockedBackupAssignments.map(item => item.assignmentId),
      ["assign-a-op10-op10c"],
    );
    assert.equal(result.issues.some(issue => issue.code === "backup_blocked"), true);
    assert.equal(result.issues.some(issue => issue.severity === "error"), false);
  });

  it("blocks capacity analysis when a product route is missing", () => {
    const scenario = cloneScenario({ routes: sampleScenario.routes.filter(route => route.productId !== "A-Housing") });
    const result = checkProductReadiness(scenario, "A-Housing");

    assert.equal(result.ready, false);
    assert.equal(result.issues.some(issue => issue.code === "route_missing"), true);
  });

  it("blocks capacity analysis when an operation has no planning-allowed station", () => {
    const scenario = cloneScenario({
      operationStationAssignments: sampleScenario.operationStationAssignments.map(assignment => (
        assignment.operationId === "op-a-20" ? { ...assignment, planningAllowed: false } : assignment
      )),
    });
    const result = checkProductReadiness(scenario, "A-Housing");

    assert.equal(result.ready, false);
    assert.equal(result.issues.some(issue => issue.code === "planning_allowed_assignment_missing"), true);
  });

  it("blocks capacity analysis when an allowed assignment has no parameter", () => {
    const scenario = cloneScenario({
      operationStationParameters: sampleScenario.operationStationParameters.filter(
        parameter => !(parameter.operationId === "op-a-20" && parameter.stationId === "OP20"),
      ),
    });
    const result = checkProductReadiness(scenario, "A-Housing");

    assert.equal(result.ready, false);
    assert.equal(result.issues.some(issue => issue.code === "parameter_missing"), true);
  });

  it("keeps the existing capacity engine compatible with enriched sample data", () => {
    const results = calculateCapacityScenario(sampleScenario);

    assert.equal(Array.isArray(results), true);
    assert.equal(results.length > 0, true);
    assert.equal(results.some(result => result.stationId === "OP10"), true);
  });
});

describe("capacity share smoke test", () => {
  it("converts weekly demand and standard minutes into required capacity share", () => {
    const result = calculateRequiredCapacityShare(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-10",
      stationId: "OP10",
      availableMinutes: 2880,
    });

    assert.equal(result.demandQty, 1800);
    assert.equal(result.requiredMinutes, 720);
    assert.equal(result.requiredCapacityShare, 0.25);
  });

  it("finds the project phase requested share profile", () => {
    const profile = findCapacityShareProfile(sampleScenario, "A-Housing", "op-a-10", "OP10");

    assert.equal(profile?.requestedCapacityShare, 0.25);
  });

  it("flags risk when required share exceeds capacity ceiling", () => {
    const result = evaluateCapacityShare(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-10",
      stationId: "OP10",
      requestedCapacityShare: 0.25,
      requiredCapacityShare: 0.32,
    });

    assert.equal(result.status, "critical");
    assert.equal(result.risks.length, 1);
    assert.equal(result.risks[0].code, "required_exceeds_ceiling");
    assert.equal(Number(result.risks[0].delta.toFixed(2)), 0.07);
  });

  it("keeps share evaluation ok when required share stays within capacity ceiling", () => {
    const result = evaluateCapacityShare(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-10",
      stationId: "OP10",
      requestedCapacityShare: 0.25,
      requiredCapacityShare: 0.25,
    });

    assert.equal(result.status, "ok");
    assert.equal(result.risks.length, 0);
  });



  it("defaults capacity ceiling to 100% when no explicit share is defined", () => {
    const result = evaluateCapacityShare(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-20",
      stationId: "OP20",
      requiredCapacityShare: 0.98,
    });

    assert.equal(result.requestedCapacityShare, 1);
    assert.equal(result.status, "ok");
    assert.equal(result.risks.length, 0);
  });

  it("flags risk when demand exceeds the default 100% capacity ceiling", () => {
    const result = evaluateCapacityShare(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-20",
      stationId: "OP20",
      requiredCapacityShare: 1.08,
    });

    assert.equal(result.requestedCapacityShare, 1);
    assert.equal(result.status, "critical");
    assert.equal(result.risks.some(risk => risk.code === "required_exceeds_ceiling"), true);
  });

  it("calculates actual capacity share from observed occupied minutes", () => {
    const actual = calculateActualCapacityShare({
      productId: "A-Housing",
      operationId: "op-a-10",
      stationId: "OP10",
      actualMinutes: 900,
      availableMinutes: 2880,
    });

    assert.equal(actual.actualCapacityShare, 0.3125);
  });

  it("flags risk when actual share exceeds capacity ceiling", () => {
    const result = evaluateCapacityShare(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-10",
      stationId: "OP10",
      requestedCapacityShare: 0.25,
      actualCapacityShare: 0.3125,
    });

    assert.equal(result.status, "critical");
    assert.equal(result.risks.some(risk => risk.code === "actual_exceeds_ceiling"), true);
  });
});


describe("batch HU policy smoke test", () => {
  it("accepts quantities that match the process HU multiple", () => {
    const result = checkBatchHUCompliance(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-10",
      quantity: 240,
    });

    assert.equal(result.status, "ok");
    assert.equal(result.remainderQty, 0);
    assert.equal(result.fullMultiples, 2);
  });

  it("requires exception approval when quantity is not a full HU multiple", () => {
    const result = checkBatchHUCompliance(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-10",
      quantity: 250,
    });

    assert.equal(result.status, "needsApproval");
    assert.equal(result.remainderQty, 10);
    assert.equal(result.suggestedQuantity, 360);
  });

  it("rejects quantities below minimum process HU", () => {
    const result = checkBatchHUCompliance(sampleScenario, {
      productId: "A-Housing",
      operationId: "op-a-10",
      quantity: 80,
    });

    assert.equal(result.status, "invalid");
    assert.equal(result.minimumProcessHU, 120);
  });
});


describe("approval gate smoke test", () => {
  it("keeps pending backup blocked", () => {
    const assignment = sampleScenario.operationStationAssignments.find(item => item.assignmentId === "assign-a-op10-op10c");
    assert.ok(assignment);

    const result = releasePlanningGate({ assignment });

    assert.equal(result.released, false);
    assert.equal(result.after.planningAllowed, false);
    assert.equal(canAssignmentBePlanned(result.after), false);
  });

  it("releases backup planning gate after customer approval", () => {
    const assignment = sampleScenario.operationStationAssignments.find(item => item.assignmentId === "assign-a-op10-op10c");
    assert.ok(assignment);

    const result = releasePlanningGate({ assignment, approvalStatus: "approved" });

    assert.equal(result.released, true);
    assert.equal(result.after.planningAllowed, true);
    assert.equal(result.after.approvalStatus, "approved");
    assert.equal(result.after.planningBlockerReason, undefined);
    assert.equal(canAssignmentBePlanned(result.after), true);
  });
});


describe("demand normalization smoke test", () => {
  it("uses product weekly demand as the core demand input", () => {
    const product = sampleScenario.products.find(item => item.productId === "A-Housing");
    assert.ok(product);

    const result = normalizeWeeklyDemand(product);

    assert.equal(result.weeklyDemand, 1800);
    assert.equal(result.source, "weeklyDemand");
  });

  it("converts annual demand to weekly demand when weekly demand is not positive", () => {
    const product = {
      productId: "Annual-Only",
      name: "Annual Only Product",
      weeklyDemand: 0,
      annualDemand: 52000,
      demandScenario: "custom",
      routeId: "route-annual",
    };

    const result = normalizeWeeklyDemand(product);

    assert.equal(result.weeklyDemand, 1000);
    assert.equal(result.source, "annualDemand");
  });

  it("uses manual scenario demand before short-cycle orders or product default", () => {
    const product = sampleScenario.products.find(item => item.productId === "A-Housing");
    assert.ok(product);

    const result = resolveWeeklyDemand({
      product,
      orders: sampleScenario.orders,
      manualScenarioWeeklyDemand: 2400,
    });

    assert.equal(result.weeklyDemand, 2400);
    assert.equal(result.source, "manualScenario");
  });

  it("uses short-cycle orders when no manual scenario forecast exists", () => {
    const product = sampleScenario.products.find(item => item.productId === "A-Housing");
    assert.ok(product);

    const result = resolveWeeklyDemand({ product, orders: sampleScenario.orders });

    assert.equal(result.weeklyDemand, 1800);
    assert.equal(result.source, "orders");
  });
});

describe("planned activity rule smoke test", () => {
  it("expands approved recurring planned activity rules", () => {
    const events = expandPlannedActivityRules(sampleScenario, { stationId: "OP10", repetitions: 2 });

    assert.equal(events.filter(event => event.kind === "break").length, 2);
    assert.equal(events.filter(event => event.kind === "maintenance").length, 2);
    assert.equal(events.reduce((sum, event) => sum + event.minutes, 0), 300);
  });

  it("does not expand proposed schedule-source rule unless explicitly included and approved", () => {
    const events = expandPlannedActivityRules(sampleScenario, { stationId: "OP20", includeScheduleSource: true });

    assert.equal(events.length, 0);
  });
});


describe("timeline and SA smoke test", () => {
  it("detects overlaps and finds explicit timeline gaps", () => {
    const events = [
      { id: "e1", stationId: "OP10", kind: "production", startMinute: 0, endMinute: 120, source: "manual" },
      { id: "e2", stationId: "OP10", kind: "break", startMinute: 100, endMinute: 150, source: "manual" },
    ];

    const issues = validateTimelineEvents(events, 240);
    const gaps = findTimelineGaps([events[0]], "OP10", 240);

    assert.equal(issues.some(issue => issue.code === "overlap"), true);
    assert.deepEqual(gaps, [{ stationId: "OP10", startMinute: 120, endMinute: 240 }]);
  });

  it("fills timeline gaps as unscheduled / not planned", () => {
    const events = [
      { id: "e1", stationId: "OP10", kind: "production", startMinute: 0, endMinute: 120, source: "manual" },
    ];

    const filled = fillGapsAsUnscheduled(events, "OP10", 240);

    assert.equal(filled.length, 2);
    assert.equal(filled[1].kind, "unscheduled");
    assert.equal(filled[1].startMinute, 120);
    assert.equal(filled[1].endMinute, 240);
  });

  it("calculates planned SA and real SA from planned and abnormal losses", () => {
    const calendar = {
      date: "2026-09-18",
      stationId: "OP10",
      scheduledMinutes: 600,
      projectShare: 1,
      events: [
        { kind: "break", minutes: 60, source: "template" },
        { kind: "setup", minutes: 40, source: "schedule" },
        { kind: "equipmentFailure", minutes: 30, source: "mes" },
      ],
    };

    assert.equal(calculatePlannedSA(calendar), 500 / 600);
    assert.equal(calculateRealSA(calendar), 470 / 600);
  });
});

describe("setup and production segment smoke test", () => {
  it("generates sequence-related setup events", () => {
    const events = generateSetupEvents(sampleScenario.orders, sampleScenario.routes, sampleScenario.setupRules);
    const op10 = events.get("OP10") ?? [];

    assert.equal(op10.length, 1);
    assert.equal(op10[0].kind, "setup");
    assert.equal(op10[0].minutes, 45);
    assert.equal(op10[0].productId, "B-Housing");
  });

  it("calculates production segment observed CT and hidden loss", () => {
    const result = calculateProductionSegment({
      segmentId: "seg-test",
      stationId: "OP10",
      productId: "A-Housing",
      startMinute: 0,
      endMinute: 60,
      okQty: 100,
      nokQty: 0,
      standardCycleSec: 30,
      piecesPerCycle: 1,
    });

    assert.equal(result.elapsedMinutes, 60);
    assert.equal(result.actualQty, 100);
    assert.equal(result.observedCycleSec, 36);
    assert.equal(result.expectedQtyAtStandard, 120);
    assert.equal(result.missingQty, 20);
    assert.equal(result.hiddenLossMinutes, 10);
  });
});

describe("capacity analysis preflight smoke test", () => {
  it("summarizes readiness, share, HU and capacity results for Product A", () => {
    const result = runCapacityAnalysisPreflight(sampleScenario, {
      productId: "A-Housing",
      availableMinutesByStation: { OP10: 2880 },
      plannedQuantityByOperation: { "op-a-10": 250 },
    });

    assert.equal(result.ready, true);
    assert.equal(result.readiness.ready, true);
    assert.equal(result.blockers.length, 0);
    assert.equal(result.capacityResults.some(item => item.stationId === "OP10"), true);
    const op10 = result.shareEvaluations.find(item => item.operationId === "op-a-10" && item.stationId === "OP10");
    const op20 = result.shareEvaluations.find(item => item.operationId === "op-a-20" && item.stationId === "OP20");

    assert.equal(op10?.requestedCapacityShare, 0.7);
    assert.equal(op10?.status, "ok");
    assert.equal(op20?.requestedCapacityShare, 1);
    assert.equal(result.batchChecks[0].status, "needsApproval");
    assert.equal(result.warnings.some(item => item.includes("exception approval")), true);
  });

  it("turns readiness errors into business blockers", () => {
    const scenario = cloneScenario({
      operationStationParameters: sampleScenario.operationStationParameters.filter(
        parameter => !(parameter.operationId === "op-a-20" && parameter.stationId === "OP20"),
      ),
    });

    const result = runCapacityAnalysisPreflight(scenario, { productId: "A-Housing" });

    assert.equal(result.ready, false);
    assert.equal(result.blockers.some(item => item.includes("no operation-station parameter")), true);
  });
});

describe("routing configuration smoke test", () => {
  it("builds a UI-ready routing view with primary, parallel and blocked backup stations", () => {
    const config = buildProductRoutingConfiguration(sampleScenario, "A-Housing");

    assert.equal(config.product?.productId, "A-Housing");
    assert.equal(config.route?.routeId, "route-a-housing-v1");
    assert.deepEqual(config.operations.map(item => item.operation.operationId), ["op-a-10", "op-a-20"]);

    const op10 = config.operations.find(item => item.operation.operationId === "op-a-10");
    assert.ok(op10);
    assert.deepEqual(op10.assignments.map(item => item.assignment.role), ["primary", "parallel", "backup"]);
    assert.deepEqual(op10.assignments.map(item => item.planningStatus), ["available", "available", "blocked"]);
    assert.equal(op10.assignments[0].station?.name, "Machining 01");
    assert.equal(op10.assignments[0].stationGroup?.stationGroupId, "grp-machining");
    assert.equal(op10.assignments[0].parameter?.standardCycleSec, 24);
    assert.equal(op10.assignments[2].messages.some(item => item.includes("customer approval")), true);
  });

  it("marks a planning-allowed station assignment as missing parameter for UI blocking", () => {
    const scenario = cloneScenario({
      operationStationParameters: sampleScenario.operationStationParameters.filter(
        parameter => !(parameter.operationId === "op-a-20" && parameter.stationId === "OP20"),
      ),
    });

    const config = buildProductRoutingConfiguration(scenario, "A-Housing");
    const op20 = config.operations.find(item => item.operation.operationId === "op-a-20");

    assert.ok(op20);
    assert.equal(op20.assignments[0].planningStatus, "missingParameter");
    assert.equal(op20.assignments[0].messages.some(item => item.includes("no operation-station parameter")), true);
  });

  it("builds routing view from the explicitly selected route id", () => {
    const scenario = cloneScenario({
      routes: [
        ...sampleScenario.routes,
        {
          routeId: "route-a-housing-v2",
          productId: "A-Housing",
          operations: [
            {
              operationId: "op-a-99",
              sequence: 99,
              name: "Selected Route Test Operation",
              processType: "test",
              stationId: "OP20",
              standardCycleSec: 30,
              plannedPerformanceRate: 1,
              plannedQualityRate: 1,
              partShare: 1,
            },
          ],
        },
      ],
    });

    const config = buildProductRoutingConfiguration(scenario, "A-Housing", "route-a-housing-v2");

    assert.equal(config.route?.routeId, "route-a-housing-v2");
    assert.equal(config.masterDataValidation.formalReady, false);
    assert.deepEqual(config.operations.map(item => item.operation.operationId), ["op-a-99"]);
  });
});
