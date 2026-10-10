// Clean checkouts of pinned upstream commits, shared by the vendor script and
// the installer. Lives outside the repo (see paths.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { UPSTREAM_CACHE } from './paths.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

// Exactly `sha` of `repo`, whatever state the cache was left in. Returns the checkout dir.
export function checkoutPinned(name, { repo, sha }) {
  const dir = path.join(UPSTREAM_CACHE, name);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, '.git'))) { git(dir, 'init', '-q'); git(dir, 'remote', 'add', 'origin', repo); }
  git(dir, 'remote', 'set-url', 'origin', repo);
  try { git(dir, 'cat-file', '-e', `${sha}^{commit}`); } catch { git(dir, 'fetch', '-q', '--depth', '1', 'origin', sha); }
  git(dir, 'checkout', '-q', '--detach', '--force', sha);
  git(dir, 'clean', '-qfdx');
  return dir;
}

// Resolve a branch or tag on a remote to a commit sha (for installing something other than the pin).
export function resolveRef(repo, ref) {
  if (/^[0-9a-f]{40}$/.test(ref)) return ref;
  const out = execFileSync('git', ['ls-remote', repo, ref], { encoding: 'utf8', windowsHide: true }).trim().split('\n')[0];
  const sha = out.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error(`${ref} not found on ${repo}`);
  return sha;
}
