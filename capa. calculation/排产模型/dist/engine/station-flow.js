/** Maximum product-equivalent flow through station capacities and allowed adjacent transfers. */
export function calculateStationFlow(operationOrder, stations, policies) {
    if (!operationOrder.length)
        return { issue: "路线没有工序" };
    const stage = new Map(operationOrder.map((id, index) => [id, index]));
    const key = (operationId, stationId) => JSON.stringify([operationId, stationId]);
    const known = new Set(stations.map(item => key(item.operationId, item.stationId)));
    for (const policy of policies) {
        const fromIndex = stage.get(policy.fromOperationId);
        if (fromIndex === undefined || operationOrder[fromIndex + 1] !== policy.toOperationId) {
            return { issue: "工站流转关系不再对应相邻工序，请重新确认路线连线" };
        }
        if (!policy.allowedPairs.length)
            return { issue: "定向流转尚未连接任何工站" };
        for (const pair of policy.allowedPairs) {
            if (!known.has(key(policy.fromOperationId, pair.fromStationId))
                || !known.has(key(policy.toOperationId, pair.toStationId))) {
                return { issue: "工站流转关系引用了未参与本次计算的工站" };
            }
        }
    }
    if (stations.some(item => !Number.isFinite(item.finishedPieces) || item.finishedPieces < 0)) {
        return { issue: "工站件数无效" };
    }
    const source = stations.length * 2;
    const sink = source + 1;
    const residual = Array.from({ length: sink + 1 }, () => Array(sink + 1).fill(0));
    const add = (from, to, capacity) => { residual[from][to] += capacity; };
    const byOperation = operationOrder.map(id => stations.map((item, index) => ({ item, index })).filter(entry => entry.item.operationId === id));
    if (byOperation.some(items => !items.length))
        return { issue: "工序没有可计算的工站" };
    const unlimited = stations.reduce((sum, item) => sum + item.finishedPieces, 0) + 1;
    stations.forEach((item, index) => add(index * 2, index * 2 + 1, item.finishedPieces));
    byOperation[0].forEach(entry => add(source, entry.index * 2, unlimited));
    byOperation.at(-1).forEach(entry => add(entry.index * 2 + 1, sink, unlimited));
    for (let i = 0; i < byOperation.length - 1; i++) {
        const from = byOperation[i];
        const to = byOperation[i + 1];
        const policy = policies.find(item => item.fromOperationId === operationOrder[i] && item.toOperationId === operationOrder[i + 1]);
        for (const left of from)
            for (const right of to) {
                if (!policy || policy.allowedPairs.some(pair => pair.fromStationId === left.item.stationId && pair.toStationId === right.item.stationId)) {
                    add(left.index * 2 + 1, right.index * 2, unlimited);
                }
            }
    }
    let pieces = 0;
    while (true) {
        const parent = Array(sink + 1).fill(-1);
        const queue = [source];
        parent[source] = source;
        for (let cursor = 0; cursor < queue.length && parent[sink] === -1; cursor++) {
            const from = queue[cursor];
            for (let to = 0; to <= sink; to++) {
                if (parent[to] === -1 && residual[from][to] > 1e-9) {
                    parent[to] = from;
                    queue.push(to);
                }
            }
        }
        if (parent[sink] === -1)
            break;
        let pushed = Infinity;
        for (let node = sink; node !== source; node = parent[node]) {
            pushed = Math.min(pushed, residual[parent[node]][node]);
        }
        for (let node = sink; node !== source; node = parent[node]) {
            residual[parent[node]][node] -= pushed;
            residual[node][parent[node]] += pushed;
        }
        pieces += pushed;
    }
    return { pieces };
}
