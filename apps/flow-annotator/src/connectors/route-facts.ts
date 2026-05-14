import type {
  CreateFlowConnectorRouteFacts,
  RefreshFlowConnectorRouteFacts,
  ValidateFlowConnectorRouteGeometryInput,
} from "@figma-flow-annotator/core";
import {
  collectFlowConnectorCurrentPageSnapshot,
  type FlowConnectorCurrentPageRuntime,
  type FlowConnectorSnapshotRecord,
  readFlowConnectorRecord,
  toFlowConnectorAuthoringEndpoint,
} from "./current-page-snapshot";
import {
  type RefreshFlowConnectorRouteDependencyAdapterConnector,
  rehydrateCreateFlowConnectorRouteFacts,
  rehydrateRefreshFlowConnectorRouteFacts,
  rehydrateValidateFlowConnectorRouteGeometry,
} from "./route-dependency-adapter";

export interface CreateFlowConnectorRuntimeRouteFacts {
  existingConnectorNodesById: Map<string, GroupNode>;
  routeFacts: CreateFlowConnectorRouteFacts;
}

export interface RefreshFlowConnectorRuntimeRouteFacts {
  connectorNodesById: Map<string, GroupNode>;
  routeFacts: RefreshFlowConnectorRouteFacts;
}

export async function collectCreateFlowConnectorRouteFacts(
  endpoints: SceneNode[],
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<CreateFlowConnectorRuntimeRouteFacts> {
  const snapshot = collectFlowConnectorCurrentPageSnapshot(runtime);
  const endpointFacts = endpoints.map((endpoint) =>
    toFlowConnectorAuthoringEndpoint(endpoint, runtime),
  );

  return {
    existingConnectorNodesById: new Map(
      snapshot.connectorRecords.map((connector) => [connector.node.id, connector.node]),
    ),
    routeFacts: await rehydrateCreateFlowConnectorRouteFacts({
      endpointFacts,
      endpoints,
      runtime,
      snapshot,
    }),
  };
}

export async function collectRefreshFlowConnectorRouteFacts(
  selectedConnectorRoots: GroupNode[],
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<RefreshFlowConnectorRuntimeRouteFacts> {
  const snapshot = collectFlowConnectorCurrentPageSnapshot(runtime);
  const selectedOnly = selectedConnectorRoots.length > 0;
  const connectorRecords = collectRefreshConnectorRecords(
    snapshot.connectorRecords,
    selectedConnectorRoots,
    runtime,
  );

  return {
    connectorNodesById: buildConnectorNodeMap(snapshot.connectorRecords, selectedConnectorRoots),
    routeFacts: await rehydrateRefreshFlowConnectorRouteFacts({
      connectors: connectorRecords,
      runtime,
      ...(selectedOnly
        ? { selectedConnectorNodeIds: selectedConnectorRoots.map((node) => node.id) }
        : {}),
    }),
  };
}

export async function collectValidationFlowConnectorRouteFacts(
  runtime: FlowConnectorCurrentPageRuntime,
  connectorRecords: Iterable<FlowConnectorSnapshotRecord>,
  explicitAnnotationCardNodeIds: Iterable<string> = [],
  preloadedNodes: Iterable<SceneNode> = [],
): Promise<ValidateFlowConnectorRouteGeometryInput> {
  return rehydrateValidateFlowConnectorRouteGeometry({
    connectorRecords: [...connectorRecords],
    explicitAnnotationCardNodeIds,
    preloadedNodes,
    runtime,
  });
}

function collectRefreshConnectorRecords(
  connectorRecords: FlowConnectorSnapshotRecord[],
  selectedConnectorRoots: GroupNode[],
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): RefreshFlowConnectorRouteDependencyAdapterConnector[] {
  if (selectedConnectorRoots.length === 0) {
    return connectorRecords;
  }

  const recordsByNodeId = new Map(
    connectorRecords.map((connector): [string, FlowConnectorSnapshotRecord] => [
      connector.node.id,
      connector,
    ]),
  );
  const selectedNodeIds = new Set(selectedConnectorRoots.map((node) => node.id));
  const selectedConnectors = selectedConnectorRoots.map((node) => ({
    node,
    record: recordsByNodeId.get(node.id)?.record ?? readFlowConnectorRecord(node, runtime),
  }));
  const remainingConnectors = connectorRecords.filter(
    (connector) => !selectedNodeIds.has(connector.node.id),
  );

  return [...selectedConnectors, ...remainingConnectors];
}

function buildConnectorNodeMap(
  connectorRecords: FlowConnectorSnapshotRecord[],
  selectedConnectorRoots: GroupNode[],
): Map<string, GroupNode> {
  return new Map(
    [...connectorRecords.map((connector) => connector.node), ...selectedConnectorRoots].map(
      (node) => [node.id, node],
    ),
  );
}
