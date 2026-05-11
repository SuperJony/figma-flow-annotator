import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const buildDir = resolve(appRoot, ".test-build-figma");
const namespace = "figma_flow_annotator";

test("applies Figma File Operation Batches through one writer seam", async () => {
  const { applyFigmaFileOperationBatch } = await importFileOperationsModule();
  const containers = new Map();
  const subject = createNode("subject");
  const endpoint = createNode("endpoint");
  const movable = createNode("movable");
  const existingConnector = createNode("existing-connector", "GROUP");
  subject.setSharedPluginData(
    namespace,
    "annotationRefs",
    JSON.stringify({ annotationIds: ["annotation-existing"] }),
  );
  endpoint.setSharedPluginData(namespace, "connectorRefs", "not-json");
  const updates = [];

  const applied = applyFigmaFileOperationBatch({
    batch: {
      schemaVersion: 1,
      kind: "create-annotation",
      operations: [
        { type: "ensure-container", ref: "annotations", name: "FFA Annotations" },
        {
          type: "set-shared-plugin-data",
          target: { kind: "container", ref: "annotations" },
          key: "kind",
          value: "container",
        },
        {
          type: "create-annotation-card",
          ref: "annotation-card",
          containerRef: "annotations",
          name: "FFA Annotation Card #1",
          annotationNumber: 1,
          body: "Body",
          subjectSummary: "Subject",
          basePosition: { x: 0, y: 140 },
        },
        {
          type: "create-annotation-badge",
          ref: "annotation-badge",
          containerRef: "annotations",
          name: "FFA Annotation Badge #1",
          annotationNumber: 1,
          subjectNodeId: subject.id,
          position: { x: 10, y: 20 },
        },
        {
          type: "set-shared-plugin-data",
          target: { kind: "created-node", ref: "annotation-card" },
          key: "annotation",
          value: {
            schemaVersion: 1,
            id: "annotation-1",
            annotationNumber: 1,
            body: "Body",
            contextFrameId: "context",
            subjectNodeIds: [subject.id],
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        },
        {
          type: "append-shared-reference",
          targetNodeId: subject.id,
          key: "annotationRefs",
          listKey: "annotationIds",
          id: "annotation-1",
        },
        {
          type: "append-shared-reference",
          targetNodeId: subject.id,
          key: "annotationRefs",
          listKey: "annotationIds",
          id: "annotation-existing",
        },
        {
          type: "update-validation-index",
          target: { kind: "container", ref: "annotations" },
          upsert: {
            nodeIds: {
              contextFrameIds: ["context"],
              subjectNodeIds: [subject.id],
            },
            nodeTargets: {
              annotationBadgeNodeIds: [{ kind: "created-node", ref: "annotation-badge" }],
              annotationCardNodeIds: [{ kind: "created-node", ref: "annotation-card" }],
              connectorObstacleCandidateNodeIds: [
                { kind: "created-node", ref: "annotation-card" },
                { kind: "existing-node", nodeId: subject.id },
              ],
            },
          },
        },
        { type: "ensure-container", ref: "connectors", name: "FFA Connectors" },
        {
          type: "create-flow-connector",
          ref: "flow-connector",
          containerRef: "connectors",
          name: "FFA Connector A -> B",
          routePoints: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          flowAction: "click",
        },
        {
          type: "append-shared-reference",
          targetNodeId: endpoint.id,
          key: "connectorRefs",
          listKey: "connectorIds",
          id: "connector-1",
        },
        {
          type: "update-validation-index",
          target: { kind: "container", ref: "connectors" },
          upsert: {
            nodeIds: {
              flowEndpointNodeIds: [endpoint.id],
            },
            nodeTargets: {
              connectorRootNodeIds: [{ kind: "created-node", ref: "flow-connector" }],
            },
          },
        },
        {
          type: "update-flow-connector",
          targetNodeId: existingConnector.id,
          name: "FFA Connector A -> C",
          routePoints: [
            { x: 0, y: 0 },
            { x: 0, y: 100 },
          ],
          flowAction: "choose",
        },
        { type: "move-node", targetNodeId: movable.id, position: { x: 5, y: 8 } },
      ],
    },
    existingNodes: new Map([
      [subject.id, subject],
      [endpoint.id, endpoint],
      [movable.id, movable],
      [existingConnector.id, existingConnector],
    ]),
    namespace,
    writer: {
      createAnnotationBadge: (_container, operation) =>
        createNode(operation.ref, "FRAME", operation.name),
      createAnnotationCard: (_container, operation) =>
        createNode(operation.ref, "FRAME", operation.name),
      createFlowConnector: (_container, operation) =>
        createNode(operation.ref, "GROUP", operation.name),
      ensureContainer: (name) => {
        const container = createNode(name, "FRAME", name);
        containers.set(name, container);
        return container;
      },
      updateFlowConnector: (operation) => updates.push(operation),
    },
  });

  assert.equal(applied.containers.size, 2);
  assert.equal(applied.createdNodes.get("annotation-card")?.name, "FFA Annotation Card #1");
  assert.equal(applied.createdNodes.get("flow-connector")?.type, "GROUP");
  assert.equal(applied.movedNodes[0], movable);
  assert.deepEqual({ x: movable.x, y: movable.y }, { x: 5, y: 8 });
  assert.equal(
    containers.get("FFA Annotations").getSharedPluginData(namespace, "kind"),
    "container",
  );
  assert.equal(
    JSON.parse(
      applied.createdNodes.get("annotation-card").getSharedPluginData(namespace, "annotation"),
    ).id,
    "annotation-1",
  );
  assert.deepEqual(JSON.parse(subject.getSharedPluginData(namespace, "annotationRefs")), {
    schemaVersion: 1,
    annotationIds: ["annotation-existing", "annotation-1"],
  });
  assert.deepEqual(JSON.parse(endpoint.getSharedPluginData(namespace, "connectorRefs")), {
    schemaVersion: 1,
    connectorIds: ["connector-1"],
  });
  assert.deepEqual(
    JSON.parse(containers.get("FFA Annotations").getSharedPluginData(namespace, "validationIndex")),
    {
      schemaVersion: 1,
      subjectNodeIds: [subject.id],
      annotationCardNodeIds: ["annotation-card"],
      annotationBadgeNodeIds: ["annotation-badge"],
      flowEndpointNodeIds: [],
      contextFrameIds: ["context"],
      ownerContextFrameIds: [],
      connectorRootNodeIds: [],
      connectorObstacleCandidateNodeIds: ["annotation-card", subject.id],
    },
  );
  assert.deepEqual(
    JSON.parse(containers.get("FFA Connectors").getSharedPluginData(namespace, "validationIndex")),
    {
      schemaVersion: 1,
      subjectNodeIds: [],
      annotationCardNodeIds: [],
      annotationBadgeNodeIds: [],
      flowEndpointNodeIds: [endpoint.id],
      contextFrameIds: [],
      ownerContextFrameIds: [],
      connectorRootNodeIds: ["flow-connector"],
      connectorObstacleCandidateNodeIds: [],
    },
  );
  assert.equal(updates[0].name, "FFA Connector A -> C");
});

test("rejects mismatched shared reference operations at the writer seam", async () => {
  const { applyFigmaFileOperationBatch } = await importFileOperationsModule();
  const subject = createNode("subject");

  assert.throws(
    () =>
      applyFigmaFileOperationBatch({
        batch: {
          schemaVersion: 1,
          kind: "clean-stale-indexes",
          operations: [
            {
              type: "append-shared-reference",
              targetNodeId: subject.id,
              key: "annotationRefs",
              listKey: "connectorIds",
              id: "connector-1",
            },
          ],
        },
        existingNodes: new Map([[subject.id, subject]]),
        namespace,
      }),
    /cannot append annotationRefs\.connectorIds/,
  );
});

async function importFileOperationsModule() {
  await mkdir(buildDir, { recursive: true });
  const outfile = resolve(
    buildDir,
    `file-operations-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  await build({
    bundle: true,
    entryPoints: [resolve(appRoot, "src/figma/file-operations.ts")],
    format: "esm",
    outfile,
    platform: "node",
    target: "es2019",
  });
  return import(pathToFileURL(outfile).href);
}

function createNode(id, type = "FRAME", name = id) {
  const sharedPluginData = new Map();
  return {
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? "",
    id,
    name,
    setSharedPluginData: (_namespace, key, value) => {
      sharedPluginData.set(key, value);
    },
    type,
    x: 0,
    y: 0,
  };
}
