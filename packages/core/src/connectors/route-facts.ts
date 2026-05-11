import type { RectLike } from "../shared/geometry.ts";
import type { FlowConnectorRecord } from "../shared/plugin-data.ts";
import type { FlowEndpointInput } from "./operations.ts";
import type { ConnectorObstacle } from "./routing.ts";

export interface FlowConnectorRouteEndpointFact extends FlowEndpointInput {
  bounds: RectLike;
  hasGeneratedAncestor: boolean;
}

export interface ExistingFlowConnectorRouteFact {
  nodeId: string;
  record: FlowConnectorRecord;
}

export interface CreateFlowConnectorRouteFacts {
  endpoints: FlowConnectorRouteEndpointFact[];
  existingConnectors: ExistingFlowConnectorRouteFact[];
  obstacles: ConnectorObstacle[];
}
