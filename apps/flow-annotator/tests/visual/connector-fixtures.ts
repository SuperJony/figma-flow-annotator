import {
  buildConnectorVisualModel,
  type ConnectorVisualModel,
} from '../../connect';
import { routeOrthogonalConnector } from '../../../../packages/core/src/index';

interface FixtureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ConnectorFixtureDefinition {
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
}

const SCENE_PADDING = 32;

export const connectorFixtureDefinitions: ConnectorFixtureDefinition[] = [
  {
    description: 'Orthogonal rightward connector with an arrowhead entering the endpoint boundary.',
    end: { x: 430, y: 84, width: 120, height: 86 },
    flowAction: '',
    name: 'orthogonal-arrow',
    obstacles: [],
    start: { x: 70, y: 60, width: 120, height: 86 },
  },
  {
    description: 'Connector routes around a card and centers the Flow Action label on the longest segment.',
    end: { x: 430, y: 230, width: 120, height: 86 },
    flowAction: 'Approve scope',
    name: 'flow-action-label',
    obstacles: [
      { x: 246, y: 220, width: 120, height: 96 },
    ],
    start: { x: 70, y: 230, width: 120, height: 86 },
  },
];

export function buildConnectorFixture(definition: ConnectorFixtureDefinition): ConnectorFixture {
  const routePoints = routeOrthogonalConnector({
    startRect: definition.start,
    endRect: definition.end,
    obstacles: definition.obstacles.map((obstacle, index) => ({
      id: `fixture-obstacle-${index + 1}`,
      kind: 'annotation-card',
      rect: obstacle,
    })),
  }).points;
  const visual = buildConnectorVisualModel(routePoints, definition.flowAction);
  return {
    definition,
    html: renderConnectorFixture(definition, routePoints, visual),
    routePoints,
    visual,
  };
}

function renderConnectorFixture(
  definition: ConnectorFixtureDefinition,
  routePoints: Array<{ x: number; y: number }>,
  visual: ConnectorVisualModel,
): string {
  const sceneBounds = calculateSceneBounds(definition, visual);
  const routeLeft = visual.route.bounds.x - sceneBounds.x;
  const routeTop = visual.route.bounds.y - sceneBounds.y;
  const endpointHtml = [
    renderEndpoint('Start', definition.start, sceneBounds),
    renderEndpoint('End', definition.end, sceneBounds),
  ].join('');
  const obstacleHtml = definition.obstacles
    .map((obstacle) => renderObstacle(obstacle, sceneBounds))
    .join('');
  const labelHtml = visual.label === null
    ? ''
    : `<div class="flow-action-label" style="left:${visual.label.center.x - sceneBounds.x}px;top:${visual.label.center.y - sceneBounds.y}px;min-width:${visual.label.minWidth}px;min-height:${visual.label.minHeight}px;max-width:${visual.label.maxTextWidth}px;padding:${visual.label.paddingY}px ${visual.label.paddingX}px;border-radius:${visual.label.radius}px;border-color:${visual.label.stroke};background:${visual.label.fill};color:${visual.label.textColor};font-size:${visual.label.fontSize}px;">${escapeHtml(visual.label.text)}</div>`;
  const routePointsJson = escapeHtml(JSON.stringify(routePoints));

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

      .route-layer {
        left: ${routeLeft}px;
        top: ${routeTop}px;
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
      <div class="route-layer">${visual.route.svg}</div>
      ${labelHtml}
      ${endpointHtml}
    </main>
  </body>
</html>`;
}

function calculateSceneBounds(definition: ConnectorFixtureDefinition, visual: ConnectorVisualModel): FixtureRect {
  const rects = [
    definition.start,
    definition.end,
    ...definition.obstacles,
    visual.route.bounds,
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

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;',
  };
  return value.replace(/[&"'<>]/g, (character) => entities[character]);
}
