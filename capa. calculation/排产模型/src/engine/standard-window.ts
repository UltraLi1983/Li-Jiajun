import type { TimelineEvent } from "../domain/types.js";
import { findTimelineGaps, sortTimelineEvents, validateTimelineEvents } from "./timeline-engine.js";
import { validateStandardSaDay, type StandardSaDayConfig } from "./standard-sa-day.js";

export type StandardWindowIssue = "empty" | "mixed_station" | "duplicate_id" | "invalid_kind"
  | "invalid_boundary" | "outside_horizon" | "overlap" | "gap" | "invalid_schedule" | "outside_shift";

export interface FrozenStandardWindow {
  sourceId: string;
  version: number;
  stationId: string;
  baseDate: string;
  startMinute: number;
  endMinute: number;
  fingerprint: string;
  events: TimelineEvent[];
  dayConfig?: StandardSaDayConfig;
}

export interface StandardWindowFreezeInput {
  sourceId: string;
  version: number;
  stationId: string;
  baseDate: string;
  events: TimelineEvent[];
  dayConfig?: StandardSaDayConfig;
}

export function standardWindowFingerprint(events: TimelineEvent[]): string {
  return JSON.stringify(sortTimelineEvents(events).map(event => ({
    id: event.id,
    stationId: event.stationId,
    kind: event.kind,
    startMinute: event.startMinute,
    endMinute: event.endMinute,
    source: event.source,
    productId: event.productId ?? null,
    orderId: event.orderId ?? null,
    changeoverKey: event.changeoverKey ?? null,
    label: event.label ?? null,
    note: event.note ?? null,
  })));
}

export function isFrozenStandardWindowCurrent(snapshot: FrozenStandardWindow, events: TimelineEvent[], dayConfig?: StandardSaDayConfig): boolean {
  return snapshot.fingerprint === standardWindowFingerprint(events)
    && JSON.stringify(snapshot.dayConfig) === JSON.stringify(dayConfig);
}

export function freezeStandardWindow(input: StandardWindowFreezeInput): {
  snapshot?: FrozenStandardWindow;
  issues: StandardWindowIssue[];
} {
  const { events, stationId } = input;
  const issues: StandardWindowIssue[] = [];
  if (!events.length) issues.push("empty");
  if (events.some(event => event.stationId !== stationId)) issues.push("mixed_station");
  if (new Set(events.map(event => event.id)).size !== events.length) issues.push("duplicate_id");
  if (events.some(event => !["production", "setup", "break", "maintenance", "plannedStop", "unscheduled"].includes(event.kind))) {
    issues.push("invalid_kind");
  }
  if (issues.length) return { issues };

  const startMinute = input.dayConfig?.startMinute ?? Math.min(...events.map(event => event.startMinute));
  const endMinute = input.dayConfig ? startMinute + input.dayConfig.dayCount * 1440 : Math.max(...events.map(event => event.endMinute));
  const duration = endMinute - startMinute;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 48 * 60) issues.push("outside_horizon");
  const normalized = events.map(event => ({
    ...event,
    startMinute: event.startMinute - startMinute,
    endMinute: event.endMinute - startMinute,
  }));
  for (const issue of validateTimelineEvents(normalized, 48 * 60)) {
    if (!issues.includes(issue.code)) issues.push(issue.code);
  }
  if (input.dayConfig) {
    for (const issue of validateStandardSaDay(events, input.dayConfig)) {
      const mapped: StandardWindowIssue = issue === "invalid_config" ? "invalid_schedule"
        : issue === "outside_shift" ? "outside_shift" : issue;
      if (!issues.includes(mapped)) issues.push(mapped);
    }
  } else if (duration > 0 && duration <= 48 * 60 && findTimelineGaps(normalized, stationId, duration).length) issues.push("gap");
  if (issues.length) return { issues };

  const copiedEvents = sortTimelineEvents(events).map(event => ({ ...event }));
  return {
    issues: [],
    snapshot: {
      sourceId: input.sourceId,
      version: input.version,
      stationId,
      baseDate: input.baseDate,
      startMinute,
      endMinute,
      fingerprint: standardWindowFingerprint(copiedEvents),
      events: copiedEvents,
      ...(input.dayConfig ? { dayConfig: { ...input.dayConfig } } : {}),
    },
  };
}
