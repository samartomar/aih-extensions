# aih-extensions

**Matt Pocock's engineering flow, Addy Osmani's specialists, one owner per job.**

Two of the best agent-skill collections, [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), fight each other when you install both: two interview styles, two TDD loops, two reviewers, two ADR folders, all firing on the same prompts. aih-extensions keeps Matt's flow as it ships and adds only what his set lacks, taken from Addy's: security, performance, observability, CI, docs, migrations and a pre-launch fan-out. It also adds guardrails that prose can't provide: hooks that stop destructive git commands and a commit gate that reads what is actually committed.

It installs straight from GitHub into **Claude Code, Codex, Cursor, Kimi Code and opencode** (which is how this setup runs DeepSeek), so it works where your organization has switched off plugin marketplaces. Each tool gets the same skills and the same git guard, wired into its own hook system, and one command removes every trace.

```
  DEFINE            PLAN             BUILD            VERIFY           REVIEW           SHIP
 ┌─────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐
 │  Grill  │ ──▶ │  Spec   │ ──▶ │Implement │ ──▶ │   TDD    │ ──▶ │  Review  │ ──▶ │  /ship  │
 │ + docs  │     │ Tickets │     │          │     │ Diagnose │     │  2 axes  │     │go/no-go │
 └─────────┘     └─────────┘     └──────────┘     └──────────┘     └──────────┘     └─────────┘
  /grill-with-    /to-spec        /implement       tdd              code-review      /ship
  docs            /to-tickets                      diagnosing-bugs
 └──────────────────────────────── Matt Pocock ────────────────────────────────┘ └── Addy ──┘

  Specialists (Addy, on demand):  /security-and-hardening  /performance-optimization  /api-and-interface-design ...
  Guardrails (aih-extensions):      git-guard   commit gate   skill-guard   lanes-card
```

---

## Commands

The entry points you type. Matt's skills keep his names; the add-on's are listed under [Reference](#reference).

| What you're doing | Command | From | Key principle |
|---|---|---|---|
| Sharpen an idea, build a shared language | [`/grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) | Matt | Align before you build |
| Turn the conversation into a spec | [`/to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md) | Matt | Synthesize, don't re-interview |
| Split it into tickets | [`/to-tickets`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md) | Matt | Tracer-bullet vertical slices |
| Build it | [`/implement`](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md) | Matt | Test-first at agreed seams |
| Fix something broken | [`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md) | Matt | No theory before a red feedback loop |
| Review a branch | [`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) | Matt | Standards and Spec, never merged |
| Check a risky change | [`/security-and-hardening`](skills/security-and-hardening/SKILL.md) | Addy | Untrusted input is guilty until validated |
| Go / no-go before launch | [`/ship`](commands/ship.md) | Addy | Three reviewers in parallel, one decision |
| Audit web performance | [`/webperf`](commands/webperf.md) | Addy | Measure before you optimize |
| Set the quality bar once | [`/constraint-driven-development`](skills/constraint-driven-development/SKILL.md) | Addy | Tightening is silent, loosening is loud |
| Guard a repo's commits | [`/install-commit-gate`](skills/install-commit-gate/SKILL.md) | aih-extensions | Check what is actually committed |
| Not sure which to use | [`/ask-matt`](https://github.com/mattpocock/skills/blob/main/skills/engineering/ask-matt/SKILL.md), [`/ask-sam`](skills/ask-sam/SKILL.md) | both | Ask the router |

Two specialists also fire on their own when the task fits: `observability-and-instrumentation` and `shipping-and-launch`.

---

## Installation (30-second setup)

Two routes, both from GitHub. **Direct** copies plain files into each tool's own folders with no plugin marketplace involved, so it works where your organization has switched marketplaces off. **Marketplace** uses Claude Code's plugin system (Claude Code only), so Matt's skills update themselves. Pick one: the installer removes the other, because both at once would list every skill twice.

### 1. Get the skills

<details open>
<summary><strong>Direct (default): no marketplace needed</strong></summary>

```bash
node scripts/setup.mjs install --yes
```

- Clones `github.com/mattpocock/skills` at the commit this add-on was tested against (`--matt-ref <sha|branch>` picks another) and takes his 25 plugin skills, plus this add-on's 19 skills, 4 agents, 2 commands and 7 checklists, from this folder or from GitHub with `--addon-repo <url> [--addon-ref <ref>]`.
- Installs for every tool whose config folder exists; `--tools claude,codex,kimi` picks some. Each tool sees each skill exactly once:

| Tool | Skills | Agents, commands | Git guard | Typed-only skills |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills` | `~/.claude/agents`, `commands` | hooks in `settings.json` | frontmatter |
| Cursor | loads `~/.claude` (Settings: "Include Third-Party Plugins, Skills, and Other Configs", on by default) | same | Claude's hooks, which Cursor runs | frontmatter |
| Codex | `~/.codex/skills` | `~/.codex/agents/*.toml` | hooks in `~/.codex/hooks.json` | `agents/openai.yaml`, as Matt ships |
| Kimi Code | `~/.kimi-code/skills` | `~/.kimi-code/agents` | a `[[hooks]]` block in `config.toml` | frontmatter |
| opencode (DeepSeek) | reads `~/.claude/skills` | `~/.config/opencode/agents`, `command` | a plugin in `plugins/` | `permission.skill` deny in `opencode.json` |

- Nothing goes into `~/.agents/skills`: Codex, Kimi, Cursor and opencode all read it, and opencode picks a random copy when two folders share a skill name.
- Backs up each config file before editing it (`<file>.aih-bak-<time>`), leaves other hooks (hindsight etc.) untouched, and hides Claude's built-in `simplify`. Matt's `code-review` replaces Claude's built-in one by name.
- Records every file and config edit in `~/.aih-extensions/manifest.json`, and stops without changing anything if a destination already exists that it did not install.

Skills appear without a prefix (`/tdd`, `/ship`; `$tdd` in Codex, `/skill:tdd` in Kimi). Matt's skills don't update themselves on this route: run install again to move them. **Codex** runs new hooks only after you trust them once: open `codex` and accept them at startup (or review with `/hooks`).

</details>

<details>
<summary><strong>Marketplace: Claude Code's plugin system</strong></summary>

```bash
node scripts/setup.mjs install --marketplace --yes
```

Installs `mattpocock-skills@claude-plugins-official` (Anthropic's listing fetches his GitHub repo at a pinned commit, and updates arrive automatically), adds this folder or `--addon-repo` as the `aih-extensions` marketplace, installs the add-on, and hides the built-in `code-review` and `simplify`, since plugin skills are namespaced and would otherwise share those names.

After changing what the add-on loads, bump its version, then run `claude plugin update aih-extensions`: updates compare version numbers, not commits.

</details>

Every command prints its plan and changes nothing without `--yes`. `npm run status` shows what is installed, and from which commit.

### 2. Set up each repo

In your agent, once per repo:

- `/setup-matt-pocock-skills` asks which issue tracker you use (GitHub, GitLab or local files), your triage labels, and where docs live.
- `/install-commit-gate` adds the commit gate as a git hook, so it guards commits from any tool and any terminal.

### 3. Start a new session, and you're ready to go.

### Uninstall

```bash
npm run teardown -- --yes
```

Removes whichever route is installed, for every tool, plus marketplace copies of either plugin even if they were installed by hand: every file in the manifest, our hooks, the Kimi block, the opencode plugin and skill denies (other entries untouched), the plugin cache and data folders that `claude plugin uninstall` leaves on disk, test and measurement temp folders, the upstream cache, and older config backups (the newest of each is kept). Without a manifest it still finds and removes our config edits by marker. `node scripts/setup.mjs remove-gate <repo> --yes` takes the commit gate out of a repo.

Verified: after install and uninstall, `settings.json`, `~/.codex/hooks.json`, `~/.kimi-code/config.toml` and `opencode.json` are byte-identical to before, every folder install created is gone, and what was already there (claude.ai's `~/.claude/skills/synced`, other skills, other commands) is left alone. The marketplace route can need a second pass when run inside a Claude session that has the add-on loaded; run it from a terminal, or twice.

---

## Why This Exists

### #1: Two Good Skill Sets Fight Each Other

> "Do one thing and do it well."
>
> Doug McIlroy, the Unix philosophy

**The Problem**: Matt's and Addy's collections both cover interviews, specs, planning, TDD, debugging, code review and ADRs. Installed together, two skills fire on the same prompt and contradict each other: one asks one question at a time while the other asks a numbered round; one refactors inside the TDD loop while the other forbids it; ADRs land in `docs/decisions/` or `docs/adr/` depending on which skill got there first.

**The Fix** is one owner per job. Matt's plugin owns the flow, untouched. The add-on vendors only Addy's specialists, and a `forbiddenRefs` check fails the build if any generated file still points at an Addy skill that Matt's plugin replaces. Claude Code's `skillOverrides` setting cannot hide plugin skills (measured), so leaving the duplicates out is the only clean option.

### #2: Plugin Marketplaces Can Be Switched Off

**The Problem**: Organizations can disable plugin marketplaces through managed settings. Both upstream install stories depend on them.

**The Fix** is the direct route: clone GitHub at a pinned commit, copy into each tool's own folders, and record every file and config edit in a manifest, so uninstall removes exactly what install added and nothing else.

### #3: Prose Can't Stop a Destructive Command

> "Trust, but verify."
>
> Russian proverb

**The Problem**: A skill can tell an agent not to `git reset --hard` or `git commit --no-verify`. It can't stop it. Matt's own guard script needs `jq`, and without it silently allows everything.

**The Fix** is enforcement outside the prompt:

- **git-guard** is a hook that reads the command line, including `bash -lc`, `pwsh -Command`, `eval`, `$(…)` and line continuations, and blocks destructive git before it runs, in every supported tool.
- **The commit gate** is a real git hook: it reads what git is actually committing and blocks conflict markers, leftover `[DEBUG-…]` tags and quality-bar loosening.

### #4: More Skills Is Not Better Skills

> "Measure. Don't tune for speed until you've measured."
>
> Rob Pike, Notes on Programming in C

**The Problem**: Every skill that fires on its own puts its description in every session and competes for the model's attention.

**The Fix** is to measure, not assume. Each specialist was run with and without the add-on in `claude plugin eval`. Routing was right, but on typical prompts plain Claude already matched most specialists, so only the two that earned it fire on their own. The rest wait until you type them. The add-on costs **576 tokens** per session on top of Matt's plugin.

### #5: Every Tool Hooks In Differently

**The Problem**: Both upstream repos carry skills to other agents and stop there: their hooks, commands and personas stay Claude-only. Each tool reads a different skills folder, several read each other's, and each has its own hook protocol. Kimi and Codex ignore an "ask" decision, Codex calls its shell tool `Bash` while running PowerShell, and opencode blocks by throwing an error.

**The Fix** is one policy (`hooks/lib/git-policy.mjs`) behind thin adapters, one skill copy per tool, and a live check in each CLI: the guard stopped `git reset --hard` with uncommitted work in Claude Code, Codex, Kimi Code and opencode. Where a tool can't pause to ask, a push is refused with a note to ask you, never let through.

### Summary

Keep the best flow as its author ships it, add specialists only where they measurably help, and put the rules that must hold into hooks rather than prose.

---

## Reference

As in Matt's repo, skills split on one axis: who can invoke them. **Model-invoked** skills fire on their own when the task fits. **User-invoked** skills run only when you type them. The add-on keeps most specialists user-invoked until an eval shows they beat plain Claude; promoting one is a one-line change in [`scripts/upstream.config.mjs`](scripts/upstream.config.mjs).

**Matt Pocock's 25 skills** are installed as he ships them: see [his Reference](https://github.com/mattpocock/skills#reference).

### Specialists (from Addy Osmani)

**Model-invoked**

| Skill | What It Does | Use When |
|---|---|---|
| [observability-and-instrumentation](skills/observability-and-instrumentation/SKILL.md) | Structured logs, RED metrics, traces, symptom-based alerts | Shipping anything that runs in production |
| [shipping-and-launch](skills/shipping-and-launch/SKILL.md) | Pre-launch checklist, staged rollout, rollback plan; behind `/ship` | Preparing to deploy |

**User-invoked**

| Skill | What It Does | Use When |
|---|---|---|
| [security-and-hardening](skills/security-and-hardening/SKILL.md) | OWASP Top 10 prevention, auth, secrets, dependency audits, privacy | Auth, untrusted input, secrets or personal data, before review signs off |
| [performance-optimization](skills/performance-optimization/SKILL.md) | Measure first, fix, then set a budget | After `diagnosing-bugs` locates a slowdown |
| [api-and-interface-design](skills/api-and-interface-design/SKILL.md) | Network contracts: pagination, errors, versioning, idempotency | Designing REST, GraphQL or RPC endpoints (module shape stays with `codebase-design`) |
| [documentation-and-adrs](skills/documentation-and-adrs/SKILL.md) | README, API reference, OpenAPI, changelog, "why" comments | Writing docs (ADRs stay with `domain-modeling`) |
| [code-simplification](skills/code-simplification/SKILL.md) | Clearer code with identical behaviour, without shallow helpers | Code works but is hard to read (replaces the built-in `simplify`) |
| [frontend-ui-engineering](skills/frontend-ui-engineering/SKILL.md) | Production UI, accessibility, responsive layout | Building the real UI after `prototype` settled the design |
| [ci-cd-and-automation](skills/ci-cd-and-automation/SKILL.md) | Pipelines and quality gates | Setting up or changing CI |
| [deprecation-and-migration](skills/deprecation-and-migration/SKILL.md) | Expand-contract migrations, retiring code safely | Removing systems or migrating users or schemas |
| [doubt-driven-development](skills/doubt-driven-development/SKILL.md) | Fresh-context adversarial check of one decision | High stakes: auth, irreversible changes, unfamiliar code |
| [source-driven-development](skills/source-driven-development/SKILL.md) | Framework code checked against current official docs | Writing framework code from memory is risky |
| [constraint-driven-development](skills/constraint-driven-development/SKILL.md) | Writes `CONSTRAINTS.md` with default thresholds | Once per repo |
| [git-workflow-and-versioning](skills/git-workflow-and-versioning/SKILL.md) | Releases, semver, tags, changelogs, atomic commits | Cutting a release or splitting a messy tree |
| [idea-refine](skills/idea-refine/SKILL.md) | Divergent ideation, many variants of a raw idea | Before `/grill-with-docs` converges on one |
| [browser-testing-with-devtools](skills/browser-testing-with-devtools/SKILL.md) | Real-browser verification through Chrome DevTools | The chrome-devtools MCP server is installed |

### From aih-extensions and Matt's misc bucket

**User-invoked**

| Skill | What It Does | Use When |
|---|---|---|
| [ask-sam](skills/ask-sam/SKILL.md) | Router over this add-on; points to `/ask-matt` for the main flow | You don't know which specialist fits |
| [install-commit-gate](skills/install-commit-gate/SKILL.md) | Installs the commit gate as a git `commit-msg` hook | Once per repo |
| [setup-pre-commit](skills/setup-pre-commit/SKILL.md) | Husky, lint-staged, typecheck and tests on commit (Matt's, not in his plugin) | A JS/TS repo without pre-commit hooks |

---

## Agent Personas

Addy's specialist reviewers, run in parallel by `/ship`:

| Agent | Role | Perspective |
|---|---|---|
| [code-reviewer](agents/code-reviewer.md) | Senior Staff Engineer | Five-axis review of a production-bound change (everyday review stays with `code-review`) |
| [security-auditor](agents/security-auditor.md) | Security Engineer | Vulnerabilities, threat model, OWASP |
| [test-engineer](agents/test-engineer.md) | QA Engineer | Coverage gaps and test strategy |
| [web-performance-auditor](agents/web-performance-auditor.md) | Web Performance Engineer | Core Web Vitals; run it with `/webperf` |

---

## Guardrails

| | Where it runs | What it does |
|---|---|---|
| **git-guard** | Claude Code, Cursor, Codex and Kimi hooks; an opencode plugin | Denies `push --force` and its variants, `reset --hard`, `clean -f`, `branch -D/-f/-M/-C`, `checkout -f/-B/.`, `switch -f/-C/--discard-changes`, `restore .`, `stash clear`, `commit --no-verify` and `-c core.hooksPath=…`. Asks before any other push (refuses it in Codex, Kimi and opencode, which can't ask). |
| **commit gate** | git `commit-msg` hook, per repo | Always blocks conflict markers and leftover `[DEBUG-…]` tags. Blocks new suppressions, skipped or deleted tests, net-removed assertions and stubs, unless the message says `[floor-ok: <reason>]`. Skips merges' incoming lines, moved lines, and paths in `.floorignore`. |
| **skill-guard** | Claude Code hook, Skill | Keeps `code-review` and `grilling` out of sub-agents, where they can't start sub-agents or interview you. |
| **lanes-card** | Session start in Claude Code and Codex; opencode's system prompt | A short routing note, including the workaround for a gap in Matt's flow: `/implement` asks for review before committing, but `code-review` reads committed changes. |

All four are Node with no dependencies. `npm test` runs 123 cases: 88 git-guard inputs covering every bypass found in review and each tool's input shape, 14 commit-gate cases against real git repos, and 21 for the other hooks, the opencode plugin and the installer.

---

## Reference Checklists

Addy's checklists, which the specialist skills pull in when needed:

| Reference | Covers |
|---|---|
| [definition-of-done.md](references/definition-of-done.md) | The standing bar every change clears |
| [testing-patterns.md](references/testing-patterns.md) | Test structure, naming, mocking, anti-patterns |
| [security-checklist.md](references/security-checklist.md) | Auth, input validation, headers, CORS, OWASP Top 10 |
| [performance-checklist.md](references/performance-checklist.md) | Core Web Vitals targets, frontend and backend checks |
| [accessibility-checklist.md](references/accessibility-checklist.md) | Keyboard, screen readers, ARIA, contrast |
| [observability-checklist.md](references/observability-checklist.md) | Logging, metrics, tracing, alerting, pre-launch gate |
| [orchestration-patterns.md](references/orchestration-patterns.md) | Parallel fan-out and the "personas don't invoke personas" rule |

---

## Measured

**Value:** `claude plugin eval . --runs 2`, Sonnet, each case with and without the add-on (2026-09-27, $2.62). Scores are the share of runs passing a strict content grader.

| Case | With | Without | Skill fired |
|---|---|---|---|
| Observability for a payment worker | 1.0 | 0.5 | 2/2 |
| Security review of a login handler | 1.0 | 1.0 | 2/2 |
| Public REST API contract | 1.0 | 1.0 | 2/2 |
| N+1 performance fix | 0 | 0 | 1/2 |
| Simplify a parser | 0 | 0 | 2/2 |
| README from source | 0 | 0.5 | 2/2 (case was flawed, since fixed) |
| Rename (nothing should fire) | 1.0 | 1.0 | 0/2, correct |
| Module design (API skill should stay quiet) | 1.0 | 1.0 | 0/2, correct |

Two runs per arm is a small sample: one run moves a score by 0.5. That is why specialists stay user-invoked rather than deleted, with the eval suite as the gate for promoting them.

**Context:** the add-on adds 576 tokens per session on top of Matt's plugin (`npm run context`, headless, with the skill-listing cap lifted). Matt's plugin itself adds about 370.

**Each tool, live** (2026-09-27, Windows 11). In a throwaway repo with uncommitted work, each model was asked to run `git branch`, then `git reset --hard`, then `git push`.

| Tool | Version, model | Reset blocked, work survived | Push | Skills | Typed-only hidden, still typeable |
|---|---|---|---|---|---|
| Claude Code | 2.1.283, Haiku | yes | asked | each once | yes |
| Codex | 0.155.1 | yes | refused | 13 auto skills from `~/.codex/skills`, each once | yes; `$ask-sam` works |
| Kimi Code | 2.0.2, K3 | yes | refused | each once | hidden; `/skill:` can't be run headless |
| opencode | 1.18.26, DeepSeek Flash | yes | refused | 44 from `~/.claude/skills`, each once | yes; `/ask-sam` works |
| Cursor | 3.22.7 | not run: no Cursor CLI here | | loads `~/.claude` | |

Cursor was checked against its own code instead: it turns Claude's `Bash|PowerShell` matcher into `Shell|PowerShell` and honours the same deny, and the guard passes its exact input in `npm test`.

---

## How It's Built

Addy's skills are **vendored, not forked by hand**. `npm run vendor` fetches both upstreams at the commits pinned in [`scripts/upstream.config.mjs`](scripts/upstream.config.mjs), copies the chosen skills, applies every edit as an exact find-and-replace with an expected count, and builds it all in a staging folder. It changes nothing in the repo if a patch no longer matches, a frontmatter value needs quoting, or a generated file still points at a skill this add-on leaves out.

| Layer | Paths | Purpose |
|---|---|---|
| Vendored skills | `skills/` (16 from Addy, 1 from Matt's misc bucket) | Generated by `npm run vendor`, listed in `vendor.lock.json`; never edited by hand |
| Original skills | `skills/ask-sam/`, `skills/install-commit-gate/` | The router and the commit gate |
| Review material | `agents/` (4), `commands/` (2), `references/` (7) | Addy's personas, `/ship`, `/webperf` and checklists |
| Guardrails | `hooks/` | The git policy and shell parser (`lib/`), the hook adapter for Claude, Cursor, Codex and Kimi, the opencode plugin, skill-guard, lanes-card |
| Tooling | `scripts/` | Vendoring; install and cleanup (`tools.mjs` says where each tool reads what); context measurement |
| Checks | `tests/`, `evals/` | Hook and installer tests; with-vs-without routing and quality evals |
| Plugin metadata | `.claude-plugin/` | For the marketplace route and `claude plugin eval` |

**Updating from upstream:** change a `sha` in the config, run `npm run vendor`, fix or drop any patch it rejects, then `npm test` and `npm run validate`. Read the upstream diff too: exact patches catch changed wording, not changed meaning.

---

## Limits

- **You maintain it.** Upstream fixes to Addy's skills arrive only when you bump the pin and re-vendor.
- **git-guard is a seatbelt, not a sandbox.** A script file, an alias or a command built at runtime goes around it.
- **The commit gate is regex-shallow on purpose**, and people can skip it with `--no-verify` (Claude can't).
- **Not every tool gets everything.** skill-guard is Claude-only (no other tool has a Skill tool call to hook), Kimi gets no lanes card (its session-start hook can't add context), and `/ship` and `/webperf` exist in Claude Code, Cursor and opencode only.
- **Cursor is covered through its Claude import.** Turn off "Include Third-Party Plugins, Skills, and Other Configs" and Cursor loses the skills and the guard. `npm run status` reports the setting.
- **Codex hooks need one trust click**, and until then Codex skips them without a word.
- **opencode reads the skills from `~/.claude/skills`**, so `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` hides them (`status` warns).

---

## Credits

aih-extensions stands on two collections:

| | Name | GitHub | Contribution |
|---|---|---|---|
| <img src="https://github.com/mattpocock.png?size=120" width="60" height="60" alt="Matt Pocock"> | **Matt Pocock** | [@mattpocock](https://github.com/mattpocock) | The main flow: [mattpocock/skills](https://github.com/mattpocock/skills), installed as he ships it |
| <img src="https://github.com/addyosmani.png?size=120" width="60" height="60" alt="Addy Osmani"> | **Addy Osmani** | [@addyosmani](https://github.com/addyosmani) | The specialists, personas and checklists: [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) |
| <img src="https://github.com/samartomar.png?size=120" width="60" height="60" alt="Samarjeet Singh Tomar"> | **Samarjeet Singh Tomar** | [@samartomar](https://github.com/samartomar) | Selection, guardrails, the five-tool installer; maintainer |

---

## License

MIT. Vendored material keeps its upstream MIT licenses: see [NOTICE.md](NOTICE.md) and [`licenses/`](licenses/).
