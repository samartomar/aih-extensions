import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readSourceDeclarations, checkDeclarations } from '../scripts/source-declarations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const declaration = () => JSON.parse(fs.readFileSync(path.join(root, 'source-declarations/v1.json'), 'utf8'));

function fixture(t, mutate = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-source-declarations-'));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const data = declaration();
  const members = new Set(data.groups.flatMap((group) => group.members));
  for (const member of members) {
    const target = path.join(dir, member);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, member), target, { recursive: true });
  }
  mutate(data, dir);
  fs.mkdirSync(path.join(dir, 'source-declarations'));
  fs.writeFileSync(path.join(dir, 'source-declarations/v1.json'), JSON.stringify(data));
  return { root: dir };
}

test('a real framework declaration resolves identity, pinned provenance and authored groups', () => {
  const result = readSourceDeclarations({ root });
  assert.equal(result.status, 'declared');
  assert.equal(result.identity.name, 'aih-extensions');
  assert.match(result.identity.repository, /^https:\/\/github\.com\/samartomar\/aih-extensions$/);
  const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(result.identity.author.name, plugin.author.name);
  assert.equal(result.identity.license, plugin.license);
  assert.equal(result.identity.versionSource, 'package.json#version');
  const { upstreams } = JSON.parse(fs.readFileSync(path.join(root, 'vendor.lock.json'), 'utf8'));
  for (const upstream of result.provenance.upstreams) {
    assert.equal(upstream.sha, upstreams[upstream.key].sha, upstream.key);
    assert.equal(upstream.repo, upstreams[upstream.key].repo, upstream.key);
  }
  assert.deepEqual(result.groups.map((group) => group.id), ['upstream.addy', 'upstream.matt', 'original']);
  for (const group of result.groups) {
    for (const member of group.members) assert.match(member.kind, /^(file|directory)$/);
  }
  assert.equal(result.installation.status, 'not-declared');
  assert.equal(result.support.status, 'not-claimed');
});

test('the declaration carries no install plan, support claim or observed binding', () => {
  const result = readSourceDeclarations({ root });
  const facts = result.compatibility.facts.map(({ statement, ...rest }) => rest);
  const structured = JSON.stringify({ ...result, compatibility: { facts } });
  assert.doesNotMatch(structured, /\.claude\/skills|\.codex\/skills|\.kimi-code\/skills|\.agents\/skills|\.config\/opencode/);
  assert.equal(Object.hasOwn(result, 'binding'), false);
  for (const fact of result.compatibility.facts) {
    assert.equal(Object.hasOwn(fact, 'supported'), false);
    assert.equal(Object.hasOwn(fact, 'installPath'), false);
  }
});

test('a data-only copy reads identity and groups and never executes installer internals', (t) => {
  const options = fixture(t, (_data, dir) => {
    fs.writeFileSync(path.join(dir, 'scripts/setup.mjs'), 'throw new Error("INSTALLER MUST NOT EXECUTE");\n');
    fs.writeFileSync(path.join(dir, 'scripts/tools.mjs'), 'throw new Error("INSTALLER MUST NOT EXECUTE");\n');
  });
  const result = readSourceDeclarations(options);
  assert.equal(result.status, 'declared');
  assert.equal(result.groups.length, 3);
  assert.equal(result.installation.status, 'not-declared');
});

test('a missing or unknown declaration version is refused explicitly', (t) => {
  assert.equal(readSourceDeclarations({ version: 2 }).code, 'unknown-schema-version');
  assert.equal(readSourceDeclarations({ version: 'next' }).code, 'unknown-schema-version');
  const options = fixture(t);
  fs.rmSync(path.join(options.root, 'source-declarations/v1.json'));
  assert.equal(readSourceDeclarations(options).code, 'unknown-schema-version');
});

test('a member that does not resolve to authored content is refused', (t) => {
  const absent = fixture(t, (data) => { data.groups[0].members[0] = 'skills/not-a-real-skill'; });
  assert.deepEqual(pick(readSourceDeclarations(absent)),
    { status: 'refused', code: 'unknown-member', member: 'skills/not-a-real-skill', group: 'upstream.addy' });
  const traversal = fixture(t, (data) => { data.groups[0].members[0] = '../outside'; });
  assert.equal(readSourceDeclarations(traversal).code, 'invalid-member');
  const missing = fixture(t, (data, dir) => fs.rmSync(path.join(dir, 'hooks'), { recursive: true }));
  assert.equal(readSourceDeclarations(missing).code, 'unknown-member');
});

test('duplicate membership inside one group is refused; the same member across distinct groups is allowed', (t) => {
  const duplicate = fixture(t, (data) => {
    data.groups[2].members.push('skills/ask-sam');
  });
  assert.equal(readSourceDeclarations(duplicate).code, 'duplicate-member');
  const across = fixture(t, (data) => {
    data.groups[1].members.push('references');
    data.groups[2].members.push('references');
  });
  assert.equal(readSourceDeclarations(across).status, 'declared');
});

test('absent verification evidence stays absent and cannot present a fact as verified', (t) => {
  const unverified = fixture(t, (data) => { data.compatibility.facts[1].evidence = null; });
  assert.deepEqual(pick(readSourceDeclarations(unverified)),
    { status: 'refused', code: 'evidence-required', fact: 'guard-verified-claude' });
  const evidenceShape = fixture(t, (data) => { delete data.compatibility.facts[1].evidence.platform; });
  assert.equal(readSourceDeclarations(evidenceShape).code, 'invalid-evidence');
  const limitation = readSourceDeclarations({ root });
  const disabled = limitation.compatibility.facts.find((fact) => fact.id === 'codex-shared-location-disabled');
  assert.equal(disabled.kind, 'limitation');
  assert.equal(disabled.evidence, null);
});

test('a source limitation never promotes an unsupported tool and unknown tool ids are refused', (t) => {
  const result = readSourceDeclarations({ root });
  for (const fact of result.compatibility.facts) {
    assert.equal(result.support.status, 'not-claimed');
    assert.equal(Object.hasOwn(fact, 'supported'), false);
  }
  const unknownTool = fixture(t, (data) => { data.compatibility.facts[0].tool = 'future-client'; });
  assert.equal(readSourceDeclarations(unknownTool).code, 'invalid-compatibility');
  for (const fact of declaration().compatibility.facts) {
    assert.ok(['all', 'claude', 'codex', 'cursor', 'kimi', 'opencode'].includes(fact.tool), fact.id);
  }
});

test('malformed provenance is refused; format-valid pins still read as declared', (t) => {
  const shortSha = fixture(t, (data) => { data.provenance.upstreams[0].sha = 'abc123'; });
  assert.equal(readSourceDeclarations(shortSha).code, 'invalid-provenance');
  const otherSha = fixture(t, (data) => { data.provenance.upstreams[1].sha = 'f'.repeat(40); });
  assert.equal(readSourceDeclarations(otherSha).status, 'declared');
});

test('the declaration matches the authored pins and groupings', async () => {
  const result = await checkDeclarations({ root });
  assert.equal(result.status, 'current', result.drift?.join('; '));
});

test('the command-line consumer labels intent and exits unsuccessfully on refusal', () => {
  const script = path.join(root, 'scripts/source-declarations.mjs');
  const good = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).status, 'declared');
  const unknown = spawnSync(process.execPath, [script, '2'], { encoding: 'utf8' });
  assert.equal(unknown.status, 1, unknown.stderr);
  assert.equal(JSON.parse(unknown.stdout).code, 'unknown-schema-version');
  const check = spawnSync(process.execPath, [script, 'check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).status, 'current');
});

function pick(result) {
  return Object.fromEntries(Object.entries(result).filter(([, value]) => typeof value !== 'object' || value === null));
}
