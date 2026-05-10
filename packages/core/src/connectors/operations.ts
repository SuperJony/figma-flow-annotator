import type {
  CreateFlowConnectorOperationBatch,
  FigmaFileOperation,
  RefreshFlowConnectorOperationBatch,
} from "../figma-file/operation-types.ts";
import type { Point } from "../shared/geometry.ts";
import type { FlowConnectorRecord } from "../shared/plugin-data.ts";
import {
  CONNECTORS_CONTAINER_NAME,
  createFlowConnectorRecord,
  flowConnectorMatchesDirectedPair,
  formatFlowConnectorName,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "../shared/plugin-data.ts";
import { buildFlowConnectorVisualModel } from "./visual-model.ts";

export interface FlowEndpointInput {
  id: string;
  name: string;
  contextFrameId: string;
}

export interface BuildCreateFlowConnectorOperationBatchInput {
  connectorId: string;
  existingConnector?: {
    nodeId: string;
    record: FlowConnectorRecord;
  };
  start: FlowEndpointInput;
  end: FlowEndpointInput;
  ownerContextFrameId: string;
  flowAction: string;
  routePoints: Point[];
  now: string;
}

export interface BuildRefreshFlowConnectorOperationBatchInput {
  connectorNodeId: string;
  endName: string;
  now: string;
  record: FlowConnectorRecord;
  routePoints: Point[];
  startName: string;
}

export function buildCreateFlowConnectorOperationBatch(
  input: BuildCreateFlowConnectorOperationBatchInput,
): CreateFlowConnectorOperationBatch {
  if (input.start.id === input.end.id) {
    throw new Error("Create Flow Connector requires two different Flow Endpoints.");
  }

  const flowAction = input.flowAction.trim();
  const normalizedFlowAction = flowAction.length > 0 ? flowAction : null;
  const connectorId = input.existingConnector?.record.id ?? input.connectorId;
  const record = createFlowConnectorRecord({
    connectorId,
    createdAt: input.existingConnector?.record.createdAt,
    end: {
      contextFrameId: input.end.contextFrameId,
      nodeId: input.end.id,
    },
    flowAction: normalizedFlowAction,
    now: input.now,
    ownerContextFrameId: input.ownerContextFrameId,
    routePoints: input.routePoints,
    start: {
      contextFrameId: input.start.contextFrameId,
      nodeId: input.start.id,
    },
  });
  const connectorRef = "flow-connector";
  const existingConnector = input.existingConnector;

  if (existingConnector !== undefined) {
    if (!flowConnectorMatchesDirectedPair(existingConnector.record, input.start.id, input.end.id)) {
      throw new Error("Existing Flow Connector does not match the directed endpoint pair.");
    }

    if (
      existingConnector.record.flowAction === normalizedFlowAction &&
      routePointsEqual(existingConnector.record.routeCache?.points, input.routePoints)
    ) {
      return {
        schemaVersion: 1,
        kind: "create-flow-connector",
        connectorId: existingConnector.record.id,
        mode: "idempotent",
        createdNodeRefs: [],
        existingNodeRefs: [existingConnector.nodeId],
        operations: [],
        record: existingConnector.record,
      };
    }

    const operations: FigmaFileOperation[] = [
      {
        type: "update-flow-connector",
        targetNodeId: existingConnector.nodeId,
        name: formatFlowConnectorName(input.start.name, input.end.name),
        routePoints: input.routePoints,
        flowAction: record.flowAction,
        visual: buildFlowConnectorVisualModel({
          flowAction: record.flowAction ?? "",
          routePoints: input.routePoints,
        }),
      },
      {
        type: "set-shared-plugin-data",
        target: { kind: "existing-node", nodeId: existingConnector.nodeId },
        key: SHARED_PLUGIN_DATA.keys.connector,
        value: record,
      },
    ];

    return {
      schemaVersion: 1,
      kind: "create-flow-connector",
      connectorId: existingConnector.record.id,
      mode: "update",
      createdNodeRefs: [],
      existingNodeRefs: [existingConnector.nodeId],
      operations,
      record,
    };
  }

  const operations: FigmaFileOperation[] = [
    {
      type: "ensure-container",
      ref: "connectors",
      name: CONNECTORS_CONTAINER_NAME,
    },
    {
      type: "set-shared-plugin-data",
      target: { kind: "container", ref: "connectors" },
      key: SHARED_PLUGIN_DATA.keys.kind,
      value: VISUAL_NODE_KINDS.container,
    },
    {
      type: "create-flow-connector",
      ref: connectorRef,
      containerRef: "connectors",
      name: formatFlowConnectorName(input.start.name, input.end.name),
      routePoints: input.routePoints,
      flowAction: record.flowAction,
      visual: buildFlowConnectorVisualModel({
        flowAction: record.flowAction ?? "",
        routePoints: input.routePoints,
      }),
    },
    {
      type: "set-shared-plugin-data",
      target: { kind: "created-node", ref: connectorRef },
      key: SHARED_PLUGIN_DATA.keys.kind,
      value: VISUAL_NODE_KINDS.flowConnector,
    },
    {
      type: "set-shared-plugin-data",
      target: { kind: "created-node", ref: connectorRef },
      key: SHARED_PLUGIN_DATA.keys.connector,
      value: record,
    },
    {
      type: "append-shared-reference",
      targetNodeId: input.start.id,
      key: SHARED_PLUGIN_DATA.keys.connectorRefs,
      listKey: "connectorIds",
      id: input.connectorId,
    },
    {
      type: "append-shared-reference",
      targetNodeId: input.end.id,
      key: SHARED_PLUGIN_DATA.keys.connectorRefs,
      listKey: "connectorIds",
      id: input.connectorId,
    },
  ];

  return {
    schemaVersion: 1,
    kind: "create-flow-connector",
    connectorId,
    mode: "create",
    createdNodeRefs: [connectorRef],
    existingNodeRefs: [],
    operations,
    record,
  };
}

export function buildRefreshFlowConnectorOperationBatch(
  input: BuildRefreshFlowConnectorOperationBatchInput,
): RefreshFlowConnectorOperationBatch {
  const record: FlowConnectorRecord = {
    ...input.record,
    routeCache: {
      schemaVersion: 1,
      points: input.routePoints,
    },
    updatedAt: routePointsEqual(input.record.routeCache?.points, input.routePoints)
      ? input.record.updatedAt
      : input.now,
  };

  if (routePointsEqual(input.record.routeCache?.points, input.routePoints)) {
    return {
      schemaVersion: 1,
      kind: "refresh-flow-connector",
      connectorId: input.record.id,
      mode: "idempotent",
      existingNodeRefs: [input.connectorNodeId],
      operations: [],
      record: input.record,
    };
  }

  return {
    schemaVersion: 1,
    kind: "refresh-flow-connector",
    connectorId: input.record.id,
    mode: "update",
    existingNodeRefs: [input.connectorNodeId],
    operations: [
      {
        type: "update-flow-connector",
        targetNodeId: input.connectorNodeId,
        name: formatFlowConnectorName(input.startName, input.endName),
        routePoints: input.routePoints,
        flowAction: input.record.flowAction,
        visual: buildFlowConnectorVisualModel({
          flowAction: input.record.flowAction ?? "",
          routePoints: input.routePoints,
        }),
      },
      {
        type: "set-shared-plugin-data",
        target: { kind: "existing-node", nodeId: input.connectorNodeId },
        key: SHARED_PLUGIN_DATA.keys.connector,
        value: record,
      },
    ],
    record,
  };
}

function routePointsEqual(first: Point[] | undefined, second: Point[]): boolean {
  if (first === undefined || first.length !== second.length) {
    return false;
  }

  return first.every(
    (point, index) =>
      Math.abs(point.x - second[index].x) < 0.001 && Math.abs(point.y - second[index].y) < 0.001,
  );
}
