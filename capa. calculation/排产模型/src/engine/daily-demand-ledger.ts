export interface DailyDemandEntry {
  recordId: string;
  productId: string;
  productVersion: string;
  dueDate: string;
  quantity: number;
  sourceId: string;
  revision: number;
}

export interface WeeklyDemandLedgerInput {
  productId: string;
  productVersion: string;
  weekStartDate: string;
  entries: DailyDemandEntry[];
  legacyWeeklyDemand?: number;
}

export interface WeeklyDemandLedgerResult {
  status: "complete" | "incomplete" | "conflict" | "legacy";
  source: "daily" | "legacy" | "none";
  quantity?: number;
  missingDates: string[];
  issues: string[];
  recordIds: string[];
}

function parseDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}

function dateAt(start: Date, offset: number): string {
  return new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}

export function resolveDailyDemandWeek(input: WeeklyDemandLedgerInput): WeeklyDemandLedgerResult {
  const start = parseDate(input.weekStartDate);
  if (!start || start.getUTCDay() !== 1) {
    return { status: "conflict", source: "none", missingDates: [], issues: ["weekStartDate must be a valid Monday"], recordIds: [] };
  }
  const dates = Array.from({ length: 7 }, (_, day) => dateAt(start, day));
  const matching = input.entries.filter(entry => entry.productId === input.productId && entry.productVersion === input.productVersion && dates.includes(entry.dueDate));
  if (matching.length === 0) {
    const legacy = input.legacyWeeklyDemand;
    if (legacy !== undefined && Number.isSafeInteger(legacy) && legacy >= 0) {
      return { status: "legacy", source: "legacy", quantity: legacy, missingDates: dates, issues: [], recordIds: [] };
    }
    return { status: "incomplete", source: "none", missingDates: dates, issues: [], recordIds: [] };
  }

  const issues: string[] = [];
  const byDate = new Map<string, DailyDemandEntry[]>();
  for (const entry of matching) {
    if (!entry.recordId || !entry.sourceId || !Number.isSafeInteger(entry.revision) || entry.revision < 1 || !Number.isSafeInteger(entry.quantity) || entry.quantity < 0) {
      issues.push(`invalid daily demand entry for ${entry.dueDate}: ${entry.recordId || "missing recordId"}`);
      continue;
    }
    const entries = byDate.get(entry.dueDate) ?? [];
    entries.push(entry);
    byDate.set(entry.dueDate, entries);
  }

  const active: DailyDemandEntry[] = [];
  for (const [date, entries] of byDate) {
    const latestRevision = Math.max(...entries.map(entry => entry.revision));
    const latest = entries.filter(entry => entry.revision === latestRevision);
    const current = latest[0];
    if (!current || latest.length !== 1 || entries.some(entry => entry.recordId !== current.recordId)) {
      issues.push(`conflicting daily demand revisions for ${date}`);
      continue;
    }
    active.push(current);
  }
  const missingDates = dates.filter(date => !active.some(entry => entry.dueDate === date));
  if (issues.length) return { status: "conflict", source: "daily", missingDates, issues, recordIds: active.map(entry => entry.recordId) };
  if (missingDates.length) return { status: "incomplete", source: "daily", missingDates, issues: [], recordIds: active.map(entry => entry.recordId) };
  return {
    status: "complete", source: "daily", quantity: active.reduce((sum, entry) => sum + entry.quantity, 0),
    missingDates: [], issues: [], recordIds: active.map(entry => entry.recordId),
  };
}
