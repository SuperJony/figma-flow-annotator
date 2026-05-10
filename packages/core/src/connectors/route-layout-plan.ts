import type { RefreshFlowConnectorOperationBatch } from "../figma-file/operation-types.ts";
import type { Point, RectLike } from "../shared/geometry.ts";
import type { FlowConnectorRecord } from "../shared/plugin-data.ts";
import { buildFlowConnectorVisualModel, type FlowConnectorVisualModel } from "../visual-model.ts";
import type { FlowEndpointInput } from "./operations.ts";
import { buildRefreshFlowConnectorOperationBatch } from "./operations.ts";
import {
  type ConnectorObstacle,
  type ConnectorRouteSegment,
  type ConnectorTrunkLayout,
  groupConnectorTrunks,
  routeOrthogonalConnector,
} from "./routing.ts";

export interface FlowConnectorRouteLayoutEndpointInput extends FlowEndpointInput {
  bounds: RectLike;
  hasGeneratedAncestor: boolean;
}

export interface FlowConnectorRouteLayoutConnectorInput {
  nodeId: string;
  name: string;
  record: FlowConnectorRecord | null;
  start?: FlowConnectorRouteLayoutEndpointInput;
  end?: FlowConnectorRouteLayoutEndpointInput;
  obstacles?: ConnectorObstacle[];
}

export interface PlanFlowConnectorRouteLayoutSetInput {
  connectors: FlowConnectorRouteLayoutConnectorInput[];
  now: string;
  selectedConnectorNodeIds?: string[];
}

export interface FlowConnectorRouteRefreshPlan {
  batch: RefreshFlowConnectorOperationBatch;
  connectorId: string;
  connectorNodeId: string;
  record: FlowConnectorRecord;
  routePoints: Point[];
}

export interface FlowConnectorRouteLayoutFailure {
  connectorId?: string;
  connectorName: string;
  connectorNodeId: string;
  message: string;
}

export interface FlowConnectorRouteRenderInput {
  nodeId: string;
  record: FlowConnectorRecord;
}

export interface PlanFlowConnectorRouteRenderSetInput {
  connectors: FlowConnectorRouteRenderInput[];
}

export interface FlowConnectorRouteRenderPlan {
  connectorId: string;
  connectorNodeId: string;
  flowAction: string | null;
  routePoints: Point[];
  sharedTrunkSegment?: ConnectorRouteSegment;
  visual: FlowConnectorVisualModel;
}

export interface FlowConnectorRouteRenderSetPlan {
  renderConnectors: FlowConnectorRouteRenderPlan[];
  trunkLayout: ConnectorTrunkLayout;
}

export interface FlowConnectorRouteLayoutSetPlan extends FlowConnectorRouteRenderSetPlan {
  failures: FlowConnectorRouteLayoutFailure[];
  refreshes: FlowConnectorRouteRefreshPlan[];
  selectedOnly: boolean;
  targetConnectorNodeIds: string[];
}

export function planFlowConnectorRouteLayoutSet(
  input: PlanFlowConnectorRouteLayoutSetInput,
): FlowConnectorRouteLayoutSetPlan {
  const selectedConnectorNodeIds = input.selectedConnectorNodeIds ?? [];
  const selectedOnly = selectedConnectorNodeIds.length > 0;
  const selectedNodeIdSet = new Set(selectedConnectorNodeIds);
  const targetConnectors = selectedOnly
    ? input.connectors.filter((connector) => selectedNodeIdSet.has(connector.nodeId))
    : input.connectors;
  const refreshes: FlowConnectorRouteRefreshPlan[] = [];
  const failures: FlowConnectorRouteLayoutFailure[] = [];

  targetConnectors.forEach((connector) => {
    try {
      refreshes.push(planOneConnectorRefresh(connector, input.now));
    } catch (error: unknown) {
      failures.push({
        connectorId: connector.record?.id,
        connectorName: connector.name,
        connectorNodeId: connector.nodeId,
        message: error instanceof Error ? error.message : "Unknown connector refresh failure.",
      });
    }
  });

  const refreshedRecordsByNodeId = new Map(
    refreshes.map((refresh) => [refresh.connectorNodeId, refresh.record]),
  );
  const renderSet = planFlowConnectorRouteRenderSet({
    connectors: input.connectors.flatMap((connector) => {
      const record =
        refreshedRecordsByNodeId.get(connector.nodeId) ?? connector.record ?? undefined;
      return record === undefined ? [] : [{ nodeId: connector.nodeId, record }];
    }),
  });

  return {
    ...renderSet,
    failures,
    refreshes,
    selectedOnly,
    targetConnectorNodeIds: targetConnectors.map((connector) => connector.nodeId),
  };
}

export function planFlowConnectorRouteRenderSet(
  input: PlanFlowConnectorRouteRenderSetInput,
): FlowConnectorRouteRenderSetPlan {
  const connectorsWithRouteCache = input.connectors.filter(
    (connector) => connector.record.routeCache !== undefined,
  );
  const trunkLayout = groupConnectorTrunks({
    connectors: connectorsWithRouteCache.map((connector) => ({ record: connector.record })),
  });
  const assignmentByConnectorId = new Map(
    trunkLayout.assignments.map((assignment) => [assignment.connectorId, assignment]),
  );

  return {
    renderConnectors: connectorsWithRouteCache.map((connector) => {
      const assignment = assignmentByConnectorId.get(connector.record.id);
      return {
        connectorId: connector.record.id,
        connectorNodeId: connector.nodeId,
        flowAction: connector.record.flowAction,
        routePoints: connector.record.routeCache?.points ?? [],
        ...(assignment === undefined ? {} : { sharedTrunkSegment: assignment.segment }),
        visual: buildFlowConnectorVisualModel({
          flowAction: connector.record.flowAction ?? "",
          routePoints: connector.record.routeCache?.points ?? [],
          sharedTrunkSegment: assignment?.segment,
        }),
      };
    }),
    trunkLayout,
  };
}

function planOneConnectorRefresh(
  connector: FlowConnectorRouteLayoutConnectorInput,
  now: string,
): FlowConnectorRouteRefreshPlan {
  if (connector.record === null) {
    throw new Error("Missing Flow Connector record.");
  }
  if (connector.start === undefined) {
    throw new Error(`Missing start Flow Endpoint ${connector.record.start.nodeId}.`);
  }
  if (connector.end === undefined) {
    throw new Error(`Missing end Flow Endpoint ${connector.record.end.nodeId}.`);
  }
  if (connector.start.id !== connector.record.start.nodeId) {
    throw new Error(`Refresh start Flow Endpoint does not match ${connector.record.start.nodeId}.`);
  }
  if (connector.end.id !== connector.record.end.nodeId) {
    throw new Error(`Refresh end Flow Endpoint does not match ${connector.record.end.nodeId}.`);
  }
  validateEndpoint(connector.start);
  validateEndpoint(connector.end);

  const routePoints = routeOrthogonalConnector({
    startRect: connector.start.bounds,
    endRect: connector.end.bounds,
    obstacles: connector.obstacles ?? [],
  }).points;
  const batch = buildRefreshFlowConnectorOperationBatch({
    connectorNodeId: connector.nodeId,
    endName: connector.end.name,
    now,
    record: connector.record,
    routePoints,
    startName: connector.start.name,
  });

  return {
    batch,
    connectorId: connector.record.id,
    connectorNodeId: connector.nodeId,
    record: batch.record,
    routePoints,
  };
}

function validateEndpoint(endpoint: FlowConnectorRouteLayoutEndpointInput): void {
  if (endpoint.hasGeneratedAncestor) {
    throw new Error("Flow Endpoints must be non-generated Figma nodes.");
  }
}
