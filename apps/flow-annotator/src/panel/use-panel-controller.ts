import * as React from "react";
import type {
  PanelInboundMessage,
  PanelOutboundMessage,
  PanelState,
  PanelTab,
  ValidationFilter,
  ValidationReport,
} from "./panel-types";

const emptyRoutingStatus = "Select two Flow Endpoints to preview a Connector Route.";

const emptyValidationReport: ValidationReport = {
  issues: [],
  schemaVersion: 1,
  summary: { all: 0, errors: 0, info: 0, warnings: 0 },
};

const initialState: PanelState = {
  activeFilter: "all",
  activeTab: "annotate",
  annotationBody: "",
  flowAction: "",
  selection: {
    connectorEndpoints: [],
    eligibleSelection: 0,
    existingConnector: null,
    routingStatus: emptyRoutingStatus,
    selectedAnnotationCardCount: 0,
    totalSelection: 0,
  },
  status: {
    message: "Ready.",
    tone: "default",
  },
  validationOperation: null,
  validationRepairRequired: false,
  validationReport: emptyValidationReport,
};

export function usePanelController() {
  const [state, setState] = React.useState<PanelState>(initialState);
  const validationOperationRef = React.useRef<PanelState["validationOperation"]>(null);

  const post = React.useCallback((pluginMessage: PanelInboundMessage) => {
    window.parent.postMessage({ pluginMessage }, "*");
  }, []);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent<{ pluginMessage?: PanelOutboundMessage }>) => {
      const message = event.data.pluginMessage;
      if (message === undefined) {
        return;
      }
      if (message.type === "validation-operation") {
        validationOperationRef.current = message.state === "running" ? message.operation : null;
      }
      setState((current) => applyPluginMessage(current, message));
    };

    window.addEventListener("message", onMessage);
    post({ type: "request-selection-state" });
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [post]);

  const setActiveTab = React.useCallback((activeTab: PanelTab) => {
    setState((current) => ({ ...current, activeTab }));
  }, []);

  const setActiveFilter = React.useCallback((activeFilter: ValidationFilter) => {
    setState((current) => ({ ...current, activeFilter }));
  }, []);

  const setAnnotationBody = React.useCallback((annotationBody: string) => {
    setState((current) => ({ ...current, annotationBody }));
  }, []);

  const setFlowAction = React.useCallback((flowAction: string) => {
    setState((current) => ({ ...current, flowAction }));
  }, []);

  const setStatus = React.useCallback((tone: PanelState["status"]["tone"], message: string) => {
    setState((current) => ({ ...current, status: { message, tone } }));
  }, []);

  const startValidationOperation = React.useCallback(
    (operation: PanelState["validationOperation"]) => {
      if (operation === null) {
        return false;
      }
      if (validationOperationRef.current !== null) {
        return false;
      }
      validationOperationRef.current = operation;
      setState((current) => {
        if (current.validationOperation !== null) {
          return current;
        }
        return {
          ...current,
          activeTab: "validate",
          status: {
            message: `${formatValidationOperationLabel(operation)} is running.`,
            tone: "running",
          },
          validationOperation: operation,
        };
      });
      return true;
    },
    [],
  );

  return {
    post,
    setActiveFilter,
    setActiveTab,
    setAnnotationBody,
    setFlowAction,
    setStatus,
    startValidationOperation,
    state,
  };
}

function applyPluginMessage(current: PanelState, message: PanelOutboundMessage): PanelState {
  if (message.type === "selection-state") {
    return {
      ...current,
      selection: {
        connectorEndpoints: Array.isArray(message.connectorEndpoints)
          ? message.connectorEndpoints
          : [],
        eligibleSelection: message.eligibleCount,
        existingConnector: message.existingConnector ?? null,
        routingStatus: message.routingStatus || emptyRoutingStatus,
        selectedAnnotationCardCount: message.selectedAnnotationCardCount || 0,
        totalSelection: message.totalCount,
      },
    };
  }

  if (message.type === "status") {
    return {
      ...current,
      status: { message: message.message, tone: message.tone },
      validationRepairRequired:
        typeof message.validationRepairRequired === "boolean"
          ? message.validationRepairRequired
          : current.validationRepairRequired,
    };
  }

  if (message.type === "validation-operation") {
    const isRunning = message.state === "running";
    return {
      ...current,
      status: isRunning
        ? {
            message:
              message.message || `${formatValidationOperationLabel(message.operation)} is running.`,
            tone: "running",
          }
        : current.status,
      validationOperation: isRunning ? message.operation : null,
    };
  }

  if (message.type === "validation-report") {
    return {
      ...current,
      activeTab: "validate",
      validationReport: message.report,
    };
  }

  return current;
}

export function formatValidationOperationLabel(operation: PanelState["validationOperation"]) {
  if (operation === "clean-stale-indexes") {
    return "Clean Stale Indexes";
  }
  if (operation === "repair-validation-state") {
    return "Repair Validation State";
  }
  return "Validate Bindings";
}
