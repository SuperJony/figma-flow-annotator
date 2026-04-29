# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo uses a single-context layout:

- `CONTEXT.md` at the repo root defines the Figma Flow Annotator domain vocabulary.
- `docs/adr/` stores architectural decisions for this repo.
- There is no `CONTEXT-MAP.md` unless the repo later becomes multi-context.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** - read ADRs that touch the area you're about to work in.

If any of these files don't exist, proceed silently. Don't flag their absence or suggest creating them upfront; producer skills such as `/grill-with-docs` create them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, either reconsider whether you're inventing language the project doesn't use, or note the gap for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
