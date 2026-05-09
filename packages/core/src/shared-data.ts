
import type { Point } from './geometry.ts';

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

function appendUnique(existingIds: string[], id: string): string[] {
  return existingIds.includes(id) ? existingIds : [...existingIds, id];
}
