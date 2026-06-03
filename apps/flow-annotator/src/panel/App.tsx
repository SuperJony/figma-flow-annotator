import { AnnotatePanel, ConnectPanel, ValidatePanel } from "./panel-sections";
import { Separator } from "./ui/separator";
import { Tab, Tabs, TabsList, TabsPanel } from "./ui/tabs";
import { usePanelController } from "./use-panel-controller";

export function App() {
  const {
    post,
    setActiveFilter,
    setActiveTab,
    setAnnotationBody,
    setFlowAction,
    setStatus,
    startValidationOperation,
    state,
  } = usePanelController();

  return (
    <div className="shell flex min-h-screen flex-col bg-white-1000 text-black-1000">
      <Tabs
        onValueChange={(value) => setActiveTab(value as typeof state.activeTab)}
        value={state.activeTab}
      >
        <div className="px-2 pt-2">
          <TabsList aria-label="Flow Annotator sections">
            <Tab data-tab="annotate" id="tabAnnotate" value="annotate">
              Annotate
            </Tab>
            <Tab data-tab="connect" id="tabConnect" value="connect">
              Connect
            </Tab>
            <Tab data-tab="validate" id="tabValidate" value="validate">
              Validate
            </Tab>
          </TabsList>
        </div>
        <Separator className="mx-2 mt-2" />
        <main className="grid gap-1.5 px-2.5 py-1.5">
          <TabsPanel
            className="tab-panel grid gap-1.5 rounded-md border border-grey-200 bg-white-1000 p-2"
            id="panelAnnotate"
            keepMounted
            render={<section data-tab-panel="annotate" />}
            value="annotate"
          >
            <AnnotatePanel
              post={post}
              setAnnotationBody={setAnnotationBody}
              setStatus={setStatus}
              state={state}
            />
          </TabsPanel>
          <TabsPanel
            className="tab-panel grid gap-1.5 rounded-md border border-grey-200 bg-white-1000 p-2"
            id="panelConnect"
            keepMounted
            render={<section data-tab-panel="connect" />}
            value="connect"
          >
            <ConnectPanel post={post} setFlowAction={setFlowAction} state={state} />
          </TabsPanel>
          <TabsPanel
            aria-busy={state.validationOperation === null ? "false" : "true"}
            className="tab-panel grid gap-1.5 rounded-md border border-grey-200 bg-white-1000 p-2"
            id="panelValidate"
            keepMounted
            render={<section data-tab-panel="validate" />}
            value="validate"
          >
            <ValidatePanel
              post={post}
              setActiveFilter={setActiveFilter}
              startValidationOperation={startValidationOperation}
              state={state}
            />
          </TabsPanel>
        </main>
      </Tabs>
      <footer className="mt-auto grid gap-1.5 px-2.5 pb-1.5">
        <div
          className={[
            "typography-body-medium min-h-6 rounded-md border px-2 py-1 leading-tight",
            state.status.tone === "success" ? "border-green-300 bg-green-100 text-green-800" : "",
            state.status.tone === "error" ? "border-red-300 bg-red-100 text-red-800" : "",
            state.status.tone === "running" ? "border-blue-300 bg-blue-100 text-blue-700" : "",
            state.status.tone === "default" ? "border-grey-200 bg-white-1000 text-black-500" : "",
          ].join(" ")}
          id="status"
        >
          {state.status.message}
        </div>
      </footer>
    </div>
  );
}
