export type EventKind =
  | "production"
  | "setup"
  | "break"
  | "maintenance"
  | "plannedStop"
  | "equipmentFailure"
  | "toolingIssue"
  | "logisticsWaiting"
  | "qualityHold"
  | "laborIssue";

export type PlanningMode = "planned" | "runRate";
export type DemandScenario = "launch" | "rampUp" | "massProduction" | "peak" | "custom";
export type AssignmentRole = "series" | "primary" | "backup" | "parallel" | "shared";
export type ApprovalStatus = "notRequired" | "draft" | "proposed" | "pending" | "approved" | "rejected" | "effective";
export type InvestmentStatus = "existing" | "plannedInvestment" | "futureOption";
export type ParameterSource = "manual" | "engineeringEstimate" | "runRate" | "historicalActual";
export type CapacityAnalysisMode = "earlyProject" | "runRateSimulation" | "massProductionForecast" | "actualReview";
export type PlannedActivitySource = "rule" | "schedule" | "manual" | "importedPlan";

export interface Product {
  productId: string;
  name: string;
  projectId?: string;
  version?: string;
  family?: string;
  weeklyDemand: number;
  annualDemand?: number;
  demandScenario: DemandScenario;
  routeId: string;
}

export interface StationMaster {
  stationId: string;
  // Legacy/local declared equipment code; this is not an authoritative physical UID.
  equipmentId?: string;
  name: string;
  stationGroupId?: string;
  investmentStatus: InvestmentStatus;
  sourceSystem?: string;
  sourceReference?: string;
  identityVerificationStatus?: "localDeclaration";
  qualifiedProcessTypeIds?: string[];
  qualifiedProcessIds?: string[];
  physicalLocationId?: string;
  digitalTwinNodeId?: string;
}

export interface StationGroup {
  stationGroupId: string;
  name: string;
  stationIds: string[];
  description?: string;
}

export interface OrderPlan {
  orderId: string;
  productId: string;
  quantity: number;
  dueDate?: string;
  priority?: "high" | "normal" | "low";
}

export type MasterDataStatus = "draft" | "released" | "obsolete";
export type ProcessTypeFamily = "manufacturing" | "quality";

export interface ProcessTypeDefinition {
  processTypeId: string;
  name: string;
  sourceSystem: string;
  status: MasterDataStatus;
  /** Quality gates stay separate from manufacturing processes. Older records may omit this and are inferred. */
  family?: ProcessTypeFamily;
}

export interface ProcessMaster {
  processId: string;
  name: string;
  processType: string;
  /** Legacy group compatibility; new station registration uses qualifiedProcessTypeIds instead. */
  compatibleStationGroupIds?: string[];
  description?: string;
  businessCode?: string;
  /** Reserved for a future upstream mapping. Local filing must not set this or treat it as processId. */
  externalProcessId?: string;
  externalVersion?: string;
  sourceSystem: string;
  status: MasterDataStatus;
  version: string;
  createdAt?: string;
}

export interface ProductRoute {
  routeId?: string;
  productId: string;
  version?: string;
  status?: MasterDataStatus;
  effectiveFrom?: string;
  effectiveTo?: string;
  sourceSystem?: string;
  /** Local review request only; it never authorizes a formal release. */
  reviewRequest?: { submittedAt: string; fingerprint: string };
  operations: Operation[];
  /** Absent transition means stations may feed any station at the next operation. */
  stationFlowPolicies?: StationFlowPolicy[];
}

export interface StationFlowPair {
  fromStationId: string;
  toStationId: string;
}

export interface StationFlowPolicy {
  fromOperationId: string;
  toOperationId: string;
  allowedPairs: StationFlowPair[];
}

export interface Operation {
  operationId: string;
  processId?: string;
  sequence: number;
  name: string;
  processType: string;
  description?: string;
  inputStageBomId?: string;
  outputStageBomId?: string;
  requiredOutputUnitsPerFinishedProduct?: number;
  quantitySourceVersion?: string;
  predecessorOperationIds?: string[];
  successorOperationIds?: string[];
  digitalTwinNodeId?: string;
  logisticsEdgeIds?: string[];
  bufferRuleId?: string;

  // Compatibility fields for the current required-minutes engine.
  // A local validation draft leaves these unset until a station parameter is confirmed.
  stationId?: string;
  standardCycleSec?: number;
  plannedPerformanceRate?: number;
  plannedQualityRate?: number;
  partShare?: number;
  toolCount?: number;
  cavityCount?: number;
}

export interface StageBOM {
  stageBomId: string;
  productId: string;
  routeId: string;
  operationId: string;
  inputItems?: string[];
  consumedItems?: string[];
  outputItem: string;
  requiredOutputUnitsPerFinishedProduct?: number;
  sourceVersion?: string;
  wipStateId: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  sourceSystem: string;
}

export interface WIPState {
  wipStateId: string;
  productId: string;
  routeId: string;
  operationId: string;
  name: string;
  sourceSystem: string;
}

export interface OperationStationAssignment {
  assignmentId: string;
  productId: string;
  routeId: string;
  operationId: string;
  stationId: string;
  role: AssignmentRole;
  allocationMode?: "fixedShare" | "forecastCalculated" | "manualScenario";
  plannedShare?: number;
  priority?: number;
  backupCondition?: string;
  customerApprovalRequired: boolean;
  approvalStatus: ApprovalStatus;
  planningAllowed: boolean;
  planningBlockerReason?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface OperationStationParameter {
  parameterId: string;
  supersedesParameterId?: string;
  calibrationRefs?: string[];
  operationId: string;
  stationId: string;
  standardCycleSec: number;
  piecesPerCycle: number;
  setupRuleId?: string;
  breakRuleId?: string;
  maintenanceRuleId?: string;
  plannedStopRuleId?: string;
  performanceRate: number;
  qualityRate: number;
  /** How the initial preset P was entered. Absent on older parameters. */
  performanceInputSource?: "defaultHundred" | "manualJudgement";
  parameterSource: ParameterSource;
  approvalStatus: ApprovalStatus;
  effectiveFrom?: string;
}

export interface PlannedActivityRule {
  ruleId: string;
  stationId?: string;
  operationId?: string;
  activityKind: "setup" | "break" | "maintenance" | "plannedStop";
  source: PlannedActivitySource;
  standardMinutes?: number;
  isRecurring: boolean;
  recurrencePattern?: string;
  approvalStatus: ApprovalStatus;
  effectiveFrom?: string;
}

export interface CapacityShareProfile {
  profileId: string;
  stationId: string;
  productId: string;
  operationId: string;
  analysisMode: CapacityAnalysisMode;
  requestedCapacityShare?: number;
  requiredCapacityShare?: number;
  actualCapacityShare?: number;
  basisWindow: "week" | "month" | "scheduleWindow";
  basisMinutes?: number;
  notes?: string;
}

export interface ProductionPolicy {
  policyId: string;
  stationId: string;
  productId: string;
  operationId: string;
  expediteDemandSupported: boolean;
  expeditePriorityRule?: string;
  insertionLossRuleId?: string;
  mixedProductionAllowed: boolean;
  setupMatrixId?: string;
  plannerDecisionRequired: boolean;
}

export interface BatchHUPolicy {
  policyId: string;
  productId: string;
  operationId: string;
  huType: "processHU" | "shippingHU" | "internalTransferHU";
  minimumProcessHU: number;
  batchMultiple: number;
  preferredBatchMultiple?: number;
  maxBatchMultiple?: number;
  splitAllowed: boolean;
  roundingRule: "roundUpToFullHU" | "fullHUOnly" | "exceptionApproval";
}

export interface StationCalendar {
  date: string;
  stationId: string;
  scheduledMinutes: number;
  projectShare: number;
  events: StationEvent[];
}

export interface StationEvent {
  kind: EventKind;
  minutes: number;
  source: "schedule" | "template" | "runRate" | "mes" | "manual";
  productId?: string;
  note?: string;
}

export interface TimelineEvent {
  id: string;
  stationId: string;
  kind: EventKind | "unscheduled";
  startMinute: number;
  endMinute: number;
  source: "schedule" | "template" | "runRate" | "mes" | "manual";
  productId?: string;
  orderId?: string;
  label?: string;
  note?: string;
  changeoverKey?: string;
  autoFilled?: boolean;
}

export interface TimelineValidationIssue {
  severity: "error" | "warning";
  code: "invalid_boundary" | "outside_horizon" | "overlap" | "gap";
  stationId: string;
  eventId?: string;
  message: string;
}

export interface ProductionSegmentRecord {
  segmentId: string;
  stationId: string;
  productId: string;
  startMinute: number;
  endMinute: number;
  okQty: number;
  nokQty: number;
  standardCycleSec: number;
  piecesPerCycle: number;
  orderId?: string;
  linkedEventId?: string;
  evidenceSource?: string;
}

export interface ProductionSegmentCalculation {
  elapsedMinutes: number;
  actualQty: number;
  observedCycleSec: number;
  expectedQtyAtStandard: number;
  missingQty: number;
  hiddenLossMinutes: number;
  performanceRate: number;
}

export interface SetupRule {
  stationId: string;
  fromProductId: string;
  toProductId: string;
  setupMinutes: number;
  validationMinutes?: number;
  source?: string;
}

export interface RunRateObservation {
  runId: string;
  stationId: string;
  productId: string;
  observedCycleSec?: number;
  sampleCount?: number;
  okQty?: number;
  nokQty?: number;
  observedLossMinutesByKind?: Partial<Record<EventKind, number>>;
}

export interface CapacityScenario {
  mode: PlanningMode;
  orders: OrderPlan[];
  routes: ProductRoute[];
  calendars: StationCalendar[];
  setupRules: SetupRule[];
  runRateObservations?: RunRateObservation[];
  capacityBufferRate: number;

  products?: Product[];
  processTypes?: ProcessTypeDefinition[];
  processMasters?: ProcessMaster[];
  stageBoms?: StageBOM[];
  wipStates?: WIPState[];
  stations?: StationMaster[];
  stationGroups?: StationGroup[];
  operationStationAssignments?: OperationStationAssignment[];
  operationStationParameters?: OperationStationParameter[];
  plannedActivityRules?: PlannedActivityRule[];
  capacityShareProfiles?: CapacityShareProfile[];
  productionPolicies?: ProductionPolicy[];
  batchHUPolicies?: BatchHUPolicy[];
}

export interface StationCapacityResult {
  stationId: string;
  scheduledMinutes: number;
  plannedSA: number;
  realSA: number;
  plannedAvailableMinutes: number;
  runRateAvailableMinutes: number;
  requiredMinutes: number;
  bufferedRequiredMinutes: number;
  gapMinutes: number;
  status: "ok" | "short";
  riskFlags: string[];
}
