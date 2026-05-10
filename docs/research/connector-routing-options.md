# Connector Routing Options

This research compares routing options for **Flow Connectors** in Figma Design. The target is a custom Figma plugin that stores connector semantics in shared plugin data, renders native Figma visual nodes, routes orthogonally around **Context Frames** and **Annotation Cards**, supports boundary connection points, can share same-target trunks, and refreshes explicitly.

## Recommendation

Build a small pure TypeScript router for the first demo. Use existing libraries and products as references and benchmark cases, but do not adopt a full diagram SDK or a WASM/LGPL router as the first implementation dependency.

The current first-demo router returns route points only:

```ts
routeOrthogonalConnector({
  startRect,
  endRect,
  obstacles,
  preferredStartSide,
  preferredEndSide,
}): RouteOrthogonalConnectorResult
```

`RouteOrthogonalConnectorResult` contains `{ points: Point[] }`. When no legal route exists, `routeOrthogonalConnector` throws `ConnectorRouteFailure` instead of returning a failure union.

Figma node creation, shared plugin data, connector records, route cache, badge/card layers, and validation remain owned by this project. The first demo applies them through the plugin; a later agent skill should reuse the same core rules and data contract rather than introduce a parallel model.

## Why Not Native Figma Connectors

Figma's `ConnectorNode` and `figma.createConnector()` are for FigJam relationships, not the Figma Design plugin surface this project targets. The official docs describe connectors as FigJam relationship nodes, and current repo ADRs already require custom Flow Connector visual nodes in Figma Design.

## Candidate Matrix

| Candidate | License | Fit | Notes |
|---|---:|---|---|
| Existing Figma connector/annotation plugins | varies, mostly no source | Benchmark only | Autoflow, FlowConnect, Smart Flow, Annotation Helper, and similar plugins are useful product references, but no clearly licensed open-source plugin covers both structured annotations and routed, extractable Figma Design connectors. |
| Figma native annotations | platform API | Low | Native annotations can attach labels to nodes, but do not provide this project's visible card/badge system, shared extraction schema, or flow connector model. |
| `libavoid-js` / libavoid | LGPL-2.1 family | High algorithm fit, high integration risk | Strong object-avoiding orthogonal routing, ports/pins, and route point output. Risks: LGPL compliance, WASM packaging inside plugin runtime, wrapper maturity, and extra complexity. Best used as benchmark or later POC. |
| `obstacle-router` | LGPL-2.1 | Closest small router, high maturity risk | Pure TS/libavoid-style package with promising obstacle avoidance and shared final segment behavior in POC, but very new, small, LGPL, and not reliable enough to ship as-is. |
| JointJS | MPL-2.0 / commercial | Medium reference, low dependency fit | Manhattan router returns route points, supports obstacle avoidance and start/end directions. It is tied to a diagram graph/view model and its fallback must be overridden to avoid crossing obstacles. |
| AntV X6 | MIT | Medium fallback candidate | Manhattan router and boundary connection concepts are relevant, but extracting only the router from a DOM/SVG diagram framework would add unnecessary surface area. |
| yFiles for HTML | Commercial | Strong technically, weak product fit | Strongest product-grade routing, label placement, ports, and bus routing, but commercial and far larger than this plugin needs. |
| GoJS | Commercial | Low dependency fit | Has node-avoiding routing and route point access, but is a full canvas/diagram product. |
| elkjs / ELK | EPL-2.0 | Low route-only fit | Good graph layout engine with edge sections and ports, but not a clean fixed-node route-only engine for this plugin. |
| React Flow Smart Edge | MIT, archived | Low | Useful A* grid reference, but React Flow-specific, archived, and lacks shared trunk semantics. |
| mxGraph / maxGraph | Apache-2.0 | Low | Useful historical references for edge styles, but not a robust obstacle-avoiding route-only engine for this use case. |

## Current First-Demo Router Shape

1. Extract absolute bounding rectangles for Context Frames and Annotation Cards.
2. Inflate obstacle rectangles by connector clearance.
3. Compute boundary Connection Points for start and end Flow Endpoints.
4. Build candidate Orthogonal Routes from preferred/dominant side pairs and horizontal/vertical lane values derived from endpoint centers, endpoint edges, obstacle edges, and relevant bounds.
5. Reject route candidates that cross inflated Connector Obstacles or pass through Flow Endpoint interiors.
6. Score remaining candidates by Manhattan length, bend count, and side-preference penalty, then return the lowest-cost points.
7. Render Rounded Corners from route points without changing semantic route points.
8. Group connectors by same end endpoint and incoming side to create shared Connector Trunks.
9. Place Flow Action labels on readable non-trunk segments when possible.
10. If no legal route exists, fail visibly rather than drawing through Context Frames or Annotation Cards.

## Evidence

- Figma docs expose `ConnectorNode` as a FigJam relationship node and shared plugin data as public node metadata for plugins.
- JointJS documents a Manhattan router that returns route points, uses orthogonal segments, and avoids obstacles with start/end direction options.
- libavoid documents fast object-avoiding orthogonal and polyline connector routing for interactive diagram editors.
- yFiles documents orthogonal routing, port constraints, label-aware routing, and bus-style edge grouping as mature industry references.
- Isolated subagent POCs showed obstacle-avoiding orthogonal routing is viable with both simple A* and libavoid-style routers, but the dependency and license tradeoffs favor an in-house first-demo router.

## Decision Boundary

Use a library only if the in-house first-demo router fails to meet the required readability cases:

- Frame 1 connects to Frame 3 while avoiding Frame 2.
- Connector avoids Annotation Cards.
- Multiple connectors entering the same endpoint from the same direction share the final trunk.
- Refresh recomputes routes after endpoint or obstacle movement.
- Route failure is reported instead of drawing through obstacles.

## Reference Links

### Figma Platform

- [Figma Plugin API: ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [Figma Plugin API: `figma.createConnector()`](https://developers.figma.com/docs/plugins/api/properties/figma-createconnector/)
- [Figma Plugin API: `setSharedPluginData`](https://developers.figma.com/docs/plugins/api/properties/nodes-setsharedplugindata/)
- [Figma REST API: file node types](https://developers.figma.com/docs/rest-api/file-node-types/)

### Routing Libraries And Diagram SDKs

- [libavoid overview](https://www.adaptagrams.org/documentation/libavoid.html)
- [libavoid routing options](https://www.adaptagrams.org/documentation/namespaceAvoid.html)
- [libavoid source](https://github.com/mjwybrow/adaptagrams/tree/master/cola/libavoid)
- [libavoid-js](https://github.com/Aksem/libavoid-js)
- [libavoid-js on npm](https://www.npmjs.com/package/libavoid-js)
- [obstacle-router](https://github.com/awaisshah228/avoid-edge-routing)
- [JointJS routers](https://docs.jointjs.com/4.0/api/routers/)
- [JointJS connection points](https://docs.jointjs.com/api/connectionPoints/)
- [AntV X6 edge model](https://x6.antv.antgroup.com/en/api/model/edge)
- [yFiles polyline edge routing](https://docs.yworks.com/yfiles-html/dguide/layout/polyline_router/)
- [yFiles bus routing](https://docs.yworks.com/yfiles-html/dguide/layout/bus_router/)
- [yFiles label placement](https://docs.yworks.com/yfiles-html/dguide/label_placement/)
- [GoJS routing](https://gojs.net/latest/api/symbols/Routing.html)
- [ELK edge routing option](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html)
- [elkjs](https://github.com/kieler/elkjs)
- [React Flow Smart Edge](https://github.com/tisoap/react-flow-smart-edge)
- [PathFinding.js introduction](https://pathfindingjs.readthedocs.io/en/latest/user-guide/introduction/)
- [maxGraph edge styles](https://maxgraph.github.io/maxGraph/docs/usage/edge-styles/)

### Figma Plugin And Product Benchmarks

- [Autoflow](https://figma.pluginsage.com/plugins/733902567457592893)
- [FlowConnect](https://peerlist.io/beingmani/project/flowconnect--figjam-connectors-in-figma)
- [Smart Flow](https://figma.pluginsage.com/plugins/1490462397053701472)
- [Annotation Helper](https://figma.pluginsage.com/plugins/1214586802905195183)
- [Arrow Auto](https://figmaelements.com/plugins/arrow-auto-2/)
- [jamjameskim/figma-plugin-flowchart](https://github.com/jamjameskim/figma-plugin-flowchart)
- [SAP Accessibility Design Tools](https://github.com/SAP/accessibility-design-tools)
- [GitHub Annotation Toolkit](https://github.com/github/annotation-toolkit)
- [Figma plugin samples: create shapes connectors](https://github.com/figma/plugin-samples/blob/main/create-shapes-connectors/code.ts)

### Algorithms And Papers

- [Orthogonal Connector Routing PDF](https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf)
- [ELK libavoid integration note](https://eclipse.dev/elk/blog/posts/2022/22-11-17-libavoid.html)
- [Edge Routing with Ordered Bundles](https://arxiv.org/abs/1209.4227)
