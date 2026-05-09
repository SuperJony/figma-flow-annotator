import {
  CONNECTORS_CONTAINER_NAME,
  type FlowConnectorRecord,
  flowConnectorMatchesDirectedPair,
  type Point,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import { isRecord, parseJson } from "../figma/runtime";
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
  const parsed = parseJson(
    node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connector),
  );
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

export function readConnectorReferenceIds(node: BaseNode, runtime: ConnectRuntime): string[] {
  const parsed = parseJson(
    node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connectorRefs),
  );
  if (!isRecord(parsed) || !Array.isArray(parsed.connectorIds)) {
    return [];
  }
  return parsed.connectorIds.filter((value): value is string => typeof value === "string");
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

function isFlowEndpointRecord(value: unknown): value is { nodeId: string; contextFrameId: string } {
  return (
    isRecord(value) && typeof value.nodeId === "string" && typeof value.contextFrameId === "string"
  );
}

function isRouteCacheRecord(value: unknown): value is { schemaVersion: 1; points: Point[] } {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value.points) &&
    value.points.every(
      (point) => isRecord(point) && typeof point.x === "number" && typeof point.y === "number",
    )
  );
}
