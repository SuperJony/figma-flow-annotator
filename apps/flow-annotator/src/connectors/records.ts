import {
  CONNECTORS_CONTAINER_NAME,
  decodeConnectorReferenceIds,
  decodeFlowConnectorRecord,
  type FlowConnectorRecord,
  flowConnectorMatchesDirectedPair,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import type { ConnectRuntime } from "./commands";

export function findExistingDirectedConnector(
  startNodeId: string,
  endNodeId: string,
  runtime: ConnectRuntime,
): { node: GroupNode; record: FlowConnectorRecord } | null {
  return (
    getFlowConnectorRecords(runtime).find((connector) =>
      flowConnectorMatchesDirectedPair(connector.record, startNodeId, endNodeId),
    ) ?? null
  );
}

export function getFlowConnectorRecords(
  runtime: ConnectRuntime,
): { node: GroupNode; record: FlowConnectorRecord }[] {
  const container = findConnectorsContainer(runtime);
  if (container === null) {
    return [];
  }

  return container.children.flatMap((child) => {
    if (
      child.type !== "GROUP" ||
      child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) !==
        VISUAL_NODE_KINDS.flowConnector
    ) {
      return [];
    }

    const record = readFlowConnectorRecord(child, runtime);
    return record === null ? [] : [{ node: child, record }];
  });
}

export function getSelectedFlowConnectorRoots(runtime: ConnectRuntime): GroupNode[] {
  return figma.currentPage.selection.flatMap((node) => {
    if (
      node.type !== "GROUP" ||
      node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) !==
        VISUAL_NODE_KINDS.flowConnector
    ) {
      return [];
    }

    return [node];
  });
}

export function readFlowConnectorRecord(
  node: BaseNode,
  runtime: ConnectRuntime,
): FlowConnectorRecord | null {
  return decodeFlowConnectorRecord(
    node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connector),
  );
}

export function readConnectorReferenceIds(node: BaseNode, runtime: ConnectRuntime): string[] {
  return decodeConnectorReferenceIds(
    node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connectorRefs),
  );
}

function findConnectorsContainer(runtime: ConnectRuntime): FrameNode | null {
  for (const child of figma.currentPage.children) {
    if (
      child.type === "FRAME" &&
      child.name === CONNECTORS_CONTAINER_NAME &&
      child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) ===
        VISUAL_NODE_KINDS.container
    ) {
      return child;
    }
  }
  return null;
}
