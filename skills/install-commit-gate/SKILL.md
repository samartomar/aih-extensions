---
name: install-commit-gate
description: "Install the commit gate in this repo: a git commit-msg hook that blocks conflict markers, leftover [DEBUG-] tags and quality-bar loosening in what is actually being committed."
disable-model-invocation: true
---

# Install the commit gate

Install `commit-gate.mjs` (in this skill's folder) as the current repo's `commit-msg` hook. It runs on every commit, from Claude, a terminal or an IDE, and reads what git is actually about to commit. Read its header comment for exactly what it blocks.

1. **Find the repo.** `git rev-parse --show-toplevel`. Not a git repo: stop and say so.

2. **Copy the gate** from this skill's folder to `<root>/.githooks/commit-gate.mjs`, replacing an older copy (the `VERSION` constant says which one is there). It skips its own file, which contains the patterns it looks for.

3. **Wire it**, using the line `node .githooks/commit-gate.mjs "$1"`:
   - **Husky** (`<root>/.husky/` exists): add the line to `.husky/commit-msg`, creating the file if needed and keeping any lines already in it.
   - **`core.hooksPath` set** (`git config core.hooksPath`): add it to `commit-msg` in that directory, same rule.
   - **Otherwise**: write the hook at the path `git rev-parse --git-path hooks/commit-msg` prints, as `#!/bin/sh` followed by the line, and make it executable. If a `commit-msg` hook already exists there, add the line to it instead of replacing it. Tell the user this hook lives in `.git/` and is not shared with the team; `/setup-pre-commit` sets up Husky if they want it shared.

4. **Check it.** Run `node <root>/.githooks/commit-gate.mjs --self-test` and show the output.

5. **Tell the user**, in three lines: a deliberate loosening goes through with `[floor-ok: <reason>]` in the commit message; paths that should never be checked go in `.floorignore`; people can still bypass with `git commit --no-verify`, but aih-extensions' git-guard stops the coding agent from doing that.

Commit `.githooks/commit-gate.mjs` (and `.husky/commit-msg` if you touched it) only if the user asks.
