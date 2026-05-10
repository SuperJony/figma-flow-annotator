import type { Point, RectLike } from "../shared/geometry.ts";
import { unionRects } from "../shared/geometry.ts";
import type { ConnectorRouteSegment, ConnectorRouteSide } from "./routing.ts";

const ROUTE_EPSILON = 0.001;

export function buildRouteCandidates(input: {
  start: RectLike;
  end: RectLike;
  obstacles: RectLike[];
  endpointGap: number;
  routePadding: number;
  preferredStartSide?: ConnectorRouteSide;
  preferredEndSide?: ConnectorRouteSide;
}): { points: Point[]; preferencePenalty: number }[] {
  const sidePairs = getRouteSidePairs(
    input.start,
    input.end,
    input.preferredStartSide,
    input.preferredEndSide,
  );
  const bounds = unionRects([input.start, input.end, ...input.obstacles]);
  const laneXs = getVerticalLaneValues(
    input.start,
    input.end,
    input.obstacles,
    bounds,
    input.routePadding,
  );
  const laneYs = getHorizontalLaneValues(
    input.start,
    input.end,
    input.obstacles,
    bounds,
    input.routePadding,
  );
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

export function routeIntersectsObstacles(points: Point[], obstacles: RectLike[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (
      obstacles.some((obstacle) =>
        segmentIntersectsRect(points[index], points[index + 1], obstacle),
      )
    ) {
      return true;
    }
  }
  return false;
}

export function getRouteSegments(points: Point[]): ConnectorRouteSegment[] {
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
    return "left";
  }
  if (deltaX < -ROUTE_EPSILON) {
    return "right";
  }
  if (deltaY > ROUTE_EPSILON) {
    return "top";
  }
  if (deltaY < -ROUTE_EPSILON) {
    return "bottom";
  }
  return null;
}

export function getRouteCenterPoint(points: Point[]): Point {
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

export function segmentMidpoint(segment: ConnectorRouteSegment): Point {
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) / 2,
    y: segment.start.y + (segment.end.y - segment.start.y) / 2,
  };
}

export function segmentMatches(
  first: ConnectorRouteSegment | undefined,
  second: ConnectorRouteSegment | undefined,
): boolean {
  if (first === undefined || second === undefined) {
    return false;
  }
  return pointsEqual(first.start, second.start) && pointsEqual(first.end, second.end);
}

export function routeIntersectsEndpointInteriors(points: Point[], endpoints: RectLike[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (
      endpoints.some((endpoint) =>
        segmentIntersectsRectInterior(points[index], points[index + 1], endpoint),
      )
    ) {
      return true;
    }
  }
  return false;
}

export function segmentIntersectsRect(start: Point, end: Point, rect: RectLike): boolean {
  if (Math.abs(start.y - end.y) < ROUTE_EPSILON) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return (
      start.y >= rect.y &&
      start.y <= rect.y + rect.height &&
      maxX >= rect.x &&
      minX <= rect.x + rect.width
    );
  }

  if (Math.abs(start.x - end.x) < ROUTE_EPSILON) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return (
      start.x >= rect.x &&
      start.x <= rect.x + rect.width &&
      maxY >= rect.y &&
      minY <= rect.y + rect.height
    );
  }

  return true;
}

export function scoreRoute(points: Point[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += distance(points[index], points[index + 1]);
  }
  return length + Math.max(0, points.length - 2) * 8;
}

export function expandRect(rect: RectLike, padding: number): RectLike {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function compactPoints(points: Point[]): Point[] {
  const compacted: Point[] = [];
  points.forEach((point) => {
    const previous = compacted[compacted.length - 1];
    if (previous === undefined || distance(previous, point) >= 0.001) {
      compacted.push(point);
    }
  });
  return compacted;
}

export function distance(start: Point, end: Point): number {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

export function segmentKey(segment: ConnectorRouteSegment): string {
  return `${pointKey(segment.start)}->${pointKey(segment.end)}`;
}

export function undirectedSegmentKey(segment: ConnectorRouteSegment): string {
  const endpoints = [pointKey(segment.start), pointKey(segment.end)].sort();
  return `${endpoints[0]}--${endpoints[1]}`;
}

export function groupBy<T>(items: T[], keyForItem: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyForItem(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });
  return groups;
}

function getRouteSidePairs(
  start: RectLike,
  end: RectLike,
  preferredStartSide?: ConnectorRouteSide,
  preferredEndSide?: ConnectorRouteSide,
): { startSide: ConnectorRouteSide; endSide: ConnectorRouteSide }[] {
  const startCenter = centerOf(start);
  const endCenter = centerOf(end);
  const horizontalPair =
    endCenter.x >= startCenter.x
      ? { startSide: "right" as const, endSide: "left" as const }
      : { startSide: "left" as const, endSide: "right" as const };
  const verticalPair =
    endCenter.y >= startCenter.y
      ? { startSide: "bottom" as const, endSide: "top" as const }
      : { startSide: "top" as const, endSide: "bottom" as const };
  const preferredPair =
    preferredStartSide === undefined && preferredEndSide === undefined
      ? []
      : [
          {
            startSide: preferredStartSide ?? oppositeSide(preferredEndSide as ConnectorRouteSide),
            endSide: preferredEndSide ?? oppositeSide(preferredStartSide as ConnectorRouteSide),
          },
        ];
  const dominantPairs =
    Math.abs(endCenter.x - startCenter.x) >= Math.abs(endCenter.y - startCenter.y)
      ? [horizontalPair, verticalPair]
      : [verticalPair, horizontalPair];
  const fallbackPairs: { startSide: ConnectorRouteSide; endSide: ConnectorRouteSide }[] = [
    { startSide: "right", endSide: "right" },
    { startSide: "right", endSide: "left" },
    { startSide: "right", endSide: "top" },
    { startSide: "right", endSide: "bottom" },
    { startSide: "left", endSide: "right" },
    { startSide: "left", endSide: "left" },
    { startSide: "left", endSide: "top" },
    { startSide: "left", endSide: "bottom" },
    { startSide: "top", endSide: "top" },
    { startSide: "top", endSide: "bottom" },
    { startSide: "top", endSide: "left" },
    { startSide: "top", endSide: "right" },
    { startSide: "bottom", endSide: "bottom" },
    { startSide: "bottom", endSide: "top" },
    { startSide: "bottom", endSide: "left" },
    { startSide: "bottom", endSide: "right" },
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
  if (side === "left") {
    return { x: rect.x, y: center.y };
  }
  if (side === "right") {
    return { x: rect.x + rect.width, y: center.y };
  }
  if (side === "top") {
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
  if (side === "left") {
    return { x: -1, y: 0 };
  }
  if (side === "right") {
    return { x: 1, y: 0 };
  }
  if (side === "top") {
    return { x: 0, y: -1 };
  }
  return { x: 0, y: 1 };
}

function oppositeSide(side: ConnectorRouteSide): ConnectorRouteSide {
  if (side === "left") {
    return "right";
  }
  if (side === "right") {
    return "left";
  }
  if (side === "top") {
    return "bottom";
  }
  return "top";
}

function getHorizontalLaneValues(
  start: RectLike,
  end: RectLike,
  obstacles: RectLike[],
  relevantBounds: RectLike,
  routePadding: number,
): number[] {
  return uniqueNumbers([
    centerOf(start).y,
    centerOf(end).y,
    start.y - routePadding,
    start.y + start.height + routePadding,
    end.y - routePadding,
    end.y + end.height + routePadding,
    relevantBounds.y - routePadding,
    relevantBounds.y + relevantBounds.height + routePadding,
    ...obstacles.flatMap((obstacle) => [
      obstacle.y - routePadding,
      obstacle.y + obstacle.height + routePadding,
    ]),
  ]);
}

function getVerticalLaneValues(
  start: RectLike,
  end: RectLike,
  obstacles: RectLike[],
  relevantBounds: RectLike,
  routePadding: number,
): number[] {
  return uniqueNumbers([
    centerOf(start).x,
    centerOf(end).x,
    start.x - routePadding,
    start.x + start.width + routePadding,
    end.x - routePadding,
    end.x + end.width + routePadding,
    relevantBounds.x - routePadding,
    relevantBounds.x + relevantBounds.width + routePadding,
    ...obstacles.flatMap((obstacle) => [
      obstacle.x - routePadding,
      obstacle.x + obstacle.width + routePadding,
    ]),
  ]);
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

function pointsEqual(first: Point, second: Point): boolean {
  return (
    Math.abs(first.x - second.x) < ROUTE_EPSILON && Math.abs(first.y - second.y) < ROUTE_EPSILON
  );
}

function centerOf(rect: RectLike): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
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

function pointKey(point: Point): string {
  return `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
}
