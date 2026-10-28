import type { TimelineEvent } from "../domain/types.js";
import type { StandardSaDayConfig } from "./standard-sa-day.js";
import type { FrozenStandardWindow } from "./standard-window.js";

export type StandardSaChange =
  | { kind: "config"; field: "startMinute" | "shiftMinutes" | "shiftsPerDay" | "dayCount"; before: number; after: number }
  | { kind: "event"; eventId: string; field: "added" | "removed" | "kind" | "startMinute" | "endMinute" | "other"; before?: string | number; after?: string | number };

export function diffFrozenStandardSa(
  frozen: FrozenStandardWindow,
  currentEvents: readonly TimelineEvent[],
  currentConfig: StandardSaDayConfig,
): StandardSaChange[] {
  const changes: StandardSaChange[] = [];
  for (const field of ["startMinute", "shiftMinutes", "shiftsPerDay", "dayCount"] as const) {
    const before = frozen.dayConfig?.[field];
    const after = currentConfig[field];
    if (before !== undefined && before !== after) changes.push({ kind: "config", field, before, after });
  }
  const previous = new Map(frozen.events.map(event => [event.id, event]));
  const current = new Map(currentEvents.map(event => [event.id, event]));
  for (const event of currentEvents) {
    const old = previous.get(event.id);
    if (!old) {
      changes.push({ kind: "event", eventId: event.id, field: "added" });
      continue;
    }
    for (const field of ["kind", "startMinute", "endMinute"] as const) {
      if (old[field] !== event[field]) changes.push({ kind: "event", eventId: event.id, field, before: old[field], after: event[field] });
    }
    if (["stationId", "source", "productId", "orderId", "changeoverKey"].some(field =>
      old[field as keyof TimelineEvent] !== event[field as keyof TimelineEvent])) {
      changes.push({ kind: "event", eventId: event.id, field: "other" });
    }
  }
  for (const event of frozen.events) {
    if (!current.has(event.id)) changes.push({ kind: "event", eventId: event.id, field: "removed" });
  }
  return changes;
}
