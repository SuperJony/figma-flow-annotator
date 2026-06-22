# Apply current Connector Style on refresh

Refresh Connectors should redraw targeted **Flow Connectors** with the panel's current **Connector Style** rather than preserving per-connector styles or reverting to hidden built-in constants. This keeps style editing explicit without making style part of the connector record, and it avoids treating generated Figma visual nodes as a second source of truth.
