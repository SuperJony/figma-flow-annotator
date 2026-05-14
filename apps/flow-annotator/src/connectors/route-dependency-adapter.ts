import {
  type CreateFlowConnectorRouteFacts,
  collectFlowConnectorRouteDependencyNodeIds,
  type FlowConnectorRouteEndpointFact,
  planCreateFlowConnectorRouteDependencies,
} from "@figma-flow-annotator/core";
import { getExistingSceneNodesById } from "../figma/runtime";
import { readBestEffortMergedValidationIndex } from "../figma/validation-index";
import type {
  FlowConnectorCurrentPageRuntime,
  FlowConnectorCurrentPageSnapshot,
} from "./current-page-snapshot";
import { collectConnectorObstacles } from "./obstacles";

export interface CreateFlowConnectorRouteDependencyAdapterInput {
  endpointFacts: FlowConnectorRouteEndpointFact[];
  endpoints: SceneNode[];
  runtime: FlowConnectorCurrentPageRuntime;
  snapshot: FlowConnectorCurrentPageSnapshot;
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
