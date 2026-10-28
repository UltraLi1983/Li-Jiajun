import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import { calculateRequiredCapacityShare } from "../dist/engine/capacity-share-engine.js";
import { runCapacityAnalysisPreflight } from "../dist/engine/analysis-summary-engine.js";
import {
  completeWeekAvailableMinutes, presentBatchRows, presentPreflightSummary, presentReadinessIssues, presentShareRows, resolveShareMinuteSupply,
} from "../dist/engine/preflight-display.js";

const catalogA = {
  operations: [
    { operationId: "local-op-1", sequence: 10, name: "压铸" },
    { operationId: "local-op-2", sequence: 20, name: "机加工" },
    { operationId: "local-op-3", sequence: 30, name: "装配" },
  ],
  stations: [
    { operationId: "local-op-1", stationId: "cast-1", name: "压铸01" },
    { operationId: "local-op-2", stationId: "mach-1", name: "机加工01" },
    { operationId: "local-op-2", stationId: "mach-2", name: "机加工01" },
    { operationId: "local-op-3", stationId: "assy-1", name: "装配01" },
  ],
};
const catalogB = {
  operations: [
    { operationId: "other-op", sequence: 10, name: "压铸" },
  ],
  stations: [
    { operationId: "other-op", stationId: "cast-9", name: "压铸01" },
  ],
};

describe("preflight display identities", () => {
  it("shows disconnected stage materials on the downstream operation in both languages", () => {
    const scenario = structuredClone(sampleScenario);
    scenario.stageBoms.find(item => item.stageBomId === "bom-a-op20-out").inputItems = ["different-wip"];
    const preflight = runCapacityAnalysisPreflight(scenario, {
      productId: "A-Housing", routeId: "route-a-housing-v1", asOfDate: "2026-10-19", throughDate: "2026-10-25",
    });
    const catalog = { operations: scenario.routes.find(item => item.routeId === "route-a-housing-v1").operations, stations: [] };
    const zh = presentReadinessIssues(preflight.readiness.issues, catalog, "zh");
    const en = presentReadinessIssues(preflight.readiness.issues, catalog, "en");

    assert.equal(preflight.ready, false);
    assert.equal(zh.some(item => item.technical.causeCode === "stage_material_disconnected"
      && item.operation.label === "OP20 Assembly" && item.problemType === "前后工序物料不衔接"), true);
    assert.equal(en.some(item => item.technical.causeCode === "stage_material_disconnected"
      && item.problemType === "Stage materials disconnected"), true);
  });

  it("shows an expired stage material on the owning operation in both languages", () => {
    const scenario = structuredClone(sampleScenario);
    scenario.stageBoms.find(item => item.stageBomId === "bom-a-op20-out").effectiveTo = "2026-10-18";
    const preflight = runCapacityAnalysisPreflight(scenario, {
      productId: "A-Housing", routeId: "route-a-housing-v1", asOfDate: "2026-10-19", throughDate: "2026-10-25",
    });
    const catalog = { operations: scenario.routes.find(item => item.routeId === "route-a-housing-v1").operations, stations: [] };
    const zh = presentReadinessIssues(preflight.readiness.issues, catalog, "zh");
    const en = presentReadinessIssues(preflight.readiness.issues, catalog, "en");

    assert.equal(preflight.ready, false);
    assert.equal(zh.some(item => item.technical.causeCode === "stage_bom_not_effective"
      && item.operation.label === "OP20 Assembly" && item.problemType === "阶段物料不在有效期"), true);
    assert.equal(en.some(item => item.technical.causeCode === "stage_bom_not_effective"
      && item.problemType === "Stage material not effective"), true);
  });

  it("uses the current route sequence and name, and keeps another route unmatched", () => {
    const issues = [{
      severity: "error", code: "route_master_invalid", causeCode: "process_master_not_released",
      productId: "A-Housing", operationId: "local-op-1", subjectId: "local-process-1",
      message: "local-op-1 references ProcessMaster local-process-1, which is not released",
    }, {
      severity: "warning", code: "batch_hu_policy_missing", productId: "A-Housing", operationId: "local-op-3",
      message: "local-op-3 has no batch HU policy",
    }, {
      severity: "error", code: "parameter_missing", productId: "A-Housing",
      operationId: "local-op-2", stationId: "mach-1", message: "missing parameter",
    }, {
      severity: "error", code: "route_master_invalid", causeCode: "route_not_released",
      productId: "A-Housing", message: "local-route-a-housing-v1-1 is not released",
    }, {
      severity: "error", code: "parameter_missing", productId: "A-Housing",
      operationId: "old-op", stationId: "OP20A", message: "old station",
    }];
    const zh = presentReadinessIssues(issues, catalogA, "zh");
    assert.equal(zh[0].problemType, "工艺未发布");
    assert.equal(zh[0].operation.label, "OP10 压铸");
    assert.equal(zh[0].station.label, "不适用");
    assert.equal(zh[0].station.applicability, "notApplicable");
    assert.equal(zh[0].action, "OP10 压铸的工艺主数据尚未发布");
    assert.equal(zh[0].action.includes("local-op-1"), false);
    assert.equal(zh[0].technical.subjectId, "local-process-1");
    assert.equal(zh[1].action, "OP30 装配尚未配置批量/HU规则");
    assert.equal(zh[2].station.label, "机加工01 · OP20 · 1");
    assert.equal(zh[2].station.label.includes("mach-1"), false);
    assert.equal(zh[3].operation.label, "整条路线");
    assert.equal(zh[3].action, "当前本地路线尚未发布");
    assert.equal(zh[4].operation.applicability, "unmatched");
    assert.equal(zh[4].operation.label, "当前路线未找到对应对象");
    assert.equal(zh[4].station.applicability, "unmatched");

    const en = presentReadinessIssues(issues, catalogA, "en");
    assert.equal(en[0].problemType, "Process not released");
    assert.equal(en[0].operation.label, "OP10 压铸");
    assert.equal(en[3].operation.label, "Whole route");
    assert.equal(en[3].station.label, "Not applicable");

    const otherRoute = presentReadinessIssues(issues, catalogB, "zh");
    assert.equal(otherRoute[0].operation.label, "当前路线未找到对应对象");
    assert.equal(otherRoute[2].station.label, "当前路线未找到对应对象");
    assert.equal(otherRoute.some(row => row.operation.label === "OP10 压铸" && row.technical.operationId === "local-op-1"), false);
  });

  it("labels a missing station differently from a route-level row", () => {
    const [row] = presentReadinessIssues([{
      severity: "error", code: "parameter_missing", productId: "A-Housing", operationId: "local-op-1",
      message: "parameter missing",
    }], catalogA, "zh");
    assert.equal(row.operation.label, "OP10 压铸");
    assert.equal(row.station.applicability, "missing");
    assert.equal(row.station.label, "信息缺失");
  });

  it("does not treat the old 2880-minute sample as a confirmed share risk", () => {
    const data = structuredClone(sampleScenario);
    const parameter = data.operationStationParameters.find(item => item.operationId === "op-a-10" && item.stationId === "OP20A");
    parameter.standardCycleSec = 200;
    parameter.piecesPerCycle = 1;
    const oldBasis = calculateRequiredCapacityShare(data, {
      productId: "A-Housing", operationId: "op-a-10", stationId: "OP20A", availableMinutes: 2880, demandQty: 1800,
    });
    assert.equal(Math.round(oldBasis.requiredCapacityShare * 1000) / 10, 208.3);
    const weekBasis = calculateRequiredCapacityShare(data, {
      productId: "A-Housing", operationId: "op-a-10", stationId: "OP20A", availableMinutes: 7200, demandQty: 1800,
    });
    assert.equal(Math.round(weekBasis.requiredCapacityShare * 1000) / 10, 83.3);

    const missing = resolveShareMinuteSupply(["cast-1", "mach-1"], { "cast-1": ["2026-10-19"], "mach-1": [] }, {});
    assert.equal(missing.basis, "unavailable");
    const ready = resolveShareMinuteSupply(["OP20A"], { OP20A: ["2026-10-19"] }, { OP20A: { "2026-10-19": 7200 } });
    assert.deepEqual(ready, { basis: "weekLedger", weekStartDate: "2026-10-19", minutes: { OP20A: 7200 } });

    const demo = runCapacityAnalysisPreflight(data, {
      productId: "A-Housing", availableMinutesByStation: { OP20A: 2880 }, availableMinutesBasis: "demoSample",
    });
    const demoRows = presentShareRows(demo.shareEvaluations, [
      { operationId: "op-a-10", stationId: "OP20A" },
    ], {
      operations: [{ operationId: "op-a-10", sequence: 10, name: "机加工" }],
      stations: [{ operationId: "op-a-10", stationId: "OP20A", name: "机加工01" }],
    }, "zh");
    assert.equal(demoRows[0].basis, "insufficient");
    assert.equal(demoRows[0].requiredLabel, "排班依据不足");
    assert.equal(demoRows[0].requiredLabel.includes("208.3"), false);
    assert.equal(demoRows[0].action.includes("已确认风险"), true);

    const week = runCapacityAnalysisPreflight(data, {
      productId: "A-Housing", availableMinutesByStation: { OP20A: 7200 }, availableMinutesBasis: "weekLedger",
    });
    const weekRows = presentShareRows(week.shareEvaluations, [
      { operationId: "op-a-10", stationId: "OP20A" },
    ], {
      operations: [{ operationId: "op-a-10", sequence: 10, name: "机加工" }],
      stations: [{ operationId: "op-a-10", stationId: "OP20A", name: "机加工01" }],
    }, "zh");
    assert.equal(weekRows[0].basis, "weekLedger");
    assert.equal(weekRows[0].requiredLabel, "83.3%");
    assert.equal(weekRows[0].actualLabel, "未接入生产实绩");
    assert.equal(weekRows[0].station.label, "机加工01");

    const unset = presentShareRows([], [
      { operationId: "local-op-2", stationId: "mach-1", plannedShare: 0.7 },
      { operationId: "local-op-1", stationId: "cast-1" },
    ], catalogA, "zh");
    assert.equal(unset[0].requestedLabel, "70.0%");
    assert.equal(unset[0].requiredLabel, "排班依据不足");
    assert.equal(unset[1].requestedLabel, "未设固定份额");
    assert.equal(unset[1].station.label, "压铸01");
  });

  it("does not present a stored-profile actual share as current production", () => {
    const rows = presentShareRows([{
      productId: "A-Housing", operationId: "local-op-1", stationId: "cast-1",
      requestedCapacityShare: 1, requiredCapacityShare: 0.3, actualCapacityShare: 0.8,
      requiredShareBasis: "weekLedger", status: "warning",
      risks: [{ code: "actual_exceeds_required", level: "warning", delta: 0.5, message: "profile actual" }],
    }], [{ operationId: "local-op-1", stationId: "cast-1" }], catalogA, "zh");
    assert.equal(rows[0].requiredLabel, "30.0%");
    assert.equal(rows[0].actualLabel, "未接入生产实绩");
    assert.equal(rows[0].statusLabel, "未超份额");
    assert.equal(rows[0].action.includes("profile actual"), false);
  });

  it("rejects a stale day instead of shrinking the week denominator", () => {
    const fullWeek = Array.from({ length: 7 }, () => ({ stale: false, bestCaseAvailableMinutes: 1200 }));
    const partialWeek = fullWeek.map((day, index) => index === 3 ? { ...day, stale: true } : day);
    assert.equal(completeWeekAvailableMinutes(fullWeek), 8400);
    assert.equal(completeWeekAvailableMinutes(partialWeek), undefined);
    assert.equal(completeWeekAvailableMinutes(fullWeek.slice(0, 6)), undefined);

    const weeksByStation = { "cast-1": ["week-a", "week-b"], "mach-1": ["week-a", "week-b"] };
    const withStaleWeek = resolveShareMinuteSupply(["cast-1", "mach-1"], weeksByStation, {
      "cast-1": { "week-a": 8400, "week-b": 8400 },
      "mach-1": { "week-b": 8400 },
    });
    assert.deepEqual(withStaleWeek, { basis: "weekLedger", weekStartDate: "week-b", minutes: { "cast-1": 8400, "mach-1": 8400 } });
    const noCompleteWeek = resolveShareMinuteSupply(["cast-1", "mach-1"], { "cast-1": ["week-a"], "mach-1": ["week-a"] }, {
      "cast-1": { "week-a": 8400 }, "mach-1": {},
    });
    assert.deepEqual(noCompleteWeek, { basis: "unavailable", minutes: {} });
  });

  it("describes batch rules from status, not the English engine message", () => {
    const checks = [{
      productId: "A-Housing", operationId: "local-op-3", quantity: 100, policyId: "hu-1",
      minimumProcessHU: 120, batchMultiple: 120, fullMultiples: 0, remainderQty: 100,
      suggestedQuantity: 120, status: "invalid", message: "quantity 100 is below minimum process HU 120",
    }, {
      productId: "A-Housing", operationId: "local-op-1", quantity: 250, policyId: "hu-2",
      minimumProcessHU: 120, batchMultiple: 120, fullMultiples: 2, remainderQty: 10,
      suggestedQuantity: 360, status: "needsApproval", message: "exception approval required",
    }];
    const rows = presentBatchRows(checks, catalogA, "zh");
    assert.equal(rows[0].operation.label, "OP30 装配");
    assert.equal(rows[0].action, "计划件数 100 低于最小批量 120");
    assert.equal(rows[1].action, "计划件数 250 不是整批倍数，需要例外批准");
    const summary = presentPreflightSummary([], [], rows);
    assert.deepEqual(summary.blockers, ["计划件数 100 低于最小批量 120"]);
    assert.deepEqual(summary.warnings, ["计划件数 250 不是整批倍数，需要例外批准"]);
    const english = presentBatchRows(checks, catalogA, "en");
    assert.equal(english[0].action.includes("below the minimum batch"), true);
  });
});
