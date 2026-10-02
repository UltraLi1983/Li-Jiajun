import type { TimelineEvent, TimelineValidationIssue } from "../domain/types.js";

export interface TimelineGap {
  stationId: string;
  startMinute: number;
  endMinute: number;
}

export function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    if (a.stationId !== b.stationId) return a.stationId.localeCompare(b.stationId);
    return a.startMinute - b.startMinute || a.endMinute - b.endMinute;
  });
}

export function validateTimelineEvents(events: TimelineEvent[], horizonMinutes = 1440): TimelineValidationIssue[] {
  const issues: TimelineValidationIssue[] = [];
  const byStation = groupByStation(sortTimelineEvents(events));

  for (const [stationId, stationEvents] of byStation) {
    for (let index = 0; index < stationEvents.length; index += 1) {
      const event = stationEvents[index];
      if (!event) continue;

      if (event.endMinute <= event.startMinute) {
        issues.push({
          severity: "error",
          code: "invalid_boundary",
          stationId,
          eventId: event.id,
          message: `${event.id} endMinute must be greater than startMinute`,
        });
      }

      if (event.startMinute < 0 || event.endMinute > horizonMinutes) {
        issues.push({
          severity: "error",
          code: "outside_horizon",
          stationId,
          eventId: event.id,
          message: `${event.id} is outside the configured timeline horizon`,
        });
      }

      const next = stationEvents[index + 1];
      if (!next) continue;
      if (event.endMinute > next.startMinute) {
        issues.push({
          severity: "error",
          code: "overlap",
          stationId,
          eventId: next.id,
          message: `${event.id} overlaps ${next.id}; one station can only have one state at a time`,
        });
      }
    }
  }

  return issues;
}

export function findTimelineGaps(events: TimelineEvent[], stationId: string, horizonMinutes = 1440): TimelineGap[] {
  const stationEvents = sortTimelineEvents(events.filter(event => event.stationId === stationId));
  const gaps: TimelineGap[] = [];
  let cursor = 0;

  for (const event of stationEvents) {
    if (event.startMinute > cursor) {
      gaps.push({ stationId, startMinute: cursor, endMinute: event.startMinute });
    }
    cursor = Math.max(cursor, event.endMinute);
  }

  if (cursor < horizonMinutes) {
    gaps.push({ stationId, startMinute: cursor, endMinute: horizonMinutes });
  }

  return gaps;
}

export function fillGapsAsUnscheduled(events: TimelineEvent[], stationId: string, horizonMinutes = 1440): TimelineEvent[] {
  const gaps = findTimelineGaps(events, stationId, horizonMinutes);
  const unscheduledEvents = gaps.map((gap, index): TimelineEvent => ({
    id: `${stationId}-unscheduled-${index + 1}`,
    stationId,
    kind: "unscheduled",
    startMinute: gap.startMinute,
    endMinute: gap.endMinute,
    source: "manual",
    label: "unscheduled / not planned",
  }));

  return sortTimelineEvents([...events, ...unscheduledEvents]);
}

function groupByStation(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const result = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const stationEvents = result.get(event.stationId) ?? [];
    stationEvents.push(event);
    result.set(event.stationId, stationEvents);
  }
  return result;
}
