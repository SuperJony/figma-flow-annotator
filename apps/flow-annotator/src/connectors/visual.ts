import type {
  ConnectorRouteVisualModel,
  FlowActionLabelVisualModel,
  FlowConnectorVisualModel,
} from "@figma-flow-annotator/core";

interface ConnectorVisualRuntime {
  createText(
    name: string,
    characters: string,
    fontSize: number,
    fills: SolidPaint,
    width: number,
  ): TextNode;
}

export function createConnectorVisualNodes(
  visual: FlowConnectorVisualModel,
  runtime: ConnectorVisualRuntime,
): SceneNode[] {
  const nodes: SceneNode[] = [createConnectorRouteSvg(visual.route)];

  if (visual.label !== null) {
    nodes.push(createFlowActionLabel(visual.label, runtime));
  }

  return nodes;
}

function createConnectorRouteSvg(visual: ConnectorRouteVisualModel): FrameNode {
  const route = figma.createNodeFromSvg(visual.svg);
  route.name = "FFA Connector Route";
  route.x = visual.bounds.x;
  route.y = visual.bounds.y;
  route.clipsContent = false;
  return route;
}

function createFlowActionLabel(
  visual: FlowActionLabelVisualModel,
  runtime: ConnectorVisualRuntime,
): FrameNode {
  const label = figma.createFrame();
  const text = runtime.createText(
    "Flow Action",
    visual.text,
    visual.fontSize,
    hexToSolidPaint(visual.textColor),
    visual.maxTextWidth,
  );
  text.textAutoResize = "WIDTH_AND_HEIGHT";

  label.name = "FFA Flow Action Label";
  label.fills = [hexToSolidPaint(visual.fill)];
  label.strokes = [hexToSolidPaint(visual.stroke)];
  label.strokeWeight = 1;
  label.cornerRadius = visual.radius;
  label.clipsContent = false;
  label.resize(
    Math.max(visual.minWidth, text.width + visual.paddingX * 2),
    Math.max(visual.minHeight, text.height + visual.paddingY * 2),
  );
  label.x = visual.center.x - label.width / 2;
  label.y = visual.center.y - label.height / 2;

  label.appendChild(text);
  text.x = visual.paddingX;
  text.y = visual.paddingY;

  return label;
}

function hexToSolidPaint(hex: string): SolidPaint {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return {
    type: "SOLID",
    color: {
      r: red,
      g: green,
      b: blue,
    },
  };
}
