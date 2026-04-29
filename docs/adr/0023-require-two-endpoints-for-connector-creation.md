# Require two endpoints for connector creation

Creating a **Flow Connector** requires exactly two pending **Flow Endpoints** from the plugin's runtime selection window. The first demo consumes only that start/end pair and does not create batch connectors from larger selections, avoiding guesses about fan-out, chaining, pairwise links, or other multi-endpoint patterns.
