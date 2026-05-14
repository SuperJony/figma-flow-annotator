# Use versioned shared plugin data keys

The first demo uses Figma shared plugin data namespace `figma_flow_annotator` with stable, versioned JSON values. Figma shared plugin data namespaces only allow alphanumeric characters, `_`, or `.`, so the repository name `figma-flow-annotator` cannot be used as the runtime namespace. Because Figma already separates namespace from key, keys should not include an extra `ffa.` prefix. Complete semantic records live only on their visual roots, while bound Figma nodes store small reverse-reference values that validation can clean when stale.

Keys:

- `kind`: written on project-created visual roots and containers. Values include `annotation-card`, `annotation-badge`, `flow-connector`, and `container`.
- `annotation`: complete **Annotation** record, written only on an **Annotation Card** root.
- `badgeRef`: lightweight badge instance reference, written on an **Annotation Badge** root. It includes `schemaVersion`, `annotationId`, `annotationNumber`, `subjectNodeId`, and `contextFrameId`.
- `connector`: complete **Flow Connector** record, written only on a **Flow Connector** root. It includes semantic fields plus derived `routeCache`.
- `annotationRefs`: reverse reference value on **Subject Nodes**, containing `schemaVersion` and `annotationIds`.
- `connectorRefs`: reverse reference value on **Flow Endpoints**, containing `schemaVersion` and `connectorIds`.
- `context`: context value on **Context Frames** or the current page when it acts as a **Temporary Page Context**, containing `schemaVersion`, `contextFrameId`, and `nextAnnotationNumber`.
- `validationIndex`: bounded validation data on project containers, containing `schemaVersion` and known project node ids used by validation, stale-index cleanup, and explicit repair paths.

Complete `annotation` and `connector` records must include `schemaVersion: 1`, `id`, `createdAt`, and `updatedAt`. `routeCache` is derived visual data and may be overwritten by refresh without changing connector semantics. Validation reports, UI state, route diagnostics, and other large or runtime-only values are not written to shared plugin data.
