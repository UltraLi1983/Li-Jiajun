import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRnrEvidence, reconcileRnrSpeedLoss } from "../dist/index.js";

const event = (id, kind, startMinute, endMinute, extra = {}) => ({
  id, kind, startMinute, endMinute, stationId: "OP10", source: "runRate", ...extra,
});
const production = (id, start, end, qty) => event(id, "production", start, end, {
  okQty: qty, nokQty: 0, piecesPerCycle: 1,
});

function evidenceInput(planned, actual, options = {}) {
  const speed = reconcileRnrSpeedLoss(actual.filter(item => item.kind === "production").map(item => ({
    id: item.id, productId: "A", operationId: "OP10", stationId: "OP10",
    startMinute: item.startMinute, endMinute: item.endMinute,
    okQty: item.okQty, nokQty: item.nokQty, piecesPerCycle: item.piecesPerCycle,
  })), options);
  return { productId: "A", operationId: "OP10", stationId: "OP10",
    startMinute: planned[0].startMinute, endMinute: planned.at(-1).endMinute,
    planned, actual, speed };
}

describe("R&R abnormal evidence", () => {
  it("keeps recorded abnormal time separate from production-only inferred loss", () => {
    const planned = [event("plan", "production", 0, 120)];
    const actual = [
      production("fast", 0, 40, 100),
      production("slow", 40, 85, 100),
      event("failure", "equipmentFailure", 85, 100, { evidenceSource: "PLC alarm", isEstimated: false }),
      production("last", 100, 120, 50),
    ];
    const result = buildRnrEvidence(evidenceInput(planned, actual));
    assert.equal(result.explicitMinutes, 15);
    assert.equal(result.inferredMinutes, 5);
    assert.equal(result.explicit[0].sourceEventId, "failure");
    assert.equal(result.explicit[0].category, "equipmentFailure");
    assert.equal(result.explicit[0].evidenceSource, "PLC alarm");
    assert.equal(result.inferred[0].sourceProductionEventId, "slow");
    assert.equal(result.inferred[0].status, "suspected");
    assert.equal(result.readyForCalculation, true);
    assert.ok(result.notices.some(item => item.code === "unexplained_inferred_loss"));
  });

  it("blocks incomplete coverage but only notes a missing abnormal source", () => {
    const planned = [event("plan", "production", 0, 120)];
    const actual = [production("first", 0, 40, 100), event("failure", "toolingIssue", 40, 50, { isEstimated: true })];
    const result = buildRnrEvidence(evidenceInput(planned, actual));
    assert.equal(result.explicit[0].isEstimated, true);
    assert.ok(result.blockers.some(item => item.code === "unrecorded_time"));
    assert.ok(result.notices.some(item => item.code === "missing_evidence_source" && item.sourceEventId === "failure"));
    assert.equal(result.readyForCalculation, false);
  });

  it("calculates a complete window even when an abnormal source is unknown", () => {
    const planned = [event("plan", "production", 0, 120)];
    const actual = [production("first", 0, 40, 100),
      event("failure", "equipmentFailure", 40, 50),
      production("last", 50, 120, 175)];
    const result = buildRnrEvidence(evidenceInput(planned, actual));
    assert.equal(result.readyForCalculation, true);
    assert.deepEqual(result.blockers, []);
    assert.ok(result.notices.some(item => item.code === "missing_evidence_source" && item.sourceEventId === "failure"));
  });

  it("blocks faster-than-verified production without creating negative loss", () => {
    const planned = [event("plan", "production", 0, 36)];
    const actual = [production("too-fast", 0, 36, 100)];
    const result = buildRnrEvidence(evidenceInput(planned, actual, { verifiedStandardCycleSec: 24 }));
    assert.equal(result.inferredMinutes, 0);
    assert.equal(result.readyForCalculation, false);
    assert.ok(result.blockers.some(item => item.code === "faster_than_verified_standard"));
  });

  it("rejects overlapping actual evidence before summarizing it", () => {
    const planned = [event("plan", "production", 0, 60)];
    const actual = [production("first", 0, 40, 100), event("failure", "equipmentFailure", 35, 50, { evidenceSource: "PLC" })];
    assert.throws(() => buildRnrEvidence(evidenceInput(planned, actual)), /overlap/);
  });
});
