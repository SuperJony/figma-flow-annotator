import {
  decodeAnnotationReferenceIds,
  decodeConnectorReferenceIds,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
  type VisualNodeKind,
} from "@figma-flow-annotator/core";

export const NAMESPACE = SHARED_PLUGIN_DATA.namespace;
export const FONT: FontName = { family: "Inter", style: "Regular" };

let loadedFonts = false;

export async function ensureFont(): Promise<void> {
  if (loadedFonts) {
    return;
  }
  await figma.loadFontAsync(FONT);
  loadedFonts = true;
}

export function createText(
  name: string,
  characters: string,
  fontSize: number,
  fills: SolidPaint,
  width: number,
): TextNode {
  const text = figma.createText();
  text.name = name;
  text.fontName = FONT;
  text.fontSize = fontSize;
  text.fills = [fills];
  text.textAutoResize = "HEIGHT";
  text.resize(width, 1);
  text.characters = characters;
  return text;
}

export function getCurrentPageGeneratedChildren(kind: VisualNodeKind): SceneNode[] {
  return figma.currentPage.children.filter(
    (child) => child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) === kind,
  );
}

export function ensureLayerOrder(): void {
  const connectors = getCurrentPageGeneratedChildren(VISUAL_NODE_KINDS.flowConnector);
  const cards = getCurrentPageGeneratedChildren(VISUAL_NODE_KINDS.annotationCard);
  const badges = getCurrentPageGeneratedChildren(VISUAL_NODE_KINDS.annotationBadge);

  [...connectors, ...cards, ...badges].forEach((node) => {
    figma.currentPage.appendChild(node);
  });
}

export function bringBadgesToFront(): void {
  const badges = getCurrentPageGeneratedChildren(VISUAL_NODE_KINDS.annotationBadge);
  badges.forEach((badge) => {
    figma.currentPage.appendChild(badge);
  });
}

export function getVisibleBounds(node: SceneNode): Rect {
  if (node.absoluteBoundingBox === null) {
    throw new Error(`${readableName(node.name)} has no visible bounds.`);
  }
  return node.absoluteBoundingBox;
}

export function localRect(node: SceneNode): Rect {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
}

export function findContextFrameId(node: SceneNode): string {
  let current: BaseNode | null = node;
  while (current !== null) {
    if (current.type === "FRAME") {
      return current.id;
    }
    current = current.parent;
  }
  return figma.currentPage.id;
}

export function hasGeneratedAncestor(node: SceneNode): boolean {
  let current: BaseNode | null = node;
  while (current !== null && current.type !== "PAGE") {
    if (current.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !== "") {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function readReferenceIds(
  node: BaseNode,
  dataKey: "annotationRefs" | "connectorRefs",
  listKey: "annotationIds" | "connectorIds",
): string[] {
  if (dataKey === SHARED_PLUGIN_DATA.keys.annotationRefs && listKey === "annotationIds") {
    return decodeAnnotationReferenceIds(node.getSharedPluginData(NAMESPACE, dataKey));
  }
  if (dataKey === SHARED_PLUGIN_DATA.keys.connectorRefs && listKey === "connectorIds") {
    return decodeConnectorReferenceIds(node.getSharedPluginData(NAMESPACE, dataKey));
  }
  return [];
}

export function solidPaint(r: number, g: number, b: number): SolidPaint {
  return {
    type: "SOLID",
    color: { r, g, b },
  };
}

export function createId(prefix: "annotation" | "connector"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readableName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 48) : "Untitled";
}

export async function getExistingSceneNodes(nodeIds: string[]): Promise<SceneNode[]> {
  return getExistingSceneNodesById(nodeIds);
}

export async function getExistingSceneNodesById(
  nodeIds: Iterable<string>,
  currentPageId = figma.currentPage.id,
  getNodeByIdAsync: (nodeId: string) => Promise<BaseNode | null> = figma.getNodeByIdAsync.bind(
    figma,
  ),
): Promise<SceneNode[]> {
  const nodes = await Promise.all(
    [...new Set(nodeIds)]
      .filter((nodeId) => nodeId !== currentPageId)
      .map((nodeId) => getNodeByIdAsync(nodeId)),
  );
  return nodes.filter(isLiveSceneNode);
}

function isLiveSceneNode(node: BaseNode | null): node is SceneNode {
  return node !== null && node.type !== "PAGE" && !node.removed && "absoluteBoundingBox" in node;
}
