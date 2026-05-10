import type {
  CreateFlowConnectorOperationBatch,
  RefreshFlowConnectorOperationBatch,
} from "../figma-file/operation-types.ts";
import type { RectLike } from "../shared/geometry.ts";
import type { FlowConnectorRecord } from "../shared/plugin-data.ts";
import { flowConnectorMatchesDirectedPair } from "../shared/plugin-data.ts";
import {
  buildCreateFlowConnectorOperationBatch,
  buildRefreshFlowConnectorOperationBatch,
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

export interface PlanRefreshFlowConnectorAuthoringInput {
  connectorNodeId: string;
  end: FlowConnectorAuthoringEndpointInput;
  now: string;
  obstacles: ConnectorObstacle[];
  record: FlowConnectorRecord;
  start: FlowConnectorAuthoringEndpointInput;
}

export interface RefreshFlowConnectorAuthoringPlan {
  batch: RefreshFlowConnectorOperationBatch;
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

export function planRefreshFlowConnectorAuthoring(
  input: PlanRefreshFlowConnectorAuthoringInput,
): RefreshFlowConnectorAuthoringPlan {
  if (input.start.id !== input.record.start.nodeId) {
    throw new Error(`Refresh start Flow Endpoint does not match ${input.record.start.nodeId}.`);
  }
  if (input.end.id !== input.record.end.nodeId) {
    throw new Error(`Refresh end Flow Endpoint does not match ${input.record.end.nodeId}.`);
  }
  validateEndpoint(input.start);
  validateEndpoint(input.end);

  const routePoints = routeOrthogonalConnector({
    startRect: input.start.bounds,
    endRect: input.end.bounds,
    obstacles: input.obstacles,
  }).points;
  const batch = buildRefreshFlowConnectorOperationBatch({
    connectorNodeId: input.connectorNodeId,
    endName: input.end.name,
    now: input.now,
    record: input.record,
    routePoints,
    startName: input.start.name,
  });

  return {
    batch,
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
