import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

const DB_NAME = 'demo2-layout-workspace';
const STORE_NAME = 'drafts';
const DRAFT_ID = 'current';

type PixelPoint = { x: number; y: number };
type ImportedLayoutDraft = {
  fileName: string;
  dataUrl: string;
  width: number;
  height: number;
  points: PixelPoint[];
  knownDistanceM: number | null;
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

function measuredPixels(points: PixelPoint[]) {
  return points.length === 2 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
}

export function ImportedLayoutWorkspace() {
  const [draft, setDraft] = useState<ImportedLayoutDraft | null>(null);
  const [message, setMessage] = useState('尚未导入新 Layout');
  const [mode, setMode] = useState<'pan' | 'measure'>('pan');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const loadComplete = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    readDraft().then((saved) => {
      if (saved) {
        setDraft(saved);
        setMessage(`已恢复导入草稿 · ${saved.fileName}`);
      }
    }).catch(() => setMessage('本机草稿读取失败；可以重新导入图片')).finally(() => { loadComplete.current = true; });
  }, []);

  useEffect(() => {
    if (!draft || !loadComplete.current) return;
    const saved = { ...draft, savedAt: new Date().toISOString() };
    saveQueue.current = saveQueue.current.catch(() => undefined).then(() => writeDraft(saved));
    saveQueue.current.then(() => setMessage(`已自动保存导入草稿 · ${saved.fileName}`))
      .catch(() => setMessage('自动保存失败；请检查浏览器存储空间'));
  }, [draft]);

  const importFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('请上传图片；PDF 可先导出为 PNG 或 JPG');
      return;
    }
    try {
      const image = await readImage(file);
      setDraft({ fileName: file.name, ...image, points: [], knownDistanceM: null, savedAt: new Date().toISOString() });
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setMode('pan');
      setMessage(`已导入 ${file.name} · ${image.width}×${image.height}px`);
    } catch {
      setMessage('无法读取这张图片，请换一份 PNG 或 JPG');
    }
  };

  const addMeasurePoint = (event: MouseEvent<HTMLImageElement>) => {
    if (mode !== 'measure' || !draft) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(draft.width, (event.clientX - bounds.left) / bounds.width * draft.width));
    const y = Math.max(0, Math.min(draft.height, (event.clientY - bounds.top) / bounds.height * draft.height));
    const point = { x, y };
    setDraft({ ...draft, points: draft.points.length >= 2 ? [point] : [...draft.points, point], knownDistanceM: null });
  };

  const pixelDistance = draft ? measuredPixels(draft.points) : 0;
  const metersPerPixel = draft?.knownDistanceM && pixelDistance > 0 ? draft.knownDistanceM / pixelDistance : null;

  return <section className="section-card imported-layout-section">
    <div className="imported-layout-heading">
      <div><p className="eyebrow">T3.1–T3.2 IMPORT & SCALE</p><h3>新 Layout 导入与两点标尺</h3></div>
      <span className="imported-layout-status">{message}</span>
    </div>
    <p className="imported-layout-note">这张图是独立的待标注草稿。完成区域和通道标注前，不叠加现有样板路线，也不参与运力计算。</p>
    <div className="imported-layout-toolbar">
      <label className="imported-layout-upload">导入图片（PNG / JPG）<input type="file" accept="image/*" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button type="button" className={mode === 'pan' ? 'active' : ''} onClick={() => setMode('pan')} disabled={!draft}>拖动查看</button>
      <button type="button" className={mode === 'measure' ? 'active' : ''} onClick={() => setMode('measure')} disabled={!draft}>两点标尺</button>
      <button type="button" onClick={() => setZoom((value) => Math.min(4, Math.round((value + 0.25) * 100) / 100))} disabled={!draft}>放大 +</button>
      <button type="button" onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.25) * 100) / 100))} disabled={!draft}>缩小 −</button>
      <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} disabled={!draft}>复位视图</button>
      {draft && <span className="imported-layout-zoom">{Math.round(zoom * 100)}%</span>}
    </div>
    {draft ? <>
      <div className={`imported-layout-viewport ${mode === 'pan' ? 'is-pannable' : 'is-measuring'}`}
        onPointerDown={(event) => { if (mode !== 'pan') return; drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (!drag.current) return; setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y }); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="imported-layout-image-wrap" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <img ref={imageRef} src={draft.dataUrl} alt={`待标注 Layout：${draft.fileName}`} draggable={false} onClick={addMeasurePoint} />
          {draft.points.length === 2 && <svg className="imported-layout-measure-line" viewBox={`0 0 ${draft.width} ${draft.height}`} preserveAspectRatio="none" aria-hidden="true"><line x1={draft.points[0].x} y1={draft.points[0].y} x2={draft.points[1].x} y2={draft.points[1].y} /></svg>}
          {draft.points.map((point, index) => <span key={index} className="imported-layout-measure-point" style={{ left: `${point.x / draft.width * 100}%`, top: `${point.y / draft.height * 100}%` }}>{index === 0 ? 'A' : 'B'}</span>)}
        </div>
      </div>
      <div className="imported-layout-calibration">
        <span>原图 {draft.width}×{draft.height}px</span>
        <span>标尺 {pixelDistance ? pixelDistance.toFixed(1) : '—'}px</span>
        <label>两点实际距离 <input type="number" min="0.001" step="0.1" value={draft.knownDistanceM ?? ''} onChange={(event) => setDraft({ ...draft, knownDistanceM: Number(event.target.value) > 0 ? Number(event.target.value) : null })} disabled={draft.points.length !== 2} /> m</label>
        <strong>{metersPerPixel ? `比例尺 ${metersPerPixel.toFixed(5)} m/px` : '点击“两点标尺”，在图上依次选 A、B，再输入真实距离'}</strong>
      </div>
    </> : <div className="imported-layout-empty">上传工厂平面图后，在这里查看、缩放、平移和标定比例尺。PDF 请先导出为图片。</div>}
  </section>;
}
