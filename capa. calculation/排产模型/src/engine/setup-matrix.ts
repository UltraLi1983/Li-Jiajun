import type { OrderPlan, ProductRoute, SetupRule, StationEvent } from "../domain/types.js";

export function generateSetupEvents(
  orders: OrderPlan[],
  routes: ProductRoute[],
  setupRules: SetupRule[],
): Map<string, StationEvent[]> {
  const result = new Map<string, StationEvent[]>();
  const stationIds = new Set(routes.flatMap(route => route.operations.map(operation => operation.stationId)));

  for (const stationId of stationIds) {
    let previousProductId: string | undefined;
    for (const order of orders) {
      const route = routes.find(item => item.productId === order.productId);
      const usesStation = route?.operations.some(operation => operation.stationId === stationId);
      if (!usesStation) continue;

      if (previousProductId && previousProductId !== order.productId) {
        const rule = setupRules.find(
          item => item.stationId === stationId
            && item.fromProductId === previousProductId
            && item.toProductId === order.productId,
        );
        if (rule) {
          const events = result.get(stationId) ?? [];
          events.push({
            kind: "setup",
            minutes: rule.setupMinutes + (rule.validationMinutes ?? 0),
            source: "schedule",
            productId: order.productId,
          });
          result.set(stationId, events);
        }
      }

      previousProductId = order.productId;
    }
  }

  return result;
}
