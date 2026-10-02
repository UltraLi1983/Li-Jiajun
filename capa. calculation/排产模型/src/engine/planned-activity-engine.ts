import type { CapacityScenario, PlannedActivityRule, StationEvent } from "../domain/types.js";

export interface PlannedActivityExpansionInput {
  stationId?: string;
  operationId?: string;
  repetitions?: number;
  includeScheduleSource?: boolean;
}

export function expandPlannedActivityRules(
  scenario: CapacityScenario,
  input: PlannedActivityExpansionInput = {},
): StationEvent[] {
  const repetitions = Math.max(input.repetitions ?? 1, 1);
  return (scenario.plannedActivityRules ?? [])
    .filter(rule => isApprovedRule(rule))
    .filter(rule => input.stationId === undefined || rule.stationId === input.stationId)
    .filter(rule => input.operationId === undefined || rule.operationId === input.operationId || rule.operationId === undefined)
    .filter(rule => input.includeScheduleSource === true || rule.source === "rule")
    .flatMap(rule => expandRule(rule, repetitions));
}

function isApprovedRule(rule: PlannedActivityRule): boolean {
  return rule.approvalStatus === "approved" || rule.approvalStatus === "effective" || rule.approvalStatus === "notRequired";
}

function expandRule(rule: PlannedActivityRule, repetitions: number): StationEvent[] {
  if (rule.standardMinutes === undefined || rule.standardMinutes <= 0) return [];
  return Array.from({ length: rule.isRecurring ? repetitions : 1 }, () => ({
    kind: rule.activityKind,
    minutes: rule.standardMinutes ?? 0,
    source: rule.source === "rule" ? "template" : "schedule",
    note: rule.ruleId,
  } satisfies StationEvent));
}
