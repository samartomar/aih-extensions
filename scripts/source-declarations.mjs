// Read source identity, provenance, groups and attributed compatibility facts as
// data. Never import the installer, a client adapter or a hook.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const KNOWN_VERSION = 1;
// Stable public Core tool identifiers (scripts/tools.mjs#TOOLS), plus 'all'.
const TOOLS = new Set(['all', 'claude', 'codex', 'cursor', 'kimi', 'opencode']);
const FACT_KINDS = new Set(['verified', 'limitation', 'requirement']);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const refuse = (code) => ({
  status: 'refused', code,
  installation: { status: 'not-declared' },
  support: { status: 'not-claimed', reason: 'compatibility-facts-are-source-scoped' },
});

function memberFile(root, relative) {
  if (!nonempty(relative) || relative.includes('\\') || path.posix.isAbsolute(relative)
    || relative.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  const resolved = path.resolve(root, relative);
  const within = path.relative(root, resolved);
  if (within.startsWith('..') || path.isAbsolute(within)) return null;
  return resolved;
}

export function readSourceDeclarations({ root = ROOT, version = KNOWN_VERSION } = {}) {
  if (version !== KNOWN_VERSION) return refuse('unknown-schema-version');
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(root, `source-declarations/v${version}.json`), 'utf8')); }
  catch { return refuse('unknown-schema-version'); }
  if (data?.schemaVersion !== KNOWN_VERSION) return refuse('unknown-schema-version');

  const identity = data.identity;
  if (!nonempty(identity?.name) || !nonempty(identity?.title) || !nonempty(identity?.description)
    || !nonempty(identity?.author?.name) || !nonempty(identity?.author?.url)
    || !nonempty(identity?.license) || !nonempty(identity?.repository)
    || !/^[^#]+#[^#]+$/.test(identity?.versionSource ?? '')) return refuse('invalid-identity');

  const provenance = data.provenance;
  if (!nonempty(provenance?.source) || !Array.isArray(provenance?.upstreams)
    || provenance.upstreams.length === 0) return refuse('invalid-provenance');
  const upstreamKeys = new Set();
  for (const upstream of provenance.upstreams) {
    if (!nonempty(upstream?.key) || upstreamKeys.has(upstream.key)
      || !/^https:\/\//.test(upstream?.repo ?? '') || !/^[a-f0-9]{40}$/.test(upstream?.sha ?? '')
      || typeof upstream?.vendored !== 'boolean') return refuse('invalid-provenance');
    upstreamKeys.add(upstream.key);
  }

  if (!Array.isArray(data.groups) || data.groups.length === 0) return refuse('invalid-groups');
  const groupIds = new Set();
  const groups = [];
  for (const group of data.groups) {
    if (!nonempty(group?.id) || groupIds.has(group.id) || !nonempty(group?.source)
      || !Array.isArray(group?.members) || group.members.length === 0) return refuse('invalid-groups');
    groupIds.add(group.id);
    const seen = new Set();
    const members = [];
    for (const member of group.members) {
      if (seen.has(member)) return refuse('duplicate-member');
      seen.add(member);
      const file = memberFile(root, member);
      if (!file) return refuse('invalid-member');
      let stat;
      try { stat = fs.statSync(file); }
      catch { return { ...refuse('unknown-member'), member, group: group.id }; }
      members.push({ path: member, kind: stat.isDirectory() ? 'directory' : 'file' });
    }
    groups.push({ id: group.id, source: group.source, members });
  }

  const facts = data.compatibility?.facts;
  if (!Array.isArray(facts)) return refuse('invalid-compatibility');
  const factIds = new Set();
  for (const fact of facts) {
    if (!nonempty(fact?.id) || factIds.has(fact.id) || !TOOLS.has(fact?.tool)
      || !FACT_KINDS.has(fact?.kind) || !nonempty(fact?.statement) || !nonempty(fact?.source)
      || !Object.hasOwn(fact, 'evidence')) return refuse('invalid-compatibility');
    factIds.add(fact.id);
    if (fact.evidence !== null) {
      const evidence = fact.evidence;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence?.date ?? '') || !nonempty(evidence?.platform)
        || (evidence?.toolVersion !== undefined && !nonempty(evidence.toolVersion))
        || (evidence?.model !== undefined && !nonempty(evidence.model))) return refuse('invalid-evidence');
    }
    if (fact.kind === 'verified' && fact.evidence === null) return { ...refuse('evidence-required'), fact: fact.id };
  }

  return {
    status: 'declared',
    label: 'Declared source identity, provenance, groups and attributed facts; not an install plan, a support claim or an observed binding',
    identity, provenance: data.provenance, groups, compatibility: { facts },
    installation: { status: 'not-declared' },
    support: { status: 'not-claimed', reason: 'compatibility-facts-are-source-scoped' },
  };
}

// Regenerate the machine-derivable declaration parts from authored metadata and
// compare them with the committed data. Exits 0 when they match.
export async function checkDeclarations({ root = ROOT } = {}) {
  const { upstreams, copies } = await import(path.join(root, 'scripts/upstream.config.mjs'));
  const declared = JSON.parse(fs.readFileSync(path.join(root, `source-declarations/v${KNOWN_VERSION}.json`), 'utf8'));
  const drift = [];
  const expectedUpstreams = Object.entries(upstreams).map(([key, upstream]) => ({
    key, repo: upstream.repo, sha: upstream.sha,
    vendored: declared.provenance.upstreams.find((u) => u.key === key)?.vendored ?? true,
    ...(declared.provenance.upstreams.find((u) => u.key === key)?.note
      ? { note: declared.provenance.upstreams.find((u) => u.key === key).note } : {}),
  }));
  if (JSON.stringify(declared.provenance.upstreams) !== JSON.stringify(expectedUpstreams)) {
    drift.push('provenance.upstreams no longer matches scripts/upstream.config.mjs');
  }
  for (const key of Object.keys(upstreams)) {
    const expectedMembers = copies.filter((copy) => copy.from === key).map((copy) => copy.dest);
    const group = declared.groups.find((g) => g.id === `upstream.${key}`);
    if (!group || JSON.stringify(group.members) !== JSON.stringify(expectedMembers)) {
      drift.push(`groups[upstream.${key}].members no longer matches scripts/upstream.config.mjs#copies`);
    }
  }
  return { status: drift.length === 0 ? 'current' : 'drift', drift };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'check') {
    const result = await checkDeclarations();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'drift') process.exitCode = 1;
  } else {
    const version = process.argv[2] === undefined ? KNOWN_VERSION : Number(process.argv[2]);
    const result = readSourceDeclarations({ version });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'refused') process.exitCode = 1;
  }
}
