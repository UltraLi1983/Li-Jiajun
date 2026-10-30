import type { Demo2Scenario } from '../types/demo2';

export type ScenarioExportSource = {
  source: 'sample' | 'savedDraft';
  isDirty: boolean;
  revision: number;
  lastSavedAt?: string;
  message: string;
};

export type ScenarioExportIssue = {
  severity: 'error' | 'warning';
  path: string;
  message: string;
};

export type ScenarioJsonExportPackage = {
  schemaVersion: 'demo2-scenario-export-v1';
  exportKind: 'factory-layout-scene-json';
  exportedAt: string;
  scene: {
    id: string;
    name: string;
  };
  source: {
    persistenceSource: ScenarioExportSource['source'];
    sourceLabel: string;
    isDirty: boolean;
    revision: number;
    lastSavedAt?: string;
    note: string;
  };
  manifest: {
    layout: {
      layoutId: string;
      sourceType: Demo2Scenario['layout']['sourceType'];
      sourceFileName?: string;
      width: number;
      height: number;
      scaleMetersPerPixel: number;
      calculationScaleMPerPx?: number;
      hasEmbeddedBackground: boolean;
    };
    objectCounts: {
      storageAreas: number;
      productionLines: number;
      productionStations: number;
      deliveryPoints: number;
      routeNodes: number;
      routeSegments: number;
      materials: number;
      handlingUnits: number;
      transportResources: number;
      racks: number;
      wipBuffers: number;
      scenarioPlans: number;
    };
  };
  validation: {
    status: 'passed' | 'warning' | 'failed';
    issues: ScenarioExportIssue[];
  };
  scenario: Demo2Scenario;
};

export function createScenarioJsonExportPackage(scenario: Demo2Scenario, source: ScenarioExportSource): ScenarioJsonExportPackage {
  const issues = validateScenarioForJsonExport(scenario, source);
  const hasError = issues.some((issue) => issue.severity === 'error');
  const hasWarning = issues.some((issue) => issue.severity === 'warning');

  return {
    schemaVersion: 'demo2-scenario-export-v1',
    exportKind: 'factory-layout-scene-json',
    exportedAt: new Date().toISOString(),
    scene: {
      id: scenario.id,
      name: scenario.name
    },
    source: {
      persistenceSource: source.source,
      sourceLabel: source.source === 'savedDraft' ? '本地草稿' : '标准样板',
      isDirty: source.isDirty,
      revision: source.revision,
      lastSavedAt: source.lastSavedAt,
      note: source.isDirty
        ? '导出内容包含当前会话未保存改动；尚未写入本地草稿或服务端草稿。'
        : source.source === 'savedDraft'
          ? '导出内容来自已保存的本地草稿；服务端版本库尚未接入。'
          : '导出内容来自标准样板；尚未保存为本地草稿或服务端草稿。'
    },
    manifest: {
      layout: {
        layoutId: scenario.layout.layoutId,
        sourceType: scenario.layout.sourceType,
        sourceFileName: scenario.layout.sourceFileName,
        width: scenario.layout.width,
        height: scenario.layout.height,
        scaleMetersPerPixel: scenario.layout.scaleMetersPerPixel,
        calculationScaleMPerPx: scenario.layout.calculationScaleMPerPx,
        hasEmbeddedBackground: Boolean(scenario.layout.backgroundDataUrl)
      },
      objectCounts: {
        storageAreas: scenario.storageAreas.length,
        productionLines: scenario.productionLines.length,
        productionStations: scenario.productionStations.length,
        deliveryPoints: scenario.deliveryPoints.length,
        routeNodes: scenario.pathNetwork.nodes.length,
        routeSegments: scenario.pathNetwork.segments.length,
        materials: scenario.materials.length,
        handlingUnits: scenario.handlingUnits.length,
        transportResources: scenario.transportResources.length,
        racks: scenario.racks.length,
        wipBuffers: scenario.wipBuffers.length,
        scenarioPlans: scenario.scenarios.length
      }
    },
    validation: {
      status: hasError ? 'failed' : hasWarning ? 'warning' : 'passed',
      issues
    },
    scenario
  };
}

export function downloadScenarioJsonExport(exportPackage: ScenarioJsonExportPackage) {
  const json = JSON.stringify(exportPackage, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildScenarioExportFileName(exportPackage);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildScenarioExportFileName(exportPackage: ScenarioJsonExportPackage) {
  const safeName = exportPackage.scene.name
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'demo2-factory-scene';
  const timestamp = exportPackage.exportedAt.replace(/[:.]/g, '-');
  return `${safeName}-r${exportPackage.source.revision}-${timestamp}.json`;
}

function validateScenarioForJsonExport(scenario: Demo2Scenario, source: ScenarioExportSource) {
  const issues: ScenarioExportIssue[] = [];
  const allIds = [
    ...scenario.storageAreas.map((item) => ({ id: item.id, path: 'storageAreas' })),
    ...scenario.productionLines.map((item) => ({ id: item.id, path: 'productionLines' })),
    ...scenario.productionStations.map((item) => ({ id: item.id, path: 'productionStations' })),
    ...scenario.deliveryPoints.map((item) => ({ id: item.id, path: 'deliveryPoints' })),
    ...scenario.pathNetwork.nodes.map((item) => ({ id: item.id, path: 'pathNetwork.nodes' })),
    ...scenario.pathNetwork.segments.map((item) => ({ id: item.id, path: 'pathNetwork.segments' }))
  ];
  const seenIds = new Map<string, string>();

  for (const item of allIds) {
    if (!item.id.trim()) {
      issues.push({ severity: 'error', path: item.path, message: '存在空 ID，对象无法稳定保存或回写。' });
      continue;
    }
    const previousPath = seenIds.get(item.id);
    if (previousPath) {
      issues.push({ severity: 'error', path: `${previousPath} / ${item.path}`, message: `ID ${item.id} 重复。` });
    }
    seenIds.set(item.id, item.path);
  }

  const routeNodeIds = new Set(scenario.pathNetwork.nodes.map((node) => node.id));
  for (const [index, point] of scenario.deliveryPoints.entries()) {
    if (!point.routeNodeId) {
      issues.push({ severity: 'warning', path: `deliveryPoints[${index}].routeNodeId`, message: `${point.name} 未连接通道节点，后续运输计算应提示不可达。` });
      continue;
    }
    if (!routeNodeIds.has(point.routeNodeId)) {
      issues.push({ severity: 'error', path: `deliveryPoints[${index}].routeNodeId`, message: `${point.name} 连接了不存在的通道节点 ${point.routeNodeId}。` });
    }
  }

  for (const [index, segment] of scenario.pathNetwork.segments.entries()) {
    if (!routeNodeIds.has(segment.fromNodeId)) {
      issues.push({ severity: 'error', path: `pathNetwork.segments[${index}].fromNodeId`, message: `${segment.id} 的起点节点不存在。` });
    }
    if (!routeNodeIds.has(segment.toNodeId)) {
      issues.push({ severity: 'error', path: `pathNetwork.segments[${index}].toNodeId`, message: `${segment.id} 的终点节点不存在。` });
    }
    if (!Number.isFinite(segment.distanceM) || segment.distanceM < 0) {
      issues.push({ severity: 'error', path: `pathNetwork.segments[${index}].distanceM`, message: `${segment.id} 的距离必须是非负数字。` });
    }
  }

  const scale = scenario.layout.calculationScaleMPerPx ?? scenario.layout.scaleMetersPerPixel;
  if (!Number.isFinite(scale) || scale <= 0) {
    issues.push({ severity: 'error', path: 'layout.calculationScaleMPerPx', message: '比例尺必须大于 0。' });
  }

  if (source.isDirty) {
    issues.push({ severity: 'warning', path: 'source.isDirty', message: '当前会话存在未保存改动；导出前请向客户说明这不是服务端生效版本。' });
  }

  return issues;
}
