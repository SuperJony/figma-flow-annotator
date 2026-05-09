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
  | 'annotation-badges-unarranged';

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
    | 'create-flow-connector';
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

const CARD_OFFSET_Y = 40;
const BADGE_SIZE = 28;
const CARD_GAP = 16;
const BADGE_GAP = 4;
const VALIDATION_LAYOUT_TOLERANCE = 1;

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
