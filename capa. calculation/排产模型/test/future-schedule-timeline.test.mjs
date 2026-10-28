import assert from "node:assert/strict";
import test from "node:test";
import { buildFutureScheduleTimeline } from "../dist/engine/future-schedule-timeline.js";

const base = {
  stationId: "OP20A", windowStartAt: "2026-10-26T08:30:00+08:00", horizonMinutes: 1440,
  shifts: [{ id: "shift-1", startMinute: 0, endMinute: 720 }, { id: "shift-2", startMinute: 720, endMinute: 1440 }],
  tasks: [{ id: "job-1", productId: "A", targetPieces: 100, startMinute: 0, endMinute: 720 },
    { id: "job-2", productId: "A", targetPieces: 100, startMinute: 720, endMinute: 1440 }],
  dailyBreaks: [{ id: "meal", startMinuteOfDay: 150, endMinuteOfDay: 180 }],
  datedEvents: [{ id: "setup-1", kind: "setup", startMinute: 700, endMinute: 720 }],
};

test("tasks minus recurring breaks and dated setup produce exact sourced segments", () => {
  const result = buildFutureScheduleTimeline(base);
  assert.equal(result.status, "complete");
  assert.equal(result.productionMinutes, 1390);
  assert.deepEqual(result.segments.map(item => [item.kind, item.startMinute, item.endMinute, item.sourceId]), [
    ["production", 0, 150, "job-1"], ["break", 150, 180, "meal:0"],
    ["production", 180, 700, "job-1"], ["setup", 700, 720, "setup-1"],
    ["production", 720, 1440, "job-2"],
  ]);
  assert.equal(result.segments[0].startAt, "2026-10-26T00:30:00.000Z");
  assert.equal(result.segments.at(-1).endAt, "2026-10-27T00:30:00.000Z");
});

test("a shift without a task is unassigned, never inferred as production", () => {
  const result = buildFutureScheduleTimeline({ ...base, tasks: base.tasks.slice(0, 1) });
  assert.equal(result.status, "incomplete");
  assert.equal(result.productionMinutes, undefined);
  assert.equal(result.unassignedMinutes, 720);
  assert.equal(result.segments.at(-1).kind, "unassigned");
});

test("off-shift minutes do not become unassigned gaps", () => {
  const result = buildFutureScheduleTimeline({ ...base, shifts: base.shifts.slice(0, 1), tasks: base.tasks.slice(0, 1) });
  assert.equal(result.status, "complete");
  assert.equal(result.unassignedMinutes, 0);
  assert.equal(result.productionMinutes, 670);
});

test("the daily break repeats at the same clock offset on the next production day", () => {
  const result = buildFutureScheduleTimeline({ ...base, horizonMinutes: 2880,
    shifts: [{ id: "two-days", startMinute: 0, endMinute: 2880 }],
    tasks: [{ id: "two-day-job", productId: "A", targetPieces: 400, startMinute: 0, endMinute: 2880 }],
    datedEvents: [],
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.segments.filter(item => item.kind === "break").map(item => item.startMinute), [150, 1590]);
});

test("one task may cross adjacent shifts, but not an off-shift gap", () => {
  const spanning = [{ id: "job-all", productId: "A", targetPieces: 200, startMinute: 0, endMinute: 1440 }];
  assert.equal(buildFutureScheduleTimeline({ ...base, tasks: spanning }).status, "complete");
  const shifts = [{ id: "early", startMinute: 0, endMinute: 700 }, { id: "late", startMinute: 720, endMinute: 1440 }];
  assert.equal(buildFutureScheduleTimeline({ ...base, shifts, tasks: spanning }).status, "conflict");
});

test("conflicting tasks or planned losses block a determined schedule", () => {
  const tasks = [...base.tasks, { id: "job-3", productId: "B", targetPieces: 10, startMinute: 710, endMinute: 730 }];
  assert.equal(buildFutureScheduleTimeline({ ...base, tasks }).status, "conflict");
  const datedEvents = [...base.datedEvents, { id: "stop-1", kind: "plannedStop", startMinute: 160, endMinute: 170 }];
  assert.equal(buildFutureScheduleTimeline({ ...base, datedEvents }).status, "conflict");
});

test("task or dated event outside shifts is rejected", () => {
  const shifts = base.shifts.slice(0, 1);
  assert.equal(buildFutureScheduleTimeline({ ...base, shifts }).status, "conflict");
});

test("production tasks require a positive target quantity", () => {
  assert.equal(buildFutureScheduleTimeline({ ...base, tasks: [{ ...base.tasks[0], targetPieces: 0 }] }).status, "conflict");
});
