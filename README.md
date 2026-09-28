# aih-extensions

A curated, non-conflicting set of agent skills: Matt Pocock's development lifecycle, Addy Osmani's specialists for what it leaves out, and git guardrails. It installs from GitHub into Claude Code, Codex, Cursor, Kimi Code and opencode, with no plugin marketplace.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Quickstart

Requires Node.js 22 or later and git.

```bash
git clone https://github.com/samartomar/aih-extensions.git
cd aih-extensions
node scripts/setup.mjs install          # prints the plan, changes nothing
node scripts/setup.mjs install --yes    # installs for every tool it finds
```

Then:

1. Start a new session in each tool.
2. In Codex, accept the new hooks once when it asks at startup (or review them with `/hooks`). Until then Codex skips them.
3. In each repo, run `/setup-matt-pocock-skills` (issue tracker, triage labels, docs location) and `/install-commit-gate`.

`node scripts/setup.mjs status` shows what is installed and from which commit. `--tools claude,codex` limits the install to the tools you name.

## What's inside

Running Matt's and Addy's collections side by side gives two skills each for interviews, specs, TDD, debugging, code review and ADRs. Both activate on the same prompts and disagree on formats: where ADRs go, how a review is laid out, when to refactor. This repo keeps Matt's set as he ships it and takes from Addy's only what Matt's set lacks.

| Layer | Source | Contents |
|---|---|---|
| Core lifecycle | [mattpocock/skills](https://github.com/mattpocock/skills), installed from GitHub at a pinned commit | Define, spec, tickets, implement test-first, review; debugging, domain modelling, module design |
| On-demand specialists | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), vendored at a pinned commit | Security, performance, observability, API contracts, docs, CI/CD, migrations, frontend; `/ship` with three reviewer agents |
| Safety layer | this repo | git-guard before shell commands, a commit gate in git, skill-guard, a routing note at session start |

### Core lifecycle (Matt Pocock)

```
/grill-with-docs  →  /to-spec  →  /to-tickets  →  /implement  →  /code-review
 agree on terms      write it     slice it        test-first     standards + spec
```

Bugs go to `/diagnosing-bugs`, module shape to `/codebase-design`. When unsure, type `/ask-matt`. All 25 skills are described in [Matt's reference](https://github.com/mattpocock/skills#reference).

### On-demand specialists (Addy Osmani)

**Auto** skills also start on their own when the task fits. The rest run only when typed, because an eval found plain models matched them on typical prompts ([evals/README.md](evals/README.md)).

| Skill | Auto | Use it for |
|---|---|---|
| [`/observability-and-instrumentation`](skills/observability-and-instrumentation/SKILL.md) | yes | Logs, metrics, traces and alerts for anything that runs in production |
| [`/shipping-and-launch`](skills/shipping-and-launch/SKILL.md) | yes | Pre-launch checklist, staged rollout, rollback plan |
| [`/ship`](commands/ship.md) | | Go/no-go: code, security and test reviewers in parallel, one decision |
| [`/webperf`](commands/webperf.md) | | Web performance audit (Core Web Vitals) |
| [`/security-and-hardening`](skills/security-and-hardening/SKILL.md) | | Auth, untrusted input, secrets, personal data |
| [`/performance-optimization`](skills/performance-optimization/SKILL.md) | | Fix and budget a slowdown that `/diagnosing-bugs` located |
| [`/api-and-interface-design`](skills/api-and-interface-design/SKILL.md) | | REST, GraphQL or RPC contracts and versioning |
| [`/documentation-and-adrs`](skills/documentation-and-adrs/SKILL.md) | | README, API reference, changelog (ADRs stay with Matt's `/domain-modeling`) |
| [`/code-simplification`](skills/code-simplification/SKILL.md) | | Clearer code, same behaviour (replaces Claude Code's built-in `/simplify`) |
| [`/frontend-ui-engineering`](skills/frontend-ui-engineering/SKILL.md) | | Production UI, accessibility, responsive layout |
| [`/ci-cd-and-automation`](skills/ci-cd-and-automation/SKILL.md) | | Pipelines and quality gates |
| [`/deprecation-and-migration`](skills/deprecation-and-migration/SKILL.md) | | Retiring code, migrating users or schemas |
| [`/doubt-driven-development`](skills/doubt-driven-development/SKILL.md) | | Adversarial second look at one high-stakes decision |
| [`/source-driven-development`](skills/source-driven-development/SKILL.md) | | Framework code checked against current official docs |
| [`/idea-refine`](skills/idea-refine/SKILL.md) | | Many variants of a raw idea, before `/grill-with-docs` |
| [`/browser-testing-with-devtools`](skills/browser-testing-with-devtools/SKILL.md) | | Real-browser checks (needs the chrome-devtools MCP server) |
| [`/constraint-driven-development`](skills/constraint-driven-development/SKILL.md) | | Once per repo: write `CONSTRAINTS.md` |
| [`/git-workflow-and-versioning`](skills/git-workflow-and-versioning/SKILL.md) | | Releases, semver, changelogs, atomic commits |
| [`/setup-pre-commit`](skills/setup-pre-commit/SKILL.md) | | Once per JS/TS repo: Husky, lint-staged, typecheck and tests (from Matt's misc skills) |

The specialists draw on seven checklists in [`references/`](references/) (definition of done, testing, security, performance, accessibility, observability, orchestration).

### Safety layer (this repo)

- **git-guard** checks each shell command before the agent runs it. It denies force pushes and remote deletes, `reset --hard`, `clean -f`, forced branch moves and deletes, `checkout`/`switch`/`restore` that discard work, `stash clear`, `commit --no-verify` and `-c core.hooksPath=…`, and asks before any other push. It is a guardrail against common agent mistakes, not a sandbox: see [Limits](#limits).
- **The commit gate** ([`/install-commit-gate`](skills/install-commit-gate/SKILL.md), once per repo) is a git `commit-msg` hook, so it covers commits from any tool or terminal. It blocks conflict markers and leftover `[DEBUG-…]` tags, and new suppressions, skipped tests or removed assertions unless the message says `[floor-ok: <reason>]`.
- **skill-guard** keeps `/code-review` and `/grilling` out of sub-agents, where they can't start their own sub-agents or interview you.
- **The routing note** at session start points to `/ask-matt` and [`/ask-sam`](skills/ask-sam/SKILL.md), the router for this add-on.

## Calling a skill

| Claude Code, Cursor, opencode | Codex | Kimi Code |
|---|---|---|
| `/name` | `$name` | `/skill:name` |

This README writes every skill as `/name`.

## Supported tools

Each tool gets its own copy of the skills, loads each skill once, and runs git-guard through its own hook system. Tools differ in what happens when the guard wants to ask, and when the guard itself can't run:

| Tool | Skills from | Guard wired in as | A push (guard asks) | If the guard can't run |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills` | hook in `settings.json` | asks you | command runs, error shown |
| Cursor | `~/.claude`, through "Include Third-Party Plugins, Skills, and Other Configs" (on by default) | Claude's hook, imported by Cursor | asks you | command refused |
| Codex | `~/.codex/skills` | hook in `~/.codex/hooks.json` | refused, with a note to ask you | an untrusted hook is skipped: command runs |
| Kimi Code | `~/.kimi-code/skills` | `[[hooks]]` block in `config.toml` | refused, with a note to ask you | command runs |
| opencode (for example with DeepSeek) | `~/.claude/skills` (its own folder without Claude Code) | plugin in `plugins/` | refused, with a note to ask you | plugin not loaded: command runs |

Every row was checked live on Windows 11 on 2026-09-27. Versions, results and per-tool details: [docs/tools.md](docs/tools.md).

## Uninstall

```bash
node scripts/setup.mjs uninstall --all --yes
```

Removes every file and config entry the install added, for every tool, and nothing else. The edited config files (`settings.json`, `hooks.json`, `config.toml`, `opencode.json`) come back byte for byte; each was backed up before the first edit. `node scripts/setup.mjs remove-gate <repo> --yes` takes the commit gate out of a repo.

## Limits

- **git-guard reads command text; it does not parse shell like a shell does.** It unwraps `bash -c`, `pwsh -Command`, `eval`, `$(…)` and line continuations, but a script file, an alias or a command assembled at runtime gets past it.
- **The commit gate uses regular expressions on the staged diff**, and people can skip it with `git commit --no-verify` (git-guard stops agents from doing that).
- **Coverage differs by tool.** skill-guard is Claude Code only, Kimi Code gets no session-start note, and `/ship` and `/webperf` exist in Claude Code, Cursor and opencode only.
- **Start Cursor's CLI from PowerShell, cmd or Windows Terminal.** Started from Git Bash, it runs hooks through the wrong shell and refuses every shell command, whatever the hook.
- **Updates are manual.** Run install again to move to newer pins.

## Claude Code plugin route

For Claude Code alone, `node scripts/setup.mjs install --marketplace --yes` installs Matt's official plugin and this repo as a plugin instead, so Matt's skills update themselves. Organizations can disable plugin marketplaces, which is why the default route doesn't use them. Installing one route removes the other.

## Documentation

- [docs/tools.md](docs/tools.md): where each tool gets what, and how each was verified
- [evals/README.md](evals/README.md): with-and-without evals, and the context cost per session
- [docs/maintaining.md](docs/maintaining.md): vendoring, updating the upstream pins, project layout, checks
- [AGENTS.md](AGENTS.md): rules for coding agents working on this repo

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run `npm run vendor`, `npm test` and `npm run validate`; [docs/maintaining.md](docs/maintaining.md) explains each.

## Credits

- [Matt Pocock](https://github.com/mattpocock): the core lifecycle, [mattpocock/skills](https://github.com/mattpocock/skills), installed as he ships it.
- [Addy Osmani](https://github.com/addyosmani): the specialists, reviewer agents and checklists, from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills).
- [Samarjeet Singh Tomar](https://github.com/samartomar): selection, guardrails and the installer; maintainer.

## License

MIT. Vendored material keeps its upstream MIT licenses: see [NOTICE.md](NOTICE.md) and [`licenses/`](licenses/).
