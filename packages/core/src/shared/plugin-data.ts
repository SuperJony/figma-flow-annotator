import type { ValidationIndexRecord } from "../validation/validation-index.ts";
import type { Point } from "./geometry.ts";

export const SHARED_PLUGIN_DATA = {
  namespace: "figma_flow_annotator",
  keys: {
    kind: "kind",
    annotation: "annotation",
    badgeRef: "badgeRef",
    connector: "connector",
    annotationRefs: "annotationRefs",
    connectorRefs: "connectorRefs",
    context: "context",
    validationIndex: "validationIndex",
  },
} as const;

export type SharedPluginDataKey =
  (typeof SHARED_PLUGIN_DATA.keys)[keyof typeof SHARED_PLUGIN_DATA.keys];

export const VISUAL_NODE_KINDS = {
  annotationCard: "annotation-card",
  annotationBadge: "annotation-badge",
  flowConnector: "flow-connector",
} as const;

export type VisualNodeKind = (typeof VISUAL_NODE_KINDS)[keyof typeof VISUAL_NODE_KINDS];

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

export interface AnnotationValidationRecord {
  id: string;
  annotationNumber: number;
  body: string;
  contextFrameId: string;
  subjectNodeIds: string[];
}

export interface AnnotationNumberSeedRecord {
  annotationNumber: number;
  contextFrameId: string;
}

export type SharedPluginDataValue =
  | string
  | AnnotationRecord
  | BadgeRefRecord
  | ContextRecord
  | AnnotationRefsRecord
  | FlowConnectorRecord
  | ConnectorRefsRecord
  | ValidationIndexRecord;

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

export function createContextRecord(
  contextFrameId: string,
  nextAnnotationNumber: number,
): ContextRecord {
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
  return kind === "";
}

export function mergeAnnotationReferenceIds(
  existingIds: string[],
  annotationId: string,
): AnnotationRefsRecord {
  return {
    schemaVersion: 1,
    annotationIds: appendUnique(existingIds, annotationId),
  };
}

export function mergeConnectorReferenceIds(
  existingIds: string[],
  connectorId: string,
): ConnectorRefsRecord {
  return {
    schemaVersion: 1,
    connectorIds: appendUnique(existingIds, connectorId),
  };
}

export function serializeSharedPluginDataValue(value: SharedPluginDataValue): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function decodeAnnotationRecord(value: string): AnnotationRecord | null {
  const parsed = parseSharedPluginDataJson(value);
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== "string" ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.body !== "string" ||
    parsed.body.trim().length === 0 ||
    typeof parsed.contextFrameId !== "string" ||
    !Array.isArray(parsed.subjectNodeIds) ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    id: parsed.id,
    annotationNumber: parsed.annotationNumber,
    ...(typeof parsed.title === "string" ? { title: parsed.title } : {}),
    body: parsed.body,
    ...(typeof parsed.kind === "string" ? { kind: parsed.kind } : {}),
    contextFrameId: parsed.contextFrameId,
    subjectNodeIds: parsed.subjectNodeIds.filter(
      (subjectNodeId): subjectNodeId is string => typeof subjectNodeId === "string",
    ),
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

export function decodeAnnotationValidationRecord(value: string): AnnotationValidationRecord | null {
  const parsed = parseSharedPluginDataJson(value);
  if (
    !isRecord(parsed) ||
    typeof parsed.id !== "string" ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.body !== "string" ||
    typeof parsed.contextFrameId !== "string" ||
    !Array.isArray(parsed.subjectNodeIds)
  ) {
    return null;
  }

  return {
    id: parsed.id,
    annotationNumber: parsed.annotationNumber,
    body: parsed.body,
    contextFrameId: parsed.contextFrameId,
    subjectNodeIds: parsed.subjectNodeIds.filter(
      (subjectNodeId): subjectNodeId is string => typeof subjectNodeId === "string",
    ),
  };
}

export function decodeAnnotationNumberSeedRecord(value: string): AnnotationNumberSeedRecord | null {
  const parsed = parseSharedPluginDataJson(value);
  if (
    !isRecord(parsed) ||
    typeof parsed.contextFrameId !== "string" ||
    !isPositiveInteger(parsed.annotationNumber)
  ) {
    return null;
  }

  return {
    annotationNumber: parsed.annotationNumber,
    contextFrameId: parsed.contextFrameId,
  };
}

export function decodeBadgeRefRecord(value: string): BadgeRefRecord | null {
  const parsed = parseSharedPluginDataJson(value);
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.annotationId !== "string" ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.subjectNodeId !== "string" ||
    typeof parsed.contextFrameId !== "string"
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    annotationId: parsed.annotationId,
    annotationNumber: parsed.annotationNumber,
    subjectNodeId: parsed.subjectNodeId,
    contextFrameId: parsed.contextFrameId,
  };
}

export function decodeContextRecord(value: string, contextFrameId: string): ContextRecord | null {
  const parsed = parseSharedPluginDataJson(value);
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    parsed.contextFrameId !== contextFrameId ||
    !isPositiveInteger(parsed.nextAnnotationNumber)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    contextFrameId,
    nextAnnotationNumber: parsed.nextAnnotationNumber,
  };
}

export function decodeFlowConnectorRecord(value: string): FlowConnectorRecord | null {
  const parsed = parseSharedPluginDataJson(value);
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== "string" ||
    !isFlowEndpointRecord(parsed.start) ||
    !isFlowEndpointRecord(parsed.end) ||
    typeof parsed.ownerContextFrameId !== "string" ||
    !(typeof parsed.flowAction === "string" || parsed.flowAction === null) ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    id: parsed.id,
    start: parsed.start,
    end: parsed.end,
    ownerContextFrameId: parsed.ownerContextFrameId,
    flowAction: parsed.flowAction,
    ...(isRouteCacheRecord(parsed.routeCache) ? { routeCache: parsed.routeCache } : {}),
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

export function decodeAnnotationRefsRecord(value: string): AnnotationRefsRecord | null {
  const parsed = parseSharedPluginDataJson(value);
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.annotationIds)) {
    return null;
  }
  return {
    schemaVersion: 1,
    annotationIds: parsed.annotationIds.filter(
      (annotationId): annotationId is string => typeof annotationId === "string",
    ),
  };
}

export function decodeAnnotationReferenceIds(value: string): string[] {
  const parsed = parseSharedPluginDataJson(value);
  if (!isRecord(parsed) || !Array.isArray(parsed.annotationIds)) {
    return [];
  }
  return parsed.annotationIds.filter(
    (annotationId): annotationId is string => typeof annotationId === "string",
  );
}

export function decodeConnectorRefsRecord(value: string): ConnectorRefsRecord | null {
  const parsed = parseSharedPluginDataJson(value);
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.connectorIds)) {
    return null;
  }
  return {
    schemaVersion: 1,
    connectorIds: parsed.connectorIds.filter(
      (connectorId): connectorId is string => typeof connectorId === "string",
    ),
  };
}

export function decodeConnectorReferenceIds(value: string): string[] {
  const parsed = parseSharedPluginDataJson(value);
  if (!isRecord(parsed) || !Array.isArray(parsed.connectorIds)) {
    return [];
  }
  return parsed.connectorIds.filter(
    (connectorId): connectorId is string => typeof connectorId === "string",
  );
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
  return trimmed.length > 0 ? trimmed.slice(0, 48) : "Untitled";
}

export function summarizeSubjectNames(names: string[]): string {
  const readableNames = names.map(readableName);
  if (readableNames.length <= 3) {
    return readableNames.join(", ");
  }
  return `${readableNames.slice(0, 3).join(", ")} +${readableNames.length - 3}`;
}

function appendUnique(existingIds: string[], id: string): string[] {
  return existingIds.includes(id) ? existingIds : [...existingIds, id];
}

function parseSharedPluginDataJson(value: string): unknown {
  if (value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (_error: unknown) {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isFlowEndpointRecord(value: unknown): value is FlowEndpointRecord {
  return (
    isRecord(value) && typeof value.nodeId === "string" && typeof value.contextFrameId === "string"
  );
}

function isRouteCacheRecord(value: unknown): value is ConnectorRouteCache {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value.points) &&
    value.points.every(
      (point) => isRecord(point) && typeof point.x === "number" && typeof point.y === "number",
    )
  );
}
