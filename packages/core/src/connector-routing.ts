
import type { Point, RectLike } from './geometry.ts';
import { unionRects } from './geometry.ts';
import type { FlowConnectorRecord } from './shared-data.ts';

export type ConnectorRouteSide = 'left' | 'right' | 'top' | 'bottom';

export type ConnectorObstacleKind = 'context-frame' | 'annotation-card';

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

export interface ConnectorTrunkPlan {
  assignments: ConnectorTrunkAssignment[];
  groups: ConnectorTrunkGroup[];
}

export interface PlanConnectorTrunksInput {
  connectors: ConnectorTrunkInput[];
}

export type ConnectorRouteFailureCode = 'no-legal-route';

export class ConnectorRouteFailure extends Error {
  readonly code: ConnectorRouteFailureCode;

  constructor(message: string, code: ConnectorRouteFailureCode = 'no-legal-route') {
    super(message);
    this.name = 'ConnectorRouteFailure';
    this.code = code;
  }
}

const CONNECTOR_ROUTE_PADDING = 24;
const CONNECTOR_ENDPOINT_GAP = 32;
const ROUTE_EPSILON = 0.001;

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
  });
  const legalCandidates = candidates
    .map((candidate) => ({
      points: compactPoints(candidate.points),
      preferencePenalty: candidate.preferencePenalty,
    }))
    .filter(
      (candidate) =>
        !routeIntersectsObstacles(candidate.points, expandedObstacles.map((obstacle) => obstacle.rect)) &&
        !routeIntersectsEndpointInteriors(candidate.points, [input.startRect, input.endRect]),
    );

  if (legalCandidates.length === 0) {
    throw new ConnectorRouteFailure('No legal Orthogonal Route avoids Connector Obstacles.');
  }

  legalCandidates.sort((first, second) =>
    scoreRoute(first.points) + first.preferencePenalty -
    (scoreRoute(second.points) + second.preferencePenalty),
  );
  return { points: legalCandidates[0].points };
}

export function placeFlowActionLabel(input: PlaceFlowActionLabelInput): FlowActionLabelPlacement | null {
  if (input.flowAction.trim().length === 0) {
    return null;
  }

  const routePoints = compactPoints(input.routePoints);
  const routeCenter = getRouteCenterPoint(routePoints);
  const obstaclePadding = input.obstaclePadding ?? 0;
  const obstacles = (input.obstacles ?? []).map((obstacle) => expandRect(obstacle.rect, obstaclePadding));
  const candidates = getRouteSegments(routePoints)
    .filter((segment) => !segmentMatches(segment, input.sharedTrunkSegment))
    .filter((segment) => !obstacles.some((obstacle) => segmentIntersectsRect(segment.start, segment.end, obstacle)));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((first, second) =>
    second.length - first.length ||
    distance(segmentMidpoint(first), routeCenter) - distance(segmentMidpoint(second), routeCenter) ||
    first.index - second.index,
  );

  return {
    center: segmentMidpoint(candidates[0]),
    segmentIndex: candidates[0].index,
  };
}

export function planConnectorTrunks(input: PlanConnectorTrunksInput): ConnectorTrunkPlan {
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
      return [{
        ...connector,
        finalSegment,
        incomingSide,
        key: `${connector.record.end.nodeId}:${incomingSide}`,
      }];
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

function buildRouteCandidates(input: {
  start: RectLike;
  end: RectLike;
  obstacles: RectLike[];
  endpointGap: number;
  preferredStartSide?: ConnectorRouteSide;
  preferredEndSide?: ConnectorRouteSide;
}): { points: Point[]; preferencePenalty: number }[] {
  const sidePairs = getRouteSidePairs(input.start, input.end, input.preferredStartSide, input.preferredEndSide);
  const bounds = unionRects([input.start, input.end, ...input.obstacles]);
  const laneXs = getVerticalLaneValues(input.start, input.end, input.obstacles, bounds);
  const laneYs = getHorizontalLaneValues(input.start, input.end, input.obstacles, bounds);
  const seen = new Set<string>();
  const candidates: { points: Point[]; preferencePenalty: number }[] = [];

  sidePairs.forEach((pair) => {
    const startPoint = boundaryPoint(input.start, pair.startSide);
    const endPoint = boundaryPoint(input.end, pair.endSide);
    const startLead = leadPoint(startPoint, pair.startSide, input.endpointGap);
    const endLead = leadPoint(endPoint, pair.endSide, input.endpointGap);
    const preferencePenalty = getPreferencePenalty(
      pair,
      input.preferredStartSide,
      input.preferredEndSide,
    );
    const pairCandidates = [
      [startPoint, startLead, { x: endLead.x, y: startLead.y }, endLead, endPoint],
      [startPoint, startLead, { x: startLead.x, y: endLead.y }, endLead, endPoint],
      ...laneXs.map((laneX) => [
        startPoint,
        startLead,
        { x: laneX, y: startLead.y },
        { x: laneX, y: endLead.y },
        endLead,
        endPoint,
      ]),
      ...laneYs.map((laneY) => [
        startPoint,
        startLead,
        { x: startLead.x, y: laneY },
        { x: endLead.x, y: laneY },
        endLead,
        endPoint,
      ]),
    ];

    pairCandidates.forEach((points) => {
      const key = JSON.stringify(compactPoints(points));
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({ points, preferencePenalty });
    });
  });

  return candidates;
}

function getRouteSidePairs(
  start: RectLike,
  end: RectLike,
  preferredStartSide?: ConnectorRouteSide,
  preferredEndSide?: ConnectorRouteSide,
): { startSide: ConnectorRouteSide; endSide: ConnectorRouteSide }[] {
  const startCenter = centerOf(start);
  const endCenter = centerOf(end);
  const horizontalPair = endCenter.x >= startCenter.x
    ? { startSide: 'right' as const, endSide: 'left' as const }
    : { startSide: 'left' as const, endSide: 'right' as const };
  const verticalPair = endCenter.y >= startCenter.y
    ? { startSide: 'bottom' as const, endSide: 'top' as const }
    : { startSide: 'top' as const, endSide: 'bottom' as const };
  const preferredPair = preferredStartSide === undefined && preferredEndSide === undefined
    ? []
    : [{
        startSide: preferredStartSide ?? oppositeSide(preferredEndSide as ConnectorRouteSide),
        endSide: preferredEndSide ?? oppositeSide(preferredStartSide as ConnectorRouteSide),
      }];
  const dominantPairs = Math.abs(endCenter.x - startCenter.x) >= Math.abs(endCenter.y - startCenter.y)
    ? [horizontalPair, verticalPair]
    : [verticalPair, horizontalPair];
  const fallbackPairs: { startSide: ConnectorRouteSide; endSide: ConnectorRouteSide }[] = [
    { startSide: 'right', endSide: 'right' },
    { startSide: 'right', endSide: 'left' },
    { startSide: 'right', endSide: 'top' },
    { startSide: 'right', endSide: 'bottom' },
    { startSide: 'left', endSide: 'right' },
    { startSide: 'left', endSide: 'left' },
    { startSide: 'left', endSide: 'top' },
    { startSide: 'left', endSide: 'bottom' },
    { startSide: 'top', endSide: 'top' },
    { startSide: 'top', endSide: 'bottom' },
    { startSide: 'top', endSide: 'left' },
    { startSide: 'top', endSide: 'right' },
    { startSide: 'bottom', endSide: 'bottom' },
    { startSide: 'bottom', endSide: 'top' },
    { startSide: 'bottom', endSide: 'left' },
    { startSide: 'bottom', endSide: 'right' },
  ];
  const seen = new Set<string>();
  return [...preferredPair, ...dominantPairs, ...fallbackPairs].filter((pair) => {
    const key = `${pair.startSide}:${pair.endSide}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getPreferencePenalty(
  pair: { startSide: ConnectorRouteSide; endSide: ConnectorRouteSide },
  preferredStartSide?: ConnectorRouteSide,
  preferredEndSide?: ConnectorRouteSide,
): number {
  let penalty = 0;
  if (preferredStartSide !== undefined && pair.startSide !== preferredStartSide) {
    penalty += 10000;
  }
  if (preferredEndSide !== undefined && pair.endSide !== preferredEndSide) {
    penalty += 10000;
  }
  return penalty;
}

function boundaryPoint(rect: RectLike, side: ConnectorRouteSide): Point {
  const center = centerOf(rect);
  if (side === 'left') {
    return { x: rect.x, y: center.y };
  }
  if (side === 'right') {
    return { x: rect.x + rect.width, y: center.y };
  }
  if (side === 'top') {
    return { x: center.x, y: rect.y };
  }
  return { x: center.x, y: rect.y + rect.height };
}

function leadPoint(point: Point, side: ConnectorRouteSide, gap: number): Point {
  const vector = sideVector(side);
  return {
    x: point.x + vector.x * gap,
    y: point.y + vector.y * gap,
  };
}

function sideVector(side: ConnectorRouteSide): Point {
  if (side === 'left') {
    return { x: -1, y: 0 };
  }
  if (side === 'right') {
    return { x: 1, y: 0 };
  }
  if (side === 'top') {
    return { x: 0, y: -1 };
  }
  return { x: 0, y: 1 };
}

function oppositeSide(side: ConnectorRouteSide): ConnectorRouteSide {
  if (side === 'left') {
    return 'right';
  }
  if (side === 'right') {
    return 'left';
  }
  if (side === 'top') {
    return 'bottom';
  }
  return 'top';
}

function getHorizontalLaneValues(
  start: RectLike,
  end: RectLike,
  obstacles: RectLike[],
  relevantBounds: RectLike,
): number[] {
  return uniqueNumbers([
    centerOf(start).y,
    centerOf(end).y,
    start.y - CONNECTOR_ROUTE_PADDING,
    start.y + start.height + CONNECTOR_ROUTE_PADDING,
    end.y - CONNECTOR_ROUTE_PADDING,
    end.y + end.height + CONNECTOR_ROUTE_PADDING,
    relevantBounds.y - CONNECTOR_ROUTE_PADDING,
    relevantBounds.y + relevantBounds.height + CONNECTOR_ROUTE_PADDING,
    ...obstacles.flatMap((obstacle) => [
      obstacle.y - CONNECTOR_ROUTE_PADDING,
      obstacle.y + obstacle.height + CONNECTOR_ROUTE_PADDING,
    ]),
  ]);
}

function getVerticalLaneValues(
  start: RectLike,
  end: RectLike,
  obstacles: RectLike[],
  relevantBounds: RectLike,
): number[] {
  return uniqueNumbers([
    centerOf(start).x,
    centerOf(end).x,
    start.x - CONNECTOR_ROUTE_PADDING,
    start.x + start.width + CONNECTOR_ROUTE_PADDING,
    end.x - CONNECTOR_ROUTE_PADDING,
    end.x + end.width + CONNECTOR_ROUTE_PADDING,
    relevantBounds.x - CONNECTOR_ROUTE_PADDING,
    relevantBounds.x + relevantBounds.width + CONNECTOR_ROUTE_PADDING,
    ...obstacles.flatMap((obstacle) => [
      obstacle.x - CONNECTOR_ROUTE_PADDING,
      obstacle.x + obstacle.width + CONNECTOR_ROUTE_PADDING,
    ]),
  ]);
}

export function routeIntersectsObstacles(points: Point[], obstacles: RectLike[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (obstacles.some((obstacle) => segmentIntersectsRect(points[index], points[index + 1], obstacle))) {
      return true;
    }
  }
  return false;
}

function getRouteSegments(points: Point[]): ConnectorRouteSegment[] {
  const compactedPoints = compactPoints(points);
  const segments: ConnectorRouteSegment[] = [];
  for (let index = 0; index < compactedPoints.length - 1; index += 1) {
    const start = compactedPoints[index];
    const end = compactedPoints[index + 1];
    segments.push({
      end,
      index,
      length: distance(start, end),
      start,
    });
  }
  return segments;
}

export function getFinalRouteSegment(points: Point[]): ConnectorRouteSegment | null {
  const segments = getRouteSegments(points);
  return segments.length === 0 ? null : segments[segments.length - 1];
}

export function getIncomingSide(segment: ConnectorRouteSegment): ConnectorRouteSide | null {
  const deltaX = segment.end.x - segment.start.x;
  const deltaY = segment.end.y - segment.start.y;
  if (Math.abs(deltaX) >= ROUTE_EPSILON && Math.abs(deltaY) >= ROUTE_EPSILON) {
    return null;
  }
  if (deltaX > ROUTE_EPSILON) {
    return 'left';
  }
  if (deltaX < -ROUTE_EPSILON) {
    return 'right';
  }
  if (deltaY > ROUTE_EPSILON) {
    return 'top';
  }
  if (deltaY < -ROUTE_EPSILON) {
    return 'bottom';
  }
  return null;
}

function getRouteCenterPoint(points: Point[]): Point {
  const segments = getRouteSegments(points);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remainingLength = totalLength / 2;

  for (const segment of segments) {
    if (remainingLength <= segment.length) {
      const ratio = segment.length < ROUTE_EPSILON ? 0 : remainingLength / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remainingLength -= segment.length;
  }

  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function segmentMidpoint(segment: ConnectorRouteSegment): Point {
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) / 2,
    y: segment.start.y + (segment.end.y - segment.start.y) / 2,
  };
}

function segmentMatches(first: ConnectorRouteSegment | undefined, second: ConnectorRouteSegment | undefined): boolean {
  if (first === undefined || second === undefined) {
    return false;
  }
  return pointsEqual(first.start, second.start) && pointsEqual(first.end, second.end);
}

function pointsEqual(first: Point, second: Point): boolean {
  return Math.abs(first.x - second.x) < ROUTE_EPSILON && Math.abs(first.y - second.y) < ROUTE_EPSILON;
}

function routeIntersectsEndpointInteriors(points: Point[], endpoints: RectLike[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (endpoints.some((endpoint) => segmentIntersectsRectInterior(points[index], points[index + 1], endpoint))) {
      return true;
    }
  }
  return false;
}

function segmentIntersectsRect(start: Point, end: Point, rect: RectLike): boolean {
  if (Math.abs(start.y - end.y) < ROUTE_EPSILON) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return start.y >= rect.y && start.y <= rect.y + rect.height && maxX >= rect.x && minX <= rect.x + rect.width;
  }

  if (Math.abs(start.x - end.x) < ROUTE_EPSILON) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return start.x >= rect.x && start.x <= rect.x + rect.width && maxY >= rect.y && minY <= rect.y + rect.height;
  }

  return true;
}

function segmentIntersectsRectInterior(start: Point, end: Point, rect: RectLike): boolean {
  if (Math.abs(start.y - end.y) < ROUTE_EPSILON) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return (
      start.y > rect.y + ROUTE_EPSILON &&
      start.y < rect.y + rect.height - ROUTE_EPSILON &&
      maxX > rect.x + ROUTE_EPSILON &&
      minX < rect.x + rect.width - ROUTE_EPSILON
    );
  }

  if (Math.abs(start.x - end.x) < ROUTE_EPSILON) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return (
      start.x > rect.x + ROUTE_EPSILON &&
      start.x < rect.x + rect.width - ROUTE_EPSILON &&
      maxY > rect.y + ROUTE_EPSILON &&
      minY < rect.y + rect.height - ROUTE_EPSILON
    );
  }

  return true;
}

function scoreRoute(points: Point[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += distance(points[index], points[index + 1]);
  }
  return length + Math.max(0, points.length - 2) * 8;
}

function expandRect(rect: RectLike, padding: number): RectLike {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function compactPoints(points: Point[]): Point[] {
  const compacted: Point[] = [];
  points.forEach((point) => {
    const previous = compacted[compacted.length - 1];
    if (previous === undefined || distance(previous, point) >= 0.001) {
      compacted.push(point);
    }
  });
  return compacted;
}

function centerOf(rect: RectLike): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function distance(start: Point, end: Point): number {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

function uniqueNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  const unique: number[] = [];
  values.forEach((value) => {
    const rounded = Number(value.toFixed(2));
    if (!seen.has(rounded)) {
      seen.add(rounded);
      unique.push(rounded);
    }
  });
  return unique;
}

function rectsOverlap(first: RectLike, second: RectLike): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

export function segmentKey(segment: ConnectorRouteSegment): string {
  return `${pointKey(segment.start)}->${pointKey(segment.end)}`;
}

export function undirectedSegmentKey(segment: ConnectorRouteSegment): string {
  const endpoints = [pointKey(segment.start), pointKey(segment.end)].sort();
  return `${endpoints[0]}--${endpoints[1]}`;
}

function pointKey(point: Point): string {
  return `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
}

function groupBy<T>(items: T[], keyForItem: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyForItem(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });
  return groups;
}
