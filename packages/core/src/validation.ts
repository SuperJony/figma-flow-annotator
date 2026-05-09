
import type { Point, RectLike } from './geometry.ts';
import type {
  AnnotationRecord,
  AnnotationRefsRecord,
  BadgeRefRecord,
  ConnectorRefsRecord,
  FlowConnectorRecord,
} from './shared-data.ts';
import { SHARED_PLUGIN_DATA } from './shared-data.ts';
import type {
  CleanStaleIndexesPlan,
  SetSharedPluginDataOperation,
} from './document-change-plans.ts';
import {
  ConnectorRouteFailure,
  getFinalRouteSegment,
  getIncomingSide,
  routeIntersectsObstacles,
  routeOrthogonalConnector,
  segmentKey,
  undirectedSegmentKey,
  type ConnectorObstacle,
} from './connector-routing.ts';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationIssueCode =
  | 'annotation-missing-badge'
  | 'annotation-duplicate-badge'
  | 'annotation-orphaned'
  | 'annotation-missing-body'
  | 'annotation-card-outside-design-notes-area'
  | 'annotation-cards-unsorted'
  | 'annotation-badges-unarranged'
  | 'flow-connector-orphaned'
  | 'flow-endpoint-invalid'
  | 'flow-connector-duplicate'
  | 'flow-action-empty'
  | 'connector-reverse-index-stale'
  | 'connector-route-crosses-obstacle'
  | 'connector-routing-failure'
  | 'flow-action-label-overlap'
  | 'connector-route-refreshable'
  | 'connector-trunk-missing'
  | 'connector-trunk-unexpected';

export interface ValidationIssue {
  id: string;
  code: ValidationIssueCode;
  severity: ValidationSeverity;
  title: string;
  affectedObjectCount: number;
  description: string;
  locationNodeIds: string[];
}

export interface ValidationReportSummary {
  all: number;
  errors: number;
  warnings: number;
  info: number;
}

export interface ValidationReport {
  schemaVersion: 1;
  issues: ValidationIssue[];
  summary: ValidationReportSummary;
}

export interface AnnotationValidationRecord {
  id: string;
  annotationNumber: number;
  body: string;
  contextFrameId: string;
  subjectNodeIds: string[];
}

export interface AnnotationValidationCardInput {
  nodeId: string;
  record: AnnotationValidationRecord;
  rect: RectLike;
}

export interface AnnotationValidationBadgeInput {
  nodeId: string;
  record: BadgeRefRecord;
  rect: RectLike;
}

export interface AnnotationValidationSubjectInput {
  nodeId: string;
  annotationIds: string[];
  rect?: RectLike;
}

export interface AnnotationValidationContextInput {
  nodeId: string;
  rect?: RectLike;
}

export interface ValidateAnnotationBindingsInput {
  badges: AnnotationValidationBadgeInput[];
  cards: AnnotationValidationCardInput[];
  contexts: AnnotationValidationContextInput[];
  subjects: AnnotationValidationSubjectInput[];
}

export interface FlowConnectorValidationConnectorInput {
  nodeId: string;
  record: FlowConnectorRecord;
}

export interface FlowConnectorValidationEndpointInput {
  nodeId: string;
  connectorIds: string[];
  isEligibleFlowEndpoint: boolean;
}

export interface ValidateFlowConnectorReferencesInput {
  connectors: FlowConnectorValidationConnectorInput[];
  endpoints: FlowConnectorValidationEndpointInput[];
}

export interface FlowConnectorRouteValidationConnectorInput {
  endRect?: RectLike;
  labelRect?: RectLike;
  nodeId: string;
  obstacles: ConnectorObstacle[];
  record: FlowConnectorRecord;
  startRect?: RectLike;
}

export interface ValidateFlowConnectorRouteGeometryInput {
  connectors: FlowConnectorRouteValidationConnectorInput[];
}

export interface BuildCleanStaleIndexesPlanInput {
  endpoints: FlowConnectorValidationEndpointInput[];
  liveConnectorIds: string[];
}


const CARD_OFFSET_Y = 40;
const BADGE_SIZE = 28;
const BADGE_GAP = 4;
const VALIDATION_LAYOUT_TOLERANCE = 1;

export function validateAnnotationBindings(input: ValidateAnnotationBindingsInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  const cardsByAnnotationId = new Map(input.cards.map((card) => [card.record.id, card]));
  const subjectsById = new Map(input.subjects.map((subject) => [subject.nodeId, subject]));
  const contextsById = new Map(input.contexts.map((context) => [context.nodeId, context]));

  const missingBadgeTargets: string[] = [];
  const missingBadgeSubjectIds: string[] = [];
  input.cards.forEach((card) => {
    card.record.subjectNodeIds.forEach((subjectNodeId) => {
      if (!subjectsById.has(subjectNodeId)) {
        return;
      }
      const hasBadge = input.badges.some(
        (badge) =>
          badge.record.annotationId === card.record.id &&
          badge.record.subjectNodeId === subjectNodeId,
      );
      if (!hasBadge) {
        missingBadgeTargets.push(card.nodeId, subjectNodeId);
        missingBadgeSubjectIds.push(subjectNodeId);
      }
    });
  });
  addIssue(issues, {
    code: 'annotation-missing-badge',
    severity: 'warning',
    title: 'Missing Annotation Badge',
    affectedObjectCount: countUnique(missingBadgeSubjectIds),
    description: 'Some bound Subject Nodes do not have a matching Annotation Badge.',
    locationNodeIds: missingBadgeTargets,
  });

  const duplicateBadgeTargets: string[] = [];
  groupBy(input.badges, (badge) => `${badge.record.annotationId}\u0000${badge.record.subjectNodeId}`).forEach((badges) => {
    if (badges.length <= 1) {
      return;
    }
    duplicateBadgeTargets.push(...badges.map((badge) => badge.nodeId), badges[0].record.subjectNodeId);
  });
  addIssue(issues, {
    code: 'annotation-duplicate-badge',
    severity: 'warning',
    title: 'Duplicate Annotation Badge',
    affectedObjectCount: duplicateBadgeTargets.length,
    description: 'A Subject Node has more than one Annotation Badge for the same Annotation.',
    locationNodeIds: duplicateBadgeTargets,
  });

  const orphanTargets: string[] = [];
  input.cards.forEach((card) => {
    const contextExists = contextsById.has(card.record.contextFrameId);
    const liveSubjectCount = card.record.subjectNodeIds.filter((subjectNodeId) => subjectsById.has(subjectNodeId)).length;
    if (!contextExists || card.record.subjectNodeIds.length === 0 || liveSubjectCount === 0) {
      orphanTargets.push(card.nodeId, ...card.record.subjectNodeIds.filter((subjectNodeId) => subjectsById.has(subjectNodeId)));
    }
  });
  input.subjects.forEach((subject) => {
    subject.annotationIds.forEach((annotationId) => {
      if (!cardsByAnnotationId.has(annotationId)) {
        orphanTargets.push(subject.nodeId);
      }
    });
  });
  addIssue(issues, {
    code: 'annotation-orphaned',
    severity: 'error',
    title: 'Orphaned Annotation',
    affectedObjectCount: countUnique(orphanTargets),
    description: 'An Annotation is missing its required card, context, or all live Subject Nodes.',
    locationNodeIds: orphanTargets,
  });

  const missingBodyTargets = input.cards
    .filter((card) => card.record.body.trim().length === 0)
    .map((card) => card.nodeId);
  addIssue(issues, {
    code: 'annotation-missing-body',
    severity: 'error',
    title: 'Missing Required Annotation Body',
    affectedObjectCount: missingBodyTargets.length,
    description: 'An Annotation Card has an empty required Annotation Body.',
    locationNodeIds: missingBodyTargets,
  });

  const outsideTargets = input.cards.filter((card) => {
    const context = contextsById.get(card.record.contextFrameId);
    if (context?.rect === undefined) {
      return false;
    }
    const minY = context.rect.y + context.rect.height + CARD_OFFSET_Y;
    return (
      card.rect.y < minY - VALIDATION_LAYOUT_TOLERANCE ||
      card.rect.x < context.rect.x - VALIDATION_LAYOUT_TOLERANCE ||
      card.rect.x > context.rect.x + context.rect.width + VALIDATION_LAYOUT_TOLERANCE
    );
  }).map((card) => card.nodeId);
  addIssue(issues, {
    code: 'annotation-card-outside-design-notes-area',
    severity: 'warning',
    title: 'Annotation Card Outside Design Notes Area',
    affectedObjectCount: outsideTargets.length,
    description: 'An Annotation Card is not placed below its Context Frame in the Design Notes Area.',
    locationNodeIds: outsideTargets,
  });

  const unsortedCardTargets: string[] = [];
  groupBy(input.cards, (card) => card.record.contextFrameId).forEach((cards) => {
    const visualOrder = [...cards].sort(compareRectsThenIds).map((card) => card.nodeId);
    const numberOrder = [...cards].sort((first, second) =>
      compareAnnotationNumbersThenIds(
        { annotationNumber: first.record.annotationNumber, nodeId: first.nodeId },
        { annotationNumber: second.record.annotationNumber, nodeId: second.nodeId },
      ),
    ).map((card) => card.nodeId);
    if (!arraysEqual(visualOrder, numberOrder)) {
      unsortedCardTargets.push(...cards.map((card) => card.nodeId));
    }
  });
  addIssue(issues, {
    code: 'annotation-cards-unsorted',
    severity: 'info',
    title: 'Unsorted Annotation Cards',
    affectedObjectCount: countUnique(unsortedCardTargets),
    description: 'Annotation Cards are not visually sorted by Annotation Number.',
    locationNodeIds: unsortedCardTargets,
  });

  const unarrangedBadgeTargets: string[] = [];
  groupBy(input.badges, (badge) => badge.record.subjectNodeId).forEach((badges, subjectNodeId) => {
    const subject = subjectsById.get(subjectNodeId);
    const subjectRect = subject?.rect;
    if (subjectRect === undefined || badges.length <= 1) {
      return;
    }
    const arrangedOrder = [...badges].sort((first, second) =>
      compareAnnotationNumbersThenIds(
        { annotationNumber: first.record.annotationNumber, nodeId: first.nodeId },
        { annotationNumber: second.record.annotationNumber, nodeId: second.nodeId },
      ),
    );
    arrangedOrder.forEach((badge, index) => {
      const expectedX = subjectRect.x + subjectRect.width - BADGE_SIZE / 2 + index * (BADGE_SIZE + BADGE_GAP);
      const expectedY = subjectRect.y - BADGE_SIZE / 2;
      if (
        Math.abs(badge.rect.x - expectedX) > VALIDATION_LAYOUT_TOLERANCE ||
        Math.abs(badge.rect.y - expectedY) > VALIDATION_LAYOUT_TOLERANCE
      ) {
        unarrangedBadgeTargets.push(badge.nodeId, subjectNodeId);
      }
    });
  });
  addIssue(issues, {
    code: 'annotation-badges-unarranged',
    severity: 'info',
    title: 'Unarranged Annotation Badges',
    affectedObjectCount: countUnique(unarrangedBadgeTargets),
    description: 'Annotation Badges beside a Subject Node are not arranged by Annotation Number.',
    locationNodeIds: unarrangedBadgeTargets,
  });

  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}

export function validateFlowConnectorReferences(input: ValidateFlowConnectorReferencesInput): ValidationReport {
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
    code: 'flow-connector-orphaned',
    severity: 'error',
    title: 'Orphaned Flow Connector',
    affectedObjectCount: countUnique(orphanConnectorNodeIds),
    description: 'A Flow Connector is missing its start or end Flow Endpoint.',
    locationNodeIds: orphanTargets,
  });

  const invalidEndpointTargets: string[] = [];
  const invalidConnectorNodeIds: string[] = [];
  input.connectors.forEach((connector) => {
    const invalidEndpointIds = [connector.record.start.nodeId, connector.record.end.nodeId]
      .filter((endpointId) => endpointsById.get(endpointId)?.isEligibleFlowEndpoint === false);
    if (invalidEndpointIds.length === 0) {
      return;
    }

    invalidConnectorNodeIds.push(connector.nodeId);
    invalidEndpointTargets.push(connector.nodeId, ...invalidEndpointIds);
  });
  addIssue(issues, {
    code: 'flow-endpoint-invalid',
    severity: 'error',
    title: 'Invalid Flow Endpoint',
    affectedObjectCount: countUnique(invalidConnectorNodeIds),
    description: 'A Flow Connector points to a node that is not a valid Flow Endpoint.',
    locationNodeIds: invalidEndpointTargets,
  });

  const duplicateTargets: string[] = [];
  const duplicateConnectorNodeIds: string[] = [];
  groupBy(input.connectors, (connector) =>
    `${connector.record.start.nodeId}\u0000${connector.record.end.nodeId}`,
  ).forEach((connectors) => {
    if (connectors.length <= 1) {
      return;
    }

    duplicateConnectorNodeIds.push(...connectors.map((connector) => connector.nodeId));
    duplicateTargets.push(
      ...connectors.map((connector) => connector.nodeId),
      ...[connectors[0].record.start.nodeId, connectors[0].record.end.nodeId]
        .filter((endpointId) => endpointsById.has(endpointId)),
    );
  });
  addIssue(issues, {
    code: 'flow-connector-duplicate',
    severity: 'error',
    title: 'Duplicate Flow Connector',
    affectedObjectCount: countUnique(duplicateConnectorNodeIds),
    description: 'Multiple Flow Connectors use the same ordered start and end Flow Endpoints.',
    locationNodeIds: duplicateTargets,
  });

  const emptyActionTargets = input.connectors
    .filter((connector) => connector.record.flowAction === null || connector.record.flowAction.trim().length === 0)
    .map((connector) => connector.nodeId);
  addIssue(issues, {
    code: 'flow-action-empty',
    severity: 'warning',
    title: 'Empty Flow Action',
    affectedObjectCount: emptyActionTargets.length,
    description: 'A Flow Connector has no Flow Action label.',
    locationNodeIds: emptyActionTargets,
  });

  const staleReverseIndexTargets = input.endpoints
    .filter((endpoint) => endpoint.connectorIds.some((connectorId) => !liveConnectorIds.has(connectorId)))
    .map((endpoint) => endpoint.nodeId);
  addIssue(issues, {
    code: 'connector-reverse-index-stale',
    severity: 'warning',
    title: 'Stale Reverse Index',
    affectedObjectCount: staleReverseIndexTargets.length,
    description: 'A Flow Endpoint has connectorRefs pointing to deleted Flow Connectors.',
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
      return routeIntersectsObstacles(routePoints, connector.obstacles.map((obstacle) => obstacle.rect));
    })
    .map((connector) => connector.nodeId);
  addIssue(issues, {
    code: 'connector-route-crosses-obstacle',
    severity: 'error',
    title: 'Connector Route Crosses Obstacle',
    affectedObjectCount: crossingTargets.length,
    description: 'A Connector Route crosses a Connector Obstacle.',
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
    code: 'connector-routing-failure',
    severity: 'error',
    title: 'Connector Routing Failure',
    affectedObjectCount: routingFailureTargets.length,
    description: 'A Flow Connector cannot produce a legal Orthogonal Route around current Connector Obstacles.',
    locationNodeIds: routingFailureTargets,
  });

  const labelOverlapTargets: string[] = [];
  const connectorsWithLabels = input.connectors.filter((connector) => connector.labelRect !== undefined);
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
    code: 'flow-action-label-overlap',
    severity: 'warning',
    title: 'Flow Action Label Overlap',
    affectedObjectCount: countUnique(labelOverlapTargets),
    description: 'Visible Flow Action labels overlap each other.',
    locationNodeIds: labelOverlapTargets,
  });

  addIssue(issues, {
    code: 'connector-route-refreshable',
    severity: 'info',
    title: 'Connector Route Can Be Refreshed',
    affectedObjectCount: countUnique(refreshableTargets),
    description: 'A stored Connector Route differs from the route generated from current endpoints and Connector Obstacles.',
    locationNodeIds: refreshableTargets,
  });

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
    return [{
      connector,
      finalSegment,
      incomingSide,
    }];
  });

  const missingTrunkTargets: string[] = [];
  groupBy(
    trunkDescriptors,
    (descriptor) => `${descriptor.connector.record.end.nodeId}\u0000${descriptor.incomingSide}`,
  ).forEach((group) => {
    const uniqueStartIds = new Set(group.map((descriptor) => descriptor.connector.record.start.nodeId));
    if (group.length < 2 || uniqueStartIds.size < 2) {
      return;
    }
    const finalSegments = new Set(group.map((descriptor) => segmentKey(descriptor.finalSegment)));
    if (finalSegments.size > 1) {
      missingTrunkTargets.push(...group.map((descriptor) => descriptor.connector.nodeId));
    }
  });
  addIssue(issues, {
    code: 'connector-trunk-missing',
    severity: 'warning',
    title: 'Missing Connector Trunk',
    affectedObjectCount: countUnique(missingTrunkTargets),
    description: 'Flow Connectors entering the same Flow Endpoint from the same direction do not share a Connector Trunk.',
    locationNodeIds: missingTrunkTargets,
  });

  const unexpectedTrunkTargets: string[] = [];
  groupBy(trunkDescriptors, (descriptor) => undirectedSegmentKey(descriptor.finalSegment)).forEach((group) => {
    if (group.length < 2) {
      return;
    }
    const endNodeIds = new Set(group.map((descriptor) => descriptor.connector.record.end.nodeId));
    const incomingSides = new Set(group.map((descriptor) => descriptor.incomingSide));
    const orderedPairs = new Set(group.map((descriptor) =>
      `${descriptor.connector.record.start.nodeId}\u0000${descriptor.connector.record.end.nodeId}`,
    ));
    const uniqueStartIds = new Set(group.map((descriptor) => descriptor.connector.record.start.nodeId));
    const isAllowedSharedTrunk = endNodeIds.size === 1 && incomingSides.size === 1 && uniqueStartIds.size >= 2;
    const isDuplicatePairOnly = orderedPairs.size === 1;
    if (!isAllowedSharedTrunk && !isDuplicatePairOnly) {
      unexpectedTrunkTargets.push(...group.map((descriptor) => descriptor.connector.nodeId));
    }
  });
  addIssue(issues, {
    code: 'connector-trunk-unexpected',
    severity: 'error',
    title: 'Unexpected Connector Trunk',
    affectedObjectCount: countUnique(unexpectedTrunkTargets),
    description: 'Flow Connectors with different Flow Endpoints or opposite directions share a Connector Trunk.',
    locationNodeIds: unexpectedTrunkTargets,
  });

  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}

export function buildCleanStaleIndexesPlan(input: BuildCleanStaleIndexesPlanInput): CleanStaleIndexesPlan {
  const liveConnectorIds = new Set(input.liveConnectorIds);
  const operations: SetSharedPluginDataOperation[] = [];
  const cleanedEndpointNodeIds: string[] = [];
  const removedConnectorIds: string[] = [];

  input.endpoints.forEach((endpoint) => {
    const staleConnectorIds = endpoint.connectorIds.filter((connectorId) => !liveConnectorIds.has(connectorId));
    if (staleConnectorIds.length === 0) {
      return;
    }

    cleanedEndpointNodeIds.push(endpoint.nodeId);
    removedConnectorIds.push(...staleConnectorIds);
    operations.push({
      type: 'set-shared-plugin-data',
      target: { kind: 'existing-node', nodeId: endpoint.nodeId },
      key: SHARED_PLUGIN_DATA.keys.connectorRefs,
      value: {
        schemaVersion: 1,
        connectorIds: endpoint.connectorIds.filter((connectorId) => liveConnectorIds.has(connectorId)),
      },
    });
  });

  return {
    schemaVersion: 1,
    kind: 'clean-stale-indexes',
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

function addIssue(
  issues: ValidationIssue[],
  input: Omit<ValidationIssue, 'id' | 'locationNodeIds'> & { locationNodeIds: string[] },
): void {
  const locationNodeIds = unique(input.locationNodeIds);
  if (input.affectedObjectCount === 0 || locationNodeIds.length === 0) {
    return;
  }

  issues.push({
    ...input,
    id: `${input.code}-${issues.length + 1}`,
    locationNodeIds,
  });
}

function summarizeValidationIssues(issues: ValidationIssue[]): ValidationReportSummary {
  return {
    all: issues.length,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    info: issues.filter((issue) => issue.severity === 'info').length,
  };
}

function compareRectsThenIds(
  first: { nodeId: string; rect: RectLike },
  second: { nodeId: string; rect: RectLike },
): number {
  return first.rect.y - second.rect.y || first.rect.x - second.rect.x || first.nodeId.localeCompare(second.nodeId);
}

function compareAnnotationNumbersThenIds(
  first: { annotationNumber: number; nodeId: string },
  second: { annotationNumber: number; nodeId: string },
): number {
  return first.annotationNumber - second.annotationNumber || first.nodeId.localeCompare(second.nodeId);
}

function groupBy<T>(items: T[], keyForItem: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyForItem(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });
  return groups;
}

function arraysEqual(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function countUnique(values: string[]): number {
  return unique(values).length;
}

function routePointsEqual(first: Point[] | undefined, second: Point[]): boolean {
  if (first === undefined || first.length !== second.length) {
    return false;
  }

  return first.every(
    (point, index) =>
      Math.abs(point.x - second[index].x) < 0.001 &&
      Math.abs(point.y - second[index].y) < 0.001,
  );
}

function rectsOverlap(first: RectLike, second: RectLike): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}
