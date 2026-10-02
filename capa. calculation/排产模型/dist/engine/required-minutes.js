export function calculateRequiredMinutesByStation(orders, routes, observations = [], useRunRate = false) {
    const demandByProduct = new Map();
    for (const order of orders) {
        demandByProduct.set(order.productId, (demandByProduct.get(order.productId) ?? 0) + order.quantity);
    }
    const requiredByStation = new Map();
    for (const route of routes) {
        const quantity = demandByProduct.get(route.productId) ?? 0;
        if (quantity <= 0)
            continue;
        for (const operation of route.operations) {
            const observation = observations.find(item => item.productId === route.productId && item.stationId === operation.stationId);
            const performanceRate = useRunRate && observation?.observedCycleSec
                ? Math.min(operation.standardCycleSec / observation.observedCycleSec, 1.25)
                : operation.plannedPerformanceRate;
            const grossQuantity = quantity * operation.partShare / Math.max(operation.plannedQualityRate, 0.0001);
            const minutes = grossQuantity * operation.standardCycleSec / 60 / Math.max(performanceRate, 0.0001);
            requiredByStation.set(operation.stationId, (requiredByStation.get(operation.stationId) ?? 0) + minutes);
        }
    }
    return requiredByStation;
}
