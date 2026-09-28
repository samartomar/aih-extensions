#!/usr/bin/env node
// Regenerate vendored content from the pinned upstream commits in
// upstream.config.mjs. All-or-nothing: everything is built and checked in a
// staging folder first; the repo is only touched once every patch applied and
// every check passed. Usage: node scripts/vendor.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as config from './upstream.config.mjs';
import { checkoutPinned as checkout } from './git-cache.mjs';

const { upstreams, copies, exclude = [], userInvoked = [], patches = [], appends = [], forbiddenRefs = [] } = config;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = path.join(ROOT, '.vendor-staging');
const LOCK = path.join(ROOT, 'vendor.lock.json');

const fail = (msg) => { fs.rmSync(STAGE, { recursive: true, force: true }); console.error(`vendor: ${msg}\nvendor: nothing in the repo was changed.`); process.exit(1); };

const TEXT = /\.(md|mjs|js|cjs|ts|json|ya?ml|sh|txt|html|css)$|LICENSE$/;
const generated = [];
function copyInto(src, dest) {
  if (exclude.some((re) => re.test(src))) return;
  if (fs.statSync(src).isDirectory()) {
    for (const entry of fs.readdirSync(src)) copyInto(path.join(src, entry), path.join(dest, entry));
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (TEXT.test(src)) fs.writeFileSync(dest, fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n'));
  else fs.copyFileSync(src, dest);
  generated.push(path.relative(STAGE, dest).split(path.sep).join('/'));
}
const read = (rel) => {
  const abs = path.join(STAGE, rel);
  if (!fs.existsSync(abs)) fail(`${rel} does not exist (check upstream.config.mjs)`);
  return fs.readFileSync(abs, 'utf8');
};
const write = (rel, text) => fs.writeFileSync(path.join(STAGE, rel), text);

// ---- 1. Build in staging ----
fs.rmSync(STAGE, { recursive: true, force: true });
let dirs;
try {
  dirs = Object.fromEntries(Object.entries(upstreams).map(([name, u]) => [name, checkout(name, u)]));
} catch (e) { fail(`could not fetch upstream: ${e.message.split('\n')[0]}`); }
for (const { from, src, dest } of copies) {
  const abs = path.join(dirs[from], src);
  if (!fs.existsSync(abs)) fail(`${from}:${src} not found at ${upstreams[from].sha}`);
  copyInto(abs, path.join(STAGE, dest));
}
for (const { file, find, replace, count = 1 } of patches) {
  const text = read(file);
  const found = text.split(find).length - 1;
  if (found !== count) fail(`patch expected ${count}x in ${file}, found ${found}x:\n  ${find}`);
  write(file, text.split(find).join(replace));
}
for (const file of userInvoked) {
  const text = read(file);
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) fail(`${file} has no frontmatter`);
  if (/disable-model-invocation:/.test(m[1])) fail(`${file} already sets disable-model-invocation; drop it from userInvoked`);
  write(file, text.replace(m[0], `---\n${m[1]}\ndisable-model-invocation: true\n---`));
  // Codex ignores that frontmatter key and reads agents/openai.yaml instead (Matt ships one per skill).
  const yaml = path.join(path.dirname(file), 'agents', 'openai.yaml');
  fs.mkdirSync(path.join(STAGE, path.dirname(yaml)), { recursive: true });
  write(yaml, 'policy:\n  allow_implicit_invocation: false\n');
  generated.push(yaml.split(path.sep).join('/'));
}
for (const { file, overlay } of appends) write(file, read(file).replace(/\n*$/, '\n\n') + fs.readFileSync(path.join(ROOT, overlay), 'utf8'));

// ---- 2. Check the staged output ----
const problems = [];
for (const rel of generated) {
  if (!rel.endsWith('.md')) continue;
  const text = read(rel);
  // Frontmatter: an unquoted value containing ": " or starting with a YAML indicator breaks strict parsers.
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  for (const line of fm?.split('\n') ?? []) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!m || !m[2] || /^["']/.test(m[2])) continue;
    if (/: |\s#/.test(m[2]) || /^[[\]{}&*!|>%@`]/.test(m[2])) problems.push(`${rel}: frontmatter "${m[1]}" needs quoting: ${m[2].slice(0, 60)}`);
  }
  text.split('\n').forEach((line, i) => {
    for (const name of forbiddenRefs) if (line.includes(name)) problems.push(`${rel}:${i + 1}: points at \`${name}\`, which this add-on leaves out`);
  });
}
if (problems.length) fail(`${problems.length} problem(s) in generated files:\n  ${problems.join('\n  ')}`);

// ---- 3. Swap into the repo ----
const previous = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')).generated ?? [] : [];
for (const rel of previous) fs.rmSync(path.join(ROOT, rel), { force: true });
for (const rel of generated) {
  fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
  fs.copyFileSync(path.join(STAGE, rel), path.join(ROOT, rel));
}
// Prune directories the previous run created that are now empty.
const pruned = new Set(previous.map((rel) => path.dirname(rel)));
for (const dir of [...pruned].sort((a, b) => b.length - a.length)) {
  for (let d = dir; d && d !== '.'; d = path.dirname(d)) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs) || fs.readdirSync(abs).length) break;
    fs.rmdirSync(abs);
  }
}
fs.writeFileSync(LOCK, JSON.stringify({
  upstreams: Object.fromEntries(Object.entries(upstreams).map(([n, u]) => [n, { repo: u.repo, sha: u.sha }])),
  generated: generated.sort(),
}, null, 2) + '\n');
fs.rmSync(STAGE, { recursive: true, force: true });
console.log(`vendor: ${generated.length} files, ${patches.length} patches, ${userInvoked.length} user-invoked, ${appends.length} overlays`);
