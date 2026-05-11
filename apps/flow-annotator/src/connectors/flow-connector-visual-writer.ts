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
  ensureContainer(name: string): FrameNode;
}

export function createFlowConnectorVisualWriter(
  runtime: FlowConnectorVisualWriterRuntime,
  existingNodes: Map<string, BaseNode>,
): FigmaFileOperationWriter {
  return {
    createFlowConnector: (container, operation) =>
      createFlowConnectorRoot(container, operation, runtime),
    ensureContainer: runtime.ensureContainer,
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
  container: FrameNode,
  operation: CreateFlowConnectorOperation,
  runtime: FlowConnectorVisualWriterRuntime,
): GroupNode {
  const visualNodes = createConnectorVisualNodes(operation.visual, runtime);
  const connectorRoot = figma.group(visualNodes, container);
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

function replaceConnectorVisualNodes(connectorRoot: GroupNode, nextVisualNodes: SceneNode[]): void {
  [...connectorRoot.children].forEach((child) => {
    child.remove();
  });
  nextVisualNodes.forEach((node) => {
    connectorRoot.appendChild(node);
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
