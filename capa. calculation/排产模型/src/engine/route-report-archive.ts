import { buildRouteWeekPlan, type RouteWeekPlanInput, type RouteWeekPlanResult } from "./route-week-plan.js";
import type { RouteReportRnrEvidence } from "./route-report-evidence.js";
import type { FrozenStandardWindow } from "./standard-window.js";
import type { StandardSaDayConfig } from "./standard-sa-day.js";
import type { TimelineEvent } from "../domain/types.js";
import { parseRnrSampleArchive, type RnrSampleRevision } from "./rnr-sample-archive.js";

export const ROUTE_REPORT_CALCULATION_VERSION = "project-validation-week-v1";

export interface RouteReportSaSource {
  operationId: string;
  stationId: string;
  status: "current" | "stale" | "missing";
  dayConfig: StandardSaDayConfig;
  currentEvents: TimelineEvent[];
  frozenWindow?: FrozenStandardWindow;
}

export interface RouteReportSaWeek {
  role: "review" | "outlook";
  operationId: string;
  stationId: string;
  perShiftUnplanned: number;
  sourceLossRate?: number;
  acceptedLossMinutes?: number;
  pendingLossMinutes?: number;
  observedShiftCount?: number;
  shiftCounts: number[];
  withBreaksSa?: number;
  mostLikelySa?: number;
  sourceVersion?: number;
  days: Array<{
    date: string;
    mode: "copy" | "manual" | "off" | "occupied";
    stale: boolean;
    scheduledMinutes: number;
    productionMinutes: number;
    mostLikelyProductionMinutes?: number;
    breakMinutes: number;
    setupMinutes: number;
    maintenanceMinutes: number;
    plannedStopMinutes: number;
    unscheduledMinutes: number;
  }>;
}

/** Local, immutable calculation inputs for the two-page internal week report. */
export interface RouteReportSnapshot {
  id: string;
  createdAt: string;
  productName: string;
  productVersion: string;
  routeVersion: string;
  operationLabels: Record<string, string>;
  stationLabels: Record<string, string>;
  reviewInput: RouteWeekPlanInput;
  outlookInput: RouteWeekPlanInput;
  demandEvidence: {
    reviewRecordIds: string[];
    outlookRecordIds: string[];
    reviewSource: "daily" | "legacy" | "override" | "missing";
    outlookSource: "daily" | "legacy" | "override" | "missing";
  };
  reportSource?: "rnr" | "batch";
  reportScope?: "route" | "operation";
  operationId?: string;
  rnrEvidence?: RouteReportRnrEvidence[];
  missingRnrStationIds?: string[];
  plannedSaWeeks?: RouteReportSaWeek[];
  calculationVersion?: string;
  saSources?: RouteReportSaSource[];
  selectedRnrRevisions?: RnrSampleRevision[];
}

export interface RouteReportArchive {
  schemaVersion: 1;
  snapshots: RouteReportSnapshot[];
}

export function emptyRouteReportArchive(): RouteReportArchive {
  return { schemaVersion: 1, snapshots: [] };
}

export function parseRouteReportArchive(raw: string | null): RouteReportArchive {
  if (!raw) return emptyRouteReportArchive();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid report archive");
  const archive = value as RouteReportArchive;
  if (archive.schemaVersion !== 1 || !Array.isArray(archive.snapshots) || archive.snapshots.length > 100) {
    throw new Error("Invalid report archive");
  }
  const ids = new Set<string>();
  for (const item of archive.snapshots) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)
      || !Number.isFinite(Date.parse(item.createdAt)) || !item.productName
      || !item.reviewInput || !item.outlookInput
      || item.reviewInput.role !== "review" || item.outlookInput.role !== "outlook"
      || item.reviewInput.productId !== item.outlookInput.productId
      || item.reviewInput.routeId !== item.outlookInput.routeId
      || !Array.isArray(item.reviewInput.stations) || !Array.isArray(item.outlookInput.stations)
      || !Array.isArray(item.reviewInput.operationUnits) || !Array.isArray(item.outlookInput.operationUnits)
      || !item.demandEvidence || !Array.isArray(item.demandEvidence.reviewRecordIds)
      || !Array.isArray(item.demandEvidence.outlookRecordIds)
      || (item.reportSource !== undefined && !["rnr", "batch"].includes(item.reportSource))
      || (item.reportScope !== undefined && !["route", "operation"].includes(item.reportScope))
      || (item.reportScope === "operation" && (!item.operationId || item.reviewInput.operationOrder.length !== 1
        || item.reviewInput.operationOrder[0] !== item.operationId || item.outlookInput.operationOrder[0] !== item.operationId))
      || (item.rnrEvidence !== undefined && !Array.isArray(item.rnrEvidence))
      || (item.calculationVersion !== undefined && (!item.calculationVersion || typeof item.calculationVersion !== "string"))
      || (item.saSources !== undefined && (!Array.isArray(item.saSources)
        || item.saSources.some(source => !source || !source.operationId || !source.stationId
          || !["current", "stale", "missing"].includes(source.status)
          || !source.dayConfig || !Array.isArray(source.currentEvents)
          || (source.status === "missing" && source.frozenWindow !== undefined)
          || (source.status !== "missing" && (!source.frozenWindow || source.frozenWindow.stationId !== source.stationId)))))
      || (item.selectedRnrRevisions !== undefined && (!Array.isArray(item.selectedRnrRevisions)
        || item.selectedRnrRevisions.length !== (item.rnrEvidence?.length ?? 0)
        || item.selectedRnrRevisions.some(record => record.scope.productId !== item.reviewInput.productId
          || record.scope.routeId !== item.reviewInput.routeId || record.scope.routeVersion !== item.routeVersion
          || !item.rnrEvidence?.some(evidence => evidence.revisionId === record.revisionId
            && evidence.operationId === record.scope.operationId && evidence.stationId === record.scope.stationId))))
      || (item.plannedSaWeeks !== undefined && (!Array.isArray(item.plannedSaWeeks)
        || item.plannedSaWeeks.some(week => !["review", "outlook"].includes(week.role)
          || !week.operationId || !week.stationId || !Array.isArray(week.days) || week.days.length !== 7
          || !Array.isArray(week.shiftCounts) || week.shiftCounts.length !== 7
          || !week.days.every(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date)
            && Number.isFinite(day.productionMinutes) && Number.isFinite(day.scheduledMinutes)))))
      || (item.missingRnrStationIds !== undefined && !Array.isArray(item.missingRnrStationIds))) throw new Error("Invalid report snapshot");
    ids.add(item.id);
    if (item.selectedRnrRevisions) parseRnrSampleArchive(JSON.stringify({ schemaVersion: 1, revisions: item.selectedRnrRevisions }));
  }
  return archive;
}

export function appendRouteReportSnapshot(archive: RouteReportArchive, snapshot: RouteReportSnapshot): RouteReportArchive {
  if (archive.snapshots.some(item => item.id === snapshot.id)) throw new Error("Report snapshot ID already exists");
  const next = { schemaVersion: 1 as const, snapshots: [...archive.snapshots, structuredClone(snapshot)] };
  return parseRouteReportArchive(JSON.stringify(next));
}

export function replayRouteReportSnapshot(snapshot: RouteReportSnapshot): {
  review: RouteWeekPlanResult;
  outlook: RouteWeekPlanResult;
} {
  return {
    review: buildRouteWeekPlan(structuredClone(snapshot.reviewInput)),
    outlook: buildRouteWeekPlan(structuredClone(snapshot.outlookInput)),
  };
}
