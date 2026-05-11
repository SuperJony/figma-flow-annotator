import type {
  AnnotationBadgeVisualModel,
  AnnotationCardVisualModel,
} from "../annotations/visual-model.ts";
import type { FlowConnectorVisualModel } from "../connectors/visual-model.ts";
import type { Point } from "../shared/geometry.ts";
import type {
  AnnotationRecord,
  FlowConnectorRecord,
  SharedPluginDataKey,
  SharedPluginDataValue,
} from "../shared/plugin-data.ts";
import type {
  ValidationIndexField,
  ValidationIndexUpdate,
} from "../validation/validation-index.ts";

export type FigmaFileOperationTarget =
  | { kind: "existing-node"; nodeId: string }
  | { kind: "created-node"; ref: string }
  | { kind: "container"; ref: string };

export interface EnsureContainerOperation {
  type: "ensure-container";
  ref: string;
  name: string;
}

export interface SetSharedPluginDataOperation {
  type: "set-shared-plugin-data";
  target: FigmaFileOperationTarget;
  key: SharedPluginDataKey;
  value: SharedPluginDataValue;
}

export interface AppendSharedReferenceOperation {
  type: "append-shared-reference";
  targetNodeId: string;
  key: "annotationRefs" | "connectorRefs";
  listKey: "annotationIds" | "connectorIds";
  id: string;
}

export interface ValidationIndexOperationUpsert {
  nodeIds?: ValidationIndexUpdate;
  nodeTargets?: Partial<Record<ValidationIndexField, FigmaFileOperationTarget[]>>;
}

export interface UpdateValidationIndexOperation {
  type: "update-validation-index";
  target: FigmaFileOperationTarget;
  upsert: ValidationIndexOperationUpsert;
}

export interface CreateAnnotationCardOperation {
  type: "create-annotation-card";
  ref: string;
  containerRef: string;
  name: string;
  annotationNumber: number;
  body: string;
  subjectSummary: string;
  basePosition: Point;
  visual: AnnotationCardVisualModel;
}

export interface CreateAnnotationBadgeOperation {
  type: "create-annotation-badge";
  ref: string;
  containerRef: string;
  name: string;
  annotationNumber: number;
  subjectNodeId: string;
  position: Point;
  visual: AnnotationBadgeVisualModel;
}

export interface CreateFlowConnectorOperation {
  type: "create-flow-connector";
  ref: string;
  containerRef: string;
  name: string;
  routePoints: Point[];
  flowAction: string | null;
  visual: FlowConnectorVisualModel;
}

export interface UpdateFlowConnectorOperation {
  type: "update-flow-connector";
  targetNodeId: string;
  name: string;
  routePoints: Point[];
  flowAction: string | null;
  visual: FlowConnectorVisualModel;
}

export interface MoveNodeOperation {
  type: "move-node";
  targetNodeId: string;
  position: Point;
}

export type FigmaFileOperation =
  | EnsureContainerOperation
  | SetSharedPluginDataOperation
  | AppendSharedReferenceOperation
  | UpdateValidationIndexOperation
  | CreateAnnotationCardOperation
  | CreateAnnotationBadgeOperation
  | CreateFlowConnectorOperation
  | UpdateFlowConnectorOperation
  | MoveNodeOperation;

export interface FigmaFileOperationBatch {
  schemaVersion: 1;
  kind:
    | "create-annotation"
    | "add-annotation-subjects"
    | "arrange-annotation-badges"
    | "arrange-annotation-cards"
    | "create-flow-connector"
    | "refresh-flow-connector"
    | "clean-stale-indexes";
  operations: FigmaFileOperation[];
}

export interface CreateAnnotationOperationBatch extends FigmaFileOperationBatch {
  kind: "create-annotation";
  annotationNumber: number;
  annotationId: string;
  badgeCount: number;
  createdNodeRefs: string[];
  record: AnnotationRecord;
}

export interface CreateFlowConnectorOperationBatch extends FigmaFileOperationBatch {
  kind: "create-flow-connector";
  connectorId: string;
  mode: "create" | "update" | "idempotent";
  createdNodeRefs: string[];
  existingNodeRefs: string[];
  record: FlowConnectorRecord;
}

export interface RefreshFlowConnectorOperationBatch extends FigmaFileOperationBatch {
  kind: "refresh-flow-connector";
  connectorId: string;
  mode: "update" | "idempotent";
  existingNodeRefs: string[];
  record: FlowConnectorRecord;
}

export interface CleanStaleIndexesOperationBatch extends FigmaFileOperationBatch {
  kind: "clean-stale-indexes";
  cleanedEndpointNodeIds: string[];
  removedConnectorIds: string[];
}

export interface AddAnnotationSubjectsOperationBatch extends FigmaFileOperationBatch {
  kind: "add-annotation-subjects";
  annotationId: string;
  annotationNumber: number;
  addedSubjectNodeIds: string[];
  badgeCount: number;
  createdNodeRefs: string[];
  record: AnnotationRecord;
}

export interface ArrangeAnnotationBadgesOperationBatch extends FigmaFileOperationBatch {
  kind: "arrange-annotation-badges";
  movedBadgeNodeIds: string[];
}

export interface ArrangeAnnotationCardsOperationBatch extends FigmaFileOperationBatch {
  kind: "arrange-annotation-cards";
  movedCardNodeIds: string[];
}
