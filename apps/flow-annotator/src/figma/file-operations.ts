import {
  type FigmaFileOperationTarget,
  type SetSharedPluginDataOperation,
  serializeSharedPluginDataValue,
} from "@figma-flow-annotator/core";

export interface OperationNodeRefs {
  containers: Map<string, FrameNode>;
  createdNodes: Map<string, SceneNode>;
  existingNodes: Map<string, BaseNode>;
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
