---
name: ask-sam
description: "Which aih-extensions skill fits? A router over the specialist add-on that sits on top of Matt Pocock's skills."
disable-model-invocation: true
---

# Ask Sam

aih-extensions is an add-on to Matt Pocock's plugin (`mattpocock-skills`). **For the main flow** (idea, grilling, spec, tickets, implement, review), **bugs, domain language and architecture, type `/ask-matt`.** This page covers only what the add-on brings.

Most of these skills are typed, not automatic: an eval (with vs without the add-on) found plain Claude already matches them on typical prompts, so they stay out of the way until you ask. Only the two that earned it fire on their own.

## Fire on their own

- **`/observability-and-instrumentation`**: structured logs, metrics, traces and alerts for anything that runs in production. The one specialist that measurably beat plain Claude.
- **`/shipping-and-launch`** and **`/ship`**: pre-launch go/no-go. `/ship` runs the `code-reviewer`, `security-auditor` and `test-engineer` agents in parallel and merges their reports; **`/webperf`** runs `web-performance-auditor`.

## Type when you want the specialist's checklist

- **`/security-and-hardening`**: auth, sessions, untrusted input, secrets, uploads, dependency audits, personal data. Worth typing before `code-review` signs off on such a change.
- **`/performance-optimization`**: measure first, fix, then set a budget. `diagnosing-bugs` locates a regression; this skill fixes and budgets it.
- **`/api-and-interface-design`**: REST, GraphQL or RPC contracts and versioning. Module shape stays with `codebase-design`.
- **`/documentation-and-adrs`**: README, API reference, OpenAPI, changelog, "why" comments. Decisions (ADRs) and the glossary stay with `domain-modeling`.
- **`/code-simplification`**: make working code easier to read without changing behaviour (replaces the built-in `simplify`).
- **`/frontend-ui-engineering`**: production UI, accessibility, responsive layout. `prototype` answers "what should this look like?"; this skill builds the real one.
- **`/ci-cd-and-automation`**: pipelines and quality gates.
- **`/deprecation-and-migration`**: retiring code, migrating users or schemas; sequence the phases with `/to-tickets`.
- **`/doubt-driven-development`**: a fresh-context adversarial check on one high-stakes decision. Main session only.
- **`/source-driven-development`**: check framework code against the current official docs as you write it. `research` is the background, write-it-to-a-file version.
- **`/idea-refine`**: divergent ideation, many variants of a raw idea. `/grill-with-docs` is the convergent step after it.
- **`/browser-testing-with-devtools`**: verify in a real browser; needs the chrome-devtools MCP server.

## Once per repo

- **`/install-commit-gate`**: a git hook that blocks conflict markers, leftover `[DEBUG-…]` tags and quality-bar loosening in what is actually committed, from any tool.
- **`/constraint-driven-development`**: write `CONSTRAINTS.md`. Skip the coverage dimension if you test only at agreed seams with `tdd`.
- **`/setup-pre-commit`**: Husky, lint-staged, typecheck and tests on every commit, for a JS/TS repo.
- **`/git-workflow-and-versioning`**: releases, semver bumps, tags, changelogs, splitting a messy tree into atomic commits.

## Known gap in Matt's flow

`/implement` asks for `code-review` before committing, but `code-review` reads committed changes (`git diff <fixed-point>...HEAD`). Commit first, then review, or the review sees nothing new.

## Guardrails (hooks, always on)

- **git-guard**: blocks `push --force` and friends, `reset --hard`, `clean -f`, `branch -D/-f/-M/-C`, `checkout -f/-B/.`, `switch -f/-C/--discard-changes`, `restore .`, `stash clear`, `commit --no-verify` and `-c core.hooksPath`; asks before a push to `main`, `master` or the remote's default branch. Reads Bash and PowerShell, including `bash -lc`, `pwsh -Command`, `eval`, `$(…)` and line continuations.
- **skill-guard**: keeps `code-review` and `grilling` out of sub-agents.
- **lanes-card**: a short routing note at session start and after `/compact`.

## Setup

From the aih-extensions repo: `node scripts/setup.mjs install --yes` installs Matt's skills straight from GitHub plus this add-on into Claude Code, Codex, Cursor, Kimi Code and opencode, with no plugin marketplace involved, so it works where organizations disable marketplaces. Add `--marketplace` for the Claude Code plugin route instead. `node scripts/setup.mjs uninstall --all --yes` removes whichever is installed. Per repo: `/setup-matt-pocock-skills`, then `/install-commit-gate`.
