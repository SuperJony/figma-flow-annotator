# Place connectors as page-level visual roots

**Flow Connector** visual roots live directly under the current page instead of inside their **Owner Context Frame** or a generated grouping frame. Cross-frame connectors can span multiple frames, so visual containment must be independent of extraction ownership; `ownerContextFrameId` records grouping semantics while direct page-level roots avoid frame clipping, unintended movement, and extra 1x1px layers in the layer tree.
