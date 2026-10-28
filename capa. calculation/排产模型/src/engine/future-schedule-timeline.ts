import { intervalCoveredByShifts } from "./standard-sa-day.js";

export interface ScheduleInterval {
  id: string;
  startMinute: number;
  endMinute: number;
}

export interface ScheduledTask extends ScheduleInterval {
  productId: string;
  targetPieces: number;
  orderId?: string;
}

export interface RecurringBreak {
  id: string;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
}

export interface DatedScheduleEvent extends ScheduleInterval {
  kind: "setup" | "maintenance" | "plannedStop";
}

export interface FutureScheduleInput {
  stationId: string;
  windowStartAt: string;
  horizonMinutes: number;
  shifts: ScheduleInterval[];
  tasks: ScheduledTask[];
  dailyBreaks: RecurringBreak[];
  datedEvents: DatedScheduleEvent[];
}

export interface FutureScheduleSegment extends ScheduleInterval {
  stationId: string;
  kind: "production" | "break" | "setup" | "maintenance" | "plannedStop" | "unassigned";
  startAt: string;
  endAt: string;
  sourceId?: string;
  productId?: string;
  orderId?: string;
}

export interface FutureScheduleResult {
  status: "complete" | "incomplete" | "conflict";
  segments: FutureScheduleSegment[];
  unassignedMinutes: number;
  productionMinutes?: number;
  issues: string[];
}

function validInterval(interval: ScheduleInterval, horizon: number): boolean {
  return Boolean(interval.id) && Number.isSafeInteger(interval.startMinute) && Number.isSafeInteger(interval.endMinute)
    && interval.startMinute >= 0 && interval.endMinute > interval.startMinute && interval.endMinute <= horizon;
}

function overlaps(left: ScheduleInterval, right: ScheduleInterval): boolean {
  return left.startMinute < right.endMinute && right.startMinute < left.endMinute;
}

function overlappingPair(items: ScheduleInterval[]): string | undefined {
  const ordered = [...items].sort((left, right) => left.startMinute - right.startMinute);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous && current && overlaps(previous, current)) return `${previous.id} / ${current.id}`;
  }
  return undefined;
}

export function buildFutureScheduleTimeline(input: FutureScheduleInput): FutureScheduleResult {
  const start = Date.parse(input.windowStartAt);
  const issues: string[] = [];
  if (!input.stationId || !/T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.windowStartAt)
    || !Number.isFinite(start) || start % 60_000 !== 0
    || !Number.isSafeInteger(input.horizonMinutes) || input.horizonMinutes < 1 || input.horizonMinutes > 10_080) {
    issues.push("invalid schedule window or station");
  }
  const horizon = input.horizonMinutes;
  for (const [name, items] of [["shift", input.shifts], ["task", input.tasks], ["dated event", input.datedEvents]] as const) {
    if (items.some(item => !validInterval(item, horizon))) issues.push(`invalid ${name} interval`);
    const pair = overlappingPair(items);
    if (pair) issues.push(`overlapping ${name} intervals: ${pair}`);
  }
  if (input.tasks.some(task => !task.productId)) issues.push("task productId is required");
  if (input.tasks.some(task => !Number.isSafeInteger(task.targetPieces) || task.targetPieces < 1)) issues.push("task targetPieces must be a positive integer");
  if (input.dailyBreaks.some(item => !item.id || !Number.isSafeInteger(item.startMinuteOfDay)
    || !Number.isSafeInteger(item.endMinuteOfDay) || item.startMinuteOfDay < 0
    || item.endMinuteOfDay > 1440 || item.endMinuteOfDay <= item.startMinuteOfDay)) issues.push("invalid recurring break");
  if (new Set([...input.shifts, ...input.tasks, ...input.dailyBreaks, ...input.datedEvents].map(item => item.id)).size
    !== input.shifts.length + input.tasks.length + input.dailyBreaks.length + input.datedEvents.length) issues.push("duplicate schedule source id");
  if (issues.length) return { status: "conflict", segments: [], unassignedMinutes: 0, issues };
  if (input.shifts.length === 0) return { status: "incomplete", segments: [], unassignedMinutes: 0, issues: ["no scheduled shifts"] };

  const breaks: ScheduleInterval[] = [];
  for (let day = 0; day * 1440 < horizon; day += 1) {
    for (const rule of input.dailyBreaks) {
      const startMinute = day * 1440 + rule.startMinuteOfDay;
      const endMinute = Math.min(horizon, day * 1440 + rule.endMinuteOfDay);
      if (startMinute < endMinute) breaks.push({ id: `${rule.id}:${day}`, startMinute, endMinute });
    }
  }
  const lossEvents: ScheduleInterval[] = [...breaks, ...input.datedEvents];
  const lossPair = overlappingPair(lossEvents);
  if (lossPair) issues.push(`overlapping planned losses: ${lossPair}`);
  if (input.datedEvents.some(event => !intervalCoveredByShifts(event.startMinute, event.endMinute, input.shifts))) {
    issues.push("dated event outside scheduled shifts");
  }
  if (input.tasks.some(task => !intervalCoveredByShifts(task.startMinute, task.endMinute, input.shifts))) {
    issues.push("task outside scheduled shifts");
  }
  if (issues.length) return { status: "conflict", segments: [], unassignedMinutes: 0, issues };

  const points = new Set<number>([0, horizon]);
  for (const item of [...input.shifts, ...input.tasks, ...lossEvents]) {
    points.add(item.startMinute);
    points.add(item.endMinute);
  }
  const sorted = [...points].sort((left, right) => left - right);
  const pieces: Array<Omit<FutureScheduleSegment, "startAt" | "endAt">> = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const startMinute = sorted[index - 1];
    const endMinute = sorted[index];
    if (startMinute === undefined || endMinute === undefined || startMinute === endMinute) continue;
    if (!input.shifts.some(shift => shift.startMinute <= startMinute && shift.endMinute >= endMinute)) continue;
    const dated = input.datedEvents.find(event => event.startMinute <= startMinute && event.endMinute >= endMinute);
    const rest = breaks.find(item => item.startMinute <= startMinute && item.endMinute >= endMinute);
    const task = input.tasks.find(item => item.startMinute <= startMinute && item.endMinute >= endMinute);
    const kind = dated?.kind ?? (rest ? "break" : task ? "production" : "unassigned");
    const sourceId = dated?.id ?? rest?.id ?? task?.id;
    const prior = pieces.at(-1);
    if (prior && prior.endMinute === startMinute && prior.kind === kind && prior.sourceId === sourceId) {
      prior.endMinute = endMinute;
      continue;
    }
    pieces.push({ id: `${input.stationId}:${startMinute}`, stationId: input.stationId, startMinute, endMinute, kind,
      ...(sourceId ? { sourceId } : {}),
      ...(kind === "production" && task ? { productId: task.productId, ...(task.orderId ? { orderId: task.orderId } : {}) } : {}) });
  }
  const segments = pieces.map(piece => ({ ...piece,
    startAt: new Date(start + piece.startMinute * 60_000).toISOString(),
    endAt: new Date(start + piece.endMinute * 60_000).toISOString(),
  }));
  const unassignedMinutes = segments.filter(item => item.kind === "unassigned")
    .reduce((sum, item) => sum + item.endMinute - item.startMinute, 0);
  return { status: unassignedMinutes ? "incomplete" : "complete", segments, unassignedMinutes,
    ...(unassignedMinutes ? {} : { productionMinutes: segments.filter(item => item.kind === "production")
      .reduce((sum, item) => sum + item.endMinute - item.startMinute, 0) }), issues: [] };
}

