import {
  type AppendSharedReferenceOperation,
  type CreateAnnotationBadgeOperation,
  type CreateAnnotationCardOperation,
  type CreateFlowConnectorOperation,
  decodeAnnotationReferenceIds,
  decodeConnectorReferenceIds,
  decodeOrCreateValidationIndexRecord,
  type FigmaFileOperationBatch,
  type FigmaFileOperationTarget,
  type MoveNodeOperation,
  mergeAnnotationReferenceIds,
  mergeConnectorReferenceIds,
  mergeValidationIndexRecord,
  type SetSharedPluginDataOperation,
  SHARED_PLUGIN_DATA,
  serializeSharedPluginDataValue,
  serializeValidationIndexRecord,
  type UpdateFlowConnectorOperation,
  type UpdateValidationIndexOperation,
  type ValidationIndexUpdate,
} from "@figma-flow-annotator/core";

export interface OperationNodeRefs {
  containers: Map<string, FrameNode>;
  createdNodes: Map<string, SceneNode>;
  existingNodes: Map<string, BaseNode>;
}

export interface FigmaFileOperationWriter {
  createAnnotationBadge?(
    container: FrameNode,
    operation: CreateAnnotationBadgeOperation,
  ): SceneNode;
  createAnnotationCard?(container: FrameNode, operation: CreateAnnotationCardOperation): SceneNode;
  createFlowConnector?(container: FrameNode, operation: CreateFlowConnectorOperation): SceneNode;
  ensureContainer?(name: string): FrameNode;
  updateFlowConnector?(operation: UpdateFlowConnectorOperation): void;
}

export interface ApplyFigmaFileOperationBatchInput {
  batch: FigmaFileOperationBatch;
  existingNodes: Map<string, BaseNode>;
  namespace: string;
  writer?: FigmaFileOperationWriter;
}

export interface AppliedFigmaFileOperationBatch {
  containers: Map<string, FrameNode>;
  createdNodes: Map<string, SceneNode>;
  movedNodes: SceneNode[];
}

export function applyFigmaFileOperationBatch(
  input: ApplyFigmaFileOperationBatchInput,
): AppliedFigmaFileOperationBatch {
  const containers = new Map<string, FrameNode>();
  const createdNodes = new Map<string, SceneNode>();
  const movedNodes: SceneNode[] = [];
  const writer = input.writer ?? {};

  input.batch.operations.forEach((operation) => {
    if (operation.type === "ensure-container") {
      if (writer.ensureContainer === undefined) {
        throw new Error("Figma File Operation writer cannot ensure containers.");
      }
      containers.set(operation.ref, writer.ensureContainer(operation.name));
      return;
    }

    if (operation.type === "set-shared-plugin-data") {
      const node = resolveOperationTarget(operation.target, {
        containers,
        createdNodes,
        existingNodes: input.existingNodes,
      });
      writeSharedPluginData(node, operation, input.namespace);
      return;
    }

    if (operation.type === "append-shared-reference") {
      appendSharedReference(input.existingNodes, operation, input.namespace);
      return;
    }

    if (operation.type === "update-validation-index") {
      updateValidationIndex(operation, input.namespace, {
        containers,
        createdNodes,
        existingNodes: input.existingNodes,
      });
      return;
    }

    if (operation.type === "move-node") {
      movedNodes.push(moveExistingNode(input.existingNodes, operation));
      return;
    }

    if (operation.type === "create-annotation-card") {
      if (writer.createAnnotationCard === undefined) {
        throw new Error("Figma File Operation writer cannot create Annotation Cards.");
      }
      const container = resolveContainer(operation.containerRef, containers);
      createdNodes.set(operation.ref, writer.createAnnotationCard(container, operation));
      return;
    }

    if (operation.type === "create-annotation-badge") {
      if (writer.createAnnotationBadge === undefined) {
        throw new Error("Figma File Operation writer cannot create Annotation Badges.");
      }
      const container = resolveContainer(operation.containerRef, containers);
      createdNodes.set(operation.ref, writer.createAnnotationBadge(container, operation));
      return;
    }

    if (operation.type === "create-flow-connector") {
      if (writer.createFlowConnector === undefined) {
        throw new Error("Figma File Operation writer cannot create Flow Connectors.");
      }
      const container = resolveContainer(operation.containerRef, containers);
      createdNodes.set(operation.ref, writer.createFlowConnector(container, operation));
      return;
    }

    if (operation.type === "update-flow-connector") {
      if (writer.updateFlowConnector === undefined) {
        throw new Error("Figma File Operation writer cannot update Flow Connectors.");
      }
      writer.updateFlowConnector(operation);
      return;
    }

    const unsupportedOperation = operation as { type: string };
    throw new Error(`Figma File Operation writer cannot apply ${unsupportedOperation.type}.`);
  });

  return {
    containers,
    createdNodes,
    movedNodes,
  };
}

function updateValidationIndex(
  operation: UpdateValidationIndexOperation,
  namespace: string,
  refs: OperationNodeRefs,
): void {
  const node = resolveOperationTarget(operation.target, refs);
  const existing = decodeOrCreateValidationIndexRecord(
    node.getSharedPluginData(namespace, SHARED_PLUGIN_DATA.keys.validationIndex),
  );
  const update = resolveValidationIndexUpdate(operation, refs);
  const next = mergeValidationIndexRecord(existing, update);
  node.setSharedPluginData(
    namespace,
    SHARED_PLUGIN_DATA.keys.validationIndex,
    serializeValidationIndexRecord(next),
  );
}

function resolveValidationIndexUpdate(
  operation: UpdateValidationIndexOperation,
  refs: OperationNodeRefs,
): ValidationIndexUpdate {
  const update: ValidationIndexUpdate = {};
  for (const [field, nodeIds] of Object.entries(operation.upsert.nodeIds ?? {})) {
    update[field as keyof ValidationIndexUpdate] = nodeIds;
  }
  for (const [field, targets] of Object.entries(operation.upsert.nodeTargets ?? {})) {
    update[field as keyof ValidationIndexUpdate] = targets.map(
      (target) => resolveOperationTarget(target, refs).id,
    );
  }
  return update;
}

export function resolveContainer(ref: string, containers: Map<string, FrameNode>): FrameNode {
  const container = containers.get(ref);
  if (container === undefined) {
    throw new Error(`Figma File Operation Batch referenced missing container ${ref}.`);
  }
  return container;
}

export function resolveOperationTarget(
  target: FigmaFileOperationTarget,
  refs: OperationNodeRefs,
): BaseNode {
  if (target.kind === "container") {
    const container = refs.containers.get(target.ref);
    if (container === undefined) {
      throw new Error(`Figma File Operation Batch referenced missing container ${target.ref}.`);
    }
    return container;
  }

  if (target.kind === "created-node") {
    const node = refs.createdNodes.get(target.ref);
    if (node === undefined) {
      throw new Error(`Figma File Operation Batch referenced missing created node ${target.ref}.`);
    }
    return node;
  }

  const node = refs.existingNodes.get(target.nodeId);
  if (node === undefined) {
    throw new Error(`Figma File Operation Batch referenced missing node ${target.nodeId}.`);
  }
  return node;
}

export function writeSharedPluginData(
  node: BaseNode,
  operation: SetSharedPluginDataOperation,
  namespace: string,
): void {
  node.setSharedPluginData(
    namespace,
    operation.key,
    serializeSharedPluginDataValue(operation.value),
  );
}

function appendSharedReference(
  existingNodes: Map<string, BaseNode>,
  operation: AppendSharedReferenceOperation,
  namespace: string,
): void {
  const node = existingNodes.get(operation.targetNodeId);
  if (node === undefined) {
    throw new Error(
      `Figma File Operation Batch references missing node ${operation.targetNodeId}.`,
    );
  }

  if (
    operation.key === SHARED_PLUGIN_DATA.keys.annotationRefs &&
    operation.listKey === "annotationIds"
  ) {
    node.setSharedPluginData(
      namespace,
      operation.key,
      serializeSharedPluginDataValue(
        mergeAnnotationReferenceIds(readReferenceIds(node, namespace, operation), operation.id),
      ),
    );
    return;
  }

  if (
    operation.key === SHARED_PLUGIN_DATA.keys.connectorRefs &&
    operation.listKey === "connectorIds"
  ) {
    node.setSharedPluginData(
      namespace,
      operation.key,
      serializeSharedPluginDataValue(
        mergeConnectorReferenceIds(readReferenceIds(node, namespace, operation), operation.id),
      ),
    );
    return;
  }

  throw new Error(
    `Figma File Operation Batch cannot append ${operation.key}.${operation.listKey}.`,
  );
}

function moveExistingNode(
  existingNodes: Map<string, BaseNode>,
  operation: MoveNodeOperation,
): SceneNode {
  const node = existingNodes.get(operation.targetNodeId);
  if (node === undefined || !("x" in node) || !("y" in node)) {
    throw new Error(
      `Figma File Operation Batch references missing movable node ${operation.targetNodeId}.`,
    );
  }
  node.x = operation.position.x;
  node.y = operation.position.y;
  return node as SceneNode;
}

function readReferenceIds(
  node: BaseNode,
  namespace: string,
  operation: AppendSharedReferenceOperation,
): string[] {
  if (operation.key === SHARED_PLUGIN_DATA.keys.annotationRefs) {
    return decodeAnnotationReferenceIds(node.getSharedPluginData(namespace, operation.key));
  }
  if (operation.key === SHARED_PLUGIN_DATA.keys.connectorRefs) {
    return decodeConnectorReferenceIds(node.getSharedPluginData(namespace, operation.key));
  }
  return [];
}
