import {
  createFlowConnectorRecord,
  groupConnectorTrunks,
  routeOrthogonalConnector,
} from "@figma-flow-annotator/core";
import {
  buildConnectorVisualModel,
  type ConnectorVisualModel,
} from "../../../src/connectors/visual";

interface FixtureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ConnectorFixtureDefinition {
  additionalConnectors?: Array<{
    end: FixtureRect;
    flowAction: string;
    start: FixtureRect;
  }>;
  description: string;
  end: FixtureRect;
  flowAction: string;
  name: string;
  obstacles: FixtureRect[];
  start: FixtureRect;
}

interface ConnectorFixture {
  definition: ConnectorFixtureDefinition;
  html: string;
  routePoints: Array<{ x: number; y: number }>;
  visual: ConnectorVisualModel;
  visuals: ConnectorVisualModel[];
}

const SCENE_PADDING = 32;

export const connectorFixtureDefinitions: ConnectorFixtureDefinition[] = [
  {
    description: "Orthogonal rightward connector with an arrowhead entering the endpoint boundary.",
    end: { x: 430, y: 84, width: 120, height: 86 },
    flowAction: "",
    name: "orthogonal-arrow",
    obstacles: [],
    start: { x: 70, y: 60, width: 120, height: 86 },
  },
  {
    description:
      "Connector routes around a card and centers the Flow Action label on the longest segment.",
    end: { x: 430, y: 230, width: 120, height: 86 },
    flowAction: "Approve scope",
    name: "flow-action-label",
    obstacles: [{ x: 246, y: 220, width: 120, height: 96 }],
    start: { x: 70, y: 230, width: 120, height: 86 },
  },
  {
    additionalConnectors: [
      {
        end: { x: 500, y: 200, width: 120, height: 86 },
        flowAction: "Choose B",
        start: { x: 70, y: 318, width: 120, height: 86 },
      },
    ],
    description:
      "Two Flow Connectors share the final Connector Trunk and keep labels on branch segments.",
    end: { x: 500, y: 200, width: 120, height: 86 },
    flowAction: "Choose A",
    name: "connector-trunk",
    obstacles: [],
    start: { x: 70, y: 82, width: 120, height: 86 },
  },
];

export function buildConnectorFixture(definition: ConnectorFixtureDefinition): ConnectorFixture {
  const connectorDefinitions = [
    { start: definition.start, end: definition.end, flowAction: definition.flowAction },
    ...(definition.additionalConnectors ?? []),
  ];
  const obstacles = definition.obstacles.map((obstacle, index) => ({
    id: `fixture-obstacle-${index + 1}`,
    kind: "annotation-card" as const,
    rect: obstacle,
  }));
  const routePointSets = connectorDefinitions.map(
    (connector) =>
      routeOrthogonalConnector({
        startRect: connector.start,
        endRect: connector.end,
        obstacles,
      }).points,
  );
  const connectorRecords = connectorDefinitions.map((connector, index) =>
    createFlowConnectorRecord({
      connectorId: `fixture-connector-${index + 1}`,
      end: {
        contextFrameId: `fixture-end-${index + 1}`,
        nodeId: rectsEqual(connector.end, definition.end)
          ? "fixture-end-main"
          : `fixture-end-${index + 1}`,
      },
      flowAction: connector.flowAction,
      now: "2026-05-09T00:00:00.000Z",
      ownerContextFrameId: `fixture-start-${index + 1}`,
      routePoints: routePointSets[index],
      start: { contextFrameId: `fixture-start-${index + 1}`, nodeId: `fixture-start-${index + 1}` },
    }),
  );
  const trunkAssignments = new Map(
    groupConnectorTrunks({
      connectors: connectorRecords.map((record) => ({ record })),
    }).assignments.map((assignment) => [assignment.connectorId, assignment]),
  );
  const visuals = connectorDefinitions.map((connector, index) =>
    buildConnectorVisualModel(routePointSets[index], connector.flowAction, {
      obstacles,
      sharedTrunkSegment: trunkAssignments.get(connectorRecords[index].id)?.segment,
    }),
  );
  const routePoints = routePointSets[0];
  const visual = visuals[0];
  return {
    definition,
    html: renderConnectorFixture(definition, routePointSets, visuals),
    routePoints,
    visual,
    visuals,
  };
}

function renderConnectorFixture(
  definition: ConnectorFixtureDefinition,
  routePointSets: Array<Array<{ x: number; y: number }>>,
  visuals: ConnectorVisualModel[],
): string {
  const sceneBounds = calculateSceneBounds(definition, visuals);
  const connectorDefinitions = [
    { start: definition.start, end: definition.end },
    ...(definition.additionalConnectors ?? []),
  ];
  const routeHtml = visuals
    .map((visual) => {
      const routeLeft = visual.route.bounds.x - sceneBounds.x;
      const routeTop = visual.route.bounds.y - sceneBounds.y;
      return `<div class="route-layer" style="left:${routeLeft}px;top:${routeTop}px;">${visual.route.svg}</div>`;
    })
    .join("");
  const endpointHtml = [
    ...connectorDefinitions.map((connector, index) =>
      renderEndpoint(
        connectorDefinitions.length === 1 ? "Start" : `Start ${index + 1}`,
        connector.start,
        sceneBounds,
      ),
    ),
    renderEndpoint("End", definition.end, sceneBounds),
  ].join("");
  const obstacleHtml = definition.obstacles
    .map((obstacle) => renderObstacle(obstacle, sceneBounds))
    .join("");
  const labelHtml = visuals
    .map((visual) =>
      visual.label === null
        ? ""
        : `<div class="flow-action-label" style="left:${visual.label.center.x - sceneBounds.x}px;top:${visual.label.center.y - sceneBounds.y}px;min-width:${visual.label.minWidth}px;min-height:${visual.label.minHeight}px;max-width:${visual.label.maxTextWidth}px;padding:${visual.label.paddingY}px ${visual.label.paddingX}px;border-radius:${visual.label.radius}px;border-color:${visual.label.stroke};background:${visual.label.fill};color:${visual.label.textColor};font-size:${visual.label.fontSize}px;">${escapeHtml(visual.label.text)}</div>`,
    )
    .join("");
  const routePointsJson = escapeHtml(JSON.stringify(routePointSets));

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
        background: #f4f6f8;
        font-family: Arial, Helvetica, sans-serif;
      }

      body {
        padding: 20px;
      }

      .scene {
        position: relative;
        width: ${sceneBounds.width}px;
        height: ${sceneBounds.height}px;
        overflow: hidden;
        background:
          linear-gradient(#e2e8f0 1px, transparent 1px),
          linear-gradient(90deg, #e2e8f0 1px, transparent 1px),
          #ffffff;
        background-size: 24px 24px;
        border: 1px solid #cbd5e1;
      }

      .endpoint,
      .obstacle,
      .route-layer,
      .flow-action-label {
        position: absolute;
      }

      .endpoint {
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #64748b;
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        font-weight: 700;
      }

      .obstacle {
        border: 1px dashed #d97706;
        background: rgba(251, 191, 36, 0.2);
      }

      .route-layer svg {
        display: block;
      }

      .flow-action-label {
        transform: translate(-50%, -50%);
        border: 1px solid;
        line-height: 16px;
        white-space: normal;
        text-align: center;
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
      }
    </style>
  </head>
  <body>
    <main aria-label="${escapeHtml(definition.description)}" class="scene" data-fixture="${definition.name}" data-route-points="${routePointsJson}">
      ${obstacleHtml}
      ${routeHtml}
      ${labelHtml}
      ${endpointHtml}
    </main>
  </body>
</html>`;
}

function calculateSceneBounds(
  definition: ConnectorFixtureDefinition,
  visuals: ConnectorVisualModel[],
): FixtureRect {
  const connectorDefinitions = [
    { start: definition.start, end: definition.end },
    ...(definition.additionalConnectors ?? []),
  ];
  const rects = [
    ...connectorDefinitions.flatMap((connector) => [connector.start, connector.end]),
    ...definition.obstacles,
    ...visuals.map((visual) => visual.route.bounds),
  ];
  const minX = Math.min(...rects.map((rect) => rect.x)) - SCENE_PADDING;
  const minY = Math.min(...rects.map((rect) => rect.y)) - SCENE_PADDING;
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width)) + SCENE_PADDING;
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height)) + SCENE_PADDING;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function renderEndpoint(label: string, rect: FixtureRect, sceneBounds: FixtureRect): string {
  return `<div class="endpoint" style="${rectStyle(rect, sceneBounds)}">${label}</div>`;
}

function renderObstacle(rect: FixtureRect, sceneBounds: FixtureRect): string {
  return `<div aria-hidden="true" class="obstacle" style="${rectStyle(rect, sceneBounds)}"></div>`;
}

function rectStyle(rect: FixtureRect, sceneBounds: FixtureRect): string {
  return `left:${rect.x - sceneBounds.x}px;top:${rect.y - sceneBounds.y}px;width:${rect.width}px;height:${rect.height}px;`;
}

function rectsEqual(first: FixtureRect, second: FixtureRect): boolean {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  );
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    '"': "&quot;",
    "'": "&#39;",
    "<": "&lt;",
    ">": "&gt;",
  };
  return value.replace(/[&"'<>]/g, (character) => entities[character]);
}
