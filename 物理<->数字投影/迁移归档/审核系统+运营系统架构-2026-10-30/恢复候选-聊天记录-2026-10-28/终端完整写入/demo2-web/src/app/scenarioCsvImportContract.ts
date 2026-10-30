export type CsvRecordAction = 'upsert' | 'delete';
export type CsvPreviewStatus = 'ready' | 'blocked' | 'has_errors';
export type CsvPreviewChangeKind = 'create' | 'update' | 'delete_request' | 'unchanged' | 'error';
export type CsvRecordType = 'production_station' | 'delivery_point' | 'route_node';

export type CsvPreviewErrorCode =
  | 'missing_required_field'
  | 'scene_mismatch'
  | 'revision_conflict'
  | 'mixed_base_revision'
  | 'duplicate_id'
  | 'invalid_record_type'
  | 'invalid_coordinate'
  | 'unknown_route_node'
  | 'unknown_segment_node'
  | 'invalid_distance'
  | 'invalid_boolean'
  | 'invalid_clear_width'
  | 'delete_dependency_blocked';

export type PointsCsvRow = {
  sceneId: string;
  baseRevision: number;
  recordType: CsvRecordType;
  id: string;
  name: string;
  xPx: number;
  yPx: number;
  xM?: number;
  yM?: number;
  stationId?: string;
  routeNodeId?: string;
  sourceState?: string;
  editNote?: string;
  action?: CsvRecordAction;
};

export type RoutesCsvRow = {
  sceneId: string;
  baseRevision: number;
  id: string;
  fromNodeId: string;
  toNodeId: string;
  distanceM: number;
  bidirectional: boolean;
  enabled?: boolean;
  clearWidthM?: number;
  sourceState?: string;
  editNote?: string;
  action?: CsvRecordAction;
};

export type CsvPreviewIssue = {
  rowNumber: number;
  field?: string;
  code: CsvPreviewErrorCode;
  message: string;
};

export type CsvPreviewChange<Row> = {
  kind: CsvPreviewChangeKind;
  rowNumber: number;
  id: string;
  label: string;
  before?: unknown;
  after?: Row;
  issues: CsvPreviewIssue[];
};

export type CsvImportPreview = {
  status: CsvPreviewStatus;
  sceneId: string;
  currentRevision: number;
  baseRevision?: number;
  summary: {
    create: number;
    update: number;
    deleteRequest: number;
    unchanged: number;
    error: number;
  };
  points: CsvPreviewChange<PointsCsvRow>[];
  routes: CsvPreviewChange<RoutesCsvRow>[];
  issues: CsvPreviewIssue[];
};

export type CsvImportCommitRequest = {
  expectedRevision: number;
  previewId: string;
  changeSummary?: string;
};

export type CsvImportCommitResponse = {
  sceneId: string;
  revision: number;
  updatedAt: string;
  calculationState: 'stale';
};
