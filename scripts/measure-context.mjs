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
// The process seam lets tests supply CLI responses without making model calls.
export function measureContext(base = [], run = spawnSync) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aihx-measure-'));
  function inputTokens(pluginArgs) {
    const r = run('claude', [
      '-p', '--model', 'haiku', '--setting-sources', 'project,local',
      '--settings', '{"skillListingBudgetFraction":1}', '--max-turns', '1', '--output-format', 'json',
      ...pluginArgs, 'Reply with just OK.',
    ], { cwd, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 1_048_576 });
    if (r.error || r.status !== 0 || !r.stdout?.trim()) throw new Error(`claude -p failed: ${r.error?.message ?? r.stderr}`);
    const result = JSON.parse(r.stdout);
    if (result.is_error) throw new Error('claude -p returned an error; no context measurement is available.');
    const usage = result.usage;
    if (!usage || !Object.hasOwn(usage, 'input_tokens')) throw new Error('claude -p returned no input token usage.');
    let count = 0;
    for (const key of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) {
      const value = Object.hasOwn(usage, key) ? usage[key] : 0;
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`claude -p returned invalid ${key}.`);
      count += value;
    }
    if (!Number.isSafeInteger(count)) throw new Error('claude -p returned invalid total input token usage.');
    return count;
  }
  try {
    const without = inputTokens(base);
    const withAddOn = inputTokens([...base, '--plugin-dir', ROOT]);
    return { without, withAddOn };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = [];
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--base') base.push('--plugin-dir', path.resolve(process.argv[++i]));
    if (process.argv[i] === '--with-matt') base.push('--plugin-dir', path.join(UPSTREAM_CACHE, 'matt'));
  }
  const { without, withAddOn } = measureContext(base);
  console.log(`without add-on  ${without} tokens${base.length ? ' (base plugins loaded)' : ''}`);
  console.log(`with add-on     ${withAddOn} tokens`);
  console.log(`added           ${withAddOn - without} tokens per session (skill listing + lanes note, uncapped)`);
}
