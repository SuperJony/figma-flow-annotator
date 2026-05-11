import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("builds repair validation state batches from Annotation and Flow Connector facts", async () => {
  const core = await importCoreModule();
  const now = "2026-05-09T00:00:00.000Z";
  const connectorRecord = core.createFlowConnectorRecord({
    connectorId: "connector-1",
    end: { contextFrameId: "frame-2", nodeId: "end-1" },
    flowAction: "open",
    now,
    ownerContextFrameId: "frame-1",
    start: { contextFrameId: "frame-1", nodeId: "start-1" },
  });

  const batch = core.buildRepairValidationStateOperationBatch({
    annotations: {
      badges: [
        {
          nodeId: "badge-1",
          record: {
            schemaVersion: 1,
            annotationId: "annotation-1",
            annotationNumber: 1,
            contextFrameId: "frame-1",
            subjectNodeId: "subject-1",
          },
        },
      ],
      cards: [
        {
          nodeId: "card-1",
          record: {
            id: "annotation-1",
            annotationNumber: 1,
            body: "Review submit state.",
            contextFrameId: "frame-1",
            subjectNodeIds: ["subject-1"],
          },
        },
      ],
    },
    cleanBatch: {
      schemaVersion: 1,
      kind: "clean-stale-indexes",
      cleanedEndpointNodeIds: [],
      removedConnectorIds: [],
      operations: [],
    },
    flowConnectors: {
      connectors: [{ nodeId: "connector-root-1", record: connectorRecord }],
      endpoints: [
        { nodeId: "start-1", connectorIds: ["connector-1"], isEligibleFlowEndpoint: true },
        { nodeId: "former-endpoint", connectorIds: ["connector-1"], isEligibleFlowEndpoint: true },
      ],
      liveValidationNodeIds: ["start-1", "end-1", "frame-1", "frame-2", "former-endpoint"],
    },
  });

  assert.equal(batch.kind, "repair-validation-state");
  assert.deepEqual(batch.repairedContainerRefs, ["annotations-container", "connectors-container"]);
  assert.deepEqual(
    batch.operations.map((operation) => operation.type),
    [
      "ensure-container",
      "set-shared-plugin-data",
      "set-shared-plugin-data",
      "ensure-container",
      "set-shared-plugin-data",
      "set-shared-plugin-data",
    ],
  );
  assert.deepEqual(batch.operations[2].value.subjectNodeIds, ["subject-1"]);
  assert.deepEqual(batch.operations[5].value.flowEndpointNodeIds, [
    "start-1",
    "end-1",
    "former-endpoint",
  ]);
});
