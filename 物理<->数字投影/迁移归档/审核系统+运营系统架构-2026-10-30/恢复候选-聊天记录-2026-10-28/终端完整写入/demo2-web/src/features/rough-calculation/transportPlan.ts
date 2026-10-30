import { getEffectiveAllowedResourceTypes } from './routeAccess';
import type { Demo2Scenario, MaterialRoughCalculation, RouteSegment, TransportResource, TransportResourceType } from '../../types/demo2';

export type TransportPlanLeg = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  distanceM: number;
  assignedResourceType: TransportResourceType;
  assignedResourceName: string;
  routeTaskCount: number;
  tripsPerShift: number;
  roundTripDistanceM: number;
  travelTimeMin: number;
};

export type TransportPlanSummary = {
  legs: TransportPlanLeg[];
  resourceLoads: Array<{
    resourceType: TransportResourceType;
    resourceName: string;
    legCount: number;
    tripsPerShift: number;
    roundTripDistanceM: number;
    travelTimeMin: number;
  }>;
  unresolvedLegCount: number;
};

const resourcePriority: TransportResourceType[] = ['forklift', 'agv', 'dolly', 'pallet_jack', 'manual_cart'];

export function calculateTransportPlan(scenario: Demo2Scenario, materials: MaterialRoughCalculation[]): TransportPlanSummary {
  const resourcesByType = new Map(scenario.transportResources.map((resource) => [resource.type, resource]));
  const segmentById = new Map(scenario.pathNetwork.segments.map((segment) => [segment.id, segment]));
  const legLoads = new Map<string, TransportPlanLeg>();
  let unresolvedLegCount = 0;

  for (const material of materials) {
    const deliveryPoint = scenario.deliveryPoints.find((point) => point.id === material.assignedDeliveryPointId);
    if (!deliveryPoint?.routeNodeId) {
      unresolvedLegCount += 1;
      continue;
    }

    const segmentIds = findShortestSegmentPath(scenario, resolveNearestStorageNodeId(scenario, 'main_warehouse'), deliveryPoint.routeNodeId);
    if (!segmentIds) {
      unresolvedLegCount += 1;
      continue;
    }

    for (const segmentId of segmentIds) {
      const segment = segmentById.get(segmentId);
      if (!segment) continue;
      const assignedResource = chooseResourceForSegment(segment, resourcesByType);
      if (!assignedResource) {
        unresolvedLegCount += 1;
        continue;
      }
      const fromNodeId = segment.fromNodeId;
      const toNodeId = segment.toNodeId;
      const key = `${segment.id}:${assignedResource.type}`;
      const current = legLoads.get(key);
      const tripsPerShift = Math.max(1, material.replenishmentTripsPerShift);
      const roundTripDistanceM = segment.distanceM * 2 * tripsPerShift;
      const travelTimeMin = roundTripDistanceM / assignedResource.speedMPerMin;

      if (current) {
        current.routeTaskCount += 1;
        current.tripsPerShift += tripsPerShift;
        current.roundTripDistanceM += roundTripDistanceM;
        current.travelTimeMin += travelTimeMin;
      } else {
        legLoads.set(key, {
          id: key,
          fromNodeId,
          toNodeId,
          distanceM: segment.distanceM,
          assignedResourceType: assignedResource.type,
          assignedResourceName: assignedResource.name,
          routeTaskCount: 1,
          tripsPerShift,
          roundTripDistanceM,
          travelTimeMin
        });
      }
    }
  }

  const legs = [...legLoads.values()].map((leg) => ({
    ...leg,
    distanceM: round1(leg.distanceM),
    roundTripDistanceM: round1(leg.roundTripDistanceM),
    travelTimeMin: round1(leg.travelTimeMin)
  }));

  return {
    legs,
    resourceLoads: summarizeByResource(legs),
    unresolvedLegCount
  };
}

function chooseResourceForSegment(segment: RouteSegment, resourcesByType: Map<TransportResourceType, TransportResource>) {
  const allowedTypes = getEffectiveAllowedResourceTypes(segment);
  const selectedType = resourcePriority.find((type) => allowedTypes.includes(type) && resourcesByType.has(type));
  return selectedType ? resourcesByType.get(selectedType) : undefined;
}

function resolveNearestStorageNodeId(scenario: Demo2Scenario, type: Demo2Scenario['storageAreas'][number]['type']) {
  const area = scenario.storageAreas.find((item) => item.type === type);
  const center = area ? polygonCenter(area.boundary) : { x: 0, y: 0 };
  return scenario.pathNetwork.nodes.reduce<string | undefined>((bestNodeId, node) => {
    const bestNode = scenario.pathNetwork.nodes.find((item) => item.id === bestNodeId);
    if (!bestNode) return node.id;
    return squaredDistance(node.position, center) < squaredDistance(bestNode.position, center) ? node.id : bestNodeId;
  }, undefined);
}

function findShortestSegmentPath(scenario: Demo2Scenario, fromNodeId: string | undefined, toNodeId: string) {
  if (!fromNodeId) return undefined;
  if (fromNodeId === toNodeId) return [];

  const graph = new Map<string, Array<{ toNodeId: string; distanceM: number; segmentId: string }>>();
  for (const segment of scenario.pathNetwork.segments) {
    if (segment.enabled === false || segment.distanceM <= 0) continue;
    addEdge(graph, segment.fromNodeId, segment.toNodeId, segment.distanceM, segment.id);
    if (segment.bidirectional) addEdge(graph, segment.toNodeId, segment.fromNodeId, segment.distanceM, segment.id);
  }

  const distances = new Map<string, number>([[fromNodeId, 0]]);
  const previous = new Map<string, { nodeId: string; segmentId: string }>();
  const visited = new Set<string>();

  while (true) {
    const current = getNearestUnvisited(distances, visited);
    if (!current) return undefined;
    const [nodeId, distance] = current;
    if (nodeId === toNodeId) return reconstructPath(previous, fromNodeId, toNodeId);
    visited.add(nodeId);

    for (const edge of graph.get(nodeId) ?? []) {
      if (visited.has(edge.toNodeId)) continue;
      const nextDistance = distance + edge.distanceM;
      if (nextDistance < (distances.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.toNodeId, nextDistance);
        previous.set(edge.toNodeId, { nodeId, segmentId: edge.segmentId });
      }
    }
  }
}

function addEdge(graph: Map<string, Array<{ toNodeId: string; distanceM: number; segmentId: string }>>, fromNodeId: string, toNodeId: string, distanceM: number, segmentId: string) {
  graph.set(fromNodeId, [...(graph.get(fromNodeId) ?? []), { toNodeId, distanceM, segmentId }]);
}

function getNearestUnvisited(distances: Map<string, number>, visited: Set<string>) {
  let best: [string, number] | undefined;
  for (const entry of distances.entries()) {
    if (visited.has(entry[0])) continue;
    if (!best || entry[1] < best[1]) best = entry;
  }
  return best;
}

function reconstructPath(previous: Map<string, { nodeId: string; segmentId: string }>, fromNodeId: string, toNodeId: string) {
  const segmentIds: string[] = [];
  let currentNodeId = toNodeId;
  while (currentNodeId !== fromNodeId) {
    const step = previous.get(currentNodeId);
    if (!step) return undefined;
    segmentIds.unshift(step.segmentId);
    currentNodeId = step.nodeId;
  }
  return segmentIds;
}

function summarizeByResource(legs: TransportPlanLeg[]): TransportPlanSummary['resourceLoads'] {
  const byResource = new Map<TransportResourceType, TransportPlanSummary['resourceLoads'][number]>();
  for (const leg of legs) {
    const current = byResource.get(leg.assignedResourceType);
    if (current) {
      current.legCount += 1;
      current.tripsPerShift += leg.tripsPerShift;
      current.roundTripDistanceM += leg.roundTripDistanceM;
      current.travelTimeMin += leg.travelTimeMin;
    } else {
      byResource.set(leg.assignedResourceType, {
        resourceType: leg.assignedResourceType,
        resourceName: leg.assignedResourceName,
        legCount: 1,
        tripsPerShift: leg.tripsPerShift,
        roundTripDistanceM: leg.roundTripDistanceM,
        travelTimeMin: leg.travelTimeMin
      });
    }
  }

  return [...byResource.values()].map((item) => ({
    ...item,
    roundTripDistanceM: round1(item.roundTripDistanceM),
    travelTimeMin: round1(item.travelTimeMin)
  }));
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

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
