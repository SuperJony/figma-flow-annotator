import assert from "node:assert/strict";
import { test as nodeTest } from "node:test";

import {
  createFigmaStub,
  createNode,
  createPage,
  flushPluginMessage,
  importCodeModule,
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
  const messages = [];
  const notifications = [];

  setValidationIndex(page, {});
  page.children = [];
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
  page.setSharedPluginData = () => {
    throw new Error("Unable to write validation data.");
  };

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "repair-validation-state" });
  await flushPluginMessage(messages);

  const statusMessage = messages.find((message) => message.type === "status");

  assert.deepEqual(readOperationMessages(messages), [
    {
      operation: "repair-validation-state",
      state: "running",
      message: "Repair Validation State is running.",
    },
    {
      operation: "repair-validation-state",
      state: "idle",
    },
  ]);
  assert.equal(statusMessage.tone, "error");
  assert.equal(
    statusMessage.message,
    "Repair Validation State failed: Unable to write validation data.",
  );
  assert.deepEqual(notifications, [
    "Repair Validation State started.",
    "Repair Validation State failed: Unable to write validation data.",
  ]);
});

test("cleanup repair-required results notify failure without changing the panel status wording", async () => {
  const page = createPage();
  const messages = [];
  const notifications = [];

  page.children = [];
  globalThis.figma = createFigmaStub(page, messages, [], notifications);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "clean-stale-indexes" });
  await flushPluginMessage(messages);

  const statusMessage = messages.find((message) => message.type === "status");
  const repairMessage =
    "Validation data is missing. Run Repair Validation State before cleaning stale connector references.";

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
  assert.equal(statusMessage.validationRepairRequired, true);
  assert.deepEqual(notifications, [
    "Clean Stale Indexes started.",
    `Clean Stale Indexes failed: ${repairMessage}`,
  ]);
});

test("repair validation state reports remaining validation errors after rebuilding validation data", async () => {
  const page = createPage();
  const liveEndpoint = createNode(page, "live-endpoint", 120);
  const orphanConnector = createNode(page, "connector-orphan-root", 840);
  const messages = [];
  const notifications = [];

  setConnectorRecord(orphanConnector, "connector-orphan", "deleted-start", liveEndpoint.id, "open");
  page.children = [liveEndpoint, orphanConnector];
  globalThis.figma = createFigmaStub(page, messages, [], notifications);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "repair-validation-state" });
  await flushPluginMessage(messages);

  const expectedStatus =
    "Repair Validation State refreshed project validation data, cleaned 0 Flow Endpoint(s), and removed 0 stale connector reference(s). Validation still reports 1 error(s).";
  const reportMessage = messages.find((message) => message.type === "validation-report");
  const statusMessage = messages.find((message) => message.type === "status");

  assert.ok(reportMessage);
  assert.deepEqual(
    reportMessage.report.issues.map((issue) => issue.code),
    ["flow-connector-orphaned"],
  );
  assert.equal(statusMessage.tone, "error");
  assert.equal(statusMessage.message, expectedStatus);
  assert.deepEqual(notifications, ["Repair Validation State started.", expectedStatus]);
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
