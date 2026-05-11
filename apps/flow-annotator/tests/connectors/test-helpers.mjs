import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const buildDir = resolve(appRoot, ".test-build");

export async function importConnectModule() {
  await mkdir(buildDir, { recursive: true });
  const outfile = resolve(
    buildDir,
    `connect-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  await build({
    bundle: true,
    entryPoints: [resolve(appRoot, "src/connectors/commands.ts")],
    format: "esm",
    outfile,
    platform: "node",
    target: "es2019",
  });
  return import(pathToFileURL(outfile).href);
}

export async function importConnectorObstaclesModule() {
  await mkdir(buildDir, { recursive: true });
  const outfile = resolve(
    buildDir,
    `obstacles-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  await build({
    bundle: true,
    entryPoints: [resolve(appRoot, "src/connectors/obstacles.ts")],
    format: "esm",
    outfile,
    platform: "node",
    target: "es2019",
  });
  return import(pathToFileURL(outfile).href);
}

export async function importConnectorSnapshotModule() {
  await mkdir(buildDir, { recursive: true });
  const outfile = resolve(
    buildDir,
    `snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  await build({
    bundle: true,
    entryPoints: [resolve(appRoot, "src/connectors/current-page-snapshot.ts")],
    format: "esm",
    outfile,
    platform: "node",
    target: "es2019",
  });
  return import(pathToFileURL(outfile).href);
}

export function createNode(page, id, x) {
  ensurePageRegistry(page);
  const sharedPluginData = new Map();
  const node = {
    absoluteBoundingBox: { x, y: 0, width: 100, height: 100 },
    appendChild: (child) => {
      child.parent = node;
      node.children.push(child);
      registerNode(page, child);
    },
    children: [],
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? "",
    height: 100,
    id,
    name: id,
    parent: page,
    removed: false,
    remove: () => {
      node.removed = true;
      if (node.parent && Array.isArray(node.parent.children)) {
        node.parent.children = node.parent.children.filter((child) => child !== node);
      }
    },
    resize: (width, height) => {
      node.width = width;
      node.height = height;
      node.absoluteBoundingBox = { ...node.absoluteBoundingBox, width, height };
    },
    setSharedPluginData: (_namespace, key, value) => {
      sharedPluginData.set(key, value);
    },
    type: "FRAME",
    width: 100,
    x,
    y: 0,
  };
  registerNode(page, node);
  return node;
}

export function createRuntime(page, connectorGroups = []) {
  let connectorId = 0;
  return {
    appendConnectorReference: (node, connectorId) => {
      const refs = readConnectorRefs(node);
      node.setSharedPluginData(
        "figma_flow_annotator",
        "connectorRefs",
        JSON.stringify({
          schemaVersion: 1,
          connectorIds: refs.includes(connectorId) ? refs : [...refs, connectorId],
        }),
      );
    },
    createId: () => {
      connectorId += 1;
      return `connector-${connectorId}`;
    },
    createText: (name, characters, fontSize, fills, width) => ({
      characters,
      fills: [fills],
      fontSize,
      height: 16,
      name,
      resize: (nextWidth, _nextHeight) => {
        width = nextWidth;
      },
      textAutoResize: "NONE",
      type: "TEXT",
      width: Math.min(width, Math.max(16, characters.length * 7)),
      x: 0,
      y: 0,
    }),
    ensureContainer: () => {
      const existing = page.children.find((node) => node.name === "FFA Connectors");
      if (existing) {
        return existing;
      }
      const container = createNode(page, "connector-container", 0);
      container.name = "FFA Connectors";
      container.children = connectorGroups;
      container.setSharedPluginData("figma_flow_annotator", "kind", "container");
      page.children.push(container);
      registerNode(page, container);
      return container;
    },
    ensureLayerOrder: () => {},
    findContextFrameId: (node) => node.id,
    getVisibleBounds: (node) => node.absoluteBoundingBox,
    hasGeneratedAncestor: (node) => node.getSharedPluginData("figma_flow_annotator", "kind") !== "",
    namespace: "figma_flow_annotator",
    postSelectionState: () => {},
    readableName: (name) => name,
    solidPaint: (r, g, b) => ({ type: "SOLID", color: { r, g, b } }),
  };
}

export function createFigmaStub(page, connectorGroups) {
  ensurePageRegistry(page);
  return {
    createFrame: () => {
      const frame = createNode(page, `frame-${Math.random().toString(36).slice(2)}`, 0);
      frame.appendChild = (child) => {
        child.parent = frame;
        frame.children.push(child);
        registerNode(page, child);
      };
      frame.resize = (width, height) => {
        frame.width = width;
        frame.height = height;
      };
      return frame;
    },
    createNodeFromSvg: () => createNode(page, `svg-${Math.random().toString(36).slice(2)}`, 0),
    currentPage: page,
    getNodeByIdAsync: async (nodeId) => findNodeById(page, nodeId),
    group: (nodes, parent) => {
      const group = createNode(page, `connector-node-${connectorGroups.length + 1}`, 0);
      group.children = nodes;
      nodes.forEach((node) => {
        node.parent = group;
        registerNode(page, node);
      });
      group.parent = parent;
      group.type = "GROUP";
      group.appendChild = (child) => {
        child.parent = group;
        group.children.push(child);
        registerNode(page, child);
      };
      connectorGroups.push(group);
      registerNode(page, group);
      return group;
    },
  };
}

export function findNodeById(root, nodeId) {
  if (root.id === nodeId) {
    return root;
  }
  if (!Array.isArray(root.children)) {
    return null;
  }
  for (const child of root.children) {
    const match = findNodeById(child, nodeId);
    if (match !== null) {
      return match;
    }
  }
  return null;
}

export function moveNode(node, rect) {
  node.absoluteBoundingBox = rect;
  node.x = rect.x;
  node.y = rect.y;
  node.width = rect.width;
  node.height = rect.height;
}

export function getPendingEndpointIds(connect, runtime) {
  return connect.getPendingConnectorEndpointNodes(runtime).map((node) => node.id);
}

export function readConnectorEndpointIds(connectorGroup) {
  const connector = readConnector(connectorGroup);
  return [connector.start.nodeId, connector.end.nodeId];
}

export function readConnector(connectorGroup) {
  return JSON.parse(connectorGroup.getSharedPluginData("figma_flow_annotator", "connector"));
}

export function readConnectorRefs(node) {
  const data = node.getSharedPluginData("figma_flow_annotator", "connectorRefs");
  return data.length === 0 ? [] : JSON.parse(data).connectorIds;
}

function ensurePageRegistry(page) {
  if (page.__allNodes !== undefined) {
    return;
  }
  page.__allNodes = new Set([page]);
  page.findAllWithCriteria = (criteria) =>
    [...page.__allNodes].filter((node) => matchesCriteria(node, criteria));
  for (const child of page.children ?? []) {
    registerNode(page, child);
  }
}

function registerNode(page, node) {
  ensurePageRegistry(page);
  page.__allNodes.add(node);
  for (const child of node.children ?? []) {
    registerNode(page, child);
  }
}

function matchesCriteria(node, criteria) {
  if (node.type === "PAGE" || node.removed) {
    return false;
  }
  if (criteria.types !== undefined && !criteria.types.includes(node.type)) {
    return false;
  }
  const sharedPluginData = criteria.sharedPluginData;
  if (sharedPluginData === undefined) {
    return true;
  }
  const keys = sharedPluginData.keys;
  if (keys === undefined) {
    return ["kind", "annotation", "badgeRef", "connector", "annotationRefs", "connectorRefs"].some(
      (key) => node.getSharedPluginData(sharedPluginData.namespace, key) !== "",
    );
  }
  return keys.some((key) => node.getSharedPluginData(sharedPluginData.namespace, key) !== "");
}

export function routeIsOrthogonal(points) {
  return points.every((point, index) => {
    if (index === points.length - 1) {
      return true;
    }
    const next = points[index + 1];
    return point.x === next.x || point.y === next.y;
  });
}

export function routeIntersectsRect(points, rect) {
  return points.some((point, index) => {
    if (index === points.length - 1) {
      return false;
    }
    return segmentIntersectsRect(point, points[index + 1], rect);
  });
}

export function finalSegment(points) {
  return {
    start: points[points.length - 2],
    end: points[points.length - 1],
  };
}

export function getLabelCenter(connectorGroup) {
  const label = connectorGroup.children.find((child) => child.name === "FFA Flow Action Label");
  assert.ok(label, "expected Flow Action label visual node");
  return {
    x: label.x + label.width / 2,
    y: label.y + label.height / 2,
  };
}

export function pointOnSegment(point, segment) {
  if (segment.start.y === segment.end.y) {
    return (
      point.y === segment.start.y &&
      point.x >= Math.min(segment.start.x, segment.end.x) &&
      point.x <= Math.max(segment.start.x, segment.end.x)
    );
  }
  if (segment.start.x === segment.end.x) {
    return (
      point.x === segment.start.x &&
      point.y >= Math.min(segment.start.y, segment.end.y) &&
      point.y <= Math.max(segment.start.y, segment.end.y)
    );
  }
  return false;
}

export function segmentIntersectsRect(start, end, rect) {
  if (start.y === end.y) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return (
      start.y >= rect.y &&
      start.y <= rect.y + rect.height &&
      maxX >= rect.x &&
      minX <= rect.x + rect.width
    );
  }
  if (start.x === end.x) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return (
      start.x >= rect.x &&
      start.x <= rect.x + rect.width &&
      maxY >= rect.y &&
      minY <= rect.y + rect.height
    );
  }
  return true;
}

export function expandRect(rect, padding) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}
