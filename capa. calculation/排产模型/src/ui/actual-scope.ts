export function parseActualScopeKey(key: string): { productId: string; operationId: string; stationId: string } {
  const parts = key.split("::");
  const scope = parts.length === 4 ? parts.slice(1) : parts.length === 3 ? parts : [];
  return { productId: scope[0] ?? "", operationId: scope[1] ?? "", stationId: scope[2] ?? "" };
}

export function planScopeKeyForRoute(productId: string, stationId: string, routeId = ""): string {
  return [routeId, productId, stationId].filter((part, index) => index !== 0 || part !== "").join("::");
}

export function actualScopeKeyForRoute(productId: string, operationId: string, stationId: string, routeId = ""): string {
  return [routeId, productId, operationId, stationId].filter((part, index) => index !== 0 || part !== "").join("::");
}
