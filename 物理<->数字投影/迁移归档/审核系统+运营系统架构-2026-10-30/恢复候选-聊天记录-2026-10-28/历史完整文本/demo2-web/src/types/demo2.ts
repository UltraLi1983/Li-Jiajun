export type Point = {
  x: number;
  y: number;
};

export type Polygon = Point[];

export type ScenarioType = 'baseline' | 'proposed' | 'stress';

export type StorageAreaType =
  | 'main_warehouse'
  | 'supermarket'
  | 'line_side'
  | 'wip'
  | 'high_bay'
  | 'receiving'
  | 'shipping';

export type TransportResourceType = 'agv' | 'forklift' | 'dolly' | 'pallet_jack' | 'manual_cart';

export type FrequencyClass = 'high' | 'medium' | 'low';

export type MaterialStrategyClass =
  | 'A1_high_frequency_small_part'
  | 'A2_high_frequency_large_part'
  | 'B_medium_frequency_kitting_part'
  | 'C_low_frequency_rackable_part'
  | 'D_special_constraint_part';

export type RiskStatus = 'normal' | 'warning' | 'critical';

export type FactoryLayout = {
  layoutId: string;
  name: string;
  sourceType: 'sample' | 'image' | 'pdf';
  width: number;
  height: number;
  scaleMetersPerPixel: number;
};

export type StorageArea = {
  id: string;
  name: string;
  type: StorageAreaType;
  boundary: Polygon;
  calculatedAreaM2: number;
  overrideAreaM2?: number;
};

export type ProductionLine = {
  id: string;
  name: string;
  boundary: Polygon;
};

export type ProductionStation = {
  id: string;
  name: string;
  productionLineId: string;
  operationStepId: string;
  position: Point;
  cycleTimeSec?: number;
};

export type DeliveryPoint = {
  id: string;
  name: string;
  position: Point;
  servesProductionStationIds: string[];
  storageAreaId?: string;
};

export type RouteNode = {
  id: string;
  name: string;
  position: Point;
};

export type RouteSegment = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  distanceM: number;
  bidirectional: boolean;
};

export type PathNetwork = {
  nodes: RouteNode[];
  segments: RouteSegment[];
};

export type ProductionCalendar = {
  weeklyDemandQty: number;
  productionDaysPerWeek: number;
  shiftsPerDay: number;
  hoursPerShift: number;
  effectiveHoursPerShift: number;
  plannedEffectiveProductionTimePerShift?: number;
  systemAvailabilityWithBreaks?: number;
  performanceRate?: number;
  qualityRate?: number;
  oeeWithBreaks?: number;
};

export type Material = {
  id: string;
  name: string;
  fitmentRate: number;
  qtyPerFinishedGood: number;
  frequencyClass: FrequencyClass;
  strategyClass: MaterialStrategyClass;
  assignedDeliveryPointId: string;
};

export type HandlingUnit = {
  id: string;
  materialId: string;
  huType: 'box' | 'pallet' | 'rack_cart' | 'container';
  qtyPerHu: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  stackable: boolean;
  maxStackLayers: number;
  weightKg?: number;
};

export type InventoryWaterLevel = {
  locationId: string;
  materialId: string;
  currentHuQty: number;
  minHuQty: number;
  operatingHuQty: number;
  maxHuQty: number;
  physicalCapacityHuQty: number;
  riskStatus: RiskStatus;
};

export type TransportResource = {
  id: string;
  name: string;
  type: TransportResourceType;
  quantity: number;
  speedMPerMin: number;
  huPerTrip: number;
  loadingTimeMin: number;
  unloadingTimeMin: number;
  availabilityRate: number;
  cvFactor: number;
};

export type SkuSlot = {
  id: string;
  materialId: string;
  deliveryPointId?: string;
  currentHuQty: number;
  minHuQty: number;
  operatingHuQty: number;
  maxHuQty: number;
  physicalCapacityHuQty: number;
  fifoEnabled: boolean;
  pickTimeEstimateMin: number;
  riskStatus: RiskStatus;
};

export type Lane = {
  id: string;
  name: string;
  levelIndex: number;
  skuSlots: SkuSlot[];
};

export type RackLevel = {
  id: string;
  levelIndex: number;
  lanes: Lane[];
};

export type Rack = {
  id: string;
  name: string;
  rackType: 'high_bay_rack' | 'supermarket_flow_rack' | 'line_side_rack' | 'wip_rack';
  storageAreaId: string;
  levels: RackLevel[];
};

export type WipBuffer = {
  id: string;
  upstreamOperationStepId: string;
  downstreamOperationStepId: string;
  storageAreaId: string;
  materialId: string;
  handlingUnitId: string;
  coverageTimeMin: number;
  minHuQty: number;
  operatingHuQty: number;
  maxHuQty: number;
  physicalCapacityHuQty: number;
};

export type ScenarioKpi = {
  totalTravelDistanceM: number;
  avgReplenishmentResponseMin: number;
  lineSideInventoryHu: number;
  supermarketAreaM2: number;
  storageAreaRequiredM2: number;
  transportUtilizationRate: number;
  shortageRiskCount: number;
  capacityRiskCount: number;
};

export type ScenarioPlan = {
  id: string;
  name: string;
  type: ScenarioType;
  description: string;
  supermarketModeEnabled: boolean;
  highBayRackEnabled: boolean;
  demandChangeFactor: number;
  kpi: ScenarioKpi;
};

export type Demo2Scenario = {
  id: string;
  name: string;
  layout: FactoryLayout;
  settings: {
    supermarketModeEnabled: boolean;
    highBayRackEnabled: boolean;
  };
  productionCalendar: ProductionCalendar;
  storageAreas: StorageArea[];
  productionLines: ProductionLine[];
  productionStations: ProductionStation[];
  deliveryPoints: DeliveryPoint[];
  pathNetwork: PathNetwork;
  materials: Material[];
  handlingUnits: HandlingUnit[];
  waterLevels: InventoryWaterLevel[];
  transportResources: TransportResource[];
  racks: Rack[];
  wipBuffers: WipBuffer[];
  scenarios: ScenarioPlan[];
};
