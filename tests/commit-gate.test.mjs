import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDiff, scan, floorOk } from '../skills/install-commit-gate/commit-gate.mjs';

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'install-commit-gate', 'commit-gate.mjs');
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function write(dir, files) {
  for (const [f, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), body);
  }
}
// A repo with a first commit, then the gate installed as its commit-msg hook.
function repo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-gate-'));
  made.push(dir);
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false']]) g('config', k, v);
  write(dir, { 'src/app.js': 'export const a = 1;\n', 'src/app.test.js': "test('adds', () => {\n  expect(1).toBe(1);\n});\n", ...files });
  g('add', '-A'); g('commit', '-qm', 'init');
  const hook = g('rev-parse', '--git-path', 'hooks/commit-msg').trim();
  fs.writeFileSync(path.resolve(dir, hook), `#!/bin/sh\nnode "${GATE.replace(/\\/g, '/')}" "$1"\n`, { mode: 0o755 });
  return { dir, g };
}
function commit(dir, ...args) {
  const r = spawnSync('git', ['commit', ...args], { cwd: dir, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stderr + r.stdout };
}

test('clean change commits', () => {
  const { dir, g } = repo();
  write(dir, { 'src/app.js': 'export const a = 2;\n' }); g('add', '-A');
  assert.ok(commit(dir, '-m', 'change').ok);
});
test('new eslint-disable is blocked; [floor-ok: reason] lets it through; a blank reason does not', () => {
  const { dir, g } = repo();
  write(dir, { 'src/app.js': '// eslint-disable-next-line\nexport const a = 2;\n' }); g('add', '-A');
  const r = commit(dir, '-m', 'x');
  assert.ok(!r.ok); assert.match(r.out, /silenced checker/);
  assert.ok(!commit(dir, '-m', 'x [floor-ok: ]').ok);
  assert.ok(commit(dir, '-m', 'shim [floor-ok: generated file]').ok);
});
test('[DEBUG-..] tag is blocked even with [floor-ok]', () => {
  const { dir, g } = repo();
  write(dir, { 'src/app.js': "console.log('[DEBUG-a4f2] x');\n" }); g('add', '-A');
  assert.ok(!commit(dir, '-m', 'x [floor-ok: no]').ok);
});
test('conflict markers are blocked', () => {
  const { dir, g } = repo();
  write(dir, { 'README.md': '<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n' }); g('add', '-A');
  assert.match(commit(dir, '-m', 'x').out, /conflict marker/);
});
test('a file with a space in its name is scanned', () => {
  const { dir, g } = repo();
  write(dir, { 'src/my file.js': '// @ts-ignore\nexport const b = 1;\n' }); g('add', '-A');
  assert.match(commit(dir, '-m', 'x').out, /src\/my file\.js/);
});
test('moving an existing suppression to another file is not new', () => {
  const { dir, g } = repo({ 'src/old.js': '// eslint-disable-next-line\nexport const legacy = 1;\n' });
  fs.rmSync(path.join(dir, 'src/old.js'));
  write(dir, { 'src/new.js': '// eslint-disable-next-line\nexport const legacy = 1;\n' }); g('add', '-A');
  assert.ok(commit(dir, '-m', 'move').ok);
});
test("renaming a 'should' test title is not an assertion loss; editing one assertion is fine; removing one is not", () => {
  const { dir, g } = repo({ 'src/b.test.js': "it('should add', () => {\n  expect(1).toBe(1);\n  expect(2).toBe(2);\n});\n" });
  write(dir, { 'src/b.test.js': "it('adds', () => {\n  expect(1).toBe(1);\n  expect(2).toBe(3);\n});\n" }); g('add', '-A');
  assert.ok(commit(dir, '-m', 'rename').ok);
  write(dir, { 'src/b.test.js': "it('adds', () => {\n  expect(1).toBe(1);\n});\n" }); g('add', '-A');
  assert.match(commit(dir, '-m', 'drop').out, /assertions removed/);
});
test('deleting a test file is blocked', () => {
  const { dir, g } = repo();
  g('rm', '-q', 'src/app.test.js');
  assert.match(commit(dir, '-m', 'x').out, /test file deleted/);
});
test('`git commit -- <path>` is checked on the working-tree content git commits', () => {
  const { dir } = repo();
  write(dir, { 'src/app.js': '// @ts-nocheck\nexport const a = 3;\n' });
  assert.ok(!commit(dir, '-m', 'x', '--', 'src/app.js').ok);
});
test('merge commit skips the floor for incoming lines, but still blocks conflict markers', () => {
  const { dir, g } = repo();
  g('checkout', '-q', '-b', 'feature');
  write(dir, { 'src/feature.js': '// eslint-disable-next-line\nexport const f = 1;\n', 'README.md': 'feature\n' });
  g('add', '-A'); g('commit', '-q', '--no-verify', '-m', 'feature');
  g('checkout', '-q', 'main');
  write(dir, { 'src/app.js': 'export const a = 9;\n' }); g('add', '-A'); g('commit', '-q', '--no-verify', '-m', 'main');
  spawnSync('git', ['merge', '--no-ff', '--no-commit', 'feature'], { cwd: dir });
  assert.ok(commit(dir, '-m', 'merge feature').ok);

  const r2 = repo({ 'README.md': 'base\n' });
  r2.g('checkout', '-q', '-b', 'other'); write(r2.dir, { 'README.md': 'other\n' }); r2.g('commit', '-qam', 'other');
  r2.g('checkout', '-q', 'main'); write(r2.dir, { 'README.md': 'mine\n' }); r2.g('commit', '-qam', 'mine');
  spawnSync('git', ['merge', 'other'], { cwd: r2.dir }); // conflicts
  r2.g('add', 'README.md'); // staged with markers still in it
  assert.match(commit(r2.dir, '-m', 'merge').out, /conflict marker/);
});
test('.floorignore skips a path, even with diff.mnemonicPrefix set', () => {
  const { dir, g } = repo({ '.floorignore': 'vendor/\n' });
  g('config', 'diff.mnemonicPrefix', 'true');
  write(dir, { 'vendor/lib.js': '/* eslint-disable */\nexport {};\n' }); g('add', '-A');
  assert.ok(commit(dir, '-m', 'vendor').ok);
});
test('the gate skips its own file when committed into the repo', () => {
  const { dir, g } = repo();
  write(dir, { '.githooks/commit-gate.mjs': fs.readFileSync(GATE, 'utf8') }); g('add', '-A');
  // The hook runs the plugin copy, so point it at the repo copy the way /install-commit-gate does.
  fs.writeFileSync(path.resolve(dir, g('rev-parse', '--git-path', 'hooks/commit-msg').trim()), '#!/bin/sh\nnode .githooks/commit-gate.mjs "$1"\n', { mode: 0o755 });
  assert.ok(commit(dir, '-m', 'add gate').ok);
});
test('--self-test passes', () => {
  const r = spawnSync('node', [GATE, '--self-test'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test('content lines starting with "+++ " or "--- " are not taken as file headers', () => {
  const diff = ['diff --git a/src/x.js b/src/x.js', '--- a/src/x.js', '+++ b/src/x.js', '@@ -1 +1,2 @@', '--- old comment', '+++ counter', '+// @ts-ignore'].join('\n');
  const { floor } = scan(parseDiff(diff));
  assert.match(floor[0], /src\/x\.js:2/);
  assert.ok(floorOk('a [floor-ok: yes]') && !floorOk('[floor-ok:]'));
});
