// Read source intent as data. Never import a hook, setup helper or client adapter.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PLACEHOLDERS = new Set(['projectDir', 'homeDir', 'itemDir', 'pluginRoot']);
const EVENTS = {
  'claude-command-hook': ['PreToolUse', 'SessionStart'],
  'codex-command-hook': ['PreToolUse', 'SessionStart'],
  'kimi-command-hook': ['PreToolUse'],
  'opencode-plugin-callback': ['tool.execute.before', 'experimental.chat.system.transform'],
  'git-hook': ['commit-msg'],
};
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const refuse = (code) => ({ status: 'refused', code, installed: false, binding: { status: 'unavailable' } });

function placeholdersValid(value) {
  if (typeof value === 'string') {
    const rest = value.replace(/\{([^{}]+)\}/g, (match, name, offset) =>
      PLACEHOLDERS.has(name) && value[offset - 1] !== '$' ? '' : match);
    return !/[{}]/.test(rest);
  }
  if (Array.isArray(value)) return value.every(placeholdersValid);
  if (value && typeof value === 'object') return Object.values(value).every(placeholdersValid);
  return true;
}

function materialFile(root, relative) {
  if (!nonempty(relative) || relative.includes('\\') || path.posix.isAbsolute(relative)
    || relative.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  const resolved = fs.realpathSync(path.resolve(root, relative));
  const within = path.relative(fs.realpathSync(root), resolved);
  if (within.startsWith('..') || path.isAbsolute(within)) return null;
  return resolved;
}

export function readHookIntent({ root = ROOT, id, tool = null } = {}) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(root, 'hook-declarations/v1.json'), 'utf8')); }
  catch { return refuse('declaration-unreadable'); }
  if (data?.schemaVersion !== 1 || !Array.isArray(data.hooks)) return refuse('unknown-schema');
  const matches = data.hooks.filter((hook) => hook?.id === id);
  if (matches.length !== 1) return refuse('declaration-not-unique');
  const hook = matches[0];
  if (!Object.hasOwn(EVENTS, hook.source?.protocol)) return refuse('unknown-protocol');
  if (!EVENTS[hook.source.protocol].includes(hook.source.event)) return refuse('unknown-event');
  if (hook.source.matcher !== undefined && !nonempty(hook.source.matcher)) return refuse('invalid-matcher');
  if (!placeholdersValid(hook)) return refuse('unknown-placeholder');
  if (hook.runtime?.name !== 'node' || hook.runtime?.executable !== 'node'
    || !nonempty(hook.runtime?.versionRange)) return refuse('runtime-required');
  const invocation = hook.invocation;
  const module = hook.source.protocol === 'opencode-plugin-callback';
  if (!invocation || invocation.kind !== (module ? 'module-factory' : 'command')
    || invocation.entrypoint !== `{itemDir}/${hook.script}` || !Array.isArray(invocation.arguments)
    || (module && (!nonempty(invocation.export) || typeof invocation.factoryOptions?.gitGuard !== 'boolean')))
    return refuse('invalid-invocation');
  if (!invocation.arguments.every((arg) => typeof arg === 'string'
    || (hook.source.protocol === 'git-hook' && arg?.kind === 'event-argument'
      && arg.position === 1 && arg.name === 'commitMessageFile'))) return refuse('invalid-argument');
  if (!Object.hasOwn(hook, 'timeoutSeconds') || !(hook.timeoutSeconds === null
    || (Number.isFinite(hook.timeoutSeconds) && hook.timeoutSeconds > 0))) return refuse('invalid-timeout');
  if (!nonempty(hook.installation?.reference) || hook.installation?.materialRoot !== '{itemDir}'
    || hook.installation?.activation !== 'requires-consumer-binding') return refuse('installation-reference-required');
  if (!Array.isArray(hook.materials) || !hook.materials.some((material) => material?.path === hook.script))
    return refuse('script-material-required');
  const seen = new Set();
  for (const material of hook.materials) {
    if (!material || seen.has(material.path) || !/^[a-f0-9]{64}$/.test(material.sha256)) return refuse('invalid-material');
    seen.add(material.path);
    let file;
    try { file = materialFile(root, material.path); }
    catch { return refuse('material-unavailable'); }
    if (!file) return refuse('invalid-material-path');
    let bytes;
    try { bytes = fs.readFileSync(file); }
    catch { return refuse('material-unavailable'); }
    if (createHash('sha256').update(bytes).digest('hex') !== material.sha256) return refuse('material-mismatch');
  }
  return {
    status: 'declared-not-installed', installed: false,
    binding: { status: 'unavailable', tool, reason: 'observed-binding-not-provided' },
    intent: {
      label: 'Declared source intent; not an installed or per-tool rendered command',
      id: hook.id, ...hook.source, runtime: hook.runtime, timeoutSeconds: hook.timeoutSeconds,
      invocation: module ? invocation : [hook.runtime.executable, invocation.entrypoint, ...invocation.arguments],
      installation: hook.installation,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = readHookIntent({ id: process.argv[2], tool: process.argv[3] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'refused') process.exitCode = 1;
}
