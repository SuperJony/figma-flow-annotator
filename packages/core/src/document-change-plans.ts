
import type { Point } from './geometry.ts';
import type {
  AnnotationRecord,
  FlowConnectorRecord,
  SharedPluginDataKey,
  SharedPluginDataValue,
} from './shared-data.ts';

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
