import type {
  ConnectorRouteVisualModel,
  CreateFlowConnectorOperation,
  FlowActionLabelVisualModel,
  FlowConnectorRouteRenderPlan,
  FlowConnectorVisualModel,
  UpdateFlowConnectorOperation,
} from "@figma-flow-annotator/core";
import type { FigmaFileOperationWriter } from "../figma/file-operations";
import { CONNECTOR_ROUTE_NODE_NAME, FLOW_ACTION_LABEL_NODE_NAME } from "./visual-node-names";

interface FlowConnectorVisualWriterRuntime {
  createText(
    name: string,
    characters: string,
    fontSize: number,
    fills: SolidPaint,
    width: number,
  ): TextNode;
}

export function createFlowConnectorVisualWriter(
  runtime: FlowConnectorVisualWriterRuntime,
  existingNodes: Map<string, BaseNode>,
): FigmaFileOperationWriter {
  return {
    createFlowConnector: (operation) => createFlowConnectorRoot(operation, runtime),
    updateFlowConnector: (operation) =>
      updateFlowConnectorRoot(
        resolveFlowConnectorVisualRoot(operation.targetNodeId, existingNodes),
        operation,
        runtime,
      ),
  };
}

export function renderFlowConnectorVisuals(
  renderConnectors: FlowConnectorRouteRenderPlan[],
  connectorNodesById: Map<string, GroupNode>,
  runtime: FlowConnectorVisualWriterRuntime,
): void {
  renderConnectors.forEach((connector) => {
    const connectorRoot = connectorNodesById.get(connector.connectorNodeId);
    if (connectorRoot === undefined) {
      return;
    }
    const nextVisualNodes = createConnectorVisualNodes(connector.visual, runtime);
    replaceConnectorVisualNodes(connectorRoot, nextVisualNodes);
  });
}

export function resolveFlowConnectorVisualRoot(
  nodeId: string,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  const node = existingNodes.get(nodeId);
  if (node === undefined || node.type !== "GROUP") {
    throw new Error(`Flow Connector operation batch references missing connector root ${nodeId}.`);
  }
  return node;
}

function createFlowConnectorRoot(
  operation: CreateFlowConnectorOperation,
  runtime: FlowConnectorVisualWriterRuntime,
): GroupNode {
  const visualNodes = createConnectorVisualNodes(operation.visual, runtime);
  const connectorRoot = figma.group(visualNodes, figma.currentPage);
  connectorRoot.name = operation.name;
  return connectorRoot;
}

function updateFlowConnectorRoot(
  connectorRoot: GroupNode,
  operation: UpdateFlowConnectorOperation,
  runtime: FlowConnectorVisualWriterRuntime,
): void {
  const nextVisualNodes = createConnectorVisualNodes(operation.visual, runtime);
  replaceConnectorVisualNodes(connectorRoot, nextVisualNodes);
  connectorRoot.name = operation.name;
}

function createConnectorVisualNodes(
  visual: FlowConnectorVisualModel,
  runtime: FlowConnectorVisualWriterRuntime,
): SceneNode[] {
  const nodes: SceneNode[] = [createConnectorRouteSvg(visual.route)];

  if (visual.label !== null) {
    nodes.push(createFlowActionLabel(visual.label, runtime));
  }

  return nodes;
}

function createConnectorRouteSvg(visual: ConnectorRouteVisualModel): FrameNode {
  const route = figma.createNodeFromSvg(visual.svg);
  route.name = CONNECTOR_ROUTE_NODE_NAME;
  route.x = visual.bounds.x;
  route.y = visual.bounds.y;
  route.clipsContent = false;
  return route;
}

function createFlowActionLabel(
  visual: FlowActionLabelVisualModel,
  runtime: FlowConnectorVisualWriterRuntime,
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

  label.name = FLOW_ACTION_LABEL_NODE_NAME;
  label.fills = [hexToSolidPaint(visual.fill)];
  label.strokes = [hexToSolidPaint(visual.stroke)];
  label.strokeWeight = 1;
  label.cornerRadius = visual.radius;
  label.clipsContent = false;
  label.layoutMode = "HORIZONTAL";
  label.primaryAxisSizingMode = "AUTO";
  label.counterAxisSizingMode = "AUTO";
  label.primaryAxisAlignItems = "CENTER";
  label.counterAxisAlignItems = "CENTER";
  label.paddingLeft = visual.paddingX;
  label.paddingRight = visual.paddingX;
  label.paddingTop = visual.paddingY;
  label.paddingBottom = visual.paddingY;
  label.itemSpacing = 0;
  label.minWidth = visual.minWidth;
  label.minHeight = visual.minHeight;
  label.appendChild(text);
  label.x = visual.center.x - label.width / 2;
  label.y = visual.center.y - label.height / 2;

  return label;
}

function replaceConnectorVisualNodes(connectorRoot: GroupNode, nextVisualNodes: SceneNode[]): void {
  const previousVisualNodes = [...connectorRoot.children];
  // Figma deletes empty groups, so keep the connector root populated while swapping visuals.
  nextVisualNodes.forEach((node) => {
    connectorRoot.appendChild(node);
  });
  previousVisualNodes.forEach((child) => {
    child.remove();
  });
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
