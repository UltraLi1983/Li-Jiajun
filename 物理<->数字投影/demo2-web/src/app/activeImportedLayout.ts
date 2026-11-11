const STORAGE_KEY = 'demo2.activeImportedLayout.v1';

export type LayoutPoint = { x: number; y: number };
export type LayoutRegion = { id: string; name: string; type: string; start: LayoutPoint; end: LayoutPoint; overrideAreaM2?: number };
export type LayoutOpening = { id: string; at: number; widthM: number };
export type LayoutLine = { id: string; name: string; type: 'wall' | 'aisle'; start: LayoutPoint; end: LayoutPoint; widthM?: number; openings?: LayoutOpening[] };
export type LayoutObjectPoint = { id: string; name: string; type: string; position: LayoutPoint };

export type ActiveImportedLayout = {
  schemaVersion: 'demo2-imported-layout-v1';
  documentId: string;
  fileName: string;
  pageNumber: number;
  buildingName: string;
  floorLabel: string;
  unitName: string;
  width: number;
  height: number;
  scaleMetersPerPixel: number;
  regions: LayoutRegion[];
  lines: LayoutLine[];
  objectPoints: LayoutObjectPoint[];
  updatedAt: string;
};

export type SourceDraft = {
  documentId?: string; fileName: string; pdfPage?: number; buildingName?: string; floorLabel?: string; unitName?: string;
  width: number; height: number; points: LayoutPoint[]; knownDistanceM: number | null;
  regions?: LayoutRegion[]; lines?: LayoutLine[]; objectPoints?: LayoutObjectPoint[];
};

export function projectImportedDraft(draft: SourceDraft): ActiveImportedLayout | null {
  if (!draft.documentId || draft.points.length !== 2 || !draft.knownDistanceM || draft.knownDistanceM <= 0) return null;
  const pixels = Math.hypot(draft.points[1].x - draft.points[0].x, draft.points[1].y - draft.points[0].y);
  if (!Number.isFinite(pixels) || pixels <= 0 || draft.width <= 0 || draft.height <= 0) return null;
  return {
    schemaVersion: 'demo2-imported-layout-v1', documentId: draft.documentId, fileName: draft.fileName,
    pageNumber: draft.pdfPage ?? 1, buildingName: draft.buildingName ?? '', floorLabel: draft.floorLabel ?? '', unitName: draft.unitName ?? '',
    width: draft.width, height: draft.height, scaleMetersPerPixel: draft.knownDistanceM / pixels,
    regions: (draft.regions ?? []).map((region) => ({ ...region })),
    lines: (draft.lines ?? []).map((line) => ({ ...line, openings: [...(line.openings ?? [])] })),
    objectPoints: (draft.objectPoints ?? []).map((point) => ({ ...point })),
    updatedAt: new Date().toISOString(),
  };
}

export function sameImportedPage(layout: ActiveImportedLayout, draft: SourceDraft): boolean {
  return layout.documentId === draft.documentId && layout.pageNumber === (draft.pdfPage ?? 1);
}

export function loadActiveImportedLayout(): ActiveImportedLayout | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Partial<ActiveImportedLayout>;
    return value.schemaVersion === 'demo2-imported-layout-v1' && typeof value.documentId === 'string' &&
      typeof value.width === 'number' && typeof value.height === 'number' && typeof value.scaleMetersPerPixel === 'number' &&
      Array.isArray(value.regions) && Array.isArray(value.lines) && Array.isArray(value.objectPoints)
      ? value as ActiveImportedLayout : null;
  } catch { return null; }
}

export function persistActiveImportedLayout(layout: ActiveImportedLayout | null): boolean {
  try {
    if (layout) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    else window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch { return false; }
}

export function wallPieces(line: LayoutLine, scale: number): { start: LayoutPoint; end: LayoutPoint }[] {
  const lengthPx = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
  const interpolate = (t: number) => ({ x: line.start.x + (line.end.x - line.start.x) * t, y: line.start.y + (line.end.y - line.start.y) * t });
  const gaps = (line.openings ?? []).filter((opening) => opening.widthM > 0 && scale > 0 && lengthPx > 0)
    .map((opening) => ({ start: opening.at - opening.widthM / (2 * lengthPx * scale), end: opening.at + opening.widthM / (2 * lengthPx * scale) }))
    .filter((gap) => gap.start >= 0 && gap.end <= 1 && gap.start < gap.end).sort((a, b) => a.start - b.start);
  const pieces: { start: LayoutPoint; end: LayoutPoint }[] = [];
  let cursor = 0;
  for (const gap of gaps) { if (gap.start > cursor) pieces.push({ start: interpolate(cursor), end: interpolate(gap.start) }); cursor = Math.max(cursor, gap.end); }
  if (cursor < 1) pieces.push({ start: interpolate(cursor), end: line.end });
  return pieces;
}

export type RouteReadinessIssue = { id: string; severity: 'blocker' | 'review'; message: string; objectId?: string; objectKind?: 'region' | 'line' | 'point' };

function cross(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsTouch(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint, tolerancePx = 0) {
  if (Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + tolerancePx ||
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) > Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + tolerancePx) return false;
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC * abD <= 0 && cdA * cdB <= 0 ||
    Math.min(Math.hypot(a.x - c.x, a.y - c.y), Math.hypot(a.x - d.x, a.y - d.y), Math.hypot(b.x - c.x, b.y - c.y), Math.hypot(b.x - d.x, b.y - d.y)) <= tolerancePx;
}

function pointDistanceToLine(point: LayoutPoint, line: LayoutLine) {
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (line.start.x + dx * t), point.y - (line.start.y + dy * t));
}

export function aisleEntersRegion(aisle: LayoutLine, region: LayoutRegion): boolean {
  const margin = .5;
  const left = Math.min(region.start.x, region.end.x) + margin;
  const right = Math.max(region.start.x, region.end.x) - margin;
  const top = Math.min(region.start.y, region.end.y) + margin;
  const bottom = Math.max(region.start.y, region.end.y) - margin;
  if (left >= right || top >= bottom) return false;
  let enter = 0, leave = 1;
  for (const [start, delta, minimum, maximum] of [
    [aisle.start.x, aisle.end.x - aisle.start.x, left, right],
    [aisle.start.y, aisle.end.y - aisle.start.y, top, bottom],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (start <= minimum || start >= maximum) return false;
      continue;
    }
    const first = (minimum - start) / delta, second = (maximum - start) / delta;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
    if (enter >= leave) return false;
  }
  return enter < leave;
}

export function analyzeRouteReadiness(draft: SourceDraft | ActiveImportedLayout): RouteReadinessIssue[] {
  const issues: RouteReadinessIssue[] = [];
  const add = (id: string, severity: RouteReadinessIssue['severity'], message: string, objectKind?: RouteReadinessIssue['objectKind'], objectId?: string) =>
    issues.push({ id, severity, message, objectKind, objectId });
  const pixelDistance = 'points' in draft && draft.points.length === 2 ? Math.hypot(draft.points[1].x - draft.points[0].x, draft.points[1].y - draft.points[0].y) : 0;
  const scale = 'scaleMetersPerPixel' in draft ? draft.scaleMetersPerPixel : pixelDistance > 0 && draft.knownDistanceM && draft.knownDistanceM > 0 ? draft.knownDistanceM / pixelDistance : null;
  if (!scale) add('scale', 'blocker', '缺少有效两点标尺与实际距离，无法把路径换算为米。');
  const origins = (draft.objectPoints ?? []).filter((point) => point.type === 'warehouse_origin');
  const deliveries = (draft.objectPoints ?? []).filter((point) => point.type === 'delivery_point');
  const stations = (draft.objectPoints ?? []).filter((point) => point.type === 'production_station');
  const aisles = (draft.lines ?? []).filter((line) => line.type === 'aisle');
  const walls = (draft.lines ?? []).filter((line) => line.type === 'wall');
  if (!origins.length) add('origin', 'blocker', '缺少仓库出发点；请在仓库出口处添加。');
  if (!deliveries.length) add('delivery', 'blocker', '缺少配送点；请标出至少一个目标位置。');
  if (!aisles.length) add('aisle', 'blocker', '缺少通道候选中心线；尚无可复核的路网。');
  if (!stations.length) add('station', 'review', '生产工站未定位；配送点与生产任务仍无法关联。');
  if (!(draft.regions ?? []).some((region) => ['main_warehouse', 'transfer_warehouse', 'high_bay', 'supermarket'].includes(region.type)))
    add('storage', 'review', '尚无仓储类功能区；仓库出发点的归属需确认。');
  if (walls.length && !walls.some((wall) => (wall.openings ?? []).length)) add('doors', 'review', '墙段没有已标门洞；封闭区域的出入口需核实。');
  const productionRegions = (draft.regions ?? []).filter((region) => region.type === 'production_line');
  let openAislesWithoutWidth = 0;
  for (const aisle of aisles) {
    const enteredRegions = productionRegions.filter((region) => aisleEntersRegion(aisle, region));
    if (enteredRegions.length) {
      const names = enteredRegions.map((region) => region.name).join('、');
      add(`production:${aisle.id}`, 'review',
        `${aisle.name} 进入生产区（${names}）；需确认区内设备占地、内部通道及适用工具${aisle.widthM && aisle.widthM > 0 ? '。' : '，净宽尚未确认。'}`,
        'line', aisle.id);
    } else if (!aisle.widthM || aisle.widthM <= 0) openAislesWithoutWidth++;
    if (scale && walls.some((wall) => wallPieces(wall, scale).some((piece) => segmentsTouch(aisle.start, aisle.end, piece.start, piece.end))))
      add(`wall:${aisle.id}`, 'blocker', `${aisle.name} 穿过实体墙段；请检查门洞位置或调整通道。`, 'line', aisle.id);
  }
  if (openAislesWithoutWidth) add('open-clearance', 'review',
    `${openAislesWithoutWidth} 条框外通道未标净宽；运输工具暂为候选，仍须按墙、门和实际净空校核。`);
  if (aisles.length > 1 && scale) {
    const parent = aisles.map((_, index) => index);
    const root = (index: number): number => parent[index] === index ? index : root(parent[index]);
    for (let i = 0; i < aisles.length; i++) for (let j = i + 1; j < aisles.length; j++) {
      if (segmentsTouch(aisles[i].start, aisles[i].end, aisles[j].start, aisles[j].end, .2 / scale)) parent[root(j)] = root(i);
    }
    const components = new Set(parent.map((_, index) => root(index))).size;
    if (components > 1) add('disconnected', 'review', `通道候选线形成 ${components} 组未连通部分；请核对交点和转角。`);
  }
  if (scale && aisles.length) for (const point of [...origins, ...deliveries]) {
    const distanceM = Math.min(...aisles.map((aisle) => pointDistanceToLine(point.position, aisle))) * scale;
    if (distanceM > 3) add(`access:${point.id}`, 'review', `${point.name} 距最近通道候选线 ${distanceM.toFixed(1)} m，接入方式待确认。`, 'point', point.id);
  }
  for (const wall of walls) {
    const lengthM = scale ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) * scale : null;
    for (const opening of wall.openings ?? []) if (lengthM && (opening.widthM <= 0 || opening.at * lengthM < opening.widthM / 2 || (1 - opening.at) * lengthM < opening.widthM / 2))
      add(`door:${opening.id}`, 'blocker', `${wall.name} 的门洞超出墙段或净宽无效。`, 'line', wall.id);
  }
  return issues;
}
