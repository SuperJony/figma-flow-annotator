import assert from "node:assert/strict";
import { test as nodeTest } from "node:test";

import {
  createFigmaStub,
  createNode,
  createPage,
  flushPluginMessage,
  importCodeModule,
  namespace,
  setConnectorRecord,
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

test("validation operations post busy state and Figma notifications", async () => {
  const page = createPage();
  const annotationsContainer = createNode(page, "FFA Annotations", 500);
  const connectorsContainer = createNode(page, "FFA Connectors", 800);
  const messages = [];
  const notifications = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  setValidationIndex(annotationsContainer, {});
  setValidationIndex(connectorsContainer, {});
  page.children = [annotationsContainer, connectorsContainer];
  globalThis.figma = createFigmaStub(page, messages, [], notifications);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "validate-bindings" });
  await flushPluginMessage(messages);

  assert.deepEqual(readOperationMessages(messages), [
    {
      operation: "validate-bindings",
      state: "running",
      message: "Validate Bindings is running.",
    },
    {
      operation: "validate-bindings",
      state: "idle",
    },
  ]);
  assert.deepEqual(notifications, ["Validate Bindings started.", "Validation found 0 issue(s)."]);
});

test("failed validation operations notify and return the panel to idle", async () => {
  const page = createPage();
  const messages = [];
  const notifications = [];

  globalThis.figma = createFigmaStub(page, messages, [], notifications);
  globalThis.figma.createFrame = () => {
    throw new Error("Unable to create Validation Index containers.");
  };

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "deep-audit-repair-index" });
  await flushPluginMessage(messages);

  const statusMessage = messages.find((message) => message.type === "status");

  assert.deepEqual(readOperationMessages(messages), [
    {
      operation: "deep-audit-repair-index",
      state: "running",
      message: "Deep Audit Repair is running.",
    },
    {
      operation: "deep-audit-repair-index",
      state: "idle",
    },
  ]);
  assert.equal(statusMessage.tone, "error");
  assert.equal(
    statusMessage.message,
    "Deep Audit Repair failed: Unable to create Validation Index containers.",
  );
  assert.deepEqual(notifications, [
    "Deep Audit Repair started.",
    "Deep Audit Repair failed: Unable to create Validation Index containers.",
  ]);
});

test("cleanup repair-required results notify failure without changing the panel status wording", async () => {
  const page = createPage();
  const connectorsContainer = createNode(page, "FFA Connectors", 800);
  const messages = [];
  const notifications = [];

  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  page.children = [connectorsContainer];
  globalThis.figma = createFigmaStub(page, messages, [], notifications);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "clean-stale-indexes" });
  await flushPluginMessage(messages);

  const statusMessage = messages.find((message) => message.type === "status");
  const repairMessage =
    "Validation Index is missing. Run Deep Audit Repair to rebuild the Validation Index before ordinary cleanup.";

  assert.deepEqual(readOperationMessages(messages), [
    {
      operation: "clean-stale-indexes",
      state: "running",
      message: "Clean Stale Indexes is running.",
    },
    {
      operation: "clean-stale-indexes",
      state: "idle",
    },
  ]);
  assert.equal(statusMessage.tone, "error");
  assert.equal(statusMessage.message, repairMessage);
  assert.deepEqual(notifications, [
    "Clean Stale Indexes started.",
    `Clean Stale Indexes failed: ${repairMessage}`,
  ]);
});

test("deep audit repair reports remaining validation errors after rebuilding the index", async () => {
  const page = createPage();
  const liveEndpoint = createNode(page, "live-endpoint", 120);
  const connectorsContainer = createNode(page, "FFA Connectors", 800);
  const orphanConnector = createNode(connectorsContainer, "connector-orphan-root", 840);
  const messages = [];
  const notifications = [];

  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  setConnectorRecord(orphanConnector, "connector-orphan", "deleted-start", liveEndpoint.id, "open");
  connectorsContainer.children = [orphanConnector];
  page.children = [liveEndpoint, connectorsContainer];
  globalThis.figma = createFigmaStub(page, messages, [], notifications);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "deep-audit-repair-index" });
  await flushPluginMessage(messages);

  const reportMessage = messages.find((message) => message.type === "validation-report");
  const statusMessage = messages.find((message) => message.type === "status");

  assert.ok(reportMessage);
  assert.deepEqual(
    reportMessage.report.issues.map((issue) => issue.code),
    ["flow-connector-orphaned"],
  );
  assert.equal(statusMessage.tone, "error");
  assert.equal(
    statusMessage.message,
    "Deep Audit Repair rebuilt the Validation Index on 2 container(s), cleaned 0 Flow Endpoint(s), and removed 0 stale connector reference(s). Validation still reports 1 error(s).",
  );
  assert.deepEqual(notifications, [
    "Deep Audit Repair started.",
    "Deep Audit Repair rebuilt the Validation Index on 2 container(s), cleaned 0 Flow Endpoint(s), and removed 0 stale connector reference(s). Validation still reports 1 error(s).",
  ]);
});

function readOperationMessages(messages) {
  return messages
    .filter((message) => message.type === "validation-operation")
    .map((message) => ({
      operation: message.operation,
      state: message.state,
      ...(message.message === undefined ? {} : { message: message.message }),
    }));
}
