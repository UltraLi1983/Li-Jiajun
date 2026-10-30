import type { Demo2Scenario } from '../types/demo2';

export type ScenarioCsvExportSource = {
  revision: number;
  source: 'sample' | 'savedDraft';
  isDirty: boolean;
};

type CsvFile = {
  fileName: string;
  content: string;
};

const pointHeaders = [
  'scene_id',
  'base_revision',
  'record_type',
  'id',
  'name',
  'x_px',
  'y_px',
  'x_m',
  'y_m',
  'station_id',
  'route_node_id',
  'source_state',
  'edit_note'
];

const routeHeaders = [
  'scene_id',
  'base_revision',
  'id',
  'from_node_id',
  'to_node_id',
  'distance_m',
  'bidirectional',
  'enabled',
  'clear_width_m',
  'source_state',
  'edit_note'
];

export function createPointsCsv(scenario: Demo2Scenario, source: ScenarioCsvExportSource): CsvFile {
  const scale = scenario.layout.calculationScaleMPerPx ?? scenario.layout.scaleMetersPerPixel;
  const rows = [
    ...scenario.productionStations.map((station) => [
      scenario.id,
      source.revision,
      'production_station',
      station.id,
      station.name,
      station.position.x,
      station.position.y,
      roundCsvNumber(station.position.x * scale),
      roundCsvNumber(station.position.y * scale),
      station.id,
      '',
      sourceState(source),
      ''
    ]),
    ...scenario.deliveryPoints.map((point) => [
      scenario.id,
      source.revision,
      'delivery_point',
      point.id,
      point.name,
      point.position.x,
      point.position.y,
      roundCsvNumber(point.position.x * scale),
      roundCsvNumber(point.position.y * scale),
      point.servesProductionStationIds.join('|'),
      point.routeNodeId ?? '',
      sourceState(source),
      point.routeNodeId ? '' : '待连接通道节点'
    ]),
    ...scenario.pathNetwork.nodes.map((node) => [
      scenario.id,
      source.revision,
      'route_node',
      node.id,
      node.name,
      node.position.x,
      node.position.y,
      roundCsvNumber(node.position.x * scale),
      roundCsvNumber(node.position.y * scale),
      '',
      node.id,
      sourceState(source),
      ''
    ])
  ];

  return {
    fileName: buildCsvFileName(scenario.name, 'points', source.revision),
    content: toCsv([pointHeaders, ...rows])
  };
}

export function createRoutesCsv(scenario: Demo2Scenario, source: ScenarioCsvExportSource): CsvFile {
  const rows = scenario.pathNetwork.segments.map((segment) => [
    scenario.id,
    source.revision,
    segment.id,
    segment.fromNodeId,
    segment.toNodeId,
    roundCsvNumber(segment.distanceM),
    segment.bidirectional,
    segment.enabled ?? true,
    segment.clearWidthM ?? '',
    sourceState(source),
    ''
  ]);

  return {
    fileName: buildCsvFileName(scenario.name, 'routes', source.revision),
    content: toCsv([routeHeaders, ...rows])
  };
}

export function downloadCsvFile(file: CsvFile) {
  const blob = new Blob([`\ufeff${file.content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function roundCsvNumber(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : '';
}

function sourceState(source: ScenarioCsvExportSource) {
  if (source.isDirty) return 'current_session_dirty';
  if (source.source === 'savedDraft') return 'local_draft_saved';
  return 'sample';
}

function buildCsvFileName(scenarioName: string, kind: 'points' | 'routes', revision: number) {
  const safeName = scenarioName
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'demo2-factory-scene';
  return `${safeName}-r${revision}-${kind}.csv`;
}
