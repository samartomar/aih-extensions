import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'), cache = path.join(dir, 'cache', 'upstream'), matt = path.join(cache, 'matt');
  const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  write(path.join(matt, '.claude-plugin', 'plugin.json'), JSON.stringify({ skills: ['./fixture-skill'] }));
  write(path.join(matt, 'fixture-skill', 'SKILL.md'), '---\nname: fixture-skill\ndescription: Fixture\n---\nOriginal fixture payload\n');
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: matt, encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q'); git('remote', 'add', 'origin', 'https://github.com/mattpocock/skills.git'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  const tmp = path.join(dir, 'tmp');
  fs.mkdirSync(tmp);
  const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp, HOME: home, USERPROFILE: home, AIH_UPSTREAM_CACHE: cache,
    AIH_EXTENSIONS_HOME: path.join(home, '.aih-extensions'), CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CODEX_HOME: path.join(home, 'custom-codex'), KIMI_CODE_HOME: path.join(home, '.kimi-code'), XDG_CONFIG_HOME: path.join(home, '.config') };
  const setup = (...args) => spawnSync(process.execPath, ['scripts/setup.mjs', ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const install = (...args) => setup('install', '--tools', 'codex', '--matt-ref', sha, '--codex-skills', 'fixture-skill', ...args);
  return { home, cache, matt, env, setup, install, write };
}

test('Codex selected skill preview, delivery, update and removal keep other clients and guard preferences', t => {
  const f = fixture(t);
  const dest = path.join(f.env.CODEX_HOME, 'skills', 'fixture-skill');
  const other = path.join(f.home, '.claude', 'skills', 'fixture-skill', 'SKILL.md');
  const unrelated = path.join(f.env.CODEX_HOME, 'skills', 'personal', 'SKILL.md');
  f.write(other, 'Other client owns this source'); f.write(unrelated, 'Personal skill');
  const preview = f.install();
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /codex skill fixture-skill \(matt\)/);
  assert.ok(preview.stdout.includes(dest));
  assert.match(preview.stdout, /shared.*disabled/i);
  assert.ok(!fs.existsSync(dest));
  const delivered = f.install('--no-git-guard', '--yes');
  assert.equal(delivered.status, 0, delivered.stderr);
  assert.deepEqual(fs.readdirSync(path.join(f.env.CODEX_HOME, 'skills')).sort(), ['fixture-skill', 'personal']);
  assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(f.matt, 'fixture-skill', 'SKILL.md'), 'utf8'));
  assert.ok(!fs.existsSync(path.join(f.home, '.agents')));
  const updated = f.install('--yes');
  assert.equal(updated.status, 0, updated.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.env.AIH_EXTENSIONS_HOME, 'manifest.json')));
  assert.equal(manifest.gitGuard.codex, false);
  assert.ok(!fs.readFileSync(path.join(f.env.CODEX_HOME, 'hooks.json'), 'utf8').includes('git-guard.mjs'));
  const removed = f.setup('uninstall', '--all', '--yes');
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(!fs.existsSync(dest));
  assert.equal(fs.readFileSync(other, 'utf8'), 'Other client owns this source');
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'Personal skill');
});

test('shared delivery and duplicate shared skills refuse before changing any destination', t => {
  const f = fixture(t);
  const shared = path.join(f.home, '.agents', 'skills', 'fixture-skill', 'SKILL.md');
  const dest = path.join(f.env.CODEX_HOME, 'skills', 'fixture-skill');
  const gated = f.install('--codex-skill-location', 'shared', '--yes');
  assert.equal(gated.status, 2, gated.stdout + gated.stderr);
  assert.match(gated.stderr, /native location\/precedence qualification/);
  assert.ok(!fs.existsSync(f.env.AIH_EXTENSIONS_HOME));
  assert.ok(!fs.existsSync(path.join(f.home, '.agents')));
  f.write(shared, 'Another client source');
  const duplicate = f.install('--yes');
  assert.equal(duplicate.status, 1, duplicate.stdout + duplicate.stderr);
  assert.match(duplicate.stderr, /shared skill collision/);
  assert.ok(!fs.existsSync(dest));
  assert.ok(!fs.existsSync(f.env.AIH_EXTENSIONS_HOME));
  assert.equal(fs.readFileSync(shared, 'utf8'), 'Another client source');
});

test('invalid selection, unowned destination and shared CODEX_HOME refuse without taking ownership', t => {
  const f = fixture(t);
  const invalid = f.setup('install', '--tools', 'codex', '--matt-ref', '0'.repeat(40), '--codex-skills', '--yes');
  assert.equal(invalid.status, 2, invalid.stderr);
  const unknown = f.setup('install', '--tools', 'codex', '--matt-ref', spawnSync('git', ['rev-parse', 'HEAD'], { cwd: f.matt, encoding: 'utf8' }).stdout.trim(), '--codex-skills', '../personal', '--yes');
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown or empty/);
  const personal = path.join(f.env.CODEX_HOME, 'skills', 'fixture-skill', 'SKILL.md');
  f.write(personal, 'Personal destination');
  const conflict = f.install('--yes');
  assert.equal(conflict.status, 1, conflict.stderr);
  assert.equal(fs.readFileSync(personal, 'utf8'), 'Personal destination');
  assert.ok(!fs.existsSync(f.env.AIH_EXTENSIONS_HOME));
  f.env.CODEX_HOME = path.join(f.home, '.agents');
  const alias = f.install('--yes');
  assert.equal(alias.status, 2, alias.stderr + alias.stdout);
  assert.match(alias.stderr, /shared skill location/);
  assert.ok(!fs.existsSync(path.join(f.home, '.agents')));
});

test('a shared collision on update preserves the owned installation and hooks', t => {
  const f = fixture(t);
  assert.equal(f.install('--no-git-guard', '--yes').status, 0);
  const installed = path.join(f.env.CODEX_HOME, 'skills', 'fixture-skill', 'SKILL.md');
  const hooks = path.join(f.env.CODEX_HOME, 'hooks.json');
  const before = fs.readFileSync(installed), hooksBefore = fs.readFileSync(hooks);
  const shared = path.join(f.home, '.agents', 'skills', 'fixture-skill', 'SKILL.md');
  f.write(shared, 'Shared source remains outside installer ownership');
  const update = f.install('--yes');
  assert.equal(update.status, 1, update.stderr);
  assert.deepEqual(fs.readFileSync(installed), before);
  assert.deepEqual(fs.readFileSync(hooks), hooksBefore);
  assert.equal(f.setup('uninstall', '--all', '--yes').status, 0);
  assert.equal(fs.readFileSync(shared, 'utf8'), 'Shared source remains outside installer ownership');
});

test('addon selection retains payload attribution and shared symlink aliases stay disabled', t => {
  const f = fixture(t);
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: f.matt, encoding: 'utf8' }).stdout.trim();
  const args = ['install', '--tools', 'codex', '--matt-ref', sha, '--codex-skills', 'install-commit-gate'];
  const preview = f.setup(...args);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /codex skill install-commit-gate \(addon\)/);
  assert.equal(f.setup(...args, '--yes').status, 0);
  assert.equal(fs.readFileSync(path.join(f.env.CODEX_HOME, 'skills', 'install-commit-gate', 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(root, 'skills', 'install-commit-gate', 'SKILL.md'), 'utf8'));
  assert.equal(f.setup('uninstall', '--all', '--yes').status, 0);
  const sharedRoot = path.join(f.home, '.agents', 'skills');
  fs.mkdirSync(sharedRoot, { recursive: true });
  fs.mkdirSync(f.env.CODEX_HOME, { recursive: true });
  fs.symlinkSync(sharedRoot, path.join(f.env.CODEX_HOME, 'skills'), process.platform === 'win32' ? 'junction' : 'dir');
  const alias = f.install('--yes');
  assert.equal(alias.status, 2, alias.stderr);
  assert.deepEqual(fs.readdirSync(sharedRoot), []);
});
