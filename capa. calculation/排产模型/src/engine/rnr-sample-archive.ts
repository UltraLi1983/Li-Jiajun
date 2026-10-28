export interface RnrCoveredShift {
  startMinute: number;
  endMinute: number;
  label: string;
}

export interface RnrSampleScope {
  productId: string;
  routeId: string;
  routeVersion: string;
  operationId: string;
  stationId: string;
  equipmentId: string;
  /** Optional historical note from older archives; not part of sample identity. */
  shiftLabel?: string;
  /** Optional historical note from older archives; time slices are derived from saved SA. */
  shiftCoverage?: RnrCoveredShift[];
  startMinute: number;
  endMinute: number;
}

export function validRnrShiftCoverage(scope: RnrSampleScope): boolean {
  if (!scope.shiftCoverage) return true; // Legacy local revisions remain readable.
  if (!Array.isArray(scope.shiftCoverage) || !scope.shiftCoverage.length) return false;
  let previousEnd = scope.startMinute;
  for (const shift of scope.shiftCoverage) {
    if (!shift || typeof shift.label !== "string" || !shift.label.trim()
      || !Number.isFinite(shift.startMinute) || !Number.isFinite(shift.endMinute)
      || shift.startMinute < scope.startMinute || shift.endMinute > scope.endMinute
      || shift.endMinute <= shift.startMinute || shift.startMinute < previousEnd) return false;
    previousEnd = shift.endMinute;
  }
  return true;
}

export interface RnrSampleRevision {
  revisionId: string;
  sampleId: string;
  revision: number;
  capturedAt: string;
  scope: RnrSampleScope;
  source: "manual" | "validationFixture";
  status: "localDraft";
  inputSignature: string;
  evidenceJson: string;
}

export interface RnrSampleArchive {
  schemaVersion: 1;
  revisions: RnrSampleRevision[];
}

export function emptyRnrSampleArchive(): RnrSampleArchive {
  return { schemaVersion: 1, revisions: [] };
}

export function parseRnrSampleArchive(raw: string | null): RnrSampleArchive {
  if (!raw) return emptyRnrSampleArchive();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid R&R sample archive");
  const store = value as RnrSampleArchive;
  if (store.schemaVersion !== 1 || !Array.isArray(store.revisions) || store.revisions.length > 1000) {
    throw new Error("Invalid R&R sample archive");
  }
  const revisionIds = new Set<string>();
  for (const item of store.revisions) {
    const scope = item?.scope;
    if (!item || !scope || ![item.revisionId, item.sampleId, item.capturedAt, item.inputSignature, item.evidenceJson,
      scope.productId, scope.routeId, scope.routeVersion, scope.operationId, scope.stationId,
      scope.equipmentId].every(field => typeof field === "string" && field.length > 0)
      || (scope.shiftLabel !== undefined && typeof scope.shiftLabel !== "string")
      || !Number.isSafeInteger(item.revision) || item.revision < 1
      || !Number.isFinite(scope.startMinute) || !Number.isFinite(scope.endMinute) || scope.endMinute <= scope.startMinute
      || !validRnrShiftCoverage(scope)
      || !["manual", "validationFixture"].includes(item.source) || item.status !== "localDraft"
      || revisionIds.has(item.revisionId)) throw new Error("Invalid R&R sample revision");
    revisionIds.add(item.revisionId);
  }
  return store;
}

export function sampleRevisionsForScope(store: RnrSampleArchive, scope: Pick<RnrSampleScope, "productId" | "routeId" | "routeVersion" | "operationId" | "stationId">): RnrSampleRevision[] {
  return store.revisions.filter(item => item.scope.productId === scope.productId && item.scope.routeId === scope.routeId
    && item.scope.routeVersion === scope.routeVersion && item.scope.operationId === scope.operationId
    && item.scope.stationId === scope.stationId);
}

export function referencedRnrSampleRevision(
  store: RnrSampleArchive,
  scope: Pick<RnrSampleScope, "productId" | "routeId" | "routeVersion" | "operationId" | "stationId">,
  revisionId: string,
  inputSignature: string,
): RnrSampleRevision | undefined {
  return sampleRevisionsForScope(store, scope).find(item => item.revisionId === revisionId
    && item.inputSignature === inputSignature);
}

export function appendRnrSampleRevision(
  store: RnrSampleArchive,
  input: Omit<RnrSampleRevision, "revision" | "status">,
): { store: RnrSampleArchive; revision: RnrSampleRevision } {
  const { scope } = input;
  if (![scope.productId, scope.routeId, scope.routeVersion, scope.operationId, scope.stationId,
    scope.equipmentId, input.revisionId, input.sampleId, input.inputSignature, input.evidenceJson]
    .every(value => typeof value === "string" && value.trim().length > 0)
    || (scope.shiftLabel !== undefined && typeof scope.shiftLabel !== "string")
    || !Number.isFinite(scope.startMinute) || !Number.isFinite(scope.endMinute) || scope.endMinute <= scope.startMinute
    || !validRnrShiftCoverage(scope)
    || !Number.isFinite(Date.parse(input.capturedAt))) throw new Error("R&R sample identity or observation window is incomplete");
  if (store.revisions.some(item => item.revisionId === input.revisionId)) throw new Error("R&R revision ID already exists");
  const history = store.revisions.filter(item => item.sampleId === input.sampleId);
  const latest = history.at(-1);
  if (latest && (latest.scope.productId !== scope.productId || latest.scope.routeId !== scope.routeId
    || latest.scope.routeVersion !== scope.routeVersion || latest.scope.operationId !== scope.operationId
    || latest.scope.stationId !== scope.stationId || latest.scope.equipmentId !== scope.equipmentId
    || latest.source !== input.source)) {
    throw new Error("R&R sample identity changed; start a new sample");
  }
  if (latest?.inputSignature === input.inputSignature && latest.scope.shiftLabel === scope.shiftLabel
    && JSON.stringify(latest.scope.shiftCoverage) === JSON.stringify(scope.shiftCoverage)) {
    throw new Error("R&R sample has no changes to archive");
  }
  const revision: RnrSampleRevision = { ...input, revision: (latest?.revision ?? 0) + 1, status: "localDraft" };
  return { store: { schemaVersion: 1, revisions: [...store.revisions, revision] }, revision };
}
