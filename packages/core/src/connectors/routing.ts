import type { Point, RectLike } from "../shared/geometry.ts";
import type { FlowConnectorRecord } from "../shared/plugin-data.ts";
import {
  buildRouteCandidates,
  compactPoints,
  distance,
  expandRect,
  getFinalRouteSegment,
  getIncomingSide,
  getRouteCenterPoint,
  getRouteSegments,
  groupBy,
  routeIntersectsEndpointInteriors,
  routeIntersectsObstacles,
  scoreRoute,
  segmentIntersectsRect,
  segmentKey,
  segmentMatches,
  segmentMidpoint,
  undirectedSegmentKey,
} from "./routing-helpers.ts";

export type ConnectorRouteSide = "left" | "right" | "top" | "bottom";

export type ConnectorObstacleKind = "context-frame" | "annotation-card";

export interface ConnectorObstacle {
  id?: string;
  kind: ConnectorObstacleKind;
  rect: RectLike;
}

export interface RouteOrthogonalConnectorInput {
  startRect: RectLike;
  endRect: RectLike;
  obstacles: ConnectorObstacle[];
  preferredStartSide?: ConnectorRouteSide;
  preferredEndSide?: ConnectorRouteSide;
  endpointGap?: number;
  obstaclePadding?: number;
}

export interface RouteOrthogonalConnectorResult {
  points: Point[];
}

export interface ConnectorRouteSegment {
  end: Point;
  index: number;
  length: number;
  start: Point;
}

export interface FlowActionLabelPlacement {
  center: Point;
  segmentIndex: number;
}

export interface PlaceFlowActionLabelInput {
  flowAction: string;
  obstaclePadding?: number;
  obstacles?: ConnectorObstacle[];
  routePoints: Point[];
  sharedTrunkSegment?: ConnectorRouteSegment;
}

export interface ConnectorTrunkInput {
  record: FlowConnectorRecord;
}

export interface ConnectorTrunkGroup {
  connectorIds: string[];
  endNodeId: string;
  groupKey: string;
  incomingSide: ConnectorRouteSide;
  segment: ConnectorRouteSegment;
}

export interface ConnectorTrunkAssignment {
  connectorId: string;
  groupKey: string;
  segment: ConnectorRouteSegment;
}

export interface ConnectorTrunkLayout {
  assignments: ConnectorTrunkAssignment[];
  groups: ConnectorTrunkGroup[];
}

export interface GroupConnectorTrunksInput {
  connectors: ConnectorTrunkInput[];
}

export type ConnectorRouteFailureCode = "no-legal-route";

export class ConnectorRouteFailure extends Error {
  readonly code: ConnectorRouteFailureCode;

  constructor(message: string, code: ConnectorRouteFailureCode = "no-legal-route") {
    super(message);
    this.name = "ConnectorRouteFailure";
    this.code = code;
  }
}

const CONNECTOR_ROUTE_PADDING = 24;
const CONNECTOR_ENDPOINT_GAP = 32;

export function routeOrthogonalConnector(
  input: RouteOrthogonalConnectorInput,
): RouteOrthogonalConnectorResult {
  const endpointGap = input.endpointGap ?? CONNECTOR_ENDPOINT_GAP;
  const obstaclePadding = input.obstaclePadding ?? CONNECTOR_ROUTE_PADDING;
  const expandedObstacles = input.obstacles.map((obstacle) => ({
    ...obstacle,
    rect: expandRect(obstacle.rect, obstaclePadding),
  }));
  const candidates = buildRouteCandidates({
    start: input.startRect,
    end: input.endRect,
    obstacles: expandedObstacles.map((obstacle) => obstacle.rect),
    endpointGap,
    preferredStartSide: input.preferredStartSide,
    preferredEndSide: input.preferredEndSide,
    routePadding: CONNECTOR_ROUTE_PADDING,
  });
  const legalCandidates = candidates
    .map((candidate) => ({
      points: compactPoints(candidate.points),
      preferencePenalty: candidate.preferencePenalty,
    }))
    .filter(
      (candidate) =>
        !routeIntersectsObstacles(
          candidate.points,
          expandedObstacles.map((obstacle) => obstacle.rect),
        ) && !routeIntersectsEndpointInteriors(candidate.points, [input.startRect, input.endRect]),
    );

  if (legalCandidates.length === 0) {
    throw new ConnectorRouteFailure("No legal Orthogonal Route avoids Connector Obstacles.");
  }

  legalCandidates.sort(
    (first, second) =>
      scoreRoute(first.points) +
      first.preferencePenalty -
      (scoreRoute(second.points) + second.preferencePenalty),
  );
  return { points: legalCandidates[0].points };
}

export function placeFlowActionLabel(
  input: PlaceFlowActionLabelInput,
): FlowActionLabelPlacement | null {
  if (input.flowAction.trim().length === 0) {
    return null;
  }

  const routePoints = compactPoints(input.routePoints);
  const routeCenter = getRouteCenterPoint(routePoints);
  const obstaclePadding = input.obstaclePadding ?? 0;
  const obstacles = (input.obstacles ?? []).map((obstacle) =>
    expandRect(obstacle.rect, obstaclePadding),
  );
  const candidates = getRouteSegments(routePoints)
    .filter((segment) => !segmentMatches(segment, input.sharedTrunkSegment))
    .filter(
      (segment) =>
        !obstacles.some((obstacle) => segmentIntersectsRect(segment.start, segment.end, obstacle)),
    );

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(
    (first, second) =>
      second.length - first.length ||
      distance(segmentMidpoint(first), routeCenter) -
        distance(segmentMidpoint(second), routeCenter) ||
      first.index - second.index,
  );

  return {
    center: segmentMidpoint(candidates[0]),
    segmentIndex: candidates[0].index,
  };
}

export function groupConnectorTrunks(input: GroupConnectorTrunksInput): ConnectorTrunkLayout {
  const connectors = input.connectors
    .flatMap((connector) => {
      const points = connector.record.routeCache?.points;
      if (points === undefined) {
        return [];
      }
      const finalSegment = getFinalRouteSegment(points);
      if (finalSegment === null) {
        return [];
      }
      const incomingSide = getIncomingSide(finalSegment);
      if (incomingSide === null) {
        return [];
      }
      return [
        {
          ...connector,
          finalSegment,
          incomingSide,
          key: `${connector.record.end.nodeId}:${incomingSide}`,
        },
      ];
    })
    .sort((first, second) => first.record.id.localeCompare(second.record.id));
  const groups: ConnectorTrunkGroup[] = [];

  groupBy(connectors, (connector) => connector.key).forEach((group, key) => {
    const uniqueStartIds = new Set(group.map((connector) => connector.record.start.nodeId));
    if (group.length < 2 || uniqueStartIds.size < 2) {
      return;
    }

    const segment = group[0].finalSegment;
    if (!group.every((connector) => segmentMatches(connector.finalSegment, segment))) {
      return;
    }

    groups.push({
      connectorIds: group.map((connector) => connector.record.id).sort(),
      endNodeId: group[0].record.end.nodeId,
      groupKey: key,
      incomingSide: group[0].incomingSide,
      segment,
    });
  });

  groups.sort((first, second) => first.groupKey.localeCompare(second.groupKey));
  const assignments = groups.flatMap((group) =>
    group.connectorIds.map((connectorId) => ({
      connectorId,
      groupKey: group.groupKey,
      segment: group.segment,
    })),
  );

  return { assignments, groups };
}

export {
  getFinalRouteSegment,
  getIncomingSide,
  routeIntersectsObstacles,
  segmentKey,
  undirectedSegmentKey,
};
