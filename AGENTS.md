# Figma Flow Annotator Agent Guide

## Start Here

- Ground repo work in live evidence: current git state, actual files, GitHub issues, package scripts, and runtime/test output.
- Read `CONTEXT.md` for domain vocabulary before naming concepts in issues, tests, docs, or code.
- Read relevant ADRs under `docs/adr/` before changing behavior. If a change conflicts with an ADR, surface the conflict before implementing.
- Use the linked skill docs for details, but keep this file as the execution gate for this repo.

## Reference Resolution

- Resolve ADR, handoff, and issue references from live sources before claiming they exist, are missing, or say something specific.
- Do not reconstruct filenames from memory, prose, or likely slug wording. For ADR numbers, first search the repo, for example `git ls-files 'docs/adr/0047*'` or `find docs/adr -maxdepth 1 -name '0047*' -print`.
- A failed command against a hand-written path proves only that exact path is wrong. Search by number, topic, or `rg` before drawing a broader conclusion.
- For GitHub issues and PRDs, use `gh issue view <number> --repo SuperJony/figma-flow-annotator --comments` and inspect labels/body/comments before acting on a handoff summary.

## Project Surfaces

- Issues and PRDs live in GitHub Issues for `SuperJony/figma-flow-annotator`. See `docs/agents/issue-tracker.md`.
- Use the default Matt Pocock skills triage labels. See `docs/agents/triage-labels.md`.
- Domain docs use a single-context layout: `CONTEXT.md` plus relevant ADRs under `docs/adr/`. See `docs/agents/domain.md`.

## Code-Change Verification

- For any code modification, automatically invoke the Codex `@verification` subagent for an independent audit before reporting completion.
- Address actionable verification findings before final delivery, or report unresolved risk explicitly.
- For changes that may affect **Annotation Card** or **Annotation Badge** rendering, **Flow Connector** route/SVG/label rendering, plugin panel markup/styles/scripts, Playwright visual fixtures, or visual snapshots, include the browser visual regression surface.
- Use `pnpm --filter @figma-flow-annotator/flow-annotator test:visual` for all visual domains, or the focused `test:visual:annotate`, `test:visual:connect`, and `test:visual:panel` scripts documented in `apps/flow-annotator/README.md` while developing.
- Use `pnpm verify` before completion when visual changes are mixed with logic changes or when the affected surface is uncertain.

## Visual Baselines

- Do not use Figma desktop or Computer Use as the routine visual regression gate.
- Real Figma loading is a low-frequency smoke check before demos/releases or when manifest/loading behavior changes.
- Update visual baselines only after an intentional visual change and after inspecting the generated screenshots/diffs.
- Do not accept snapshots that hide unreadable annotation cards, misplaced annotation badges, unreadable connector routes, misplaced arrowheads, incorrect **Flow Action** labels, or broken panel states.

## Performance Diagnosis

- For Figma plugin freeze or latency bugs, treat synchronous full-page or deep-tree traversal as a high-risk pattern.
- If the same symptom class appears in a second user-visible entrypoint, expand from the reported command to a symptom-class audit across all plugin message handlers and `selectionchange` hot paths before declaring the fix complete.
- For each remaining traversal of `figma.currentPage.children`, nested `children`, or id-to-node rehydration, either remove it, bound it to project-owned containers or endpoint ancestor paths, or document why it is intentionally full-page work.
- Add regression coverage that fails when unrelated Figma frame descendants are scanned on latency-sensitive create or selection paths.
