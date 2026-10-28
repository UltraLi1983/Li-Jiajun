import { findPartIdentityEntry, invalidOperationInputLinks, missingPredecessorInputs, } from "./part-identity-register.js";
export function emptyStageMaterialReviewStore() {
    return { submissions: [] };
}
export function parseStageMaterialReviewStore(raw) {
    if (!raw)
        return emptyStageMaterialReviewStore();
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid stage material review store");
    const store = value;
    if (!Array.isArray(store.submissions) || store.submissions.some(item => !item || typeof item !== "object"
        || ![item.submissionId, item.productId, item.routeId, item.routeVersion, item.effectiveFrom,
            item.submittedAt, item.contentSnapshot].every(field => typeof field === "string")
        || (item.effectiveTo !== undefined && typeof item.effectiveTo !== "string")
        || !Number.isSafeInteger(item.revision) || item.revision < 1
        || item.sourceSystem !== "system-internal-draft" || item.status !== "pendingReview" || item.declaredComplete !== true)) {
        throw new Error("Invalid stage material review store");
    }
    return store;
}
function sameScope(left, right) {
    return left.productId === right.productId && left.routeId === right.routeId && left.routeVersion === right.routeVersion;
}
function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function materialReviewSnapshot(register, scope, operations) {
    const byId = (a, b) => a.operationId.localeCompare(b.operationId);
    const entries = register.entries.filter(item => sameScope(item, scope)).sort(byId);
    const externalMaterials = register.externalMaterials.filter(item => sameScope(item, scope))
        .sort((a, b) => a.partId.localeCompare(b.partId));
    const inputLinks = register.inputLinks.filter(item => sameScope(item, scope))
        .sort((a, b) => a.linkId.localeCompare(b.linkId));
    const routeOperations = operations.map(item => ({
        operationId: item.operationId,
        sequence: item.sequence,
        name: item.name,
        processId: item.processId,
        predecessorOperationIds: [...(item.predecessorOperationIds ?? [])].sort(),
    })).sort(byId);
    return JSON.stringify({ scope, routeOperations, entries, externalMaterials, inputLinks });
}
export function stageMaterialReviewIssues(register, scope, operations, effectiveFrom, effectiveTo, declaredComplete) {
    const issues = [];
    if (!scope.productId || !scope.routeId)
        issues.push({ code: "scope_missing" });
    if (!operations.length)
        issues.push({ code: "operation_missing" });
    for (const operation of operations) {
        if (!findPartIdentityEntry(register, { ...scope, operationId: operation.operationId })) {
            issues.push({ code: "output_missing", operationId: operation.operationId });
        }
    }
    for (const gap of missingPredecessorInputs(register, scope, operations)) {
        issues.push({ code: "predecessor_input_missing", operationId: gap.operationId, sourceOperationId: gap.predecessorOperationId });
    }
    for (const invalid of invalidOperationInputLinks(register, scope, operations)) {
        const link = register.inputLinks.find(item => item.linkId === invalid.linkId);
        issues.push({ code: "input_link_invalid", ...(link ? { operationId: link.operationId } : {}) });
    }
    if (!validDate(effectiveFrom) || (effectiveTo !== undefined && (!validDate(effectiveTo) || effectiveTo < effectiveFrom))) {
        issues.push({ code: "date_invalid" });
    }
    if (!declaredComplete)
        issues.push({ code: "declaration_missing" });
    return issues;
}
export function latestStageMaterialSubmission(store, scope) {
    return store.submissions.filter(item => sameScope(item, scope)).at(-1);
}
export function isStageMaterialSubmissionCurrent(submission, register, scope, operations) {
    return sameScope(submission, scope) && submission.contentSnapshot === materialReviewSnapshot(register, scope, operations);
}
export function submitStageMaterialReview(store, register, scope, operations, options) {
    const issues = stageMaterialReviewIssues(register, scope, operations, options.effectiveFrom, options.effectiveTo, options.declaredComplete);
    const contentSnapshot = materialReviewSnapshot(register, scope, operations);
    const latest = latestStageMaterialSubmission(store, scope);
    if (latest && latest.contentSnapshot === contentSnapshot && latest.effectiveFrom === options.effectiveFrom
        && latest.effectiveTo === options.effectiveTo)
        issues.push({ code: "no_changes" });
    if (!options.submissionId || store.submissions.some(item => item.submissionId === options.submissionId)) {
        throw new Error("Submission ID is not unique");
    }
    if (issues.length)
        return { ok: false, store, issues };
    const submission = {
        ...scope,
        submissionId: options.submissionId,
        revision: (latest?.revision ?? 0) + 1,
        sourceSystem: "system-internal-draft",
        status: "pendingReview",
        effectiveFrom: options.effectiveFrom,
        ...(options.effectiveTo ? { effectiveTo: options.effectiveTo } : {}),
        submittedAt: options.submittedAt,
        contentSnapshot,
        declaredComplete: true,
    };
    return { ok: true, store: { submissions: [...store.submissions, submission] }, submission, issues: [] };
}
