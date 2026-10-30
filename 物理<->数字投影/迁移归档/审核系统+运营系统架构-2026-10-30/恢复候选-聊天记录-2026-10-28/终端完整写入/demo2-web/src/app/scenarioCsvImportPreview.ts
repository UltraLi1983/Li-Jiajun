import type { Demo2Scenario } from '../types/demo2';
import type {
  CsvImportPreview,
  CsvPreviewChange,
  CsvPreviewIssue,
  CsvRecordAction,
  CsvRecordType,
  PointsCsvRow,
  RoutesCsvRow
} from './scenarioCsvImportContract';

type PreviewInput = {
  scenario: Demo2Scenario;
  currentRevision: number;
  pointsCsv?: string;
  routesCsv?: string;
};

type ParsedRow = {
  rowNumber: number;
  values: Record<string, string>;
};

const pointsRequiredFields = ['scene_id', 'base_revision', 'record_type', 'id', 'name', 'x_px', 'y_px'];
const routesRequiredFields = ['scene_id', 'base_revision', 'id', 'from_node_id', 'to_node_id', 'distance_m', 'bidirectional'];
const validPointTypes: CsvRecordType[] = ['production_station', 'delivery_point', 'route_node'];
const validActions: CsvRecordAction[] = ['upsert', 'delete'];

export function previewScenarioCsvImport({ scenario, currentRevision, pointsCsv = '', routesCsv = '' }: PreviewInput): CsvImportPreview {
  const issues: CsvPreviewIssue[] = [];
  const pointRows = parseCsvRows(pointsCsv);
  const routeRows = parseCsvRows(routesCsv);
  const baseRevision = resolveBaseRevision([...pointRows, ...routeRows], currentRevision, issues);
  const pointChanges = previewPointRows(scenario, pointRows, issues);
  const routeChanges = previewRouteRows(scenario, routeRows, pointRows, issues);
  const allChanges = [...pointChanges, ...routeChanges];
  const hasBlockingIssue = issues.some((issue) => issue.code === 'revision_conflict' || issue.code === 'mixed_base_revision');
  const hasErrors = issues.length > 0 || allChanges.some((change) => change.issues.length > 0 || change.kind === 'error');

  return {
    status: hasBlockingIssue ? 'blocked' : hasErrors ? 'has_errors' : 'ready',
    sceneId: scenario.id,
    currentRevision,
    baseRevision,
    summary: {
      create: allChanges.filter((change) => change.kind === 'create').length,
      update: allChanges.filter((change) => change.kind === 'update').length,
      deleteRequest: allChanges.filter((change) => change.kind === 'delete_request').length,
      unchanged: allChanges.filter((change) => change.kind === 'unchanged').length,
      error: issues.length + allChanges.filter((change) => change.kind === 'error').length
    },
    points: pointChanges,
    routes: routeChanges,
    issues
  };
}

function previewPointRows(scenario: Demo2Scenario, parsedRows: ParsedRow[], globalIssues: CsvPreviewIssue[]) {
  const changes: CsvPreviewChange<PointsCsvRow>[] = [];
  const seenByType = new Set<string>();
  const currentByKey = new Map<string, unknown>([
    ...scenario.productionStations.map((station) => [`production_station:${station.id}`, station] as const),
    ...scenario.deliveryPoints.map((point) => [`delivery_point:${point.id}`, point] as const),
    ...scenario.pathNetwork.nodes.map((node) => [`route_node:${node.id}`, node] as const)
  ]);
  const routeNodeIds = new Set([
    ...scenario.pathNetwork.nodes.map((node) => node.id),
    ...parsedRows.filter((row) => row.values.record_type === 'route_node').map((row) => row.values.id).filter(Boolean)
  ]);

  for (const parsed of parsedRows) {
    const rowIssues: CsvPreviewIssue[] = [];
    requireFields(parsed, pointsRequiredFields, rowIssues);
    validateSceneId(parsed, scenario.id, rowIssues);
    const recordType = parsed.values.record_type as CsvRecordType;
    if (parsed.values.record_type && !validPointTypes.includes(recordType)) {
      addIssue(rowIssues, parsed.rowNumber, 'record_type', 'invalid_record_type', `record_type 必须是 ${validPointTypes.join(' / ')}。`);
    }
    const xPx = parseFiniteNumber(parsed.values.x_px);
    const yPx = parseFiniteNumber(parsed.values.y_px);
    if (parsed.values.x_px && xPx === undefined) addIssue(rowIssues, parsed.rowNumber, 'x_px', 'invalid_coordinate', 'x_px 必须是数字。');
    if (parsed.values.y_px && yPx === undefined) addIssue(rowIssues, parsed.rowNumber, 'y_px', 'invalid_coordinate', 'y_px 必须是数字。');

    const action = normalizeAction(parsed.values.action, parsed.rowNumber, rowIssues);
    const key = `${recordType}:${parsed.values.id}`;
    if (recordType && parsed.values.id) {
      if (seenByType.has(key)) addIssue(rowIssues, parsed.rowNumber, 'id', 'duplicate_id', `${recordType} 内部 ID ${parsed.values.id} 重复。`);
      seenByType.add(key);
    }
    if (recordType === 'delivery_point' && parsed.values.route_node_id && !routeNodeIds.has(parsed.values.route_node_id)) {
      addIssue(rowIssues, parsed.rowNumber, 'route_node_id', 'unknown_route_node', `route_node_id ${parsed.values.route_node_id} 不存在。`);
    }
    if (recordType === 'route_node' && action === 'delete' && routeNodeHasDependencies(scenario, parsed.values.id)) {
      addIssue(rowIssues, parsed.rowNumber, 'action', 'delete_dependency_blocked', `路径节点 ${parsed.values.id} 仍被配送点或路径段引用，不能直接删除。`);
    }

    const after = rowIssues.length ? undefined : toPointRow(parsed, recordType, xPx ?? 0, yPx ?? 0, action);
    const before = currentByKey.get(key);
    changes.push({
      kind: rowIssues.length ? 'error' : action === 'delete' ? 'delete_request' : before ? diffPoint(before, after) : 'create',
      rowNumber: parsed.rowNumber,
      id: parsed.values.id || '(空 ID)',
      label: parsed.values.name || parsed.values.id || `第 ${parsed.rowNumber} 行`,
      before,
      after,
      issues: rowIssues
    });
    globalIssues.push(...rowIssues);
  }

  return changes;
}

function previewRouteRows(scenario: Demo2Scenario, parsedRows: ParsedRow[], pointRows: ParsedRow[], globalIssues: CsvPreviewIssue[]) {
  const changes: CsvPreviewChange<RoutesCsvRow>[] = [];
  const currentSegments = new Map(scenario.pathNetwork.segments.map((segment) => [segment.id, segment]));
  const seenIds = new Set<string>();
  const routeNodeIds = new Set([
    ...scenario.pathNetwork.nodes.map((node) => node.id),
    ...pointRows.filter((row) => row.values.record_type === 'route_node').map((row) => row.values.id).filter(Boolean)
  ]);

  for (const parsed of parsedRows) {
    const rowIssues: CsvPreviewIssue[] = [];
    requireFields(parsed, routesRequiredFields, rowIssues);
    validateSceneId(parsed, scenario.id, rowIssues);
    if (parsed.values.id) {
      if (seenIds.has(parsed.values.id)) addIssue(rowIssues, parsed.rowNumber, 'id', 'duplicate_id', `路径段 ID ${parsed.values.id} 重复。`);
      seenIds.add(parsed.values.id);
    }
    if (parsed.values.from_node_id && !routeNodeIds.has(parsed.values.from_node_id)) {
      addIssue(rowIssues, parsed.rowNumber, 'from_node_id', 'unknown_segment_node', `起点节点 ${parsed.values.from_node_id} 不存在。`);
    }
    if (parsed.values.to_node_id && !routeNodeIds.has(parsed.values.to_node_id)) {
      addIssue(rowIssues, parsed.rowNumber, 'to_node_id', 'unknown_segment_node', `终点节点 ${parsed.values.to_node_id} 不存在。`);
    }
    const distanceM = parseFiniteNumber(parsed.values.distance_m);
    if (parsed.values.distance_m && (distanceM === undefined || distanceM < 0)) {
      addIssue(rowIssues, parsed.rowNumber, 'distance_m', 'invalid_distance', 'distance_m 必须是非负数字。');
    }
    const bidirectional = parseBoolean(parsed.values.bidirectional);
    if (parsed.values.bidirectional && bidirectional === undefined) {
      addIssue(rowIssues, parsed.rowNumber, 'bidirectional', 'invalid_boolean', 'bidirectional 必须是 true 或 false。');
    }
    const enabled = parsed.values.enabled ? parseBoolean(parsed.values.enabled) : undefined;
    if (parsed.values.enabled && enabled === undefined) {
      addIssue(rowIssues, parsed.rowNumber, 'enabled', 'invalid_boolean', 'enabled 必须是 true 或 false。');
    }
    const clearWidthM = parsed.values.clear_width_m ? parseFiniteNumber(parsed.values.clear_width_m) : undefined;
    if (parsed.values.clear_width_m && (clearWidthM === undefined || clearWidthM <= 0)) {
      addIssue(rowIssues, parsed.rowNumber, 'clear_width_m', 'invalid_clear_width', 'clear_width_m 必须大于 0。');
    }
    const action = normalizeAction(parsed.values.action, parsed.rowNumber, rowIssues);
    const after = rowIssues.length ? undefined : toRouteRow(parsed, distanceM ?? 0, bidirectional ?? false, enabled, clearWidthM, action);
    const before = currentSegments.get(parsed.values.id);
    changes.push({
      kind: rowIssues.length ? 'error' : action === 'delete' ? 'delete_request' : before ? diffRoute(before, after) : 'create',
      rowNumber: parsed.rowNumber,
      id: parsed.values.id || '(空 ID)',
      label: parsed.values.id || `第 ${parsed.rowNumber} 行`,
      before,
      after,
      issues: rowIssues
    });
    globalIssues.push(...rowIssues);
  }

  return changes;
}

function parseCsvRows(csv: string): ParsedRow[] {
  const rows = parseCsv(csv.replace(/^\ufeff/, '').trim());
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? '']))
  })).filter((row) => Object.values(row.values).some(Boolean));
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function resolveBaseRevision(rows: ParsedRow[], currentRevision: number, issues: CsvPreviewIssue[]) {
  const revisions = rows.map((row) => parseFiniteNumber(row.values.base_revision)).filter((value): value is number => value !== undefined);
  const unique = [...new Set(revisions)];
  if (rows.length === 0) return undefined;
  if (unique.length !== 1 || revisions.length !== rows.length) {
    issues.push({ rowNumber: 0, field: 'base_revision', code: 'mixed_base_revision', message: 'CSV 内 base_revision 缺失或不一致，不能提交。' });
    return unique[0];
  }
  const baseRevision = unique[0];
  if (baseRevision !== currentRevision) {
    issues.push({
      rowNumber: 0,
      field: 'base_revision',
      code: 'revision_conflict',
      message: `CSV 基于 r${baseRevision}，当前草稿是 r${currentRevision}；请重新导出或先对比最新草稿。`
    });
  }
  return baseRevision;
}

function requireFields(row: ParsedRow, fields: string[], issues: CsvPreviewIssue[]) {
  for (const field of fields) {
    if (!row.values[field]) addIssue(issues, row.rowNumber, field, 'missing_required_field', `${field} 是必填字段。`);
  }
}

function validateSceneId(row: ParsedRow, sceneId: string, issues: CsvPreviewIssue[]) {
  if (row.values.scene_id && row.values.scene_id !== sceneId) {
    addIssue(issues, row.rowNumber, 'scene_id', 'scene_mismatch', `scene_id ${row.values.scene_id} 与当前场景 ${sceneId} 不一致。`);
  }
}

function normalizeAction(value: string | undefined, rowNumber: number, issues: CsvPreviewIssue[]): CsvRecordAction {
  if (!value) return 'upsert';
  const normalized = value.trim().toLowerCase() as CsvRecordAction;
  if (!validActions.includes(normalized)) {
    addIssue(issues, rowNumber, 'action', 'missing_required_field', 'action 只能是 upsert 或 delete。');
    return 'upsert';
  }
  return normalized;
}

function addIssue(issues: CsvPreviewIssue[], rowNumber: number, field: string, code: CsvPreviewIssue['code'], message: string) {
  issues.push({ rowNumber, field, code, message });
}

function normalizeHeader(header: string) {
  return header.trim().replace(/^\ufeff/, '').toLowerCase();
}

function parseFiniteNumber(value: string | undefined) {
  if (value === undefined || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseBoolean(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return undefined;
}

function toPointRow(row: ParsedRow, recordType: CsvRecordType, xPx: number, yPx: number, action: CsvRecordAction): PointsCsvRow {
  return {
    sceneId: row.values.scene_id,
    baseRevision: Number(row.values.base_revision),
    recordType,
    id: row.values.id,
    name: row.values.name,
    xPx,
    yPx,
    xM: parseFiniteNumber(row.values.x_m),
    yM: parseFiniteNumber(row.values.y_m),
    stationId: row.values.station_id || undefined,
    routeNodeId: row.values.route_node_id || undefined,
    sourceState: row.values.source_state || undefined,
    editNote: row.values.edit_note || undefined,
    action
  };
}

function toRouteRow(
  row: ParsedRow,
  distanceM: number,
  bidirectional: boolean,
  enabled: boolean | undefined,
  clearWidthM: number | undefined,
  action: CsvRecordAction
): RoutesCsvRow {
  return {
    sceneId: row.values.scene_id,
    baseRevision: Number(row.values.base_revision),
    id: row.values.id,
    fromNodeId: row.values.from_node_id,
    toNodeId: row.values.to_node_id,
    distanceM,
    bidirectional,
    enabled,
    clearWidthM,
    sourceState: row.values.source_state || undefined,
    editNote: row.values.edit_note || undefined,
    action
  };
}

function diffPoint(before: unknown, after: PointsCsvRow | undefined) {
  if (!after || typeof before !== 'object' || before === null) return 'update';
  const current = before as { name?: string; position?: { x: number; y: number }; routeNodeId?: string; servesProductionStationIds?: string[] };
  const sameName = current.name === after.name;
  const samePosition = current.position?.x === after.xPx && current.position?.y === after.yPx;
  const sameRouteNode = (current.routeNodeId ?? '') === (after.routeNodeId ?? '');
  const sameStation = !current.servesProductionStationIds || current.servesProductionStationIds.join('|') === (after.stationId ?? '');
  return sameName && samePosition && sameRouteNode && sameStation ? 'unchanged' : 'update';
}

function diffRoute(before: unknown, after: RoutesCsvRow | undefined) {
  if (!after || typeof before !== 'object' || before === null) return 'update';
  const current = before as { fromNodeId?: string; toNodeId?: string; distanceM?: number; bidirectional?: boolean; enabled?: boolean; clearWidthM?: number };
  const same = current.fromNodeId === after.fromNodeId
    && current.toNodeId === after.toNodeId
    && Number(current.distanceM?.toFixed(3)) === Number(after.distanceM.toFixed(3))
    && current.bidirectional === after.bidirectional
    && (current.enabled ?? true) === (after.enabled ?? true)
    && (current.clearWidthM ?? '') === (after.clearWidthM ?? '');
  return same ? 'unchanged' : 'update';
}

function routeNodeHasDependencies(scenario: Demo2Scenario, nodeId: string) {
  return scenario.deliveryPoints.some((point) => point.routeNodeId === nodeId)
    || scenario.pathNetwork.segments.some((segment) => segment.fromNodeId === nodeId || segment.toNodeId === nodeId);
}
