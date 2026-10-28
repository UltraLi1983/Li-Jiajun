import assert from "node:assert/strict";
import { it } from "node:test";
import { appendRnrSampleRevision, emptyRnrSampleArchive, parseRnrSampleArchive, referencedRnrSampleRevision, sampleRevisionsForScope } from "../dist/engine/rnr-sample-archive.js";

const scope = {
  productId: "A-Housing", routeId: "route-a", routeVersion: "v1", operationId: "op20",
  stationId: "OP20A", equipmentId: "machine-1", shiftLabel: "day", startMinute: 510, endMinute: 1950,
};
const input = (sampleId, revisionId, inputSignature) => ({
  sampleId, revisionId, inputSignature, scope, capturedAt: "2026-10-25T08:00:00Z",
  source: "manual", evidenceJson: JSON.stringify({ actual: inputSignature }),
});

it("keeps two samples and every revision independently addressable", () => {
  const first = appendRnrSampleRevision(emptyRnrSampleArchive(), input("sample-a", "revision-a1", "first"));
  const second = appendRnrSampleRevision(first.store, input("sample-b", "revision-b1", "other"));
  const edited = appendRnrSampleRevision(second.store, input("sample-a", "revision-a2", "corrected"));

  assert.deepEqual(edited.store.revisions.map(item => [item.sampleId, item.revision]), [
    ["sample-a", 1], ["sample-b", 1], ["sample-a", 2],
  ]);
  assert.equal(edited.store.revisions[0].evidenceJson, first.revision.evidenceJson);
  assert.equal(sampleRevisionsForScope(edited.store, { ...scope, routeVersion: "v2" }).length, 0);
  assert.equal(parseRnrSampleArchive(JSON.stringify(edited.store)).revisions.length, 3);

  const restoredOlderRevision = appendRnrSampleRevision(edited.store, input("sample-a", "revision-a3", "first"));
  assert.equal(restoredOlderRevision.revision.revision, 3);
  assert.equal(restoredOlderRevision.store.revisions[0].inputSignature, "first");
  assert.equal(restoredOlderRevision.store.revisions[2].inputSignature, "corrected");
});

it("rejects silent overwrite, duplicate revision and changed sample identity", () => {
  const { store } = appendRnrSampleRevision(emptyRnrSampleArchive(), input("sample-a", "revision-a1", "first"));
  assert.throws(() => appendRnrSampleRevision(store, input("sample-a", "revision-a2", "first")), /no changes/);
  assert.throws(() => appendRnrSampleRevision(store, input("sample-a", "revision-a1", "corrected")), /already exists/);
  assert.throws(() => appendRnrSampleRevision(store, {
    ...input("sample-a", "revision-a2", "corrected"), scope: { ...scope, routeVersion: "v2" },
  }), /identity changed/);
});

it("keeps validation fixtures explicitly separated from manual samples", () => {
  const { store } = appendRnrSampleRevision(emptyRnrSampleArchive(), {
    ...input("sample-fixture", "revision-fixture", "fixture"), source: "validationFixture",
  });
  assert.equal(store.revisions[0].source, "validationFixture");
  assert.equal(store.revisions[0].status, "localDraft");
});

it("archives and revises samples without shift metadata", () => {
  const noShift = { ...scope, shiftLabel: undefined };
  const first = appendRnrSampleRevision(emptyRnrSampleArchive(), {
    ...input("sample-a", "revision-a1", "first"), scope: noShift,
  });
  const saved = parseRnrSampleArchive(JSON.stringify(first.store));
  assert.equal(saved.revisions[0].scope.shiftLabel, undefined);
  const second = appendRnrSampleRevision(saved, {
    ...input("sample-a", "revision-a2", "changed"), scope: noShift,
  });
  assert.equal(second.revision.revision, 2);
});

it("drops a sample reference when the input or route version changes", () => {
  const { store, revision } = appendRnrSampleRevision(emptyRnrSampleArchive(), input("sample-a", "revision-a1", "original"));
  assert.equal(referencedRnrSampleRevision(store, scope, revision.revisionId, "original")?.sampleId, "sample-a");
  assert.equal(referencedRnrSampleRevision(store, scope, revision.revisionId, "edited"), undefined);
  assert.equal(referencedRnrSampleRevision(store, { ...scope, routeVersion: "v2" }, revision.revisionId, "original"), undefined);
});

it("preserves a legacy single shift label and records two covered shifts as a new revision", () => {
  const { store } = appendRnrSampleRevision(emptyRnrSampleArchive(), input("sample-a", "revision-a1", "first"));
  const corrected = appendRnrSampleRevision(store, {
    ...input("sample-a", "revision-a2", "first"),
    scope: { ...scope, shiftLabel: "day / night", shiftCoverage: [
      { startMinute: 510, endMinute: 1230, label: "day" },
      { startMinute: 1230, endMinute: 1950, label: "night" },
    ] },
  });
  assert.equal(corrected.revision.revision, 2);
  assert.equal(corrected.store.revisions[0].scope.shiftCoverage, undefined);
  assert.equal(corrected.store.revisions[1].scope.shiftCoverage.length, 2);
  assert.equal(parseRnrSampleArchive(JSON.stringify(corrected.store)).revisions.length, 2);
  const relabelled = appendRnrSampleRevision(corrected.store, {
    ...input("sample-a", "revision-a3", "changed"),
    scope: { ...scope, shiftLabel: "day / night", shiftCoverage: [
      { startMinute: 510, endMinute: 1230, label: "day" },
      { startMinute: 1230, endMinute: 1950, label: "other" },
    ] },
  });
  assert.equal(relabelled.revision.revision, 3);
  assert.equal(relabelled.store.revisions[1].scope.shiftCoverage[1].label, "night");
});
