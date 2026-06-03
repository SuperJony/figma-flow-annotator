import type {
  PanelConnectorEndpoint,
  PanelExistingConnector,
  PanelInboundMessage,
  PanelOutboundMessage,
  PanelValidationOperation,
  ValidationReport,
} from "@figma-flow-annotator/core";

export type PanelTab = "annotate" | "connect" | "validate";
export type ValidationFilter = "all" | "error" | "warning" | "info";
export type PanelStatusTone = "default" | "error" | "running" | "success";

export interface PanelStatusState {
  message: string;
  tone: PanelStatusTone;
}

export interface SelectionState {
  connectorEndpoints: PanelConnectorEndpoint[];
  eligibleSelection: number;
  existingConnector: PanelExistingConnector | null;
  routingStatus: string;
  selectedAnnotationCardCount: number;
  totalSelection: number;
}

export interface PanelState {
  activeFilter: ValidationFilter;
  activeTab: PanelTab;
  annotationBody: string;
  flowAction: string;
  selection: SelectionState;
  status: PanelStatusState;
  validationOperation: PanelValidationOperation | null;
  validationRepairRequired: boolean;
  validationReport: ValidationReport;
}

export type PanelPostMessage = (message: PanelInboundMessage) => void;
export type {
  PanelInboundMessage,
  PanelOutboundMessage,
  PanelValidationOperation,
  ValidationReport,
};
