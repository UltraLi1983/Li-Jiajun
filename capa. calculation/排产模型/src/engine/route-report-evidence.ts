import type { TimelineEvent } from "../domain/types.js";
import type { RnrSampleRevision } from "./rnr-sample-archive.js";
import { assessRnrSampleTechnical, type RnrSampleTechnicalAssessment } from "./rnr-sample-qualification.js";
import { reconcileRnrTimeline } from "./rnr-timeline-reconciliation.js";

export interface RouteReportRnrEvidence {
  sampleId: string;
  revisionId: string;
  revision: number;
  operationId: string;
  stationId: string;
  equipmentId: string;
  startMinute: number;
  endMinute: number;
  windowLabel?: string;
  source: RnrSampleRevision["source"];
  timeAccount: RnrSampleTechnicalAssessment["timeAccount"];
  eligibility: RnrSampleTechnicalAssessment["eligibility"];
  reasons: RnrSampleTechnicalAssessment["reasons"];
  plannedProductionMinutes?: number;
  actualProductionMinutes?: number;
  unrecordedMinutes?: number;
  plannedGapMinutes?: number;
  okQty?: number;
  nokQty?: number;
}

export function buildRouteReportRnrEvidence(input: {
  revision: RnrSampleRevision;
  planned: TimelineEvent[];
  actual: Array<TimelineEvent & { okQty?: number; nokQty?: number }>;
  offShiftIntervals?: Array<{ startMinute: number; endMinute: number }>;
}): RouteReportRnrEvidence {
  const { revision, planned, actual, offShiftIntervals } = input;
  const assessment = assessRnrSampleTechnical({ revision, planned, actual,
    ...(offShiftIntervals ? { offShiftIntervals } : {}) });
  const production = actual.filter(event => event.kind === "production");
  const quantitiesValid = production.length > 0 && production.every(event => Number.isFinite(event.okQty)
    && Number.isFinite(event.nokQty) && (event.okQty ?? -1) >= 0 && (event.nokQty ?? -1) >= 0);
  const result: RouteReportRnrEvidence = {
    sampleId: revision.sampleId, revisionId: revision.revisionId, revision: revision.revision,
    operationId: revision.scope.operationId, stationId: revision.scope.stationId,
    equipmentId: revision.scope.equipmentId, startMinute: revision.scope.startMinute,
    endMinute: revision.scope.endMinute, source: revision.source,
    timeAccount: assessment.timeAccount, eligibility: assessment.eligibility, reasons: assessment.reasons,
    ...(assessment.unrecordedMinutes === null ? {} : { unrecordedMinutes: assessment.unrecordedMinutes }),
    ...(assessment.plannedGapMinutes === null ? {} : { plannedGapMinutes: assessment.plannedGapMinutes }),
    ...(quantitiesValid ? {
      okQty: production.reduce((sum, event) => sum + (event.okQty ?? 0), 0),
      nokQty: production.reduce((sum, event) => sum + (event.nokQty ?? 0), 0),
    } : {}),
  };
  try {
    const timeline = reconcileRnrTimeline({ stationId: revision.scope.stationId,
      startMinute: revision.scope.startMinute, endMinute: revision.scope.endMinute,
      planned, actual, ...(offShiftIntervals ? { offShiftIntervals } : {}) });
    result.plannedProductionMinutes = timeline.plannedProductionMinutes;
    result.actualProductionMinutes = timeline.actualProductionMinutes;
  } catch { /* Assessment already reports the invalid time account. */ }
  return result;
}
