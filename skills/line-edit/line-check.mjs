#!/usr/bin/env node
// Compare a document before and after an edit, for the line-edit skill.
// It lists what an edit may have lost, so that only those places need reading:
// sentences no longer present word for word, sentences that are new, links and
// code that went missing, links that no longer resolve, and headings that other
// files still link to.
//
//   node line-check.mjs <before> <after> [--json]
//   node line-check.mjs --git <file> [--json]     before is the file at HEAD
//
// Exit 0: nothing is broken. Exit 1: the edited file has a link or anchor that
// does not resolve, or another file links to a heading the edit removed. Exit 2:
// bad usage or unreadable input. Changed sentences alone never fail: a line edit
// rewords on purpose, and each listed sentence is a place to compare meaning.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VERSION = 1;

const FENCE = /^\s*(```|~~~)/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// Below this share of common words, two sentences are not the same statement reworded.
const NEAR = 0.3;
const lf = (text) => text.replace(/\r\n?/g, '\n');
const real = (file) => { try { return fs.realpathSync.native(file); } catch { return path.resolve(file); } };
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });

export const wordCount = (text) => (text.match(/\S+/g) ?? []).length;

// Frontmatter must survive an edit byte for byte; the body is everything after it.
export function split(text) {
  const all = lf(text);
  const found = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(all);
  if (!found) return { frontmatter: '', body: all, shift: 0 };
  return { frontmatter: found[0], body: all.slice(found[0].length), shift: found[0].split('\n').length - 1 };
}

// Lines outside fenced code, with their 1-based numbers in the body.
function proseLines(body) {
  const out = [];
  let fenced = false;
  lf(body).split('\n').forEach((text, index) => {
    if (FENCE.test(text)) { fenced = !fenced; return; }
    if (!fenced) out.push({ line: index + 1, text });
  });
  return out;
}

// Fenced blocks and inline code spans. A block may gain the indentation its
// list item needs, so its lines are compared without leading or trailing space.
export function code(body) {
  const out = [];
  let block = null;
  for (const text of lf(body).split('\n')) {
    if (FENCE.test(text)) {
      if (block === null) block = [];
      else { out.push(block.map((line) => line.trim()).join('\n')); block = null; }
      continue;
    }
    if (block !== null) { block.push(text); continue; }
    for (const span of text.matchAll(/`([^`\n]+)`/g)) out.push(span[1]);
  }
  return out;
}

// What a line says, without the marks that only shape it: a link reads as its
// text, and heading, list, quote, emphasis, code and table marks are dropped.
const normalise = (text) => text
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)/, '')
  .replace(/[*`|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const prose = (body) => proseLines(body).map(({ text }) => normalise(text)).join(' ').replace(/\s+/g, ' ');

// One unit per heading, list item and table row, and one per sentence in a
// paragraph, however the source wraps its lines.
export function units(body) {
  const blocks = [];
  let current = null;
  const flush = () => { if (current) blocks.push(current); current = null; };
  for (const { line, text } of proseLines(body)) {
    if (!text.trim()) { flush(); continue; }
    const starts = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)/.test(text);
    if (starts || !current) { flush(); current = { line, text: normalise(text) }; } else current.text += ` ${normalise(text)}`;
    if (/^\s*(#{1,6}\s|\|)/.test(text)) flush();
  }
  flush();
  return blocks
    .flatMap(({ line, text }) => text.split(/(?<=[.!?])\s+/).map((sentence) => ({ line, text: sentence.trim() })))
    .filter((unit) => /[\p{L}\p{N}]/u.test(unit.text) && wordCount(unit.text) >= 3);
}

export function links(body) {
  const out = [];
  for (const { line, text } of proseLines(body)) {
    for (const found of text.replace(/`[^`]*`/g, '').matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ line, target: found[1] });
  }
  return out;
}

// GitHub's heading anchors, with -1, -2 for repeated headings.
export const slug = (heading) => heading.trim().toLowerCase()
  .replace(/`/g, '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[^\p{L}\p{N}\s_-]/gu, '')
  .replace(/\s/g, '-');

export function anchors(body) {
  const seen = new Map();
  const out = [];
  for (const { text } of proseLines(body)) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(text);
    if (!heading) continue;
    const base = slug(heading[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    out.push(count === 0 ? base : `${base}-${count}`);
  }
  return out;
}

// Items of the first list with no partner left in the second.
function missing(first, second) {
  const left = new Map();
  for (const item of second) left.set(item, (left.get(item) ?? 0) + 1);
  const out = [];
  for (const item of first) {
    const count = left.get(item) ?? 0;
    if (count > 0) left.set(item, count - 1); else out.push(item);
  }
  return out;
}

const bag = (text) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
function nearest(text, candidates) {
  const own = bag(text);
  let best = null;
  for (const candidate of candidates) {
    let shared = 0;
    for (const word of own) if (candidate.bag.has(word)) shared += 1;
    const total = own.size + candidate.bag.size - shared;
    const score = total ? shared / total : 0;
    if (!best || score > best.score) best = { text: candidate.text, score };
  }
  return best && best.score >= NEAR ? { text: best.text, score: Math.round(best.score * 100) / 100 } : null;
}

// The text-only comparison: needs no files on disk.
export function compare(beforeText, afterText) {
  const before = split(beforeText);
  const after = split(afterText);
  const beforeUnits = units(before.body).map((unit) => ({ ...unit, bag: bag(unit.text) }));
  const afterUnits = units(after.body).map((unit) => ({ ...unit, bag: bag(unit.text) }));
  const beforeProse = prose(before.body);
  const afterProse = prose(after.body);
  const changed = beforeUnits
    .filter((unit) => !afterProse.includes(unit.text))
    .map((unit) => ({ line: unit.line + before.shift, text: unit.text, nearest: nearest(unit.text, afterUnits) }));
  const added = afterUnits
    .filter((unit) => !beforeProse.includes(unit.text) && !nearest(unit.text, beforeUnits))
    .map((unit) => ({ line: unit.line + after.shift, text: unit.text }));
  return {
    words: { before: wordCount(lf(beforeText)), after: wordCount(lf(afterText)) },
    frontmatterChanged: before.frontmatter !== after.frontmatter,
    changed,
    added,
    linksRemoved: missing(links(before.body).map((link) => link.target), links(after.body).map((link) => link.target)),
    codeRemoved: missing(code(before.body), code(after.body)),
    headingsRemoved: missing(anchors(before.body), anchors(after.body)),
  };
}

// Relative links in the edited file whose file or anchor does not exist. A link to the web stays unchecked.
export function brokenLinks(afterPath, afterText) {
  const { body, shift } = split(afterText);
  const own = new Set(anchors(body));
  const cache = new Map();
  const out = [];
  for (const { line, target } of links(body)) {
    if (SCHEME.test(target)) continue;
    const [filePart, anchorPart] = target.split('#');
    let file;
    let anchor;
    try {
      file = decodeURIComponent(filePart);
      anchor = anchorPart === undefined ? '' : decodeURIComponent(anchorPart).toLowerCase();
    } catch { out.push({ line: line + shift, target, reason: 'not a valid link' }); continue; }
    const destination = file ? path.resolve(path.dirname(afterPath), file) : afterPath;
    if (file && !fs.existsSync(destination)) { out.push({ line: line + shift, target, reason: 'file not found' }); continue; }
    if (!anchor) continue;
    let known = own;
    if (file) {
      if (!destination.toLowerCase().endsWith('.md') || !fs.statSync(destination).isFile()) continue;
      if (!cache.has(destination)) cache.set(destination, new Set(anchors(split(fs.readFileSync(destination, 'utf8')).body)));
      known = cache.get(destination);
    }
    if (!known.has(anchor)) out.push({ line: line + shift, target, reason: 'anchor not found' });
  }
  return out;
}

// Links in the repository's other Markdown files to headings the edit removed.
export function inbound(afterPath, removed) {
  if (removed.length === 0) return { checked: true, links: [] };
  let root;
  let files;
  try {
    root = git(path.dirname(afterPath), 'rev-parse', '--show-toplevel').trim();
    files = git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md').split('\0').filter(Boolean);
  } catch { return { checked: false, links: [] }; }
  const self = real(afterPath);
  const gone = new Set(removed);
  const out = [];
  for (const name of files) {
    const file = path.resolve(root, name);
    if (!fs.existsSync(file) || samePath(real(file), self)) continue;
    const { body, shift } = split(fs.readFileSync(file, 'utf8'));
    for (const { line, target } of links(body)) {
      if (SCHEME.test(target) || !target.includes('#')) continue;
      const [filePart, anchorPart] = target.split('#');
      try {
        const destination = filePart ? path.resolve(path.dirname(file), decodeURIComponent(filePart)) : file;
        if (samePath(real(destination), self) && gone.has(decodeURIComponent(anchorPart).toLowerCase())) out.push({ file: name, line: line + shift, target });
      } catch { /* a malformed link in another file is that file's problem */ }
    }
  }
  return { checked: true, links: out };
}

export function check(beforeText, afterText, afterPath) {
  const result = compare(beforeText, afterText);
  const others = inbound(afterPath, result.headingsRemoved);
  return { ...result, broken: brokenLinks(afterPath, afterText), inbound: others.links, inboundChecked: others.checked };
}

function render(result, name) {
  const lines = [`line-check ${VERSION}: ${name}`, `Words: ${result.words.before} -> ${result.words.after}`];
  const section = (title, items, show) => { lines.push(`${title}: ${items.length}`); for (const item of items) lines.push(...show(item)); };
  if (result.frontmatterChanged) lines.push('Frontmatter: CHANGED (it must stay byte for byte)');
  section('Sentences no longer present word for word (compare each with its nearest match; a cut belongs in the report)', result.changed,
    (item) => [`  line ${item.line}: ${item.text}`, item.nearest ? `    nearest (${item.nearest.score}): ${item.nearest.text}` : '    no close match: cut, or moved into different words']);
  section('New sentences with no close match in the original (additions)', result.added, (item) => [`  line ${item.line}: ${item.text}`]);
  section('Link targets removed', result.linksRemoved, (item) => [`  ${item}`]);
  section('Code changed or removed', result.codeRemoved, (item) => [`  ${item.split('\n').join('\n  ')}`]);
  section('Links that do not resolve', result.broken, (item) => [`  line ${item.line}: ${item.target} (${item.reason})`]);
  section('Headings removed or renamed', result.headingsRemoved, (item) => [`  #${item}`]);
  if (result.inboundChecked) section('Links elsewhere in the repository to a removed heading', result.inbound, (item) => [`  ${item.file}:${item.line}: ${item.target}`]);
  else lines.push('Links elsewhere in the repository to a removed heading: not checked (not a Git repository)');
  return lines.join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((arg) => arg !== '--json');
  const usage = 'Usage: node line-check.mjs <before> <after> [--json]\n       node line-check.mjs --git <file> [--json]';
  let result;
  let name;
  try {
    let beforeText;
    let afterPath;
    if (args.length === 2 && args[0] === '--git') {
      afterPath = path.resolve(args[1]);
      name = args[1];
      const root = git(path.dirname(afterPath), 'rev-parse', '--show-toplevel').trim();
      beforeText = git(root, 'show', `HEAD:${path.relative(real(root), real(afterPath)).split(path.sep).join('/')}`);
    } else if (args.length === 2 && !args.some((arg) => arg.startsWith('--'))) {
      beforeText = fs.readFileSync(args[0], 'utf8');
      afterPath = path.resolve(args[1]);
      name = args[1];
    } else { console.error(usage); return 2; }
    result = check(beforeText, fs.readFileSync(afterPath, 'utf8'), afterPath);
  } catch (error) {
    console.error(`line-check: ${String(error.message).split('\n')[0]}`);
    return 2;
  }
  console.log(json ? JSON.stringify(result, null, 2) : render(result, name));
  return result.broken.length > 0 || result.inbound.length > 0 ? 1 : 0;
}

if (process.argv[1] && samePath(real(fileURLToPath(import.meta.url)), real(process.argv[1]))) process.exitCode = main(process.argv.slice(2));
