import {
  type ConnectorObstacle,
  type RectLike,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";

interface ConnectorObstacleRuntime {
  namespace: string;
}

export function collectConnectorObstacles(
  startNode: SceneNode,
  endNode: SceneNode,
  runtime: ConnectorObstacleRuntime,
  candidates: Iterable<SceneNode>,
): ConnectorObstacle[] {
  const obstacles: ConnectorObstacle[] = [];
  const obstacleRootIds = new Set<string>();
  const startAncestorIds = getAncestorIds(startNode);
  const endAncestorIds = getAncestorIds(endNode);

  for (const node of candidates) {
    if (node.type !== "FRAME") {
      continue;
    }
    if (node === startNode || node === endNode) {
      continue;
    }
    if (hasAncestorId(node, obstacleRootIds)) {
      continue;
    }

    const coveredObstacleRects = obstacles.map(toObstacleRect);
    if (
      node.absoluteBoundingBox !== null &&
      isCoveredByObstacle(node.absoluteBoundingBox, coveredObstacleRects)
    ) {
      continue;
    }

    const kind = node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind);
    const nodeContainsEndpoint = startAncestorIds.has(node.id) || endAncestorIds.has(node.id);

    if (
      kind === VISUAL_NODE_KINDS.annotationCard &&
      !nodeContainsEndpoint &&
      node.absoluteBoundingBox !== null
    ) {
      appendUncoveredObstacle(obstacles, obstacles.map(toObstacleRect), {
        id: node.id,
        kind: "annotation-card",
        rect: node.absoluteBoundingBox,
      });
      obstacleRootIds.add(node.id);
    } else if (
      kind === "" &&
      !hasGeneratedAncestorInNamespace(node, runtime.namespace) &&
      node.type === "FRAME" &&
      !nodeContainsEndpoint &&
      node.absoluteBoundingBox !== null
    ) {
      appendUncoveredObstacle(obstacles, obstacles.map(toObstacleRect), {
        id: node.id,
        kind: "context-frame",
        rect: node.absoluteBoundingBox,
      });
      obstacleRootIds.add(node.id);
    }
  }

  return obstacles;
}

export function collectCurrentPageConnectorObstacleCandidates(): SceneNode[] {
  return figma.currentPage.findAllWithCriteria({ types: ["FRAME"] });
}

function toObstacleRect(obstacle: ConnectorObstacle): RectLike {
  return obstacle.rect;
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

function hasAncestorId(node: BaseNode, ancestorIds: Set<string>): boolean {
  let current = node.parent;
  while (current !== null && current.type !== "PAGE") {
    if (ancestorIds.has(current.id)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function hasGeneratedAncestorInNamespace(node: BaseNode, namespace: string): boolean {
  let current = node.parent;
  while (current !== null && current.type !== "PAGE") {
    if (current.getSharedPluginData(namespace, SHARED_PLUGIN_DATA.keys.kind) !== "") {
      return true;
    }
    current = current.parent;
  }
  return false;
}
