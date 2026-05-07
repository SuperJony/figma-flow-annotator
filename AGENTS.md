## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `SuperJony/figma-flow-annotator`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default Matt Pocock skills triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: read `CONTEXT.md` and relevant ADRs under `docs/adr/`. See `docs/agents/domain.md`.

### Code-change verification

For any code modification, automatically invoke the Codex `@verification` subagent for an independent audit before reporting completion. Address actionable findings before final delivery, or report any unresolved risk explicitly.

### Performance diagnosis

For Figma plugin freeze or latency bugs, treat synchronous full-page or deep-tree traversal as a high-risk pattern. If the same symptom class appears in a second user-visible entrypoint, expand from the reported command to a symptom-class audit across all plugin message handlers and `selectionchange` hot paths before declaring the fix complete.

For each remaining traversal of `figma.currentPage.children`, nested `children`, or id-to-node rehydration, either remove it, bound it to project-owned containers or endpoint ancestor paths, or document why it is intentionally full-page work. Add regression coverage that fails when unrelated Figma frame descendants are scanned on latency-sensitive create or selection paths.
