import {
  type ConnectorObstacle,
  type RectLike,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";

interface ConnectorObstacleRuntime {
  namespace: string;
}

interface ConnectorObstacleTraversalItem {
  node: SceneNode;
  generatedAncestor: boolean;
  coveringObstacles: RectLike[];
}

export function collectConnectorObstacles(
  startNode: SceneNode,
  endNode: SceneNode,
  runtime: ConnectorObstacleRuntime,
): ConnectorObstacle[] {
  const obstacles: ConnectorObstacle[] = [];
  const startAncestorIds = getAncestorIds(startNode);
  const endAncestorIds = getAncestorIds(endNode);
  const pending: ConnectorObstacleTraversalItem[] = figma.currentPage.children.map((node) => ({
    node,
    generatedAncestor: false,
    coveringObstacles: [],
  }));

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    const node = item.node;
    if (node === startNode || node === endNode) {
      continue;
    }

    const kind = node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind);
    const nodeContainsEndpoint = startAncestorIds.has(node.id) || endAncestorIds.has(node.id);
    let generatedAncestor = item.generatedAncestor;
    let coveringObstacles = item.coveringObstacles;
    let wholeFrameObstacle = false;

    if (
      kind === VISUAL_NODE_KINDS.annotationCard &&
      !nodeContainsEndpoint &&
      node.absoluteBoundingBox !== null
    ) {
      generatedAncestor = true;
      coveringObstacles = appendUncoveredObstacle(obstacles, coveringObstacles, {
        id: node.id,
        kind: "annotation-card",
        rect: node.absoluteBoundingBox,
      });
    } else if (kind !== "" || generatedAncestor) {
      generatedAncestor = true;
    } else if (
      node.type === "FRAME" &&
      !nodeContainsEndpoint &&
      node.absoluteBoundingBox !== null
    ) {
      wholeFrameObstacle = true;
      coveringObstacles = appendUncoveredObstacle(obstacles, coveringObstacles, {
        id: node.id,
        kind: "context-frame",
        rect: node.absoluteBoundingBox,
      });
    }

    if (generatedAncestor || wholeFrameObstacle || !("children" in node)) {
      continue;
    }

    node.children.forEach((child) => {
      pending.push({
        node: child,
        generatedAncestor,
        coveringObstacles,
      });
    });
  }

  return obstacles;
}

function appendUncoveredObstacle(
  obstacles: ConnectorObstacle[],
  coveringObstacles: RectLike[],
  candidate: ConnectorObstacle,
): RectLike[] {
  // Descendant obstacles fully inside an ancestor cannot add routing constraints.
  if (isCoveredByObstacle(candidate.rect, coveringObstacles)) {
    return coveringObstacles;
  }

  obstacles.push(candidate);
  return [...coveringObstacles, candidate.rect];
}

function isCoveredByObstacle(candidate: RectLike, coveringObstacles: RectLike[]): boolean {
  return coveringObstacles.some((obstacle) => rectContainsRect(obstacle, candidate));
}

function rectContainsRect(outer: RectLike, inner: RectLike): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function getAncestorIds(node: BaseNode): Set<string> {
  const ids = new Set<string>();
  let current = node.parent;
  while (current !== null && current.type !== "PAGE") {
    ids.add(current.id);
    current = current.parent;
  }
  return ids;
}
