# First Demo Release Proof

Date: 2026-05-09

Branch: `codex/issues-4-13-first-demo-v2`

Base: `82f088c` (`origin/main`)

N13 starting head: `66636d8`

Prior first-demo feature slice range: `749efd0..66636d8`

## Scope

This proof covers GitHub issue #13 only: first demo release proof and docs. It
does not implement missing feature work from issues #4-#12. No missing feature
was found during this proof pass.

First phase remains limited to the ADR 0035 plugin scope: **Create Annotation**,
**Add Subject Nodes**, **Create Flow Connector**, **Edit Flow Action** through
directed connector upsert, **Refresh Connectors**, **Arrange Badges**,
**Arrange Cards**, **Validate Bindings**, and **Clean Stale Indexes**. It still
excludes agent skill implementation, manual route editing, background rerouting,
SDK work, complex node pickers, component library sync, automatic repair, and
batch multi-endpoint connector creation.

## Automated Command Evidence

| Command | Result |
|---|---|
| `gh issue view 13 --repo SuperJony/figma-flow-annotator --comments` | Exit 0. Issue #13 is proof/docs only; acceptance requires `pnpm verify`, package test/lint/build, README or checked-in proof note, nine-scenario evidence, traversal/performance audit, namespace confirmation, and first-phase scope hygiene. |
| `pnpm verify` | Exit 0. `@figma-flow-annotator/flow-annotator` semantic tests: 24 pass, 0 fail. Playwright visual tests: 16 passed in Chromium. Biome passed. Build ran `tsc --noEmit` and `esbuild src/plugin/code.ts --bundle --target=es2017 --outfile=code.js`, producing `code.js 124.1kb`, `Done in 3ms`. |
| `pnpm -r test` | Exit 0. Scope 2 of 3 workspace projects. `packages/core`: 17 pass, 0 fail. `apps/flow-annotator`: 24 pass, 0 fail. |
| `pnpm -r lint` | Final sequential run exit 0. `apps/flow-annotator lint check .` Done. `packages/core lint$ tsc --noEmit` Done. An earlier concurrent run with `pnpm -r test` failed with lint-time `ENOENT ... apps/flow-annotator/.test-build`; rerunning the exact command after tests completed passed. |
| `pnpm -r build` | Exit 0. `apps/flow-annotator` build ran TypeScript strict check plus esbuild and produced `code.js 124.1kb`. `packages/core build$ tsc --noEmit` Done. |
| `rg -n "const NAMESPACE\|SHARED_PLUGIN_DATA\\.namespace\|namespace: 'figma_flow_annotator'\|figma_flow_annotator" apps/flow-annotator/src/figma/runtime.ts packages/core/src/shared/plugin-data.ts packages/core/tests/shared/plugin-data.test.mjs --glob '!code.js'` | Exit 0. Matches: `packages/core/src/shared/plugin-data.ts:4` defines `namespace: 'figma_flow_annotator'`; `apps/flow-annotator/src/figma/runtime.ts:9` uses `const NAMESPACE = SHARED_PLUGIN_DATA.namespace`; `packages/core/tests/shared/plugin-data.test.mjs:9` asserts the namespace. |
| `rg -n "setPluginData\|getPluginData\|'figma-flow-annotator'\|\"figma-flow-annotator\"\|'ffa\\.\|\"ffa\\." apps/flow-annotator/src packages/core/src --glob '!code.js'` | Exit 1 with no output. No private plugin data API use, hyphenated runtime namespace, or `ffa.` key prefix in runtime source. |
| `rg -n "selectionchange\|postSelectionState\|createAnnotations\|addSubjectNodesToAnnotation\|createFlowConnector\|refreshFlowConnectors\|validateCurrentPageBindings\|cleanStaleIndexes\|collectCurrentPageNodes\|collectConnectorObstacles\|currentPage\\.children\|children\\.flatMap\|currentPage\\.selection" apps/flow-annotator/src --glob '!code.js'` | Exit 0. Covered selection, create, refresh, validate, clean, and traversal entry points for audit. |
| `rg -n "must not scan\|must not walk\|without walking\|without scanning\|routes around a middle Context Frame\|upserts an existing directed\|regenerates trunked\|validates Flow Connector references\|validates Annotation bindings" apps/flow-annotator/tests packages/core/tests` | Exit 0. Found regression tests for bounded selection/create paths, middle-frame routing, directed upsert, trunking, annotation validation, connector validation, and clean stale indexes. |
| `find apps/flow-annotator/tests/visual -path '*-snapshots/*.png' -maxdepth 3 -type f \| sort \| wc -l` | Exit 0. Output: `16`. Snapshot inventory covers 2 annotation, 3 connector, and 11 panel baselines. |
| `git diff --name-only -- 'apps/flow-annotator/tests/visual/*-snapshots/*.png'` | Exit 0 with no output. No visual baseline files changed in N13. |

## ADR 0041 Nine-Scenario Matrix

| # | Scenario | Proof surface | Evidence pointer | Status |
|---|---|---|---|---|
| 1 | Selecting one node and creating an **Annotation** creates one **Annotation Card**, one nearby **Annotation Badge**, and shared plugin data. | Browser visual + semantic core | `apps/flow-annotator/tests/visual/annotations/fixtures.ts` defines `single-subject-annotation`; `apps/flow-annotator/tests/visual/annotations/visual.spec.ts` asserts one card, one badge, and status through the real annotation creation path; `packages/core/tests/shared/plugin-data.test.mjs` asserts shared plugin data namespace/key conventions; `packages/core/tests/annotations/operation-batches.test.mjs` asserts create-annotation operation batch shape. | Automated PASS; real Figma smoke pending. |
| 2 | Selecting multiple nodes and creating one **Annotation** creates one shared card and one same-number badge beside each **Subject Node**. | Browser visual + fake-Figma semantic test | `multi-subject-annotation` visual fixture plus `annotations/visual.spec.ts`; `apps/flow-annotator/tests/annotations/numbering.test.mjs` creates two selected subjects and asserts one created card, two badges, subject refs, and status. | Automated PASS; real Figma smoke pending. |
| 3 | **Add Subject Nodes** appends selected subjects and same-number badges to an existing **Annotation** without changing its **Annotation Number**. | Fake-Figma semantic test + panel visual | `annotations/numbering.test.mjs` test `adds Subject Nodes...` asserts number `4`, updated subjects, one new badge, and no duplicate badge; `panel/ui.spec.ts` covers enabled Add Subject UI state. | Automated PASS; real Figma smoke pending. |
| 4 | Deleting one badge causes validation to warn while the **Annotation** remains valid. | Core validation + panel visual | `packages/core/tests/validation/validation.test.mjs` reports `annotation-missing-badge` as `warning` while the card record remains present; `panel/fixtures.ts` and `panel/ui.spec.ts` render `Missing Annotation Badge` as a warning. | Automated PASS; real Figma smoke pending. |
| 5 | After the plugin opens, selecting A then shift-selecting B creates a directed A -> B **Flow Connector** with shared plugin data. | Fake-Figma semantic test + panel visual | `connectors/selection.test.mjs` drives `resetObservedEndpointSelection`, sequential selection changes, and `createFlowConnector`; assertions read endpoint order and `connectorRefs`; `panel/ui.spec.ts` covers two pending endpoints. | Automated PASS; real Figma smoke pending. |
| 6 | For three horizontal **Context Frames**, a 1 -> 3 connector routes around frame 2 and around **Annotation Cards**. | Fake-Figma semantic test + browser visual | `connectors/selection.test.mjs` asserts the route avoids the middle frame and `collectConnectorObstacles` includes context frames and annotation cards while excluding badges; `connectors/visual.spec.ts` covers obstacle-avoiding connector visuals. | Automated PASS; real Figma smoke pending. |
| 7 | Different connectors with different starts, the same end, and the same incoming side share the final **Connector Trunk**. | Fake-Figma semantic test + browser visual | `connectors/selection.test.mjs` asserts both routes share the same final segment and labels stay off the shared trunk; `connectors/visual.spec.ts` covers `connector-trunk`. | Automated PASS; real Figma smoke pending. |
| 8 | Creating A -> B when A -> B already exists updates the existing connector's **Flow Action** and route instead of creating a duplicate connector. | Core operation batch test + fake-Figma semantic test + panel visual | `packages/core/tests/connectors/operations.test.mjs` asserts directed-pair upsert update/idempotent modes; `connectors/selection.test.mjs` keeps connector count at one while updating action; `panel/ui.spec.ts` covers existing connector status. | Automated PASS; real Figma smoke pending. |
| 9 | Deleting a **Flow Endpoint** used by an existing **Flow Connector** causes validation to report an **Orphaned Flow Connector** error. | Core validation + fake-Figma semantic test + panel visual | `packages/core/tests/validation/validation.test.mjs` and `apps/flow-annotator/tests/validation/validation.test.mjs` assert `flow-connector-orphaned`; `panel/ui.spec.ts` renders `Orphaned Flow Connector`. | Automated PASS; real Figma smoke pending. |

## Local Figma Smoke

No verifiable real-Figma Design smoke was run in N13. The automated browser and
fake-Figma surfaces above are the release-proof evidence for this node; real
Figma remains a low-frequency manual smoke check per ADR 0047.

Manual follow-up:

1. Run `pnpm build`.
2. In Figma Design, import `apps/flow-annotator/manifest.json` from the Plugins
   development menu.
3. Run the local `flow-annotator` plugin.
4. Execute the nine scenarios in `apps/flow-annotator/README.md`.
5. Inspect shared plugin data namespace `figma_flow_annotator` on generated
   roots/endpoints and confirm no runtime namespace uses `figma-flow-annotator`
   or an `ffa.` key prefix.

## Visual Baseline Inspection

No visual baseline files changed in N13. Playwright passed against the existing
16 Chromium snapshots:

- 2 annotation baselines: single-subject and multi-subject annotation.
- 3 connector baselines: orthogonal arrow, Flow Action label, Connector Trunk.
- 11 panel baselines: initial, eligible annotation, add subject, pending
  connector endpoints, existing connector, success/error status, three validate
  reports, and clean complete.

Because there were no visual baseline changes, no actual/diff artifacts needed
acceptance inspection.

## Namespace Hygiene Audit

Runtime shared plugin data namespace remains `figma_flow_annotator`, sourced
from `SHARED_PLUGIN_DATA.namespace` in `packages/core/src/shared/plugin-data.ts`
and consumed by `apps/flow-annotator/src/figma/runtime.ts`. The runtime keeps using keys `kind`,
`annotation`, `badgeRef`, `connector`, `annotationRefs`, `connectorRefs`, and
`context` without an `ffa.` prefix.

N13 does not change namespace or keys.

## Traversal And Performance Audit

Selection hot path:

- `selectionchange` calls `handleSelectionChange`, which records only current
  page selection and posts selection state.
- Existing tests assert selection state does not walk the page.

Create hot paths:

- **Create Annotation** uses the current selection plus bounded project-owned
  containers for numbering and generated-node checks.
- **Create Flow Connector** uses the two runtime-selected endpoints. Obstacle
  collection scans current-page top-level nodes and prunes generated ancestors,
  whole frame obstacles, and endpoint ancestors instead of descending through
  unrelated frame descendants.
- Existing tests assert annotation numbering and connector creation do not scan
  unrelated frame descendants.

Refresh path:

- **Refresh Connectors** refreshes selected connector roots when present;
  otherwise it scans the project-owned `FFA Connectors` container for current
  page connectors. That page-level connector scan is acceptable for an explicit
  command.

Validate/Clean paths:

- **Validate Bindings** and **Clean Stale Indexes** intentionally collect current
  page nodes. They are explicit audit/cleanup commands, not selection or create
  hot paths.

## Residual Risk

Real Figma loading and the nine manual smoke scenarios are pending because N13
did not run Figma Design with verifiable local evidence. This is acceptable for
routine proof under ADR 0047, but it remains the release/demo smoke follow-up.
