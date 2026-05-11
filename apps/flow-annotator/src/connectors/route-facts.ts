import {
  type CreateFlowConnectorRouteFacts,
  type FlowConnectorRecord,
  type FlowConnectorRouteGeometryEndpointFact,
  getFlowConnectorValidationIndexNodeIds,
  type RefreshFlowConnectorRouteConnectorFact,
  type RefreshFlowConnectorRouteFacts,
  type ValidateFlowConnectorRouteConnectorFact,
  type ValidateFlowConnectorRouteGeometryInput,
} from "@figma-flow-annotator/core";
import { getExistingSceneNodesById } from "../figma/runtime";
import { readBestEffortMergedValidationIndex } from "../figma/validation-index";
import {
  collectFlowConnectorCurrentPageSnapshot,
  type FlowConnectorCurrentPageRuntime,
  type FlowConnectorSnapshotRecord,
  readFlowConnectorRecord,
  toFlowConnectorAuthoringEndpoint,
} from "./current-page-snapshot";
import { collectConnectorObstacles } from "./obstacles";
import { FLOW_ACTION_LABEL_NODE_NAME } from "./visual-node-names";

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
    routeFacts: {
      endpoints: endpointFacts,
      existingConnectors: snapshot.connectorRecords.map((connector) => ({
        nodeId: connector.node.id,
        record: connector.record,
      })),
      obstacles:
        endpoints.length === 2
          ? collectConnectorObstacles(
              endpoints[0],
              endpoints[1],
              runtime,
              await collectBoundedConnectorObstacleCandidates(
                runtime,
                endpointFacts.map((endpoint) => endpoint.contextFrameId),
                snapshot.connectorRecords,
              ),
            )
          : [],
    },
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
  const targetConnectorNodeIds = selectedOnly
    ? new Set(selectedConnectorRoots.map((node) => node.id))
    : new Set(connectorRecords.map((connector) => connector.node.id));
  const targetConnectors = connectorRecords.filter((connector) =>
    targetConnectorNodeIds.has(connector.node.id),
  );
  const obstacleCandidates = await collectBoundedConnectorObstacleCandidates(
    runtime,
    collectEndpointContextFrameIds(targetConnectors),
    connectorRecords.filter(hasFlowConnectorRecord),
  );
  const routeNodesById = new Map(
    obstacleCandidates.map((node): [string, SceneNode] => [node.id, node]),
  );
  const connectors = connectorRecords.map((connector) =>
    toRefreshFlowConnectorRouteFact(
      connector,
      targetConnectorNodeIds.has(connector.node.id),
      runtime,
      routeNodesById,
      obstacleCandidates,
    ),
  );

  return {
    connectorNodesById: buildConnectorNodeMap(snapshot.connectorRecords, selectedConnectorRoots),
    routeFacts: {
      connectors,
      ...(selectedOnly
        ? { selectedConnectorNodeIds: selectedConnectorRoots.map((node) => node.id) }
        : {}),
    },
  };
}

export async function collectValidationFlowConnectorRouteFacts(
  runtime: FlowConnectorCurrentPageRuntime,
  connectorRecords: Iterable<FlowConnectorSnapshotRecord>,
  explicitObstacleCandidateNodeIds: Iterable<string> = [],
  preloadedNodes: Iterable<SceneNode> = [],
): Promise<ValidateFlowConnectorRouteGeometryInput> {
  const connectors = [...connectorRecords];
  const preloadedNodesById = new Map(
    [...preloadedNodes].map((node): [string, SceneNode] => [node.id, node]),
  );
  const obstacleCandidates = await collectBoundedConnectorObstacleCandidates(
    runtime,
    collectEndpointContextFrameIds(connectors),
    connectors,
    explicitObstacleCandidateNodeIds,
    preloadedNodesById,
  );
  const routeNodesById = new Map(
    obstacleCandidates.map((node): [string, SceneNode] => [node.id, node]),
  );

  return {
    connectors: connectors.map((connector) =>
      toValidationFlowConnectorRouteFact(connector, runtime, routeNodesById, obstacleCandidates),
    ),
  };
}

interface RefreshConnectorRecord {
  node: GroupNode;
  record: FlowConnectorRecord | null;
}

function collectRefreshConnectorRecords(
  connectorRecords: FlowConnectorSnapshotRecord[],
  selectedConnectorRoots: GroupNode[],
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): RefreshConnectorRecord[] {
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

function toRefreshFlowConnectorRouteFact(
  connector: RefreshConnectorRecord,
  includeRuntimeFacts: boolean,
  runtime: FlowConnectorCurrentPageRuntime,
  routeNodesById: Map<string, SceneNode>,
  obstacleCandidates: Iterable<SceneNode>,
): RefreshFlowConnectorRouteConnectorFact {
  const baseFact = toRefreshFlowConnectorRouteFactWithoutRuntimeFacts(connector);
  if (!includeRuntimeFacts || connector.record === null) {
    return baseFact;
  }

  const startNode = routeNodesById.get(connector.record.start.nodeId);
  const endNode = routeNodesById.get(connector.record.end.nodeId);

  return {
    ...baseFact,
    ...(startNode === undefined
      ? {}
      : { start: toFlowConnectorAuthoringEndpoint(startNode, runtime) }),
    ...(endNode === undefined ? {} : { end: toFlowConnectorAuthoringEndpoint(endNode, runtime) }),
    obstacles:
      startNode === undefined || endNode === undefined
        ? []
        : collectConnectorObstacles(startNode, endNode, runtime, obstacleCandidates),
  };
}

function toRefreshFlowConnectorRouteFactWithoutRuntimeFacts(
  connector: RefreshConnectorRecord,
): RefreshFlowConnectorRouteConnectorFact {
  return {
    name: connector.node.name,
    nodeId: connector.node.id,
    record: connector.record,
  };
}

function toValidationFlowConnectorRouteFact(
  connector: FlowConnectorSnapshotRecord,
  runtime: FlowConnectorCurrentPageRuntime,
  routeNodesById: Map<string, SceneNode>,
  obstacleCandidates: Iterable<SceneNode>,
): ValidateFlowConnectorRouteConnectorFact {
  const startNode = routeNodesById.get(connector.record.start.nodeId);
  const endNode = routeNodesById.get(connector.record.end.nodeId);
  const labelRect = getFlowActionLabelRect(connector.node);
  const baseFact = {
    nodeId: connector.node.id,
    record: connector.record,
    ...(labelRect === undefined ? {} : { labelRect }),
  };

  if (startNode === undefined || endNode === undefined) {
    return baseFact;
  }

  return {
    ...baseFact,
    end: toValidationEndpointFact(endNode, connector.record.end, runtime),
    obstacles: collectConnectorObstacles(startNode, endNode, runtime, obstacleCandidates),
    start: toValidationEndpointFact(startNode, connector.record.start, runtime),
  };
}

function toValidationEndpointFact(
  node: SceneNode,
  endpoint: { contextFrameId: string; nodeId: string },
  runtime: Pick<FlowConnectorCurrentPageRuntime, "getVisibleBounds">,
): FlowConnectorRouteGeometryEndpointFact {
  return {
    bounds: runtime.getVisibleBounds(node),
    contextFrameId: endpoint.contextFrameId,
    id: endpoint.nodeId,
    name: node.name,
  };
}

async function collectBoundedConnectorObstacleCandidates(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
  endpointContextFrameIds: Iterable<string>,
  connectorRecords: Iterable<{ record: FlowConnectorRecord }>,
  explicitObstacleCandidateNodeIds: Iterable<string> = [],
  preloadedNodesById: Map<string, SceneNode> = new Map(),
): Promise<SceneNode[]> {
  const currentPage = figma.currentPage;
  const nodeIds = new Set<string>(endpointContextFrameIds);
  const validationIndex = readBestEffortMergedValidationIndex(runtime);

  addNodeIds(nodeIds, explicitObstacleCandidateNodeIds);
  addNodeIds(nodeIds, validationIndex.annotationCardNodeIds);
  addNodeIds(nodeIds, validationIndex.contextFrameIds);
  addNodeIds(nodeIds, validationIndex.ownerContextFrameIds);
  addNodeIds(nodeIds, validationIndex.connectorObstacleCandidateNodeIds);
  for (const connector of connectorRecords) {
    const indexNodeIds = getFlowConnectorValidationIndexNodeIds(connector.record);
    addNodeIds(nodeIds, indexNodeIds.connectorObstacleCandidateNodeIds);
  }

  return [
    ...preloadedNodesById.values(),
    ...(await getExistingSceneNodesById(
      [...nodeIds].filter((nodeId) => !preloadedNodesById.has(nodeId)),
      currentPage.id,
      figma.getNodeByIdAsync.bind(figma),
    )),
  ];
}

function* collectEndpointContextFrameIds(
  connectors: Iterable<{ record: FlowConnectorRecord | null }>,
): Iterable<string> {
  for (const connector of connectors) {
    if (connector.record === null) {
      continue;
    }
    yield connector.record.start.contextFrameId;
    yield connector.record.end.contextFrameId;
    yield connector.record.ownerContextFrameId;
  }
}

function addNodeIds(target: Set<string>, nodeIds: Iterable<string>): void {
  for (const nodeId of nodeIds) {
    target.add(nodeId);
  }
}

function hasFlowConnectorRecord(
  connector: RefreshConnectorRecord,
): connector is { node: GroupNode; record: FlowConnectorRecord } {
  return connector.record !== null;
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

function getFlowActionLabelRect(connectorRoot: GroupNode): Rect | undefined {
  const label = connectorRoot.children.find(
    (child) =>
      child.name === FLOW_ACTION_LABEL_NODE_NAME &&
      child.visible !== false &&
      "absoluteBoundingBox" in child &&
      child.absoluteBoundingBox !== null,
  );
  return label === undefined ||
    !("absoluteBoundingBox" in label) ||
    label.absoluteBoundingBox === null
    ? undefined
    : label.absoluteBoundingBox;
}
