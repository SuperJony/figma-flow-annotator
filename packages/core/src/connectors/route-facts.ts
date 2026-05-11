import type { RectLike } from "../shared/geometry.ts";
import type { FlowConnectorRecord } from "../shared/plugin-data.ts";
import type { FlowEndpointInput } from "./operations.ts";
import type { ConnectorObstacle } from "./routing.ts";

export interface FlowConnectorRouteGeometryEndpointFact extends FlowEndpointInput {
  bounds: RectLike;
}

export interface FlowConnectorRouteEndpointFact extends FlowConnectorRouteGeometryEndpointFact {
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

export interface RefreshFlowConnectorRouteConnectorFact {
  nodeId: string;
  name: string;
  record: FlowConnectorRecord | null;
  start?: FlowConnectorRouteEndpointFact;
  end?: FlowConnectorRouteEndpointFact;
  obstacles?: ConnectorObstacle[];
}

export interface RefreshFlowConnectorRouteFacts {
  connectors: RefreshFlowConnectorRouteConnectorFact[];
  selectedConnectorNodeIds?: string[];
}

export interface ValidateFlowConnectorRouteConnectorFact {
  nodeId: string;
  record: FlowConnectorRecord;
  start?: FlowConnectorRouteGeometryEndpointFact;
  end?: FlowConnectorRouteGeometryEndpointFact;
  obstacles?: ConnectorObstacle[];
  labelRect?: RectLike;
}

export interface ValidateFlowConnectorRouteFacts {
  connectors: ValidateFlowConnectorRouteConnectorFact[];
}
