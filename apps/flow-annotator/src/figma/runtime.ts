import {
  ANNOTATIONS_CONTAINER_NAME,
  CONNECTORS_CONTAINER_NAME,
  decodeAnnotationReferenceIds,
  decodeConnectorReferenceIds,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
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

export function ensureContainer(name: string): FrameNode {
  const existing = findContainer(name);
  if (existing !== null) {
    return existing;
  }

  const container = figma.createFrame();
  container.name = name;
  container.fills = [];
  container.strokes = [];
  container.clipsContent = false;
  container.resize(1, 1);
  container.x = 0;
  container.y = 0;
  ensureLayerOrder();
  return container;
}

export function findContainer(name: string): FrameNode | null {
  for (const child of figma.currentPage.children) {
    if (
      child.type === "FRAME" &&
      child.name === name &&
      child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) ===
        VISUAL_NODE_KINDS.container
    ) {
      return child;
    }
  }
  return null;
}

export function collectCurrentPageNodes(): SceneNode[] {
  const result: SceneNode[] = [];
  const queue = [...figma.currentPage.children];

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) {
      continue;
    }
    result.push(node);
    if ("children" in node) {
      queue.push(...node.children);
    }
  }

  return result;
}

export function ensureLayerOrder(): void {
  const annotations = findContainer(ANNOTATIONS_CONTAINER_NAME);
  const connectors = findContainer(CONNECTORS_CONTAINER_NAME);

  if (annotations !== null) {
    figma.currentPage.appendChild(annotations);
  }

  if (annotations !== null && connectors !== null) {
    const annotationIndex = figma.currentPage.children.indexOf(annotations);
    const connectorIndex = figma.currentPage.children.indexOf(connectors);
    if (connectorIndex > annotationIndex) {
      figma.currentPage.insertChild(annotationIndex, connectors);
    }
  }
}

export function bringBadgesToFront(container: FrameNode): void {
  const badges = container.children.filter(
    (child) =>
      child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) ===
      VISUAL_NODE_KINDS.annotationBadge,
  );
  badges.forEach((badge) => {
    container.appendChild(badge);
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
  const nodes: SceneNode[] = [];
  for (const nodeId of nodeIds) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (node !== null && node.type !== "PAGE" && "absoluteBoundingBox" in node) {
      nodes.push(node as SceneNode);
    }
  }
  return nodes;
}
