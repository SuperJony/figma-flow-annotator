import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const buildDir = resolve(appRoot, ".test-build");
export const CONNECTOR_ROUTE_NODE_NAME = "FFA Connector Route";
export const FLOW_ACTION_LABEL_NODE_NAME = "FFA Flow Action Label";

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
      const parent = node.parent;
      if (parent && Array.isArray(parent.children)) {
        removeChild(parent, node);
        if (page.__removeEmptyGroups && parent.type === "GROUP" && parent.children.length === 0) {
          parent.remove();
        }
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

export function createRuntime() {
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

export function createFigmaStub(page, connectorGroups, options = {}) {
  ensurePageRegistry(page);
  page.__removeEmptyGroups = options.removeEmptyGroups === true;
  return {
    createFrame: () => {
      const frame = createNode(page, `frame-${Math.random().toString(36).slice(2)}`, 0);
      frame.counterAxisAlignItems = "MIN";
      frame.counterAxisSizingMode = "FIXED";
      frame.itemSpacing = 0;
      frame.layoutMode = "NONE";
      frame.minHeight = null;
      frame.minWidth = null;
      frame.paddingBottom = 0;
      frame.paddingLeft = 0;
      frame.paddingRight = 0;
      frame.paddingTop = 0;
      frame.primaryAxisAlignItems = "MIN";
      frame.primaryAxisSizingMode = "FIXED";
      frame.appendChild = (child) => {
        child.parent = frame;
        frame.children.push(child);
        registerNode(page, child);
        layoutHorizontalAutoFrame(frame);
      };
      frame.resize = (width, height) => {
        frame.width = width;
        frame.height = height;
        frame.absoluteBoundingBox = { ...frame.absoluteBoundingBox, width, height };
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
      const removeGroup = group.remove;
      group.remove = () => {
        removeGroup();
        removeChild({ children: connectorGroups }, group);
      };
      group.appendChild = (child) => {
        if (group.removed) {
          throw new Error(`in appendChild: The node with id "${group.id}" does not exist`);
        }
        child.parent = group;
        group.children.push(child);
        registerNode(page, child);
      };
      connectorGroups.push(group);
      parent.children.push(group);
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

export function selectConnectorEndpoints(connect, runtime, page, start, end) {
  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);
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

export function setValidationIndex(node, update) {
  node.setSharedPluginData(
    "figma_flow_annotator",
    "validationIndex",
    JSON.stringify({
      schemaVersion: 1,
      subjectNodeIds: [],
      annotationCardNodeIds: [],
      annotationBadgeNodeIds: [],
      flowEndpointNodeIds: [],
      contextFrameIds: [],
      ownerContextFrameIds: [],
      connectorRootNodeIds: [],
      connectorObstacleCandidateNodeIds: [],
      ...update,
    }),
  );
}

function ensurePageRegistry(page) {
  if (page.__allNodes !== undefined) {
    return;
  }
  const sharedPluginData = new Map();
  page.getSharedPluginData ??= (_namespace, key) => sharedPluginData.get(key) ?? "";
  page.setSharedPluginData ??= (_namespace, key, value) => {
    sharedPluginData.set(key, value);
  };
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

function removeChild(parent, child) {
  const index = parent.children.indexOf(child);
  if (index !== -1) {
    parent.children.splice(index, 1);
  }
}

function layoutHorizontalAutoFrame(frame) {
  if (frame.layoutMode === "NONE") {
    return;
  }
  assert.equal(frame.layoutMode, "HORIZONTAL");
  assert.equal(frame.primaryAxisSizingMode, "AUTO");
  assert.equal(frame.counterAxisSizingMode, "AUTO");

  const children = frame.children;
  const paddingX = frame.paddingLeft + frame.paddingRight;
  const paddingY = frame.paddingTop + frame.paddingBottom;
  const spacing = Math.max(0, children.length - 1) * frame.itemSpacing;
  const contentWidth = children.reduce((width, child) => width + child.width, 0) + spacing;
  const contentHeight = children.reduce((height, child) => Math.max(height, child.height), 0);

  frame.width = Math.max(frame.minWidth ?? 0, contentWidth + paddingX);
  frame.height = Math.max(frame.minHeight ?? 0, contentHeight + paddingY);
  frame.absoluteBoundingBox = {
    ...frame.absoluteBoundingBox,
    width: frame.width,
    height: frame.height,
  };

  const extraPrimarySpace = Math.max(
    0,
    frame.width - frame.paddingLeft - frame.paddingRight - contentWidth,
  );
  const extraCounterSpace = Math.max(
    0,
    frame.height - frame.paddingTop - frame.paddingBottom - contentHeight,
  );
  let x =
    frame.paddingLeft + (frame.primaryAxisAlignItems === "CENTER" ? extraPrimarySpace / 2 : 0);
  frame.children.forEach((child) => {
    child.x = x;
    child.y =
      frame.paddingTop + (frame.counterAxisAlignItems === "CENTER" ? extraCounterSpace / 2 : 0);
    x += child.width + frame.itemSpacing;
  });
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
  const label = connectorGroup.children.find((child) => child.name === FLOW_ACTION_LABEL_NODE_NAME);
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
