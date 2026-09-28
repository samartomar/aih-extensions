// Where each supported CLI reads skills, agents, commands and hooks, and how
// this repo's content is adapted for it. Pure: paths and file text come in,
// copy/write operations and edited config text come out. setup.mjs does the I/O.
//
// Each tool must see every skill exactly once, and several tools read each
// other's folders, so every tool gets its own brand folder and nobody gets
// ~/.agents/skills:
//   claude    ~/.claude/skills
//   cursor    nothing of its own: it loads ~/.claude's skills, agents, commands
//             and hooks ("Include Third-Party Plugins, Skills, and Other
//             Configs", on by default) and de-duplicates by folder name
//   codex     ~/.codex/skills (it also reads ~/.agents/skills, not ~/.claude)
//   kimi      ~/.kimi-code/skills (it also reads ~/.agents/skills, not ~/.claude)
//   opencode  reads ~/.claude/skills and ~/.agents/skills and picks a random
//             copy on a name clash, so it gets its own copy only without claude
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TOOLS = ['claude', 'codex', 'cursor', 'kimi', 'opencode'];
export const fwd = (p) => p.split(/[\\/]/).join('/');

export function toolDirs(home, env = {}) {
  return {
    claude: env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'),
    codex: env.CODEX_HOME || path.join(home, '.codex'),
    cursor: path.join(home, '.cursor'),
    kimi: env.KIMI_CODE_HOME || path.join(home, '.kimi-code'),
    opencode: path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'opencode'),
  };
}

// ---------- markdown with frontmatter ----------

export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  return m ? { fm: m[1], body: text.slice(m[0].length) } : { fm: '', body: text };
}

// One scalar value from simple frontmatter (the files here use single-line values).
export function field(fm, key) {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(fm);
  if (!m) return undefined;
  const v = m[1].trim();
  if (v.startsWith('"')) return JSON.parse(v);
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

export const isUserOnly = (skillText) => field(splitFrontmatter(skillText).fm, 'disable-model-invocation') === 'true';

// opencode rejects Claude's `tools:` string and treats an agent without `mode` as primary.
export function opencodeAgent(text) {
  const { fm, body } = splitFrontmatter(text);
  return `---\ndescription: ${JSON.stringify(field(fm, 'description'))}\nmode: subagent\n---\n${body}`;
}

// Codex reads one TOML file per agent. A JSON string is a valid TOML basic string.
export function codexAgent(text) {
  const { fm, body } = splitFrontmatter(text);
  return [
    `name = ${JSON.stringify(field(fm, 'name'))}`,
    `description = ${JSON.stringify(field(fm, 'description'))}`,
    `developer_instructions = ${JSON.stringify(body.trim() + '\n')}`,
    '',
  ].join('\n');
}

// ---------- what goes where ----------

// sources: { skills: [{ name, src }], references: [{ name, src }], agents: [{ name, src, text }], commands: [{ name, src }] }
// Returns operations: { tool, dest, src } to copy, or { tool, dest, content } to write.
export function planFor(tools, dirs, sources, { opencodeCommandDir = 'command' } = {}) {
  const ops = [];
  const skillsAndRefs = (tool, root) => {
    for (const s of sources.skills) ops.push({ tool, dest: path.join(root, 'skills', s.name), src: s.src });
    for (const r of sources.references) ops.push({ tool, dest: path.join(root, 'references', r.name), src: r.src });
  };
  for (const tool of tools) {
    const root = dirs[tool];
    if (tool === 'claude') {
      skillsAndRefs(tool, root);
      for (const a of sources.agents) ops.push({ tool, dest: path.join(root, 'agents', `${a.name}.md`), src: a.src });
      for (const c of sources.commands) ops.push({ tool, dest: path.join(root, 'commands', `${c.name}.md`), src: c.src });
    } else if (tool === 'codex') {
      skillsAndRefs(tool, root);
      for (const a of sources.agents) ops.push({ tool, dest: path.join(root, 'agents', `${a.name}.toml`), content: codexAgent(a.text) });
    } else if (tool === 'kimi') {
      skillsAndRefs(tool, root);
      for (const a of sources.agents) ops.push({ tool, dest: path.join(root, 'agents', `${a.name}.md`), src: a.src });
    } else if (tool === 'opencode') {
      if (!tools.includes('claude')) skillsAndRefs(tool, root);
      for (const a of sources.agents) ops.push({ tool, dest: path.join(root, 'agents', `${a.name}.md`), content: opencodeAgent(a.text) });
      for (const c of sources.commands) ops.push({ tool, dest: path.join(root, opencodeCommandDir, `${c.name}.md`), src: c.src });
    }
  }
  return ops;
}

// ---------- hooks ----------

export function hookEntries(tool, hooksDir) {
  const cmd = (file, ...args) => [`node "${fwd(path.join(hooksDir, file))}"`, ...args].join(' ');
  if (tool === 'claude') {
    return [
      { event: 'PreToolUse', matcher: 'Bash|PowerShell', command: cmd('git-guard.mjs'), timeout: 10 },
      { event: 'PreToolUse', matcher: 'Skill', command: cmd('skill-guard.mjs'), timeout: 10 },
      { event: 'SessionStart', matcher: 'startup|clear|compact', command: cmd('lanes-card.mjs'), timeout: 10 },
    ];
  }
  if (tool === 'codex') {
    // Codex names its shell tool Bash even when it runs PowerShell, and rejects "ask".
    return [
      { event: 'PreToolUse', matcher: '^Bash$', command: cmd('git-guard.mjs', '--no-ask', '--any-shell'), timeout: 10 },
      { event: 'SessionStart', matcher: 'startup|clear|compact', command: cmd('lanes-card.mjs'), timeout: 10 },
    ];
  }
  return [];
}

// Claude's settings.json and Codex's hooks.json share this shape. Appends our
// groups and leaves every existing one (hindsight etc.) untouched. Idempotent.
export function addHooks(config, entries) {
  const next = structuredClone(config);
  next.hooks ??= {};
  for (const e of entries) {
    const groups = (next.hooks[e.event] ??= []);
    if (groups.some((g) => g.hooks?.some((h) => h.command === e.command))) continue;
    groups.push({ matcher: e.matcher, hooks: [{ type: 'command', command: e.command, timeout: e.timeout }] });
  }
  return next;
}

// Removes only hooks whose command contains `marker` (our hooks folder); drops groups and events left empty.
export function removeHooks(config, marker) {
  const next = structuredClone(config);
  let removed = 0;
  for (const [event, groups] of Object.entries(next.hooks ?? {})) {
    const kept = [];
    for (const g of groups) {
      const hooks = (g.hooks ?? []).filter((h) => !(typeof h.command === 'string' && h.command.includes(marker)));
      removed += (g.hooks?.length ?? 0) - hooks.length;
      if (hooks.length) kept.push({ ...g, hooks });
    }
    if (kept.length) next.hooks[event] = kept; else delete next.hooks[event];
  }
  return { next: tidy(next), removed };
}

export function addOverrides(settings, keys) {
  const next = structuredClone(settings);
  next.skillOverrides = { ...(next.skillOverrides ?? {}) };
  const added = keys.filter((k) => !(k in next.skillOverrides));
  for (const k of added) next.skillOverrides[k] = 'off';
  return { next, added };
}

// Only removes a key still set to "off" (a value the user changed is theirs).
export function removeOverrides(settings, keys) {
  const next = structuredClone(settings);
  const removed = keys.filter((k) => next.skillOverrides?.[k] === 'off');
  for (const k of removed) delete next.skillOverrides[k];
  return { next: tidy(next), removed };
}

// Empty containers left behind by us or by a CLI.
export function tidy(config) {
  for (const key of ['hooks', 'skillOverrides', 'enabledPlugins', 'extraKnownMarketplaces']) {
    const v = config[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) delete config[key];
  }
  return config;
}

// ---------- Kimi Code: a marked block in ~/.kimi-code/config.toml ----------

const BEGIN = '# >>> aih-extensions: added by its scripts/setup.mjs, removed by `uninstall`';
const END = '# <<< aih-extensions';
const BLOCK = /\n?# >>> aih-extensions[^\n]*\n[\s\S]*?# <<< aih-extensions[^\n]*(\n|$)/;

export function kimiBlock(hooksDir) {
  // Kimi only understands "deny"; the hook runs through cmd.exe on Windows.
  return [
    '[[hooks]]',
    'event = "PreToolUse"',
    'matcher = "^Bash$"',
    `command = 'node "${fwd(path.join(hooksDir, 'git-guard.mjs'))}" --no-ask'`,
    'timeout = 10',
  ].join('\n');
}

export function removeTomlBlock(text) {
  const next = text.replace(BLOCK, '');
  return { text: next, removed: next !== text };
}

export function addTomlBlock(text, body) {
  const base = removeTomlBlock(text).text;
  return `${base}${base.endsWith('\n') || !base ? '' : '\n'}\n${BEGIN}\n${body.trim()}\n${END}\n`;
}

// ---------- opencode: typed-only skills through permission.skill ----------

// opencode ignores disable-model-invocation; a "deny" hides the skill from the
// model while the user can still type /name.
export function addSkillDenies(config, names) {
  const perm = config.permission;
  if (perm !== undefined && (typeof perm !== 'object' || Array.isArray(perm))) return { next: config, added: [], skipped: 'permission is not an object' };
  const skill = perm?.skill;
  if (skill !== undefined && (typeof skill !== 'object' || Array.isArray(skill))) return { next: config, added: [], skipped: 'permission.skill is not an object' };
  const next = structuredClone(config);
  next.permission = { ...(next.permission ?? {}) };
  next.permission.skill = { ...(skill ?? {}) };
  const added = names.filter((n) => !(n in next.permission.skill));
  for (const n of added) next.permission.skill[n] = 'deny';
  return { next, added };
}

export function removeSkillDenies(config, names) {
  const next = structuredClone(config);
  const skill = next.permission?.skill;
  const removed = skill && typeof skill === 'object' ? names.filter((n) => skill[n] === 'deny') : [];
  for (const n of removed) delete skill[n];
  if (skill && typeof skill === 'object' && !Object.keys(skill).length) delete next.permission.skill;
  if (next.permission && typeof next.permission === 'object' && !Object.keys(next.permission).length) delete next.permission;
  return { next, removed };
}

// The file opencode auto-loads from ~/.config/opencode/plugins. Every export must
// be a function, or opencode drops the whole plugin with only a log line.
export function opencodePluginFile(hooksDir) {
  const url = `file:///${fwd(path.join(hooksDir, 'opencode-plugin.mjs')).replace(/^\/+/, '')}`;
  return [
    '// aih-extensions: added by its scripts/setup.mjs, removed by `uninstall`.',
    `import { createPlugin } from ${JSON.stringify(url)};`,
    'export const AihExtensions = createPlugin();',
    '',
  ].join('\n');
}
