import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compare, check, units, code, anchors } from '../skills/line-edit/line-check.mjs';

const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'line-edit', 'line-check.mjs');
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function folder(files = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-linecheck-')));
  made.push(dir);
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}
function repo(files) {
  const dir = folder(files);
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false']]) g('config', k, v);
  g('add', '-A'); g('commit', '-qm', 'init');
  return dir;
}
const run = (cwd, ...args) => spawnSync(process.execPath, [CHECK, ...args], { cwd, encoding: 'utf8' });

const DOC = `---
name: warmer
---

# Cache warmer

The warmer requests the 500 most visited pages after each deploy. It runs after
production deploys and not after staging deploys.

## Setup

1. Set \`WARMER_TOKEN\` before the first run.
2. Read the [migration notes](notes.md#migrations) first.

\`\`\`sh
warmer run --limit 500
\`\`\`
`;

test('an unchanged document reports nothing and exits 0', () => {
  const result = compare(DOC, DOC);
  assert.deepEqual([result.changed, result.added, result.linksRemoved, result.codeRemoved, result.headingsRemoved], [[], [], [], [], []]);
  assert.equal(result.frontmatterChanged, false);
  const dir = folder({ 'before.md': DOC, 'after.md': DOC, 'notes.md': '## Migrations\n' });
  const r = run(dir, 'before.md', 'after.md');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Words: \d+ -> \d+/);
});

test('rewrapping, list markers, emphasis and CRLF are not changes', () => {
  const before = 'The token expires every 90 days and the\nplatform team issues a new one.\n\n- Set the token first.\n';
  const afterText = 'The token expires every 90 days and the platform team\r\nissues a **new** one.\r\n\r\n1. Set the token first.\r\n';
  const result = compare(before, afterText);
  assert.deepEqual([result.changed, result.added], [[], []]);
});

test('a reworded sentence is listed with its nearest match, and a cut one with none', () => {
  const afterText = DOC
    .replace('The warmer requests the 500 most visited pages after each deploy.', 'After each deploy the warmer requests the 500 most visited pages.')
    .replace(' It runs after\nproduction deploys and not after staging deploys.', '');
  const result = compare(DOC, afterText);
  assert.equal(result.changed.length, 2);
  const [reworded, cut] = result.changed;
  assert.match(reworded.text, /^The warmer requests/);
  assert.match(reworded.nearest.text, /^After each deploy the warmer/);
  assert.equal(reworded.line, 7, 'the line counts the frontmatter');
  assert.match(cut.text, /staging deploys/);
  assert.equal(cut.nearest, null);
  assert.deepEqual(result.added, [], 'a reworded sentence is not also an addition');
});

test('a new sentence is listed as an addition', () => {
  const result = compare(DOC, DOC.replace('## Setup', 'Rollbacks never trigger a warming run.\n\n## Setup'));
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.added.map((item) => item.text), ['Rollbacks never trigger a warming run.']);
});

test('a removed link, changed code and changed frontmatter are reported; code indentation is not', () => {
  const indented = DOC.replace('```sh\nwarmer run --limit 500\n```', '   ```sh\n   warmer run --limit 500\n   ```');
  assert.deepEqual(compare(DOC, indented).codeRemoved, []);
  const afterText = DOC
    .replace('[migration notes](notes.md#migrations)', 'migration notes')
    .replace('--limit 500', '--limit 2000')
    .replace('`WARMER_TOKEN`', '`WARMER_KEY`')
    .replace('name: warmer', 'name: cache-warmer');
  const result = compare(DOC, afterText);
  assert.deepEqual(result.linksRemoved, ['notes.md#migrations']);
  assert.deepEqual(result.codeRemoved, ['WARMER_TOKEN', 'warmer run --limit 500']);
  assert.equal(result.frontmatterChanged, true);
});

test('units split paragraphs into sentences and keep list items and table rows apart', () => {
  const body = 'One two three. Four five six!\n\n- seven eight nine\n- ten eleven twelve\n\n| a b c | d |\n|---|---|\n| e f g | h |\n';
  assert.deepEqual(units(body).map((unit) => unit.text), ['One two three.', 'Four five six!', 'seven eight nine', 'ten eleven twelve', 'a b c d', 'e f g h']);
  assert.deepEqual(code('Use `a b` here.\n\n```\n  x\n```\n'), ['a b', 'x']);
  assert.deepEqual(anchors('# One `two`\n## One two\n```\n# not a heading\n```\n'), ['one-two', 'one-two-1']);
});

test('a link or anchor that does not resolve exits 1', () => {
  const dir = folder({ 'before.md': DOC, 'notes.md': '## Migrations\n' });
  fs.writeFileSync(path.join(dir, 'after.md'), DOC.replace('notes.md#migrations', 'notes.md#rollbacks').replace('## Setup', '## Setup\n\nSee [the guide](guide.md) and [setup](#setup) and [the site](https://example.com/x).'));
  const r = run(dir, 'before.md', 'after.md', '--json');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const result = JSON.parse(r.stdout);
  assert.deepEqual(result.broken.map((item) => [item.target, item.reason]), [['guide.md', 'file not found'], ['notes.md#rollbacks', 'anchor not found']]);
});

test('another file linking to a removed heading exits 1', () => {
  const dir = repo({ 'docs/warmer.md': DOC, 'notes.md': '## Migrations\n', 'README.md': 'See [setup](docs/warmer.md#setup) and [the top](docs/warmer.md#cache-warmer).\n' });
  const afterPath = path.join(dir, 'docs', 'warmer.md');
  fs.writeFileSync(afterPath, DOC.replace('## Setup', '## Before the first run').replace('notes.md', '../notes.md'));
  const result = check(DOC, fs.readFileSync(afterPath, 'utf8'), afterPath);
  assert.deepEqual(result.headingsRemoved, ['setup']);
  assert.equal(result.inboundChecked, true);
  assert.deepEqual(result.inbound, [{ file: 'README.md', line: 1, target: 'docs/warmer.md#setup' }]);
  const r = run(dir, '--git', path.join('docs', 'warmer.md'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /README\.md:1: docs\/warmer\.md#setup/);
});

test('--git compares the file with the last commit', () => {
  const dir = repo({ 'warmer.md': DOC, 'notes.md': '## Migrations\n' });
  fs.writeFileSync(path.join(dir, 'warmer.md'), DOC.replace('Set `WARMER_TOKEN` before the first run.', 'Set `WARMER_TOKEN` before you run it.'));
  const r = run(dir, '--git', 'warmer.md', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.changed.length, 1);
  assert.match(result.changed[0].nearest.text, /before you run it/);
});

test('outside a Git repository the inbound search is reported as not checked', () => {
  const dir = folder({ 'before.md': '# A\n\n## Old name\n\nOne two three.\n', 'after.md': '# A\n\n## New name\n\nOne two three.\n' });
  const result = check(fs.readFileSync(path.join(dir, 'before.md'), 'utf8'), fs.readFileSync(path.join(dir, 'after.md'), 'utf8'), path.join(dir, 'after.md'));
  assert.deepEqual(result.headingsRemoved, ['old-name']);
  if (!result.inboundChecked) assert.match(run(dir, 'before.md', 'after.md').stdout, /not checked \(not a Git repository\)/);
});

test('bad usage and an unreadable file exit 2', () => {
  const dir = folder({ 'a.md': 'One two three.\n' });
  assert.equal(run(dir).status, 2);
  assert.equal(run(dir, 'a.md').status, 2);
  assert.equal(run(dir, 'a.md', 'missing.md').status, 2);
  assert.equal(run(dir, '--git', 'a.md').status, 2, 'not a Git repository, so there is no last commit');
});
