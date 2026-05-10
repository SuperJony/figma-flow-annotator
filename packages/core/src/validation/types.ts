import type { ConnectorObstacle } from "../connectors/routing.ts";
import type { RectLike } from "../shared/geometry.ts";
import type {
  AnnotationValidationRecord,
  BadgeRefRecord,
  FlowConnectorRecord,
} from "../shared/plugin-data.ts";

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssueCode =
  | "annotation-missing-badge"
  | "annotation-duplicate-badge"
  | "annotation-orphaned"
  | "annotation-missing-body"
  | "annotation-card-outside-design-notes-area"
  | "annotation-cards-unsorted"
  | "annotation-badges-unarranged"
  | "flow-connector-orphaned"
  | "flow-endpoint-invalid"
  | "flow-connector-duplicate"
  | "flow-action-empty"
  | "connector-reverse-index-stale"
  | "connector-route-crosses-obstacle"
  | "connector-routing-failure"
  | "flow-action-label-overlap"
  | "connector-route-refreshable"
  | "connector-trunk-missing"
  | "connector-trunk-unexpected";

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

export interface FlowConnectorRouteValidationConnectorInput {
  endRect?: RectLike;
  labelRect?: RectLike;
  nodeId: string;
  obstacles: ConnectorObstacle[];
  record: FlowConnectorRecord;
  startRect?: RectLike;
}

export interface ValidateFlowConnectorRouteGeometryInput {
  connectors: FlowConnectorRouteValidationConnectorInput[];
}

export interface BuildCleanStaleIndexesOperationBatchInput {
  endpoints: FlowConnectorValidationEndpointInput[];
  liveConnectorIds: string[];
}
