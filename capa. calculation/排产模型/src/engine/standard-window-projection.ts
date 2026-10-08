import type { TimelineEvent } from "../domain/types.js";
import { isFrozenStandardWindowCurrent, type FrozenStandardWindow } from "./standard-window.js";
import type { StandardSaDayConfig } from "./standard-sa-day.js";
import { validateTimelineEvents } from "./timeline-engine.js";

const DAY_MINUTES = 1440;
const WEEK_MINUTES = 7 * DAY_MINUTES;

export type ProjectionIssueCode = "source_stale" | "invalid_source" | "invalid_week_date"
  | "no_repeat_date" | "invalid_repeat_date" | "duplicate_repeat_date" | "outside_week" | "repeat_overlap";

export interface ProjectionIssue {
  code: ProjectionIssueCode;
  date?: string;
}

export interface ProjectedStandardEvent extends TimelineEvent {
  origin: "sourceCopy";
  sourceWindowId: string;
  sourceWindowVersion: number;
  occurrenceDate: string;
  sourceEventId?: string;
}

export interface ProjectedDaySummary {
  date: string;
  scheduledMinutes: number;
  productionMinutes: number;
  plannedLossMinutes: number;
  unscheduledMinutes: number;
  bestCaseAvailableMinutes: number;
  bestCaseSa?: number;
}

export interface CopyStandardWindowInput {
  source: FrozenStandardWindow;
  currentSourceEvents: TimelineEvent[];
  currentDayConfig?: StandardSaDayConfig;
  weekStartDate: string;
  repeatDates: string[];
}

export interface CopyStandardWindowResult {
  mode: "copy";
  sourceWindowId: string;
  sourceWindowVersion: number;
  weekStartDate: string;
  weekStartMinuteOfDay: number;
  issues: ProjectionIssue[];
  events: ProjectedStandardEvent[];
  days: ProjectedDaySummary[];
}

export type FollowingWeekMode = "copy" | "off";

export interface ProjectedWeek {
  weekNumber: number;
  weekStartDate: string;
  mode: FollowingWeekMode | "source";
  events: ProjectedStandardEvent[];
  days: ProjectedDaySummary[];
}

export interface FourWeekProjectionResult {
  weeks: ProjectedWeek[];
  events: ProjectedStandardEvent[];
  days: ProjectedDaySummary[];
  scheduledMinutes: number;
  bestCaseAvailableMinutes: number;
}

export function expandWeekToFourWeeks(firstWeek: CopyStandardWindowResult, followingModes: readonly FollowingWeekMode[]): FourWeekProjectionResult {
  if (firstWeek.issues.length || firstWeek.days.length !== 7 || followingModes.length !== 3
    || followingModes.some(mode => mode !== "copy" && mode !== "off")) {
    throw new Error("A valid first week and three following week modes are required");
  }
  const weeks: ProjectedWeek[] = [{
    weekNumber: 1, weekStartDate: firstWeek.weekStartDate, mode: "source",
    events: firstWeek.events, days: firstWeek.days,
  }];
  for (let weekIndex = 1; weekIndex < 4; weekIndex += 1) {
    const mode = followingModes[weekIndex - 1]!;
    const offset = weekIndex * WEEK_MINUTES;
    const events = mode === "copy" ? firstWeek.events.map(event => ({
      ...event,
      id: `week${weekIndex + 1}:${event.id}`,
      startMinute: event.startMinute + offset,
      endMinute: event.endMinute + offset,
      occurrenceDate: formatDate(parseDate(event.occurrenceDate)! + weekIndex * 7 * 24 * 60 * 60 * 1000),
    })) : [];
    const days = Array.from({ length: 7 }, (_, day) => summarizeDay(events, firstWeek.weekStartDate, weekIndex * 7 + day, firstWeek.weekStartMinuteOfDay));
    weeks.push({ weekNumber: weekIndex + 1, weekStartDate: days[0]!.date, mode, events, days });
  }
  const events = weeks.flatMap(week => week.events);
  const days = weeks.flatMap(week => week.days);
  return {
    weeks, events, days,
    scheduledMinutes: days.reduce((total, day) => total + day.scheduledMinutes, 0),
    bestCaseAvailableMinutes: days.reduce((total, day) => total + day.bestCaseAvailableMinutes, 0),
  };
}

export function copyStandardWindowToWeek(input: CopyStandardWindowInput): CopyStandardWindowResult {
  const weekStartMinuteOfDay = input.source.dayConfig
    ? input.source.dayConfig.startMinute % DAY_MINUTES : 0;
  const result: CopyStandardWindowResult = {
    mode: "copy", sourceWindowId: input.source.sourceId, sourceWindowVersion: input.source.version,
    weekStartDate: input.weekStartDate, weekStartMinuteOfDay, issues: [], events: [], days: [],
  };
  const source = input.source;
  if (!isFrozenStandardWindowCurrent(source, input.currentSourceEvents, input.currentDayConfig)) result.issues.push({ code: "source_stale" });
  if (!source.events.length || source.endMinute <= source.startMinute || source.endMinute - source.startMinute > 48 * 60) {
    result.issues.push({ code: "invalid_source" });
  }
  const weekStart = parseDate(input.weekStartDate);
  if (weekStart === undefined) result.issues.push({ code: "invalid_week_date" });
  if (!input.repeatDates.length) result.issues.push({ code: "no_repeat_date" });
  if (new Set(input.repeatDates).size !== input.repeatDates.length) {
    result.issues.push({ code: "duplicate_repeat_date" });
  }
  if (result.issues.length || weekStart === undefined) return result;

  const sourceStartDay = Math.floor(source.startMinute / DAY_MINUTES);
  for (const date of [...input.repeatDates].sort()) {
    const targetDay = parseDate(date);
    if (targetDay === undefined) {
      result.issues.push({ code: "invalid_repeat_date", date });
      continue;
    }
    const dayOffset = (targetDay - weekStart) / (24 * 60 * 60 * 1000);
    if (dayOffset < 0 || dayOffset >= 7) {
      result.issues.push({ code: "outside_week", date });
      continue;
    }
    const shift = (dayOffset - sourceStartDay) * DAY_MINUTES;
    const start = source.startMinute + shift;
    const end = source.endMinute + shift;
    if (start < weekStartMinuteOfDay || end > weekStartMinuteOfDay + WEEK_MINUTES) {
      result.issues.push({ code: "outside_week", date });
      continue;
    }
    source.events.forEach(event => result.events.push({
      ...event,
      id: `copy:${source.sourceId}:v${source.version}:${date}:${event.id}`,
      startMinute: event.startMinute + shift,
      endMinute: event.endMinute + shift,
      origin: "sourceCopy",
      sourceWindowId: source.sourceId,
      sourceWindowVersion: source.version,
      occurrenceDate: date,
      sourceEventId: event.id,
    }));
  }
  if (result.issues.length) return { ...result, events: [] };
  result.events.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id.localeCompare(b.id));
  const normalized = result.events.map(event => ({
    ...event,
    startMinute: event.startMinute - weekStartMinuteOfDay,
    endMinute: event.endMinute - weekStartMinuteOfDay,
  }));
  if (validateTimelineEvents(normalized, WEEK_MINUTES).some(issue => issue.severity === "error")) {
    result.issues.push({ code: "repeat_overlap" });
    return { ...result, events: [] };
  }
  result.days = Array.from({ length: 7 }, (_, index) => summarizeDay(result.events, input.weekStartDate, index, weekStartMinuteOfDay));
  return result;
}

function summarizeDay(events: ProjectedStandardEvent[], weekStartDate: string, dayIndex: number, dayStartMinuteOfDay: number): ProjectedDaySummary {
  const dayStart = dayIndex * DAY_MINUTES + dayStartMinuteOfDay;
  const dayEnd = dayStart + DAY_MINUTES;
  const minutesByKind = new Map<string, number>();
  for (const event of events) {
    const minutes = Math.max(0, Math.min(event.endMinute, dayEnd) - Math.max(event.startMinute, dayStart));
    minutesByKind.set(event.kind, (minutesByKind.get(event.kind) ?? 0) + minutes);
  }
  const productionMinutes = minutesByKind.get("production") ?? 0;
  const plannedLossMinutes = ["setup", "break", "maintenance", "plannedStop"]
    .reduce((sum, kind) => sum + (minutesByKind.get(kind) ?? 0), 0);
  const unscheduledMinutes = minutesByKind.get("unscheduled") ?? 0;
  const scheduledMinutes = productionMinutes + plannedLossMinutes + unscheduledMinutes;
  return {
    date: formatDate(parseDate(weekStartDate)! + dayIndex * 24 * 60 * 60 * 1000),
    scheduledMinutes, productionMinutes, plannedLossMinutes, unscheduledMinutes,
    bestCaseAvailableMinutes: productionMinutes,
    ...(scheduledMinutes > 0 ? { bestCaseSa: productionMinutes / scheduledMinutes } : {}),
  };
}

function parseDate(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && formatDate(time) === value ? time : undefined;
}

function formatDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
