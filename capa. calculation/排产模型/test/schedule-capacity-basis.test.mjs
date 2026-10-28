import assert from "node:assert/strict";
import test from "node:test";
import { buildScheduleCapacityBases } from "../dist/engine/schedule-capacity-basis.js";
import { evaluateScheduleCapacityGate } from "../dist/engine/schedule-capacity-gate.js";

const parameter = { parameterId: "p-1", operationId: "op-1", stationId: "station-1", approvalStatus: "effective",
  effectiveFrom: "2026-10-01", standardCycleSec: 60, piecesPerCycle: 1, performanceRate: 0.9, qualityRate: 1 };
const schedule = { stationId: "station-1", windowStartAt: "2026-10-26T08:30:00+08:00", horizonMinutes: 480,
  shifts: [{ id: "shift-1", startMinute: 0, endMinute: 480 }],
  tasks: [{ id: "task-1", productId: "product-1", targetPieces: 350, startMinute: 0, endMinute: 480 }],
  dailyBreaks: [{ id: "break-1", startMinuteOfDay: 120, endMinuteOfDay: 150 }],
  datedEvents: [{ id: "setup-1", kind: "setup", startMinute: 240, endMinute: 270 }] };
const input = { schedule, weekStartDate: "2026-10-26", operationId: "op-1", parameters: [parameter], unplannedMinutesPerShift: 30 };

test("task basis deducts explicit planned losses once and distributes the unplanned reserve", () => {
  const result = buildScheduleCapacityBases(input);
  assert.deepEqual(result.issues, []);
  assert.equal(result.bases[0].bestCasePieces, 420);
  assert.equal(result.bases[0].mostLikelyPieces, 351);
  assert.equal(evaluateScheduleCapacityGate({ schedule, routeId: "route-1", planVersion: "draft-1", capacityBases: result.bases }).status, "pass");
  const highTarget = { ...schedule, tasks: [{ ...schedule.tasks[0], targetPieces: 430 }] };
  assert.equal(evaluateScheduleCapacityGate({ schedule: highTarget, routeId: "route-1", planVersion: "draft-1", capacityBases: result.bases }).status, "rejected");
});

test("missing same-week allowance and parameter changes keep task basis unavailable", () => {
  assert.match(buildScheduleCapacityBases({ ...input, unplannedMinutesPerShift: undefined }).issues[0], /allowance/);
  const overnight = { ...schedule, windowStartAt: "2026-10-26T20:00:00+08:00", horizonMinutes: 480,
    shifts: [{ id: "shift-1", startMinute: 0, endMinute: 480 }], dailyBreaks: [], datedEvents: [] };
  const nextVersion = { ...parameter, parameterId: "p-2", effectiveFrom: "2026-10-27" };
  const result = buildScheduleCapacityBases({ ...input, schedule: overnight, parameters: [parameter, nextVersion] });
  assert.equal(result.bases.length, 0);
  assert.match(result.issues[0], /changes within task/);
});

test("a task crossing into the next ledger week has no borrowed capacity basis", () => {
  const sunday = { ...schedule, windowStartAt: "2026-11-01T20:00:00+08:00", horizonMinutes: 480,
    shifts: [{ id: "shift-1", startMinute: 0, endMinute: 480 }], dailyBreaks: [], datedEvents: [] };
  const result = buildScheduleCapacityBases({ ...input, schedule: sunday });
  assert.equal(result.bases.length, 0);
  assert.match(result.issues[0], /crosses the capacity ledger week/);
});
