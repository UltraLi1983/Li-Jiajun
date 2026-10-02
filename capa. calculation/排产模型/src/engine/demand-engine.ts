import type { OrderPlan, Product } from "../domain/types.js";

export type DemandSource = "weeklyDemand" | "annualDemand" | "orders" | "historicalAverage" | "manualScenario";

export interface WeeklyDemandResult {
  productId: string;
  weeklyDemand: number;
  source: DemandSource;
  notes?: string;
}

export interface DemandFallbackInput {
  product: Product;
  orders?: OrderPlan[];
  historicalWeeklyDemand?: number;
  manualScenarioWeeklyDemand?: number;
  weeksPerYear?: number;
}

export function normalizeWeeklyDemand(product: Product, weeksPerYear = 52): WeeklyDemandResult {
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

export function resolveWeeklyDemand(input: DemandFallbackInput): WeeklyDemandResult {
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
