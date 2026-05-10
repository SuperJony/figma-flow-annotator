import type { Point, RectLike } from "../shared/geometry.ts";
import { unionRects } from "../shared/geometry.ts";
import type { ConnectorObstacle, ConnectorRouteSegment } from "./routing.ts";
import { placeFlowActionLabel } from "./routing.ts";

export interface ConnectorRouteVisualModel {
  bounds: RectLike;
  height: number;
  svg: string;
  width: number;
}

export interface FlowActionLabelVisualModel {
  center: Point;
  fill: string;
  fontSize: number;
  maxTextWidth: number;
  minHeight: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  radius: number;
  stroke: string;
  text: string;
  textColor: string;
}

export interface FlowConnectorVisualModel {
  label: FlowActionLabelVisualModel | null;
  route: ConnectorRouteVisualModel;
  trunkSegment: ConnectorRouteSegment | null;
}

export interface BuildFlowConnectorVisualModelInput {
  flowAction: string;
  obstacles?: ConnectorObstacle[];
  routePoints: Point[];
  sharedTrunkSegment?: ConnectorRouteSegment;
}

const CONNECTOR_THICKNESS = 4;
const CONNECTOR_ARROW_LENGTH = 18;
const CONNECTOR_ARROW_WIDTH = 16;
const CONNECTOR_COLOR = "#1F3A5A";
const FLOW_ACTION_LABEL_FILL = "#FAF2C7";
const FLOW_ACTION_LABEL_STROKE = "#B88A21";
const FLOW_ACTION_LABEL_TEXT = "#172438";
const FLOW_ACTION_LABEL_FONT_SIZE = 11;
const FLOW_ACTION_LABEL_PADDING_X = 10;
const FLOW_ACTION_LABEL_PADDING_Y = 6;
const FLOW_ACTION_LABEL_MIN_WIDTH = 56;
const FLOW_ACTION_LABEL_MIN_HEIGHT = 28;
const FLOW_ACTION_LABEL_MAX_BROWSER_TEXT_WIDTH = 160;
const FLOW_ACTION_LABEL_RADIUS = 6;

export function buildFlowConnectorVisualModel(
  input: BuildFlowConnectorVisualModelInput,
): FlowConnectorVisualModel {
  const distinctPoints = compactPoints(input.routePoints);
  if (distinctPoints.length < 2) {
    throw new Error("Connector route requires at least two points.");
  }

  const drawing = buildConnectorDrawing(distinctPoints);
  const allPoints = [...drawing.pathPoints, ...drawing.arrowPoints];
  const bounds = expandRect(unionRects(pointsToRects(allPoints)), CONNECTOR_THICKNESS + 2);
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const pathData = toSvgPathData(drawing.pathPoints, bounds);
  const arrowData = toSvgPolygonData(drawing.arrowPoints, bounds);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${pathData}" fill="none" stroke="${CONNECTOR_COLOR}" stroke-width="${CONNECTOR_THICKNESS}" stroke-linecap="round" stroke-linejoin="round"/><path d="${arrowData}" fill="${CONNECTOR_COLOR}"/></svg>`;
  const trimmedFlowAction = input.flowAction.trim();

  return {
    label:
      trimmedFlowAction.length > 0
        ? buildFlowActionLabelVisual({
            flowAction: trimmedFlowAction,
            obstacles: input.obstacles,
            routePoints: distinctPoints,
            sharedTrunkSegment: input.sharedTrunkSegment,
          })
        : null,
    route: {
      bounds,
      height,
      svg,
      width,
    },
    trunkSegment: input.sharedTrunkSegment ?? null,
  };
}

function buildFlowActionLabelVisual(input: {
  flowAction: string;
  obstacles?: ConnectorObstacle[];
  routePoints: Point[];
  sharedTrunkSegment?: ConnectorRouteSegment;
}): FlowActionLabelVisualModel | null {
  const placement = placeFlowActionLabel({
    flowAction: input.flowAction,
    obstacles: input.obstacles,
    routePoints: input.routePoints,
    sharedTrunkSegment: input.sharedTrunkSegment,
  });
  if (placement === null) {
    return null;
  }

  return {
    center: placement.center,
    fill: FLOW_ACTION_LABEL_FILL,
    fontSize: FLOW_ACTION_LABEL_FONT_SIZE,
    maxTextWidth: FLOW_ACTION_LABEL_MAX_BROWSER_TEXT_WIDTH,
    minHeight: FLOW_ACTION_LABEL_MIN_HEIGHT,
    minWidth: FLOW_ACTION_LABEL_MIN_WIDTH,
    paddingX: FLOW_ACTION_LABEL_PADDING_X,
    paddingY: FLOW_ACTION_LABEL_PADDING_Y,
    radius: FLOW_ACTION_LABEL_RADIUS,
    stroke: FLOW_ACTION_LABEL_STROKE,
    text: input.flowAction,
    textColor: FLOW_ACTION_LABEL_TEXT,
  };
}

function buildConnectorDrawing(points: Point[]): { arrowPoints: Point[]; pathPoints: Point[] } {
  const tip = points[points.length - 1];
  const previous = points[points.length - 2];
  const direction = normalize({
    x: tip.x - previous.x,
    y: tip.y - previous.y,
  });
  const baseCenter = {
    x: tip.x - direction.x * CONNECTOR_ARROW_LENGTH,
    y: tip.y - direction.y * CONNECTOR_ARROW_LENGTH,
  };
  const perpendicular = {
    x: -direction.y,
    y: direction.x,
  };
  const arrowHalfWidth = CONNECTOR_ARROW_WIDTH / 2;
  return {
    arrowPoints: [
      tip,
      {
        x: baseCenter.x + perpendicular.x * arrowHalfWidth,
        y: baseCenter.y + perpendicular.y * arrowHalfWidth,
      },
      {
        x: baseCenter.x - perpendicular.x * arrowHalfWidth,
        y: baseCenter.y - perpendicular.y * arrowHalfWidth,
      },
    ],
    pathPoints: [...points.slice(0, -1), baseCenter],
  };
}

function pointsToRects(points: Point[]): RectLike[] {
  return points.map((point) => ({
    x: point.x,
    y: point.y,
    width: 0,
    height: 0,
  }));
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

function distance(start: Point, end: Point): number {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

function normalize(vector: Point): Point {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length < 0.001) {
    return { x: 1, y: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function toSvgPathData(points: Point[], bounds: RectLike): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${formatNumber(point.x - bounds.x)} ${formatNumber(point.y - bounds.y)}`;
    })
    .join(" ");
}

function toSvgPolygonData(points: Point[], bounds: RectLike): string {
  return `${toSvgPathData(points, bounds)} Z`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}
