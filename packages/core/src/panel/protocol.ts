import type { ValidationReport } from "../validation/types.ts";

export const PANEL_EMPTY_ROUTING_STATUS = "Select two Flow Endpoints to preview a Connector Route.";

export type PanelMessageType = PanelInboundMessage["type"];

export type PanelInboundMessage =
  | { type: "create-annotation"; body: string }
  | { type: "add-subject-nodes" }
  | { type: "arrange-badges" }
  | { type: "arrange-cards" }
  | { type: "create-connector"; flowAction: string }
  | { type: "refresh-connectors" }
  | { type: "swap-connector-endpoints" }
  | { type: "validate-bindings" }
  | { type: "clean-stale-indexes" }
  | { type: "deep-audit-repair-index" }
  | { type: "locate-validation-issue"; issueId: string }
  | { type: "request-selection-state" }
  | { type: "close" };

export type PanelCommandMessage = Exclude<
  PanelInboundMessage,
  { type: "close" } | { type: "request-selection-state" }
>;

export type PanelMessageDispatch =
  | { kind: "close" }
  | { kind: "request-selection-state" }
  | { kind: "command"; command: PanelCommandMessage };

export type PanelStatusTone = "success" | "error";

export interface PanelStatusMessage {
  type: "status";
  tone: PanelStatusTone;
  message: string;
}

export interface PanelConnectorEndpoint {
  id: string;
  name: string;
}

export interface PanelExistingConnector {
  flowAction: string | null;
  id: string;
  nodeId: string;
}

export interface PanelConnectorSelectionState {
  endpoints: PanelConnectorEndpoint[];
  existingConnector: PanelExistingConnector | null;
  routingStatus: string;
}

export interface PanelSelectionNodeInput {
  hasGeneratedAncestor: boolean;
  isAnnotationCard: boolean;
}

export interface PanelSelectionStateMessage {
  type: "selection-state";
  totalCount: number;
  eligibleCount: number;
  selectedAnnotationCardCount: number;
  connectorEndpoints: PanelConnectorEndpoint[];
  existingConnector: PanelExistingConnector | null;
  routingStatus: string;
}

export interface PanelValidationReportMessage {
  type: "validation-report";
  report: ValidationReport;
}

export type PanelValidationOperation =
  | "validate-bindings"
  | "clean-stale-indexes"
  | "deep-audit-repair-index";

export type PanelValidationOperationState = "running" | "idle";

export interface PanelValidationOperationMessage {
  type: "validation-operation";
  operation: PanelValidationOperation;
  state: PanelValidationOperationState;
  message?: string;
}

export type PanelOutboundMessage =
  | PanelSelectionStateMessage
  | PanelStatusMessage
  | PanelValidationOperationMessage
  | PanelValidationReportMessage;

export function classifyPanelMessage(message: unknown): PanelMessageDispatch {
  if (!isObjectRecord(message) || typeof message.type !== "string") {
    throw new Error("Flow Annotator panel message must include a type.");
  }

  switch (message.type) {
    case "close":
      return { kind: "close" };
    case "request-selection-state":
      return { kind: "request-selection-state" };
    case "create-annotation":
      return {
        kind: "command",
        command: { type: message.type, body: requireString(message.body, "Annotation Body") },
      };
    case "create-connector":
      return {
        kind: "command",
        command: {
          type: message.type,
          flowAction: requireString(message.flowAction, "Flow Action"),
        },
      };
    case "locate-validation-issue":
      return {
        kind: "command",
        command: {
          type: message.type,
          issueId: requireString(message.issueId, "validation issue id"),
        },
      };
    case "add-subject-nodes":
    case "arrange-badges":
    case "arrange-cards":
    case "refresh-connectors":
    case "swap-connector-endpoints":
    case "validate-bindings":
    case "clean-stale-indexes":
    case "deep-audit-repair-index":
      return {
        kind: "command",
        command: { type: message.type },
      };
    default:
      throw new Error(`Unsupported Flow Annotator panel message: ${message.type}.`);
  }
}

export function buildPanelStatusMessage(
  tone: PanelStatusTone,
  message: string,
): PanelStatusMessage {
  return {
    type: "status",
    tone,
    message,
  };
}

export function buildPanelSelectionStateMessage(input: {
  connector: PanelConnectorSelectionState;
  selectedNodes: PanelSelectionNodeInput[];
}): PanelSelectionStateMessage {
  return {
    type: "selection-state",
    totalCount: input.connector.endpoints.length,
    eligibleCount: input.selectedNodes.filter((node) => !node.hasGeneratedAncestor).length,
    selectedAnnotationCardCount: input.selectedNodes.filter((node) => node.isAnnotationCard).length,
    connectorEndpoints: input.connector.endpoints,
    existingConnector: input.connector.existingConnector,
    routingStatus: input.connector.routingStatus || PANEL_EMPTY_ROUTING_STATUS,
  };
}

export function buildPanelValidationReportMessage(
  report: ValidationReport,
): PanelValidationReportMessage {
  return {
    type: "validation-report",
    report,
  };
}

export function buildPanelValidationOperationMessage(input: {
  message?: string;
  operation: PanelValidationOperation;
  state: PanelValidationOperationState;
}): PanelValidationOperationMessage {
  return {
    type: "validation-operation",
    operation: input.operation,
    state: input.state,
    ...(input.message === undefined ? {} : { message: input.message }),
  };
}

export function formatRefreshConnectorsPanelStatus(result: {
  failedCount: number;
  failures: string[];
  refreshedCount: number;
  selectedOnly: boolean;
}): string {
  const scope = result.selectedOnly ? "selected" : "current-page";
  if (result.failedCount === 0) {
    return `Refreshed ${result.refreshedCount} ${scope} Flow Connector(s).`;
  }

  const firstFailure = result.failures[0] ?? "Unknown connector refresh failure.";
  return `Refreshed ${result.refreshedCount} ${scope} Flow Connector(s); ${result.failedCount} failed. ${firstFailure}`;
}

export function formatCleanStaleIndexesPanelStatus(result: {
  cleanedEndpointCount: number;
  removedConnectorRefCount: number;
}): string {
  return `Cleaned stale indexes on ${result.cleanedEndpointCount} Flow Endpoint(s); removed ${result.removedConnectorRefCount} stale connector reference(s).`;
}

export function formatDeepAuditRepairIndexPanelStatus(result: {
  cleanedEndpointCount: number;
  removedConnectorRefCount: number;
  repairedContainerCount: number;
  validationReport?: ValidationReport;
}): string {
  const repairStatus = `Deep Audit Repair rebuilt the Validation Index on ${result.repairedContainerCount} container(s), cleaned ${result.cleanedEndpointCount} Flow Endpoint(s), and removed ${result.removedConnectorRefCount} stale connector reference(s).`;
  if (result.validationReport === undefined) {
    return repairStatus;
  }
  const remainingIssues = formatValidationIssueSummary(result.validationReport);
  if (remainingIssues === "0 issue(s)") {
    return `${repairStatus} Validation found 0 issue(s).`;
  }
  return `${repairStatus} Validation still reports ${remainingIssues}.`;
}

export function getDeepAuditRepairIndexPanelStatusTone(report: ValidationReport): PanelStatusTone {
  return report.summary.errors > 0 ? "error" : "success";
}

function formatValidationIssueSummary(report: ValidationReport): string {
  const parts = [
    report.summary.errors === 0 ? null : `${report.summary.errors} error(s)`,
    report.summary.warnings === 0 ? null : `${report.summary.warnings} warning(s)`,
    report.summary.info === 0 ? null : `${report.summary.info} info issue(s)`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? "0 issue(s)" : parts.join(", ");
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}
