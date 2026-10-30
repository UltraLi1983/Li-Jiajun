import type { RouteSegment, TransportResourceType } from '../../types/demo2';

const allTransportTypes: TransportResourceType[] = ['agv', 'forklift', 'dolly', 'pallet_jack', 'manual_cart'];

export function getEffectiveAllowedResourceTypes(segment: RouteSegment): TransportResourceType[] {
  const manualAllowed = segment.allowedResourceTypes?.length ? segment.allowedResourceTypes : undefined;
  if (manualAllowed) return normalizeManualAllowedTypes(manualAllowed);
  return inferSystemAllowedResourceTypes(segment.clearWidthM);
}

export function inferSystemAllowedResourceTypes(clearWidthM: number | undefined): TransportResourceType[] {
  if (!clearWidthM) return allTransportTypes;
  if (clearWidthM >= 3.5) return ['agv', 'forklift', 'dolly', 'pallet_jack', 'manual_cart'];
  if (clearWidthM >= 2.8) return ['agv', 'pallet_jack', 'manual_cart'];
  if (clearWidthM >= 2) return ['pallet_jack', 'manual_cart'];
  return ['manual_cart'];
}

export function normalizeManualAllowedTypes(types: TransportResourceType[]): TransportResourceType[] {
  const normalized = new Set<TransportResourceType>();
  for (const type of types) {
    normalized.add(type);
    if (type === 'manual_cart') normalized.add('pallet_jack');
  }
  return [...normalized];
}

export function canResourceUseSegment(segment: RouteSegment, resourceType: TransportResourceType) {
  return getEffectiveAllowedResourceTypes(segment).includes(resourceType);
}

export function requiresHandoffSegment(segment: RouteSegment, resourceType: TransportResourceType) {
  if (canResourceUseSegment(segment, resourceType)) return false;
  const allowedTypes = getEffectiveAllowedResourceTypes(segment);
  return allowedTypes.includes('manual_cart') || allowedTypes.includes('pallet_jack');
}
