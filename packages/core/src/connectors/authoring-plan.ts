import type { CreateFlowConnectorOperationBatch } from "../figma-file/operation-types.ts";
import type { RectLike } from "../shared/geometry.ts";
import type { FlowConnectorRecord } from "../shared/plugin-data.ts";
import { flowConnectorMatchesDirectedPair } from "../shared/plugin-data.ts";
import {
  buildCreateFlowConnectorOperationBatch,
  type FlowEndpointInput,
} from "./operations.ts";
import type { ConnectorObstacle } from "./routing.ts";
import { routeOrthogonalConnector } from "./routing.ts";

export interface FlowConnectorAuthoringEndpointInput extends FlowEndpointInput {
  bounds: RectLike;
  hasGeneratedAncestor: boolean;
}

export interface ExistingFlowConnectorAuthoringInput {
  nodeId: string;
  record: FlowConnectorRecord;
}

export interface PlanCreateFlowConnectorAuthoringInput {
  createConnectorId: () => string;
  endpoints: FlowConnectorAuthoringEndpointInput[];
  existingConnectors: ExistingFlowConnectorAuthoringInput[];
  flowAction: string;
  now: string;
  obstacles: ConnectorObstacle[];
}

export interface CreateFlowConnectorAuthoringPlan {
  batch: CreateFlowConnectorOperationBatch;
  existingConnector: ExistingFlowConnectorAuthoringInput | null;
  routePoints: { x: number; y: number }[];
}

export function planCreateFlowConnectorAuthoring(
  input: PlanCreateFlowConnectorAuthoringInput,
): CreateFlowConnectorAuthoringPlan {
  const [start, end] = normalizeCreateEndpoints(input.endpoints);
  const routePoints = routeOrthogonalConnector({
    startRect: start.bounds,
    endRect: end.bounds,
    obstacles: input.obstacles,
  }).points;
  const existingConnector =
    input.existingConnectors.find((connector) =>
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
