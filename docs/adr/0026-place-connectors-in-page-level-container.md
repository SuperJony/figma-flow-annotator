# Place connectors in a page-level container

**Flow Connector** visual nodes live in a page-level `FFA Connectors` container instead of inside their **Owner Context Frame**. Cross-frame connectors can span multiple frames, so visual containment must be independent of extraction ownership; `ownerContextFrameId` records grouping semantics while the page-level container avoids frame clipping and unintended movement.

