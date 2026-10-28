import { buildRouteWeekPlan } from "./route-week-plan.js";
import { parseRnrSampleArchive } from "./rnr-sample-archive.js";
export const ROUTE_REPORT_CALCULATION_VERSION = "project-validation-week-v1";
export function emptyRouteReportArchive() {
    return { schemaVersion: 1, snapshots: [] };
}
export function parseRouteReportArchive(raw) {
    if (!raw)
        return emptyRouteReportArchive();
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid report archive");
    const archive = value;
    if (archive.schemaVersion !== 1 || !Array.isArray(archive.snapshots) || archive.snapshots.length > 100) {
        throw new Error("Invalid report archive");
    }
    const ids = new Set();
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
            || (item.missingRnrStationIds !== undefined && !Array.isArray(item.missingRnrStationIds)))
            throw new Error("Invalid report snapshot");
        ids.add(item.id);
        if (item.selectedRnrRevisions)
            parseRnrSampleArchive(JSON.stringify({ schemaVersion: 1, revisions: item.selectedRnrRevisions }));
    }
    return archive;
}
export function appendRouteReportSnapshot(archive, snapshot) {
    if (archive.snapshots.some(item => item.id === snapshot.id))
        throw new Error("Report snapshot ID already exists");
    const next = { schemaVersion: 1, snapshots: [...archive.snapshots, structuredClone(snapshot)] };
    return parseRouteReportArchive(JSON.stringify(next));
}
export function replayRouteReportSnapshot(snapshot) {
    return {
        review: buildRouteWeekPlan(structuredClone(snapshot.reviewInput)),
        outlook: buildRouteWeekPlan(structuredClone(snapshot.outlookInput)),
    };
}
