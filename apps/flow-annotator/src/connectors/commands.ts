import {
  type CreateFlowConnectorOperationBatch,
  type FlowConnectorRouteRenderPlan,
  PANEL_EMPTY_ROUTING_STATUS,
  type PanelConnectorSelectionState,
  planCreateFlowConnectorAuthoring,
  planFlowConnectorRouteLayoutSet,
  planFlowConnectorRouteRenderSet,
  type RefreshFlowConnectorOperationBatch,
} from "@figma-flow-annotator/core";
import { applyFigmaFileOperationBatch } from "../figma/file-operations";
import {
  collectFlowConnectorCurrentPageSnapshot,
  type FlowConnectorCurrentPageRuntime,
  findExistingDirectedConnectorInSnapshot,
  getSelectedFlowConnectorRoots,
} from "./current-page-snapshot";
import {
  createFlowConnectorVisualWriter,
  renderFlowConnectorVisuals,
  resolveFlowConnectorVisualRoot,
} from "./flow-connector-visual-writer";
import {
  collectCreateFlowConnectorRouteFacts,
  collectRefreshFlowConnectorRouteFacts,
} from "./route-facts";
import {
  getPendingConnectorEndpointNodes,
  handleSelectionChange,
  resetObservedEndpointSelection,
  swapPendingConnectorEndpoints,
} from "./selection";

export interface RefreshConnectorsResult {
  failedCount: number;
  failures: string[];
  refreshedCount: number;
  selectedOnly: boolean;
  nodes: GroupNode[];
}

export interface ConnectRuntime extends FlowConnectorCurrentPageRuntime {
  namespace: string;
  createId(prefix: "connector"): string;
  createText(
    name: string,
    characters: string,
    fontSize: number,
    fills: SolidPaint,
    width: number,
  ): TextNode;
  ensureContainer(name: string): FrameNode;
  ensureLayerOrder(): void;
  findContextFrameId(node: SceneNode): string;
  getVisibleBounds(node: SceneNode): Rect;
  hasGeneratedAncestor(node: SceneNode): boolean;
  postSelectionState(): void;
  solidPaint(r: number, g: number, b: number): SolidPaint;
}

export async function createFlowConnector(
  flowActionValue: string,
  runtime: ConnectRuntime,
): Promise<GroupNode> {
  const endpoints = getPendingConnectorEndpointNodes(runtime);
  const routeFactSnapshot = await collectCreateFlowConnectorRouteFacts(endpoints, runtime);
  const now = new Date().toISOString();
  const plan = planCreateFlowConnectorAuthoring({
    createConnectorId: () => runtime.createId("connector"),
    flowAction: flowActionValue,
    now,
    routeFacts: routeFactSnapshot.routeFacts,
  });
  const [startNode, endNode] = endpoints;
  const batch = plan.batch;
  const connectorRoot = applyCreateFlowConnectorOperationBatch(
    batch,
    runtime,
    new Map([
      [startNode.id, startNode],
      [endNode.id, endNode],
      ...routeFactSnapshot.existingConnectorNodesById,
    ]),
  );
  renderPlannedConnectorSet(runtime);
  runtime.ensureLayerOrder();
  return connectorRoot;
}

export async function refreshFlowConnectors(
  runtime: ConnectRuntime,
): Promise<RefreshConnectorsResult> {
  const refreshedNodes: GroupNode[] = [];
  const applyFailures: string[] = [];
  const selectedConnectorRoots = getSelectedFlowConnectorRoots(runtime);
  const routeFactSnapshot = await collectRefreshFlowConnectorRouteFacts(
    selectedConnectorRoots,
    runtime,
  );

  if (routeFactSnapshot.routeFacts.connectors.length === 0) {
    throw new Error("No Flow Connectors found to refresh.");
  }

  const layoutPlan = planFlowConnectorRouteLayoutSet({
    now: new Date().toISOString(),
    routeFacts: routeFactSnapshot.routeFacts,
  });
  const connectorNodesById = routeFactSnapshot.connectorNodesById;

  for (const refresh of layoutPlan.refreshes) {
    try {
      const connectorNode = connectorNodesById.get(refresh.connectorNodeId);
      if (connectorNode === undefined) {
        throw new Error(`Missing Flow Connector root ${refresh.connectorNodeId}.`);
      }
      const refreshed = applyRefreshFlowConnectorOperationBatch(
        refresh.batch,
        runtime,
        new Map([[refresh.connectorNodeId, connectorNode]]),
      );
      refreshedNodes.push(refreshed);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown connector refresh failure.";
      const connectorName =
        connectorNodesById.get(refresh.connectorNodeId)?.name ?? refresh.connectorNodeId;
      applyFailures.push(`${connectorName}: ${errorMessage}`);
    }
  }

  if (refreshedNodes.length > 0) {
    if (applyFailures.length === 0) {
      renderPlannedConnectorSet(runtime, layoutPlan.renderConnectors, connectorNodesById);
    } else {
      renderPlannedConnectorSet(runtime);
    }
    runtime.ensureLayerOrder();
  }

  const failures = [
    ...layoutPlan.failures.map((failure) => `${failure.connectorName}: ${failure.message}`),
    ...applyFailures,
  ];

  return {
    failedCount: failures.length,
    failures,
    refreshedCount: refreshedNodes.length,
    selectedOnly: routeFactSnapshot.selectedOnly,
    nodes: refreshedNodes,
  };
}

export function getConnectSelectionState(runtime: ConnectRuntime): PanelConnectorSelectionState {
  const endpoints = getPendingConnectorEndpointNodes(runtime);
  const existingConnector =
    endpoints.length === 2
      ? findExistingDirectedConnectorInSnapshot(
          collectFlowConnectorCurrentPageSnapshot(runtime),
          endpoints[0].id,
          endpoints[1].id,
        )
      : null;

  return {
    endpoints: endpoints.map((node) => ({
      id: node.id,
      name: node.name,
    })),
    existingConnector:
      existingConnector === null
        ? null
        : {
            flowAction: existingConnector.record.flowAction,
            id: existingConnector.record.id,
            nodeId: existingConnector.node.id,
          },
    routingStatus:
      endpoints.length === 2
        ? "Route preview pending router validation."
        : PANEL_EMPTY_ROUTING_STATUS,
  };
}

function applyCreateFlowConnectorOperationBatch(
  batch: CreateFlowConnectorOperationBatch,
  runtime: ConnectRuntime,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  const applied = applyFigmaFileOperationBatch({
    batch,
    existingNodes,
    namespace: runtime.namespace,
    writer: createFlowConnectorVisualWriter(runtime, existingNodes),
  });

  if (batch.mode === "create") {
    const connectorRoot = applied.createdNodes.get(batch.createdNodeRefs[0]);
    if (connectorRoot === undefined || connectorRoot.type !== "GROUP") {
      throw new Error("Flow Connector operation batch did not create a connector root.");
    }
    return connectorRoot;
  }

  return resolveFlowConnectorVisualRoot(batch.existingNodeRefs[0], existingNodes);
}

function applyRefreshFlowConnectorOperationBatch(
  batch: RefreshFlowConnectorOperationBatch,
  runtime: ConnectRuntime,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  applyFigmaFileOperationBatch({
    batch,
    existingNodes,
    namespace: runtime.namespace,
    writer: createFlowConnectorVisualWriter(runtime, existingNodes),
  });

  return resolveFlowConnectorVisualRoot(batch.existingNodeRefs[0], existingNodes);
}

function renderPlannedConnectorSet(
  runtime: ConnectRuntime,
  renderConnectors?: FlowConnectorRouteRenderPlan[],
  connectorNodesById?: Map<string, GroupNode>,
): void {
  if (renderConnectors !== undefined && connectorNodesById !== undefined) {
    renderFlowConnectorVisuals(renderConnectors, connectorNodesById, runtime);
    return;
  }

  const connectors = collectFlowConnectorCurrentPageSnapshot(runtime).connectorRecords;
  const renderSet = planFlowConnectorRouteRenderSet({
    connectors: connectors.map((connector) => ({
      nodeId: connector.node.id,
      record: connector.record,
    })),
  });
  renderFlowConnectorVisuals(
    renderSet.renderConnectors,
    new Map(connectors.map((connector) => [connector.node.id, connector.node])),
    runtime,
  );
}

export {
  getPendingConnectorEndpointNodes,
  handleSelectionChange,
  resetObservedEndpointSelection,
  swapPendingConnectorEndpoints,
};
