import type { CreateFlowConnectorOperationBatch } from "../figma-file/operation-types.ts";
import { flowConnectorMatchesDirectedPair } from "../shared/plugin-data.ts";
import { buildCreateFlowConnectorOperationBatch } from "./operations.ts";
import type {
  CreateFlowConnectorRouteFacts,
  ExistingFlowConnectorRouteFact,
  FlowConnectorRouteEndpointFact,
} from "./route-facts.ts";
import { routeOrthogonalConnector } from "./routing.ts";

export type FlowConnectorAuthoringEndpointInput = FlowConnectorRouteEndpointFact;
export type ExistingFlowConnectorAuthoringInput = ExistingFlowConnectorRouteFact;

export interface PlanCreateFlowConnectorAuthoringInput {
  createConnectorId: () => string;
  flowAction: string;
  now: string;
  routeFacts: CreateFlowConnectorRouteFacts;
}

export interface CreateFlowConnectorAuthoringPlan {
  batch: CreateFlowConnectorOperationBatch;
  existingConnector: ExistingFlowConnectorAuthoringInput | null;
  routePoints: { x: number; y: number }[];
}

export function planCreateFlowConnectorAuthoring(
  input: PlanCreateFlowConnectorAuthoringInput,
): CreateFlowConnectorAuthoringPlan {
  const [start, end] = normalizeCreateEndpoints(input.routeFacts.endpoints);
  const routePoints = routeOrthogonalConnector({
    startRect: start.bounds,
    endRect: end.bounds,
    obstacles: input.routeFacts.obstacles,
  }).points;
  const existingConnector =
    input.routeFacts.existingConnectors.find((connector) =>
      flowConnectorMatchesDirectedPair(connector.record, start.id, end.id),
    ) ?? null;
  const batch = buildCreateFlowConnectorOperationBatch({
    connectorId: existingConnector?.record.id ?? input.createConnectorId(),
    ...(existingConnector === null ? {} : { existingConnector }),
    start,
    end,
    ownerContextFrameId: start.contextFrameId,
    flowAction: input.flowAction,
    routePoints,
    now: input.now,
  });

  return {
    batch,
    existingConnector,
    routePoints,
  };
}

function normalizeCreateEndpoints(
  endpoints: FlowConnectorAuthoringEndpointInput[],
): [FlowConnectorAuthoringEndpointInput, FlowConnectorAuthoringEndpointInput] {
  if (endpoints.length !== 2) {
    throw new Error("Create Flow Connector requires exactly two runtime-selected Flow Endpoints.");
  }
  const [start, end] = endpoints;
  validateEndpoint(start);
  validateEndpoint(end);
  return [start, end];
}

function validateEndpoint(endpoint: FlowConnectorAuthoringEndpointInput): void {
  if (endpoint.hasGeneratedAncestor) {
    throw new Error("Flow Endpoints must be non-generated Figma nodes.");
  }
}
