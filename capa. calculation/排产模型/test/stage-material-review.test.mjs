import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyPartIdentityRegister, recordOperationInputLink, recordPartIdentity,
} from "../dist/engine/part-identity-register.js";
import {
  emptyStageMaterialReviewStore, isStageMaterialSubmissionCurrent,
  latestStageMaterialSubmission, parseStageMaterialReviewStore, stageMaterialReviewIssues,
  submitStageMaterialReview,
} from "../dist/engine/stage-material-review.js";

const scope = { productId: "A-Housing", routeId: "local-route-a", routeVersion: "v1" };
const operations = [
  { operationId: "op10" },
  { operationId: "op20", predecessorOperationIds: ["op10"] },
];
const submitOptions = { effectiveFrom: "2026-11-01", declaredComplete: true, submittedAt: "2026-10-25T00:00:00.000Z", submissionId: "sub-1" };

function registerWithTwoOutputs() {
  let register = emptyPartIdentityRegister();
  for (const [operationId, englishName] of [["op10", "Cast Blank"], ["op20", "Machined Housing"]]) {
    register = recordPartIdentity(register, { ...scope, operationId, englishName, identityMode: "new" }, [], submitOptions.submittedAt, () => `part-${operationId}`);
  }
  return register;
}

describe("stage material review request", () => {
  it("blocks submission until route outputs and predecessor inputs are recorded", () => {
    const register = registerWithTwoOutputs();
    const result = submitStageMaterialReview(emptyStageMaterialReviewStore(), register, scope, operations, submitOptions);
    assert.equal(result.ok, false);
    assert.equal(result.issues.some(issue => issue.code === "predecessor_input_missing" && issue.operationId === "op20"), true);
    assert.equal(result.store.submissions.length, 0);
  });

  it("keeps an immutable pending snapshot and marks it stale after a material edit", () => {
    let register = registerWithTwoOutputs();
    register = recordOperationInputLink(register, { ...scope, operationId: "op20", partId: "part-op10", sourceOperationId: "op10", quantityPerOutput: 1, unit: "pcs" }, ["op10"], submitOptions.submittedAt, () => "link-1");
    const first = submitStageMaterialReview(emptyStageMaterialReviewStore(), register, scope, operations, submitOptions);
    assert.equal(first.ok, true);
    assert.equal(first.submission.revision, 1);
    assert.equal(first.submission.sourceSystem, "system-internal-draft");
    assert.equal(first.submission.status, "pendingReview");
    assert.equal(isStageMaterialSubmissionCurrent(first.submission, register, scope, operations), true);
    assert.equal(parseStageMaterialReviewStore(JSON.stringify(first.store)).submissions.length, 1);

    const edited = { ...register, inputLinks: register.inputLinks.map(link => ({ ...link, quantityPerOutput: 2 })) };
    assert.equal(isStageMaterialSubmissionCurrent(first.submission, edited, scope, operations), false);
    const second = submitStageMaterialReview(first.store, edited, scope, operations, { ...submitOptions, submissionId: "sub-2" });
    assert.equal(second.ok, true);
    assert.equal(second.submission.revision, 2);
    assert.equal(second.store.submissions[0].contentSnapshot, first.submission.contentSnapshot);
    assert.equal(latestStageMaterialSubmission(second.store, scope)?.submissionId, "sub-2");
    assert.equal(isStageMaterialSubmissionCurrent(second.submission, edited, scope, operations), true);
  });

  it("rejects an unchanged re-submission, invalid dates and missing declaration", () => {
    let register = registerWithTwoOutputs();
    register = recordOperationInputLink(register, { ...scope, operationId: "op20", partId: "part-op10", sourceOperationId: "op10", quantityPerOutput: 1, unit: "pcs" }, ["op10"], submitOptions.submittedAt, () => "link-1");
    const first = submitStageMaterialReview(emptyStageMaterialReviewStore(), register, scope, operations, submitOptions);
    assert.equal(first.ok, true);
    const duplicate = submitStageMaterialReview(first.store, register, scope, operations, { ...submitOptions, submissionId: "sub-2" });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.issues.some(issue => issue.code === "no_changes"), true);
    const issues = stageMaterialReviewIssues(register, scope, operations, "2026-02-31", "2026-02-01", false);
    assert.equal(issues.some(issue => issue.code === "date_invalid"), true);
    assert.equal(issues.some(issue => issue.code === "declaration_missing"), true);
  });

  it("detects a route topology change and keeps other route versions separate", () => {
    let register = registerWithTwoOutputs();
    register = recordOperationInputLink(register, { ...scope, operationId: "op20", partId: "part-op10", sourceOperationId: "op10", quantityPerOutput: 1, unit: "pcs" }, ["op10"], submitOptions.submittedAt, () => "link-1");
    const first = submitStageMaterialReview(emptyStageMaterialReviewStore(), register, scope, operations, submitOptions);
    assert.equal(first.ok, true);
    assert.equal(isStageMaterialSubmissionCurrent(first.submission, register, scope, [{ operationId: "op10" }, { operationId: "op20" }]), false);
    assert.equal(isStageMaterialSubmissionCurrent(first.submission, register, scope, [
      { operationId: "op10", sequence: 10 }, { operationId: "op20", predecessorOperationIds: ["op10"] },
    ]), false);
    assert.equal(latestStageMaterialSubmission(first.store, { ...scope, routeVersion: "v2" }), undefined);
    assert.throws(() => parseStageMaterialReviewStore("{broken"));
  });
});
