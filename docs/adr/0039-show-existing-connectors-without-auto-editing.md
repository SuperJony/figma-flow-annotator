# Show existing connectors without auto-editing

When the pending start/end endpoints already have a **Flow Connector** in the same direction, the **Connect** tab should show the existing connector and its **Flow Action** while staying in the create/upsert workflow. Selecting two connected endpoints does not automatically enter an edit-only mode. Designers can update the existing directed connector through the same create action, select the connector visual root, or choose the existing connector from the UI; the plugin must not create a second connector for the same ordered endpoint pair.
