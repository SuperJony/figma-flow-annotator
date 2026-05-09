export interface Point {
  x: number;
  y: number;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SHARED_PLUGIN_DATA = {
  namespace: 'figma_flow_annotator',
  keys: {
    kind: 'kind',
    annotation: 'annotation',
    badgeRef: 'badgeRef',
    connector: 'connector',
    annotationRefs: 'annotationRefs',
    connectorRefs: 'connectorRefs',
    context: 'context',
  },
} as const;

export type SharedPluginDataKey =
  (typeof SHARED_PLUGIN_DATA.keys)[keyof typeof SHARED_PLUGIN_DATA.keys];

export const VISUAL_NODE_KINDS = {
  annotationCard: 'annotation-card',
  annotationBadge: 'annotation-badge',
  flowConnector: 'flow-connector',
  container: 'container',
} as const;

export type VisualNodeKind = (typeof VISUAL_NODE_KINDS)[keyof typeof VISUAL_NODE_KINDS];

export const ANNOTATIONS_CONTAINER_NAME = 'FFA Annotations';
export const CONNECTORS_CONTAINER_NAME = 'FFA Connectors';

export interface AnnotationRecord {
  schemaVersion: 1;
  id: string;
  annotationNumber: number;
  title?: string;
  body: string;
  kind?: string;
  contextFrameId: string;
  subjectNodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BadgeRefRecord {
  schemaVersion: 1;
  annotationId: string;
  annotationNumber: number;
  subjectNodeId: string;
  contextFrameId: string;
}

export interface ContextRecord {
  schemaVersion: 1;
  contextFrameId: string;
  nextAnnotationNumber: number;
}

export interface AnnotationRefsRecord {
  schemaVersion: 1;
  annotationIds: string[];
}

export interface FlowEndpointRecord {
  nodeId: string;
  contextFrameId: string;
}

export interface ConnectorRouteCache {
  schemaVersion: 1;
  points: Point[];
}

export interface FlowConnectorRecord {
  schemaVersion: 1;
  id: string;
  start: FlowEndpointRecord;
  end: FlowEndpointRecord;
  ownerContextFrameId: string;
  flowAction: string | null;
  routeCache?: ConnectorRouteCache;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorRefsRecord {
  schemaVersion: 1;
  connectorIds: string[];
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationIssueCode =
  | 'annotation-missing-badge'
  | 'annotation-duplicate-badge'
  | 'annotation-orphaned'
  | 'annotation-missing-body'
  | 'annotation-card-outside-design-notes-area'
  | 'annotation-cards-unsorted'
  | 'annotation-badges-unarranged'
  | 'flow-connector-orphaned'
  | 'flow-endpoint-invalid'
  | 'flow-connector-duplicate'
  | 'flow-action-empty'
  | 'connector-reverse-index-stale';

export interface ValidationIssue {
  id: string;
  code: ValidationIssueCode;
  severity: ValidationSeverity;
  title: string;
  affectedObjectCount: number;
  description: string;
  locationNodeIds: string[];
}

export interface ValidationReportSummary {
  all: number;
  errors: number;
  warnings: number;
  info: number;
}

export interface ValidationReport {
  schemaVersion: 1;
  issues: ValidationIssue[];
  summary: ValidationReportSummary;
}

export interface AnnotationValidationRecord {
  id: string;
  annotationNumber: number;
  body: string;
  contextFrameId: string;
  subjectNodeIds: string[];
}

export interface AnnotationValidationCardInput {
  nodeId: string;
  record: AnnotationValidationRecord;
  rect: RectLike;
}

export interface AnnotationValidationBadgeInput {
  nodeId: string;
  record: BadgeRefRecord;
  rect: RectLike;
}

export interface AnnotationValidationSubjectInput {
  nodeId: string;
  annotationIds: string[];
  rect?: RectLike;
}

export interface AnnotationValidationContextInput {
  nodeId: string;
  rect?: RectLike;
}

export interface ValidateAnnotationBindingsInput {
  badges: AnnotationValidationBadgeInput[];
  cards: AnnotationValidationCardInput[];
  contexts: AnnotationValidationContextInput[];
  subjects: AnnotationValidationSubjectInput[];
}

export interface FlowConnectorValidationConnectorInput {
  nodeId: string;
  record: FlowConnectorRecord;
}

export interface FlowConnectorValidationEndpointInput {
  nodeId: string;
  connectorIds: string[];
  isEligibleFlowEndpoint: boolean;
}

export interface ValidateFlowConnectorReferencesInput {
  connectors: FlowConnectorValidationConnectorInput[];
  endpoints: FlowConnectorValidationEndpointInput[];
}

export interface BuildCleanStaleIndexesPlanInput {
  endpoints: FlowConnectorValidationEndpointInput[];
  liveConnectorIds: string[];
}

export type SharedPluginDataValue =
  | string
  | AnnotationRecord
  | BadgeRefRecord
  | ContextRecord
  | AnnotationRefsRecord
  | FlowConnectorRecord
  | ConnectorRefsRecord;

export type DocumentNodeTarget =
  | { kind: 'existing-node'; nodeId: string }
  | { kind: 'created-node'; ref: string }
  | { kind: 'container'; ref: string };

export interface EnsureContainerOperation {
  type: 'ensure-container';
  ref: string;
  name: string;
}

export interface SetSharedPluginDataOperation {
  type: 'set-shared-plugin-data';
  target: DocumentNodeTarget;
  key: SharedPluginDataKey;
  value: SharedPluginDataValue;
}

export interface AppendSharedReferenceOperation {
  type: 'append-shared-reference';
  targetNodeId: string;
  key: 'annotationRefs' | 'connectorRefs';
  listKey: 'annotationIds' | 'connectorIds';
  id: string;
}

export interface CreateAnnotationCardOperation {
  type: 'create-annotation-card';
  ref: string;
  containerRef: string;
  name: string;
  annotationNumber: number;
  body: string;
  subjectSummary: string;
  basePosition: Point;
}

export interface CreateAnnotationBadgeOperation {
  type: 'create-annotation-badge';
  ref: string;
  containerRef: string;
  name: string;
  annotationNumber: number;
  subjectNodeId: string;
  position: Point;
}

export interface CreateFlowConnectorOperation {
  type: 'create-flow-connector';
  ref: string;
  containerRef: string;
  name: string;
  routePoints: Point[];
  flowAction: string | null;
}

export interface UpdateFlowConnectorOperation {
  type: 'update-flow-connector';
  targetNodeId: string;
  name: string;
  routePoints: Point[];
  flowAction: string | null;
}

export interface MoveNodeOperation {
  type: 'move-node';
  targetNodeId: string;
  position: Point;
}

export type DocumentChangeOperation =
  | EnsureContainerOperation
  | SetSharedPluginDataOperation
  | AppendSharedReferenceOperation
  | CreateAnnotationCardOperation
  | CreateAnnotationBadgeOperation
  | CreateFlowConnectorOperation
  | UpdateFlowConnectorOperation
  | MoveNodeOperation;

export interface DocumentChangePlan {
  schemaVersion: 1;
  kind:
    | 'create-annotation'
    | 'add-annotation-subjects'
    | 'arrange-annotation-badges'
    | 'arrange-annotation-cards'
    | 'create-flow-connector'
    | 'refresh-flow-connector'
    | 'clean-stale-indexes';
  operations: DocumentChangeOperation[];
}

export interface CreateAnnotationPlan extends DocumentChangePlan {
  kind: 'create-annotation';
  annotationNumber: number;
  annotationId: string;
  badgeCount: number;
  createdNodeRefs: string[];
  record: AnnotationRecord;
}

export interface CreateFlowConnectorPlan extends DocumentChangePlan {
  kind: 'create-flow-connector';
  connectorId: string;
  mode: 'create' | 'update' | 'idempotent';
  createdNodeRefs: string[];
  existingNodeRefs: string[];
  record: FlowConnectorRecord;
}

export interface RefreshFlowConnectorPlan extends DocumentChangePlan {
  kind: 'refresh-flow-connector';
  connectorId: string;
  mode: 'update' | 'idempotent';
  existingNodeRefs: string[];
  record: FlowConnectorRecord;
}

export interface CleanStaleIndexesPlan extends DocumentChangePlan {
  kind: 'clean-stale-indexes';
  cleanedEndpointNodeIds: string[];
  removedConnectorIds: string[];
}

export interface AddAnnotationSubjectsPlan extends DocumentChangePlan {
  kind: 'add-annotation-subjects';
  annotationId: string;
  annotationNumber: number;
  addedSubjectNodeIds: string[];
  badgeCount: number;
  createdNodeRefs: string[];
  record: AnnotationRecord;
}

export interface ArrangeAnnotationBadgesPlan extends DocumentChangePlan {
  kind: 'arrange-annotation-badges';
  movedBadgeNodeIds: string[];
}

export interface ArrangeAnnotationCardsPlan extends DocumentChangePlan {
  kind: 'arrange-annotation-cards';
  movedCardNodeIds: string[];
}

export interface AnnotationSubjectInput {
  id: string;
  name: string;
  bounds: RectLike;
  existingAnnotationRefCount: number;
}

export interface BuildCreateAnnotationPlanInput {
  annotationId: string;
  annotationNumber: number;
  body: string;
  contextFrameId: string;
  now: string;
  subjects: AnnotationSubjectInput[];
}

export interface BuildAddAnnotationSubjectsPlanInput {
  annotationCardNodeId: string;
  annotation: AnnotationRecord;
  existingBadgeSubjectNodeIds: string[];
  now: string;
  subjects: AnnotationSubjectInput[];
}

export interface AnnotationBadgeLayoutInput {
  annotationNumber: number;
  nodeId: string;
}

export interface SubjectBadgeLayoutInput {
  bounds: RectLike;
  badges: AnnotationBadgeLayoutInput[];
  id: string;
}

export interface BuildArrangeAnnotationBadgesPlanInput {
  subjects: SubjectBadgeLayoutInput[];
}

export interface AnnotationCardLayoutInput {
  annotationNumber: number;
  nodeId: string;
  rect: RectLike;
}

export interface BuildArrangeAnnotationCardsPlanInput {
  basePosition: Point;
  cards: AnnotationCardLayoutInput[];
}

export interface FlowEndpointInput {
  id: string;
  name: string;
  contextFrameId: string;
}

export interface BuildCreateFlowConnectorPlanInput {
  connectorId: string;
  existingConnector?: {
    nodeId: string;
    record: FlowConnectorRecord;
  };
  start: FlowEndpointInput;
  end: FlowEndpointInput;
  ownerContextFrameId: string;
  flowAction: string;
  routePoints: Point[];
  now: string;
}

export interface BuildRefreshFlowConnectorPlanInput {
  connectorNodeId: string;
  endName: string;
  now: string;
  record: FlowConnectorRecord;
  routePoints: Point[];
  startName: string;
}

export type ConnectorRouteSide = 'left' | 'right' | 'top' | 'bottom';

export type ConnectorObstacleKind = 'context-frame' | 'annotation-card';

export interface ConnectorObstacle {
  id?: string;
  kind: ConnectorObstacleKind;
  rect: RectLike;
}

export interface RouteOrthogonalConnectorInput {
  startRect: RectLike;
  endRect: RectLike;
  obstacles: ConnectorObstacle[];
  preferredStartSide?: ConnectorRouteSide;
  preferredEndSide?: ConnectorRouteSide;
  endpointGap?: number;
  obstaclePadding?: number;
}

export interface RouteOrthogonalConnectorResult {
  points: Point[];
}

export interface ConnectorRouteSegment {
  end: Point;
  index: number;
  length: number;
  start: Point;
}

export interface FlowActionLabelPlacement {
  center: Point;
  segmentIndex: number;
}

export interface PlaceFlowActionLabelInput {
  flowAction: string;
  obstaclePadding?: number;
  obstacles?: ConnectorObstacle[];
  routePoints: Point[];
  sharedTrunkSegment?: ConnectorRouteSegment;
}

export interface ConnectorTrunkInput {
  record: FlowConnectorRecord;
}

export interface ConnectorTrunkGroup {
  connectorIds: string[];
  endNodeId: string;
  groupKey: string;
  incomingSide: ConnectorRouteSide;
  segment: ConnectorRouteSegment;
}

export interface ConnectorTrunkAssignment {
  connectorId: string;
  groupKey: string;
  segment: ConnectorRouteSegment;
}

export interface ConnectorTrunkPlan {
  assignments: ConnectorTrunkAssignment[];
  groups: ConnectorTrunkGroup[];
}

export interface PlanConnectorTrunksInput {
  connectors: ConnectorTrunkInput[];
}

export type ConnectorRouteFailureCode = 'no-legal-route';

export class ConnectorRouteFailure extends Error {
  readonly code: ConnectorRouteFailureCode;

  constructor(message: string, code: ConnectorRouteFailureCode = 'no-legal-route') {
    super(message);
    this.name = 'ConnectorRouteFailure';
    this.code = code;
  }
}

const CARD_OFFSET_Y = 40;
const BADGE_SIZE = 28;
const CARD_GAP = 16;
const BADGE_GAP = 4;
const VALIDATION_LAYOUT_TOLERANCE = 1;
const CONNECTOR_ROUTE_PADDING = 24;
const CONNECTOR_ENDPOINT_GAP = 32;
const ROUTE_EPSILON = 0.001;

export function buildCreateAnnotationPlan(input: BuildCreateAnnotationPlanInput): CreateAnnotationPlan {
  const body = input.body.trim();
  if (body.length === 0) {
    throw new Error('Annotation Body is required.');
  }
  if (input.subjects.length === 0) {
    throw new Error('Select one or more non-generated Subject Nodes.');
  }

  const record = createAnnotationRecord({
    annotationId: input.annotationId,
    annotationNumber: input.annotationNumber,
    body,
    contextFrameId: input.contextFrameId,
    now: input.now,
    subjectNodeIds: input.subjects.map((subject) => subject.id),
  });
  const contextRecord = createContextRecord(input.contextFrameId, input.annotationNumber + 1);
  const cardRef = 'annotation-card';
  const annotationBounds = unionRects(input.subjects.map((subject) => subject.bounds));
  const operations: DocumentChangeOperation[] = [
    {
      type: 'ensure-container',
      ref: 'annotations',
      name: ANNOTATIONS_CONTAINER_NAME,
    },
    {
      type: 'set-shared-plugin-data',
      target: { kind: 'container', ref: 'annotations' },
      key: SHARED_PLUGIN_DATA.keys.kind,
      value: VISUAL_NODE_KINDS.container,
    },
    {
      type: 'set-shared-plugin-data',
      target: { kind: 'existing-node', nodeId: input.contextFrameId },
      key: SHARED_PLUGIN_DATA.keys.context,
      value: contextRecord,
    },
    {
      type: 'create-annotation-card',
      ref: cardRef,
      containerRef: 'annotations',
      name: formatAnnotationCardName(input.annotationNumber),
      annotationNumber: input.annotationNumber,
      body,
      subjectSummary: summarizeSubjectNames(input.subjects.map((subject) => subject.name)),
      basePosition: {
        x: annotationBounds.x,
        y: annotationBounds.y + annotationBounds.height + CARD_OFFSET_Y,
      },
    },
    {
      type: 'set-shared-plugin-data',
      target: { kind: 'created-node', ref: cardRef },
      key: SHARED_PLUGIN_DATA.keys.kind,
      value: VISUAL_NODE_KINDS.annotationCard,
    },
    {
      type: 'set-shared-plugin-data',
      target: { kind: 'created-node', ref: cardRef },
      key: SHARED_PLUGIN_DATA.keys.annotation,
      value: record,
    },
  ];

  input.subjects.forEach((subject, index) => {
    const badgeRef = createBadgeRefRecord({
      annotationId: input.annotationId,
      annotationNumber: input.annotationNumber,
      contextFrameId: input.contextFrameId,
      subjectNodeId: subject.id,
    });
    const nodeRef = `annotation-badge-${index + 1}`;
    operations.push(
      {
        type: 'create-annotation-badge',
        ref: nodeRef,
        containerRef: 'annotations',
        name: formatAnnotationBadgeName(input.annotationNumber),
        annotationNumber: input.annotationNumber,
        subjectNodeId: subject.id,
        position: {
          x: subject.bounds.x + subject.bounds.width - BADGE_SIZE / 2 + subject.existingAnnotationRefCount * (BADGE_SIZE + 4),
          y: subject.bounds.y - BADGE_SIZE / 2,
        },
      },
      {
        type: 'set-shared-plugin-data',
        target: { kind: 'created-node', ref: nodeRef },
        key: SHARED_PLUGIN_DATA.keys.kind,
        value: VISUAL_NODE_KINDS.annotationBadge,
      },
      {
        type: 'set-shared-plugin-data',
        target: { kind: 'created-node', ref: nodeRef },
        key: SHARED_PLUGIN_DATA.keys.badgeRef,
        value: badgeRef,
      },
      {
        type: 'append-shared-reference',
        targetNodeId: subject.id,
        key: SHARED_PLUGIN_DATA.keys.annotationRefs,
        listKey: 'annotationIds',
        id: input.annotationId,
      },
    );
  });

  return {
    schemaVersion: 1,
    kind: 'create-annotation',
    annotationId: input.annotationId,
    annotationNumber: input.annotationNumber,
    badgeCount: input.subjects.length,
    createdNodeRefs: [cardRef, ...input.subjects.map((_subject, index) => `annotation-badge-${index + 1}`)],
    operations,
    record,
  };
}

export function buildCreateFlowConnectorPlan(input: BuildCreateFlowConnectorPlanInput): CreateFlowConnectorPlan {
  if (input.start.id === input.end.id) {
    throw new Error('Create Flow Connector requires two different Flow Endpoints.');
  }

  const flowAction = input.flowAction.trim();
  const normalizedFlowAction = flowAction.length > 0 ? flowAction : null;
  const connectorId = input.existingConnector?.record.id ?? input.connectorId;
  const record = createFlowConnectorRecord({
    connectorId,
    createdAt: input.existingConnector?.record.createdAt,
    end: {
      contextFrameId: input.end.contextFrameId,
      nodeId: input.end.id,
    },
    flowAction: normalizedFlowAction,
    now: input.now,
    ownerContextFrameId: input.ownerContextFrameId,
    routePoints: input.routePoints,
    start: {
      contextFrameId: input.start.contextFrameId,
      nodeId: input.start.id,
    },
  });
  const connectorRef = 'flow-connector';
  const existingConnector = input.existingConnector;

  if (existingConnector !== undefined) {
    if (!flowConnectorMatchesDirectedPair(existingConnector.record, input.start.id, input.end.id)) {
      throw new Error('Existing Flow Connector does not match the directed endpoint pair.');
    }

    if (
      existingConnector.record.flowAction === normalizedFlowAction &&
      routePointsEqual(existingConnector.record.routeCache?.points, input.routePoints)
    ) {
      return {
        schemaVersion: 1,
        kind: 'create-flow-connector',
        connectorId: existingConnector.record.id,
        mode: 'idempotent',
        createdNodeRefs: [],
        existingNodeRefs: [existingConnector.nodeId],
        operations: [],
        record: existingConnector.record,
      };
    }

    const operations: DocumentChangeOperation[] = [
      {
        type: 'update-flow-connector',
        targetNodeId: existingConnector.nodeId,
        name: formatFlowConnectorName(input.start.name, input.end.name),
        routePoints: input.routePoints,
        flowAction: record.flowAction,
      },
      {
        type: 'set-shared-plugin-data',
        target: { kind: 'existing-node', nodeId: existingConnector.nodeId },
        key: SHARED_PLUGIN_DATA.keys.connector,
        value: record,
      },
    ];

    return {
      schemaVersion: 1,
      kind: 'create-flow-connector',
      connectorId: existingConnector.record.id,
      mode: 'update',
      createdNodeRefs: [],
      existingNodeRefs: [existingConnector.nodeId],
      operations,
      record,
    };
  }

  const operations: DocumentChangeOperation[] = [
    {
      type: 'ensure-container',
      ref: 'connectors',
      name: CONNECTORS_CONTAINER_NAME,
    },
    {
      type: 'set-shared-plugin-data',
      target: { kind: 'container', ref: 'connectors' },
      key: SHARED_PLUGIN_DATA.keys.kind,
      value: VISUAL_NODE_KINDS.container,
    },
    {
      type: 'create-flow-connector',
      ref: connectorRef,
      containerRef: 'connectors',
      name: formatFlowConnectorName(input.start.name, input.end.name),
      routePoints: input.routePoints,
      flowAction: record.flowAction,
    },
    {
      type: 'set-shared-plugin-data',
      target: { kind: 'created-node', ref: connectorRef },
      key: SHARED_PLUGIN_DATA.keys.kind,
      value: VISUAL_NODE_KINDS.flowConnector,
    },
    {
      type: 'set-shared-plugin-data',
      target: { kind: 'created-node', ref: connectorRef },
      key: SHARED_PLUGIN_DATA.keys.connector,
      value: record,
    },
    {
      type: 'append-shared-reference',
      targetNodeId: input.start.id,
      key: SHARED_PLUGIN_DATA.keys.connectorRefs,
      listKey: 'connectorIds',
      id: input.connectorId,
    },
    {
      type: 'append-shared-reference',
      targetNodeId: input.end.id,
      key: SHARED_PLUGIN_DATA.keys.connectorRefs,
      listKey: 'connectorIds',
      id: input.connectorId,
    },
  ];

  return {
    schemaVersion: 1,
    kind: 'create-flow-connector',
    connectorId,
    mode: 'create',
    createdNodeRefs: [connectorRef],
    existingNodeRefs: [],
    operations,
    record,
  };
}

export function buildRefreshFlowConnectorPlan(input: BuildRefreshFlowConnectorPlanInput): RefreshFlowConnectorPlan {
  const record: FlowConnectorRecord = {
    ...input.record,
    routeCache: {
      schemaVersion: 1,
      points: input.routePoints,
    },
    updatedAt: routePointsEqual(input.record.routeCache?.points, input.routePoints)
      ? input.record.updatedAt
      : input.now,
  };

  if (routePointsEqual(input.record.routeCache?.points, input.routePoints)) {
    return {
      schemaVersion: 1,
      kind: 'refresh-flow-connector',
      connectorId: input.record.id,
      mode: 'idempotent',
      existingNodeRefs: [input.connectorNodeId],
      operations: [],
      record: input.record,
    };
  }

  return {
    schemaVersion: 1,
    kind: 'refresh-flow-connector',
    connectorId: input.record.id,
    mode: 'update',
    existingNodeRefs: [input.connectorNodeId],
    operations: [
      {
        type: 'update-flow-connector',
        targetNodeId: input.connectorNodeId,
        name: formatFlowConnectorName(input.startName, input.endName),
        routePoints: input.routePoints,
        flowAction: input.record.flowAction,
      },
      {
        type: 'set-shared-plugin-data',
        target: { kind: 'existing-node', nodeId: input.connectorNodeId },
        key: SHARED_PLUGIN_DATA.keys.connector,
        value: record,
      },
    ],
    record,
  };
}

export function buildAddAnnotationSubjectsPlan(
  input: BuildAddAnnotationSubjectsPlanInput,
): AddAnnotationSubjectsPlan {
  if (input.annotation.body.trim().length === 0) {
    throw new Error('Annotation Body is required.');
  }
  if (input.subjects.length === 0) {
    throw new Error('Select one or more Subject Nodes to add.');
  }

  const existingSubjectIds = new Set(input.annotation.subjectNodeIds);
  const addedSubjects = input.subjects.filter((subject) => !existingSubjectIds.has(subject.id));
  const addedSubjectIds = addedSubjects.map((subject) => subject.id);
  const updatedSubjectNodeIds = [...input.annotation.subjectNodeIds, ...addedSubjectIds];
  const record: AnnotationRecord = {
    ...input.annotation,
    subjectNodeIds: updatedSubjectNodeIds,
    updatedAt: addedSubjectIds.length > 0 ? input.now : input.annotation.updatedAt,
  };
  const existingBadgeSubjectIds = new Set(input.existingBadgeSubjectNodeIds);
  const subjectsNeedingBadges = addedSubjects.filter((subject) => !existingBadgeSubjectIds.has(subject.id));
  const operations: DocumentChangeOperation[] = [];

  if (subjectsNeedingBadges.length > 0) {
    operations.push(
      {
        type: 'ensure-container',
        ref: 'annotations',
        name: ANNOTATIONS_CONTAINER_NAME,
      },
      {
        type: 'set-shared-plugin-data',
        target: { kind: 'container', ref: 'annotations' },
        key: SHARED_PLUGIN_DATA.keys.kind,
        value: VISUAL_NODE_KINDS.container,
      },
    );
  }

  if (addedSubjectIds.length > 0) {
    operations.push({
      type: 'set-shared-plugin-data',
      target: { kind: 'existing-node', nodeId: input.annotationCardNodeId },
      key: SHARED_PLUGIN_DATA.keys.annotation,
      value: record,
    });
  }

  subjectsNeedingBadges.forEach((subject, index) => {
    const badgeRef = createBadgeRefRecord({
      annotationId: input.annotation.id,
      annotationNumber: input.annotation.annotationNumber,
      contextFrameId: input.annotation.contextFrameId,
      subjectNodeId: subject.id,
    });
    const nodeRef = `annotation-badge-added-${index + 1}`;
    operations.push(
      {
        type: 'create-annotation-badge',
        ref: nodeRef,
        containerRef: 'annotations',
        name: formatAnnotationBadgeName(input.annotation.annotationNumber),
        annotationNumber: input.annotation.annotationNumber,
        subjectNodeId: subject.id,
        position: {
          x: subject.bounds.x + subject.bounds.width - BADGE_SIZE / 2 + subject.existingAnnotationRefCount * (BADGE_SIZE + 4),
          y: subject.bounds.y - BADGE_SIZE / 2,
        },
      },
      {
        type: 'set-shared-plugin-data',
        target: { kind: 'created-node', ref: nodeRef },
        key: SHARED_PLUGIN_DATA.keys.kind,
        value: VISUAL_NODE_KINDS.annotationBadge,
      },
      {
        type: 'set-shared-plugin-data',
        target: { kind: 'created-node', ref: nodeRef },
        key: SHARED_PLUGIN_DATA.keys.badgeRef,
        value: badgeRef,
      },
    );
  });

  addedSubjects.forEach((subject) => {
    operations.push({
      type: 'append-shared-reference',
      targetNodeId: subject.id,
      key: SHARED_PLUGIN_DATA.keys.annotationRefs,
      listKey: 'annotationIds',
      id: input.annotation.id,
    });
  });

  return {
    schemaVersion: 1,
    kind: 'add-annotation-subjects',
    annotationId: input.annotation.id,
    annotationNumber: input.annotation.annotationNumber,
    addedSubjectNodeIds: addedSubjectIds,
    badgeCount: subjectsNeedingBadges.length,
    createdNodeRefs: subjectsNeedingBadges.map((_subject, index) => `annotation-badge-added-${index + 1}`),
    operations,
    record,
  };
}

export function buildArrangeAnnotationBadgesPlan(
  input: BuildArrangeAnnotationBadgesPlanInput,
): ArrangeAnnotationBadgesPlan {
  if (input.subjects.length === 0) {
    throw new Error('Select one or more Subject Nodes with Annotation Badges.');
  }

  const operations: MoveNodeOperation[] = [];
  input.subjects.forEach((subject) => {
    const sortedBadges = [...subject.badges].sort(compareAnnotationNumbersThenIds);
    sortedBadges.forEach((badge, index) => {
      operations.push({
        type: 'move-node',
        targetNodeId: badge.nodeId,
        position: {
          x: subject.bounds.x + subject.bounds.width - BADGE_SIZE / 2 + index * (BADGE_SIZE + 4),
          y: subject.bounds.y - BADGE_SIZE / 2,
        },
      });
    });
  });

  return {
    schemaVersion: 1,
    kind: 'arrange-annotation-badges',
    movedBadgeNodeIds: operations.map((operation) => operation.targetNodeId),
    operations,
  };
}

export function buildArrangeAnnotationCardsPlan(
  input: BuildArrangeAnnotationCardsPlanInput,
): ArrangeAnnotationCardsPlan {
  if (input.cards.length === 0) {
    throw new Error('No Annotation Cards found to arrange.');
  }

  let nextY = input.basePosition.y;
  const operations = [...input.cards].sort(compareAnnotationNumbersThenIds).map((card) => {
    const operation: MoveNodeOperation = {
      type: 'move-node',
      targetNodeId: card.nodeId,
      position: {
        x: input.basePosition.x,
        y: nextY,
      },
    };
    nextY += card.rect.height + CARD_GAP;
    return operation;
  });

  return {
    schemaVersion: 1,
    kind: 'arrange-annotation-cards',
    movedCardNodeIds: operations.map((operation) => operation.targetNodeId),
    operations,
  };
}

export function createAnnotationRecord(input: {
  annotationId: string;
  annotationNumber: number;
  body: string;
  contextFrameId: string;
  now: string;
  subjectNodeIds: string[];
  title?: string;
  kind?: string;
}): AnnotationRecord {
  return {
    schemaVersion: 1,
    id: input.annotationId,
    annotationNumber: input.annotationNumber,
    ...(input.title === undefined ? {} : { title: input.title }),
    body: input.body,
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    contextFrameId: input.contextFrameId,
    subjectNodeIds: input.subjectNodeIds,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function createBadgeRefRecord(input: {
  annotationId: string;
  annotationNumber: number;
  subjectNodeId: string;
  contextFrameId: string;
}): BadgeRefRecord {
  return {
    schemaVersion: 1,
    annotationId: input.annotationId,
    annotationNumber: input.annotationNumber,
    subjectNodeId: input.subjectNodeId,
    contextFrameId: input.contextFrameId,
  };
}

export function createContextRecord(contextFrameId: string, nextAnnotationNumber: number): ContextRecord {
  return {
    schemaVersion: 1,
    contextFrameId,
    nextAnnotationNumber,
  };
}

export function createFlowConnectorRecord(input: {
  connectorId: string;
  start: FlowEndpointRecord;
  end: FlowEndpointRecord;
  ownerContextFrameId: string;
  flowAction: string | null;
  routePoints?: Point[];
  now: string;
  createdAt?: string;
}): FlowConnectorRecord {
  return {
    schemaVersion: 1,
    id: input.connectorId,
    start: input.start,
    end: input.end,
    ownerContextFrameId: input.ownerContextFrameId,
    flowAction: input.flowAction,
    ...(input.routePoints === undefined
      ? {}
      : {
          routeCache: {
            schemaVersion: 1,
            points: input.routePoints,
          },
        }),
    createdAt: input.createdAt ?? input.now,
    updatedAt: input.now,
  };
}

export function flowConnectorMatchesDirectedPair(
  record: FlowConnectorRecord,
  startNodeId: string,
  endNodeId: string,
): boolean {
  return record.start.nodeId === startNodeId && record.end.nodeId === endNodeId;
}

export function isFlowEndpointEligibleVisualKind(kind: string): boolean {
  return kind === '';
}

export function validateAnnotationBindings(input: ValidateAnnotationBindingsInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  const cardsByAnnotationId = new Map(input.cards.map((card) => [card.record.id, card]));
  const subjectsById = new Map(input.subjects.map((subject) => [subject.nodeId, subject]));
  const contextsById = new Map(input.contexts.map((context) => [context.nodeId, context]));

  const missingBadgeTargets: string[] = [];
  const missingBadgeSubjectIds: string[] = [];
  input.cards.forEach((card) => {
    card.record.subjectNodeIds.forEach((subjectNodeId) => {
      if (!subjectsById.has(subjectNodeId)) {
        return;
      }
      const hasBadge = input.badges.some(
        (badge) =>
          badge.record.annotationId === card.record.id &&
          badge.record.subjectNodeId === subjectNodeId,
      );
      if (!hasBadge) {
        missingBadgeTargets.push(card.nodeId, subjectNodeId);
        missingBadgeSubjectIds.push(subjectNodeId);
      }
    });
  });
  addIssue(issues, {
    code: 'annotation-missing-badge',
    severity: 'warning',
    title: 'Missing Annotation Badge',
    affectedObjectCount: countUnique(missingBadgeSubjectIds),
    description: 'Some bound Subject Nodes do not have a matching Annotation Badge.',
    locationNodeIds: missingBadgeTargets,
  });

  const duplicateBadgeTargets: string[] = [];
  groupBy(input.badges, (badge) => `${badge.record.annotationId}\u0000${badge.record.subjectNodeId}`).forEach((badges) => {
    if (badges.length <= 1) {
      return;
    }
    duplicateBadgeTargets.push(...badges.map((badge) => badge.nodeId), badges[0].record.subjectNodeId);
  });
  addIssue(issues, {
    code: 'annotation-duplicate-badge',
    severity: 'warning',
    title: 'Duplicate Annotation Badge',
    affectedObjectCount: duplicateBadgeTargets.length,
    description: 'A Subject Node has more than one Annotation Badge for the same Annotation.',
    locationNodeIds: duplicateBadgeTargets,
  });

  const orphanTargets: string[] = [];
  input.cards.forEach((card) => {
    const contextExists = contextsById.has(card.record.contextFrameId);
    const liveSubjectCount = card.record.subjectNodeIds.filter((subjectNodeId) => subjectsById.has(subjectNodeId)).length;
    if (!contextExists || card.record.subjectNodeIds.length === 0 || liveSubjectCount === 0) {
      orphanTargets.push(card.nodeId, ...card.record.subjectNodeIds.filter((subjectNodeId) => subjectsById.has(subjectNodeId)));
    }
  });
  input.subjects.forEach((subject) => {
    subject.annotationIds.forEach((annotationId) => {
      if (!cardsByAnnotationId.has(annotationId)) {
        orphanTargets.push(subject.nodeId);
      }
    });
  });
  addIssue(issues, {
    code: 'annotation-orphaned',
    severity: 'error',
    title: 'Orphaned Annotation',
    affectedObjectCount: countUnique(orphanTargets),
    description: 'An Annotation is missing its required card, context, or all live Subject Nodes.',
    locationNodeIds: orphanTargets,
  });

  const missingBodyTargets = input.cards
    .filter((card) => card.record.body.trim().length === 0)
    .map((card) => card.nodeId);
  addIssue(issues, {
    code: 'annotation-missing-body',
    severity: 'error',
    title: 'Missing Required Annotation Body',
    affectedObjectCount: missingBodyTargets.length,
    description: 'An Annotation Card has an empty required Annotation Body.',
    locationNodeIds: missingBodyTargets,
  });

  const outsideTargets = input.cards.filter((card) => {
    const context = contextsById.get(card.record.contextFrameId);
    if (context?.rect === undefined) {
      return false;
    }
    const minY = context.rect.y + context.rect.height + CARD_OFFSET_Y;
    return (
      card.rect.y < minY - VALIDATION_LAYOUT_TOLERANCE ||
      card.rect.x < context.rect.x - VALIDATION_LAYOUT_TOLERANCE ||
      card.rect.x > context.rect.x + context.rect.width + VALIDATION_LAYOUT_TOLERANCE
    );
  }).map((card) => card.nodeId);
  addIssue(issues, {
    code: 'annotation-card-outside-design-notes-area',
    severity: 'warning',
    title: 'Annotation Card Outside Design Notes Area',
    affectedObjectCount: outsideTargets.length,
    description: 'An Annotation Card is not placed below its Context Frame in the Design Notes Area.',
    locationNodeIds: outsideTargets,
  });

  const unsortedCardTargets: string[] = [];
  groupBy(input.cards, (card) => card.record.contextFrameId).forEach((cards) => {
    const visualOrder = [...cards].sort(compareRectsThenIds).map((card) => card.nodeId);
    const numberOrder = [...cards].sort((first, second) =>
      compareAnnotationNumbersThenIds(
        { annotationNumber: first.record.annotationNumber, nodeId: first.nodeId },
        { annotationNumber: second.record.annotationNumber, nodeId: second.nodeId },
      ),
    ).map((card) => card.nodeId);
    if (!arraysEqual(visualOrder, numberOrder)) {
      unsortedCardTargets.push(...cards.map((card) => card.nodeId));
    }
  });
  addIssue(issues, {
    code: 'annotation-cards-unsorted',
    severity: 'info',
    title: 'Unsorted Annotation Cards',
    affectedObjectCount: countUnique(unsortedCardTargets),
    description: 'Annotation Cards are not visually sorted by Annotation Number.',
    locationNodeIds: unsortedCardTargets,
  });

  const unarrangedBadgeTargets: string[] = [];
  groupBy(input.badges, (badge) => badge.record.subjectNodeId).forEach((badges, subjectNodeId) => {
    const subject = subjectsById.get(subjectNodeId);
    const subjectRect = subject?.rect;
    if (subjectRect === undefined || badges.length <= 1) {
      return;
    }
    const arrangedOrder = [...badges].sort((first, second) =>
      compareAnnotationNumbersThenIds(
        { annotationNumber: first.record.annotationNumber, nodeId: first.nodeId },
        { annotationNumber: second.record.annotationNumber, nodeId: second.nodeId },
      ),
    );
    arrangedOrder.forEach((badge, index) => {
      const expectedX = subjectRect.x + subjectRect.width - BADGE_SIZE / 2 + index * (BADGE_SIZE + BADGE_GAP);
      const expectedY = subjectRect.y - BADGE_SIZE / 2;
      if (
        Math.abs(badge.rect.x - expectedX) > VALIDATION_LAYOUT_TOLERANCE ||
        Math.abs(badge.rect.y - expectedY) > VALIDATION_LAYOUT_TOLERANCE
      ) {
        unarrangedBadgeTargets.push(badge.nodeId, subjectNodeId);
      }
    });
  });
  addIssue(issues, {
    code: 'annotation-badges-unarranged',
    severity: 'info',
    title: 'Unarranged Annotation Badges',
    affectedObjectCount: countUnique(unarrangedBadgeTargets),
    description: 'Annotation Badges beside a Subject Node are not arranged by Annotation Number.',
    locationNodeIds: unarrangedBadgeTargets,
  });

  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}

export function validateFlowConnectorReferences(input: ValidateFlowConnectorReferencesInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  const endpointsById = new Map(input.endpoints.map((endpoint) => [endpoint.nodeId, endpoint]));
  const liveConnectorIds = new Set(input.connectors.map((connector) => connector.record.id));

  const orphanTargets: string[] = [];
  const orphanConnectorNodeIds: string[] = [];
  input.connectors.forEach((connector) => {
    const endpointIds = [connector.record.start.nodeId, connector.record.end.nodeId];
    if (endpointIds.every((endpointId) => endpointsById.has(endpointId))) {
      return;
    }

    orphanConnectorNodeIds.push(connector.nodeId);
    orphanTargets.push(
      connector.nodeId,
      ...endpointIds.filter((endpointId) => endpointsById.has(endpointId)),
    );
  });
  addIssue(issues, {
    code: 'flow-connector-orphaned',
    severity: 'error',
    title: 'Orphaned Flow Connector',
    affectedObjectCount: countUnique(orphanConnectorNodeIds),
    description: 'A Flow Connector is missing its start or end Flow Endpoint.',
    locationNodeIds: orphanTargets,
  });

  const invalidEndpointTargets: string[] = [];
  const invalidConnectorNodeIds: string[] = [];
  input.connectors.forEach((connector) => {
    const invalidEndpointIds = [connector.record.start.nodeId, connector.record.end.nodeId]
      .filter((endpointId) => endpointsById.get(endpointId)?.isEligibleFlowEndpoint === false);
    if (invalidEndpointIds.length === 0) {
      return;
    }

    invalidConnectorNodeIds.push(connector.nodeId);
    invalidEndpointTargets.push(connector.nodeId, ...invalidEndpointIds);
  });
  addIssue(issues, {
    code: 'flow-endpoint-invalid',
    severity: 'error',
    title: 'Invalid Flow Endpoint',
    affectedObjectCount: countUnique(invalidConnectorNodeIds),
    description: 'A Flow Connector points to a node that is not a valid Flow Endpoint.',
    locationNodeIds: invalidEndpointTargets,
  });

  const duplicateTargets: string[] = [];
  const duplicateConnectorNodeIds: string[] = [];
  groupBy(input.connectors, (connector) =>
    `${connector.record.start.nodeId}\u0000${connector.record.end.nodeId}`,
  ).forEach((connectors) => {
    if (connectors.length <= 1) {
      return;
    }

    duplicateConnectorNodeIds.push(...connectors.map((connector) => connector.nodeId));
    duplicateTargets.push(
      ...connectors.map((connector) => connector.nodeId),
      ...[connectors[0].record.start.nodeId, connectors[0].record.end.nodeId]
        .filter((endpointId) => endpointsById.has(endpointId)),
    );
  });
  addIssue(issues, {
    code: 'flow-connector-duplicate',
    severity: 'error',
    title: 'Duplicate Flow Connector',
    affectedObjectCount: countUnique(duplicateConnectorNodeIds),
    description: 'Multiple Flow Connectors use the same ordered start and end Flow Endpoints.',
    locationNodeIds: duplicateTargets,
  });

  const emptyActionTargets = input.connectors
    .filter((connector) => connector.record.flowAction === null || connector.record.flowAction.trim().length === 0)
    .map((connector) => connector.nodeId);
  addIssue(issues, {
    code: 'flow-action-empty',
    severity: 'warning',
    title: 'Empty Flow Action',
    affectedObjectCount: emptyActionTargets.length,
    description: 'A Flow Connector has no Flow Action label.',
    locationNodeIds: emptyActionTargets,
  });

  const staleReverseIndexTargets = input.endpoints
    .filter((endpoint) => endpoint.connectorIds.some((connectorId) => !liveConnectorIds.has(connectorId)))
    .map((endpoint) => endpoint.nodeId);
  addIssue(issues, {
    code: 'connector-reverse-index-stale',
    severity: 'warning',
    title: 'Stale Reverse Index',
    affectedObjectCount: staleReverseIndexTargets.length,
    description: 'A Flow Endpoint has connectorRefs pointing to deleted Flow Connectors.',
    locationNodeIds: staleReverseIndexTargets,
  });

  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}

export function buildCleanStaleIndexesPlan(input: BuildCleanStaleIndexesPlanInput): CleanStaleIndexesPlan {
  const liveConnectorIds = new Set(input.liveConnectorIds);
  const operations: SetSharedPluginDataOperation[] = [];
  const cleanedEndpointNodeIds: string[] = [];
  const removedConnectorIds: string[] = [];

  input.endpoints.forEach((endpoint) => {
    const staleConnectorIds = endpoint.connectorIds.filter((connectorId) => !liveConnectorIds.has(connectorId));
    if (staleConnectorIds.length === 0) {
      return;
    }

    cleanedEndpointNodeIds.push(endpoint.nodeId);
    removedConnectorIds.push(...staleConnectorIds);
    operations.push({
      type: 'set-shared-plugin-data',
      target: { kind: 'existing-node', nodeId: endpoint.nodeId },
      key: SHARED_PLUGIN_DATA.keys.connectorRefs,
      value: {
        schemaVersion: 1,
        connectorIds: endpoint.connectorIds.filter((connectorId) => liveConnectorIds.has(connectorId)),
      },
    });
  });

  return {
    schemaVersion: 1,
    kind: 'clean-stale-indexes',
    cleanedEndpointNodeIds,
    removedConnectorIds,
    operations,
  };
}

export function mergeValidationReports(reports: ValidationReport[]): ValidationReport {
  const issues = reports.flatMap((report) => report.issues);
  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}

export function mergeAnnotationReferenceIds(existingIds: string[], annotationId: string): AnnotationRefsRecord {
  return {
    schemaVersion: 1,
    annotationIds: appendUnique(existingIds, annotationId),
  };
}

export function mergeConnectorReferenceIds(existingIds: string[], connectorId: string): ConnectorRefsRecord {
  return {
    schemaVersion: 1,
    connectorIds: appendUnique(existingIds, connectorId),
  };
}

export function serializeSharedPluginDataValue(value: SharedPluginDataValue): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export function formatAnnotationCardName(annotationNumber: number): string {
  return `FFA Annotation Card #${annotationNumber}`;
}

export function formatAnnotationBadgeName(annotationNumber: number): string {
  return `FFA Annotation Badge #${annotationNumber}`;
}

export function formatFlowConnectorName(startName: string, endName: string): string {
  return `FFA Connector ${readableName(startName)} -> ${readableName(endName)}`;
}

export function readableName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 48) : 'Untitled';
}

export function summarizeSubjectNames(names: string[]): string {
  const readableNames = names.map(readableName);
  if (readableNames.length <= 3) {
    return readableNames.join(', ');
  }
  return `${readableNames.slice(0, 3).join(', ')} +${readableNames.length - 3}`;
}

export function planAnnotationCardPosition(input: {
  basePosition: Point;
  cardRect: RectLike;
  existingCardRects: RectLike[];
}): Point {
  let candidate = {
    x: input.basePosition.x,
    y: input.basePosition.y,
  };

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidateRect = {
      x: candidate.x,
      y: candidate.y,
      width: input.cardRect.width,
      height: input.cardRect.height,
    };
    const conflict = input.existingCardRects.find((existingCard) => rectsOverlap(candidateRect, existingCard));
    if (conflict === undefined) {
      return candidate;
    }
    candidate = {
      x: candidate.x,
      y: conflict.y + conflict.height + CARD_GAP,
    };
  }

  return candidate;
}

export function unionRects(rects: RectLike[]): RectLike {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function routeOrthogonalConnector(
  input: RouteOrthogonalConnectorInput,
): RouteOrthogonalConnectorResult {
  const endpointGap = input.endpointGap ?? CONNECTOR_ENDPOINT_GAP;
  const obstaclePadding = input.obstaclePadding ?? CONNECTOR_ROUTE_PADDING;
  const expandedObstacles = input.obstacles.map((obstacle) => ({
    ...obstacle,
    rect: expandRect(obstacle.rect, obstaclePadding),
  }));
  const candidates = buildRouteCandidates({
    start: input.startRect,
    end: input.endRect,
    obstacles: expandedObstacles.map((obstacle) => obstacle.rect),
    endpointGap,
    preferredStartSide: input.preferredStartSide,
    preferredEndSide: input.preferredEndSide,
  });
  const legalCandidates = candidates
    .map((candidate) => ({
      points: compactPoints(candidate.points),
      preferencePenalty: candidate.preferencePenalty,
    }))
    .filter(
      (candidate) =>
        !routeIntersectsObstacles(candidate.points, expandedObstacles.map((obstacle) => obstacle.rect)) &&
        !routeIntersectsEndpointInteriors(candidate.points, [input.startRect, input.endRect]),
    );

  if (legalCandidates.length === 0) {
    throw new ConnectorRouteFailure('No legal Orthogonal Route avoids Connector Obstacles.');
  }

  legalCandidates.sort((first, second) =>
    scoreRoute(first.points) + first.preferencePenalty -
    (scoreRoute(second.points) + second.preferencePenalty),
  );
  return { points: legalCandidates[0].points };
}

export function placeFlowActionLabel(input: PlaceFlowActionLabelInput): FlowActionLabelPlacement | null {
  if (input.flowAction.trim().length === 0) {
    return null;
  }

  const routePoints = compactPoints(input.routePoints);
  const routeCenter = getRouteCenterPoint(routePoints);
  const obstaclePadding = input.obstaclePadding ?? 0;
  const obstacles = (input.obstacles ?? []).map((obstacle) => expandRect(obstacle.rect, obstaclePadding));
  const candidates = getRouteSegments(routePoints)
    .filter((segment) => !segmentMatches(segment, input.sharedTrunkSegment))
    .filter((segment) => !obstacles.some((obstacle) => segmentIntersectsRect(segment.start, segment.end, obstacle)));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((first, second) =>
    second.length - first.length ||
    distance(segmentMidpoint(first), routeCenter) - distance(segmentMidpoint(second), routeCenter) ||
    first.index - second.index,
  );

  return {
    center: segmentMidpoint(candidates[0]),
    segmentIndex: candidates[0].index,
  };
}

export function planConnectorTrunks(input: PlanConnectorTrunksInput): ConnectorTrunkPlan {
  const connectors = input.connectors
    .flatMap((connector) => {
      const points = connector.record.routeCache?.points;
      if (points === undefined) {
        return [];
      }
      const finalSegment = getFinalRouteSegment(points);
      if (finalSegment === null) {
        return [];
      }
      const incomingSide = getIncomingSide(finalSegment);
      if (incomingSide === null) {
        return [];
      }
      return [{
        ...connector,
        finalSegment,
        incomingSide,
        key: `${connector.record.end.nodeId}:${incomingSide}`,
      }];
    })
    .sort((first, second) => first.record.id.localeCompare(second.record.id));
  const groups: ConnectorTrunkGroup[] = [];

  groupBy(connectors, (connector) => connector.key).forEach((group, key) => {
    const uniqueStartIds = new Set(group.map((connector) => connector.record.start.nodeId));
    if (group.length < 2 || uniqueStartIds.size < 2) {
      return;
    }

    const segment = group[0].finalSegment;
    if (!group.every((connector) => segmentMatches(connector.finalSegment, segment))) {
      return;
    }

    groups.push({
      connectorIds: group.map((connector) => connector.record.id).sort(),
      endNodeId: group[0].record.end.nodeId,
      groupKey: key,
      incomingSide: group[0].incomingSide,
      segment,
    });
  });

  groups.sort((first, second) => first.groupKey.localeCompare(second.groupKey));
  const assignments = groups.flatMap((group) =>
    group.connectorIds.map((connectorId) => ({
      connectorId,
      groupKey: group.groupKey,
      segment: group.segment,
    })),
  );

  return { assignments, groups };
}

function buildRouteCandidates(input: {
  start: RectLike;
  end: RectLike;
  obstacles: RectLike[];
  endpointGap: number;
  preferredStartSide?: ConnectorRouteSide;
  preferredEndSide?: ConnectorRouteSide;
}): { points: Point[]; preferencePenalty: number }[] {
  const sidePairs = getRouteSidePairs(input.start, input.end, input.preferredStartSide, input.preferredEndSide);
  const bounds = unionRects([input.start, input.end, ...input.obstacles]);
  const laneXs = getVerticalLaneValues(input.start, input.end, input.obstacles, bounds);
  const laneYs = getHorizontalLaneValues(input.start, input.end, input.obstacles, bounds);
  const seen = new Set<string>();
  const candidates: { points: Point[]; preferencePenalty: number }[] = [];

  sidePairs.forEach((pair) => {
    const startPoint = boundaryPoint(input.start, pair.startSide);
    const endPoint = boundaryPoint(input.end, pair.endSide);
    const startLead = leadPoint(startPoint, pair.startSide, input.endpointGap);
    const endLead = leadPoint(endPoint, pair.endSide, input.endpointGap);
    const preferencePenalty = getPreferencePenalty(
      pair,
      input.preferredStartSide,
      input.preferredEndSide,
    );
    const pairCandidates = [
      [startPoint, startLead, { x: endLead.x, y: startLead.y }, endLead, endPoint],
      [startPoint, startLead, { x: startLead.x, y: endLead.y }, endLead, endPoint],
      ...laneXs.map((laneX) => [
        startPoint,
        startLead,
        { x: laneX, y: startLead.y },
        { x: laneX, y: endLead.y },
        endLead,
        endPoint,
      ]),
      ...laneYs.map((laneY) => [
        startPoint,
        startLead,
        { x: startLead.x, y: laneY },
        { x: endLead.x, y: laneY },
        endLead,
        endPoint,
      ]),
    ];

    pairCandidates.forEach((points) => {
      const key = JSON.stringify(compactPoints(points));
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({ points, preferencePenalty });
    });
  });

  return candidates;
}

function getRouteSidePairs(
  start: RectLike,
  end: RectLike,
  preferredStartSide?: ConnectorRouteSide,
  preferredEndSide?: ConnectorRouteSide,
): { startSide: ConnectorRouteSide; endSide: ConnectorRouteSide }[] {
  const startCenter = centerOf(start);
  const endCenter = centerOf(end);
  const horizontalPair = endCenter.x >= startCenter.x
    ? { startSide: 'right' as const, endSide: 'left' as const }
    : { startSide: 'left' as const, endSide: 'right' as const };
  const verticalPair = endCenter.y >= startCenter.y
    ? { startSide: 'bottom' as const, endSide: 'top' as const }
    : { startSide: 'top' as const, endSide: 'bottom' as const };
  const preferredPair = preferredStartSide === undefined && preferredEndSide === undefined
    ? []
    : [{
        startSide: preferredStartSide ?? oppositeSide(preferredEndSide as ConnectorRouteSide),
        endSide: preferredEndSide ?? oppositeSide(preferredStartSide as ConnectorRouteSide),
      }];
  const dominantPairs = Math.abs(endCenter.x - startCenter.x) >= Math.abs(endCenter.y - startCenter.y)
    ? [horizontalPair, verticalPair]
    : [verticalPair, horizontalPair];
  const fallbackPairs: { startSide: ConnectorRouteSide; endSide: ConnectorRouteSide }[] = [
    { startSide: 'right', endSide: 'right' },
    { startSide: 'right', endSide: 'left' },
    { startSide: 'right', endSide: 'top' },
    { startSide: 'right', endSide: 'bottom' },
    { startSide: 'left', endSide: 'right' },
    { startSide: 'left', endSide: 'left' },
    { startSide: 'left', endSide: 'top' },
    { startSide: 'left', endSide: 'bottom' },
    { startSide: 'top', endSide: 'top' },
    { startSide: 'top', endSide: 'bottom' },
    { startSide: 'top', endSide: 'left' },
    { startSide: 'top', endSide: 'right' },
    { startSide: 'bottom', endSide: 'bottom' },
    { startSide: 'bottom', endSide: 'top' },
    { startSide: 'bottom', endSide: 'left' },
    { startSide: 'bottom', endSide: 'right' },
  ];
  const seen = new Set<string>();
  return [...preferredPair, ...dominantPairs, ...fallbackPairs].filter((pair) => {
    const key = `${pair.startSide}:${pair.endSide}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getPreferencePenalty(
  pair: { startSide: ConnectorRouteSide; endSide: ConnectorRouteSide },
  preferredStartSide?: ConnectorRouteSide,
  preferredEndSide?: ConnectorRouteSide,
): number {
  let penalty = 0;
  if (preferredStartSide !== undefined && pair.startSide !== preferredStartSide) {
    penalty += 10000;
  }
  if (preferredEndSide !== undefined && pair.endSide !== preferredEndSide) {
    penalty += 10000;
  }
  return penalty;
}

function boundaryPoint(rect: RectLike, side: ConnectorRouteSide): Point {
  const center = centerOf(rect);
  if (side === 'left') {
    return { x: rect.x, y: center.y };
  }
  if (side === 'right') {
    return { x: rect.x + rect.width, y: center.y };
  }
  if (side === 'top') {
    return { x: center.x, y: rect.y };
  }
  return { x: center.x, y: rect.y + rect.height };
}

function leadPoint(point: Point, side: ConnectorRouteSide, gap: number): Point {
  const vector = sideVector(side);
  return {
    x: point.x + vector.x * gap,
    y: point.y + vector.y * gap,
  };
}

function sideVector(side: ConnectorRouteSide): Point {
  if (side === 'left') {
    return { x: -1, y: 0 };
  }
  if (side === 'right') {
    return { x: 1, y: 0 };
  }
  if (side === 'top') {
    return { x: 0, y: -1 };
  }
  return { x: 0, y: 1 };
}

function oppositeSide(side: ConnectorRouteSide): ConnectorRouteSide {
  if (side === 'left') {
    return 'right';
  }
  if (side === 'right') {
    return 'left';
  }
  if (side === 'top') {
    return 'bottom';
  }
  return 'top';
}

function getHorizontalLaneValues(
  start: RectLike,
  end: RectLike,
  obstacles: RectLike[],
  relevantBounds: RectLike,
): number[] {
  return uniqueNumbers([
    centerOf(start).y,
    centerOf(end).y,
    start.y - CONNECTOR_ROUTE_PADDING,
    start.y + start.height + CONNECTOR_ROUTE_PADDING,
    end.y - CONNECTOR_ROUTE_PADDING,
    end.y + end.height + CONNECTOR_ROUTE_PADDING,
    relevantBounds.y - CONNECTOR_ROUTE_PADDING,
    relevantBounds.y + relevantBounds.height + CONNECTOR_ROUTE_PADDING,
    ...obstacles.flatMap((obstacle) => [
      obstacle.y - CONNECTOR_ROUTE_PADDING,
      obstacle.y + obstacle.height + CONNECTOR_ROUTE_PADDING,
    ]),
  ]);
}

function getVerticalLaneValues(
  start: RectLike,
  end: RectLike,
  obstacles: RectLike[],
  relevantBounds: RectLike,
): number[] {
  return uniqueNumbers([
    centerOf(start).x,
    centerOf(end).x,
    start.x - CONNECTOR_ROUTE_PADDING,
    start.x + start.width + CONNECTOR_ROUTE_PADDING,
    end.x - CONNECTOR_ROUTE_PADDING,
    end.x + end.width + CONNECTOR_ROUTE_PADDING,
    relevantBounds.x - CONNECTOR_ROUTE_PADDING,
    relevantBounds.x + relevantBounds.width + CONNECTOR_ROUTE_PADDING,
    ...obstacles.flatMap((obstacle) => [
      obstacle.x - CONNECTOR_ROUTE_PADDING,
      obstacle.x + obstacle.width + CONNECTOR_ROUTE_PADDING,
    ]),
  ]);
}

function routeIntersectsObstacles(points: Point[], obstacles: RectLike[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (obstacles.some((obstacle) => segmentIntersectsRect(points[index], points[index + 1], obstacle))) {
      return true;
    }
  }
  return false;
}

function getRouteSegments(points: Point[]): ConnectorRouteSegment[] {
  const compactedPoints = compactPoints(points);
  const segments: ConnectorRouteSegment[] = [];
  for (let index = 0; index < compactedPoints.length - 1; index += 1) {
    const start = compactedPoints[index];
    const end = compactedPoints[index + 1];
    segments.push({
      end,
      index,
      length: distance(start, end),
      start,
    });
  }
  return segments;
}

function getFinalRouteSegment(points: Point[]): ConnectorRouteSegment | null {
  const segments = getRouteSegments(points);
  return segments.length === 0 ? null : segments[segments.length - 1];
}

function getIncomingSide(segment: ConnectorRouteSegment): ConnectorRouteSide | null {
  const deltaX = segment.end.x - segment.start.x;
  const deltaY = segment.end.y - segment.start.y;
  if (Math.abs(deltaX) >= ROUTE_EPSILON && Math.abs(deltaY) >= ROUTE_EPSILON) {
    return null;
  }
  if (deltaX > ROUTE_EPSILON) {
    return 'left';
  }
  if (deltaX < -ROUTE_EPSILON) {
    return 'right';
  }
  if (deltaY > ROUTE_EPSILON) {
    return 'top';
  }
  if (deltaY < -ROUTE_EPSILON) {
    return 'bottom';
  }
  return null;
}

function getRouteCenterPoint(points: Point[]): Point {
  const segments = getRouteSegments(points);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remainingLength = totalLength / 2;

  for (const segment of segments) {
    if (remainingLength <= segment.length) {
      const ratio = segment.length < ROUTE_EPSILON ? 0 : remainingLength / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remainingLength -= segment.length;
  }

  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function segmentMidpoint(segment: ConnectorRouteSegment): Point {
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) / 2,
    y: segment.start.y + (segment.end.y - segment.start.y) / 2,
  };
}

function segmentMatches(first: ConnectorRouteSegment | undefined, second: ConnectorRouteSegment | undefined): boolean {
  if (first === undefined || second === undefined) {
    return false;
  }
  return pointsEqual(first.start, second.start) && pointsEqual(first.end, second.end);
}

function pointsEqual(first: Point, second: Point): boolean {
  return Math.abs(first.x - second.x) < ROUTE_EPSILON && Math.abs(first.y - second.y) < ROUTE_EPSILON;
}

function routeIntersectsEndpointInteriors(points: Point[], endpoints: RectLike[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (endpoints.some((endpoint) => segmentIntersectsRectInterior(points[index], points[index + 1], endpoint))) {
      return true;
    }
  }
  return false;
}

function segmentIntersectsRect(start: Point, end: Point, rect: RectLike): boolean {
  if (Math.abs(start.y - end.y) < ROUTE_EPSILON) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return start.y >= rect.y && start.y <= rect.y + rect.height && maxX >= rect.x && minX <= rect.x + rect.width;
  }

  if (Math.abs(start.x - end.x) < ROUTE_EPSILON) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return start.x >= rect.x && start.x <= rect.x + rect.width && maxY >= rect.y && minY <= rect.y + rect.height;
  }

  return true;
}

function segmentIntersectsRectInterior(start: Point, end: Point, rect: RectLike): boolean {
  if (Math.abs(start.y - end.y) < ROUTE_EPSILON) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return (
      start.y > rect.y + ROUTE_EPSILON &&
      start.y < rect.y + rect.height - ROUTE_EPSILON &&
      maxX > rect.x + ROUTE_EPSILON &&
      minX < rect.x + rect.width - ROUTE_EPSILON
    );
  }

  if (Math.abs(start.x - end.x) < ROUTE_EPSILON) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return (
      start.x > rect.x + ROUTE_EPSILON &&
      start.x < rect.x + rect.width - ROUTE_EPSILON &&
      maxY > rect.y + ROUTE_EPSILON &&
      minY < rect.y + rect.height - ROUTE_EPSILON
    );
  }

  return true;
}

function scoreRoute(points: Point[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += distance(points[index], points[index + 1]);
  }
  return length + Math.max(0, points.length - 2) * 8;
}

function expandRect(rect: RectLike, padding: number): RectLike {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function compactPoints(points: Point[]): Point[] {
  const compacted: Point[] = [];
  points.forEach((point) => {
    const previous = compacted[compacted.length - 1];
    if (previous === undefined || distance(previous, point) >= 0.001) {
      compacted.push(point);
    }
  });
  return compacted;
}

function centerOf(rect: RectLike): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function distance(start: Point, end: Point): number {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

function uniqueNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  const unique: number[] = [];
  values.forEach((value) => {
    const rounded = Number(value.toFixed(2));
    if (!seen.has(rounded)) {
      seen.add(rounded);
      unique.push(rounded);
    }
  });
  return unique;
}

function rectsOverlap(first: RectLike, second: RectLike): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function addIssue(
  issues: ValidationIssue[],
  input: Omit<ValidationIssue, 'id' | 'locationNodeIds'> & { locationNodeIds: string[] },
): void {
  const locationNodeIds = unique(input.locationNodeIds);
  if (input.affectedObjectCount === 0 || locationNodeIds.length === 0) {
    return;
  }

  issues.push({
    ...input,
    id: `${input.code}-${issues.length + 1}`,
    locationNodeIds,
  });
}

function summarizeValidationIssues(issues: ValidationIssue[]): ValidationReportSummary {
  return {
    all: issues.length,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    info: issues.filter((issue) => issue.severity === 'info').length,
  };
}

function compareRectsThenIds(
  first: { nodeId: string; rect: RectLike },
  second: { nodeId: string; rect: RectLike },
): number {
  return first.rect.y - second.rect.y || first.rect.x - second.rect.x || first.nodeId.localeCompare(second.nodeId);
}

function compareAnnotationNumbersThenIds(
  first: { annotationNumber: number; nodeId: string },
  second: { annotationNumber: number; nodeId: string },
): number {
  return first.annotationNumber - second.annotationNumber || first.nodeId.localeCompare(second.nodeId);
}

function groupBy<T>(items: T[], keyForItem: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyForItem(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });
  return groups;
}

function arraysEqual(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function countUnique(values: string[]): number {
  return unique(values).length;
}

function appendUnique(existingIds: string[], id: string): string[] {
  return existingIds.includes(id) ? existingIds : [...existingIds, id];
}

function routePointsEqual(first: Point[] | undefined, second: Point[]): boolean {
  if (first === undefined || first.length !== second.length) {
    return false;
  }

  return first.every(
    (point, index) =>
      Math.abs(point.x - second[index].x) < 0.001 &&
      Math.abs(point.y - second[index].y) < 0.001,
  );
}
