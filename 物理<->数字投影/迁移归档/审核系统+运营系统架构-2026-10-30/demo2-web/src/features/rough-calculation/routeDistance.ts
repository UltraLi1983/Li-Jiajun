import type { Demo2Scenario, MaterialRoughCalculation, RouteNode, RouteSegment } from '../../types/demo2';

const DEFAULT_ROUND_TRIP_DISTANCE_M = 52;
const DEFAULT_DISTANCE_IMPROVEMENT_FACTOR_WITH_SUPERMARKET = 0.72;

type RouteEndpoint = {
  nodeId?: string;
  source: 'explicit' | 'nearest' | 'missing';
};

export type RepresentativeRouteDistance = {
  roundTripDistanceM: number;
  profileName: string;
  routeCount: number;
  unreachableRouteCount: number;
  fallbackUsed: boolean;
};

type WeightedRouteTask = {
  fromNodeId: string;
  viaNodeId?: string;
  toNodeId: string;
  weight: number;
};

export function calculateRepresentativeRouteDistance(
  scenario: Demo2Scenario,
  materials: MaterialRoughCalculation[],
  supermarketEnabled: boolean
): RepresentativeRouteDistance {
  const mainWarehouseNode = resolveStorageNode(scenario, 'main_warehouse');
  const supermarketNode = resolveStorageNode(scenario, 'supermarket');
  const materialTasks = buildWeightedTasks(scenario, materials, supermarketEnabled, mainWarehouseNode, supermarketNode);

  if (!mainWarehouseNode.nodeId || materialTasks.length === 0) {
    return fallbackDistance(scenario, supermarketEnabled, 'Fallback · 未找到主仓通道节点');
  }

  const graph = buildGraph(scenario.pathNetwork.segments);
  let weightedDistance = 0;
  let totalWeight = 0;
  let unreachableRouteCount = 0;

  for (const task of materialTasks) {
    const outboundDistance = calculateTaskDistance(graph, task);
    if (outboundDistance == null) {
      unreachableRouteCount += 1;
      continue;
    }
    weightedDistance += outboundDistance * 2 * task.weight;
    totalWeight += task.weight;
  }

  if (totalWeight === 0) {
    const fallback = fallbackDistance(scenario, supermarketEnabled, 'Fallback · 存在不可达配送路径');
    return {
      ...fallback,
      routeCount: materialTasks.length,
      unreachableRouteCount: materialTasks.length || unreachableRouteCount,
      fallbackUsed: true
    };
  }

  return {
    roundTripDistanceM: weightedDistance / totalWeight,
    profileName: supermarketEnabled ? 'Main Warehouse → Supermarket → Delivery Point' : 'Main Warehouse → Delivery Point',
    routeCount: materialTasks.length,
    unreachableRouteCount,
    fallbackUsed: false
  };
}

function buildWeightedTasks(
  scenario: Demo2Scenario,
  materials: MaterialRoughCalculation[],
  supermarketEnabled: boolean,
  mainWarehouseNode: RouteEndpoint,
  supermarketNode: RouteEndpoint
): WeightedRouteTask[] {
  const tasks: WeightedRouteTask[] = [];

  for (const material of materials) {
    const deliveryPoint = scenario.deliveryPoints.find((item) => item.id === material.assignedDeliveryPointId);
    if (!deliveryPoint || !mainWarehouseNode.nodeId) continue;

    const deliveryNode = resolveDeliveryNode(scenario, deliveryPoint.routeNodeId, deliveryPoint.position);
    if (!deliveryNode.nodeId) continue;

    const routeViaSupermarket = supermarketEnabled
      && supermarketNode.nodeId
      && material.strategyClass !== 'D_special_constraint_part'
      && material.strategyClass !== 'A2_high_frequency_large_part';

    tasks.push({
      fromNodeId: mainWarehouseNode.nodeId,
      viaNodeId: routeViaSupermarket ? supermarketNode.nodeId : undefined,
      toNodeId: deliveryNode.nodeId,
      weight: Math.max(1, material.replenishmentTripsPerShift)
    });
  }

  return tasks;
}

function calculateTaskDistance(graph: Map<string, Array<{ to: string; distanceM: number }>>, task: WeightedRouteTask) {
  if (!task.viaNodeId || task.viaNodeId === task.fromNodeId || task.viaNodeId === task.toNodeId) {
    return shortestDistance(graph, task.fromNodeId, task.toNodeId);
  }
  const firstLeg = shortestDistance(graph, task.fromNodeId, task.viaNodeId);
  const secondLeg = shortestDistance(graph, task.viaNodeId, task.toNodeId);
  if (firstLeg == null || secondLeg == null) return null;
  return firstLeg + secondLeg;
}

function resolveStorageNode(scenario: Demo2Scenario, type: Demo2Scenario['storageAreas'][number]['type']): RouteEndpoint {
  const area = scenario.storageAreas.find((item) => item.type === type);
  if (!area) return { source: 'missing' };
  const center = polygonCenter(area.boundary);
  return resolveDeliveryNode(scenario, undefined, center);
}

function resolveDeliveryNode(scenario: Demo2Scenario, explicitNodeId: string | undefined, position: { x: number; y: number }): RouteEndpoint {
  if (explicitNodeId && scenario.pathNetwork.nodes.some((node) => node.id === explicitNodeId)) {
    return { nodeId: explicitNodeId, source: 'explicit' };
  }
  const nearest = nearestNode(scenario.pathNetwork.nodes, position);
  return nearest ? { nodeId: nearest.id, source: 'nearest' } : { source: 'missing' };
}

function nearestNode(nodes: RouteNode[], position: { x: number; y: number }) {
  return nodes.reduce<RouteNode | undefined>((best, node) => {
    if (!best) return node;
    return squaredDistance(node.position, position) < squaredDistance(best.position, position) ? node : best;
  }, undefined);
}

function polygonCenter(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length
  };
}

function squaredDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function buildGraph(segments: RouteSegment[]) {
  const graph = new Map<string, Array<{ to: string; distanceM: number }>>();
  for (const segment of segments) {
    if (segment.enabled === false || segment.distanceM <= 0) continue;
    addEdge(graph, segment.fromNodeId, segment.toNodeId, segment.distanceM);
    if (segment.bidirectional) addEdge(graph, segment.toNodeId, segment.fromNodeId, segment.distanceM);
  }
  return graph;
}

function addEdge(graph: Map<string, Array<{ to: string; distanceM: number }>>, from: string, to: string, distanceM: number) {
  graph.set(from, [...(graph.get(from) ?? []), { to, distanceM }]);
}

function shortestDistance(graph: Map<string, Array<{ to: string; distanceM: number }>>, fromNodeId: string, toNodeId: string) {
  if (fromNodeId === toNodeId) return 0;

  const distances = new Map<string, number>([[fromNodeId, 0]]);
  const visited = new Set<string>();

  while (true) {
    const current = getNearestUnvisited(distances, visited);
    if (!current) return null;
    const [nodeId, distance] = current;
    if (nodeId === toNodeId) return distance;
    visited.add(nodeId);

    for (const edge of graph.get(nodeId) ?? []) {
      if (visited.has(edge.to)) continue;
      const nextDistance = distance + edge.distanceM;
      if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextDistance);
      }
    }
  }
}

function getNearestUnvisited(distances: Map<string, number>, visited: Set<string>) {
  let best: [string, number] | undefined;
  for (const entry of distances.entries()) {
    if (visited.has(entry[0])) continue;
    if (!best || entry[1] < best[1]) best = entry;
  }
  return best;
}

function fallbackDistance(scenario: Demo2Scenario, supermarketEnabled: boolean, profileName: string): RepresentativeRouteDistance {
  const totalNetworkDistance = scenario.pathNetwork.segments.reduce((total, segment) => total + segment.distanceM, 0);
  const averageOneWayDistance = scenario.pathNetwork.segments.length ? totalNetworkDistance / scenario.pathNetwork.segments.length : 0;
  const roundTrip = averageOneWayDistance * 2 || DEFAULT_ROUND_TRIP_DISTANCE_M;
  return {
    roundTripDistanceM: supermarketEnabled ? roundTrip * DEFAULT_DISTANCE_IMPROVEMENT_FACTOR_WITH_SUPERMARKET : roundTrip,
    profileName,
    routeCount: 0,
    unreachableRouteCount: 0,
    fallbackUsed: true
  };
}
