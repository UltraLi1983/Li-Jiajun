export function localDateValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function selectEffectiveParameter(parameters, operationId, stationId, asOfDate = localDateValue()) {
    return parameters.filter(item => item.operationId === operationId && item.stationId === stationId
        && (item.approvalStatus === "approved" || item.approvalStatus === "effective")
        && (!item.effectiveFrom || item.effectiveFrom <= asOfDate))
        .reduce((selected, item) => !selected || (item.effectiveFrom ?? "") >= (selected.effectiveFrom ?? "") ? item : selected, undefined);
}
export function publishParameterVersion(base, confirmed, effectiveFrom, parameterId) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
        || Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`))
        || new Date(`${effectiveFrom}T00:00:00Z`).toISOString().slice(0, 10) !== effectiveFrom) {
        throw new RangeError("Invalid effective date");
    }
    if (!parameterId.trim() || parameterId === base.parameterId || confirmed.length === 0) {
        throw new Error("A new version ID and confirmed CT/P/Q suggestions are required");
    }
    const values = new Map();
    const refs = new Set();
    for (const item of confirmed) {
        if (!["standardCycleSec", "performanceRate", "qualityRate"].includes(item.target)
            || values.has(item.target) || !item.eligibleForConfirmation
            || !["approved", "effective"].includes(item.approvalStatus)
            || item.effectiveFrom !== effectiveFrom
            || item.operationId !== base.operationId || item.stationId !== base.stationId
            || item.targetStandardId !== base.parameterId
            || item.currentValue !== base[item.target]
            || !Number.isFinite(item.proposedValue)) {
            throw new Error("Suggestions must be current, locally confirmed, and share one effective date");
        }
        values.set(item.target, item.proposedValue);
        item.evidenceRefs.forEach(ref => refs.add(ref));
    }
    const ct = values.get("standardCycleSec") ?? base.standardCycleSec;
    const p = values.get("performanceRate") ?? base.performanceRate;
    const q = values.get("qualityRate") ?? base.qualityRate;
    if (ct <= 0 || p <= 0 || p > 1 || q <= 0 || q > 1)
        throw new RangeError("CT/P/Q values are outside valid ranges");
    if (ct !== base.standardCycleSec && !values.has("performanceRate")) {
        throw new Error("Changing CT requires a paired, recalculated P suggestion");
    }
    return {
        ...base, parameterId, supersedesParameterId: base.parameterId,
        calibrationRefs: [...refs], standardCycleSec: ct, performanceRate: p, qualityRate: q,
        parameterSource: "runRate", approvalStatus: effectiveFrom <= localDateValue() ? "effective" : "approved",
        effectiveFrom,
    };
}
