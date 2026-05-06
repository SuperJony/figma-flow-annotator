# Treat deleted connector roots as deleted connectors

Deleting a **Flow Connector** visual root deletes that connector's semantic record. Former endpoints may still contain stale reverse-index IDs, but those stale references should be reported and cleaned explicitly rather than used to recreate the connector.

