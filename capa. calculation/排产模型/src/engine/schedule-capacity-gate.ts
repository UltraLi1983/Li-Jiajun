import { buildFutureScheduleTimeline, type FutureScheduleInput, type ScheduledTask } from "./future-schedule-timeline.js";

export interface TaskCapacityBasis {
  taskId: string;
  stationId: string;
  productId: string;
  startMinute: number;
  endMinute: number;
  parameterVersion: string;
  bestCasePieces: number;
  mostLikelyPieces: number;
}

export interface ScheduleRiskApproval {
  approvalId: string;
  taskId: string;
  routeId: string;
  stationId: string;
  productId: string;
  windowStartAt: string;
  scheduleFingerprint: string;
  planVersion: string;
  parameterVersion: string;
  targetPieces: number;
  bestCasePieces: number;
  mostLikelyPieces: number;
  startMinute: number;
  endMinute: number;
  approvedBy: string;
  approvedAt: string;
  reason: string;
  revokedAt?: string;
}

export interface ScheduleCapacityGateInput {
  schedule: FutureScheduleInput;
  routeId: string;
  planVersion: string;
  capacityBases: TaskCapacityBasis[];
  approvals?: ScheduleRiskApproval[];
}

export interface TaskCapacityDecision {
  taskId: string;
  targetPieces: number;
  status: "pass" | "needsReview" | "approvedRisk" | "rejected" | "missingBasis";
  bestCasePieces?: number;
  mostLikelyPieces?: number;
  differencePieces?: number;
  approvalId?: string;
  reason: string;
}

export interface ScheduleCapacityGateResult {
  status: "pass" | "needsReview" | "approvedRisk" | "rejected" | "incomplete" | "conflict";
  capacityReady: boolean;
  decisions: TaskCapacityDecision[];
  issues: string[];
}

function basisMatches(task: ScheduledTask, stationId: string, basis: TaskCapacityBasis): boolean {
  return basis.taskId === task.id && basis.stationId === stationId && basis.productId === task.productId
    && basis.startMinute === task.startMinute && basis.endMinute === task.endMinute
    && Boolean(basis.parameterVersion) && Number.isSafeInteger(basis.bestCasePieces)
    && Number.isSafeInteger(basis.mostLikelyPieces) && basis.bestCasePieces >= 0
    && basis.mostLikelyPieces >= 0 && basis.mostLikelyPieces <= basis.bestCasePieces;
}

export function scheduleApprovalFingerprint(schedule: FutureScheduleInput): string {
  return JSON.stringify({ stationId: schedule.stationId, windowStartAt: schedule.windowStartAt,
    horizonMinutes: schedule.horizonMinutes,
    shifts: schedule.shifts.map(item => [item.id, item.startMinute, item.endMinute]),
    tasks: schedule.tasks.map(item => [item.id, item.productId, item.targetPieces, item.startMinute, item.endMinute, item.orderId ?? ""]),
    dailyBreaks: schedule.dailyBreaks.map(item => [item.id, item.startMinuteOfDay, item.endMinuteOfDay]),
    datedEvents: schedule.datedEvents.map(item => [item.id, item.kind, item.startMinute, item.endMinute]) });
}

function validApproval(approval: ScheduleRiskApproval, task: ScheduledTask, input: ScheduleCapacityGateInput, basis: TaskCapacityBasis): boolean {
  return Boolean(approval.approvalId) && !approval.revokedAt
    && approval.taskId === task.id && approval.routeId === input.routeId
    && approval.stationId === input.schedule.stationId && approval.productId === task.productId
    && approval.windowStartAt === input.schedule.windowStartAt && approval.planVersion === input.planVersion
    && approval.scheduleFingerprint === scheduleApprovalFingerprint(input.schedule)
    && approval.parameterVersion === basis.parameterVersion && approval.targetPieces === task.targetPieces
    && approval.bestCasePieces === basis.bestCasePieces && approval.mostLikelyPieces === basis.mostLikelyPieces
    && approval.startMinute === task.startMinute && approval.endMinute === task.endMinute
    && Boolean(approval.approvedBy.trim()) && Boolean(approval.reason.trim())
    && /T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(approval.approvedAt)
    && Number.isFinite(Date.parse(approval.approvedAt));
}

export function evaluateScheduleCapacityGate(input: ScheduleCapacityGateInput): ScheduleCapacityGateResult {
  const timeline = buildFutureScheduleTimeline(input.schedule);
  if (timeline.status === "conflict" || !input.planVersion || !input.routeId) {
    return { status: "conflict", capacityReady: false, decisions: [],
      issues: [...timeline.issues, ...(!input.planVersion ? ["plan version is required"] : []),
        ...(!input.routeId ? ["route id is required"] : [])] };
  }
  const decisions = input.schedule.tasks.map(task => {
    const candidates = input.capacityBases.filter(basis => basis.taskId === task.id);
    const basis = candidates[0];
    if (candidates.length !== 1 || !basis || !basisMatches(task, input.schedule.stationId, basis)) {
      return { taskId: task.id, targetPieces: task.targetPieces, status: "missingBasis" as const,
        reason: "matching station, product, interval and valid capacity version required" };
    }
    if (task.targetPieces > basis.bestCasePieces) {
      return { taskId: task.id, targetPieces: task.targetPieces, status: "rejected" as const,
        bestCasePieces: basis.bestCasePieces, mostLikelyPieces: basis.mostLikelyPieces,
        differencePieces: task.targetPieces - basis.bestCasePieces, reason: "target exceeds Best case" };
    }
    if (task.targetPieces > basis.mostLikelyPieces) {
      const approved = (input.approvals ?? []).find(approval => validApproval(approval, task, input, basis));
      return { taskId: task.id, targetPieces: task.targetPieces, status: approved ? "approvedRisk" as const : "needsReview" as const,
        bestCasePieces: basis.bestCasePieces, mostLikelyPieces: basis.mostLikelyPieces,
        ...(approved ? { approvalId: approved.approvalId } : {}),
        differencePieces: task.targetPieces - basis.mostLikelyPieces,
        reason: approved ? "risk approved for this task and parameter version" : "target exceeds Most likely; human review required" };
    }
    return { taskId: task.id, targetPieces: task.targetPieces, status: "pass" as const,
      bestCasePieces: basis.bestCasePieces, mostLikelyPieces: basis.mostLikelyPieces,
      reason: "target within Most likely" };
  });
  const statuses = decisions.map(item => item.status);
  const status = statuses.includes("rejected") ? "rejected"
    : statuses.includes("missingBasis") || timeline.status === "incomplete" || decisions.length === 0 ? "incomplete"
      : statuses.includes("needsReview") ? "needsReview"
        : statuses.includes("approvedRisk") ? "approvedRisk" : "pass";
  return { status, capacityReady: status === "pass" || status === "approvedRisk", decisions,
    issues: [...timeline.issues, ...(timeline.unassignedMinutes ? [`${timeline.unassignedMinutes} scheduled minutes have no task`] : []),
      ...(decisions.length === 0 ? ["no production tasks to evaluate"] : [])] };
}
