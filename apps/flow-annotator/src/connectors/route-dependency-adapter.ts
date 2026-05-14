import {
  type CreateFlowConnectorRouteFacts,
  collectFlowConnectorRouteDependencyNodeIds,
  type FlowConnectorRecord,
  type FlowConnectorRouteDependency,
  type FlowConnectorRouteEndpointFact,
  planCreateFlowConnectorRouteDependencies,
  planRefreshFlowConnectorRouteDependencies,
  type RefreshFlowConnectorRouteConnectorFact,
  type RefreshFlowConnectorRouteFacts,
} from "@figma-flow-annotator/core";
import { getExistingSceneNodesById } from "../figma/runtime";
import { readBestEffortMergedValidationIndex } from "../figma/validation-index";
import type {
  FlowConnectorCurrentPageRuntime,
  FlowConnectorCurrentPageSnapshot,
} from "./current-page-snapshot";
import { toFlowConnectorAuthoringEndpoint } from "./current-page-snapshot";
import { collectConnectorObstacles } from "./obstacles";

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

export async function rehydrateCreateFlowConnectorRouteFacts(
  input: CreateFlowConnectorRouteDependencyAdapterInput,
): Promise<CreateFlowConnectorRouteFacts> {
  const dependencyPlan = planCreateFlowConnectorRouteDependencies({
    endpoints: input.endpointFacts.map((endpoint) => ({
      contextFrameId: endpoint.contextFrameId,
      id: endpoint.id,
      name: endpoint.name,
    })),
    existingConnectors: input.snapshot.connectorRecords.map((connector) => ({
      nodeId: connector.node.id,
      record: connector.record,
    })),
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
    existingConnectors: dependencyPlan.existingConnectors,
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

  return {
    connectors: input.connectors.map((connector) =>
      toRefreshFlowConnectorRouteFact(
        connector,
        shouldIncludeRefreshRuntimeFacts(
          connector.node.id,
          input.selectedConnectorNodeIds,
          dependencyPlan.dependencies,
        ),
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

async function getRouteNodesById(
  dependencies: Iterable<FlowConnectorRouteDependency>,
): Promise<Map<string, SceneNode>> {
  const nodeIds = [
    ...collectFlowConnectorRouteDependencyNodeIds(dependencies, "flow-endpoint"),
    ...collectFlowConnectorRouteDependencyNodeIds(dependencies, "connector-obstacle-candidate"),
  ];
  const nodes = await getExistingSceneNodesById(nodeIds);
  return new Map(nodes.map((node): [string, SceneNode] => [node.id, node]));
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

function shouldIncludeRefreshRuntimeFacts(
  connectorNodeId: string,
  selectedConnectorNodeIds: string[] | undefined,
  dependencies: Iterable<FlowConnectorRouteDependency>,
): boolean {
  if (selectedConnectorNodeIds === undefined) {
    return true;
  }

  for (const dependency of dependencies) {
    if (
      dependency.role === "existing-flow-connector" &&
      dependency.nodeId === connectorNodeId &&
      dependency.sourceConnectorNodeId === connectorNodeId
    ) {
      return true;
    }
  }
  return false;
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
