import type { FlowConnectorRecord } from "../shared/plugin-data.ts";
import type { ValidationIndexRecord } from "../validation/validation-index.ts";
import type { FlowEndpointInput } from "./operations.ts";
import { getFlowConnectorValidationIndexNodeIds } from "./operations.ts";

export type FlowConnectorRouteDependencyRole =
  | "flow-endpoint"
  | "existing-flow-connector"
  | "connector-obstacle-candidate"
  | "flow-action-label";

export type FlowConnectorRouteDependencyClassification =
  | "selected-start-endpoint"
  | "selected-end-endpoint"
  | "selected-endpoint"
  | "existing-flow-connector-root"
  | "connector-record-endpoint"
  | "connector-record-context-frame"
  | "connector-record-owner-context-frame"
  | "endpoint-context-frame"
  | "annotation-card"
  | "context-frame"
  | "owner-context-frame"
  | "validation-index-obstacle-candidate"
  | "flow-action-label";

export interface FlowConnectorRouteDependency {
  nodeId: string;
  role: FlowConnectorRouteDependencyRole;
  classification: FlowConnectorRouteDependencyClassification;
  sourceConnectorNodeId?: string;
}

export interface ExistingFlowConnectorRouteDependencyInput {
  nodeId: string;
  record: FlowConnectorRecord;
}

export interface FlowConnectorRouteDependencyPlan {
  dependencies: FlowConnectorRouteDependency[];
  existingConnectors: ExistingFlowConnectorRouteDependencyInput[];
}

export interface PlanCreateFlowConnectorRouteDependenciesInput {
  endpoints: FlowEndpointInput[];
  existingConnectors: ExistingFlowConnectorRouteDependencyInput[];
  validationIndex: ValidationIndexRecord;
}

export interface PlanRefreshFlowConnectorRouteDependenciesInput {
  connectors: ExistingFlowConnectorRouteDependencyInput[];
  selectedConnectorNodeIds?: string[];
  validationIndex: ValidationIndexRecord;
}

export interface PlanValidateFlowConnectorRouteDependenciesInput {
  connectors: ExistingFlowConnectorRouteDependencyInput[];
  explicitObstacleCandidateNodeIds?: Iterable<string>;
  validationIndex: ValidationIndexRecord;
}

export function planCreateFlowConnectorRouteDependencies(
  input: PlanCreateFlowConnectorRouteDependenciesInput,
): FlowConnectorRouteDependencyPlan {
  const dependencies = new RouteDependencyBuilder();

  input.endpoints.forEach((endpoint, index) => {
    dependencies.add({
      nodeId: endpoint.id,
      role: "flow-endpoint",
      classification: toSelectedEndpointClassification(index),
    });
    dependencies.add({
      nodeId: endpoint.contextFrameId,
      role: "connector-obstacle-candidate",
      classification: "endpoint-context-frame",
    });
  });
  addValidationIndexObstacleDependencies(dependencies, input.validationIndex);
  addExistingConnectorDependencies(dependencies, input.existingConnectors);

  return {
    dependencies: dependencies.toArray(),
    existingConnectors: input.existingConnectors,
  };
}

export function planRefreshFlowConnectorRouteDependencies(
  input: PlanRefreshFlowConnectorRouteDependenciesInput,
): FlowConnectorRouteDependencyPlan {
  const dependencies = new RouteDependencyBuilder();

  addValidationIndexObstacleDependencies(dependencies, input.validationIndex);
  addExistingConnectorDependencies(
    dependencies,
    input.selectedConnectorNodeIds === undefined
      ? input.connectors
      : input.connectors.filter((connector) =>
          input.selectedConnectorNodeIds?.includes(connector.nodeId),
        ),
  );

  return {
    dependencies: dependencies.toArray(),
    existingConnectors: input.connectors,
  };
}

export function planValidateFlowConnectorRouteDependencies(
  input: PlanValidateFlowConnectorRouteDependenciesInput,
): FlowConnectorRouteDependencyPlan {
  const dependencies = new RouteDependencyBuilder();

  addValidationIndexObstacleDependencies(dependencies, input.validationIndex);
  for (const nodeId of input.explicitObstacleCandidateNodeIds ?? []) {
    dependencies.add({
      nodeId,
      role: "connector-obstacle-candidate",
      classification: "validation-index-obstacle-candidate",
    });
  }
  addExistingConnectorDependencies(dependencies, input.connectors);

  return {
    dependencies: dependencies.toArray(),
    existingConnectors: input.connectors,
  };
}

export function collectFlowConnectorRouteDependencyNodeIds(
  dependencies: Iterable<FlowConnectorRouteDependency>,
  role?: FlowConnectorRouteDependencyRole,
): string[] {
  const nodeIds: string[] = [];
  for (const dependency of dependencies) {
    if (role !== undefined && dependency.role !== role) {
      continue;
    }
    if (!nodeIds.includes(dependency.nodeId)) {
      nodeIds.push(dependency.nodeId);
    }
  }
  return nodeIds;
}

function addExistingConnectorDependencies(
  dependencies: RouteDependencyBuilder,
  connectors: Iterable<ExistingFlowConnectorRouteDependencyInput>,
): void {
  for (const connector of connectors) {
    dependencies.add({
      nodeId: connector.nodeId,
      role: "existing-flow-connector",
      classification: "existing-flow-connector-root",
      sourceConnectorNodeId: connector.nodeId,
    });

    const indexNodeIds = getFlowConnectorValidationIndexNodeIds(connector.record);
    addDependencyGroup(dependencies, indexNodeIds.flowEndpointNodeIds, {
      role: "flow-endpoint",
      classification: "connector-record-endpoint",
      sourceConnectorNodeId: connector.nodeId,
    });
    addDependencyGroup(dependencies, indexNodeIds.contextFrameIds, {
      role: "connector-obstacle-candidate",
      classification: "connector-record-context-frame",
      sourceConnectorNodeId: connector.nodeId,
    });
    addDependencyGroup(dependencies, indexNodeIds.ownerContextFrameIds, {
      role: "connector-obstacle-candidate",
      classification: "connector-record-owner-context-frame",
      sourceConnectorNodeId: connector.nodeId,
    });
    addDependencyGroup(dependencies, indexNodeIds.connectorObstacleCandidateNodeIds, {
      role: "connector-obstacle-candidate",
      classification: "validation-index-obstacle-candidate",
      sourceConnectorNodeId: connector.nodeId,
    });
  }
}

function addValidationIndexObstacleDependencies(
  dependencies: RouteDependencyBuilder,
  validationIndex: ValidationIndexRecord,
): void {
  const annotationBadgeNodeIds = new Set(validationIndex.annotationBadgeNodeIds);

  addDependencyGroup(dependencies, validationIndex.annotationCardNodeIds, {
    role: "connector-obstacle-candidate",
    classification: "annotation-card",
  });
  addDependencyGroup(dependencies, validationIndex.contextFrameIds, {
    role: "connector-obstacle-candidate",
    classification: "context-frame",
  });
  addDependencyGroup(dependencies, validationIndex.ownerContextFrameIds, {
    role: "connector-obstacle-candidate",
    classification: "owner-context-frame",
  });
  addDependencyGroup(
    dependencies,
    validationIndex.connectorObstacleCandidateNodeIds.filter(
      (nodeId) => !annotationBadgeNodeIds.has(nodeId),
    ),
    {
      role: "connector-obstacle-candidate",
      classification: "validation-index-obstacle-candidate",
    },
  );
}

function addDependencyGroup(
  dependencies: RouteDependencyBuilder,
  nodeIds: Iterable<string>,
  metadata: Omit<FlowConnectorRouteDependency, "nodeId">,
): void {
  for (const nodeId of nodeIds) {
    dependencies.add({ nodeId, ...metadata });
  }
}

function toSelectedEndpointClassification(
  index: number,
): FlowConnectorRouteDependencyClassification {
  if (index === 0) {
    return "selected-start-endpoint";
  }
  if (index === 1) {
    return "selected-end-endpoint";
  }
  return "selected-endpoint";
}

class RouteDependencyBuilder {
  readonly #dependencies = new Map<string, FlowConnectorRouteDependency>();

  add(dependency: FlowConnectorRouteDependency): void {
    if (dependency.nodeId.length === 0) {
      return;
    }

    this.#dependencies.set(
      [
        dependency.nodeId,
        dependency.role,
        dependency.classification,
        dependency.sourceConnectorNodeId ?? "",
      ].join("\0"),
      dependency,
    );
  }

  toArray(): FlowConnectorRouteDependency[] {
    return [...this.#dependencies.values()];
  }
}
