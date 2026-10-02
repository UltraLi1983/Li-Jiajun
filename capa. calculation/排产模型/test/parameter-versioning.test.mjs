import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import { calculateRequiredCapacityShare } from "../dist/engine/capacity-share-engine.js";
import { buildProductRoutingConfiguration } from "../dist/engine/routing-configuration-engine.js";
import { publishParameterVersion, selectEffectiveParameter } from "../dist/engine/parameter-versioning.js";

const base = sampleScenario.operationStationParameters.find(item => item.stationId === "OP10");
function confirmed(target, proposedValue, effectiveFrom = "2026-09-27") {
  return {
    suggestionId: `A-Housing:op-a-10:OP10:${target}`, target,
    targetStandardId: base.parameterId, productId: "A-Housing",
    operationId: base.operationId, stationId: base.stationId,
    currentValue: base[target], proposedValue, unit: target === "standardCycleSec" ? "seconds" : "rate",
    evidenceRefs: ["actual-production-1"], approvalStatus: "effective",
    eligibleForConfirmation: true, effectiveFrom, approvedBy: "local-validation",
  };
}

describe("CT/P/Q local publication", () => {
  it("keeps confirmation separate from planned parameters", () => {
    const suggestion = confirmed("qualityRate", 0.95);
    assert.equal(base.qualityRate, 1);
    assert.equal(selectEffectiveParameter([base], base.operationId, base.stationId, "2026-09-27"), base);
    assert.equal(suggestion.proposedValue, 0.95);
  });

  it("keeps a future version inactive until its effective date", () => {
    const q = confirmed("qualityRate", 0.95, "2026-10-01");
    q.approvalStatus = "approved";
    const next = publishParameterVersion(base, [q], "2026-10-01", "param-v2");
    assert.equal(next.supersedesParameterId, base.parameterId);
    assert.deepEqual(next.calibrationRefs, ["actual-production-1"]);
    assert.equal(base.qualityRate, 1);
    assert.equal(selectEffectiveParameter([base, next], base.operationId, base.stationId, "2026-09-27"), base);
    assert.equal(selectEffectiveParameter([base, next], base.operationId, base.stationId, "2026-10-01"), next);
    assert.equal(selectEffectiveParameter([base, { ...next, approvalStatus: "draft" }], base.operationId, base.stationId, "2026-10-01"), base);
  });

  it("feeds the active version into planned share and routing", () => {
    const scenario = structuredClone(sampleScenario);
    const args = { productId: "A-Housing", operationId: base.operationId, stationId: base.stationId, demandQty: 100, availableMinutes: 480 };
    const before = calculateRequiredCapacityShare(scenario, args);
    scenario.operationStationParameters.push(publishParameterVersion(base, [confirmed("qualityRate", 0.5)], "2026-09-27", "param-v2"));
    assert.equal(calculateRequiredCapacityShare(scenario, args).requiredMinutes, before.requiredMinutes * 2);
    assert.equal(buildProductRoutingConfiguration(scenario, "A-Housing", "route-a-housing-v1")
      .operations[0].assignments[0].parameter.parameterId, "param-v2");
  });

  it("rejects unconfirmed, stale, invalid, and unpaired CT changes", () => {
    assert.throws(() => publishParameterVersion(base, [{ ...confirmed("qualityRate", 0.9), approvalStatus: "draft" }], "2026-09-27", "v2"), /confirmed/);
    assert.throws(() => publishParameterVersion(base, [{ ...confirmed("qualityRate", 0.9), currentValue: 0.8 }], "2026-09-27", "v2"), /current/);
    assert.throws(() => publishParameterVersion(base, [confirmed("standardCycleSec", 22)], "2026-09-27", "v2"), /paired/);
    assert.throws(() => publishParameterVersion(base, [confirmed("qualityRate", 0)], "2026-09-27", "v2"), /ranges/);
    assert.throws(() => publishParameterVersion(base, [confirmed("qualityRate", 0.9)], "2026-02-30", "v2"), /date/);
  });

  it("publishes paired CT and P without mutating the old version", () => {
    const next = publishParameterVersion(base, [confirmed("standardCycleSec", 22), confirmed("performanceRate", 0.98)], "2026-09-27", "v2");
    assert.equal(next.standardCycleSec, 22);
    assert.equal(next.performanceRate, 0.98);
    assert.equal(base.standardCycleSec, 24);
  });
});
