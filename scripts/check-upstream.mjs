#!/usr/bin/env node
// Are Matt's or Addy's repos ahead of the pins in upstream.config.mjs, and does
// moving the pins still work? Run by .github/workflows/upstream.yml every 3 days,
// and by hand:
//   node scripts/check-upstream.mjs            report only; changes nothing
//   node scripts/check-upstream.mjs --apply    also move the pins, re-vendor and
//                                              test, leaving the result in the tree
// --out <dir> writes report.json and issue.md there. Under GitHub Actions the
// status (current | moved | ready | needs-work), the issue title and the body's
// path also go to $GITHUB_OUTPUT.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { upstreams, copies } from './upstream.config.mjs';
import { checkoutPinned, resolveRef } from './git-cache.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'scripts', 'upstream.config.mjs');
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const outDir = argv.includes('--out') ? path.resolve(argv[argv.indexOf('--out') + 1]) : null;
const short = (sha) => sha.slice(0, 7);
const slug = (repo) => repo.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 << 20 });
const tail = (r, n = 15) => `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-n).join('\n');

// Matt's installed skills: the list in his plugin.json at a given commit.
function mattSkills(sha) {
  const dir = checkoutPinned('matt', { repo: upstreams.matt.repo, sha });
  return JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).skills.map((s) => s.replace(/^\.\//, ''));
}

// The upstream paths this repo takes: a change under one of them needs a read.
function watched(name, latest) {
  const vendored = copies.filter((c) => c.from === name).map((c) => c.src);
  return name === 'matt' ? ['.claude-plugin/plugin.json', ...mattSkills(latest), ...vendored] : vendored;
}

async function compare(repo, base, head) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'aih-extensions-upstream-check' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com/repos/${slug(repo)}/compare/${base}...${head}`, { headers });
  if (!r.ok) return { error: `GitHub's compare API answered HTTP ${r.status}` };
  const j = await r.json();
  return {
    url: j.html_url,
    commits: j.commits.map((c) => ({ sha: c.sha, message: c.commit.message.split('\n')[0] })),
    files: (j.files ?? []).map((f) => f.filename),
  };
}

const report = { checkedAt: new Date().toISOString(), status: 'current', upstreams: [], steps: [] };
for (const [name, u] of Object.entries(upstreams)) {
  const entry = { name, repo: u.repo, pinned: u.sha, latest: resolveRef(u.repo, 'HEAD') };
  if (entry.latest !== u.sha) {
    Object.assign(entry, await compare(u.repo, u.sha, entry.latest));
    const paths = watched(name, entry.latest);
    entry.touched = (entry.files ?? []).filter((f) => paths.some((p) => f === p || f.startsWith(`${p}/`)));
  }
  report.upstreams.push(entry);
}
const moved = report.upstreams.filter((u) => u.latest !== u.pinned);

if (moved.length) report.status = 'moved';
if (moved.length && apply) {
  let text = fs.readFileSync(CONFIG, 'utf8');
  for (const u of moved) {
    if (text.split(`sha: '${u.pinned}'`).length !== 2) throw new Error(`the ${u.name} pin is not written once as sha: '${u.pinned}'`);
    text = text.replace(`sha: '${u.pinned}'`, `sha: '${u.latest}'`);
  }
  fs.writeFileSync(CONFIG, text);

  const vendor = run(process.execPath, ['scripts/vendor.mjs']);
  report.steps.push({ step: 'Re-vendor with exact patches', ok: vendor.status === 0, detail: tail(vendor, vendor.status === 0 ? 1 : 15) });

  const matt = moved.find((u) => u.name === 'matt');
  if (matt) {
    const before = mattSkills(matt.pinned), after = mattSkills(matt.latest);
    const dir = checkoutPinned('matt', { repo: upstreams.matt.repo, sha: matt.latest });
    const ours = fs.readdirSync(path.join(ROOT, 'skills'));
    const missing = after.filter((s) => !fs.existsSync(path.join(dir, s, 'SKILL.md')));
    const clash = after.map((s) => path.basename(s)).filter((n) => ours.includes(n));
    const added = after.filter((s) => !before.includes(s)), removed = before.filter((s) => !after.includes(s));
    report.steps.push({
      step: "Matt's plugin skills",
      ok: !missing.length && !clash.length,
      detail: [`${before.length} → ${after.length}`, added.length && `added: ${added.join(', ')}`, removed.length && `removed: ${removed.join(', ')}`,
        missing.length && `no SKILL.md: ${missing.join(', ')}`, clash.length && `same name as a skill here: ${clash.join(', ')}`].filter(Boolean).join('; '),
    });
  }

  if (vendor.status === 0) {
    const tests = run(process.execPath, ['--test', 'tests/*.test.mjs']);
    const summary = `${tests.stdout ?? ''}`.split('\n').filter((l) => /^ℹ (tests|pass|fail) /.test(l)).join(', ').replace(/ℹ /g, '');
    report.steps.push({ step: 'Tests', ok: tests.status === 0, detail: tests.status === 0 ? summary : tail(tests, 25) });
  }
  report.status = report.steps.every((s) => s.ok) ? 'ready' : 'needs-work';
}

const moves = moved.map((u) => `${u.name} ${short(u.pinned)} → ${short(u.latest)}`).join(', ');
report.title = { ready: `Upstream update ready: ${moves}`, 'needs-work': `Upstream update needs work: ${moves}`, moved: `Upstream moved: ${moves}`, current: 'Upstream pins are current' }[report.status];

function issueBody() {
  const repo = process.env.GITHUB_REPOSITORY;
  const lines = [`Checked ${report.checkedAt}.`, '', '| Upstream | Pinned | Latest | Commits | Files this repo takes that changed |', '|---|---|---|---|---|'];
  for (const u of report.upstreams) {
    const same = u.latest === u.pinned;
    lines.push(`| [${slug(u.repo)}](${u.url ?? u.repo.replace(/\.git$/, '')}) | ${short(u.pinned)} | ${short(u.latest)} | ${same ? 'none' : u.commits?.length ?? '?'} | ${same ? '' : u.touched?.length ?? '?'} |`);
  }
  for (const u of moved) {
    lines.push('', `### ${slug(u.repo)}`);
    if (u.error) lines.push('', u.error);
    const commits = u.commits ?? [];
    for (const c of commits.slice(-15)) lines.push(`- ${short(c.sha)} ${c.message}`);
    if (commits.length > 15) lines.push(`- …and ${commits.length - 15} earlier`);
    if (u.touched?.length) lines.push('', 'Changed files this repo takes:', '', ...u.touched.slice(0, 40).map((f) => `- \`${f}\``));
  }
  if (report.steps.length) {
    lines.push('', '### Result', '', '| Step | | Detail |', '|---|---|---|');
    for (const s of report.steps) lines.push(`| ${s.step} | ${s.ok ? 'ok' : '**failed**'} | ${s.ok ? s.detail.replace(/\n/g, ' ') : ''} |`);
    for (const s of report.steps.filter((x) => !x.ok)) lines.push('', `<details><summary>${s.step}: output</summary>`, '', '```', s.detail, '```', '</details>');
  }
  lines.push('', '### Next step', '');
  if (report.status === 'ready') {
    lines.push('The `upstream-update` branch has the new pins and the re-vendored files, and the tests pass. Exact patches catch changed wording, not changed meaning, so read the upstream commits above first.',
      '', repo ? `Then [open the pull request](https://github.com/${repo}/compare/main...upstream-update?expand=1). Merging it closes this issue on the next check.` : 'Then commit the change.');
  } else {
    const guide = repo ? `https://github.com/${repo}/blob/main/docs/maintaining.md` : 'docs/maintaining.md';
    lines.push(`Run \`node scripts/check-upstream.mjs --apply\` locally. For a rejected patch, fix its \`find\` text in \`scripts/upstream.config.mjs\` or drop it (never loosen a count), then \`npm run vendor\` and \`npm test\`. See [docs/maintaining.md](${guide}).`);
  }
  return lines.join('\n') + '\n';
}

console.log(`${report.title}`);
for (const s of report.steps) console.log(`  ${s.ok ? 'ok    ' : 'FAILED'} ${s.step}: ${s.ok ? s.detail : s.detail.split('\n').slice(-3).join(' | ')}`);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'issue.md'), issueBody());
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${report.status}\ntitle=${report.title}\nbody=${outDir ? path.join(outDir, 'issue.md') : ''}\n`);
}
