import assert from "node:assert/strict";
import { test as nodeTest } from "node:test";

import {
  createFigmaStub,
  createNode,
  createPage,
  flushPluginMessage,
  forbidPageFindAllWithCriteria,
  importAppModule,
  importCodeModule,
  importCoreModule,
  moveNode,
  namespace,
  readConnectorRefs,
  readValidationIndex,
  setBadgeRecord,
  setCardRecord,
  setConnectorRecord,
  setConnectorRefs,
  setValidationIndex,
} from "../support/plugin-test-helpers.mjs";

let validationTestQueue = Promise.resolve();

function test(name, fn) {
  let release = () => {};
  nodeTest(name, async (context) => {
    const previous = validationTestQueue;
    validationTestQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await fn(context);
    } finally {
      release();
    }
  });
}

test("validates without scanning unrelated frame descendants", async () => {
  const page = createPage();
  const unrelatedFrame = createNode(page, "unrelated-large-frame", 0);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const connectorsContainer = createNode(page, "FFA Connectors", 900);
  const messages = [];

  Object.defineProperty(unrelatedFrame, "children", {
    get() {
      throw new Error("Validate Bindings must not scan unrelated frame descendants.");
    },
  });

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  page.children = [unrelatedFrame, annotationsContainer, connectorsContainer];
  forbidPageFindAllWithCriteria(
    page,
    "Validate Bindings must not call page-wide findAllWithCriteria.",
  );
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "validate-bindings" });
  await flushPluginMessage(messages);

  const reportMessage = messages.find((message) => message.type === "validation-report");
  assert.ok(reportMessage);
  assert.deepEqual(reportMessage.report.summary, {
    all: 0,
    errors: 0,
    warnings: 0,
    info: 0,
  });
});

test("runs pure validation from a collected plain snapshot without Figma scene access", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  const subject = createNode(contextFrame, "subject-a", 20);
  const annotationsContainer = createNode(page, "FFA Annotations", 500);
  const card = createNode(annotationsContainer, "annotation-card", 540);
  const messages = [];
  const previousFigmaDescriptor = Object.getOwnPropertyDescriptor(globalThis, "figma");
  let currentPageReads = 0;
  let getNodeByIdCalls = 0;

  moveNode(contextFrame, { x: 0, y: 0, width: 320, height: 180 });
  moveNode(subject, { x: 20, y: 24, width: 100, height: 50 });
  moveNode(card, { x: 0, y: 220, width: 280, height: 100 });
  subject.setSharedPluginData(
    namespace,
    "annotationRefs",
    JSON.stringify({
      schemaVersion: 1,
      annotationIds: ["annotation-1"],
    }),
  );
  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  setCardRecord(card, 1, contextFrame.id);
  card.setSharedPluginData(
    namespace,
    "annotation",
    JSON.stringify({
      schemaVersion: 1,
      id: "annotation-1",
      annotationNumber: 1,
      body: "",
      contextFrameId: contextFrame.id,
      subjectNodeIds: [subject.id],
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }),
  );
  contextFrame.children = [subject];
  annotationsContainer.children = [card];
  page.children = [contextFrame, annotationsContainer];

  const figmaStub = createFigmaStub(page, messages);
  Object.defineProperty(figmaStub, "currentPage", {
    configurable: true,
    get() {
      currentPageReads += 1;
      return page;
    },
  });
  figmaStub.getNodeByIdAsync = async (id) => {
    getNodeByIdCalls += 1;
    return page.__nodesById?.get(id) ?? null;
  };

  try {
    Object.defineProperty(globalThis, "figma", {
      configurable: true,
      value: figmaStub,
      writable: true,
    });
    const { collectCurrentPageValidationSnapshot } = await importAppModule(
      "src/validation/current-page-snapshot.ts",
      "validation-snapshot",
    );

    const snapshot = await collectCurrentPageValidationSnapshot({
      findContextFrameId: () => contextFrame.id,
      getVisibleBounds: (node) => node.absoluteBoundingBox,
      namespace,
    });
    assert.ok(currentPageReads > 0);
    assert.ok(getNodeByIdCalls > 0);

    const clonedSnapshot = structuredClone(snapshot);
    assert.deepEqual(clonedSnapshot, snapshot);

    Object.defineProperty(globalThis, "figma", {
      configurable: true,
      get() {
        throw new Error("Pure validation computation must not access Figma scene state.");
      },
    });
    const { runValidationComputation } = await importCoreModule();
    const report = runValidationComputation(clonedSnapshot);

    assert.deepEqual(report.summary, {
      all: 2,
      errors: 1,
      warnings: 1,
      info: 0,
    });
    assert.deepEqual(
      report.issues.map((issue) => [issue.code, issue.locationNodeIds]),
      [
        ["annotation-missing-badge", ["annotation-card", "subject-a"]],
        ["annotation-missing-body", ["annotation-card"]],
      ],
    );
  } finally {
    if (previousFigmaDescriptor === undefined) {
      delete globalThis.figma;
    } else {
      Object.defineProperty(globalThis, "figma", previousFigmaDescriptor);
    }
  }
});

test("validates and cleans explicitly referenced Stale Reverse Indexes without page-wide discovery", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  const formerEndpoint = createNode(contextFrame, "former-endpoint", 20);
  const annotationsContainer = createNode(page, "FFA Annotations", 500);
  const card = createNode(annotationsContainer, "annotation-card", 540);
  const badge = createNode(annotationsContainer, "annotation-badge", 580);
  const messages = [];

  moveNode(card, { x: 0, y: 140, width: 280, height: 100 });
  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  setCardRecord(card, 1, contextFrame.id);
  card.setSharedPluginData(
    namespace,
    "annotation",
    JSON.stringify({
      schemaVersion: 1,
      id: "annotation-1",
      annotationNumber: 1,
      body: "body 1",
      contextFrameId: contextFrame.id,
      subjectNodeIds: [formerEndpoint.id],
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }),
  );
  setBadgeRecord(badge, 1, formerEndpoint.id, contextFrame.id);
  setValidationIndex(annotationsContainer, {
    annotationBadgeNodeIds: [badge.id],
    annotationCardNodeIds: [card.id],
    connectorObstacleCandidateNodeIds: [card.id],
    contextFrameIds: [contextFrame.id],
    flowEndpointNodeIds: [formerEndpoint.id],
    subjectNodeIds: [formerEndpoint.id],
  });
  setConnectorRefs(formerEndpoint, ["deleted-connector"]);
  contextFrame.children = [formerEndpoint];
  annotationsContainer.children = [card, badge];
  page.children = [contextFrame, annotationsContainer];
  forbidPageFindAllWithCriteria(
    page,
    "Validate Bindings must not discover reverse refs with findAllWithCriteria.",
  );
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "validate-bindings" });
  await flushPluginMessage(messages);

  const report = messages.find((message) => message.type === "validation-report").report;
  assert.deepEqual(report.summary, {
    all: 1,
    errors: 0,
    warnings: 1,
    info: 0,
  });
  assert.deepEqual(
    report.issues.map((issue) => issue.code),
    ["connector-reverse-index-stale"],
  );

  messages.length = 0;
  globalThis.figma.ui.onmessage({ type: "clean-stale-indexes" });
  await flushPluginMessage(messages);

  const cleanStatus = messages.find(
    (message) => message.type === "status" && message.tone === "success",
  );
  assert.deepEqual(readConnectorRefs(formerEndpoint), []);
  assert.equal(
    cleanStatus.message,
    "Cleaned stale indexes on 1 Flow Endpoint(s); removed 1 stale connector reference(s).",
  );
});

test("requires Deep Audit Repair for missing, invalid, or stale Validation Index data", async () => {
  const cases = [
    {
      expected: "Validation Index is missing.",
      name: "missing",
      prepareIndex: () => {},
    },
    {
      expected: "Validation Index is invalid on 1 container(s).",
      name: "invalid",
      prepareIndex: (connectorsContainer) => {
        connectorsContainer.setSharedPluginData(namespace, "validationIndex", "{bad json");
      },
    },
    {
      expected: "Validation Index references 1 deleted node(s).",
      name: "stale",
      prepareIndex: (connectorsContainer, start, end, connector) => {
        setValidationIndex(connectorsContainer, {
          connectorRootNodeIds: [connector.id, "deleted-index-node"],
          flowEndpointNodeIds: [start.id, end.id],
        });
      },
    },
  ];

  for (const testCase of cases) {
    const page = createPage();
    const start = createNode(page, `${testCase.name}-start`, 0);
    const end = createNode(page, `${testCase.name}-end`, 160);
    const connectorsContainer = createNode(page, "FFA Connectors", 800);
    const connector = createNode(connectorsContainer, `${testCase.name}-connector-root`, 840);
    const messages = [];

    setConnectorRefs(start, ["live-connector", "deleted-connector"]);
    connectorsContainer.setSharedPluginData(namespace, "kind", "container");
    setConnectorRecord(connector, "live-connector", start.id, end.id, "open");
    testCase.prepareIndex(connectorsContainer, start, end, connector);
    connectorsContainer.children = [connector];
    page.children = [start, end, connectorsContainer];
    globalThis.figma = createFigmaStub(page, messages);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: "clean-stale-indexes" });
    await flushPluginMessage(messages);

    const cleanStatus = messages.find((message) => message.type === "status");
    assert.equal(cleanStatus.tone, "error");
    assert.equal(
      cleanStatus.message,
      `${testCase.expected} Run Deep Audit Repair to rebuild the Validation Index before ordinary cleanup.`,
    );
    assert.deepEqual(readConnectorRefs(start), ["live-connector", "deleted-connector"]);
  }
});

test("Deep Audit Repair rebuilds the Validation Index and cleans unknown stale reverse refs", async () => {
  const page = createPage();
  const start = createNode(page, "start-endpoint", 0);
  const end = createNode(page, "end-endpoint", 160);
  const unknownFormerEndpoint = createNode(page, "unknown-former-endpoint", 320);
  const connectorsContainer = createNode(page, "FFA Connectors", 800);
  const connector = createNode(connectorsContainer, "connector-root", 840);
  const messages = [];

  setConnectorRefs(start, ["live-connector", "deleted-connector"]);
  setConnectorRefs(unknownFormerEndpoint, ["deleted-connector"]);
  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  setConnectorRecord(connector, "live-connector", start.id, end.id, "open");
  setValidationIndex(connectorsContainer, {
    connectorRootNodeIds: [connector.id],
    flowEndpointNodeIds: [start.id, end.id],
  });
  connectorsContainer.children = [connector];
  page.children = [start, end, unknownFormerEndpoint, connectorsContainer];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "clean-stale-indexes" });
  await flushPluginMessage(messages);

  assert.deepEqual(readConnectorRefs(start), ["live-connector"]);
  assert.deepEqual(readConnectorRefs(unknownFormerEndpoint), ["deleted-connector"]);

  messages.length = 0;
  globalThis.figma.ui.onmessage({ type: "deep-audit-repair-index" });
  await flushPluginMessage(messages);

  const repairStatus = messages.find(
    (message) => message.type === "status" && message.tone === "success",
  );
  assert.deepEqual(readConnectorRefs(unknownFormerEndpoint), []);
  assert.equal(
    repairStatus.message,
    "Deep Audit Repair rebuilt the Validation Index on 2 container(s), cleaned 1 Flow Endpoint(s), and removed 1 stale connector reference(s). Validation found 0 issue(s).",
  );
  assert.deepEqual(readValidationIndex(connectorsContainer).flowEndpointNodeIds, [
    start.id,
    end.id,
  ]);
  assert.deepEqual(readValidationIndex(connectorsContainer).connectorRootNodeIds, [connector.id]);
});

test("Deep Audit Repair keeps rebuilt Validation Index under the Figma plugin-data limit", async () => {
  const page = createPage();
  const unrelatedFrames = Array.from({ length: 6_000 }, (_value, index) =>
    createNode(page, `unrelated-frame-${String(index).padStart(5, "0")}`, index),
  );
  const start = createNode(page, "start-endpoint", 0);
  const end = createNode(page, "end-endpoint", 160);
  const unknownFormerEndpoint = createNode(page, "unknown-former-endpoint", 320);
  const connectorsContainer = createNode(page, "FFA Connectors", 800);
  const connector = createNode(connectorsContainer, "connector-root", 840);
  const messages = [];

  setConnectorRefs(start, ["live-connector", "deleted-connector"]);
  setConnectorRefs(unknownFormerEndpoint, ["deleted-connector"]);
  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  limitSharedPluginDataEntrySize(connectorsContainer, 100_000);
  setConnectorRecord(connector, "live-connector", start.id, end.id, "open");
  connectorsContainer.children = [connector];
  page.children = [...unrelatedFrames, start, end, unknownFormerEndpoint, connectorsContainer];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "deep-audit-repair-index" });
  await flushPluginMessage(messages);

  const repairStatus = messages.find((message) => message.type === "status");
  const connectorIndexRaw = connectorsContainer.getSharedPluginData(namespace, "validationIndex");
  const connectorIndex = readValidationIndex(connectorsContainer);

  assert.equal(repairStatus.tone, "success");
  assert.ok(
    connectorIndexRaw.length < 100_000,
    `Validation Index entry length ${connectorIndexRaw.length} should stay below 100 kB.`,
  );
  assert.deepEqual(connectorIndex.connectorObstacleCandidateNodeIds, [start.id, end.id]);
  assert.deepEqual(connectorIndex.flowEndpointNodeIds, [start.id, end.id]);
  assert.equal(
    connectorIndex.connectorObstacleCandidateNodeIds.includes(unrelatedFrames[0].id),
    false,
  );
  assert.deepEqual(readConnectorRefs(unknownFormerEndpoint), []);
});

test("validates connector routes without scanning unrelated group descendants", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  const start = createNode(contextFrame, "start-endpoint", 0);
  const end = createNode(contextFrame, "end-endpoint", 220);
  const connectorsContainer = createNode(page, "FFA Connectors", 500);
  const connector = createNode(connectorsContainer, "connector-root", 520);
  const unrelatedGroup = createNode(page, "unrelated-large-group", 900);
  const messages = [];

  unrelatedGroup.type = "GROUP";
  Object.defineProperty(unrelatedGroup, "children", {
    get() {
      throw new Error("Validate Bindings must not scan unrelated group descendants.");
    },
  });
  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  setConnectorRecord(connector, "connector-valid", start.id, end.id, "open", [
    { x: 100, y: 50 },
    { x: 220, y: 50 },
  ]);

  contextFrame.children = [start, end];
  connectorsContainer.children = [connector];
  page.children = [contextFrame, connectorsContainer, unrelatedGroup];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "validate-bindings" });
  await flushPluginMessage(messages);

  const reportMessage = messages.find((message) => message.type === "validation-report");
  assert.ok(reportMessage);
  assert.equal(
    messages.some(
      (message) =>
        message.type === "status" &&
        message.tone === "error" &&
        message.message.includes("unrelated group descendants"),
    ),
    false,
  );
});

function limitSharedPluginDataEntrySize(node, maxLength) {
  const originalSetSharedPluginData = node.setSharedPluginData;
  node.setSharedPluginData = (namespaceValue, key, value) => {
    if (value.length > maxLength) {
      throw new Error(
        `in setSharedPluginData: This pluginData entry exceeds ${maxLength} byte test limit.`,
      );
    }
    originalSetSharedPluginData(namespaceValue, key, value);
  };
}

test("validates multiple connector routes without repeated obstacle discovery", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  const startA = createNode(contextFrame, "start-a", 0);
  const endA = createNode(contextFrame, "end-a", 260);
  const startB = createNode(contextFrame, "start-b", 0);
  const endB = createNode(contextFrame, "end-b", 260);
  const connectorsContainer = createNode(page, "FFA Connectors", 500);
  const connectorA = createNode(connectorsContainer, "connector-root-a", 520);
  const connectorB = createNode(connectorsContainer, "connector-root-b", 560);
  const unrelatedFrame = createNode(page, "unrelated-large-frame", 900);
  const messages = [];
  let fullPageObstacleDiscoveryCalls = 0;

  moveNode(startA, { x: 0, y: 0, width: 100, height: 100 });
  moveNode(endA, { x: 260, y: 0, width: 100, height: 100 });
  moveNode(startB, { x: 0, y: 180, width: 100, height: 100 });
  moveNode(endB, { x: 260, y: 180, width: 100, height: 100 });
  Object.defineProperty(unrelatedFrame, "children", {
    get() {
      throw new Error("Route validation must not scan unrelated frame descendants.");
    },
  });
  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  setConnectorRecord(connectorA, "connector-a", startA.id, endA.id, "A");
  setConnectorRecord(connectorB, "connector-b", startB.id, endB.id, "B");

  contextFrame.children = [startA, endA, startB, endB];
  connectorsContainer.children = [connectorA, connectorB];
  page.children = [contextFrame, connectorsContainer, unrelatedFrame];
  page.findAllWithCriteria = () => {
    fullPageObstacleDiscoveryCalls += 1;
    return [];
  };
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "validate-bindings" });
  await flushPluginMessage(messages);

  const reportMessage = messages.find((message) => message.type === "validation-report");
  assert.ok(reportMessage);
  assert.equal(fullPageObstacleDiscoveryCalls, 0);
  assert.equal(
    messages.some(
      (message) =>
        message.type === "status" &&
        message.tone === "error" &&
        message.message.includes("unrelated frame descendants"),
    ),
    false,
  );
});
