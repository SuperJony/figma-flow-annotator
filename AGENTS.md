## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `SuperJony/figma-flow-annotator`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default Matt Pocock skills triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: read `CONTEXT.md` and relevant ADRs under `docs/adr/`. See `docs/agents/domain.md`.

### Code-change verification

For any code modification, automatically invoke the Codex `@verification` subagent for an independent audit before reporting completion. Address actionable findings before final delivery, or report any unresolved risk explicitly.

For changes that may affect **Annotation Card** or **Annotation Badge** rendering, **Flow Connector** route/SVG/label rendering, plugin panel markup/styles/scripts, Playwright visual fixtures, or visual snapshots, include the browser visual regression surface in verification. Use `pnpm --filter @figma-flow-annotator/flow-annotator test:visual` for all visual domains, or the focused `test:visual:annotate`, `test:visual:connect`, and `test:visual:panel` scripts documented in `apps/flow-annotator/README.md` while developing. Use `pnpm verify` before completion when visual changes are mixed with logic changes or the affected surface is uncertain.

Do not use Figma desktop or Computer Use as the routine visual regression gate. Real Figma loading is a low-frequency smoke check before demos/releases or when manifest/loading behavior changes. Update visual baselines only after an intentional visual change and after inspecting the generated screenshots/diffs; do not accept snapshots that hide unreadable annotation cards, misplaced annotation badges, unreadable connector routes, misplaced arrowheads, incorrect **Flow Action** labels, or broken panel states.

### Performance diagnosis

For Figma plugin freeze or latency bugs, treat synchronous full-page or deep-tree traversal as a high-risk pattern. If the same symptom class appears in a second user-visible entrypoint, expand from the reported command to a symptom-class audit across all plugin message handlers and `selectionchange` hot paths before declaring the fix complete.

For each remaining traversal of `figma.currentPage.children`, nested `children`, or id-to-node rehydration, either remove it, bound it to project-owned containers or endpoint ancestor paths, or document why it is intentionally full-page work. Add regression coverage that fails when unrelated Figma frame descendants are scanned on latency-sensitive create or selection paths.
