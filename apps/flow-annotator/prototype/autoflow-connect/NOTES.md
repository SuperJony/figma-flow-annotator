# Autoflow Connect prototype

Question: Does an Autoflow-style web UI make the Connect side-selection and style-default workflow feel viable before production plugin implementation?

Run from the repository root:

```sh
pnpm --filter @figma-flow-annotator/flow-annotator prototype:connect-autoflow
```

Open `http://127.0.0.1:4177/?variant=A`.

Inspect:

- Variant A: toolbar-first panel, closest to the Autoflow screenshot.
- Variant B: endpoint-first inspector, with side handles as the main control.
- Variant C: refresh-first defaults console, with the current Connector Style treated as the pending default.

All variants are throwaway web-only prototypes. State is intentionally kept in memory. The prototype renders the selected endpoints, start and end Connection Side, current Connector Style, Endpoint Markers, Flow Action, and the style payload that Refresh Connectors would apply.

