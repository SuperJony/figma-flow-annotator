# Figma Flow Annotator Agent Guide

## Orientation

- pnpm monorepo: `apps/flow-annotator` (the Figma plugin) and `packages/core`.
- Read `CONTEXT.md` for domain vocabulary before naming concepts in issues, tests, docs, or code.
- Read relevant ADRs under `docs/adr/` before changing behavior. If a change conflicts with an ADR, surface the conflict before implementing.
- Issues and PRDs live in GitHub Issues for `SuperJony/figma-flow-annotator`. Conventions: `docs/agents/issue-tracker.md` (gh usage, PRs are not a triage surface), `docs/agents/triage-labels.md` (label set), `docs/agents/domain.md` (how to consume domain docs).

## Build & Test

- Full gate: `pnpm verify` (core tests + flow-annotator verify + biome).
- Unit tests: `pnpm --filter @figma-flow-annotator/flow-annotator test`.
- Visual regression: `pnpm --filter @figma-flow-annotator/flow-annotator test:visual` for all visual domains, or the focused `test:visual:annotate` / `test:visual:connect` / `test:visual:panel` scripts documented in `apps/flow-annotator/README.md`.

## Code-Change Verification

- For any code modification, get an independent verification audit before reporting completion — e.g. Claude Code's `/verify` skill or a peer review from another agent CLI.
- Address actionable verification findings before final delivery, or report unresolved risk explicitly.
- For changes that may affect **Annotation Card** or **Annotation Badge** rendering, **Flow Connector** route/SVG/label rendering, plugin panel markup/styles/scripts, Playwright visual fixtures, or visual snapshots, include the visual regression surface (scripts above).
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
