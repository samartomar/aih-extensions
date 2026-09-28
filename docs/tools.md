# Supported tools

Where each tool gets its skills, agents and git-guard, how typed-only skills stay typed-only, and how each was verified. The paths live in [`scripts/tools.mjs`](../scripts/tools.mjs); `node scripts/setup.mjs status` shows what is installed.

## Where things go

| Tool | Skills | Agents, commands | git-guard | Typed-only skills |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills` | `~/.claude/agents`, `~/.claude/commands` | hooks in `~/.claude/settings.json` | `disable-model-invocation: true` |
| Cursor | loads `~/.claude` | loads `~/.claude` | Claude's hooks, which Cursor runs | same frontmatter |
| Codex | `~/.codex/skills` | `~/.codex/agents/*.toml` | hooks in `~/.codex/hooks.json` | `agents/openai.yaml` with `allow_implicit_invocation: false`, as Matt ships |
| Kimi Code | `~/.kimi-code/skills` | `~/.kimi-code/agents` | a `[[hooks]]` block in `~/.kimi-code/config.toml` | same frontmatter |
| opencode | `~/.claude/skills` (`~/.config/opencode/skills` without Claude Code) | `~/.config/opencode/agents`, `command` | a plugin in `~/.config/opencode/plugins` | `permission.skill` deny entries in `opencode.json` |

Every checklist in `references/` goes next to each skills folder, where the skills' `../../references/` links resolve.

Nothing goes into `~/.agents/skills`. Codex, Kimi Code, Cursor and opencode all read it, and opencode picks a random copy when two folders hold a skill with the same name. Cursor de-duplicates skills by folder name, so the copies in `~/.claude/skills` and `~/.codex/skills` count once.

Every config edit is backed up first (`<file>.aih-bak-<time>`), leaves other entries (hindsight's hooks, for example) untouched, and is recorded in `~/.aih-extensions/manifest.json`. Uninstall works from that manifest, and finds our edits by marker if the manifest is gone.

## Verified live

On Windows 11, 2026-09-27. In a throwaway repo with one uncommitted change, each model was asked to run `git branch`, then `git reset --hard`, then `git push`. Afterwards: did the branch appear, did the change survive, and did the guard's message appear in the tool's own output. Then each model listed the skills it was offered.

| Tool | Version, model | `git reset --hard` | Push | Skills offered to the model | Typing a typed-only skill |
|---|---|---|---|---|---|
| Claude Code | 2.1.283, Haiku | blocked, work kept | asked | each once, typed-only hidden | works |
| Cursor | CLI 2026.09.26, Auto, `agent -p` from PowerShell | blocked, work kept | asked (auto-approved under `--force`) | each once, typed-only hidden | not tested |
| Codex | 0.155.1 | blocked, work kept | refused | the 13 auto skills from `~/.codex/skills`, each once | `$ask-sam` works |
| Kimi Code | 2.0.2, K3 | blocked, work kept | refused | typed-only hidden | `/skill:` isn't expanded in headless runs |
| opencode | 1.18.26, DeepSeek Flash | blocked, work kept | refused | 44 from `~/.claude/skills`, each once, typed-only hidden | `/ask-sam` works |

After install and uninstall, `settings.json`, `~/.codex/hooks.json`, `~/.kimi-code/config.toml` and `opencode.json` were byte-identical to before.

## Per-tool notes

### Claude Code

- Matt's `code-review` replaces Claude Code's built-in one by name; the install hides the built-in `simplify` with `skillOverrides`, since `/code-simplification` owns that job.
- If a hook can't run, Claude Code reports a non-blocking error and the command runs.

### Cursor

- Cursor loads `~/.claude`'s skills, agents, commands and hooks while "Include Third-Party Plugins, Skills, and Other Configs" is on (the default). Turned off, Cursor gets none of them. `status` reports the setting.
- It rewrites Claude's hook matcher `Bash|PowerShell` to `Shell|PowerShell`, and honours the same deny and ask.
- It pipes the hook's input through Windows PowerShell, which puts a byte-order mark in front. The guard strips it; without that, the guard failed closed on every command.
- Cursor's CLI started from Git Bash wraps each hook in PowerShell syntax and runs it through bash, so every command hook fails and Cursor refuses every shell command. Start it from PowerShell, cmd or Windows Terminal.
- When a blocking hook can't run or prints invalid output, Cursor refuses the command.

### Codex

- Codex runs new or changed hooks only after you trust them in its interactive app (at startup, or with `/hooks`). Until then it skips them without a word, so the guard is off.
- It calls its shell tool `Bash` but runs PowerShell on Windows, so the guard reads each command both ways (`--any-shell`).
- It rejects an "ask" decision, so the guard refuses a push instead (`--no-ask`) and tells the model to ask you.
- Codex ignores `disable-model-invocation` and reads `agents/openai.yaml`, which the vendor script writes for every typed-only skill here and Matt ships for his.
- Custom prompts are gone from Codex, so `/ship` and `/webperf` aren't installed there; the `shipping-and-launch` skill is.

### Kimi Code

- Kimi Code reads hooks only from `~/.kimi-code/config.toml` and acts only on "deny", so the guard runs with `--no-ask`.
- A hook that fails, times out or can't start lets the command through.
- Its session-start hook can't add context, so there is no routing note.
- `kimi doctor config` validates the file after install.

### opencode

- opencode reads `~/.claude/skills` and `~/.agents/skills` as well as its own folder. `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` (or `OPENCODE_DISABLE_CLAUDE_CODE`, `OPENCODE_DISABLE_EXTERNAL_SKILLS`) hides the skills; `status` warns when one is set.
- It ignores `disable-model-invocation`. A `permission.skill` deny hides a skill from the model while `/name` still works.
- The plugin blocks by throwing an error and can't ask, so a push is refused with a note to ask you. It also adds the routing note to the system prompt.
- Every export of a plugin must be a function, or opencode drops the whole plugin with only a log line; the generated plugin exports one.
- Agents are converted: opencode rejects Claude's `tools:` string and needs `mode: subagent`.
