import assert from "node:assert/strict";
import test from "node:test";
import { evaluateScheduleCapacityGate, scheduleApprovalFingerprint } from "../dist/engine/schedule-capacity-gate.js";

const task = { id: "job-1", productId: "A", targetPieces: 90, startMinute: 0, endMinute: 480 };
const schedule = { stationId: "OP20A", windowStartAt: "2026-10-26T08:30:00+08:00", horizonMinutes: 480,
  shifts: [{ id: "shift-1", startMinute: 0, endMinute: 480 }], tasks: [task], dailyBreaks: [], datedEvents: [] };
const basis = { taskId: task.id, stationId: "OP20A", productId: "A", startMinute: 0, endMinute: 480,
  parameterVersion: "p-v2", bestCasePieces: 100, mostLikelyPieces: 80 };
const base = { schedule, routeId: "route-A", planVersion: "plan-v1", capacityBases: [basis] };
const approval = { approvalId: "approval-1", taskId: task.id, routeId: "route-A", stationId: "OP20A", productId: "A",
  windowStartAt: schedule.windowStartAt, scheduleFingerprint: scheduleApprovalFingerprint(schedule),
  planVersion: "plan-v1", parameterVersion: "p-v2", targetPieces: 90,
  bestCasePieces: 100, mostLikelyPieces: 80,
  startMinute: 0, endMinute: 480, approvedBy: "planner-1", approvedAt: "2026-10-23T08:30:00+08:00", reason: "confirmed overtime cover" };

test("above Best case is rejected even with an approval", () => {
  const result = evaluateScheduleCapacityGate({ ...base, schedule: { ...schedule, tasks: [{ ...task, targetPieces: 101 }] }, approvals: [approval] });
  assert.equal(result.status, "rejected");
  assert.equal(result.capacityReady, false);
  assert.equal(result.decisions[0].differencePieces, 1);
});

test("between Most likely and Best case needs a human decision", () => {
  const result = evaluateScheduleCapacityGate(base);
  assert.equal(result.status, "needsReview");
  assert.equal(result.decisions[0].differencePieces, 10);
});

test("a matching approval releases only this task quantity, interval, plan and parameter version", () => {
  assert.equal(evaluateScheduleCapacityGate({ ...base, approvals: [approval] }).status, "approvedRisk");
  assert.equal(evaluateScheduleCapacityGate({ ...base, approvals: [approval] }).decisions[0].approvalId, "approval-1");
  assert.equal(evaluateScheduleCapacityGate({ ...base, approvals: [{ ...approval, parameterVersion: "p-v1" }] }).status, "needsReview");
  assert.equal(evaluateScheduleCapacityGate({ ...base, routeId: "route-B", approvals: [approval] }).status, "needsReview");
  assert.equal(evaluateScheduleCapacityGate({ ...base, schedule: { ...schedule, windowStartAt: "2026-10-27T08:30:00+08:00" }, approvals: [approval] }).status, "needsReview");
  assert.equal(evaluateScheduleCapacityGate({ ...base, schedule: { ...schedule,
    datedEvents: [{ id: "setup-1", kind: "setup", startMinute: 400, endMinute: 420 }] }, approvals: [approval] }).status, "needsReview");
  assert.equal(evaluateScheduleCapacityGate({ ...base, approvals: [{ ...approval, revokedAt: "2026-10-24T09:00:00+08:00" }] }).status, "needsReview");
  assert.equal(evaluateScheduleCapacityGate({ ...base, planVersion: "plan-v2", approvals: [approval] }).status, "needsReview");
  assert.equal(evaluateScheduleCapacityGate({ ...base, schedule: { ...schedule, tasks: [{ ...task, targetPieces: 95 }] }, approvals: [approval] }).status, "needsReview");
  assert.equal(evaluateScheduleCapacityGate({ ...base, capacityBases: [{ ...basis, mostLikelyPieces: 81 }], approvals: [approval] }).status, "needsReview");
});

test("within Most likely passes the capacity gate", () => {
  const result = evaluateScheduleCapacityGate({ ...base, schedule: { ...schedule, tasks: [{ ...task, targetPieces: 80 }] } });
  assert.equal(result.status, "pass");
  assert.equal(result.capacityReady, true);
});

test("missing or mismatched capacity basis cannot pass", () => {
  assert.equal(evaluateScheduleCapacityGate({ ...base, capacityBases: [] }).status, "incomplete");
  assert.equal(evaluateScheduleCapacityGate({ ...base, capacityBases: [{ ...basis, stationId: "OP20B" }] }).status, "incomplete");
  assert.equal(evaluateScheduleCapacityGate({ ...base, capacityBases: [{ ...basis, endMinute: 470 }] }).status, "incomplete");
  assert.equal(evaluateScheduleCapacityGate({ ...base, capacityBases: [basis, basis] }).status, "incomplete");
});

test("unassigned scheduled time and conflicting timeline keep the whole plan from passing", () => {
  const gap = evaluateScheduleCapacityGate({ ...base, schedule: { ...schedule,
    shifts: [{ id: "shift-1", startMinute: 0, endMinute: 480 }, { id: "shift-2", startMinute: 480, endMinute: 960 }],
    horizonMinutes: 960 } });
  assert.equal(gap.status, "incomplete");
  const conflict = evaluateScheduleCapacityGate({ ...base, schedule: { ...schedule,
    tasks: [task, { ...task, id: "job-2", startMinute: 400 }] } });
  assert.equal(conflict.status, "conflict");
});

test("an empty production plan is not a capacity pass", () => {
  const result = evaluateScheduleCapacityGate({ ...base, schedule: { ...schedule, shifts: [], tasks: [] } });
  assert.equal(result.status, "incomplete");
  assert.equal(result.capacityReady, false);
});
