export function normalizeWeeklyDemand(product, weeksPerYear = 52) {
    if (product.weeklyDemand > 0) {
        return { productId: product.productId, weeklyDemand: product.weeklyDemand, source: "weeklyDemand" };
    }
    if (product.annualDemand !== undefined && product.annualDemand > 0) {
        return {
            productId: product.productId,
            weeklyDemand: product.annualDemand / weeksPerYear,
            source: "annualDemand",
            notes: `annualDemand divided by ${weeksPerYear} weeks`,
        };
    }
    return { productId: product.productId, weeklyDemand: 0, source: "weeklyDemand", notes: "no positive product demand provided" };
}
export function resolveWeeklyDemand(input) {
    if (input.manualScenarioWeeklyDemand !== undefined && input.manualScenarioWeeklyDemand > 0) {
        return {
            productId: input.product.productId,
            weeklyDemand: input.manualScenarioWeeklyDemand,
            source: "manualScenario",
        };
    }
    const orderDemand = (input.orders ?? [])
        .filter(order => order.productId === input.product.productId)
        .reduce((sum, order) => sum + order.quantity, 0);
    if (orderDemand > 0) {
        return { productId: input.product.productId, weeklyDemand: orderDemand, source: "orders" };
    }
    if (input.historicalWeeklyDemand !== undefined && input.historicalWeeklyDemand > 0) {
        return {
            productId: input.product.productId,
            weeklyDemand: input.historicalWeeklyDemand,
            source: "historicalAverage",
        };
    }
    return normalizeWeeklyDemand(input.product, input.weeksPerYear);
}
