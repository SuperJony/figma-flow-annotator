import {
  type CreateFlowConnectorRouteFacts,
  collectFlowConnectorRouteDependencyNodeIds,
  type FlowConnectorRecord,
  type FlowConnectorRouteDependency,
  type FlowConnectorRouteEndpointFact,
  type FlowConnectorRouteGeometryEndpointFact,
  planCreateFlowConnectorRouteDependencies,
  planRefreshFlowConnectorRouteDependencies,
  planValidateFlowConnectorRouteDependencies,
  type RefreshFlowConnectorRouteConnectorFact,
  type RefreshFlowConnectorRouteFacts,
  type ValidateFlowConnectorRouteConnectorFact,
  type ValidateFlowConnectorRouteGeometryInput,
} from "@figma-flow-annotator/core";
import { getExistingSceneNodesById } from "../figma/runtime";
import { readBestEffortMergedValidationIndex } from "../figma/validation-index";
import type {
  FlowConnectorCurrentPageRuntime,
  FlowConnectorCurrentPageSnapshot,
  FlowConnectorSnapshotRecord,
} from "./current-page-snapshot";
import { toFlowConnectorAuthoringEndpoint } from "./current-page-snapshot";
import { collectConnectorObstacles } from "./obstacles";
import { FLOW_ACTION_LABEL_NODE_NAME } from "./visual-node-names";

export interface CreateFlowConnectorRouteDependencyAdapterInput {
  endpointFacts: FlowConnectorRouteEndpointFact[];
  endpoints: SceneNode[];
  runtime: FlowConnectorCurrentPageRuntime;
  snapshot: FlowConnectorCurrentPageSnapshot;
}

export interface RefreshFlowConnectorRouteDependencyAdapterConnector {
  node: GroupNode;
  record: FlowConnectorRecord | null;
}

export interface RefreshFlowConnectorRouteDependencyAdapterInput {
  connectors: RefreshFlowConnectorRouteDependencyAdapterConnector[];
  runtime: FlowConnectorCurrentPageRuntime;
  selectedConnectorNodeIds?: string[];
}

export interface ValidateFlowConnectorRouteDependencyAdapterInput {
  connectorRecords: FlowConnectorSnapshotRecord[];
  explicitAnnotationCardNodeIds?: Iterable<string>;
  preloadedNodes?: Iterable<SceneNode>;
  runtime: FlowConnectorCurrentPageRuntime;
}

export async function rehydrateCreateFlowConnectorRouteFacts(
  input: CreateFlowConnectorRouteDependencyAdapterInput,
): Promise<CreateFlowConnectorRouteFacts> {
  const existingConnectors = input.snapshot.connectorRecords.map((connector) => ({
    nodeId: connector.node.id,
    record: connector.record,
  }));
  const dependencyPlan = planCreateFlowConnectorRouteDependencies({
    endpoints: input.endpointFacts.map((endpoint) => ({
      contextFrameId: endpoint.contextFrameId,
      id: endpoint.id,
    })),
    existingConnectors,
    validationIndex: readBestEffortMergedValidationIndex(input.runtime),
  });
  const obstacleCandidates =
    input.endpoints.length === 2
      ? await getExistingSceneNodesById(
          collectFlowConnectorRouteDependencyNodeIds(
            dependencyPlan.dependencies,
            "connector-obstacle-candidate",
          ),
        )
      : [];

  return {
    endpoints: input.endpointFacts,
    existingConnectors,
    obstacles:
      input.endpoints.length === 2
        ? collectConnectorObstacles(
            input.endpoints[0],
            input.endpoints[1],
            input.runtime,
            obstacleCandidates,
          )
        : [],
  };
}

export async function rehydrateRefreshFlowConnectorRouteFacts(
  input: RefreshFlowConnectorRouteDependencyAdapterInput,
): Promise<RefreshFlowConnectorRouteFacts> {
  const dependencyPlan = planRefreshFlowConnectorRouteDependencies({
    connectors: input.connectors.flatMap((connector) =>
      connector.record === null ? [] : [{ nodeId: connector.node.id, record: connector.record }],
    ),
    ...(input.selectedConnectorNodeIds === undefined
      ? {}
      : { selectedConnectorNodeIds: input.selectedConnectorNodeIds }),
    validationIndex: readBestEffortMergedValidationIndex(input.runtime),
  });
  const routeNodesById = await getRouteNodesById(dependencyPlan.dependencies);
  const obstacleCandidates = collectObstacleCandidateNodes(
    dependencyPlan.dependencies,
    routeNodesById,
  );
  const includedConnectorNodeIds = collectIncludedRefreshConnectorNodeIds(
    dependencyPlan.dependencies,
    input.selectedConnectorNodeIds,
  );

  return {
    connectors: input.connectors.map((connector) =>
      toRefreshFlowConnectorRouteFact(
        connector,
        includedConnectorNodeIds === undefined || includedConnectorNodeIds.has(connector.node.id),
        input.runtime,
        routeNodesById,
        obstacleCandidates,
      ),
    ),
    ...(input.selectedConnectorNodeIds === undefined
      ? {}
      : { selectedConnectorNodeIds: input.selectedConnectorNodeIds }),
  };
}

export async function rehydrateValidateFlowConnectorRouteGeometry(
  input: ValidateFlowConnectorRouteDependencyAdapterInput,
): Promise<ValidateFlowConnectorRouteGeometryInput> {
  const labelNodes = collectVisibleFlowActionLabelNodes(input.connectorRecords);
  const dependencyPlan = planValidateFlowConnectorRouteDependencies({
    connectors: input.connectorRecords.map((connector) => ({
      nodeId: connector.node.id,
      record: connector.record,
    })),
    ...(input.explicitAnnotationCardNodeIds === undefined
      ? {}
      : { explicitAnnotationCardNodeIds: input.explicitAnnotationCardNodeIds }),
    flowActionLabelNodeIds: labelNodes.map((label) => ({
      nodeId: label.node.id,
      sourceConnectorNodeId: label.sourceConnectorNodeId,
    })),
    validationIndex: readBestEffortMergedValidationIndex(input.runtime),
  });
  const routeNodesById = await getRouteNodesById(dependencyPlan.dependencies, input.preloadedNodes);
  const obstacleCandidates = collectObstacleCandidateNodes(
    dependencyPlan.dependencies,
    routeNodesById,
  );
  const labelRectByConnectorNodeId = collectPlannedFlowActionLabelRects(
    dependencyPlan.dependencies,
    new Map(labelNodes.map((label) => [label.node.id, label.node])),
  );

  return {
    connectors: input.connectorRecords.map((connector) =>
      toValidationFlowConnectorRouteFact(
        connector,
        input.runtime,
        routeNodesById,
        obstacleCandidates,
        labelRectByConnectorNodeId,
      ),
    ),
  };
}

async function getRouteNodesById(
  dependencies: Iterable<FlowConnectorRouteDependency>,
  preloadedNodes: Iterable<SceneNode> = [],
): Promise<Map<string, SceneNode>> {
  const preloadedNodesById = new Map(
    [...preloadedNodes].map((node): [string, SceneNode] => [node.id, node]),
  );
  const nodeIds = [
    ...collectFlowConnectorRouteDependencyNodeIds(dependencies, "flow-endpoint"),
    ...collectFlowConnectorRouteDependencyNodeIds(dependencies, "connector-obstacle-candidate"),
  ].filter((nodeId) => !preloadedNodesById.has(nodeId));
  const nodes = await getExistingSceneNodesById(nodeIds);
  return new Map([
    ...preloadedNodesById,
    ...nodes.map((node): [string, SceneNode] => [node.id, node]),
  ]);
}

function collectObstacleCandidateNodes(
  dependencies: Iterable<FlowConnectorRouteDependency>,
  routeNodesById: Map<string, SceneNode>,
): SceneNode[] {
  return collectFlowConnectorRouteDependencyNodeIds(
    dependencies,
    "connector-obstacle-candidate",
  ).flatMap((nodeId) => {
    const node = routeNodesById.get(nodeId);
    return node === undefined ? [] : [node];
  });
}

function collectIncludedRefreshConnectorNodeIds(
  dependencies: Iterable<FlowConnectorRouteDependency>,
  selectedConnectorNodeIds: string[] | undefined,
): Set<string> | undefined {
  if (selectedConnectorNodeIds === undefined) {
    return undefined;
  }

  const includedConnectorNodeIds = new Set<string>();
  for (const dependency of dependencies) {
    if (
      dependency.role === "existing-flow-connector" &&
      dependency.nodeId === dependency.sourceConnectorNodeId
    ) {
      includedConnectorNodeIds.add(dependency.nodeId);
    }
  }
  return includedConnectorNodeIds;
}

function toRefreshFlowConnectorRouteFact(
  connector: RefreshFlowConnectorRouteDependencyAdapterConnector,
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
  connector: RefreshFlowConnectorRouteDependencyAdapterConnector,
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
  labelRectByConnectorNodeId: Map<string, Rect>,
): ValidateFlowConnectorRouteConnectorFact {
  const startNode = routeNodesById.get(connector.record.start.nodeId);
  const endNode = routeNodesById.get(connector.record.end.nodeId);
  const labelRect = labelRectByConnectorNodeId.get(connector.node.id);
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

function collectPlannedFlowActionLabelRects(
  dependencies: Iterable<FlowConnectorRouteDependency>,
  labelNodesById: Map<string, SceneNode>,
): Map<string, Rect> {
  const labelRectByConnectorNodeId = new Map<string, Rect>();
  for (const dependency of dependencies) {
    if (dependency.role !== "flow-action-label" || dependency.sourceConnectorNodeId === undefined) {
      continue;
    }

    const label = labelNodesById.get(dependency.nodeId);
    if (
      label === undefined ||
      !("absoluteBoundingBox" in label) ||
      label.absoluteBoundingBox === null
    ) {
      continue;
    }
    labelRectByConnectorNodeId.set(dependency.sourceConnectorNodeId, label.absoluteBoundingBox);
  }
  return labelRectByConnectorNodeId;
}

function collectVisibleFlowActionLabelNodes(
  connectors: Iterable<FlowConnectorSnapshotRecord>,
): Array<{ node: SceneNode; sourceConnectorNodeId: string }> {
  const labels: Array<{ node: SceneNode; sourceConnectorNodeId: string }> = [];
  for (const connector of connectors) {
    const label = connector.node.children.find(
      (child) =>
        child.name === FLOW_ACTION_LABEL_NODE_NAME &&
        child.visible !== false &&
        "absoluteBoundingBox" in child &&
        child.absoluteBoundingBox !== null,
    );
    if (label !== undefined && "absoluteBoundingBox" in label) {
      labels.push({ node: label, sourceConnectorNodeId: connector.node.id });
    }
  }
  return labels;
}
