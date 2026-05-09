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

export type DocumentChangeOperation =
  | EnsureContainerOperation
  | SetSharedPluginDataOperation
  | AppendSharedReferenceOperation
  | CreateAnnotationCardOperation
  | CreateAnnotationBadgeOperation
  | CreateFlowConnectorOperation;

export interface DocumentChangePlan {
  schemaVersion: 1;
  kind: 'create-annotation' | 'create-flow-connector';
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
  createdNodeRefs: string[];
  record: FlowConnectorRecord;
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

export interface FlowEndpointInput {
  id: string;
  name: string;
  contextFrameId: string;
}

export interface BuildCreateFlowConnectorPlanInput {
  connectorId: string;
  start: FlowEndpointInput;
  end: FlowEndpointInput;
  ownerContextFrameId: string;
  flowAction: string;
  routePoints: Point[];
  now: string;
}

const CARD_OFFSET_Y = 40;
const BADGE_SIZE = 28;
const CARD_GAP = 16;

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
  const flowAction = input.flowAction.trim();
  const record = createFlowConnectorRecord({
    connectorId: input.connectorId,
    end: {
      contextFrameId: input.end.contextFrameId,
      nodeId: input.end.id,
    },
    flowAction: flowAction.length > 0 ? flowAction : null,
    now: input.now,
    ownerContextFrameId: input.ownerContextFrameId,
    routePoints: input.routePoints,
    start: {
      contextFrameId: input.start.contextFrameId,
      nodeId: input.start.id,
    },
  });
  const connectorRef = 'flow-connector';
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
    connectorId: input.connectorId,
    createdNodeRefs: [connectorRef],
    operations,
    record,
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
    createdAt: input.now,
    updatedAt: input.now,
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

function rectsOverlap(first: RectLike, second: RectLike): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function appendUnique(existingIds: string[], id: string): string[] {
  return existingIds.includes(id) ? existingIds : [...existingIds, id];
}
