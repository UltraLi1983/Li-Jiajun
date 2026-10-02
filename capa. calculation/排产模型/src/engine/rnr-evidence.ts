import type { EventKind, TimelineEvent } from "../domain/types.js";
import type { RnrSpeedResult } from "./rnr-reconciliation.js";
import { reconcileRnrTimeline } from "./rnr-timeline-reconciliation.js";

export type AbnormalCategory = Extract<EventKind,
  "equipmentFailure" | "toolingIssue" | "logisticsWaiting" | "qualityHold" | "laborIssue">;

export interface RnrEvidenceEvent extends TimelineEvent {
  evidenceSource?: string;
  isEstimated?: boolean;
}

export interface RnrEvidenceInput {
  productId: string;
  operationId: string;
  stationId: string;
  startMinute: number;
  endMinute: number;
  planned: TimelineEvent[];
  actual: RnrEvidenceEvent[];
  speed: RnrSpeedResult;
}

export interface RnrAbnormalEvidence {
  evidenceId: string;
  sourceEventId: string;
  productId: string;
  operationId: string;
  stationId: string;
  category: AbnormalCategory;
  startMinute: number;
  endMinute: number;
  minutes: number;
  evidenceSource: string;
  isEstimated: boolean;
  note?: string;
}

export interface RnrHiddenLossFinding {
  findingId: string;
  sourceProductionEventId: string;
  productId: string;
  operationId: string;
  stationId: string;
  startMinute: number;
  endMinute: number;
  estimatedMinutes: number;
  evidenceSource: "outputInference";
  status: "suspected";
}

export type RnrEvidenceBlockerCode =
  | "unrecorded_time" | "planned_gap" | "no_production"
  | "invalid_observation" | "faster_than_verified_standard";

export type RnrEvidenceNoticeCode = "missing_evidence_source" | "unexplained_inferred_loss";

export interface RnrEvidenceResult {
  explicit: RnrAbnormalEvidence[];
  inferred: RnrHiddenLossFinding[];
  explicitMinutes: number;
  inferredMinutes: number;
  blockers: { code: RnrEvidenceBlockerCode; sourceEventId?: string }[];
  notices: { code: RnrEvidenceNoticeCode; sourceEventId?: string }[];
  readyForCalculation: boolean;
}

const abnormalCategories = new Set<AbnormalCategory>([
  "equipmentFailure", "toolingIssue", "logisticsWaiting", "qualityHold", "laborIssue",
]);

export function buildRnrEvidence(input: RnrEvidenceInput): RnrEvidenceResult {
  const timeline = reconcileRnrTimeline(input);
  const blockers: RnrEvidenceResult["blockers"] = [];
  const notices: RnrEvidenceResult["notices"] = [];
  if (timeline.unrecordedMinutes > 0) blockers.push({ code: "unrecorded_time" });
  if (timeline.plannedGapMinutes > 0) blockers.push({ code: "planned_gap" });

  const production = input.actual.filter(event => event.kind === "production");
  if (!production.length) blockers.push({ code: "no_production" });
  const speedById = new Map(input.speed.segments.map(segment => [segment.id, segment]));
  const inferred: RnrHiddenLossFinding[] = [];
  for (const event of production) {
    const segment = speedById.get(event.id);
    if (!segment || segment.issue === "invalid_observation") {
      blockers.push({ code: "invalid_observation", sourceEventId: event.id });
      continue;
    }
    if (segment.issue === "faster_than_verified_standard") {
      blockers.push({ code: "faster_than_verified_standard", sourceEventId: event.id });
      continue;
    }
    if (segment.inferredSaLossMinutes > 0) {
      inferred.push({
        findingId: `finding-${event.id}`, sourceProductionEventId: event.id,
        productId: input.productId, operationId: input.operationId, stationId: input.stationId,
        startMinute: event.startMinute, endMinute: event.endMinute,
        estimatedMinutes: segment.inferredSaLossMinutes,
        evidenceSource: "outputInference", status: "suspected",
      });
    }
  }
  if (inferred.length) notices.push({ code: "unexplained_inferred_loss" });

  const explicit: RnrAbnormalEvidence[] = input.actual
    .filter(event => abnormalCategories.has(event.kind as AbnormalCategory))
    .map(event => {
      const evidenceSource = event.evidenceSource?.trim() ?? "";
      if (!evidenceSource) notices.push({ code: "missing_evidence_source", sourceEventId: event.id });
      return {
        evidenceId: `evidence-${event.id}`, sourceEventId: event.id,
        productId: input.productId, operationId: input.operationId, stationId: input.stationId,
        category: event.kind as AbnormalCategory,
        startMinute: event.startMinute, endMinute: event.endMinute,
        minutes: event.endMinute - event.startMinute,
        evidenceSource, isEstimated: event.isEstimated ?? false,
        ...(event.note ? { note: event.note } : {}),
      };
    });

  return {
    explicit, inferred,
    explicitMinutes: explicit.reduce((sum, item) => sum + item.minutes, 0),
    inferredMinutes: inferred.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    blockers, notices, readyForCalculation: blockers.length === 0,
  };
}
