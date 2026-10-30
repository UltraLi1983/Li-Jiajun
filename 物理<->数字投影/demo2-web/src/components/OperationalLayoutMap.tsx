import { useMemo, useState } from 'react';
import type { Demo2Scenario, RiskStatus, RoughCalculationResult } from '../types/demo2';

type OperationalLayoutMapProps = {
  scenario: Demo2Scenario;
  roughCalculation: RoughCalculationResult;
  compact?: boolean;
};

type Selection =
  | { type: 'area'; id: string }
  | { type: 'station'; id: string }
  | { type: 'delivery'; id: string }
  | { type: 'segment'; id: string };


export function OperationalLayoutMap({ scenario, roughCalculation, compact = false }: OperationalLayoutMapProps) {
  const [selected, setSelected] = useState<Selection | undefined>();
  const viewWidth = scenario.layout.width;
  const viewHeight = scenario.layout.height;
  const routeNodeById = useMemo(() => new Map(scenario.pathNetwork.nodes.map((node) => [node.id, node])), [scenario.pathNetwork.nodes]);
  const areaRiskById = useMemo(() => new Map(roughCalculation.areas.map((area) => [area.storageAreaId, area])), [roughCalculation.areas]);
  const resourceLoadByType = useMemo(() => new Map(roughCalculation.transportPlan.resourceLoads.map((load) => [load.resourceType, load])), [roughCalculation.transportPlan.resourceLoads]);
  const deliveryPressureById = useMemo(() => {
    const result = new Map<string, { trips: number; hu: number; materials: string[] }>();
    for (const material of roughCalculation.materials) {
      for (const allocation of material.deliveryPointCalculations) {
        const current = result.get(allocation.deliveryPointId) ?? { trips: 0, hu: 0, materials: [] };
        current.trips += allocation.replenishmentTripsPerShift;
        current.hu += allocation.huDemandPerShift;
        current.materials.push(material.materialName);
        result.set(allocation.deliveryPointId, current);
      }
    }
    return result;
  }, [roughCalculation.materials]);
  const segmentLoadById = useMemo(() => {
    const result = new Map<string, { resourceName: string; utilizationRate: number; trips: number }>();
    for (const leg of roughCalculation.transportPlan.legs) {
      const segmentId = leg.id.split(':')[0];
      const load = resourceLoadByType.get(leg.assignedResourceType);
      const current = result.get(segmentId);
      const next = {
        resourceName: leg.assignedResourceName,
        utilizationRate: load?.utilizationRate ?? 0,
        trips: (current?.trips ?? 0) + leg.tripsPerShift
      };
      if (!current || next.utilizationRate >= current.utilizationRate) result.set(segmentId, next);
    }
    return result;
  }, [resourceLoadByType, roughCalculation.transportPlan.legs]);

  const selectedDetail = selected ? describeSelection(selected, scenario, roughCalculation, deliveryPressureById, segmentLoadById) : undefined;
  const topAreas = [...roughCalculation.areas].sort((a, b) => b.utilizationRate - a.utilizationRate).slice(0, 3);
  const topLoads = [...roughCalculation.transportPlan.resourceLoads].sort((a, b) => b.utilizationRate - a.utilizationRate).slice(0, 3);

  return (
    <div className={compact ? 'operational-layout-shell operational-layout-shell-compact' : 'operational-layout-shell'}>
      <div className={`operational-map-canvas${scenario.layout.sourceType === 'sample' && scenario.layout.backgroundDataUrl ? ' operational-map-reconstructed' : ''}`} aria-label="factory operational layout map" style={{ aspectRatio: `${viewWidth} / ${viewHeight}`, backgroundImage: scenario.layout.backgroundDataUrl ? `url(${JSON.stringify(scenario.layout.backgroundDataUrl)})` : undefined, backgroundSize: scenario.layout.backgroundDataUrl ? '100% 100%' : undefined }}>
        <svg className="operational-route-layer" viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="img" aria-label="route network">
          <defs>
            <filter id="routeGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {scenario.pathNetwork.segments.map((segment) => {
            const from = routeNodeById.get(segment.fromNodeId);
            const to = routeNodeById.get(segment.toNodeId);
            if (!from || !to) return null;
            const segmentLoad = segmentLoadById.get(segment.id);
            const risk = segment.enabled === false ? 'disabled' : riskFromUtilization(segmentLoad?.utilizationRate ?? 0);
            return (
              <g key={segment.id}>
                <line
                  className={`operational-route-line operational-route-${risk}`}
                  x1={from.position.x}
                  y1={from.position.y}
                  x2={to.position.x}
                  y2={to.position.y}
                  onClick={() => setSelected({ type: 'segment', id: segment.id })}
                ><title>{segment.fromNodeId} → {segment.toNodeId} · {segment.distanceM}m</title></line>
                {!compact && selected?.type === 'segment' && selected.id === segment.id && (
                  <text
                    className="operational-route-label"
                    x={(from.position.x + to.position.x) / 2}
                    y={(from.position.y + to.position.y) / 2 - 8}
                  >
                    {segmentLoad?.resourceName ?? '未分配'} · {segment.distanceM}m
                  </text>
                )}
              </g>
            );
          })}
          {!compact && scenario.pathNetwork.nodes.map((node) => (
            <circle className="operational-route-node" key={node.id} cx={node.position.x} cy={node.position.y} r="5" />
          ))}
        </svg>

        {scenario.storageAreas.map((area) => {
          const areaResult = areaRiskById.get(area.id);
          return (
            <button
              key={area.id}
              type="button"
              className={`operational-area operational-area-${area.type} operational-risk-${areaResult?.riskStatus ?? 'normal'}`}
              style={boxStyle(area.boundary, viewWidth, viewHeight)}
              onClick={() => setSelected({ type: 'area', id: area.id })}
            >
              <strong>{area.name}</strong>
              <span>{areaResult ? `${Math.round(areaResult.utilizationRate * 100)}% area` : `${Math.round(area.calculatedAreaM2)} m²`}</span>
            </button>
          );
        })}

        {scenario.productionStations.map((station) => (
          <button
            key={station.id}
            type="button"
            className="operational-station"
            style={pointStyle(station.position, viewWidth, viewHeight)}
            onClick={() => setSelected({ type: 'station', id: station.id })}
            title={station.name}
          >
            {station.name.replace('工站 ', '')}
          </button>
        ))}

        {scenario.deliveryPoints.map((point) => {
          const pressure = deliveryPressureById.get(point.id);
          const risk = pressure ? riskFromTrips(pressure.trips) : 'normal';
          return (
            <button
              key={point.id}
              type="button"
              className={`operational-delivery operational-risk-${risk}`}
              style={pointStyle(point.position, viewWidth, viewHeight)}
              onClick={() => setSelected({ type: 'delivery', id: point.id })}
              title={point.name}
            >
              <span>{point.name.replace(' 配送点', '')}</span>
              {!compact && <em>{pressure?.trips ?? 0} trips</em>}
            </button>
          );
        })}

        <div className="operational-map-legend">
          <span><i className="legend-normal" />正常</span>
          <span><i className="legend-warning" />复核</span>
          <span><i className="legend-critical" />阻断</span>
          <span><i className="legend-disabled" />禁用</span>
        </div>
      </div>

      {!compact && (
        <aside className="operational-map-sidepanel">
          <div className="operational-map-card">
            <span>Selected Object</span>
            <strong>{selectedDetail?.title ?? '点击区域 / 配送点 / 路径段'}</strong>
            <p>{selectedDetail?.description ?? '这里用于 Demo 讲解：Layout 被读入后，系统把空间对象、配送点和路径责任转成可计算对象。'}</p>
          </div>
          <div className="operational-map-card">
            <span>Area Pressure</span>
            {topAreas.map((area) => (
              <div className="operational-map-row" key={area.storageAreaId}>
                <em>{area.storageAreaName}</em>
                <strong>{Math.round(area.utilizationRate * 100)}%</strong>
              </div>
            ))}
          </div>
          <div className="operational-map-card">
            <span>Transport Load</span>
            {topLoads.map((load) => (
              <div className="operational-map-row" key={load.resourceType}>
                <em>{load.resourceName}</em>
                <strong>{Math.round(load.utilizationRate * 100)}%</strong>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

function describeSelection(
  selected: Selection,
  scenario: Demo2Scenario,
  roughCalculation: RoughCalculationResult,
  deliveryPressureById: Map<string, { trips: number; hu: number; materials: string[] }>,
  segmentLoadById: Map<string, { resourceName: string; utilizationRate: number; trips: number }>
) {
  if (selected.type === 'area') {
    const area = scenario.storageAreas.find((item) => item.id === selected.id);
    const result = roughCalculation.areas.find((item) => item.storageAreaId === selected.id);
    return {
      title: area?.name ?? selected.id,
      description: result
        ? `面积需求 ${result.requiredAreaM2} m² / 可用 ${result.effectiveAreaM2} m²，利用率 ${Math.round(result.utilizationRate * 100)}%。`
        : '该区域暂无面积计算结果。'
    };
  }
  if (selected.type === 'delivery') {
    const point = scenario.deliveryPoints.find((item) => item.id === selected.id);
    const pressure = deliveryPressureById.get(selected.id);
    return {
      title: point?.name ?? selected.id,
      description: pressure
        ? `当前配送压力 ${pressure.hu} HU / shift，${pressure.trips} trips / shift；覆盖物料：${[...new Set(pressure.materials)].join('、')}。`
        : '该配送点当前没有绑定物料配送任务。'
    };
  }
  if (selected.type === 'segment') {
    const segment = scenario.pathNetwork.segments.find((item) => item.id === selected.id);
    const load = segmentLoadById.get(selected.id);
    return {
      title: segment ? `${segment.fromNodeId} → ${segment.toNodeId}` : selected.id,
      description: segment
        ? `${segment.distanceM}m，${segment.enabled === false ? '已禁用' : '已启用'}；${load ? `${load.resourceName} 负责，约 ${load.trips} trips / shift，资源负荷 ${Math.round(load.utilizationRate * 100)}%。` : '当前未出现在运输链路方案中。'}`
        : '未找到该路径段。'
    };
  }
  const station = scenario.productionStations.find((item) => item.id === selected.id);
  return {
    title: station?.name ?? selected.id,
    description: station ? `节拍 ${station.cycleTimeSec ?? '-'} sec；用于 T6 展示工序位置，后续会叠加 WIP 和工站级配送需求。` : '未找到该工站。'
  };
}

function boxStyle(boundary: Array<{ x: number; y: number }>, viewWidth: number, viewHeight: number) {
  const xs = boundary.map((point) => point.x);
  const ys = boundary.map((point) => point.y);
  return {
    left: `${(Math.min(...xs) / viewWidth) * 100}%`,
    top: `${(Math.min(...ys) / viewHeight) * 100}%`,
    width: `${((Math.max(...xs) - Math.min(...xs)) / viewWidth) * 100}%`,
    height: `${((Math.max(...ys) - Math.min(...ys)) / viewHeight) * 100}%`
  };
}

function pointStyle(point: { x: number; y: number }, viewWidth: number, viewHeight: number) {
  return {
    left: `${(point.x / viewWidth) * 100}%`,
    top: `${(point.y / viewHeight) * 100}%`
  };
}

function riskFromUtilization(utilizationRate: number): RiskStatus {
  if (utilizationRate >= 1) return 'critical';
  if (utilizationRate >= 0.85) return 'warning';
  return 'normal';
}

function riskFromTrips(trips: number): RiskStatus {
  if (trips >= 160) return 'critical';
  if (trips >= 80) return 'warning';
  return 'normal';
}
