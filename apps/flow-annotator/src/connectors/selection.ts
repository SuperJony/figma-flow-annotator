import { isFlowEndpointEligibleVisualKind, SHARED_PLUGIN_DATA } from "@figma-flow-annotator/core";
import type { ConnectRuntime } from "./commands";

let observedSelectedEndpointIds = new Set<string>();
let connectorEndpointWindowNodes: SceneNode[] = [];

export function handleSelectionChange(runtime: ConnectRuntime): void {
  recordRuntimeConnectorEndpointSelection(runtime);
  runtime.postSelectionState();
}

export function getPendingConnectorEndpointNodes(runtime: ConnectRuntime): SceneNode[] {
  return pruneConnectorEndpointWindow(runtime);
}

export function swapPendingConnectorEndpoints(runtime: ConnectRuntime): void {
  const endpoints = getPendingConnectorEndpointNodes(runtime);
  if (endpoints.length !== 2) {
    throw new Error("Swap requires exactly two pending Flow Endpoints.");
  }
  connectorEndpointWindowNodes = [endpoints[1], endpoints[0]];
  runtime.postSelectionState();
}

export function resetObservedEndpointSelection(runtime: ConnectRuntime): void {
  connectorEndpointWindowNodes = [];
  observedSelectedEndpointIds = new Set(getSelectedConnectorEndpointIds(runtime));
}

function recordRuntimeConnectorEndpointSelection(runtime: ConnectRuntime): void {
  const selectedEndpoints = getSelectedConnectorEndpoints(runtime);
  const selectedEndpointIds = selectedEndpoints.map((node) => node.id);
  const nextObservedSelectedEndpointIds = new Set(selectedEndpointIds);
  const newlySelectedEndpoints = selectedEndpoints.filter(
    (node) => !observedSelectedEndpointIds.has(node.id),
  );

  // Multiple additions in one event have no reliable relative order from Figma.
  if (newlySelectedEndpoints.length === 1) {
    pushConnectorEndpointNode(newlySelectedEndpoints[0]);
  } else if (
    connectorEndpointWindowNodes.length === 2 &&
    newlySelectedEndpoints.length > 1 &&
    selectedEndpoints.length === 2
  ) {
    // Figma duplicate replaces the selection with multiple new nodes in one event.
    // Keeping the old window would connect unselected endpoints.
    connectorEndpointWindowNodes = selectedEndpoints;
  }

  observedSelectedEndpointIds = nextObservedSelectedEndpointIds;
  pruneConnectorEndpointWindow(runtime);
}

function pushConnectorEndpointNode(node: SceneNode): void {
  connectorEndpointWindowNodes = [
    ...connectorEndpointWindowNodes.filter((existingNode) => existingNode.id !== node.id),
    node,
  ].slice(-2);
}

function getSelectedConnectorEndpointIds(runtime: ConnectRuntime): string[] {
  return getSelectedConnectorEndpoints(runtime).map((node) => node.id);
}

function pruneConnectorEndpointWindow(runtime: ConnectRuntime): SceneNode[] {
  connectorEndpointWindowNodes = connectorEndpointWindowNodes.filter(
    (node) => !node.removed && isConnectorEndpoint(node, runtime),
  );
  return [...connectorEndpointWindowNodes];
}

function getSelectedConnectorEndpoints(runtime: ConnectRuntime): SceneNode[] {
  return figma.currentPage.selection.filter(
    (node) => !node.removed && isConnectorEndpoint(node, runtime),
  );
}

function isConnectorEndpoint(node: SceneNode, runtime: ConnectRuntime): boolean {
  return (
    isFlowEndpointEligibleVisualKind(
      node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind),
    ) && !runtime.hasGeneratedAncestor(node)
  );
}
