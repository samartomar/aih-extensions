#!/usr/bin/env node
// Measure what this add-on costs every session, for real: run the same
// one-line prompt headlessly with and without it and compare the input tokens
// Claude Code sent. The skill-listing cap is lifted so the number is the full
// cost, not a truncated one. Costs two small Haiku calls.
// Usage: node scripts/measure-context.mjs [--with-matt] [--base <plugin dir>]...
//   --with-matt  load the pinned mattpocock/skills checkout (from `npm run vendor`) in both runs
//   --base       any other plugin directory to load in both runs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UPSTREAM_CACHE } from './paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--base') base.push('--plugin-dir', path.resolve(process.argv[++i]));
  if (process.argv[i] === '--with-matt') base.push('--plugin-dir', path.join(UPSTREAM_CACHE, 'matt'));
}
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-measure-'));

function inputTokens(pluginArgs) {
  const r = spawnSync('claude', [
    '-p', '--model', 'haiku', '--setting-sources', 'project,local',
    '--settings', '{"skillListingBudgetFraction":1}', '--max-turns', '1', '--output-format', 'json',
    ...pluginArgs, 'Reply with just OK.',
  ], { cwd, encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) throw new Error(`claude -p failed: ${r.error?.message ?? r.stderr}`);
  const u = JSON.parse(r.stdout).usage ?? {};
  return (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
}

const without = inputTokens(base);
const withAddOn = inputTokens([...base, '--plugin-dir', ROOT]);
fs.rmSync(cwd, { recursive: true, force: true });
console.log(`without add-on  ${without} tokens${base.length ? ' (base plugins loaded)' : ''}`);
console.log(`with add-on     ${withAddOn} tokens`);
console.log(`added           ${withAddOn - without} tokens per session (skill listing + lanes note, uncapped)`);
