import type { TimelineEvent } from "../domain/types.js";
import { freezeStandardWindow, legacyStandardWindowFingerprint, standardWindowFingerprint, type FrozenStandardWindow } from "../engine/standard-window.js";
import type { StandardSaDayConfig } from "../engine/standard-sa-day.js";
import type { DayLedgerRow } from "../engine/week-minute-ledger.js";

export interface StoredStationWeek {
  days: DayLedgerRow[];
  shiftCounts: number[];
  perShiftUnplanned: number;
  withBreaksSa?: number;
  mostLikelySa?: number;
  sourceVersion?: number;
  sourceSignature?: string;
}

export interface StandardSaLocalState {
  version: 1;
  plans: Record<string, { events: TimelineEvent[]; areDefault: boolean }>;
  configs: Record<string, StandardSaDayConfig>;
  frozen: Record<string, FrozenStandardWindow>;
  weeks: Record<string, StoredStationWeek>;
}

export function weekMatchesStandardSaSource(week: StoredStationWeek | undefined, signature: string | undefined): week is StoredStationWeek {
  return Boolean(week?.sourceSignature && signature && week.sourceSignature === signature);
}

export function emptyStandardSaLocalState(): StandardSaLocalState {
  return { version: 1, plans: {}, configs: {}, frozen: {}, weeks: {} };
}

export function parseStandardSaLocalState(raw: string): StandardSaLocalState {
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1 || !record(value.plans)
    || !record(value.configs) || !record(value.frozen) || !record(value.weeks)) throw new Error("Invalid SA state");
  const result = emptyStandardSaLocalState();
  for (const [key, config] of Object.entries(value.configs)) {
    if (!record(config) || !Number.isFinite(config.startMinute)
      || ![1, 2].includes(config.dayCount as number)
      || ![480, 720].includes(config.shiftMinutes as number)
      || !Number.isInteger(config.shiftsPerDay) || (config.shiftsPerDay as number) < 1) continue;
    result.configs[key] = config as unknown as StandardSaDayConfig;
  }
  for (const [key, plan] of Object.entries(value.plans)) {
    if (!record(plan) || typeof plan.areDefault !== "boolean" || !Array.isArray(plan.events)
      || !plan.events.every(event => record(event) && typeof event.id === "string"
        && typeof event.stationId === "string" && typeof event.kind === "string"
        && Number.isFinite(event.startMinute) && Number.isFinite(event.endMinute))) continue;
    result.plans[key] = plan as unknown as StandardSaLocalState["plans"][string];
  }
  for (const [key, frozen] of Object.entries(value.frozen)) {
    if (!record(frozen) || frozen.sourceId !== key || typeof frozen.stationId !== "string"
      || typeof frozen.baseDate !== "string" || !Number.isInteger(frozen.version)
      || (frozen.version as number) < 1 || !Array.isArray(frozen.events)) continue;
    const check = freezeStandardWindow({
      sourceId: key, stationId: frozen.stationId, baseDate: frozen.baseDate,
      version: frozen.version as number, events: frozen.events,
      ...(result.configs[key] && frozen.dayConfig ? { dayConfig: frozen.dayConfig as StandardSaDayConfig } : {}),
    });
    if (check.snapshot && (check.snapshot.fingerprint === frozen.fingerprint
      || legacyStandardWindowFingerprint(frozen.events as TimelineEvent[]) === frozen.fingerprint)
      && check.snapshot.startMinute === frozen.startMinute && check.snapshot.endMinute === frozen.endMinute) {
      result.frozen[key] = check.snapshot;
    }
  }
  for (const [key, week] of Object.entries(value.weeks)) {
    if (!record(week) || !Array.isArray(week.days) || week.days.length !== 7
      || !week.days.every(day => record(day) && typeof day.date === "string"
        && typeof day.stale === "boolean" && Number.isFinite(day.bestCaseAvailableMinutes))
      || !Array.isArray(week.shiftCounts) || !Number.isFinite(week.perShiftUnplanned)) continue;
    const restored = { ...week } as unknown as StoredStationWeek;
    const planKey = key.slice(0, key.lastIndexOf("::"));
    const plan = result.plans[planKey];
    const config = result.configs[planKey];
    const configPrefix = config ? `${JSON.stringify(config)}::` : "";
    if (plan && configPrefix && restored.sourceSignature?.startsWith(configPrefix)) {
      try {
        const signedEvents: unknown = JSON.parse(restored.sourceSignature.slice(configPrefix.length));
        if (Array.isArray(signedEvents) && signedEvents.every(record)) {
          const signedPlan = signedEvents.map(({ label: _label, note: _note, ...event }) => event);
          if (JSON.stringify(signedPlan) === standardWindowFingerprint(plan.events)) {
            restored.sourceSignature = `${configPrefix}${standardWindowFingerprint(plan.events)}`;
          }
        }
      } catch { /* Leave a malformed or unrelated signature stale. */ }
    }
    result.weeks[key] = restored;
  }
  return result;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
