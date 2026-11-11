import { useState } from 'react';
import type { PointerEvent } from 'react';
import { analyzeRouteReadiness, wallPieces } from '../app/activeImportedLayout';
import type { ActiveImportedLayout, LayoutPoint } from '../app/activeImportedLayout';

type Selection = { kind: 'region' | 'line' | 'point'; id: string };

function areaM2(region: ActiveImportedLayout['regions'][number], scale: number) {
  return region.overrideAreaM2 ?? Math.abs(region.end.x - region.start.x) * Math.abs(region.end.y - region.start.y) * scale ** 2;
}

function lineLengthM(line: ActiveImportedLayout['lines'][number], scale: number) {
  return Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y) * scale;
}

export function ImportedOperationalMap({ layout, compact = false }: { layout: ActiveImportedLayout; compact?: boolean }) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const routeIssues = analyzeRouteReadiness(layout);
  const routeBlockerCount = routeIssues.filter((issue) => issue.severity === 'blocker').length;
  const routeReviewCount = routeIssues.length - routeBlockerCount;
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<'annotations' | 'page'>('annotations');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const selectedRegion = selected?.kind === 'region' ? layout.regions.find((item) => item.id === selected.id) : undefined;
  const selectedLine = selected?.kind === 'line' ? layout.lines.find((item) => item.id === selected.id) : undefined;
  const selectedPoint = selected?.kind === 'point' ? layout.objectPoints.find((item) => item.id === selected.id) : undefined;
  const selectionName = selectedRegion?.name ?? selectedLine?.name ?? selectedPoint?.name ?? '点击图中对象查看属性';
  const detail = selectedRegion ? `功能区 · ${areaM2(selectedRegion, layout.scaleMetersPerPixel).toFixed(1)} m²`
    : selectedLine ? `${selectedLine.type === 'wall' ? '墙段' : '通道候选中心线'} · ${lineLengthM(selectedLine, layout.scaleMetersPerPixel).toFixed(1)} m${selectedLine.type === 'aisle' ? ` · 净宽 ${selectedLine.widthM ?? '待录入'} m` : ` · ${(selectedLine.openings ?? []).length} 处门洞`}`
      : selectedPoint ? `${selectedPoint.type} · ${Math.round(selectedPoint.position.x)}, ${Math.round(selectedPoint.position.y)} px`
        : '当前展示的是标注几何；物料流与工具通行尚未计算。';
  const coordinates = [
    ...layout.regions.flatMap((region) => [region.start, region.end]),
    ...layout.lines.flatMap((line) => [line.start, line.end]),
    ...layout.objectPoints.map((point) => point.position),
  ];
  const minX = coordinates.length ? Math.min(...coordinates.map((point) => point.x)) : 0;
  const maxX = coordinates.length ? Math.max(...coordinates.map((point) => point.x)) : layout.width;
  const minY = coordinates.length ? Math.min(...coordinates.map((point) => point.y)) : 0;
  const maxY = coordinates.length ? Math.max(...coordinates.map((point) => point.y)) : layout.height;
  const pad = Math.max(20, Math.max(maxX - minX, maxY - minY) * .04);
  const view = fitMode === 'annotations' && coordinates.length
    ? { x: minX - pad, y: minY - pad, width: Math.max(1, maxX - minX + pad * 2), height: Math.max(1, maxY - minY + pad * 2) }
    : { x: 0, y: 0, width: layout.width, height: layout.height };
  const sizeUnit = Math.max(view.width, view.height) / 350;
  const nameFontSize = Math.max(18, view.height / 80);
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart) setPan({ x: dragStart.panX + event.clientX - dragStart.x, y: dragStart.panY + event.clientY - dragStart.y });
  };
  const select = (kind: Selection['kind'], id: string) => setSelected({ kind, id });
  const keySelect = (event: React.KeyboardEvent<SVGElement>, kind: Selection['kind'], id: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(kind, id); }
  };
  const pointTitle = (point: LayoutPoint) => `${Math.round(point.x)}, ${Math.round(point.y)} px`;

  return <div className={compact ? 'imported-operational-shell is-compact' : 'imported-operational-shell'}>
    <div className="imported-operational-main">
      <div className="imported-operational-controls">
        <strong>{layout.unitName || layout.fileName} · {layout.buildingName || '楼栋待定义'} / {layout.floorLabel || '楼层待定义'}</strong>
        <span>第 {layout.pageNumber} 页 · {Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => { setFitMode((value) => value === 'annotations' ? 'page' : 'annotations'); setZoom(1); setPan({ x: 0, y: 0 }); }}>{fitMode === 'annotations' ? '查看整页' : '适配标注范围'}</button>
        <button type="button" onClick={() => setZoom((value) => Math.min(8, value + .5))}>放大</button>
        <button type="button" onClick={() => setZoom((value) => Math.max(1, value - .5))}>缩小</button>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>复位</button>
      </div>
      <div className="imported-operational-viewport" aria-label="已选 Layout 数字平面图"
        onPointerDown={(event) => { if (event.target !== event.currentTarget && !(event.target instanceof SVGSVGElement)) return; setDragStart({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={onPointerMove} onPointerUp={() => setDragStart(null)} onPointerCancel={() => setDragStart(null)}>
        <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="xMidYMid meet"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="img" aria-label="功能区、墙、门洞、通道候选线与点位">
          {layout.regions.map((region) => {
            const x = Math.min(region.start.x, region.end.x), y = Math.min(region.start.y, region.end.y);
            const width = Math.abs(region.end.x - region.start.x), height = Math.abs(region.end.y - region.start.y);
            return <g key={region.id} className={`imported-operational-region is-${region.type}`}>
              <rect x={x} y={y} width={width} height={height} role="button" tabIndex={0}
                aria-label={`${region.name}，${areaM2(region, layout.scaleMetersPerPixel).toFixed(1)} 平方米`}
                onClick={() => select('region', region.id)} onKeyDown={(event) => keySelect(event, 'region', region.id)} />
              {width > view.width * .06 && height > view.height * .025 && <text x={x + width / 2} y={y + height / 2} fontSize={nameFontSize}>{region.name}</text>}
            </g>;
          })}
          {layout.lines.map((line) => <g key={line.id} className={`imported-operational-line is-${line.type}`}>
            {(line.type === 'wall' ? wallPieces(line, layout.scaleMetersPerPixel) : [{ start: line.start, end: line.end }]).map((piece, index) =>
              <line key={index} x1={piece.start.x} y1={piece.start.y} x2={piece.end.x} y2={piece.end.y} />)}
            {(line.openings ?? []).map((opening) => <circle key={opening.id}
              cx={line.start.x + (line.end.x - line.start.x) * opening.at} cy={line.start.y + (line.end.y - line.start.y) * opening.at}
              r={Math.max(5 * sizeUnit, opening.widthM / layout.scaleMetersPerPixel * .07)} className="imported-operational-door" />)}
            <line className="hit" x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y}
              role="button" tabIndex={0} aria-label={`${line.name}，${lineLengthM(line, layout.scaleMetersPerPixel).toFixed(1)} 米`}
              onClick={() => select('line', line.id)} onKeyDown={(event) => keySelect(event, 'line', line.id)} />
          </g>)}
          {layout.objectPoints.map((point) => <g key={point.id} className={`imported-operational-point is-${point.type}`}>
            <circle cx={point.position.x} cy={point.position.y} r={5 * sizeUnit} role="button" tabIndex={0}
              aria-label={`${point.name}，${pointTitle(point.position)}`} onClick={() => select('point', point.id)}
              onKeyDown={(event) => keySelect(event, 'point', point.id)} />
            <text x={point.position.x + 7 * sizeUnit} y={point.position.y - 4 * sizeUnit} fontSize={nameFontSize * .8}>{point.name}</text>
          </g>)}
        </svg>
      </div>
      <div className="imported-operational-legend"><span><i className="region" />功能区</span><span><i className="wall" />墙</span><span><i className="door" />门洞</span><span><i className="aisle" />通道候选</span><span><i className="point" />点位</span></div>
    </div>
    {!compact && <aside className="imported-operational-side">
      <div><small>当前图纸</small><strong>{layout.fileName}</strong><p>{layout.buildingName || '楼栋待定义'} / {layout.floorLabel || '楼层待定义'} · 第 {layout.pageNumber} 页</p></div>
      <div><small>已标注空间</small><strong>{layout.regions.length} 区域 · {layout.lines.filter((line) => line.type === 'wall').length} 墙段</strong><p>{layout.lines.filter((line) => line.type === 'aisle').length} 条通道候选线 · {layout.objectPoints.length} 个点位</p></div>
      <div><small>选中对象</small><strong>{selectionName}</strong><p>{detail}</p></div>
      <div className="imported-operational-pending"><small>计算状态</small><strong>待映射物料流</strong><p>路径准备检查：{routeBlockerCount} 项阻断、{routeReviewCount} 项复核。请到 Layout 标注页逐项定位处理；当前图层不代表车辆可达或运力结果。</p></div>
    </aside>}
  </div>;
}
