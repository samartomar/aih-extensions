import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { conflicts, stripGateLine, selectTools, TEMP_PREFIXES } from '../scripts/setup.mjs';
import {
  toolDirs, planFor, hookEntries, addHooks, removeHooks, addOverrides, removeOverrides, tidy, isUserOnly,
  opencodeAgent, codexAgent, kimiBlock, addTomlBlock, removeTomlBlock, addSkillDenies, removeSkillDenies, opencodePluginFile,
} from '../scripts/tools.mjs';

const HOOKS = path.join('C:', 'Users', 'me', '.aih-extensions', 'hooks');
const MARKER = HOOKS.split(path.sep).join('/');
const hindsight = { hooks: [{ type: 'command', command: 'node "C:\\hindsight\\claude-hook.js"', timeout: 30 }] };
const base = () => ({ hooks: { SessionStart: [structuredClone(hindsight)], Stop: [structuredClone(hindsight)] }, autoMemoryEnabled: false });

test('addHooks appends our groups, keeps existing ones, and is idempotent', () => {
  const once = addHooks(base(), hookEntries('claude', HOOKS));
  assert.equal(once.hooks.SessionStart.length, 2);
  assert.deepEqual(once.hooks.SessionStart[0], hindsight);
  assert.equal(once.hooks.PreToolUse.length, 2);
  assert.match(once.hooks.PreToolUse[0].hooks[0].command, /^node ".*\/\.aih-extensions\/hooks\/git-guard\.mjs"$/);
  assert.deepEqual(addHooks(once, hookEntries('claude', HOOKS)), once);
});
test('removeHooks removes only ours and drops events left empty', () => {
  for (const tool of ['claude', 'codex']) {
    const { next, removed } = removeHooks(addHooks(base(), hookEntries(tool, HOOKS)), MARKER);
    assert.equal(removed, hookEntries(tool, HOOKS).length);
    assert.deepEqual(next, base());
  }
});
test('removeHooks keeps a group that also holds someone else\'s hook', () => {
  const s = addHooks(base(), hookEntries('claude', HOOKS));
  s.hooks.PreToolUse[0].hooks.push({ type: 'command', command: 'node other.js' });
  const { next } = removeHooks(s, MARKER);
  assert.deepEqual(next.hooks.PreToolUse, [{ matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'node other.js' }] }]);
});
test('codex hooks refuse instead of asking and read the command as either shell', () => {
  const [guard, card] = hookEntries('codex', HOOKS);
  assert.equal(guard.matcher, '^Bash$');
  assert.match(guard.command, /git-guard\.mjs" --no-ask --any-shell$/);
  assert.equal(card.event, 'SessionStart');
  assert.deepEqual(hookEntries('kimi', HOOKS), []);
});
test('overrides: add only missing keys; remove only keys still "off"; tidy empty containers', () => {
  const { next, added } = addOverrides({ skillOverrides: { simplify: 'name-only' } }, ['code-review', 'simplify']);
  assert.deepEqual(added, ['code-review']);
  assert.equal(next.skillOverrides.simplify, 'name-only');
  const r = removeOverrides({ skillOverrides: { 'code-review': 'off' }, enabledPlugins: {}, extraKnownMarketplaces: {} }, ['code-review']);
  assert.deepEqual(r.removed, ['code-review']);
  assert.deepEqual(r.next, {});
  assert.deepEqual(tidy({ enabledPlugins: { 'x@y': true } }), { enabledPlugins: { 'x@y': true } });
});
test('conflicts: an existing destination blocks install unless a previous install owns it', () => {
  const plan = [{ dest: '/c/skills/tdd' }, { dest: '/c/skills/grilling' }, { dest: '/c/skills/new' }];
  const exists = (p) => !p.endsWith('new');
  assert.deepEqual(conflicts(plan, exists, []), ['/c/skills/tdd', '/c/skills/grilling']);
  assert.deepEqual(conflicts(plan, exists, ['/c/skills/tdd', '/c/skills/grilling']), []);
});
test('remove-gate strips only the gate line', () => {
  const r = stripGateLine('npx commitlint --edit "$1"\nnode .githooks/commit-gate.mjs "$1"\n');
  assert.ok(r.changed && !r.empty);
  assert.equal(r.text, 'npx commitlint --edit "$1"\n');
  const own = stripGateLine('#!/bin/sh\nnode .githooks/commit-gate.mjs "$1"\n');
  assert.ok(own.changed && own.empty);
  assert.ok(!stripGateLine('npm test\n').changed);
});

// ---------- which tool gets what ----------

const dirs = toolDirs('/h', {});
const sources = {
  skills: [{ name: 'tdd', src: '/m/tdd' }, { name: 'ask-sam', src: '/a/ask-sam' }],
  references: [{ name: 'security-checklist.md', src: '/a/references/security-checklist.md' }],
  agents: [{ name: 'code-reviewer', src: '/a/agents/code-reviewer.md', text: '---\nname: code-reviewer\ndescription: "Reviews: a change"\n---\n\n# Reviewer\n' }],
  commands: [{ name: 'ship', src: '/a/commands/ship.md' }],
};
const skillHomes = (ops) => [...new Set(ops.filter((o) => /[\\/]skills[\\/]/.test(o.dest)).map((o) => path.dirname(o.dest)))];

test('every tool sees each skill exactly once, and nobody writes ~/.agents/skills', () => {
  const all = planFor(['claude', 'codex', 'cursor', 'kimi', 'opencode'], dirs, sources);
  assert.deepEqual(skillHomes(all).sort(), [path.join('/h', '.claude', 'skills'), path.join('/h', '.codex', 'skills'), path.join('/h', '.kimi-code', 'skills')].sort());
  assert.ok(!all.some((o) => o.dest.includes(`${path.sep}.agents${path.sep}`)));
  assert.deepEqual(all.filter((o) => o.tool === 'cursor'), []);
  // opencode reads ~/.claude/skills, so it gets its own copy only without claude
  assert.deepEqual(skillHomes(planFor(['opencode'], dirs, sources)), [path.join('/h', '.config', 'opencode', 'skills')]);
});
test('references sit next to each skills folder, where ../../references resolves', () => {
  const ops = planFor(['claude', 'kimi'], dirs, sources);
  for (const root of [path.join('/h', '.claude'), path.join('/h', '.kimi-code')]) {
    assert.ok(ops.some((o) => o.dest === path.join(root, 'references', 'security-checklist.md')));
  }
});
test('agents are converted per tool: TOML for codex, subagent mode for opencode, copied for claude and kimi', () => {
  const ops = planFor(['claude', 'codex', 'kimi', 'opencode'], dirs, sources, { opencodeCommandDir: 'command' });
  const agent = (tool) => ops.find((o) => o.tool === tool && o.dest.includes('code-reviewer'));
  assert.equal(agent('claude').src, sources.agents[0].src);
  assert.equal(agent('kimi').src, sources.agents[0].src);
  assert.match(agent('codex').dest, /code-reviewer\.toml$/);
  assert.equal(agent('codex').content, 'name = "code-reviewer"\ndescription = "Reviews: a change"\ndeveloper_instructions = "# Reviewer\\n"\n');
  assert.equal(agent('opencode').content, '---\ndescription: "Reviews: a change"\nmode: subagent\n---\n\n# Reviewer\n');
  assert.ok(ops.some((o) => o.tool === 'opencode' && o.dest === path.join('/h', '.config', 'opencode', 'command', 'ship.md')));
  assert.ok(!ops.some((o) => (o.tool === 'codex' || o.tool === 'kimi') && o.dest.includes('ship')));
});
test('agent conversion keeps quotes and colons intact', () => {
  assert.equal(codexAgent('---\nname: x\ndescription: It\'s "fine": ok\n---\nBody "q" \\ end\n'),
    'name = "x"\ndescription = "It\'s \\"fine\\": ok"\ndeveloper_instructions = "Body \\"q\\" \\\\ end\\n"\n');
  assert.match(opencodeAgent("---\nname: y\ndescription: 'single ''quoted'''\n---\nB\n"), /^---\ndescription: "single 'quoted'"\nmode: subagent\n---\nB\n$/);
});
test('typed-only skills are read from frontmatter', () => {
  assert.ok(isUserOnly('---\nname: a\ndisable-model-invocation: true\n---\n'));
  assert.ok(!isUserOnly('---\nname: a\ndescription: x\n---\n'));
});
test('selectTools: cursor needs claude, unknown names fail, order is fixed', () => {
  assert.deepEqual(selectTools(['opencode', 'claude'], []), ['claude', 'opencode']);
  assert.deepEqual(selectTools(undefined, ['kimi', 'claude']), ['claude', 'kimi']);
  assert.throws(() => selectTools(['cursor'], []), /needs claude/);
  assert.throws(() => selectTools(['vim'], []), /unknown tool/);
});

// ---------- config edits for kimi and opencode ----------

const KIMI = 'default_model = "kimi-code/k3"\n\n[thinking]\nenabled = true\n';
test('kimi: the [[hooks]] block is added once and removed byte for byte', () => {
  const block = kimiBlock(HOOKS);
  assert.match(block, /^\[\[hooks\]\]\nevent = "PreToolUse"\nmatcher = "\^Bash\$"\ncommand = 'node ".*git-guard\.mjs" --no-ask'\ntimeout = 10$/);
  const once = addTomlBlock(KIMI, block);
  assert.equal(addTomlBlock(once, block), once);
  const { text, removed } = removeTomlBlock(once);
  assert.ok(removed);
  assert.equal(text, KIMI);
  assert.ok(!removeTomlBlock(KIMI).removed);
});
test('opencode: typed-only skills are denied to the model, and only our entries come back out', () => {
  const cfg = { plugin: ['x'], permission: { bash: 'ask', skill: { 'grill-me': 'allow' } } };
  const { next, added } = addSkillDenies(cfg, ['grill-me', 'ask-sam', 'to-spec']);
  assert.deepEqual(added, ['ask-sam', 'to-spec']);
  assert.deepEqual(next.permission.skill, { 'grill-me': 'allow', 'ask-sam': 'deny', 'to-spec': 'deny' });
  assert.deepEqual(removeSkillDenies(next, added).next, cfg);
  assert.deepEqual(removeSkillDenies(addSkillDenies({ plugin: ['x'] }, ['a']).next, ['a']).next, { plugin: ['x'] });
  assert.equal(addSkillDenies({ permission: 'allow' }, ['a']).skipped, 'permission is not an object');
});
test('opencode: the plugin file exports only a function and imports the shared guard by file URL', () => {
  const text = opencodePluginFile(HOOKS);
  assert.match(text, /^\/\/ aih-extensions:/);
  assert.match(text, /import \{ createPlugin \} from "file:\/\/\/.*\/\.aih-extensions\/hooks\/opencode-plugin\.mjs";/);
  assert.deepEqual([...text.matchAll(/^export (\w+) (\w+)/gm)].map((m) => m.slice(1)), [['const', 'AihExtensions']]);
});
test('clean only matches our own temp dirs, never AI Harness\'s aih-* ones', () => {
  for (const p of TEMP_PREFIXES) assert.match(p, /^aihx-/);
  const theirs = ['aih-cli-clean-root-fNgw', 'aih-license-abc123', 'aih-gate-x'];
  assert.deepEqual(theirs.filter((n) => TEMP_PREFIXES.some((p) => n.startsWith(p))), []);
});
