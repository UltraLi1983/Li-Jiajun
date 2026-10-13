export interface CycleSample {
  id: string;
  seconds: number;
  nok?: boolean;
  lineStop?: boolean;
  reason?: string;
}

export interface CycleSampleDraft {
  samples: CycleSample[];
  targetSamples: number;
  acceptableSlowDeviationPercent?: number;
  legacyUnparsed?: string;
  legacyIssues?: string[];
}

export interface CycleSampleSummary {
  orderedSeconds: number[];
  validCount: number;
  recordedCount: number;
  excludedCount: number;
  targetSamples: number;
  observedMeanSec?: number;
  slowerSampleIds: string[];
  lineStopCount: number;
  lineStopSeconds: number;
  nokCount: number;
  status: "empty" | "below-target" | "verified";
  legacyUnparsed?: string;
  legacyIssues: string[];
}

export interface CycleSampleMutation {
  draft: CycleSampleDraft;
  error?: "invalid";
}

export interface PlannedCycleDiagnosis {
  hasPlannedCycle: boolean;
  plannedCycleSec?: number;
  observedMeanSec?: number;
  deltaSec?: number;
  fasterThanPlanned: boolean;
  verified: boolean;
}

let sampleSequence = 0;

export function createCycleSampleId(now = Date.now()): string {
  sampleSequence += 1;
  return `cycle-${now}-${sampleSequence}`;
}

export function emptyCycleSampleDraft(targetSamples = 20): CycleSampleDraft {
  return { samples: [], targetSamples };
}

export function parsePositiveSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return undefined;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds;
}

/** Phone/Excel entry: 337 means 00:03.37. At least 10000 carries whole minutes. */
export function parseStopwatchCode(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const code = Number(trimmed);
  if (!Number.isSafeInteger(code) || code <= 0) return undefined;
  if (code >= 10000) {
    const hundredths = code % 10000;
    if (hundredths >= 6000) return undefined;
    return Math.floor(code / 10000) * 60 + hundredths / 100;
  }
  return code / 100;
}

export function stopwatchCode(seconds: number): number {
  const minutes = Math.floor(seconds / 60);
  const hundredths = Math.round((seconds - minutes * 60) * 100);
  return minutes * 10000 + hundredths;
}

export function formatStopwatch(seconds: number): string {
  const digits = String(stopwatchCode(seconds)).padStart(6, "0");
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}.${digits.slice(4, 6)}`;
}

export function addCycleSample(draft: CycleSampleDraft, raw: string, id = createCycleSampleId()): CycleSampleMutation {
  const seconds = parseStopwatchCode(raw);
  if (seconds === undefined) return { draft, error: "invalid" };
  return { draft: { ...draft, samples: [...draft.samples, { id, seconds }] } };
}

export function replaceCycleSample(draft: CycleSampleDraft, id: string, raw: string): CycleSampleMutation {
  const seconds = parseStopwatchCode(raw);
  if (seconds === undefined || !draft.samples.some(sample => sample.id === id)) return { draft, error: "invalid" };
  return {
    draft: {
      ...draft,
      samples: draft.samples.map(sample => sample.id === id ? { ...sample, seconds } : sample),
    },
  };
}

export function setCycleSampleMark(
  draft: CycleSampleDraft, id: string, mark: "nok" | "lineStop", value: boolean,
): CycleSampleDraft {
  return {
    ...draft,
    samples: draft.samples.map(sample => {
      if (sample.id !== id) return sample;
      const next: CycleSample = { id: sample.id, seconds: sample.seconds };
      if (sample.reason) next.reason = sample.reason;
      const nok = mark === "nok" ? value : sample.nok === true;
      const lineStop = mark === "lineStop" ? value : sample.lineStop === true;
      if (nok) next.nok = true;
      if (lineStop) next.lineStop = true;
      return next;
    }),
  };
}

export function setCycleSampleReason(draft: CycleSampleDraft, id: string, reason: string): CycleSampleDraft {
  const trimmed = reason.trim();
  return {
    ...draft,
    samples: draft.samples.map(sample => {
      if (sample.id !== id) return sample;
      const next: CycleSample = { id: sample.id, seconds: sample.seconds };
      if (sample.nok) next.nok = true;
      if (sample.lineStop) next.lineStop = true;
      if (trimmed) next.reason = trimmed;
      return next;
    }),
  };
}

export function removeCycleSample(draft: CycleSampleDraft, id: string): CycleSampleDraft {
  return { ...draft, samples: draft.samples.filter(sample => sample.id !== id) };
}

export function setTargetSampleCount(draft: CycleSampleDraft, raw: string): CycleSampleMutation {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return { draft, error: "invalid" };
  const targetSamples = Number(trimmed);
  if (!Number.isSafeInteger(targetSamples) || targetSamples < 1) return { draft, error: "invalid" };
  return { draft: { ...draft, targetSamples } };
}

export function summarizeCycleSamples(draft: CycleSampleDraft): CycleSampleSummary {
  const recorded = draft.samples.filter(sample => Number.isFinite(sample.seconds) && sample.seconds > 0);
  const timing = recorded.filter(sample => sample.lineStop !== true);
  const orderedSeconds = timing.map(sample => sample.seconds);
  const validCount = orderedSeconds.length;
  const observedMeanSec = validCount
    ? orderedSeconds.reduce((sum, seconds) => sum + seconds, 0) / validCount
    : undefined;
  const slowerSampleIds = observedMeanSec === undefined
    ? []
    : timing.filter(sample => sample.seconds > observedMeanSec + 1e-9).map(sample => sample.id);
  const stops = recorded.filter(sample => sample.lineStop === true);
  const status = recorded.length === 0 ? "empty" : validCount > 0 ? "verified" : "below-target";
  return {
    orderedSeconds,
    validCount,
    recordedCount: recorded.length,
    excludedCount: recorded.length - validCount,
    targetSamples: draft.targetSamples,
    ...(observedMeanSec === undefined ? {} : { observedMeanSec }),
    slowerSampleIds,
    lineStopCount: stops.length,
    lineStopSeconds: stops.reduce((sum, sample) => sum + sample.seconds, 0),
    nokCount: recorded.filter(sample => sample.nok === true).length,
    status,
    ...(draft.legacyUnparsed ? { legacyUnparsed: draft.legacyUnparsed } : {}),
    legacyIssues: draft.legacyIssues ?? [],
  };
}

export function diagnosePlannedCycle(summary: CycleSampleSummary, plannedCycleSec?: number): PlannedCycleDiagnosis {
  const hasPlannedCycle = plannedCycleSec !== undefined && Number.isFinite(plannedCycleSec) && plannedCycleSec > 0;
  const deltaSec = hasPlannedCycle && summary.observedMeanSec !== undefined
    ? summary.observedMeanSec - plannedCycleSec
    : undefined;
  return {
    hasPlannedCycle,
    ...(hasPlannedCycle ? { plannedCycleSec } : {}),
    ...(summary.observedMeanSec === undefined ? {} : { observedMeanSec: summary.observedMeanSec }),
    ...(deltaSec === undefined ? {} : { deltaSec }),
    fasterThanPlanned: deltaSec !== undefined && deltaSec < -1e-9,
    verified: summary.status === "verified" && !summary.legacyUnparsed,
  };
}

export function migrateLegacyCycleDraft(raw: unknown): { draft: CycleSampleDraft; issues: string[] } {
  if (!raw || typeof raw !== "object") {
    return { draft: emptyCycleSampleDraft(), issues: ["cycle-draft-missing"] };
  }
  const record = raw as Record<string, unknown>;
  const issues: string[] = [];
  let targetSamples = 20;
  if (record.targetSamples !== undefined) {
    const parsed = typeof record.targetSamples === "number" ? record.targetSamples : Number(record.targetSamples);
    if (Number.isSafeInteger(parsed) && parsed >= 1) targetSamples = parsed;
    else issues.push(`target:${String(record.targetSamples)}`);
  }
  let acceptableSlowDeviationPercent: number | undefined;
  if (record.acceptableSlowDeviationPercent !== undefined && record.acceptableSlowDeviationPercent !== null && record.acceptableSlowDeviationPercent !== "") {
    const parsed = Number(record.acceptableSlowDeviationPercent);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 5) acceptableSlowDeviationPercent = parsed;
    else issues.push(`tolerance:${String(record.acceptableSlowDeviationPercent)}`);
  }
  const tolerance = acceptableSlowDeviationPercent === undefined ? {} : { acceptableSlowDeviationPercent };

  if (Array.isArray(record.samples)) {
    const samples: CycleSample[] = [];
    record.samples.forEach((item, index) => {
      if (!item || typeof item !== "object" || !("seconds" in item)) {
        issues.push(`sample-${index + 1}`);
        return;
      }
      const entry = item as { id?: unknown; seconds?: unknown; nok?: unknown; lineStop?: unknown; reason?: unknown };
      const seconds = typeof entry.seconds === "number" ? entry.seconds : Number(entry.seconds);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        issues.push(`sample-${index + 1}:${String(entry.seconds)}`);
        return;
      }
      const sample: CycleSample = { id: typeof entry.id === "string" && entry.id ? entry.id : createCycleSampleId(), seconds };
      if (entry.nok === true) sample.nok = true;
      if (entry.lineStop === true) sample.lineStop = true;
      if (typeof entry.reason === "string" && entry.reason.trim()) sample.reason = entry.reason.trim();
      samples.push(sample);
    });
    const legacyUnparsed = typeof record.legacyUnparsed === "string" && record.legacyUnparsed
      ? record.legacyUnparsed : undefined;
    const legacyIssues = issues.length ? issues : undefined;
    return {
      draft: {
        samples, targetSamples, ...tolerance,
        ...(legacyUnparsed ? { legacyUnparsed } : {}),
        ...(legacyIssues ? { legacyIssues } : {}),
      },
      issues,
    };
  }

  if (typeof record.samples === "string") {
    const migrated = migrateLegacySampleText(record.samples);
    const allIssues = [...issues, ...migrated.issues];
    return {
      draft: {
        samples: migrated.samples,
        targetSamples,
        ...tolerance,
        ...(migrated.legacyUnparsed ? { legacyUnparsed: migrated.legacyUnparsed } : {}),
        ...(allIssues.length ? { legacyIssues: allIssues } : {}),
      },
      issues: allIssues,
    };
  }

  if (record.samples !== undefined) issues.push("samples-unrecognized");
  return {
    draft: {
      samples: [],
      targetSamples,
      ...tolerance,
      ...(issues.length ? { legacyIssues: issues } : {}),
    },
    issues,
  };
}

function migrateLegacySampleText(raw: string): { samples: CycleSample[]; issues: string[]; legacyUnparsed?: string } {
  const tokens = raw.split(/[，,\s/]+/).map(token => token.trim()).filter(Boolean);
  const samples: CycleSample[] = [];
  const issues: string[] = [];
  for (const token of tokens) {
    const seconds = parsePositiveSeconds(token);
    if (seconds === undefined) issues.push(token);
    else samples.push({ id: createCycleSampleId(), seconds });
  }
  return { samples, issues, ...(issues.length ? { legacyUnparsed: raw } : {}) };
}
