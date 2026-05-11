import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const buildDir = resolve(appRoot, ".test-build-plugin");
export const namespace = "figma_flow_annotator";

export async function flushPluginMessage(messages) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (messages.some((message) => message.type === "status")) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export async function importCodeModule() {
  await mkdir(buildDir, { recursive: true });
  const outfile = resolve(
    buildDir,
    `code-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  await build({
    bundle: true,
    define: {
      __html__: '""',
    },
    entryPoints: [resolve(appRoot, "src/plugin/code.ts")],
    format: "esm",
    outfile,
    platform: "node",
    target: "es2019",
  });
  return import(pathToFileURL(outfile).href);
}

export function createPage() {
  const page = createNode(null, "page", 0);
  page.type = "PAGE";
  page.selection = [];
  page.__page = page;
  page.__allNodes = new Set([page]);
  page.__nodesById = new Map([[page.id, page]]);
  page.appendChild = (node) => {
    appendChild(page, node);
  };
  page.findAllWithCriteria = (criteria) =>
    [...page.__allNodes].filter((node) => matchesCriteria(node, criteria));
  return page;
}

export function forbidPageFindAllWithCriteria(page, message) {
  page.findAllWithCriteria = () => {
    throw new Error(message);
  };
}

export function createNode(parent, id, x) {
  const sharedPluginData = new Map();
  const node = {
    absoluteBoundingBox: { x, y: 0, width: 100, height: 100 },
    appendChild: (child) => {
      appendChild(node, child);
    },
    children: [],
    clipsContent: false,
    cornerRadius: 0,
    fills: [],
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? "",
    height: 100,
    id,
    name: id,
    parent,
    removed: false,
    resize: (width, height) => {
      node.width = width;
      node.height = height;
      node.absoluteBoundingBox.width = width;
      node.absoluteBoundingBox.height = height;
    },
    setSharedPluginData: (_namespace, key, value) => {
      sharedPluginData.set(key, value);
    },
    strokes: [],
    strokeWeight: 0,
    type: "FRAME",
    width: 100,
    x,
    y: 0,
  };
  registerNode(parent, node);
  return node;
}

export function createTextNode() {
  const text = createNode(null, "text", 0);
  text.type = "TEXT";
  text.height = 16;
  text.width = 80;
  text.resize = (width, height) => {
    text.width = width;
    text.height = Math.max(16, height);
  };
  return text;
}

export function moveNode(node, rect) {
  node.x = rect.x;
  node.y = rect.y;
  node.width = rect.width;
  node.height = rect.height;
  node.absoluteBoundingBox = rect;
}

export function appendChild(parent, child) {
  const existingParent = child.parent;
  if (existingParent && "children" in existingParent) {
    existingParent.children = existingParent.children.filter((node) => node !== child);
  }
  child.parent = parent;
  parent.children.push(child);
  registerNode(parent, child);
}

export function readAnnotationRefs(node) {
  const data = node.getSharedPluginData(namespace, "annotationRefs");
  return data.length === 0 ? [] : JSON.parse(data).annotationIds;
}

export function readConnectorRefs(node) {
  const data = node.getSharedPluginData(namespace, "connectorRefs");
  return data.length === 0 ? [] : JSON.parse(data).connectorIds;
}

export function readConnectorId(node) {
  const data = node.getSharedPluginData(namespace, "connector");
  return data.length === 0 ? null : JSON.parse(data).id;
}

export function setBadgeRecord(badge, annotationNumber, subjectNodeId, contextFrameId) {
  badge.setSharedPluginData(namespace, "kind", "annotation-badge");
  badge.setSharedPluginData(
    namespace,
    "badgeRef",
    JSON.stringify({
      schemaVersion: 1,
      annotationId: `annotation-${annotationNumber}`,
      annotationNumber,
      subjectNodeId,
      contextFrameId,
    }),
  );
}

export function setCardRecord(card, annotationNumber, contextFrameId) {
  card.setSharedPluginData(namespace, "kind", "annotation-card");
  card.resize(280, 100);
  card.setSharedPluginData(
    namespace,
    "annotation",
    JSON.stringify({
      schemaVersion: 1,
      id: `annotation-${annotationNumber}`,
      annotationNumber,
      body: `body ${annotationNumber}`,
      contextFrameId,
      subjectNodeIds: ["subject-a"],
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }),
  );
}

export function setConnectorRefs(node, connectorIds) {
  node.setSharedPluginData(
    namespace,
    "connectorRefs",
    JSON.stringify({
      schemaVersion: 1,
      connectorIds,
    }),
  );
}

export function setConnectorRecord(
  connector,
  connectorId,
  startNodeId,
  endNodeId,
  flowAction,
  routePoints,
) {
  connector.type = "GROUP";
  connector.setSharedPluginData(namespace, "kind", "flow-connector");
  connector.setSharedPluginData(
    namespace,
    "connector",
    JSON.stringify({
      schemaVersion: 1,
      id: connectorId,
      start: {
        nodeId: startNodeId,
        contextFrameId: "context-frame",
      },
      end: {
        nodeId: endNodeId,
        contextFrameId: "context-frame",
      },
      ownerContextFrameId: "context-frame",
      flowAction,
      ...(routePoints === undefined
        ? {}
        : {
            routeCache: {
              schemaVersion: 1,
              points: routePoints,
            },
          }),
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }),
  );
}

export function addFlowActionLabel(connector, rect, visible = true) {
  const label = createNode(connector, `${connector.id}-label`, rect.x);
  label.name = "FFA Flow Action Label";
  label.visible = visible;
  moveNode(label, rect);
  connector.children.push(label);
}

export function createFigmaStub(page, messages, scrollEvents = []) {
  return {
    closePlugin: () => {},
    createFrame: () => createNode(null, "", 0),
    createText: createTextNode,
    currentPage: page,
    getNodeByIdAsync: async (id) => page.__nodesById?.get(id) ?? null,
    loadFontAsync: async () => {},
    notify: () => {},
    on: () => {},
    showUI: () => {},
    ui: {
      onmessage: null,
      postMessage: (message) => {
        messages.push(message);
      },
    },
    viewport: {
      scrollAndZoomIntoView: (nodes) => {
        scrollEvents.push(nodes);
      },
    },
  };
}

export function findNodeById(node, id) {
  if (node.id === id) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function registerNode(parent, node) {
  const page = parent?.type === "PAGE" ? parent : parent?.__page;
  if (page === undefined) {
    return;
  }
  node.__page = page;
  page.__allNodes.add(node);
  page.__nodesById.set(node.id, node);
  for (const child of node.children ?? []) {
    registerNode(node, child);
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
