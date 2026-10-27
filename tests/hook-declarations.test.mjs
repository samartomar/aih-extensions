import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readHookIntent } from '../scripts/hook-declarations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('a real source declaration displays declared command intent without claiming installation', () => {
  const result = readHookIntent({ root, id: 'git-guard.claude', tool: 'claude' });
  assert.equal(result.status, 'declared-not-installed');
  assert.deepEqual(result.intent.invocation, ['node', '{itemDir}/hooks/git-guard.mjs']);
  assert.equal(result.intent.event, 'PreToolUse');
  assert.equal(result.intent.matcher, 'Bash|PowerShell');
  assert.equal(result.binding.status, 'unavailable');
  assert.equal(result.installed, false);
});

const declaration = () => JSON.parse(fs.readFileSync(path.join(root, 'hook-declarations/v1.json'), 'utf8'));

function fixture(t, mutate = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-declarations-'));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const data = declaration();
  for (const hook of data.hooks) for (const material of hook.materials) {
    const target = path.join(dir, material.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, material.path), target);
  }
  mutate(data, dir);
  fs.mkdirSync(path.join(dir, 'hook-declarations'));
  fs.writeFileSync(path.join(dir, 'hook-declarations/v1.json'), JSON.stringify(data));
  return { root: dir, id: 'git-guard.claude' };
}

test('all authored entrypoints and materially different adapters have readable exact material', () => {
  const data = declaration();
  assert.deepEqual(data.hooks.map((hook) => hook.id).sort(), [
    'commit-gate.git', 'git-guard.claude', 'git-guard.codex', 'git-guard.kimi',
    'git-guard.opencode', 'lanes-card.claude', 'lanes-card.codex', 'lanes-card.opencode', 'skill-guard.claude',
  ]);
  for (const hook of data.hooks) assert.equal(readHookIntent({ root, id: hook.id }).status, 'declared-not-installed', hook.id);
  const pluginHooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8')).hooks;
  for (const hook of data.hooks.filter((hook) => hook.source.protocol === 'claude-command-hook')) {
    const original = pluginHooks[hook.source.event].find((group) => group.matcher === hook.source.matcher).hooks[0];
    assert.equal(original.command, `node "\${CLAUDE_PLUGIN_ROOT}/${hook.script}"`);
    assert.equal(hook.timeoutSeconds, original.timeout);
  }
  assert.deepEqual(readHookIntent({ root, id: 'git-guard.codex' }).intent.invocation,
    ['node', '{itemDir}/hooks/git-guard.mjs', '--no-ask', '--any-shell']);
  assert.deepEqual(readHookIntent({ root, id: 'git-guard.kimi' }).intent.invocation,
    ['node', '{itemDir}/hooks/git-guard.mjs', '--no-ask']);
  assert.equal(readHookIntent({ root, id: 'git-guard.opencode' }).intent.invocation.export, 'createPlugin');
  assert.equal(readHookIntent({ root, id: 'git-guard.opencode' }).intent.timeoutSeconds, null);
  assert.deepEqual(readHookIntent({ root, id: 'commit-gate.git' }).intent.invocation[2],
    { kind: 'event-argument', position: 1, name: 'commitMessageFile' });
});

test('a data-only copy works without setup internals and never imports the declared script', (t) => {
  const options = fixture(t, (data, dir) => {
    const hook = data.hooks[0];
    const bytes = 'throw new Error("HOOK MUST NOT EXECUTE");\n';
    fs.writeFileSync(path.join(dir, hook.script), bytes);
    hook.materials[0].sha256 = createHash('sha256').update(bytes).digest('hex');
  });
  assert.equal(fs.existsSync(path.join(options.root, 'scripts/setup.mjs')), false);
  assert.equal(readHookIntent(options).status, 'declared-not-installed');
});

test('missing or changed script/dependency bytes are refused', (t) => {
  for (const relative of ['hooks/git-guard.mjs', 'hooks/lib/git-policy.mjs']) {
    const absent = fixture(t, (_data, dir) => fs.unlinkSync(path.join(dir, relative)));
    assert.equal(readHookIntent(absent).code, 'material-unavailable');
    const changed = fixture(t, (_data, dir) => fs.appendFileSync(path.join(dir, relative), '// changed\n'));
    assert.equal(readHookIntent(changed).code, 'material-mismatch');
  }
});

test('missing runtime/interpreter, unknown protocol and unsupported placeholders are refused', (t) => {
  const cases = [
    [(hook) => { delete hook.runtime; }, 'runtime-required'],
    [(hook) => { delete hook.runtime.executable; }, 'runtime-required'],
    [(hook) => { delete hook.runtime.versionRange; }, 'runtime-required'],
    [(hook) => { hook.source.protocol = 'future-hook'; }, 'unknown-protocol'],
    [(hook) => { hook.source.protocol = 'toString'; }, 'unknown-protocol'],
    [(hook) => { hook.source.event = 'Unknown'; }, 'unknown-event'],
    [(hook) => { hook.invocation.arguments.push('{workspaceFolder}'); }, 'unknown-placeholder'],
    [(hook) => { hook.installation.materialRoot = '${CLAUDE_PLUGIN_ROOT}'; }, 'unknown-placeholder'],
    [(hook) => { hook.installation.reference = '{unknown}/config'; }, 'unknown-placeholder'],
    [(hook) => { hook.invocation.arguments.push('{itemDir'); }, 'unknown-placeholder'],
    [(hook) => { delete hook.timeoutSeconds; }, 'invalid-timeout'],
    [(hook) => { hook.materials = []; }, 'script-material-required'],
    [(hook) => { hook.materials[0].path = '../outside'; }, 'script-material-required'],
  ];
  for (const [mutate, code] of cases) {
    const result = readHookIntent(fixture(t, (data) => mutate(data.hooks[0])));
    assert.equal(result.status, 'refused', code);
    assert.equal(result.code, code);
    assert.equal(result.installed, false);
  }
});

test('only the four public projection placeholders are accepted', (t) => {
  const options = fixture(t, (data) => {
    data.hooks[0].invocation.arguments = ['{projectDir}', '{homeDir}', '{itemDir}', '{pluginRoot}'];
  });
  assert.equal(readHookIntent(options).status, 'declared-not-installed');
});

test('an unavailable observed binding never becomes a supported installation', () => {
  const result = readHookIntent({ root, id: 'git-guard.claude', tool: 'unsupported-client' });
  assert.equal(result.status, 'declared-not-installed');
  assert.deepEqual(result.binding, { status: 'unavailable', tool: 'unsupported-client', reason: 'observed-binding-not-provided' });
  assert.equal(result.installed, false);
  assert.match(result.intent.label, /Declared source intent/);
  assert.equal(Object.hasOwn(result, 'command'), false);
});

test('the command-line consumer labels intent and exits unsuccessfully for an absent declaration', () => {
  const script = path.join(root, 'scripts/hook-declarations.mjs');
  const good = spawnSync(process.execPath, [script, 'git-guard.claude', 'unsupported-client'], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).status, 'declared-not-installed');
  const missing = spawnSync(process.execPath, [script, 'absent'], { encoding: 'utf8' });
  assert.equal(missing.status, 1, missing.stderr);
  assert.equal(JSON.parse(missing.stdout).status, 'refused');
});
