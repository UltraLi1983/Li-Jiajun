import type { TimelineEvent } from "../domain/types.js";
import { reconcileRnrTimeline } from "./rnr-timeline-reconciliation.js";
import type { RnrSampleRevision } from "./rnr-sample-archive.js";

export type RnrSampleCheckCode = "timeline_invalid" | "actual_missing" | "unrecorded_time"
  | "planned_gap" | "production_missing" | "production_quantity_missing"
  | "validation_fixture" | "qualification_rules_pending";

export interface RnrSampleTechnicalAssessment {
  timeAccount: "complete" | "incomplete" | "invalid";
  eligibility: "blocked" | "rulesPending";
  unrecordedMinutes: number | null;
  plannedGapMinutes: number | null;
  reasons: RnrSampleCheckCode[];
}

export function assessRnrSampleTechnical(input: {
  revision: RnrSampleRevision;
  planned: TimelineEvent[];
  actual: Array<TimelineEvent & { okQty?: number; nokQty?: number }>;
  offShiftIntervals?: Array<{ startMinute: number; endMinute: number }>;
}): RnrSampleTechnicalAssessment {
  const reasons: RnrSampleCheckCode[] = [];
  let timeAccount: RnrSampleTechnicalAssessment["timeAccount"] = "invalid";
  let unrecordedMinutes: number | null = null;
  let plannedGapMinutes: number | null = null;
  try {
    const result = reconcileRnrTimeline({
      stationId: input.revision.scope.stationId,
      startMinute: input.revision.scope.startMinute,
      endMinute: input.revision.scope.endMinute,
      planned: input.planned,
      actual: input.actual,
      ...(input.offShiftIntervals ? { offShiftIntervals: input.offShiftIntervals } : {}),
    });
    unrecordedMinutes = result.unrecordedMinutes;
    plannedGapMinutes = result.plannedGapMinutes;
    if (!input.actual.length) reasons.push("actual_missing");
    if (result.unrecordedMinutes > 0) reasons.push("unrecorded_time");
    if (result.plannedGapMinutes > 0) reasons.push("planned_gap");
    timeAccount = result.complete && input.actual.length > 0 ? "complete" : "incomplete";
  } catch {
    reasons.push("timeline_invalid");
  }
  if (!input.actual.some(event => event.kind === "production")) reasons.push("production_missing");
  if (input.actual.some(event => event.kind === "production"
    && (!Number.isFinite(event.okQty) || !Number.isFinite(event.nokQty)
      || (event.okQty ?? -1) < 0 || (event.nokQty ?? -1) < 0
      || (event.okQty ?? 0) + (event.nokQty ?? 0) <= 0))) {
    reasons.push("production_quantity_missing");
  }
  if (input.revision.source === "validationFixture") reasons.push("validation_fixture");
  const blocked = timeAccount !== "complete" || reasons.includes("production_missing") || reasons.includes("production_quantity_missing")
    || reasons.includes("validation_fixture");
  if (!blocked) reasons.push("qualification_rules_pending");
  return { timeAccount, eligibility: blocked ? "blocked" : "rulesPending",
    unrecordedMinutes, plannedGapMinutes, reasons };
}
