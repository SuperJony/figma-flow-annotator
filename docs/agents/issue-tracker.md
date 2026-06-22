# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `SuperJony/figma-flow-annotator`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --repo SuperJony/figma-flow-annotator --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --repo SuperJony/figma-flow-annotator --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --repo SuperJony/figma-flow-annotator --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --repo SuperJony/figma-flow-annotator --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --repo SuperJony/figma-flow-annotator --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --repo SuperJony/figma-flow-annotator --comment "..."`

`gh` can infer the repo from `git remote -v` when run inside this clone, but pass `--repo SuperJony/figma-flow-annotator` when running from another directory.

## Pull requests as a triage surface

**PRs as a request surface: no.** `/triage` should not include external PRs in the issue triage queue.

If this is later changed to `yes`, external PRs should run through the same labels and states as issues, using the `gh pr` equivalents.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo SuperJony/figma-flow-annotator --comments`.
