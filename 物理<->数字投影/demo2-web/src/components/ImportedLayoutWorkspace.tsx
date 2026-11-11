import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { aisleEntersRegion, analyzeRouteReadiness, projectImportedDraft, sameImportedPage } from '../app/activeImportedLayout';
import type { RouteReadinessIssue } from '../app/activeImportedLayout';
import { useScenarioStore } from '../app/scenarioStore';

const DB_NAME = 'demo2-layout-workspace';
const STORE_NAME = 'drafts';
const DRAFT_ID = 'current';

type PixelPoint = { x: number; y: number };
type RegionType = 'main_warehouse' | 'transfer_warehouse' | 'supermarket' | 'line_side' | 'wip' | 'high_bay' | 'production_line' | 'crane_caution';
type DraftRegion = { id: string; name: string; type: RegionType; start: PixelPoint; end: PixelPoint; overrideAreaM2?: number };
type ObjectPointType = 'warehouse_origin' | 'production_station' | 'delivery_point' | 'route_node' | 'door';
type DraftObjectPoint = { id: string; name: string; type: ObjectPointType; position: PixelPoint };
type CandidatePoint = DraftObjectPoint & { reason: string };
type WallOpening = { id: string; at: number; widthM: number };
type DraftLine = { id: string; name: string; type: 'wall' | 'aisle'; start: PixelPoint; end: PixelPoint; widthM?: number; blocksMovement: boolean; fromPointId?: string; toPointId?: string; wallGroupId?: string; fromVertexId?: string; toVertexId?: string; openings?: WallOpening[] };
const pointTypes: { value: ObjectPointType; label: string }[] = [
  { value: 'warehouse_origin', label: '仓库出发点' }, { value: 'production_station', label: '生产工站' }, { value: 'delivery_point', label: '配送点' },
  { value: 'route_node', label: '通道节点' }, { value: 'door', label: '旧版门点位（待关联墙）' },
];
type DeletedLine = { line: DraftLine; index: number };
type PageAnnotations = { points: PixelPoint[]; knownDistanceM: number | null; regions: DraftRegion[]; objectPoints?: DraftObjectPoint[]; lines?: DraftLine[]; deletedLines?: DeletedLine[]; buildingName: string; floorLabel: string; unitName: string };
const regionTypes: { value: RegionType; label: string }[] = [
  { value: 'main_warehouse', label: '主仓库' }, { value: 'transfer_warehouse', label: '周转库' }, { value: 'supermarket', label: '超市区' },
  { value: 'line_side', label: '线边区' }, { value: 'wip', label: 'WIP 区' },
  { value: 'high_bay', label: '高位货架区' }, { value: 'production_line', label: '产线区域' },
  { value: 'crane_caution', label: '行吊覆盖 caution' },
];
type ImportedLayoutDraft = {
  documentId?: string;
  fileName: string;
  dataUrl: string;
  width: number;
  height: number;
  points: PixelPoint[];
  knownDistanceM: number | null;
  regions?: DraftRegion[];
  objectPoints?: DraftObjectPoint[];
  lines?: DraftLine[];
  deletedLines?: DeletedLine[];
  sourceKind?: 'image' | 'pdf';
  pdfBytes?: ArrayBuffer;
  pdfPage?: number;
  pdfPageCount?: number;
  pageDrafts?: Record<number, PageAnnotations>;
  buildingName?: string;
  floorLabel?: string;
  unitName?: string;
  savedAt: string;
};

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDraft(): Promise<ImportedLayoutDraft | null> {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(DRAFT_ID);
      request.onsuccess = () => resolve((request.result as ImportedLayoutDraft | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function writeDraft(draft: ImportedLayoutDraft): Promise<void> {
  const db = await openDraftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(draft, DRAFT_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function readImage(file: File): Promise<Pick<ImportedLayoutDraft, 'dataUrl' | 'width' | 'height'>> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
}

async function renderPdfPage(pdfBytes: ArrayBuffer, pageNumber: number) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = getDocument({ data: new Uint8Array(pdfBytes.slice(0)) });
  try {
    const pdf = await loadingTask.promise;
    if (pageNumber < 1 || pageNumber > pdf.numPages) throw new Error('PDF 页码无效');
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 300 / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建绘图画布');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, pageCount: pdf.numPages };
  } finally {
    await loadingTask.destroy();
  }
}

function currentAnnotations(draft: ImportedLayoutDraft): PageAnnotations {
  return { points: draft.points, knownDistanceM: draft.knownDistanceM, regions: draft.regions ?? [], objectPoints: draft.objectPoints ?? [], lines: draft.lines ?? [], deletedLines: draft.deletedLines ?? [],
    buildingName: draft.buildingName ?? '', floorLabel: draft.floorLabel ?? '', unitName: draft.unitName ?? '' };
}

function lineIntersection(a: PixelPoint, b: PixelPoint, c: PixelPoint, d: PixelPoint): boolean {
  const cross = (p: PixelPoint, q: PixelPoint, r: PixelPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) ||
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) > Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))) return false;
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC * abD <= 0 && cdA * cdB <= 0;
}

function normalizeWallVertices(lines: DraftLine[]): DraftLine[] {
  const ids = new Map<string, string>();
  for (const line of lines) {
    if (line.type !== 'wall') continue;
    if (line.fromVertexId) ids.set(`${line.start.x},${line.start.y}`, line.fromVertexId);
    if (line.toVertexId) ids.set(`${line.end.x},${line.end.y}`, line.toVertexId);
  }
  const idFor = (point: PixelPoint) => {
    const key = `${point.x},${point.y}`;
    let id = ids.get(key);
    if (!id) { id = crypto.randomUUID(); ids.set(key, id); }
    return id;
  };
  return lines.map((line) => line.type === 'wall' ? { ...line,
    fromVertexId: line.fromVertexId ?? idFor(line.start), toVertexId: line.toVertexId ?? idFor(line.end),
    openings: line.openings ?? [] } : line);
}

function autoLineNumber(line: DraftLine): number | null {
  const prefix = line.type === 'wall' ? '墙' : '通道';
  const match = line.name.match(new RegExp(`^${prefix}\\s+(\\d+)$`));
  return match ? Number(match[1]) : null;
}

function nextAutoLineNumber(lines: DraftLine[], deletedLines: DeletedLine[], type: DraftLine['type']): number {
  return Math.max(0, ...[...lines, ...deletedLines.map((entry) => entry.line)]
    .filter((line) => line.type === type).map((line) => autoLineNumber(line) ?? 0)) + 1;
}

function normalizeAutoLineNames(lines: DraftLine[], deletedLines: DeletedLine[]) {
  const next = { wall: nextAutoLineNumber(lines, deletedLines, 'wall') - 1,
    aisle: nextAutoLineNumber(lines, deletedLines, 'aisle') - 1 };
  const seen = { wall: new Set<string>(), aisle: new Set<string>() };
  const normalize = (line: DraftLine): DraftLine => {
    if (autoLineNumber(line) === null) return line;
    if (!seen[line.type].has(line.name)) { seen[line.type].add(line.name); return line; }
    const prefix = line.type === 'wall' ? '墙' : '通道';
    const name = `${prefix} ${++next[line.type]}`;
    seen[line.type].add(name);
    return { ...line, name };
  };
  return { lines: lines.map(normalize), deletedLines: deletedLines.map((entry) => ({ ...entry, line: normalize(entry.line) })) };
}

function interpolate(a: PixelPoint, b: PixelPoint, t: number): PixelPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function wallGeometry(line: DraftLine, metersPerPixel: number | null) {
  const lengthPx = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
  const intervals = (line.openings ?? []).filter((opening) => metersPerPixel && opening.widthM > 0 && lengthPx > 0)
    .map((opening) => ({ start: opening.at - opening.widthM / (2 * lengthPx * (metersPerPixel ?? 1)),
      end: opening.at + opening.widthM / (2 * lengthPx * (metersPerPixel ?? 1)) }))
    .filter((gap) => gap.start >= 0 && gap.end <= 1 && gap.start < gap.end)
    .sort((a, b) => a.start - b.start);
  const solid: { start: PixelPoint; end: PixelPoint }[] = [];
  let cursor = 0;
  for (const gap of intervals) {
    if (gap.start > cursor) solid.push({ start: interpolate(line.start, line.end, cursor), end: interpolate(line.start, line.end, gap.start) });
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < 1) solid.push({ start: interpolate(line.start, line.end, cursor), end: line.end });
  return solid;
}

function wallVertices(lines: DraftLine[]) {
  const result: { id: string; position: PixelPoint }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.type !== 'wall') continue;
    for (const [id, position] of [[line.fromVertexId, line.start], [line.toVertexId, line.end]] as const) {
      if (id && !seen.has(id)) { result.push({ id, position }); seen.add(id); }
    }
  }
  return result;
}

function measuredPixels(points: PixelPoint[]) {
  return points.length === 2 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
}

function RegionTypeMenu({ id, value, onChange }: { id: string; value: RegionType; onChange: (value: RegionType) => void }) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [maxHeight, setMaxHeight] = useState(250);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = regionTypes.find((item) => item.value === value)?.label ?? '请选择';
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [open]);
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const bounds = trigger.current?.getBoundingClientRect();
    if (bounds) {
      const below = window.innerHeight - bounds.bottom;
      const placeAbove = below < 270 && bounds.top > below;
      setAbove(placeAbove);
      setMaxHeight(Math.max(120, Math.min(250, (placeAbove ? bounds.top : below) - 12)));
    }
    setOpen(true);
  };
  return <div ref={root} className="imported-layout-region-type-menu">
    <button ref={trigger} type="button" className="imported-layout-region-type-trigger" aria-label={`区域类型，当前${label}`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={`region-type-options-${id}`}
      onClick={toggle} onKeyDown={(event) => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); toggle(); } }}>
      {label}<span aria-hidden="true">⌄</span>
    </button>
    {open && <div id={`region-type-options-${id}`} className={`imported-layout-region-type-options ${above ? 'is-above' : ''}`}
      role="listbox" aria-label="区域类型" style={{ maxHeight }}>
      {regionTypes.map((item) => <button key={item.value} type="button" role="option" aria-selected={item.value === value}
        onClick={() => { onChange(item.value); setOpen(false); trigger.current?.focus(); }}>{item.label}</button>)}
    </div>}
  </div>;
}

function nearestAislePoint(point: PixelPoint, aisles: DraftLine[]): PixelPoint | null {
  const candidates = aisles.map((line) => {
    const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / length)) : 0;
    return { x: line.start.x + t * dx, y: line.start.y + t * dy };
  });
  return candidates.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0] ?? null;
}

function suggestPoints(draft: ImportedLayoutDraft): CandidatePoint[] {
  const existing = draft.objectPoints ?? [];
  const aisles = (draft.lines ?? []).filter((line) => line.type === 'aisle');
  const points: CandidatePoint[] = [];
  for (const region of draft.regions ?? []) {
    const left = Math.min(region.start.x, region.end.x), right = Math.max(region.start.x, region.end.x);
    const top = Math.min(region.start.y, region.end.y), bottom = Math.max(region.start.y, region.end.y);
    const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
    const nearest = nearestAislePoint(center, aisles);
    const dx = (nearest?.x ?? center.x) - center.x, dy = (nearest?.y ?? center.y) - center.y;
    const t = dx || dy ? Math.min(dx ? (right - left) / 2 / Math.abs(dx) : Infinity, dy ? (bottom - top) / 2 / Math.abs(dy) : Infinity) : 0;
    const edge = { x: center.x + dx * t, y: center.y + dy * t };
    const add = (type: ObjectPointType, position: PixelPoint, reason: string) => {
      if (existing.some((p) => p.type === type && p.position.x >= left && p.position.x <= right && p.position.y >= top && p.position.y <= bottom)) return;
      points.push({ id: crypto.randomUUID(), name: region.name + ' · ' + (pointTypes.find((p) => p.value === type)?.label ?? '点位'), type, position, reason });
    };
    if (['main_warehouse', 'transfer_warehouse', 'supermarket', 'high_bay'].includes(region.type))
      add('warehouse_origin', edge, '仓储区靠通道侧；实际出口待确认');
    if (region.type === 'production_line') {
      add('production_station', center, '区域中心；工序数量待确认');
      add('delivery_point', edge, '产线区靠通道侧；实际交付位置待确认');
    }
  }
  return points;
}

export function ImportedLayoutWorkspace({ onOpenPlane }: { onOpenPlane?: () => void }) {
  const activeImportedLayout = useScenarioStore((state) => state.activeImportedLayout);
  const setActiveImportedLayout = useScenarioStore((state) => state.setActiveImportedLayout);
  const [draft, setDraft] = useState<ImportedLayoutDraft | null>(null);
  const [candidatePoints, setCandidatePoints] = useState<CandidatePoint[]>([]);
  const [message, setMessage] = useState('尚未导入新 Layout');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'pan' | 'measure' | 'region' | 'point' | 'line' | 'opening'>('pan');
  const [detailTab, setDetailTab] = useState<'regions' | 'lines' | 'points'>('regions');
  const [showAllRouteIssues, setShowAllRouteIssues] = useState(false);
  const [hoveredRouteIssueId, setHoveredRouteIssueId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'source' | 'projection'>('source');
  const [pointType, setPointType] = useState<ObjectPointType>('delivery_point');
  const [pointName, setPointName] = useState('');
  const [lineType, setLineType] = useState<'wall' | 'aisle'>('wall');
  const [lineName, setLineName] = useState('');
  const [lineWidthM, setLineWidthM] = useState('');
  const [doorWidthM, setDoorWidthM] = useState('2');
  const [lineStart, setLineStart] = useState<PixelPoint | null>(null);
  const [wallFirst, setWallFirst] = useState<{ id: string; position: PixelPoint } | null>(null);
  const [wallStartVertexId, setWallStartVertexId] = useState<string | null>(null);
  const [wallGroupId, setWallGroupId] = useState<string | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [cursorPoint, setCursorPoint] = useState<PixelPoint | null>(null);
  const objectRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pointDrag = useRef<{ id: string; clientX: number; clientY: number; position: PixelPoint } | null>(null);
  const vertexDrag = useRef<{ id: string; clientX: number; clientY: number; position: PixelPoint } | null>(null);
  const [vertexPreview, setVertexPreview] = useState<{ id: string; position: PixelPoint } | null>(null);
  const [pointPreview, setPointPreview] = useState<{ id: string; position: PixelPoint } | null>(null);
  const [regionType, setRegionType] = useState<RegionType>('main_warehouse');
  const [regionName, setRegionName] = useState('');
  const [regionStart, setRegionStart] = useState<PixelPoint | null>(null);
  const [regionRepositionId, setRegionRepositionId] = useState<string | null>(null);
  const [calibrationBackup, setCalibrationBackup] = useState<{ points: PixelPoint[]; knownDistanceM: number | null } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const loadComplete = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { setCandidatePoints([]); }, [draft?.documentId, draft?.pdfPage]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setViewportSize({ width, height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [Boolean(draft)]);

  useEffect(() => {
    const row = hoveredObjectId ? objectRowRefs.current[hoveredObjectId] : null;
    const list = row?.parentElement;
    if (!row || !list) return;
    const listBounds = list.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    if (rowBounds.top < listBounds.top) list.scrollTop -= listBounds.top - rowBounds.top;
    else if (rowBounds.bottom > listBounds.bottom) list.scrollTop += rowBounds.bottom - listBounds.bottom;
  }, [hoveredObjectId]);

  useEffect(() => {
    readDraft().then((saved) => {
      if (saved) {
        setDraft({ ...saved, documentId: saved.documentId ?? crypto.randomUUID(), ...normalizeAutoLineNames(normalizeWallVertices(saved.lines ?? []), saved.deletedLines ?? []),
          pageDrafts: Object.fromEntries(Object.entries(saved.pageDrafts ?? {}).map(([page, annotations]) =>
            [page, { ...annotations, ...normalizeAutoLineNames(normalizeWallVertices(annotations.lines ?? []), annotations.deletedLines ?? []) }])) });
        setMessage(`已恢复导入草稿 · ${saved.fileName}`);
      }
    }).catch(() => setMessage('本机草稿读取失败；可以重新导入文件')).finally(() => { loadComplete.current = true; });
  }, []);

  useEffect(() => {
    if (!draft || !loadComplete.current) return;
    const saved = { ...draft, savedAt: new Date().toISOString() };
    saveQueue.current = saveQueue.current.catch(() => undefined).then(() => writeDraft(saved));
    saveQueue.current.then(() => setMessage(`已自动保存导入草稿 · ${saved.fileName}`))
      .catch(() => setMessage('自动保存失败；请检查浏览器存储空间'));
  }, [draft]);

  useEffect(() => {
    if (!draft || !activeImportedLayout || !sameImportedPage(activeImportedLayout, draft)) return;
    const projection = projectImportedDraft(draft);
    if (projection) setActiveImportedLayout(projection);
  }, [draft, activeImportedLayout?.documentId, activeImportedLayout?.pageNumber, setActiveImportedLayout]);

  const activateCurrentPage = () => {
    if (!draft) return;
    const projection = projectImportedDraft(draft);
    if (!projection) { setMessage('请先完成两点标尺和真实距离，再将当前页用于平面运营视图'); return; }
    const saved = setActiveImportedLayout(projection);
    if (!saved) setMessage('当前页已在本次会话切换；浏览器存储失败，刷新后可能丢失选择');
    onOpenPlane?.();
  };

  useEffect(() => {
    if (mode !== 'region') { setRegionRepositionId(null); setRegionStart(null); }
  }, [mode]);

  const updateRegion = (id: string, patch: Partial<DraftRegion>) => {
    setDraft((current) => current ? { ...current, regions: (current.regions ?? []).map((region) => region.id === id ? { ...region, ...patch } : region) } : current);
  };
  const startRegionReposition = (region: DraftRegion) => {
    setRegionRepositionId(region.id);
    setRegionStart(null);
    setSelectedObjectId(region.id);
    setDetailTab('regions');
    setViewMode('source');
    setMode('region');
    setMessage(`重新框选 ${region.name}：请在原图上点矩形第一角和第二角`);
    viewportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const importFile = async (file?: File) => {
    if (!file || busy) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf && !file.type.startsWith('image/')) {
      setMessage('请选择 PDF、PNG 或 JPG 文件');
      return;
    }
    setBusy(true);
    setMessage(isPdf ? `正在渲染 ${file.name} 的第 1 页…` : `正在读取 ${file.name}…`);
    try {
      const pdfBytes = isPdf ? await file.arrayBuffer() : undefined;
      const image = pdfBytes ? await renderPdfPage(pdfBytes, 1) : await readImage(file);
      const pageCount = 'pageCount' in image && typeof image.pageCount === 'number' ? image.pageCount : undefined;
      setDraft({ documentId: crypto.randomUUID(), fileName: file.name, dataUrl: image.dataUrl, width: image.width, height: image.height,
        sourceKind: isPdf ? 'pdf' : 'image', pdfBytes, pdfPage: isPdf ? 1 : undefined,
        pdfPageCount: pageCount,
        points: [], knownDistanceM: null, regions: [], objectPoints: [], lines: [], deletedLines: [], pageDrafts: {}, buildingName: '', floorLabel: '', unitName: '', savedAt: new Date().toISOString() });
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setMode('pan');
      setRegionStart(null);
      setLineStart(null);
      setWallFirst(null);
      setWallStartVertexId(null);
      setWallGroupId(null);
      setCalibrationBackup(null);
      setHoveredObjectId(null);
      setSelectedObjectId(null);
      setPointPreview(null);
      setMessage(isPdf ? `已导入 ${file.name} · 第 1 / ${pageCount ?? 1} 页 · ${image.width}×${image.height}px` : `已导入 ${file.name} · ${image.width}×${image.height}px`);
    } catch (error) {
      setMessage(isPdf ? `PDF 导入失败：${error instanceof Error ? error.message : '文件无法解析'}` : '无法读取这张图片，请换一份 PNG 或 JPG');
    } finally {
      setBusy(false);
    }
  };

  const selectPdfPage = async (pageNumber: number) => {
    if (!draft?.pdfBytes || busy || pageNumber === draft.pdfPage) return;
    setBusy(true);
    setMessage(`正在渲染第 ${pageNumber} 页…`);
    try {
      const image = await renderPdfPage(draft.pdfBytes, pageNumber);
      const pageDrafts = { ...(draft.pageDrafts ?? {}), [draft.pdfPage ?? 1]: currentAnnotations(draft) };
      const next = pageDrafts[pageNumber] ?? { points: [], knownDistanceM: null, regions: [], objectPoints: [], lines: [], deletedLines: [], buildingName: '', floorLabel: '', unitName: '' };
      const nextWithWallIds = { ...next, ...normalizeAutoLineNames(normalizeWallVertices(next.lines ?? []), next.deletedLines ?? []) };
      setDraft({ ...draft, dataUrl: image.dataUrl, width: image.width, height: image.height,
        pdfPage: pageNumber, pdfPageCount: image.pageCount, pageDrafts, ...nextWithWallIds });
      setRegionStart(null);
      setLineStart(null);
      setWallFirst(null);
      setWallStartVertexId(null);
      setWallGroupId(null);
      setCalibrationBackup(null);
      setHoveredObjectId(null);
      setSelectedObjectId(null);
      setPointPreview(null);
      setMode('pan');
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setMessage(`已切换至第 ${pageNumber} / ${image.pageCount} 页`);
    } catch (error) {
      setMessage(`页面渲染失败：${error instanceof Error ? error.message : '请重新选择'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleImageClick = (event: MouseEvent<HTMLImageElement>) => {
    if (mode === 'pan' || viewMode === 'projection' || !draft || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(draft.width, (event.clientX - bounds.left) / bounds.width * draft.width));
    const y = Math.max(0, Math.min(draft.height, (event.clientY - bounds.top) / bounds.height * draft.height));
    const point = { x, y };
    if (mode === 'opening') { setMessage('请直接点击红色墙段放置门洞'); return; }
    if (mode === 'point') {
      const nextIndex = (draft.objectPoints ?? []).length + 1;
      const label = pointTypes.find((item) => item.value === pointType)?.label ?? '点位';
      const object: DraftObjectPoint = { id: crypto.randomUUID(), name: pointName.trim() || `${label} ${nextIndex}`, type: pointType, position: point };
      setDraft({ ...draft, objectPoints: [...(draft.objectPoints ?? []), object] });
      setPointName('');
      setSelectedObjectId(object.id);
      setDetailTab('points');
      return;
    }
    if (mode === 'line') {
      if (lineType === 'wall') {
        const snapDistance = 10 / (bounds.width || 1) * draft.width;
        const existing = wallVertices(draft.lines ?? []).find((vertex) => Math.hypot(vertex.position.x - point.x, vertex.position.y - point.y) <= snapDistance);
        const close = !!wallFirst && !!lineStart && (draft.lines ?? []).filter((line) => line.wallGroupId === wallGroupId).length >= 2 &&
          Math.hypot(wallFirst.position.x - point.x, wallFirst.position.y - point.y) <= snapDistance;
        const end = close ? wallFirst.position : existing?.position ?? point;
        const endId = close ? wallFirst.id : existing?.id ?? crypto.randomUUID();
        if (!lineStart) {
          setLineStart(end); setWallFirst({ id: endId, position: end });
          setWallStartVertexId(endId); setWallGroupId(crypto.randomUUID());
          return;
        }
        if (Math.hypot(end.x - lineStart.x, end.y - lineStart.y) < 3) { setMessage('墙段至少 3px，请重新点下一角'); return; }
        const nextIndex = nextAutoLineNumber(draft.lines ?? [], draft.deletedLines ?? [], 'wall');
        const line: DraftLine = { id: crypto.randomUUID(), name: lineName.trim() || `墙 ${nextIndex}`, type: 'wall',
          start: lineStart, end, blocksMovement: true, wallGroupId: wallGroupId ?? crypto.randomUUID(),
          fromVertexId: wallStartVertexId ?? crypto.randomUUID(), toVertexId: endId, openings: [] };
        setDraft({ ...draft, lines: [...(draft.lines ?? []), line] });
        setSelectedObjectId(line.id);
        setDetailTab('lines');
        setLineStart(close ? null : end);
        setWallStartVertexId(close ? null : endId);
        if (close) { setWallFirst(null); setWallGroupId(null); setLineName(''); setMessage('围墙已闭合；可选中墙段开门'); }
        return;
      }
      if (!lineStart) { setLineStart(point); return; }
      if (Math.hypot(point.x - lineStart.x, point.y - lineStart.y) < 3) { setMessage('线段至少 3px，请重新点第二端'); return; }
      const nextIndex = nextAutoLineNumber(draft.lines ?? [], draft.deletedLines ?? [], 'aisle');
      const widthM = Number(lineWidthM);
      const line: DraftLine = { id: crypto.randomUUID(), name: lineName.trim() || `通道 ${nextIndex}`, type: 'aisle',
        start: lineStart, end: point, blocksMovement: false, widthM: widthM > 0 ? widthM : undefined };
      setDraft({ ...draft, lines: [...(draft.lines ?? []), line] });
      setSelectedObjectId(line.id);
      setDetailTab('lines');
      setLineStart(null);
      setLineName('');
      return;
    }
    if (mode === 'measure') {
      if (draft.points.length >= 2) setCalibrationBackup({ points: draft.points, knownDistanceM: draft.knownDistanceM });
      setDraft({ ...draft, points: draft.points.length >= 2 ? [point] : [...draft.points, point], knownDistanceM: null });
      return;
    }
    if (!regionStart) { setRegionStart(point); return; }
    const width = Math.abs(point.x - regionStart.x);
    const height = Math.abs(point.y - regionStart.y);
    if (width < 3 || height < 3) { setMessage('区域宽高至少 3px，请重新点击第二角'); return; }
    if (regionRepositionId) {
      const existing = (draft.regions ?? []).find((region) => region.id === regionRepositionId);
      if (existing) {
        updateRegion(existing.id, { start: regionStart, end: point, overrideAreaM2: undefined });
        setSelectedObjectId(existing.id);
        setMessage(`已重画 ${existing.name} 的矩形范围；面积已按标尺重新计算`);
      }
      setRegionRepositionId(null);
      setRegionStart(null);
      setMode('pan');
      return;
    }
    const nextIndex = (draft.regions ?? []).length + 1;
    const typeLabel = regionTypes.find((item) => item.value === regionType)?.label ?? '区域';
    const region: DraftRegion = { id: crypto.randomUUID(), name: regionName.trim() || `${typeLabel} ${nextIndex}`, type: regionType, start: regionStart, end: point };
    setDraft({ ...draft, regions: [...(draft.regions ?? []), region] });
    setSelectedObjectId(region.id);
    setDetailTab('regions');
    setRegionStart(null);
    setRegionName('');
  };

  const updateObjectPoint = (id: string, patch: Partial<DraftObjectPoint>) => {
    setDraft((current) => current ? { ...current, objectPoints: (current.objectPoints ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) } : current);
  };
  const pointFromDrag = (event: ReactPointerEvent<HTMLSpanElement>): PixelPoint | null => {
    const drag = pointDrag.current;
    if (!draft || !drag) return null;
    const bounds = imageRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { x: Math.max(0, Math.min(draft.width, drag.position.x + (event.clientX - drag.clientX) / bounds.width * draft.width)),
      y: Math.max(0, Math.min(draft.height, drag.position.y + (event.clientY - drag.clientY) / bounds.height * draft.height)) };
  };
  const deleteObjectPoint = (id: string) => {
    if (!draft) return;
    const usedBy = (draft.lines ?? []).filter((line) => line.fromPointId === id || line.toPointId === id);
    if (usedBy.length) { setMessage(`该点位已连接 ${usedBy.length} 条线段，请先解除连接`); return; }
    setDraft({ ...draft, objectPoints: (draft.objectPoints ?? []).filter((item) => item.id !== id) });
    if (selectedObjectId === id) setSelectedObjectId(null);
  };

  const finishWall = () => {
    setLineStart(null); setWallFirst(null); setWallStartVertexId(null); setWallGroupId(null); setLineName('');
  };
  const updateWallVertex = (id: string, position: PixelPoint) => {
    setDraft((current) => current ? { ...current, lines: (current.lines ?? []).map((line) => ({ ...line,
      start: line.fromVertexId === id ? position : line.start, end: line.toVertexId === id ? position : line.end })) } : current);
  };
  const addOpening = (line: DraftLine, requestedAt = 0.5) => {
    if (!draft || !metersPerPixel || line.type !== 'wall') return;
    const lengthM = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y) * metersPerPixel;
    const widthM = Number(doorWidthM);
    if (!Number.isFinite(widthM) || widthM <= 0) { setMessage('请先输入有效的门净宽'); return; }
    if (lengthM < widthM + 0.2) { setMessage(`${line.name}长度不足，无法开 ${widthM}m 的门`); return; }
    const edge = (widthM / 2 + 0.1) / lengthM;
    const at = Math.max(edge, Math.min(1 - edge, requestedAt));
    if ((line.openings ?? []).some((existing) => Math.abs(existing.at - at) * lengthM < (existing.widthM + widthM) / 2 + 0.2)) {
      setMessage('此处与已有门洞重叠，请点击该墙段的其他位置'); return;
    }
    const opening: WallOpening = { id: crypto.randomUUID(), at, widthM };
    setDraft({ ...draft, lines: (draft.lines ?? []).map((item) => item.id === line.id ? { ...item, openings: [...(item.openings ?? []), opening] } : item) });
    setSelectedObjectId(line.id);
    setMessage(`已在${line.name}开 ${widthM}m 门；可继续点击其他墙段`);
  };
  const addOpeningAtClick = (line: DraftLine, event: MouseEvent<SVGLineElement>) => {
    if (!draft) return;
    const bounds = imageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const point = { x: (event.clientX - bounds.left) / bounds.width * draft.width,
      y: (event.clientY - bounds.top) / bounds.height * draft.height };
    const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
    const lengthSquared = dx * dx + dy * dy;
    const at = lengthSquared ? ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / lengthSquared : 0.5;
    addOpening(line, at);
  };
  const updateOpening = (lineId: string, openingId: string, patch: Partial<WallOpening>) => {
    setDraft((current) => current ? { ...current, lines: (current.lines ?? []).map((line) => line.id === lineId ?
      { ...line, openings: (line.openings ?? []).map((opening) => opening.id === openingId ? { ...opening, ...patch } : opening) } : line) } : current);
  };
  const deleteOpening = (lineId: string, openingId: string) => {
    setDraft((current) => current ? { ...current, lines: (current.lines ?? []).map((line) => line.id === lineId ?
      { ...line, openings: (line.openings ?? []).filter((opening) => opening.id !== openingId) } : line) } : current);
  };

  const fitScale = draft && viewportSize.width > 0 && viewportSize.height > 0
    ? Math.min(viewportSize.width / draft.width, viewportSize.height / draft.height) : 0;
  const deleteLine = (id: string) => {
    const line = draft?.lines?.find((item) => item.id === id);
    if (!line) return;
    setDraft((current) => {
      if (!current) return current;
      const lines = current.lines ?? [];
      const index = lines.findIndex((item) => item.id === id);
      if (index < 0) return current;
      return { ...current, lines: lines.filter((item) => item.id !== id),
        deletedLines: [...(current.deletedLines ?? []), { line: lines[index], index }] };
    });
    if (selectedObjectId === id) setSelectedObjectId(null);
    setMessage(`已删除${line.name}；可点“恢复上一条”撤销`);
  };
  const restoreLastLine = () => {
    const last = draft?.deletedLines?.at(-1);
    if (!last) return;
    setDraft((current) => {
      if (!current?.deletedLines?.length) return current;
      const entry = current.deletedLines[current.deletedLines.length - 1];
      const lines = [...(current.lines ?? [])];
      if (lines.some((item) => item.id === entry.line.id)) return current;
      lines.splice(Math.min(entry.index, lines.length), 0, entry.line);
      return { ...current, lines, deletedLines: current.deletedLines.slice(0, -1) };
    });
    setSelectedObjectId(last.line.id);
    setMessage(`已恢复${last.line.name}`);
  };

  const pixelDistance = draft ? measuredPixels(draft.points) : 0;
  const metersPerPixel = draft?.knownDistanceM && pixelDistance > 0 ? draft.knownDistanceM / pixelDistance : null;
  const activeObjectId = hoveredObjectId ?? selectedObjectId;
  const activeRegion = draft?.regions?.find((item) => item.id === activeObjectId);
  const drawingRegionType = regionRepositionId ? draft?.regions?.find((item) => item.id === regionRepositionId)?.type ?? regionType : regionType;
  const activePoint = draft?.objectPoints?.find((item) => item.id === activeObjectId);
  const activeLine = draft?.lines?.find((item) => item.id === activeObjectId);
  const selectedLine = draft?.lines?.find((item) => item.id === selectedObjectId);
  const blockedAisleIds = new Set((draft?.lines ?? []).filter((aisle) => aisle.type === 'aisle' &&
    (draft?.lines ?? []).some((wall) => wall.type === 'wall' && wallGeometry(wall, metersPerPixel)
      .some((piece) => lineIntersection(aisle.start, aisle.end, piece.start, piece.end)))).map((item) => item.id));
  const vertices = wallVertices(draft?.lines ?? []);
  const wallCount = (draft?.lines ?? []).filter((line) => line.type === 'wall').length;
  const aisleCount = (draft?.lines ?? []).filter((line) => line.type === 'aisle').length;
  const doorCount = (draft?.lines ?? []).reduce((total, line) => total + (line.openings?.length ?? 0), 0);
  const stationCount = (draft?.objectPoints ?? []).filter((point) => point.type === 'production_station').length;
  const deliveryCount = (draft?.objectPoints ?? []).filter((point) => point.type === 'delivery_point').length;
  const routeNodeCount = (draft?.objectPoints ?? []).filter((point) => point.type === 'route_node').length;
  const routeIssues = draft ? analyzeRouteReadiness(draft) : [];
  const routeBlockers = routeIssues.filter((issue) => issue.severity === 'blocker');
  const routeReviews = routeIssues.filter((issue) => issue.severity === 'review');
  const hoveredRouteIssue = routeIssues.find((issue) => issue.id === hoveredRouteIssueId);
  const relatedRegionIds = new Set((draft?.regions ?? []).filter((region) => {
    if (!hoveredRouteIssue) return false;
    if (hoveredRouteIssue.objectKind === 'region') return hoveredRouteIssue.objectId === region.id;
    if (hoveredRouteIssue.objectKind === 'point') {
      const point = (draft?.objectPoints ?? []).find((item) => item.id === hoveredRouteIssue.objectId)?.position;
      return !!point && point.x >= Math.min(region.start.x, region.end.x) && point.x <= Math.max(region.start.x, region.end.x)
        && point.y >= Math.min(region.start.y, region.end.y) && point.y <= Math.max(region.start.y, region.end.y);
    }
    if (hoveredRouteIssue.id.startsWith('production:') && region.type === 'production_line') {
      const aisle = (draft?.lines ?? []).find((line) => line.id === hoveredRouteIssue.objectId);
      return !!aisle && aisleEntersRegion(aisle, region);
    }
    if (hoveredRouteIssue.id === 'station') return region.type === 'production_line';
    if (hoveredRouteIssue.id === 'origin') return ['main_warehouse', 'transfer_warehouse', 'supermarket', 'high_bay'].includes(region.type);
    if (hoveredRouteIssue.id === 'delivery') return ['production_line', 'line_side'].includes(region.type);
    return false;
  }).map((region) => region.id));

  const projectionGaps = [
    !metersPerPixel && '标尺待标定',
    !stationCount && '生产工站待定位',
    !deliveryCount && '配送点待定位',
    !routeNodeCount && '出入口与路线节点待定位',
    wallCount > 0 && !doorCount && '墙上门洞待核实',
    routeIssues.some((issue) => issue.id.startsWith('production:')) && '生产区内部通行待核实',
  ].filter((item): item is string => Boolean(item));

  const generatePointCandidates = () => {
    if (!draft) return;
    const points = suggestPoints(draft);
    setCandidatePoints(points);
    setMode('pan');
    setViewMode('source');
    setMessage(points.length ? '已生成 ' + points.length + ' 个候选点位；请先在图上核对' : '没有新候选：请检查区域类型或已有点位');
  };
  const acceptPointCandidates = (points: CandidatePoint[]) => {
    setDraft((current) => current ? { ...current, objectPoints: [...(current.objectPoints ?? []), ...points.map(({ reason: _reason, ...point }) => point)] } : current);
    setCandidatePoints((current) => current.filter((point) => !points.some((accepted) => accepted.id === point.id)));
    setDetailTab('points');
    setMessage('已加入 ' + points.length + ' 个点位；可拖动或编辑位置');
  };

  const focusRouteIssue = (issue: RouteReadinessIssue) => {
    setViewMode('source');
    setMode('pan');
    if (issue.objectId && draft) {
      const line = (draft.lines ?? []).find((item) => item.id === issue.objectId);
      const point = (draft.objectPoints ?? []).find((item) => item.id === issue.objectId);
      const region = (draft.regions ?? []).find((item) => item.id === issue.objectId);
      const center = line ? { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 }
        : point?.position ?? (region ? { x: (region.start.x + region.end.x) / 2, y: (region.start.y + region.end.y) / 2 } : null);
      if (center) setPan({ x: (draft.width / 2 - center.x) * fitScale * zoom, y: (draft.height / 2 - center.y) * fitScale * zoom });
      setSelectedObjectId(issue.objectId);
      setDetailTab(issue.objectKind === 'line' ? 'lines' : issue.objectKind === 'point' ? 'points' : 'regions');
    } else if (issue.id === 'scale') setMode('measure');
    else if (issue.id === 'origin' || issue.id === 'delivery' || issue.id === 'station') {
      setMode('point'); setPointType(issue.id === 'origin' ? 'warehouse_origin' : issue.id === 'delivery' ? 'delivery_point' : 'production_station');
    } else if (issue.id === 'doors') setMode('opening');
    else if (issue.id === 'storage') setMode('region');
    else { setMode('line'); setLineType('aisle'); }
    viewportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return <section className="section-card imported-layout-section">
    <div className="imported-layout-heading">
      <div><p className="eyebrow">T3 IMPORT & ANNOTATE</p><h3>新 Layout 导入与标注</h3></div>
      <span className="imported-layout-status">{message}</span>
    </div>
    <p className="imported-layout-note">每张图纸独立保存标尺和空间对象。画墙可连续点转角、回到起点闭合；选中墙段可开门。通道是候选中心线，门与路线仍未接入计算。</p>
    <div className="imported-layout-toolbar">
      <label className="imported-layout-upload">导入 Layout（PDF / PNG / JPG）<input type="file" accept="application/pdf,.pdf,image/png,image/jpeg" disabled={busy} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button type="button" className={mode === 'pan' ? 'active' : ''} onClick={() => { setMode('pan'); finishWall(); }} disabled={!draft}>拖动查看</button>
      <button type="button" className={mode === 'measure' ? 'active' : ''} onClick={() => { setMode('measure'); setRegionStart(null); finishWall(); }} disabled={!draft}>两点标尺</button>
      <button type="button" className={mode === 'region' ? 'active' : ''} onClick={() => { setMode('region'); finishWall(); }} disabled={!draft || !metersPerPixel}>矩形区域</button>
      <button type="button" className={mode === 'point' ? 'active' : ''} onClick={() => { setMode('point'); setRegionStart(null); finishWall(); }} disabled={!draft || !metersPerPixel}>添加点位</button>
      <button type="button" className={mode === 'line' && lineType === 'wall' ? 'active' : ''} onClick={() => { setMode('line'); setLineType('wall'); setRegionStart(null); finishWall(); }} disabled={!draft || !metersPerPixel}>画墙</button>
      <button type="button" className={mode === 'line' && lineType === 'aisle' ? 'active' : ''} onClick={() => { setMode('line'); setLineType('aisle'); setRegionStart(null); finishWall(); }} disabled={!draft || !metersPerPixel}>画通道</button>
      <button type="button" className={mode === 'opening' ? 'active' : ''} onClick={() => { setMode('opening'); setRegionStart(null); finishWall(); setMessage('开门模式：直接点击墙段；可连续放置'); }} disabled={!draft || !metersPerPixel}>开门</button>
      <button type="button" onClick={() => setZoom((value) => Math.min(8, Math.round((value + 0.25) * 100) / 100))} disabled={!draft}>放大 +</button>
      <button type="button" onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.25) * 100) / 100))} disabled={!draft}>缩小 −</button>
      <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} disabled={!draft}>复位视图</button>
      {draft && <span className="imported-layout-zoom">{draft.width >= draft.height ? '横向' : '纵向'} · {Math.round(zoom * 100)}%</span>}
    </div>
    {draft ? <>
      {draft.pdfBytes && <div className="imported-layout-floor-tabs" role="tablist" aria-label="PDF 规划图纸">
        {Array.from({ length: draft.pdfPageCount ?? 1 }, (_, index) => {
          const page = index + 1;
          const saved = page === draft.pdfPage ? currentAnnotations(draft) : draft.pageDrafts?.[page];
          const title = [saved?.buildingName, saved?.floorLabel].filter(Boolean).join(' · ');
          return <button key={page} type="button" role="tab" aria-selected={page === draft.pdfPage} className={page === draft.pdfPage ? 'active' : ''}
            disabled={busy} onClick={() => void selectPdfPage(page)}>
            <strong>第 {page} 页</strong><span>{title || '未定义楼层'}</span>
          </button>;
        })}
      </div>}
      <div className="imported-layout-unit-fields">
        <label>楼栋 / 车间 <input value={draft.buildingName ?? ''} onChange={(event) => setDraft({ ...draft, buildingName: event.target.value })} placeholder="如：B02 机加" /></label>
        <label>楼层 <input value={draft.floorLabel ?? ''} onChange={(event) => setDraft({ ...draft, floorLabel: event.target.value })} placeholder="如：1F、-1F" /></label>
        <label>规划单元名称 <input value={draft.unitName ?? ''} onChange={(event) => setDraft({ ...draft, unitName: event.target.value })} placeholder="如：机加工区" /></label>
      </div>
      <p className="imported-layout-unit-note">当前图纸：{draft.unitName || `第 ${draft.pdfPage ?? 1} 页`} · {draft.buildingName || '楼栋待定义'} / {draft.floorLabel || '楼层待定义'}。相同楼层的多张图纸仍各自保存，坐标对齐后才能合并计算。</p>
      {mode === 'line' && <div className="imported-layout-region-controls">
        <strong>{lineType === 'wall' ? '墙 · 不可穿越' : '通道 · 可行驶候选'}</strong>
        <label>名称 <input value={lineName} onChange={(event) => setLineName(event.target.value)} placeholder="可留空自动命名" /></label>
        {lineType === 'aisle' && <label>通道净宽（可选） <input type="number" min="0.1" step="0.1" value={lineWidthM} onChange={(event) => setLineWidthM(event.target.value)} placeholder="待录入" /> m</label>}
        <span>{lineType === 'wall' ? lineStart ? '继续点转角；点起点闭合，或完成当前墙' : '点击墙的起点' : lineStart ? '点击通道终点' : '点击通道起点'}</span>
        {lineStart && <button type="button" onClick={finishWall}>{lineType === 'wall' ? '完成当前墙' : '取消本段'}</button>}
      </div>}
      {mode === 'opening' && <div className="imported-layout-region-controls">
        <strong>开门 · 连续放置</strong>
        <label>默认门净宽 <input type="number" min="0.1" step="0.1" value={doorWidthM} onChange={(event) => setDoorWidthM(event.target.value)} /> m</label>
        <span>点击红色墙段上的开口位置；完成后点“拖动查看”</span>
      </div>}
      {mode === 'point' && <div className="imported-layout-region-controls">
        <strong>新建点位</strong>
        <label>新点类型 <select value={pointType} onChange={(event) => setPointType(event.target.value as ObjectPointType)}>{pointTypes.filter((item) => item.value !== 'door').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>新点名称 <input value={pointName} onChange={(event) => setPointName(event.target.value)} placeholder="可留空自动命名" /></label>
        <span>设置仅用于下一次点击图纸；已有点位请在下方“点位”列表修改。</span>
      </div>}
      {mode === 'region' && <div className="imported-layout-region-controls">
        {regionRepositionId ? <strong>重画范围：{(draft.regions ?? []).find((region) => region.id === regionRepositionId)?.name ?? '已选区域'}</strong> : <label>类型 <select value={regionType} onChange={(event) => setRegionType(event.target.value as RegionType)}>{regionTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
        {!regionRepositionId && <label>名称 <input value={regionName} onChange={(event) => setRegionName(event.target.value)} placeholder="可留空自动命名" /></label>}
        <span>{regionStart ? '点击矩形第二角' : '在图上点击矩形第一角'}</span>
        {(regionStart || regionRepositionId) && <button type="button" onClick={() => { setRegionStart(null); setRegionRepositionId(null); setMode('pan'); }}>取消本次标注</button>}
      </div>}
      <div className="imported-layout-view-switch" role="tablist" aria-label="图纸视图">
        <button type="button" role="tab" aria-selected={viewMode === 'source'} className={viewMode === 'source' ? 'active' : ''} onClick={() => setViewMode('source')}>原图与标注</button>
        <button type="button" role="tab" aria-selected={viewMode === 'projection'} className={viewMode === 'projection' ? 'active' : ''} onClick={() => { finishWall(); setRegionStart(null); setViewMode('projection'); setMode('pan'); }}>数字投影预览</button>
        <span>{draft.buildingName || '未命名楼栋'} / {draft.floorLabel || '未定义楼层'} · 第 {draft.pdfPage ?? 1} 页</span>
        <button type="button" onClick={generatePointCandidates} disabled={!(draft.regions ?? []).length}>生成点位候选</button>
        <button type="button" className="imported-layout-activate" disabled={!metersPerPixel} onClick={activateCurrentPage}>
          {activeImportedLayout && sameImportedPage(activeImportedLayout, draft) ? '查看本页运营视图' : '将本页用于平面运营视图'}
        </button>
      </div>
      {candidatePoints.length > 0 && <section className="imported-layout-candidate-panel" aria-label="点位候选">
        <div className="imported-layout-list-heading"><strong>点位候选 · {candidatePoints.length}</strong><span>依据已标区域与通道推断；门、墙及工具可达性尚未校验</span></div>
        <div className="imported-layout-candidate-actions"><button type="button" onClick={() => acceptPointCandidates(candidatePoints)}>全部加入草稿</button><button type="button" onClick={() => setCandidatePoints([])}>放弃候选</button></div>
        <div className="imported-layout-candidate-list">{candidatePoints.map((point) => <div key={point.id}>
          <span><strong>{point.name}</strong><small>{point.position.x.toFixed(0)}, {point.position.y.toFixed(0)} px · {point.reason}</small></span>
          <button type="button" onClick={() => acceptPointCandidates([point])}>加入此点</button>
        </div>)}</div>
      </section>}
      {viewMode === 'projection' && <div className="imported-layout-projection-summary">
        <strong>本页空间对象已投影</strong>
        <span>{(draft.regions ?? []).length} 个功能区 · {wallCount} 段墙 · {doorCount} 处门洞 · {aisleCount} 条通道候选线 · {(draft.objectPoints ?? []).length} 个点位</span>
        <p>{projectionGaps.length ? `待补充：${projectionGaps.join('、')}。` : '空间对象已具备基本标注；路线拓扑与工具可达性仍需校验。'} 此视图取自本页草稿，尚未采纳为物料流计算场景。</p>
      </div>}
      <section className="imported-layout-route-readiness" aria-label="路径计算准备检查">
        <div className="imported-layout-list-heading"><strong>路径计算准备检查</strong><span>{routeBlockers.length} 项阻断 · {routeReviews.length} 项复核</span></div>
        <p>{routeBlockers.length ? '当前图纸还缺少路径计算必需的定义。' : '关键空间项已标注；通行和业务映射仍需继续校验。'} 这里检查草稿几何，不生成车辆路线。</p>
        {routeIssues.length ? <div className="imported-layout-route-issues">{(showAllRouteIssues ? routeIssues : [...routeBlockers, ...routeReviews].slice(0, 8)).map((issue) =>
          <button type="button" key={issue.id} className={issue.severity === 'blocker' ? 'is-blocker' : 'is-review'}
            onMouseEnter={() => setHoveredRouteIssueId(issue.id)} onMouseLeave={() => setHoveredRouteIssueId(null)}
            onFocus={() => setHoveredRouteIssueId(issue.id)} onBlur={() => setHoveredRouteIssueId(null)}
            onClick={() => focusRouteIssue(issue)}>
            <span>{issue.severity === 'blocker' ? '阻断' : '复核'}</span>{issue.message}<em>定位</em>
          </button>)}</div> : <p>当前检查项已通过；下一步仍需进行通行路网与运输工具适配计算。</p>}
        {routeIssues.length > 8 && <button type="button" className="imported-layout-issue-toggle" onClick={() => setShowAllRouteIssues((value) => !value)}>{showAllRouteIssues ? '收起' : `查看全部 ${routeIssues.length} 项`}</button>}
      </section>
      <div className="imported-layout-inspection">
      <div ref={viewportRef} className={`imported-layout-viewport ${mode === 'pan' ? 'is-pannable' : 'is-measuring'} ${viewMode === 'projection' ? 'is-projection' : ''}`}
        aria-label="Layout 横向编辑画布"
        onPointerDown={(event) => { if (mode !== 'pan') return; drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => {
          const bounds = imageRef.current?.getBoundingClientRect();
          if (bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
            setCursorPoint({ x: (event.clientX - bounds.left) / bounds.width * draft.width, y: (event.clientY - bounds.top) / bounds.height * draft.height });
          } else setCursorPoint(null);
          if (drag.current) setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y });
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onPointerLeave={() => { setHoveredObjectId(null); setCursorPoint(null); }}>
        <div className={`imported-layout-image-wrap ${viewMode === 'projection' ? 'is-projection' : ''}`} style={{ width: `${draft.width * fitScale}px`, height: `${draft.height * fitScale}px`,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <img ref={imageRef} src={draft.dataUrl} alt={`待标注 Layout：${draft.fileName}`} style={{ opacity: viewMode === 'projection' ? 0 : 1 }} draggable={false} onClick={handleImageClick} />
          <svg className="imported-layout-regions" data-interactive={mode === 'pan'} viewBox={`0 0 ${draft.width} ${draft.height}`} preserveAspectRatio="none" aria-hidden="true">
            {(draft.regions ?? []).map((region) => <rect key={region.id} x={Math.min(region.start.x, region.end.x)} y={Math.min(region.start.y, region.end.y)} width={Math.abs(region.end.x - region.start.x)} height={Math.abs(region.end.y - region.start.y)}
              className={[`is-${region.type}`, activeObjectId === region.id ? 'is-active' : ''].join(' ')}
              style={region.type === 'crane_caution' ? { strokeDasharray: `${4 / Math.max(fitScale * zoom, .001)} ${3 / Math.max(fitScale * zoom, .001)}` } : undefined}
              onMouseEnter={() => setHoveredObjectId(region.id)} onMouseLeave={() => setHoveredObjectId(null)} onClick={() => setSelectedObjectId(region.id)} />)}
          </svg>
          {relatedRegionIds.size > 0 && <svg className="imported-layout-issue-region-highlight"
            viewBox={'0 0 ' + draft.width + ' ' + draft.height} preserveAspectRatio="none" aria-hidden="true">
            {(draft.regions ?? []).filter((region) => relatedRegionIds.has(region.id)).map((region) =>
              <rect key={region.id} x={Math.min(region.start.x, region.end.x)} y={Math.min(region.start.y, region.end.y)}
                width={Math.abs(region.end.x - region.start.x)} height={Math.abs(region.end.y - region.start.y)} />)}
          </svg>}
          {viewMode === 'source' && mode === 'region' && regionStart && cursorPoint && <svg className="imported-layout-region-preview"
            viewBox={`0 0 ${draft.width} ${draft.height}`} preserveAspectRatio="none" aria-hidden="true">
            <rect x={Math.min(regionStart.x, cursorPoint.x)} y={Math.min(regionStart.y, cursorPoint.y)}
              width={Math.abs(cursorPoint.x - regionStart.x)} height={Math.abs(cursorPoint.y - regionStart.y)}
              className={drawingRegionType === 'crane_caution' ? 'is-caution' : ''}
              style={drawingRegionType === 'crane_caution' ? { strokeDasharray: `${4 / Math.max(fitScale * zoom, .001)} ${3 / Math.max(fitScale * zoom, .001)}` } : undefined} />
          </svg>}
          <svg className="imported-layout-line-layer" data-interactive={mode === 'pan' || mode === 'opening'} viewBox={`0 0 ${draft.width} ${draft.height}`} preserveAspectRatio="none" aria-hidden="true">
            {(draft.lines ?? []).map((line) => <g key={line.id}>
              {(line.type === 'wall' ? wallGeometry(line, metersPerPixel) : [{ start: line.start, end: line.end }]).map((piece, index) =>
                <line key={index} x1={piece.start.x} y1={piece.start.y} x2={piece.end.x} y2={piece.end.y}
                  className={[line.type === 'wall' ? 'is-wall' : 'is-aisle', blockedAisleIds.has(line.id) ? 'is-conflict' : '', activeObjectId === line.id ? 'is-active' : '', hoveredRouteIssue?.objectId === line.id ? 'is-issue-highlight' : ''].join(' ')} />)}
              {(line.openings ?? []).map((opening) => { const center = interpolate(line.start, line.end, opening.at); return (
                <circle key={opening.id} cx={center.x} cy={center.y} r={viewMode === 'projection' ? 5 / Math.max(fitScale * zoom, .001) : 2 / zoom} className="is-door-opening" />); })}
              <line className="hit" x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y}
                style={{ pointerEvents: mode === 'opening' && line.type !== 'wall' ? 'none' : undefined }}
                onMouseEnter={() => setHoveredObjectId(line.id)} onMouseLeave={() => setHoveredObjectId(null)}
                onClick={(event) => { if (mode === 'opening') addOpeningAtClick(line, event); else setSelectedObjectId(line.id); }} />
            </g>)}
          </svg>
          {viewMode === 'projection' && (draft.regions ?? []).map((region) => {
            const width = Math.abs(region.end.x - region.start.x) * fitScale * zoom;
            const height = Math.abs(region.end.y - region.start.y) * fitScale * zoom;
            if (width < 68 || height < 30) return null;
            const area = metersPerPixel ? Math.abs(region.end.x - region.start.x) * Math.abs(region.end.y - region.start.y) * metersPerPixel ** 2 : null;
            return <span key={region.id} className="imported-layout-projection-region-label"
              style={{ left: `${(region.start.x + region.end.x) / 2 / draft.width * 100}%`, top: `${(region.start.y + region.end.y) / 2 / draft.height * 100}%`,
                maxWidth: `${Math.abs(region.end.x - region.start.x) * fitScale * .9}px`, fontSize: `${12 / zoom}px`, padding: `${3 / zoom}px ${5 / zoom}px` }}>
              {region.name}{area !== null && <small>{(region.overrideAreaM2 ?? area).toFixed(1)} m²</small>}
            </span>;
          })}
          {mode === 'pan' && viewMode === 'source' && vertices.map((vertex) => {
            const position = vertexPreview?.id === vertex.id ? vertexPreview.position : vertex.position;
            return <span key={vertex.id} className="imported-layout-wall-vertex"
              style={{ left: `${position.x / draft.width * 100}%`, top: `${position.y / draft.height * 100}%` }} title="拖动墙转角"
              onPointerDown={(event) => { event.stopPropagation(); vertexDrag.current = { id: vertex.id, clientX: event.clientX, clientY: event.clientY, position: vertex.position }; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={(event) => { const moving = vertexDrag.current; if (moving?.id !== vertex.id) return; event.stopPropagation(); const bounds = imageRef.current?.getBoundingClientRect(); if (!bounds) return;
                setVertexPreview({ id: vertex.id, position: { x: Math.max(0, Math.min(draft.width, moving.position.x + (event.clientX - moving.clientX) / bounds.width * draft.width)),
                  y: Math.max(0, Math.min(draft.height, moving.position.y + (event.clientY - moving.clientY) / bounds.height * draft.height)) } }); }}
              onPointerUp={(event) => { const moving = vertexDrag.current; if (moving?.id !== vertex.id) return; event.stopPropagation();
                const bounds = imageRef.current?.getBoundingClientRect();
                if (bounds && Math.hypot(event.clientX - moving.clientX, event.clientY - moving.clientY) >= 3)
                  updateWallVertex(vertex.id, { x: Math.max(0, Math.min(draft.width, moving.position.x + (event.clientX - moving.clientX) / bounds.width * draft.width)),
                    y: Math.max(0, Math.min(draft.height, moving.position.y + (event.clientY - moving.clientY) / bounds.height * draft.height)) });
                vertexDrag.current = null; setVertexPreview(null); }}
              onPointerCancel={() => { vertexDrag.current = null; setVertexPreview(null); }} />;
          })}
          {viewMode === 'source' && lineStart && <span className="imported-layout-line-start" style={{ left: `${lineStart.x / draft.width * 100}%`, top: `${lineStart.y / draft.height * 100}%` }} aria-label="当前墙角或线段起点" />}
          {viewMode === 'source' && mode === 'line' && lineType === 'wall' && wallFirst && lineStart && wallFirst.id !== wallStartVertexId &&
            <span className="imported-layout-line-start" style={{ left: `${wallFirst.position.x / draft.width * 100}%`, top: `${wallFirst.position.y / draft.height * 100}%` }} aria-label="点击此处闭合围墙" />}
          {candidatePoints.map((point) => <span key={point.id} className="imported-layout-candidate-point"
            style={{ left: `${point.position.x / draft.width * 100}%`, top: `${point.position.y / draft.height * 100}%` }}
            title={`${point.name} · ${point.reason}`} aria-label={`${point.name}，待确认`} />)}
          {(draft.objectPoints ?? []).map((object) => {
            const position = pointPreview?.id === object.id ? pointPreview.position : object.position;
            return <span key={object.id} title={`${object.name} · 拖动可调整位置`}
              className={`imported-layout-object-point ${activeObjectId === object.id ? 'is-active' : ''}`}
              style={{ left: `${position.x / draft.width * 100}%`, top: `${position.y / draft.height * 100}%`, pointerEvents: mode === 'pan' ? 'auto' : 'none' }}
              onMouseEnter={() => setHoveredObjectId(object.id)} onMouseLeave={() => setHoveredObjectId(null)} onClick={() => setSelectedObjectId(object.id)}
              onPointerDown={(event) => { if (mode !== 'pan' || viewMode === 'projection') return; event.stopPropagation(); pointDrag.current = { id: object.id, clientX: event.clientX, clientY: event.clientY, position: object.position }; setSelectedObjectId(object.id); event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={(event) => { const drag = pointDrag.current; if (drag?.id !== object.id) return; event.stopPropagation(); if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 3) return; const next = pointFromDrag(event); if (next) setPointPreview({ id: object.id, position: next }); }}
              onPointerUp={(event) => { const drag = pointDrag.current; if (drag?.id !== object.id) return; event.stopPropagation(); if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 3) { const next = pointFromDrag(event); if (next) updateObjectPoint(object.id, { position: next }); } pointDrag.current = null; setPointPreview(null); }}
              onPointerCancel={() => { pointDrag.current = null; setPointPreview(null); }} />;
          })}
          {viewMode === 'source' && regionStart && <span className="imported-layout-region-start" style={{ left: `${regionStart.x / draft.width * 100}%`, top: `${regionStart.y / draft.height * 100}%` }} aria-label="矩形第一角" />}
          {viewMode === 'source' && draft.points.length === 2 && <svg className="imported-layout-measure-line" viewBox={`0 0 ${draft.width} ${draft.height}`} preserveAspectRatio="none" aria-hidden="true"><line x1={draft.points[0].x} y1={draft.points[0].y} x2={draft.points[1].x} y2={draft.points[1].y} /></svg>}
          {viewMode === 'source' && draft.points.map((point, index) => <span key={index} className="imported-layout-calibration-point" style={{ left: `${point.x / draft.width * 100}%`, top: `${point.y / draft.height * 100}%` }} title={`标尺 ${index === 0 ? 'A' : 'B'}`} />)}
        </div>
      </div>
      <aside className="imported-layout-object-inspector" aria-label="当前图纸对象列表">
        <strong>当前图纸对象 · {(draft.regions ?? []).length + (draft.objectPoints ?? []).length + (draft.lines ?? []).length}</strong>
        <p>{activeRegion ? `${activeRegion.name} · ${regionTypes.find((item) => item.value === activeRegion.type)?.label}` : activePoint ? `${activePoint.name || '未命名点位'} · ${pointTypes.find((item) => item.value === activePoint.type)?.label}` : activeLine ? `${activeLine.name} · ${activeLine.type === 'wall' ? '墙 / 不可穿越' : blockedAisleIds.has(activeLine.id) ? '通道与墙相交，需核实开口' : '通道候选'}` : cursorPoint ? `图上位置 ${cursorPoint.x.toFixed(0)}, ${cursorPoint.y.toFixed(0)} px · 未标注对象` : '移动鼠标到图上对象，或在列表中选择。'}</p>
        {viewMode === 'source' && selectedLine?.type === 'wall' && <button type="button" className="imported-layout-opening-action" onClick={() => addOpening(selectedLine)}>在选中墙段开门</button>}
        <div className="imported-layout-object-rows">
          {(draft.regions ?? []).map((region) => <button key={region.id} type="button" data-object-id={region.id}
            ref={(element) => { objectRowRefs.current[region.id] = element; }}
            className={activeObjectId === region.id ? 'active' : ''}
            onMouseEnter={() => setHoveredObjectId(region.id)} onMouseLeave={() => setHoveredObjectId(null)} onFocus={() => setHoveredObjectId(region.id)}
            onClick={() => { setSelectedObjectId(region.id); setDetailTab('regions'); }}>
            <span>{region.name}</span><small>{regionTypes.find((item) => item.value === region.type)?.label} · 区域</small>
          </button>)}
          {(draft.lines ?? []).map((line) => <button key={line.id} type="button" data-object-id={line.id}
            ref={(element) => { objectRowRefs.current[line.id] = element; }}
            className={activeObjectId === line.id ? 'active' : ''}
            onMouseEnter={() => setHoveredObjectId(line.id)} onMouseLeave={() => setHoveredObjectId(null)} onFocus={() => setHoveredObjectId(line.id)}
            onClick={() => { setSelectedObjectId(line.id); setDetailTab('lines'); }}>
            <span>{line.name}</span><small>{line.type === 'wall' ? '墙 · 禁止穿越' : blockedAisleIds.has(line.id) ? '通道 · 穿墙待复核' : `通道 · 净宽 ${line.widthM ?? '待录入'}m`}</small>
          </button>)}
          {(draft.objectPoints ?? []).map((object) => <button key={object.id} type="button" data-object-id={object.id}
            ref={(element) => { objectRowRefs.current[object.id] = element; }}
            className={activeObjectId === object.id ? 'active' : ''}
            onMouseEnter={() => setHoveredObjectId(object.id)} onMouseLeave={() => setHoveredObjectId(null)} onFocus={() => setHoveredObjectId(object.id)}
            onClick={() => { setSelectedObjectId(object.id); setDetailTab('points'); }}>
            <span>{object.name || '未命名点位'}</span><small>{pointTypes.find((item) => item.value === object.type)?.label} · {object.position.x.toFixed(0)}, {object.position.y.toFixed(0)} px</small>
          </button>)}
        </div>
      </aside>
      </div>
      {viewMode === 'projection' && <div className="imported-layout-projection-legend">
        <span><i className="is-region" />功能区</span><span><i className="is-wall" />墙 / 不可穿越</span><span><i className="is-door" />门洞</span><span><i className="is-aisle" />通道候选中心线</span><span><i className="is-point" />已标点位</span>
      </div>}
      <div className="imported-layout-calibration">
        <span>原图 {draft.width}×{draft.height}px</span>
        <span>标尺 {pixelDistance ? pixelDistance.toFixed(1) : '—'}px</span>
        <label>两点实际距离 <input type="number" min="0.001" step="0.1" value={draft.knownDistanceM ?? ''} onChange={(event) => setDraft({ ...draft, knownDistanceM: Number(event.target.value) > 0 ? Number(event.target.value) : null })} disabled={draft.points.length !== 2} /> m</label>
        <button type="button" disabled={draft.points.length === 0} onClick={() => { setCalibrationBackup({ points: draft.points, knownDistanceM: draft.knownDistanceM }); setDraft({ ...draft, points: [], knownDistanceM: null }); setMode('measure'); }}>重选 A / B</button>
        {calibrationBackup && <button type="button" onClick={() => { setDraft({ ...draft, ...calibrationBackup }); setCalibrationBackup(null); setMode('pan'); }}>撤销重选</button>}
        <strong>{metersPerPixel ? `比例尺 ${metersPerPixel.toFixed(5)} m/px` : '点击“两点标尺”，在图上依次选 A、B，再输入真实距离'}</strong>
      </div>
      <div className="imported-layout-detail-tabs" role="tablist" aria-label="图纸对象编辑">
        <button type="button" id="layout-tab-regions" role="tab" aria-controls="layout-panel-regions" aria-selected={detailTab === 'regions'} className={detailTab === 'regions' ? 'active' : ''} onClick={() => setDetailTab('regions')}>区域面积 <span>{(draft.regions ?? []).length}</span></button>
        <button type="button" id="layout-tab-lines" role="tab" aria-controls="layout-panel-lines" aria-selected={detailTab === 'lines'} className={detailTab === 'lines' ? 'active' : ''} onClick={() => setDetailTab('lines')}>墙与通道 <span>{(draft.lines ?? []).length}</span></button>
        <button type="button" id="layout-tab-points" role="tab" aria-controls="layout-panel-points" aria-selected={detailTab === 'points'} className={detailTab === 'points' ? 'active' : ''} onClick={() => setDetailTab('points')}>点位 <span>{(draft.objectPoints ?? []).length}</span></button>
      </div>
      {detailTab === 'regions' && <div id="layout-panel-regions" role="tabpanel" aria-labelledby="layout-tab-regions" className="imported-layout-region-list"><strong>区域面积编辑 · {(draft.regions ?? []).length}</strong>
        {(draft.regions ?? []).map((region) => {
          const area = Math.abs(region.end.x - region.start.x) * Math.abs(region.end.y - region.start.y) * (metersPerPixel ?? 0) ** 2;
          return <div className="imported-layout-region-row" key={region.id}>
            <span className="imported-layout-region-area">{region.overrideAreaM2 !== undefined ? `${region.overrideAreaM2.toFixed(1)} m²（人工覆盖）` : metersPerPixel ? `${area.toFixed(1)} m²` : '面积待标定'}</span>
            <label>名称 <input className="region-name-input" value={region.name} onChange={(event) => updateRegion(region.id, { name: event.target.value })}
              onBlur={() => { if (!region.name.trim()) updateRegion(region.id, { name: `${regionTypes.find((item) => item.value === region.type)?.label ?? '区域'} ${region.id.slice(0, 4)}` }); }} /></label>
            <div className="imported-layout-region-type-field"><span>类型</span><RegionTypeMenu id={region.id} value={region.type} onChange={(type) => updateRegion(region.id, { type })} /></div>
            <label>覆盖面积 <input type="number" min="0.01" step="0.1" placeholder="按标注计算" value={region.overrideAreaM2 ?? ''} onChange={(event) => { const value = Number(event.target.value); setDraft({ ...draft, regions: (draft.regions ?? []).map((item) => item.id === region.id ? { ...item, overrideAreaM2: event.target.value && value > 0 ? value : undefined } : item) }); }} /> m²</label>
            <button type="button" onClick={() => startRegionReposition(region)}>重画范围</button>
            <button type="button" onClick={() => { setDraft({ ...draft, regions: (draft.regions ?? []).filter((item) => item.id !== region.id) }); if (regionRepositionId === region.id) { setRegionRepositionId(null); setRegionStart(null); setMode('pan'); } }}>删除</button>
          </div>;
        })}
      </div>}
      {detailTab === 'lines' && <div id="layout-panel-lines" role="tabpanel" aria-labelledby="layout-tab-lines" className="imported-layout-region-list"><div className="imported-layout-list-heading">
        <strong>墙与通道 · {(draft.lines ?? []).length}</strong>
        <button type="button" disabled={!(draft.deletedLines?.length)} onClick={restoreLastLine}>恢复上一条{draft.deletedLines?.length ? `（${draft.deletedLines.length}）` : ''}</button>
      </div>
        {(draft.lines ?? []).map((line) => <div className="imported-layout-region-row" key={line.id}>
          <span>{line.name} · {line.type === 'wall' ? '墙 / 不可穿越' : '通道'} · {metersPerPixel
            ? `${line.type === 'wall' ? '墙段长 ' : '距离 '}${(Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y) * metersPerPixel).toFixed(1)} m${line.type === 'wall' && line.openings?.length ? '（含门洞）' : ''}`
            : '长度待标定'}
            {blockedAisleIds.has(line.id) && ' · 与墙中心线相交，需确认开口'}</span>
          {line.type === 'aisle' && <label>净宽 <input type="number" min="0.1" step="0.1" placeholder="待录入" value={line.widthM ?? ''}
            onChange={(event) => { const widthM = Number(event.target.value); setDraft({ ...draft, lines: (draft.lines ?? []).map((item) => item.id === line.id ? { ...item, widthM: event.target.value && widthM > 0 ? widthM : undefined } : item) }); }} /> m</label>}
          {line.type === 'wall' && <button type="button" disabled={!metersPerPixel} onClick={() => addOpening(line)}>在此段开门</button>}
          {(line.openings ?? []).map((opening) => { const lengthM = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y) * (metersPerPixel ?? 0);
            return <span key={opening.id} className="imported-layout-opening-fields">
              <label>门中心 <input type="number" min="0" max={lengthM.toFixed(2)} step="0.1" value={(opening.at * lengthM).toFixed(1)}
                onChange={(event) => { const at = lengthM ? Number(event.target.value) / lengthM : 0.5; updateOpening(line.id, opening.id, { at: Math.max(0, Math.min(1, at)) }); }} /> m</label>
              <label>净宽 <input type="number" min="0.1" max={lengthM.toFixed(2)} step="0.1" value={opening.widthM}
                onChange={(event) => updateOpening(line.id, opening.id, { widthM: Math.max(0.1, Number(event.target.value)) })} /> m</label>
              <button type="button" onClick={() => deleteOpening(line.id, opening.id)}>移除门</button>
              {(opening.at * lengthM < opening.widthM / 2 || (1 - opening.at) * lengthM < opening.widthM / 2) && <small>门超出墙段，请调整位置或净宽</small>}
            </span>; })}
          <button type="button" onClick={() => deleteLine(line.id)}>删除</button>
        </div>)}
      </div>}
      {detailTab === 'points' && <div id="layout-panel-points" role="tabpanel" aria-labelledby="layout-tab-points" className="imported-layout-region-list"><strong>已创建点位 · {(draft.objectPoints ?? []).length}</strong>
        {(draft.objectPoints ?? []).map((object, index) => <div className="imported-layout-region-row" key={object.id}>
          <label>类型 <select value={object.type} onChange={(event) => {
            const type = event.target.value as ObjectPointType;
            const oldLabel = pointTypes.find((item) => item.value === object.type)?.label ?? '点位';
            const newLabel = pointTypes.find((item) => item.value === type)?.label ?? '点位';
            const autoName = !object.name.trim() || object.name.startsWith(oldLabel + ' ');
            updateObjectPoint(object.id, { type, name: autoName ? newLabel + ' ' + (index + 1) : object.name });
          }}>{pointTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>名称 <input value={object.name} placeholder="点位名称" onChange={(event) => updateObjectPoint(object.id, { name: event.target.value })}
            onBlur={() => { if (!object.name.trim()) updateObjectPoint(object.id, { name: (pointTypes.find((item) => item.value === object.type)?.label ?? '点位') + ' ' + (index + 1) }); }} /></label>
          <label>X <input type="number" min="0" max={draft.width} step="1" value={Math.round(object.position.x)}
            onChange={(event) => updateObjectPoint(object.id, { position: { ...object.position, x: Math.max(0, Math.min(draft.width, Number(event.target.value))) } })} /> px</label>
          <label>Y <input type="number" min="0" max={draft.height} step="1" value={Math.round(object.position.y)}
            onChange={(event) => updateObjectPoint(object.id, { position: { ...object.position, y: Math.max(0, Math.min(draft.height, Number(event.target.value))) } })} /> px</label>
          <button type="button" onClick={() => deleteObjectPoint(object.id)}>删除</button>
        </div>)}
      </div>}
    </> : <div className="imported-layout-empty">上传 PDF、PNG 或 JPG 后，为每张图纸设置楼栋和楼层，再分别标定比例尺与区域。</div>}
  </section>;
}
