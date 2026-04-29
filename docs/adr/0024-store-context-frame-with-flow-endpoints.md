# Store context frame with flow endpoints

Each **Flow Connector** endpoint stores both the endpoint node ID and its owning **Context Frame** ID. This lets later extraction distinguish page-level flow from control-level flow and group connectors by design scene without reverse-engineering frame ownership from geometry alone.

