import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'git-guard.mjs');

function decide(command, tool = 'Bash') {
  const r = spawnSync('node', [HOOK], { input: typeof command === 'object' ? command.raw : JSON.stringify({ tool_name: tool, tool_input: { command }, cwd: os.tmpdir() }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow';
}

const BS = '\\', BT = '`';
const psEncoded = Buffer.from('git push --force', 'utf16le').toString('base64');

const bash = [
  // destructive rules
  ['git push --force origin main', 'deny'],
  ['git push -f', 'deny'],
  ['git push origin +main', 'deny'],
  ['git push origin :old-branch', 'deny'],
  ['git push --force-with-lease', 'deny'],
  ['git push origin main', 'ask'],
  ['git push --dry-run origin main', 'allow'],
  ['git reset --hard HEAD', 'deny'],
  ['git reset --soft HEAD~1', 'allow'],
  ['git clean -fdx', 'deny'],
  ['git clean -n', 'allow'],
  ['git branch -D feature', 'deny'],
  ['git branch -f main HEAD~3', 'deny'],
  ['git branch -M old new', 'deny'],
  ['git branch -C a b', 'deny'],
  ['git branch -c a b', 'allow'],
  ['git branch -d feature', 'allow'],
  ['git branch --list', 'allow'],
  ['git checkout .', 'deny'],
  ['git checkout -- .', 'deny'],
  ['git checkout -f main', 'deny'],
  ['git checkout -B main origin/main', 'deny'],
  ['git checkout -b feature', 'allow'],
  ['git checkout -- src/app.js', 'allow'],
  ['git switch -f main', 'deny'],
  ['git switch --discard-changes main', 'deny'],
  ['git switch -C feature', 'deny'],
  ['git switch -c feature', 'allow'],
  ['git switch main', 'allow'],
  ['git restore .', 'deny'],
  ['git restore --staged .', 'allow'],
  ['git restore src/app.js', 'allow'],
  ['git stash clear', 'deny'],
  ['git stash drop', 'ask'],
  ['git stash', 'allow'],
  ['git commit --no-verify -m x', 'deny'],
  ['git commit -nm x', 'deny'],
  ['git -c core.hooksPath=/dev/null commit -m x', 'deny'],
  ['git commit -m "note"', 'allow'],
  ['git commit -am "fix"', 'allow'],
  // line continuations
  [`git push origin main ${BS}\n  --force`, 'deny'],
  [`git reset ${BS}\r\n  --hard`, 'deny'],
  // compound statements and wrappers
  ['if true; then git push --force; fi', 'deny'],
  ['{ git reset --hard; }', 'deny'],
  ['for f in a; do git clean -fdx; done', 'deny'],
  ['while false; do git branch -D x; done', 'deny'],
  ['! git push -f', 'deny'],
  ['sudo -u me git reset --hard', 'deny'],
  ['timeout 5 git push -f', 'deny'],
  ['env -i git reset --hard', 'deny'],
  ['nice -n 10 git clean -fdx', 'deny'],
  ['xargs -I {} git branch -D {}', 'deny'],
  ['FOO=1 git reset --hard', 'deny'],
  // nested shells and substitutions
  ["bash -lc 'git reset --hard'", 'deny'],
  ['sh -ec "git push -f"', 'deny'],
  ['bash -c "git commit -m \'a b\'"', 'allow'],
  ['eval "git reset --hard"', 'deny'],
  ['cmd /c "git clean -fdx"', 'deny'],
  ['echo "$(git reset --hard)"', 'deny'],
  ['echo `git push -f`', 'deny'],
  ['x=$(git stash clear)', 'deny'],
  ['diff <(git reset --hard) b', 'deny'],
  [`"C:${BS}Program Files${BS}Git${BS}cmd${BS}git.exe" push -f`, 'deny'],
  ['git -C ../repo push -f', 'deny'],
  // heredocs: data stays data, a heredoc fed to a shell is code
  ["git commit -F - <<'EOF'\nfix: guard\n\ngit push --force was the old way\nEOF", 'allow'],
  ['cat > notes.md <<EOF\ngit reset --hard HEAD\nEOF', 'allow'],
  ["bash <<'EOF'\ngit reset --hard\nEOF", 'deny'],
  ['echo "<<EOF"\ngit push --force', 'deny'],
  // not git
  ['echo "git push --force"', 'allow'],
  ['grep -r "reset --hard" docs/', 'allow'],
  ['npm test', 'allow'],
  ['constructor --force && toString -f', 'allow'],
];
for (const [cmd, want] of bash) test(`bash: ${JSON.stringify(cmd)} -> ${want}`, () => assert.equal(decide(cmd), want));

const pwsh = [
  ['git push --force; Write-Host done', 'deny'],
  [`git push origin main ${BT}\n  --force`, 'deny'],
  [`& "C:${BS}Program Files${BS}Git${BS}cmd${BS}git.exe" reset --hard`, 'deny'],
  ['pwsh -c "git push --force"', 'deny'],
  ['powershell -NoProfile -Command "git reset --hard"', 'deny'],
  [`pwsh -EncodedCommand ${psEncoded}`, 'deny'],
  ['iex "git push -f"', 'deny'],
  ['Write-Host "$(git reset --hard)"', 'deny'],
  [`Write-Host "git push ${BT}"--force${BT}""`, 'allow'],
  ["$m = @'\ngit push --force\n'@\ngit commit -m $m", 'allow'],
];
for (const [cmd, want] of pwsh) test(`pwsh: ${JSON.stringify(cmd)} -> ${want}`, () => assert.equal(decide(cmd, 'PowerShell'), want));

test('fails closed on unreadable input', () => assert.equal(decide({ raw: 'not json' }), 'deny'));

// ---------- other CLIs ----------

function run(payload, ...flags) {
  const r = spawnSync('node', [HOOK, ...flags], { input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

test('--no-ask (Kimi, Codex): a push is refused instead of asked, with the reason why', () => {
  const out = run({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } }, '--no-ask');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /cannot pause to ask/);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'git status' } }, '--no-ask'), null);
});
test('--any-shell (Codex on Windows): a PowerShell-only form is caught although the tool says Bash', () => {
  const cmd = `git push origin main ${BT}\n  --force`;
  assert.equal(decide(cmd, 'Bash'), 'ask');
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: cmd } }, '--any-shell').permissionDecision, process.platform === 'win32' ? 'deny' : 'ask');
});
test('Cursor through its Claude import (tool Shell) reads both shells on Windows', () => {
  assert.equal(run({ hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: { command: 'git reset --hard', cwd: '.' } }).permissionDecision, 'deny');
  assert.equal(run({ hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: { command: 'git log -1' } }), null);
});
test('a command given as an argv array is rejoined and still unwrapped', () => {
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: ['bash', '-lc', 'git reset --hard'] } }).permissionDecision, 'deny');
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: ['git', 'status'] } }), null);
});
test('a top-level command field (Cursor beforeShellExecution shape) is read too', () => {
  assert.equal(run({ command: 'git clean -fdx', cwd: '.' }).permissionDecision, 'deny');
});
