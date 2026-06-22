# Persist Flow Connector connection sides

**Flow Connectors** should persist optional start and end **Connection Sides** with their connector record. The alternatives were transient creation-only side choices or UI-only side preview, but persisted sides preserve designer intent across Refresh Connectors and keep route generation deterministic after endpoint or obstacle movement. When a directed endpoint pair already has a connector, the panel should load that connector's persisted sides before updating it so an unrelated action edit does not overwrite side intent.
