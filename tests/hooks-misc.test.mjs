import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'hooks');
const run = (hook, payload) => {
  const r = spawnSync('node', [path.join(HOOKS, hook)], { input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const skill = (name, extra = {}) => run('skill-guard.mjs', { tool_name: 'Skill', tool_input: { skill: name }, ...extra })?.permissionDecision ?? 'allow';

test('skill-guard: code-review and grilling refuse inside a sub-agent', () => {
  assert.equal(skill('mattpocock-skills:code-review', { agent_id: 'a1' }), 'deny');
  assert.equal(skill('grilling', { agent_id: 'a1' }), 'deny');
});
test('skill-guard: everything passes in the main session, and research passes in sub-agents (/wayfinder needs it)', () => {
  assert.equal(skill('mattpocock-skills:code-review'), 'allow');
  assert.equal(skill('mattpocock-skills:research', { agent_id: 'a1' }), 'allow');
  assert.equal(skill('aih-extensions:security-and-hardening', { agent_id: 'a1' }), 'allow');
});
test('lanes-card: emits the routing note without repo policy', () => {
  const out = run('lanes-card.mjs', { hook_event_name: 'SessionStart', source: 'startup' });
  assert.equal(out.hookEventName, 'SessionStart');
  assert.match(out.additionalContext, /ask-matt/);
  assert.doesNotMatch(out.additionalContext, /never SPEC\.md/);
});

test('opencode plugin: same policy, refuses a push it cannot ask about, ignores other tools', async () => {
  const { verdictFor, createPlugin } = await import('../hooks/opencode-plugin.mjs');
  assert.match(verdictFor('bash', { command: 'git reset --hard' }), /^aih-extensions git-guard: .*throws away uncommitted work/);
  assert.match(verdictFor('bash', { command: 'git push origin main' }), /opencode cannot pause to ask/);
  assert.equal(verdictFor('bash', { command: 'git status' }), null);
  assert.equal(verdictFor('edit', { command: 'git reset --hard' }), null);
  const hooks = await createPlugin()({});
  await assert.rejects(hooks['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git branch -D x' } }), /force-deletes/);
  await hooks['tool.execute.before']({ tool: 'bash' }, { args: { command: 'npm test' } });
  const out = { system: ['base'] };
  await hooks['experimental.chat.system.transform']({}, out);
  await hooks['experimental.chat.system.transform']({}, out);
  assert.equal(out.system.length, 2);
  assert.match(out.system[1], /ask-matt/);
});
