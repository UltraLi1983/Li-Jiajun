import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyPartIdentityRegister, findPartIdentityEntry, parsePartIdentityRegister,
  invalidOperationInputLinks, missingPredecessorInputs, recordExternalInputMaterial, recordOperationInputLink,
  recordPartIdentity, removeExternalInputMaterial, removeOperationInputLink, removePartIdentityEntry,
} from "../dist/engine/part-identity-register.js";

const scope = { productId: "housing", routeId: "route-v1", routeVersion: "v1" };
const at = "2026-10-25T00:00:00.000Z";
const add = (register, operationId, englishName, id) => recordPartIdentity(register,
  { ...scope, operationId, englishName, identityMode: "new" }, [], at, () => id);

describe("part identity register", () => {
  it("issues nonsemantic numbers and never reuses a removed number", () => {
    const first = add(emptyPartIdentityRegister(), "op10", "Cast Blank", "part-1");
    assert.equal(first.entries[0].temporaryPartNo, "TMP-000001");
    const removed = removePartIdentityEntry(first, first.entries[0]);
    const second = add(removed, "op10", "Machined Housing", "part-2");
    assert.equal(second.entries[0].temporaryPartNo, "TMP-000002");
    assert.equal(parsePartIdentityRegister(JSON.stringify(second)).nextSequence, 3);
  });

  it("reuses an earlier identity without issuing another number", () => {
    const first = add(emptyPartIdentityRegister(), "op10", "Cast Blank", "part-1");
    const second = recordPartIdentity(first, { ...scope, operationId: "op20", englishName: "", identityMode: "existing", sourceOperationId: "op10" }, ["op10"], at, () => "unused");
    assert.equal(second.nextSequence, 2);
    assert.equal(second.entries[1].partId, "part-1");
    assert.equal(second.entries[1].temporaryPartNo, "TMP-000001");
    assert.throws(() => removePartIdentityEntry(second, second.entries[0]), /referenced/);
    assert.ok(findPartIdentityEntry(second, { ...scope, operationId: "op20" }));
  });

  it("rejects duplicate operations, non-English names and invalid source scope", () => {
    const first = add(emptyPartIdentityRegister(), "op10", "Cast Blank", "part-1");
    assert.throws(() => add(first, "op10", "Other", "part-2"), /already recorded/);
    assert.throws(() => add(first, "op20", "压铸件", "part-2"), /English part name/);
    assert.throws(() => recordPartIdentity(first, { ...scope, operationId: "op20", englishName: "", identityMode: "existing", sourceOperationId: "op99" }, ["op10"], at, () => "unused"), /earlier/);
    assert.throws(() => recordPartIdentity(first, { ...scope, routeVersion: "v2", operationId: "op20", englishName: "", identityMode: "existing", sourceOperationId: "op10" }, ["op10"], at, () => "unused"), /not recorded/);
  });

  it("does not treat unreadable saved data as an empty register", () => {
    assert.throws(() => parsePartIdentityRegister("{broken"));
    assert.throws(() => parsePartIdentityRegister('{"nextSequence":0,"entries":[]}'));
  });

  it("migrates existing identity records without clearing their numbers", () => {
    const old = { nextSequence: 8, entries: [{ ...scope, operationId: "op10", partId: "part-7", temporaryPartNo: "TMP-000007", englishName: "A-Housing Cast Blank", identityMode: "new", recordedAt: at }] };
    const restored = parsePartIdentityRegister(JSON.stringify(old));
    assert.equal(restored.entries[0].temporaryPartNo, "TMP-000007");
    assert.deepEqual(restored.externalMaterials, []);
    assert.deepEqual(restored.inputLinks, []);
  });

  it("links a predecessor output and an external material to the same operation", () => {
    let register = add(emptyPartIdentityRegister(), "op10", "Cast Blank", "part-1");
    register = add(register, "op20", "Machined Housing", "part-2");
    register = recordExternalInputMaterial(register, { ...scope, englishName: "Aluminum Ingot", kind: "raw" }, at, () => "part-3");
    assert.equal(register.externalMaterials[0].temporaryPartNo, "TMP-000003");
    register = recordOperationInputLink(register, { ...scope, operationId: "op20", partId: "part-1", sourceOperationId: "op10", quantityPerOutput: 2, unit: "pcs" }, ["op10"], at, () => "link-1");
    register = recordOperationInputLink(register, { ...scope, operationId: "op20", partId: "part-3", quantityPerOutput: 0.25, unit: "kg" }, ["op10"], at, () => "link-2");
    assert.equal(register.inputLinks.length, 2);
    assert.equal(register.inputLinks[1].quantityPerOutput, 0.25);
    assert.equal(register.inputLinks[1].unit, "kg");
    assert.deepEqual(missingPredecessorInputs(register, scope, [
      { operationId: "op10" }, { operationId: "op20", predecessorOperationIds: ["op10"] },
    ]), []);
    assert.throws(() => removePartIdentityEntry(register, register.entries[0]), /input link/);
    assert.throws(() => removeExternalInputMaterial(register, register.externalMaterials[0]), /input link/);
    register = removeOperationInputLink(register, register.inputLinks[1]);
    assert.equal(register.inputLinks.length, 1);
  });

  it("blocks a wrong route predecessor, duplicate link and invalid quantity", () => {
    let register = add(emptyPartIdentityRegister(), "op10", "Cast Blank", "part-1");
    register = add(register, "op20", "Machined Housing", "part-2");
    const link = { ...scope, operationId: "op20", partId: "part-1", sourceOperationId: "op10", quantityPerOutput: 1, unit: "pcs" };
    assert.deepEqual(missingPredecessorInputs(register, scope, [{ operationId: "op20", predecessorOperationIds: ["op10"] }]), [{ operationId: "op20", predecessorOperationId: "op10" }]);
    assert.throws(() => recordOperationInputLink(register, link, [], at, () => "link-1"), /not a route predecessor/);
    assert.throws(() => recordOperationInputLink(register, { ...link, quantityPerOutput: 0 }, ["op10"], at, () => "link-1"), /positive input quantity/);
    register = recordOperationInputLink(register, link, ["op10"], at, () => "link-1");
    assert.throws(() => recordOperationInputLink(register, link, ["op10"], at, () => "link-2"), /already recorded/);
    assert.throws(() => recordOperationInputLink(register, { ...link, routeVersion: "v2" }, ["op10"], at, () => "link-2"), /does not match/);
    assert.deepEqual(invalidOperationInputLinks(register, scope, [
      { operationId: "op10" }, { operationId: "op20", predecessorOperationIds: ["op10"] },
    ]), []);
    assert.deepEqual(invalidOperationInputLinks(register, scope, [
      { operationId: "op10" }, { operationId: "op20", predecessorOperationIds: [] },
    ]), [{ linkId: "link-1", reason: "source_not_predecessor" }]);
    assert.deepEqual(invalidOperationInputLinks(register, scope, [{ operationId: "op10" }]), [{ linkId: "link-1", reason: "target_missing" }]);
  });
});
