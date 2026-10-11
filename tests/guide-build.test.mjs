import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('Guide build retains authored source identity across output commits and rejects stale output', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-guide-build-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of ['guide/source.md', 'guide/metadata.json', 'guide/compass.svg', 'scripts/guide.mjs', 'package.json']) {
    const dest = path.join(dir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, file), dest);
  }
  const run = (command, args, expected = 0) => {
    const r = spawnSync(command, args, { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(r.status, expected, r.stderr + r.stdout);
    return r.stdout.trim();
  };
  run('git', ['init', '-q']);
  run('git', ['add', '.']);
  const commit = () => run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  commit();
  const sourceCommit = run('git', ['rev-parse', 'HEAD']);
  run(process.execPath, ['scripts/guide.mjs']);
  run('git', ['add', '.']);
  commit();
  run(process.execPath, ['scripts/guide.mjs', '--check']);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'guide/manifest.json'), 'utf8'));
  assert.equal(manifest.source.commit, sourceCommit);
  assert.equal(manifest.source.dirty, false);
  fs.appendFileSync(path.join(dir, 'guide/MANUAL.md'), '\nStale content\n');
  run(process.execPath, ['scripts/guide.mjs', '--check'], 1);
  run(process.execPath, ['scripts/guide.mjs']);
  run(process.execPath, ['scripts/guide.mjs', '--check']);
});
