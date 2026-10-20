let pendingWrite = Promise.resolve();
let onSyncError = () => { };
const pendingKey = "__capa-local-sync-pending-v1";
function pendingValues() {
    const raw = localStorage.getItem(pendingKey);
    if (!raw)
        return {};
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid pending local changes");
    return value;
}
function markPending(key, value) {
    localStorage.setItem(pendingKey, JSON.stringify({ ...pendingValues(), [key]: value }));
}
function clearPending(key, value) {
    const pending = pendingValues();
    if (!Object.hasOwn(pending, key) || pending[key] !== value)
        return;
    delete pending[key];
    if (Object.keys(pending).length)
        localStorage.setItem(pendingKey, JSON.stringify(pending));
    else
        localStorage.removeItem(pendingKey);
}
export function setLocalStateErrorHandler(handler) {
    onSyncError = handler;
}
async function putRemote(key, value) {
    const response = await fetch(`/api/state/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
    });
    if (!response.ok)
        throw new Error(`Local database returned ${response.status}`);
}
export async function bootstrapLocalState() {
    const dirty = pendingValues();
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok)
        throw new Error(`Local database returned ${response.status}`);
    const remote = await response.json();
    if (!remote || typeof remote !== "object" || Array.isArray(remote))
        throw new Error("Invalid local database response");
    const saved = remote;
    const browserKeys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("capa-"))
            browserKeys.push(key);
    }
    for (const [key, value] of Object.entries(saved)) {
        if (!key.startsWith("capa-") || (value !== null && typeof value !== "string"))
            throw new Error("Invalid local database entry");
        if (Object.hasOwn(dirty, key))
            continue;
        if (value === null)
            localStorage.removeItem(key);
        else
            localStorage.setItem(key, value);
    }
    for (const key of new Set([...browserKeys.filter(item => !Object.hasOwn(saved, item)), ...Object.keys(dirty)])) {
        const value = Object.hasOwn(dirty, key) ? dirty[key] ?? null : localStorage.getItem(key);
        if (value !== null || Object.hasOwn(dirty, key)) {
            await putRemote(key, value);
            clearPending(key, value);
        }
    }
}
function queueRemoteWrite(key, value) {
    pendingWrite = pendingWrite.then(async () => {
        await putRemote(key, value);
        clearPending(key, value);
    }).catch(error => {
        onSyncError(error instanceof Error ? error.message : String(error));
    });
}
export function saveLocalState(key, value) {
    localStorage.setItem(key, value);
    markPending(key, value);
    queueRemoteWrite(key, value);
}
export function removeLocalState(key) {
    localStorage.removeItem(key);
    markPending(key, null);
    queueRemoteWrite(key, null);
}
export async function listRouteHistory() {
    await pendingWrite;
    const response = await fetch("/api/route-history", { cache: "no-store" });
    if (!response.ok)
        throw new Error(`Local database returned ${response.status}`);
    return response.json();
}
export async function readRouteHistory(id) {
    await pendingWrite;
    const response = await fetch(`/api/route-history/${id}`, { cache: "no-store" });
    if (!response.ok)
        throw new Error(`Local database returned ${response.status}`);
    const result = await response.json();
    return result.value;
}
