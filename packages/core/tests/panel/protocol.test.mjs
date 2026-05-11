import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("classifies panel messages into adapter dispatch decisions", async () => {
  const core = await importCoreModule();

  assert.deepEqual(core.classifyPanelMessage({ type: "close" }), { kind: "close" });
  assert.deepEqual(core.classifyPanelMessage({ type: "request-selection-state" }), {
    kind: "request-selection-state",
  });
  assert.deepEqual(core.classifyPanelMessage({ type: "create-annotation", body: "Check copy" }), {
    kind: "command",
    command: { type: "create-annotation", body: "Check copy" },
  });
  assert.deepEqual(core.classifyPanelMessage({ type: "create-connector", flowAction: "" }), {
    kind: "command",
    command: { type: "create-connector", flowAction: "" },
  });
  assert.deepEqual(
    core.classifyPanelMessage({
      type: "locate-validation-issue",
      issueId: "connector-reverse-index-stale-1",
    }),
    {
      kind: "command",
      command: {
        type: "locate-validation-issue",
        issueId: "connector-reverse-index-stale-1",
      },
    },
  );
  assert.deepEqual(core.classifyPanelMessage({ type: "validate-bindings" }), {
    kind: "command",
    command: { type: "validate-bindings" },
  });
  assert.deepEqual(core.classifyPanelMessage({ type: "deep-audit-repair-index" }), {
    kind: "command",
    command: { type: "deep-audit-repair-index" },
  });
});

test("rejects unsupported or malformed panel messages before adapter dispatch", async () => {
  const core = await importCoreModule();

  assert.throws(
    () => core.classifyPanelMessage({ type: "create-annotation" }),
    /Annotation Body must be a string/,
  );
  assert.throws(
    () => core.classifyPanelMessage({ type: "create-connector", flowAction: 3 }),
    /Flow Action must be a string/,
  );
  assert.throws(
    () => core.classifyPanelMessage({ type: "unknown-command" }),
    /Unsupported Flow Annotator panel message/,
  );
  assert.throws(() => core.classifyPanelMessage(null), /must include a type/);
});

test("builds panel-facing selection, status, and report payloads", async () => {
  const core = await importCoreModule();
  const report = {
    schemaVersion: 1,
    summary: { all: 1, errors: 0, warnings: 1, info: 0 },
    issues: [
      {
        affectedObjectCount: 2,
        code: "connector-reverse-index-stale",
        description: "A Flow Endpoint has connectorRefs pointing to deleted Flow Connectors.",
        id: "connector-reverse-index-stale-1",
        locationNodeIds: ["endpoint-a", "endpoint-b"],
        severity: "warning",
        title: "Stale Reverse Index",
      },
    ],
  };

  assert.deepEqual(core.buildPanelStatusMessage("success", "Annotation created."), {
    type: "status",
    tone: "success",
    message: "Annotation created.",
  });
  assert.deepEqual(core.buildPanelValidationReportMessage(report), {
    type: "validation-report",
    report,
  });
  assert.deepEqual(
    core.buildPanelValidationOperationMessage({
      message: "Validate Bindings is running.",
      operation: "validate-bindings",
      state: "running",
    }),
    {
      type: "validation-operation",
      operation: "validate-bindings",
      state: "running",
      message: "Validate Bindings is running.",
    },
  );
  assert.deepEqual(
    core.buildPanelValidationOperationMessage({
      operation: "validate-bindings",
      state: "idle",
    }),
    {
      type: "validation-operation",
      operation: "validate-bindings",
      state: "idle",
    },
  );
  assert.deepEqual(
    core.buildPanelSelectionStateMessage({
      connector: {
        endpoints: [
          { id: "start-node", name: "Start Frame" },
          { id: "end-node", name: "End Frame" },
        ],
        existingConnector: {
          flowAction: null,
          id: "connector-1",
          nodeId: "connector-node-1",
        },
        routingStatus: "Route preview pending router validation.",
      },
      selectedNodes: [
        { hasGeneratedAncestor: false, isAnnotationCard: false },
        { hasGeneratedAncestor: true, isAnnotationCard: true },
      ],
    }),
    {
      type: "selection-state",
      totalCount: 2,
      eligibleCount: 1,
      selectedAnnotationCardCount: 1,
      connectorEndpoints: [
        { id: "start-node", name: "Start Frame" },
        { id: "end-node", name: "End Frame" },
      ],
      existingConnector: {
        flowAction: null,
        id: "connector-1",
        nodeId: "connector-node-1",
      },
      routingStatus: "Route preview pending router validation.",
    },
  );
});

test("formats panel statuses for connector refresh and stale-index cleanup", async () => {
  const core = await importCoreModule();

  assert.equal(
    core.formatRefreshConnectorsPanelStatus({
      failedCount: 0,
      failures: [],
      refreshedCount: 2,
      selectedOnly: false,
    }),
    "Refreshed 2 current-page Flow Connector(s).",
  );
  assert.equal(
    core.formatRefreshConnectorsPanelStatus({
      failedCount: 1,
      failures: ["Connector A: Missing Flow Endpoint."],
      refreshedCount: 1,
      selectedOnly: true,
    }),
    "Refreshed 1 selected Flow Connector(s); 1 failed. Connector A: Missing Flow Endpoint.",
  );
  assert.equal(
    core.formatCleanStaleIndexesPanelStatus({
      cleanedEndpointCount: 2,
      removedConnectorRefCount: 2,
    }),
    "Cleaned stale indexes on 2 Flow Endpoint(s); removed 2 stale connector reference(s).",
  );
  assert.equal(
    core.formatDeepAuditRepairIndexPanelStatus({
      cleanedEndpointCount: 2,
      removedConnectorRefCount: 2,
      repairedContainerCount: 2,
    }),
    "Deep Audit Repair rebuilt the Validation Index on 2 container(s), cleaned 2 Flow Endpoint(s), and removed 2 stale connector reference(s).",
  );
});
