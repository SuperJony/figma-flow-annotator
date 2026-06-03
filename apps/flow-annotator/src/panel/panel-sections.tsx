import { cn } from "./lib/utils";
import type { PanelPostMessage, PanelState, ValidationFilter } from "./panel-types";
import { Button } from "./ui/button";
import { TextAreaInput, TextInput } from "./ui/text-input";
import { ValidationIssues } from "./validation-issues";

interface AnnotatePanelProps {
  post: PanelPostMessage;
  setAnnotationBody: (value: string) => void;
  setStatus: (tone: PanelState["status"]["tone"], message: string) => void;
  state: PanelState;
}

export function AnnotatePanel({ post, setAnnotationBody, setStatus, state }: AnnotatePanelProps) {
  const body = state.annotationBody.trim();
  const { eligibleSelection, selectedAnnotationCardCount } = state.selection;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="typography-heading-small text-black-1000">Annotate</h2>
        <SelectionPill id="selection">
          {eligibleSelection} subject{eligibleSelection === 1 ? "" : "s"}
        </SelectionPill>
      </div>
      <label className="grid gap-1">
        <span className="typography-body-medium-strong text-black-500">Annotation Body</span>
        <TextAreaInput
          id="annotationBody"
          onChange={(event) => setAnnotationBody(event.target.value)}
          placeholder="Design note, interaction rule, or state detail"
          value={state.annotationBody}
        />
      </label>
      <ActionRow>
        <Button
          disabled={eligibleSelection === 0 || body.length === 0}
          id="createAnnotation"
          onClick={() => {
            if (body.length === 0) {
              setStatus("error", "Annotation Body is required.");
              return;
            }
            post({ body, type: "create-annotation" });
          }}
        >
          Create Annotation
        </Button>
        <Button
          disabled={eligibleSelection === 0 || selectedAnnotationCardCount !== 1}
          id="addSubjectNodes"
          onClick={() => post({ type: "add-subject-nodes" })}
          variant="secondary"
        >
          Add Subject Nodes
        </Button>
      </ActionRow>
      <ActionRow>
        <Button
          disabled={eligibleSelection === 0}
          id="arrangeBadges"
          onClick={() => post({ type: "arrange-badges" })}
          variant="secondary"
        >
          Arrange Badges
        </Button>
        <Button
          id="arrangeCards"
          onClick={() => post({ type: "arrange-cards" })}
          variant="secondary"
        >
          Arrange Cards
        </Button>
      </ActionRow>
    </>
  );
}

interface ConnectPanelProps {
  post: PanelPostMessage;
  setFlowAction: (value: string) => void;
  state: PanelState;
}

export function ConnectPanel({ post, setFlowAction, state }: ConnectPanelProps) {
  const { connectorEndpoints, existingConnector, routingStatus } = state.selection;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="typography-heading-small text-black-1000">Connect</h2>
        <SelectionPill id="connectorState">{connectorEndpoints.length}/2 endpoints</SelectionPill>
      </div>
      <label className="grid gap-1">
        <span className="typography-body-medium-strong text-black-500">Flow Action</span>
        <TextInput
          id="flowAction"
          onChange={(event) => setFlowAction(event.target.value)}
          placeholder="click, choose, input"
          value={state.flowAction}
        />
      </label>
      <div
        aria-label="Pending Flow Endpoints"
        className="grid grid-cols-2 gap-1.5 rounded-md border border-grey-200 bg-grey-100 p-1.5"
      >
        <EndpointPreview id="startEndpoint" label="Start" value={connectorEndpoints[0]?.name} />
        <EndpointPreview id="endEndpoint" label="End" value={connectorEndpoints[1]?.name} />
      </div>
      <div
        className="connect-status typography-body-medium min-h-4 text-black-500"
        id="routingStatus"
      >
        {routingStatus}
      </div>
      <div
        className={cn(
          "connect-status typography-body-medium min-h-4",
          existingConnector ? "strong text-green-700" : "text-black-500",
        )}
        id="existingConnectorStatus"
      >
        {existingConnector
          ? `Existing Flow Connector: ${existingConnector.flowAction || "No Flow Action"}`
          : "No existing Flow Connector."}
      </div>
      <ActionRow>
        <Button
          disabled={connectorEndpoints.length !== 2}
          id="swapConnector"
          onClick={() => post({ type: "swap-connector-endpoints" })}
          variant="secondary"
        >
          Swap
        </Button>
        <Button
          disabled={connectorEndpoints.length !== 2}
          id="createConnector"
          onClick={() => post({ flowAction: state.flowAction.trim(), type: "create-connector" })}
        >
          Create Flow Connector
        </Button>
      </ActionRow>
      <ActionRow>
        <Button
          id="refreshConnectors"
          onClick={() => post({ type: "refresh-connectors" })}
          variant="secondary"
        >
          Refresh Connectors
        </Button>
      </ActionRow>
    </>
  );
}

interface ValidatePanelProps {
  post: PanelPostMessage;
  setActiveFilter: (value: ValidationFilter) => void;
  startValidationOperation: (operation: PanelState["validationOperation"]) => boolean;
  state: PanelState;
}

export function ValidatePanel({
  post,
  setActiveFilter,
  startValidationOperation,
  state,
}: ValidatePanelProps) {
  const issues = Array.isArray(state.validationReport.issues) ? state.validationReport.issues : [];
  const isRunning = state.validationOperation !== null;
  const hasStaleIndex = issues.some((issue) => issue.code === "connector-reverse-index-stale");

  const runOperation = (operation: NonNullable<PanelState["validationOperation"]>) => {
    if (startValidationOperation(operation)) {
      post({ type: operation });
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className="typography-heading-small pt-1 text-black-1000">Validate</h2>
        <ActionRow className="flex-1">
          <Button
            disabled={isRunning}
            id="runValidation"
            onClick={() => runOperation("validate-bindings")}
          >
            Validate Bindings
          </Button>
          <Button
            disabled={isRunning || !hasStaleIndex}
            id="cleanStaleIndexes"
            onClick={() => runOperation("clean-stale-indexes")}
            variant="secondary"
          >
            Clean Stale Indexes
          </Button>
          <Button
            disabled={isRunning || !state.validationRepairRequired}
            hidden={!state.validationRepairRequired}
            id="repairValidationState"
            onClick={() => runOperation("repair-validation-state")}
            variant="secondary"
          >
            Repair Validation State
          </Button>
        </ActionRow>
      </div>
      <ValidationSummary report={state.validationReport} />
      <div aria-label="Validation filters" className="grid grid-cols-4 gap-1">
        {(["all", "error", "warning", "info"] as const).map((filter) => (
          <Button
            data-filter={filter}
            key={filter}
            onClick={() => setActiveFilter(filter)}
            variant={state.activeFilter === filter ? "primary" : "secondary"}
          >
            {formatFilterLabel(filter)}
          </Button>
        ))}
      </div>
      <div
        className="issue-list grid max-h-[210px] min-h-[130px] gap-1.5 overflow-auto"
        id="validationIssues"
      >
        {issues.length === 0 && state.status.message === "Ready." ? (
          <div className="empty-report typography-body-medium text-black-500">
            Run validation to inspect bindings.
          </div>
        ) : (
          <ValidationIssues
            activeFilter={state.activeFilter}
            post={post}
            report={state.validationReport}
          />
        )}
      </div>
    </>
  );
}

function ValidationSummary({ report }: { report: PanelState["validationReport"] }) {
  const summary = report.summary || { all: 0, errors: 0, info: 0, warnings: 0 };
  return (
    <div aria-label="Validation summary" className="grid grid-cols-4 gap-1">
      <SummaryCell id="summaryAll" label="All" value={summary.all || 0} />
      <SummaryCell id="summaryErrors" label="Errors" value={summary.errors || 0} />
      <SummaryCell id="summaryWarnings" label="Warnings" value={summary.warnings || 0} />
      <SummaryCell id="summaryInfo" label="Info" value={summary.info || 0} />
    </div>
  );
}

function SummaryCell({ id, label, value }: { id: string; label: string; value: number }) {
  return (
    <div className="grid min-w-0 gap-px rounded-md border border-grey-200 bg-grey-100 px-1 py-1 text-center">
      <div className="summary-count font-bold text-[13px] text-black-1000 leading-none" id={id}>
        {value}
      </div>
      <div className="summary-label typography-body-small overflow-hidden text-ellipsis whitespace-nowrap text-black-500">
        {label}
      </div>
    </div>
  );
}

function SelectionPill({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <div
      className="selection typography-body-medium min-w-[92px] whitespace-nowrap rounded-full bg-grey-100 px-2 py-1 text-center text-black-500"
      id={id}
    >
      {children}
    </div>
  );
}

function EndpointPreview({ id, label, value }: { id: string; label: string; value?: string }) {
  return (
    <div className="grid min-w-0 gap-px">
      <div className="typography-body-medium-strong text-black-500">{label}</div>
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-black-1000" id={id}>
        {value ?? "None"}
      </div>
    </div>
  );
}

function ActionRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("actions flex flex-wrap justify-end gap-1.5", className)}>{children}</div>
  );
}

function formatFilterLabel(filter: ValidationFilter) {
  if (filter === "all") {
    return "All";
  }
  if (filter === "error") {
    return "Errors";
  }
  return filter === "warning" ? "Warnings" : "Info";
}
