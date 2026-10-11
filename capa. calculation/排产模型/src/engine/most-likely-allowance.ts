import type { DayLedgerRow, WeekRatioSummary } from "./week-minute-ledger.js";
import { summarizeLedger } from "./week-minute-ledger.js";

const ABNORMAL_KINDS = new Set(["equipmentFailure", "toolingIssue", "logisticsWaiting", "qualityHold", "laborIssue"]);

export interface ObservedActualInterval {
  stationId: string;
  kind: string;
  startMinute: number;
  endMinute: number;
  evidenceSource?: string;
  isEstimated?: boolean;
  recoverableMinutes?: number;
}

export interface AllowanceSource {
  category: string;
  stationId: string;
  shiftNumbers: number[];
  minutes: number;
  recoverableMinutes: number;
  planningMinutes: number;
  source: string;
  estimated: boolean;
}

export interface ShiftAllowance {
  perShiftMinutes: number;
  observedUnplannedMinutes: number;
  recoverableMinutes: number;
  planningUnplannedMinutes: number;
  observedShiftCount: number;
  sources: AllowanceSource[];
}

export function observeShiftAllowance(input: {
  stationId: string;
  shifts: Array<{ startMinute: number; endMinute: number }>;
  actual: ObservedActualInterval[];
}): ShiftAllowance | undefined {
  const actual = input.actual.filter(event => event.stationId === input.stationId && event.endMinute > event.startMinute);
  const observed = input.shifts.flatMap((shift, index) =>
    actual.some(event => overlaps(event, shift)) ? [{ shift, number: index + 1 }] : []);
  if (!observed.length) return undefined;
  const sources = actual.flatMap(event => {
    if (!ABNORMAL_KINDS.has(event.kind)) return [];
    const shiftNumbers = observed.flatMap(item => overlaps(event, item.shift) ? [item.number] : []);
    const minutes = observed.reduce((sum, item) => sum + overlapMinutes(event, item.shift), 0);
    if (!shiftNumbers.length || minutes <= 0) return [];
    const recoverableMinutes = Math.min(minutes, Math.max(0, event.recoverableMinutes ?? 0));
    return [{
      category: event.kind,
      stationId: input.stationId,
      shiftNumbers,
      minutes,
      recoverableMinutes,
      planningMinutes: minutes - recoverableMinutes,
      source: event.evidenceSource?.trim() || "",
      estimated: Boolean(event.isEstimated),
    }];
  });
  const observedUnplannedMinutes = sources.reduce((sum, source) => sum + source.minutes, 0);
  const recoverableMinutes = sources.reduce((sum, source) => sum + source.recoverableMinutes, 0);
  const planningUnplannedMinutes = observedUnplannedMinutes - recoverableMinutes;
  return {
    perShiftMinutes: planningUnplannedMinutes / observed.length,
    observedUnplannedMinutes,
    recoverableMinutes,
    planningUnplannedMinutes,
    observedShiftCount: observed.length,
    sources,
  };
}

export function ledgerShiftCount(day: DayLedgerRow, manualShifts: number, sourceShifts: number): number {
  if (!day.workingDay || day.stale || day.mode === "occupied") return 0;
  if (day.origin === "manualMinutes") return manualShifts;
  if (day.origin === "sourceCopy") return sourceShifts;
  return 0;
}

export function summarizeMostLikely(days: DayLedgerRow[], shiftCounts: number[], perShiftMinutes: number, weekCount?: number): WeekRatioSummary {
  const adjusted = days.map((day, index) => {
    const deducted = Math.max(0, perShiftMinutes) * Math.max(0, shiftCounts[index] ?? 0);
    const production = day.workingDay && !day.stale ? Math.max(0, day.productionMinutes - deducted) : day.productionMinutes;
    return { ...day, productionMinutes: production, bestCaseAvailableMinutes: production };
  });
  return summarizeLedger(adjusted, weekCount);
}

export function mostLikelyMonthProduction(weekProduction: number, weekCount: number, setupAllowanceMinutes: number): number {
  return Math.max(0, weekProduction * weekCount - Math.max(0, setupAllowanceMinutes));
}

function overlaps(event: { startMinute: number; endMinute: number }, shift: { startMinute: number; endMinute: number }): boolean {
  return event.endMinute > shift.startMinute && event.startMinute < shift.endMinute;
}

function overlapMinutes(event: { startMinute: number; endMinute: number }, shift: { startMinute: number; endMinute: number }): number {
  return Math.max(0, Math.min(event.endMinute, shift.endMinute) - Math.max(event.startMinute, shift.startMinute));
}
