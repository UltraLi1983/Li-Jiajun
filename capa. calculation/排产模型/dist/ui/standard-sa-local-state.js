import { freezeStandardWindow, legacyStandardWindowFingerprint, standardWindowFingerprint } from "../engine/standard-window.js";
export function weekMatchesStandardSaSource(week, signature) {
    return Boolean(week?.sourceSignature && signature && week.sourceSignature === signature);
}
export function emptyStandardSaLocalState() {
    return { version: 1, plans: {}, configs: {}, frozen: {}, weeks: {} };
}
export function parseStandardSaLocalState(raw) {
    const value = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || !record(value.plans)
        || !record(value.configs) || !record(value.frozen) || !record(value.weeks))
        throw new Error("Invalid SA state");
    const result = emptyStandardSaLocalState();
    for (const [key, config] of Object.entries(value.configs)) {
        if (!record(config) || !Number.isFinite(config.startMinute)
            || ![1, 2].includes(config.dayCount)
            || ![480, 720].includes(config.shiftMinutes)
            || !Number.isInteger(config.shiftsPerDay) || config.shiftsPerDay < 1)
            continue;
        result.configs[key] = config;
    }
    for (const [key, plan] of Object.entries(value.plans)) {
        if (!record(plan) || typeof plan.areDefault !== "boolean" || !Array.isArray(plan.events)
            || !plan.events.every(event => record(event) && typeof event.id === "string"
                && typeof event.stationId === "string" && typeof event.kind === "string"
                && Number.isFinite(event.startMinute) && Number.isFinite(event.endMinute)))
            continue;
        result.plans[key] = plan;
    }
    for (const [key, frozen] of Object.entries(value.frozen)) {
        if (!record(frozen) || frozen.sourceId !== key || typeof frozen.stationId !== "string"
            || typeof frozen.baseDate !== "string" || !Number.isInteger(frozen.version)
            || frozen.version < 1 || !Array.isArray(frozen.events))
            continue;
        const check = freezeStandardWindow({
            sourceId: key, stationId: frozen.stationId, baseDate: frozen.baseDate,
            version: frozen.version, events: frozen.events,
            ...(result.configs[key] && frozen.dayConfig ? { dayConfig: frozen.dayConfig } : {}),
        });
        if (check.snapshot && (check.snapshot.fingerprint === frozen.fingerprint
            || legacyStandardWindowFingerprint(frozen.events) === frozen.fingerprint)
            && check.snapshot.startMinute === frozen.startMinute && check.snapshot.endMinute === frozen.endMinute) {
            result.frozen[key] = check.snapshot;
        }
    }
    for (const [key, week] of Object.entries(value.weeks)) {
        if (!record(week) || !Array.isArray(week.days) || week.days.length !== 7
            || !week.days.every(day => record(day) && typeof day.date === "string"
                && typeof day.stale === "boolean" && Number.isFinite(day.bestCaseAvailableMinutes))
            || !Array.isArray(week.shiftCounts) || !Number.isFinite(week.perShiftUnplanned))
            continue;
        const restored = { ...week };
        const planKey = key.slice(0, key.lastIndexOf("::"));
        const plan = result.plans[planKey];
        const config = result.configs[planKey];
        const configPrefix = config ? `${JSON.stringify(config)}::` : "";
        if (plan && configPrefix && restored.sourceSignature?.startsWith(configPrefix)) {
            try {
                const signedEvents = JSON.parse(restored.sourceSignature.slice(configPrefix.length));
                if (Array.isArray(signedEvents) && signedEvents.every(record)) {
                    const signedPlan = signedEvents.map(({ label: _label, note: _note, ...event }) => event);
                    if (JSON.stringify(signedPlan) === standardWindowFingerprint(plan.events)) {
                        restored.sourceSignature = `${configPrefix}${standardWindowFingerprint(plan.events)}`;
                    }
                }
            }
            catch { /* Leave a malformed or unrelated signature stale. */ }
        }
        result.weeks[key] = restored;
    }
    return result;
}
function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
