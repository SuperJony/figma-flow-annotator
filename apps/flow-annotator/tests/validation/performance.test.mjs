import assert from "node:assert/strict";
import { test as nodeTest } from "node:test";

import {
  createFigmaStub,
  createNode,
  createPage,
  flushPluginMessage,
  importCodeModule,
  namespace,
  readConnectorRefs,
  setConnectorRecord,
  setConnectorRefs,
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

test("validates and cleans nested Stale Reverse Indexes without full-page traversal", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  const formerEndpoint = createNode(contextFrame, "former-endpoint", 20);
  const messages = [];

  setConnectorRefs(formerEndpoint, ["deleted-connector"]);
  contextFrame.children = [formerEndpoint];
  page.children = [contextFrame];
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
