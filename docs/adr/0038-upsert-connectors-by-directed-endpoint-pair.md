# Upsert connectors by directed endpoint pair

The first demo treats the ordered start/end **Flow Endpoint** pair as the uniqueness key for **Flow Connectors**. If no connector exists for A -> B, **Create Flow Connector** creates one. If A -> B already exists, the same action updates that connector's **Flow Action** and refreshed route instead of creating a second connector; if the submitted action is unchanged, the operation is idempotent and may simply select or refresh the existing connector. B -> A is a different directed pair and may have its own connector.
