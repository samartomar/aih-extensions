import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { movePins } from '../scripts/move-pins.mjs';
import { checkDeclarations } from '../scripts/source-declarations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['scripts/upstream.config.mjs', 'source-declarations/v1.json'];

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-move-pins-'));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  return dir;
}

const pinned = (name) => JSON.parse(fs.readFileSync(path.join(root, 'source-declarations/v1.json'), 'utf8'))
  .provenance.upstreams.find((u) => u.key === name).sha;

test('a pin move keeps the source declarations current, changing only the sha text', async (t) => {
  const dir = fixture(t);
  const before = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  const moves = ['matt', 'addy'].map((name, i) => ({ name, pinned: pinned(name), latest: String(i + 1).repeat(40) }));
  movePins({ root: dir, moves });
  assert.deepEqual(await checkDeclarations({ root: dir }), { status: 'current', drift: [] });
  for (const file of files) {
    let expected = before[file];
    for (const u of moves) expected = expected.replace(u.pinned, u.latest);
    assert.equal(fs.readFileSync(path.join(dir, file), 'utf8'), expected, file);
  }
});

test('a pin that is not written once in either file moves nothing', (t) => {
  const dir = fixture(t);
  const declarations = path.join(dir, 'source-declarations/v1.json');
  const sha = pinned('matt');
  fs.writeFileSync(declarations, fs.readFileSync(declarations, 'utf8').replace(`"sha": "${sha}"`, `"sha":"${sha}"`));
  const before = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  assert.throws(() => movePins({ root: dir, moves: [{ name: 'matt', pinned: sha, latest: '1'.repeat(40) }] }), /not written once/);
  assert.deepEqual(files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')), before);
});

test('check-upstream --apply moves pins only through movePins', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/check-upstream.mjs'), 'utf8');
  assert.match(script, /import \{ movePins \} from '\.\/move-pins\.mjs';/);
  assert.match(script, /movePins\(\{ root: ROOT,/);
  assert.doesNotMatch(script, /upstream\.config\.mjs'\)|sha: '\$\{/);
});
