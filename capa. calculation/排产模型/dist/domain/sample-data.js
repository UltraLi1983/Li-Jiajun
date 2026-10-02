export const sampleScenario = {
    mode: "planned",
    capacityBufferRate: 0.05,
    orders: [
        { orderId: "O-001", productId: "A-Housing", quantity: 1800, priority: "high" },
        { orderId: "O-002", productId: "B-Housing", quantity: 1200, priority: "normal" },
    ],
    products: [
        {
            productId: "A-Housing",
            name: "Product A Housing",
            projectId: "PROJECT-A",
            version: "V1",
            family: "Housing",
            weeklyDemand: 1800,
            annualDemand: 93600,
            demandScenario: "launch",
            routeId: "route-a-housing-v1",
        },
        {
            productId: "B-Housing",
            name: "Product B Housing",
            family: "Housing",
            weeklyDemand: 1200,
            demandScenario: "massProduction",
            routeId: "route-b-housing-v1",
        },
    ],
    processMasters: [
        { processId: "process-machining", name: "Machining", processType: "machining", sourceSystem: "local-validation", status: "released", version: "1.0" },
        { processId: "process-assembly", name: "Assembly", processType: "assembly", sourceSystem: "local-validation", status: "released", version: "1.0" },
        { processId: "process-gp12", name: "GP12", processType: "qualityGate", sourceSystem: "local-validation", status: "released", version: "1.0" },
        { processId: "process-packaging", name: "Packaging", processType: "packaging", sourceSystem: "local-validation", status: "released", version: "1.0" },
    ],
    stageBoms: [
        { stageBomId: "bom-a-op10-out", productId: "A-Housing", routeId: "route-a-housing-v1", operationId: "op-a-10", outputItem: "A-machined-wip", wipStateId: "wip-a-op10", sourceSystem: "local-validation" },
        { stageBomId: "bom-a-op20-out", productId: "A-Housing", routeId: "route-a-housing-v1", operationId: "op-a-20", inputItems: ["A-machined-wip"], outputItem: "A-assembled", wipStateId: "wip-a-op20", sourceSystem: "local-validation" },
    ],
    wipStates: [
        { wipStateId: "wip-a-op10", productId: "A-Housing", routeId: "route-a-housing-v1", operationId: "op-a-10", name: "Machined WIP", sourceSystem: "local-validation" },
        { wipStateId: "wip-a-op20", productId: "A-Housing", routeId: "route-a-housing-v1", operationId: "op-a-20", name: "Assembled product", sourceSystem: "local-validation" },
    ],
    stations: [
        { stationId: "OP10", name: "Machining 01", stationGroupId: "grp-machining", investmentStatus: "existing", physicalLocationId: "plant-a-cell-machining-01", digitalTwinNodeId: "dt-node-op10" },
        { stationId: "OP10B", name: "Machining 02", stationGroupId: "grp-machining", investmentStatus: "existing", physicalLocationId: "plant-a-cell-machining-02", digitalTwinNodeId: "dt-node-op10b" },
        { stationId: "OP10C", name: "Future Machining 03", stationGroupId: "grp-machining", investmentStatus: "plannedInvestment", physicalLocationId: "plant-a-cell-machining-03" },
        { stationId: "OP20", name: "Assembly 01", stationGroupId: "grp-assembly", investmentStatus: "existing", physicalLocationId: "plant-a-cell-assembly-01", digitalTwinNodeId: "dt-node-op20" },
    ],
    stationGroups: [
        { stationGroupId: "grp-machining", name: "Machining capable stations", stationIds: ["OP10", "OP10B", "OP10C"], description: "Stations technically able to run Product A OP10 machining." },
        { stationGroupId: "grp-assembly", name: "Assembly capable stations", stationIds: ["OP20"], description: "Assembly stations for Product A OP20." },
    ],
    routes: [
        {
            routeId: "route-a-housing-v1",
            productId: "A-Housing",
            version: "1.0",
            status: "released",
            effectiveFrom: "2026-01-01",
            sourceSystem: "local-validation",
            operations: [
                { operationId: "op-a-10", processId: "process-machining", outputStageBomId: "bom-a-op10-out", sequence: 10, name: "Machining", processType: "machining", successorOperationIds: ["op-a-20"], digitalTwinNodeId: "dt-node-route-a-op10", logisticsEdgeIds: ["dt-edge-op10-op20"], stationId: "OP10", standardCycleSec: 24, plannedPerformanceRate: 1, plannedQualityRate: 1, partShare: 1 },
                { operationId: "op-a-20", processId: "process-assembly", inputStageBomId: "bom-a-op10-out", outputStageBomId: "bom-a-op20-out", sequence: 20, name: "Assembly", processType: "assembly", predecessorOperationIds: ["op-a-10"], stationId: "OP20", standardCycleSec: 15, plannedPerformanceRate: 1, plannedQualityRate: 1, partShare: 1 },
            ],
        },
        {
            routeId: "route-b-housing-v1",
            productId: "B-Housing",
            version: "1.0",
            status: "released",
            effectiveFrom: "2026-01-01",
            sourceSystem: "local-validation",
            operations: [
                { operationId: "op-b-10", sequence: 10, name: "Machining", processType: "machining", stationId: "OP10", standardCycleSec: 29, plannedPerformanceRate: 0.90, plannedQualityRate: 0.97, partShare: 1 },
            ],
        },
    ],
    operationStationAssignments: [
        { assignmentId: "assign-a-op10-op10", productId: "A-Housing", routeId: "route-a-housing-v1", operationId: "op-a-10", stationId: "OP10", role: "primary", allocationMode: "fixedShare", plannedShare: 0.7, priority: 1, customerApprovalRequired: false, approvalStatus: "notRequired", planningAllowed: true },
        { assignmentId: "assign-a-op10-op10b", productId: "A-Housing", routeId: "route-a-housing-v1", operationId: "op-a-10", stationId: "OP10B", role: "parallel", allocationMode: "fixedShare", plannedShare: 0.3, priority: 2, customerApprovalRequired: false, approvalStatus: "notRequired", planningAllowed: true },
        { assignmentId: "assign-a-op10-op10c", productId: "A-Housing", routeId: "route-a-housing-v1", operationId: "op-a-10", stationId: "OP10C", role: "backup", priority: 3, backupCondition: "Use only after customer process approval and capacity shortage confirmation.", customerApprovalRequired: true, approvalStatus: "pending", planningAllowed: false, planningBlockerReason: "Customer approval pending" },
        { assignmentId: "assign-a-op20-op20", productId: "A-Housing", routeId: "route-a-housing-v1", operationId: "op-a-20", stationId: "OP20", role: "primary", allocationMode: "forecastCalculated", priority: 1, customerApprovalRequired: false, approvalStatus: "notRequired", planningAllowed: true },
    ],
    operationStationParameters: [
        { parameterId: "param-a-op10-op10", operationId: "op-a-10", stationId: "OP10", standardCycleSec: 24, piecesPerCycle: 1, setupRuleId: "setup-op10-a-b", performanceRate: 1, qualityRate: 1, parameterSource: "engineeringEstimate", approvalStatus: "approved" },
        { parameterId: "param-a-op10-op10b", operationId: "op-a-10", stationId: "OP10B", standardCycleSec: 25, piecesPerCycle: 1, setupRuleId: "setup-op10-a-b", performanceRate: 1, qualityRate: 1, parameterSource: "engineeringEstimate", approvalStatus: "approved" },
        { parameterId: "param-a-op20-op20", operationId: "op-a-20", stationId: "OP20", standardCycleSec: 15, piecesPerCycle: 1, performanceRate: 1, qualityRate: 1, parameterSource: "engineeringEstimate", approvalStatus: "approved" },
    ],
    plannedActivityRules: [
        { ruleId: "break-two-per-shift", stationId: "OP10", activityKind: "break", source: "rule", standardMinutes: 30, isRecurring: true, recurrencePattern: "2x per 12h shift", approvalStatus: "approved" },
        { ruleId: "pm-weekly-op10", stationId: "OP10", activityKind: "maintenance", source: "rule", standardMinutes: 120, isRecurring: true, recurrencePattern: "weekly", approvalStatus: "approved" },
        { ruleId: "quality-release-op20", stationId: "OP20", operationId: "op-a-20", activityKind: "plannedStop", source: "schedule", standardMinutes: 30, isRecurring: false, approvalStatus: "proposed" },
    ],
    capacityShareProfiles: [
        { profileId: "share-a-op10-requested", stationId: "OP10", productId: "A-Housing", operationId: "op-a-10", analysisMode: "earlyProject", requestedCapacityShare: 0.25, basisWindow: "week", notes: "Project phase requested share converted from weekly demand and standard minutes." },
        { profileId: "share-a-op20-required", stationId: "OP20", productId: "A-Housing", operationId: "op-a-20", analysisMode: "massProductionForecast", requiredCapacityShare: 0.32, basisWindow: "week" },
    ],
    productionPolicies: [
        { policyId: "policy-a-op10", stationId: "OP10", productId: "A-Housing", operationId: "op-a-10", expediteDemandSupported: true, insertionLossRuleId: "setup-op10-a-b", mixedProductionAllowed: true, setupMatrixId: "setup-op10", plannerDecisionRequired: true },
    ],
    batchHUPolicies: [
        { policyId: "hu-a-op10", productId: "A-Housing", operationId: "op-a-10", huType: "processHU", minimumProcessHU: 120, batchMultiple: 120, preferredBatchMultiple: 240, splitAllowed: true, roundingRule: "exceptionApproval" },
    ],
    calendars: [
        {
            date: "2026-09-14",
            stationId: "OP10",
            scheduledMinutes: 1440,
            projectShare: 0.85,
            events: [
                { kind: "break", minutes: 90, source: "template" },
                { kind: "maintenance", minutes: 35, source: "template" },
                { kind: "setup", minutes: 45, source: "schedule", productId: "B-Housing" },
            ],
        },
    ],
    setupRules: [
        { stationId: "OP10", fromProductId: "A-Housing", toProductId: "B-Housing", setupMinutes: 45 },
    ],
};
