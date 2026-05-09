import {
  ConnectorRouteFailure,
  getFinalRouteSegment,
  getIncomingSide,
  routeIntersectsObstacles,
  routeOrthogonalConnector,
  segmentKey,
  undirectedSegmentKey,
} from "../connectors/routing.ts";
import type {
  CleanStaleIndexesOperationBatch,
  SetSharedPluginDataOperation,
} from "../figma-file/operation-types.ts";
import { SHARED_PLUGIN_DATA } from "../shared/plugin-data.ts";
import {
  addIssue,
  countUnique,
  groupBy,
  rectsOverlap,
  routePointsEqual,
  summarizeValidationIssues,
} from "./report.ts";
import type {
  BuildCleanStaleIndexesOperationBatchInput,
  ValidateFlowConnectorReferencesInput,
  ValidateFlowConnectorRouteGeometryInput,
  ValidationIssue,
  ValidationReport,
} from "./types.ts";

export function validateFlowConnectorReferences(
  input: ValidateFlowConnectorReferencesInput,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const endpointsById = new Map(input.endpoints.map((endpoint) => [endpoint.nodeId, endpoint]));
  const liveConnectorIds = new Set(input.connectors.map((connector) => connector.record.id));

  const orphanTargets: string[] = [];
  const orphanConnectorNodeIds: string[] = [];
  input.connectors.forEach((connector) => {
    const endpointIds = [connector.record.start.nodeId, connector.record.end.nodeId];
    if (endpointIds.every((endpointId) => endpointsById.has(endpointId))) {
      return;
    }

    orphanConnectorNodeIds.push(connector.nodeId);
    orphanTargets.push(
      connector.nodeId,
      ...endpointIds.filter((endpointId) => endpointsById.has(endpointId)),
    );
  });
  addIssue(issues, {
    code: "flow-connector-orphaned",
    severity: "error",
    title: "Orphaned Flow Connector",
    affectedObjectCount: countUnique(orphanConnectorNodeIds),
    description: "A Flow Connector is missing its start or end Flow Endpoint.",
    locationNodeIds: orphanTargets,
  });

  const invalidEndpointTargets: string[] = [];
  const invalidConnectorNodeIds: string[] = [];
  input.connectors.forEach((connector) => {
    const invalidEndpointIds = [connector.record.start.nodeId, connector.record.end.nodeId].filter(
      (endpointId) => endpointsById.get(endpointId)?.isEligibleFlowEndpoint === false,
    );
    if (invalidEndpointIds.length === 0) {
      return;
    }

    invalidConnectorNodeIds.push(connector.nodeId);
    invalidEndpointTargets.push(connector.nodeId, ...invalidEndpointIds);
  });
  addIssue(issues, {
    code: "flow-endpoint-invalid",
    severity: "error",
    title: "Invalid Flow Endpoint",
    affectedObjectCount: countUnique(invalidConnectorNodeIds),
    description: "A Flow Connector points to a node that is not a valid Flow Endpoint.",
    locationNodeIds: invalidEndpointTargets,
  });

  const duplicateTargets: string[] = [];
  const duplicateConnectorNodeIds: string[] = [];
  groupBy(
    input.connectors,
    (connector) => `${connector.record.start.nodeId}\u0000${connector.record.end.nodeId}`,
  ).forEach((connectors) => {
    if (connectors.length <= 1) {
      return;
    }

    duplicateConnectorNodeIds.push(...connectors.map((connector) => connector.nodeId));
    duplicateTargets.push(
      ...connectors.map((connector) => connector.nodeId),
      ...[connectors[0].record.start.nodeId, connectors[0].record.end.nodeId].filter((endpointId) =>
        endpointsById.has(endpointId),
      ),
    );
  });
  addIssue(issues, {
    code: "flow-connector-duplicate",
    severity: "error",
    title: "Duplicate Flow Connector",
    affectedObjectCount: countUnique(duplicateConnectorNodeIds),
    description: "Multiple Flow Connectors use the same ordered start and end Flow Endpoints.",
    locationNodeIds: duplicateTargets,
  });

  const emptyActionTargets = input.connectors
    .filter(
      (connector) =>
        connector.record.flowAction === null || connector.record.flowAction.trim().length === 0,
    )
    .map((connector) => connector.nodeId);
  addIssue(issues, {
    code: "flow-action-empty",
    severity: "warning",
    title: "Empty Flow Action",
    affectedObjectCount: emptyActionTargets.length,
    description: "A Flow Connector has no Flow Action label.",
    locationNodeIds: emptyActionTargets,
  });

  const staleReverseIndexTargets = input.endpoints
    .filter((endpoint) =>
      endpoint.connectorIds.some((connectorId) => !liveConnectorIds.has(connectorId)),
    )
    .map((endpoint) => endpoint.nodeId);
  addIssue(issues, {
    code: "connector-reverse-index-stale",
    severity: "warning",
    title: "Stale Reverse Index",
    affectedObjectCount: staleReverseIndexTargets.length,
    description: "A Flow Endpoint has connectorRefs pointing to deleted Flow Connectors.",
    locationNodeIds: staleReverseIndexTargets,
  });

  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}

export function validateFlowConnectorRouteGeometry(
  input: ValidateFlowConnectorRouteGeometryInput,
): ValidationReport {
  const issues: ValidationIssue[] = [];

  const crossingTargets = input.connectors
    .filter((connector) => {
      const routePoints = connector.record.routeCache?.points;
      if (routePoints === undefined) {
        return false;
      }
      return routeIntersectsObstacles(
        routePoints,
        connector.obstacles.map((obstacle) => obstacle.rect),
      );
    })
    .map((connector) => connector.nodeId);
  addIssue(issues, {
    code: "connector-route-crosses-obstacle",
    severity: "error",
    title: "Connector Route Crosses Obstacle",
    affectedObjectCount: crossingTargets.length,
    description: "A Connector Route crosses a Connector Obstacle.",
    locationNodeIds: crossingTargets,
  });

  const routingFailureTargets: string[] = [];
  const refreshableTargets: string[] = [];
  input.connectors.forEach((connector) => {
    if (connector.startRect === undefined || connector.endRect === undefined) {
      return;
    }

    try {
      const refreshedRoute = routeOrthogonalConnector({
        startRect: connector.startRect,
        endRect: connector.endRect,
        obstacles: connector.obstacles,
      });
      if (
        connector.record.routeCache !== undefined &&
        !routePointsEqual(connector.record.routeCache.points, refreshedRoute.points)
      ) {
        refreshableTargets.push(connector.nodeId);
      }
    } catch (error: unknown) {
      if (error instanceof ConnectorRouteFailure) {
        routingFailureTargets.push(connector.nodeId);
        return;
      }
      throw error;
    }
  });
  addIssue(issues, {
    code: "connector-routing-failure",
    severity: "error",
    title: "Connector Routing Failure",
    affectedObjectCount: routingFailureTargets.length,
    description:
      "A Flow Connector cannot produce a legal Orthogonal Route around current Connector Obstacles.",
    locationNodeIds: routingFailureTargets,
  });

  const labelOverlapTargets: string[] = [];
  const connectorsWithLabels = input.connectors.filter(
    (connector) => connector.labelRect !== undefined,
  );
  connectorsWithLabels.forEach((connector, index) => {
    connectorsWithLabels.slice(index + 1).forEach((otherConnector) => {
      if (
        connector.labelRect !== undefined &&
        otherConnector.labelRect !== undefined &&
        rectsOverlap(connector.labelRect, otherConnector.labelRect)
      ) {
        labelOverlapTargets.push(connector.nodeId, otherConnector.nodeId);
      }
    });
  });
  addIssue(issues, {
    code: "flow-action-label-overlap",
    severity: "warning",
    title: "Flow Action Label Overlap",
    affectedObjectCount: countUnique(labelOverlapTargets),
    description: "Visible Flow Action labels overlap each other.",
    locationNodeIds: labelOverlapTargets,
  });

  addIssue(issues, {
    code: "connector-route-refreshable",
    severity: "info",
    title: "Connector Route Can Be Refreshed",
    affectedObjectCount: countUnique(refreshableTargets),
    description:
      "A stored Connector Route differs from the route generated from current endpoints and Connector Obstacles.",
    locationNodeIds: refreshableTargets,
  });

  addTrunkIssues(issues, input);

  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}

export function buildCleanStaleIndexesOperationBatch(
  input: BuildCleanStaleIndexesOperationBatchInput,
): CleanStaleIndexesOperationBatch {
  const liveConnectorIds = new Set(input.liveConnectorIds);
  const operations: SetSharedPluginDataOperation[] = [];
  const cleanedEndpointNodeIds: string[] = [];
  const removedConnectorIds: string[] = [];

  input.endpoints.forEach((endpoint) => {
    const staleConnectorIds = endpoint.connectorIds.filter(
      (connectorId) => !liveConnectorIds.has(connectorId),
    );
    if (staleConnectorIds.length === 0) {
      return;
    }

    cleanedEndpointNodeIds.push(endpoint.nodeId);
    removedConnectorIds.push(...staleConnectorIds);
    operations.push({
      type: "set-shared-plugin-data",
      target: { kind: "existing-node", nodeId: endpoint.nodeId },
      key: SHARED_PLUGIN_DATA.keys.connectorRefs,
      value: {
        schemaVersion: 1,
        connectorIds: endpoint.connectorIds.filter((connectorId) =>
          liveConnectorIds.has(connectorId),
        ),
      },
    });
  });

  return {
    schemaVersion: 1,
    kind: "clean-stale-indexes",
    cleanedEndpointNodeIds,
    removedConnectorIds,
    operations,
  };
}

export function mergeValidationReports(reports: ValidationReport[]): ValidationReport {
  const issues = reports.flatMap((report) => report.issues);
  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}

function addTrunkIssues(
  issues: ValidationIssue[],
  input: ValidateFlowConnectorRouteGeometryInput,
): void {
  const trunkDescriptors = input.connectors.flatMap((connector) => {
    const points = connector.record.routeCache?.points;
    if (points === undefined) {
      return [];
    }
    const finalSegment = getFinalRouteSegment(points);
    if (finalSegment === null) {
      return [];
    }
    const incomingSide = getIncomingSide(finalSegment);
    if (incomingSide === null) {
      return [];
    }
    return [
      {
        connector,
        finalSegment,
        incomingSide,
      },
    ];
  });

  const missingTrunkTargets: string[] = [];
  groupBy(
    trunkDescriptors,
    (descriptor) => `${descriptor.connector.record.end.nodeId}\u0000${descriptor.incomingSide}`,
  ).forEach((group) => {
    const uniqueStartIds = new Set(
      group.map((descriptor) => descriptor.connector.record.start.nodeId),
    );
    if (group.length < 2 || uniqueStartIds.size < 2) {
      return;
    }
    const finalSegments = new Set(group.map((descriptor) => segmentKey(descriptor.finalSegment)));
    if (finalSegments.size > 1) {
      missingTrunkTargets.push(...group.map((descriptor) => descriptor.connector.nodeId));
    }
  });
  addIssue(issues, {
    code: "connector-trunk-missing",
    severity: "warning",
    title: "Missing Connector Trunk",
    affectedObjectCount: countUnique(missingTrunkTargets),
    description:
      "Flow Connectors entering the same Flow Endpoint from the same direction do not share a Connector Trunk.",
    locationNodeIds: missingTrunkTargets,
  });

  const unexpectedTrunkTargets: string[] = [];
  groupBy(trunkDescriptors, (descriptor) => undirectedSegmentKey(descriptor.finalSegment)).forEach(
    (group) => {
      if (group.length < 2) {
        return;
      }
      const endNodeIds = new Set(group.map((descriptor) => descriptor.connector.record.end.nodeId));
      const incomingSides = new Set(group.map((descriptor) => descriptor.incomingSide));
      const orderedPairs = new Set(
        group.map(
          (descriptor) =>
            `${descriptor.connector.record.start.nodeId}\u0000${descriptor.connector.record.end.nodeId}`,
        ),
      );
      const uniqueStartIds = new Set(
        group.map((descriptor) => descriptor.connector.record.start.nodeId),
      );
      const isAllowedSharedTrunk =
        endNodeIds.size === 1 && incomingSides.size === 1 && uniqueStartIds.size >= 2;
      const isDuplicatePairOnly = orderedPairs.size === 1;
      if (!isAllowedSharedTrunk && !isDuplicatePairOnly) {
        unexpectedTrunkTargets.push(...group.map((descriptor) => descriptor.connector.nodeId));
      }
    },
  );
  addIssue(issues, {
    code: "connector-trunk-unexpected",
    severity: "error",
    title: "Unexpected Connector Trunk",
    affectedObjectCount: countUnique(unexpectedTrunkTargets),
    description:
      "Flow Connectors with different Flow Endpoints or opposite directions share a Connector Trunk.",
    locationNodeIds: unexpectedTrunkTargets,
  });
}
