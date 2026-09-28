#!/usr/bin/env node
// Install, inspect and clean up Matt Pocock's skills plus the aih-extensions
// add-on for Claude Code, Codex, Cursor, Kimi Code and opencode, WITHOUT plugin
// marketplaces (organizations can disable those). Each tool gets plain files in
// its own folders and the git guard wired into its own hook system; where
// each piece goes is in scripts/tools.mjs. Our own files:
//   ~/.aih-extensions/hooks          hook scripts every tool runs
//   ~/.aih-extensions/manifest.json  what was installed and edited, for exact removal
//
// Or, with --marketplace, Claude Code alone through its plugin system (Matt's
// official listing plus this repo as a marketplace). The two routes never
// coexist: installing one removes the other, because both at once duplicate
// every skill.
//
//   node scripts/setup.mjs status
//   node scripts/setup.mjs install    [--tools claude,codex,cursor,kimi,opencode] [--matt-ref <sha|branch>]
//                                     [--addon-repo <git url> [--addon-ref <ref>]] [--yes]
//   node scripts/setup.mjs install --marketplace [--yes]  Claude Code only
//   node scripts/setup.mjs uninstall  [--all] [--yes]     also removes marketplace-installed copies of either
//   node scripts/setup.mjs remove-gate <repo> [--yes]     take the commit gate out of one repo
//   node scripts/setup.mjs clean      [--yes]             dev leftovers: temp dirs, staging, upstream cache, old backups
//
// --tools defaults to every tool whose config folder exists. Every command
// prints its plan and changes nothing without --yes. Each config file is
// backed up (<file>.aih-bak-<time>) before it is edited.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { upstreams } from './upstream.config.mjs';
import { checkoutPinned, resolveRef } from './git-cache.mjs';
import { UPSTREAM_CACHE } from './paths.mjs';
import {
  TOOLS, fwd, toolDirs, isUserOnly, planFor, hookEntries, addHooks, removeHooks, addOverrides, removeOverrides, tidy,
  kimiBlock, addTomlBlock, removeTomlBlock, addSkillDenies, removeSkillDenies, opencodePluginFile,
} from './tools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const DIRS = toolDirs(HOME, process.env);
const OWN_DIR = process.env.AIH_EXTENSIONS_HOME || path.join(HOME, '.aih-extensions');
const HOOKS_DIR = path.join(OWN_DIR, 'hooks');
const MANIFEST = path.join(OWN_DIR, 'manifest.json');
const MARKER = fwd(HOOKS_DIR);
const CONFIG = {
  claude: path.join(DIRS.claude, 'settings.json'),
  codex: path.join(DIRS.codex, 'hooks.json'),
  kimi: path.join(DIRS.kimi, 'config.toml'),
  opencode: path.join(DIRS.opencode, 'opencode.json'),
};
const OPENCODE_PLUGIN = path.join(DIRS.opencode, 'plugins', 'aih-extensions.js');
const LEGACY = ['aih-extensions@aih-extensions', 'mattpocock-skills@claude-plugins-official'];
const GATE_LINE = /^node \.githooks\/commit-gate\.mjs "\$1"\s*$/;
// aihx-, not aih-: the AI Harness project (aih) fills the temp folder with aih-* dirs of its own.
export const TEMP_PREFIXES = ['aihx-gate-', 'aihx-norepo-', 'aihx-measure-', 'aihx-cli-'];
// A personal `code-review` (Matt's) replaces Claude's built-in one by name, so only
// the built-in `simplify` needs hiding: the add-on's code-simplification owns that job.
const OVERRIDES = ['simplify'];

// ---------- pure helpers (tested) ----------

// Destinations that already exist and are not ours from a previous install.
export function conflicts(plan, exists, owned) {
  const ownedSet = new Set(owned.map((p) => path.resolve(p).toLowerCase()));
  return plan.filter((c) => exists(c.dest) && !ownedSet.has(path.resolve(c.dest).toLowerCase())).map((c) => c.dest);
}

export function stripGateLine(text) {
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((l) => !GATE_LINE.test(l));
  const meaningful = kept.filter((l) => l.trim() && !/^#!/.test(l) && !/^\s*#/.test(l));
  return { text: kept.join('\n'), changed: kept.length !== lines.length, empty: meaningful.length === 0 };
}

// Cursor loads Claude's folders, so it cannot be installed without claude.
export function selectTools(requested, detected) {
  const tools = requested ?? detected;
  const unknown = tools.filter((t) => !TOOLS.includes(t));
  if (unknown.length) throw new Error(`unknown tool(s): ${unknown.join(', ')} (supported: ${TOOLS.join(', ')})`);
  if (tools.includes('cursor') && !tools.includes('claude')) throw new Error('cursor reads the Claude Code folders (skills, agents, commands, hooks), so it needs claude in --tools too');
  return TOOLS.filter((t) => tools.includes(t));
}

// ---------- side effects ----------

const argv = process.argv.slice(2);
const yes = argv.includes('--yes');
const opt = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };
const say = (s) => console.log(s);
const claude = (...args) => spawnSync('claude', args, { encoding: 'utf8' });
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const readText = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
function writeWithBackup(file, text) {
  if (fs.existsSync(file)) {
    const backup = `${file}.aih-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(file, backup);
    say(`   ${path.basename(file)} updated (backup: ${path.basename(backup)})`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    say(`   ${path.basename(file)} created`);
  }
  fs.writeFileSync(file, text);
}
const writeJson = (file, value) => writeWithBackup(file, JSON.stringify(value, null, 2) + '\n');
function step(label, fn) {
  say(`${yes ? '->' : '   would'} ${label}`);
  if (!yes) return;
  const r = fn();
  if (r && r.status !== undefined && r.status !== 0) { console.error(`     failed: ${(r.stderr || r.stdout || '').trim()}`); process.exitCode = 1; }
}
function installedPlugins() {
  const j = readJson(path.join(DIRS.claude, 'plugins', 'installed_plugins.json'), {});
  return Object.fromEntries(Object.entries(j.plugins ?? j).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
const tempLeftovers = () => fs.readdirSync(os.tmpdir()).filter((n) => TEMP_PREFIXES.some((p) => n.startsWith(p))).map((n) => path.join(os.tmpdir(), n));
const detectTools = () => TOOLS.filter((t) => fs.existsSync(DIRS[t]));

// Everything each tool can load: Matt's promoted skills (his plugin.json list) and
// the add-on's skills, references, agents and commands.
function gatherSources(mattDir, addonDir) {
  const list = (dir, ext) => fs.readdirSync(dir).filter((f) => !ext || f.endsWith(ext)).sort();
  const mattSkills = JSON.parse(fs.readFileSync(path.join(mattDir, '.claude-plugin', 'plugin.json'), 'utf8')).skills;
  const skills = [
    ...mattSkills.map((rel) => ({ name: path.basename(rel), src: path.join(mattDir, rel), from: 'matt' })),
    ...list(path.join(addonDir, 'skills')).map((n) => ({ name: n, src: path.join(addonDir, 'skills', n), from: 'addon' })),
  ];
  const names = skills.map((s) => s.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) throw new Error(`skill names shipped by both sources: ${[...new Set(dupes)].join(', ')}`);
  for (const s of skills) s.userOnly = isUserOnly(fs.readFileSync(path.join(s.src, 'SKILL.md'), 'utf8'));
  const md = (dir) => list(path.join(addonDir, dir), '.md').map((f) => ({ name: f.slice(0, -3), src: path.join(addonDir, dir, f) }));
  return {
    skills,
    references: list(path.join(addonDir, 'references')).map((f) => ({ name: f, src: path.join(addonDir, 'references', f) })),
    agents: md('agents').map((a) => ({ ...a, text: fs.readFileSync(a.src, 'utf8') })),
    commands: md('commands'),
  };
}

function removeLegacyPlugins() {
  const inst = installedPlugins(), s = readJson(CONFIG.claude, {});
  for (const id of LEGACY) if (inst[id]) step(`uninstall marketplace plugin ${id}`, () => claude('plugin', 'uninstall', id));
  if (s.extraKnownMarketplaces?.['aih-extensions']) step('remove the aih-extensions marketplace', () => claude('plugin', 'marketplace', 'remove', 'aih-extensions'));
  const base = path.join(DIRS.claude, 'plugins');
  const leftovers = [path.join(base, 'cache', 'aih-extensions'), path.join(base, 'marketplaces', 'aih-extensions'), path.join(base, 'cache', 'claude-plugins-official', 'mattpocock-skills')];
  const data = path.join(base, 'data');
  if (fs.existsSync(data)) for (const n of fs.readdirSync(data)) if (/aih-extensions|mattpocock-skills/.test(n)) leftovers.push(path.join(data, n));
  for (const p of leftovers.filter((p) => fs.existsSync(p))) step(`delete marketplace leftover ${p}`, () => fs.rmSync(p, { recursive: true, force: true }));
  if (yes && fs.existsSync(CONFIG.claude)) { const cur = readJson(CONFIG.claude, {}); const t = tidy(structuredClone(cur)); if (JSON.stringify(t) !== JSON.stringify(cur)) writeJson(CONFIG.claude, t); }
}

// Undo every config edit this repo makes. Works from the manifest when there is
// one, and by marker otherwise, so a lost manifest still cleans up.
function removeConfigEdits(m) {
  const cs = readJson(CONFIG.claude, null);
  if (cs) {
    const { removed } = removeHooks(cs, MARKER);
    const { removed: ov } = removeOverrides(cs, m?.overrides ?? []);
    if (removed || ov.length) step(`remove ${removed} hook(s) and skillOverrides [${ov.join(', ')}] from ${CONFIG.claude}`, () => writeJson(CONFIG.claude, removeOverrides(removeHooks(readJson(CONFIG.claude, {}), MARKER).next, m?.overrides ?? []).next));
  }
  const ch = readJson(CONFIG.codex, null);
  if (ch) {
    const { next, removed } = removeHooks(ch, MARKER);
    if (removed) {
      const empty = !Object.keys(next).length && m?.createdFiles?.includes(CONFIG.codex);
      step(`remove ${removed} hook(s) from ${CONFIG.codex}${empty ? ' (and the file, which install created)' : ''}`, () => (empty ? fs.rmSync(CONFIG.codex) : writeJson(CONFIG.codex, next)));
    }
  }
  const kt = readText(CONFIG.kimi);
  if (removeTomlBlock(kt).removed) step(`remove the aih-extensions [[hooks]] block from ${CONFIG.kimi}`, () => writeWithBackup(CONFIG.kimi, removeTomlBlock(readText(CONFIG.kimi)).text));
  const oc = readJson(CONFIG.opencode, null);
  if (oc && m?.skillDenies?.length) {
    const { removed } = removeSkillDenies(oc, m.skillDenies);
    if (removed.length) step(`remove ${removed.length} permission.skill deny entries from ${CONFIG.opencode}`, () => writeJson(CONFIG.opencode, removeSkillDenies(readJson(CONFIG.opencode, {}), m.skillDenies).next));
  }
  if (fs.existsSync(OPENCODE_PLUGIN) && readText(OPENCODE_PLUGIN).startsWith('// aih-extensions:')) step(`delete ${OPENCODE_PLUGIN}`, () => fs.rmSync(OPENCODE_PLUGIN));
}

function removeInstalled(m) {
  if (m.mode === 'marketplace') removeLegacyPlugins();
  for (const p of m.files ?? []) if (fs.existsSync(p)) step(`delete ${p}`, () => fs.rmSync(p, { recursive: true, force: true }));
  removeConfigEdits(m);
  for (const f of m.createdFiles ?? []) {
    if (yes ? fs.existsSync(f) && /^\s*(\{\s*\})?\s*$/.test(readText(f)) : fs.existsSync(f)) step(`delete ${f} if it is left empty (install created it)`, () => { if (/^\s*(\{\s*\})?\s*$/.test(readText(f))) fs.rmSync(f); });
  }
  for (const d of (m.createdDirs ?? []).slice().reverse()) {
    if (fs.existsSync(d) && !fs.readdirSync(d).length) step(`delete empty ${d}`, () => fs.rmdirSync(d));
  }
}

function cursorThirdParty() {
  const base = process.platform === 'win32' ? process.env.APPDATA : process.platform === 'darwin' ? path.join(HOME, 'Library', 'Application Support') : path.join(HOME, '.config');
  const db = path.join(base ?? '', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  if (!fs.existsSync(db)) return 'unknown (no Cursor settings found)';
  try {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
    const conn = new DatabaseSync(db, { readOnly: true });
    const rows = conn.prepare("SELECT value FROM ItemTable WHERE key LIKE '%hirdPartyExtensibility%'").all();
    conn.close();
    return rows.some((r) => String(r.value).includes('false')) ? 'OFF: turn on "Include Third-Party Plugins, Skills, and Other Configs"' : 'on';
  } catch { return 'unknown (could not read Cursor settings)'; }
}

function status() {
  const m = readJson(MANIFEST, null);
  if (m?.mode === 'marketplace') say(`marketplace install   ${m.installedAt} (Claude Code only)`);
  else if (m) {
    say(`direct install        ${m.installedAt}`);
    say(`  Matt's skills       ${m.matt.repo} @${m.matt.sha.slice(0, 7)} (${m.counts.matt} skills)`);
    say(`  aih-extensions      ${m.addon.source} @${m.addon.sha.slice(0, 7)}${m.addon.dirty ? ' (uncommitted changes)' : ''} (${m.counts.addon} skills)`);
    for (const tool of m.tools) {
      const items = m.items.filter((i) => i.tool === tool);
      const present = items.filter((i) => fs.existsSync(i.dest)).length;
      say(`  ${tool.padEnd(10)}        ${items.length ? `${present}/${items.length} files` : 'no files of its own'}`);
    }
  } else say('install               none recorded');
  const count = (file) => JSON.stringify(readJson(file, {}).hooks ?? {}).split(MARKER).length - 1;
  say(`claude hooks          ${count(CONFIG.claude)} in settings.json; skillOverrides ${JSON.stringify(readJson(CONFIG.claude, {}).skillOverrides ?? {})}`);
  say(`codex hooks           ${count(CONFIG.codex)} in hooks.json${count(CONFIG.codex) ? ' (Codex runs them once trusted: open `codex`, then /hooks)' : ''}`);
  say(`kimi hooks            ${removeTomlBlock(readText(CONFIG.kimi)).removed ? 'block present in config.toml' : 'none'}`);
  const denies = Object.values(readJson(CONFIG.opencode, {}).permission?.skill ?? {}).filter((v) => v === 'deny').length;
  say(`opencode              plugin ${fs.existsSync(OPENCODE_PLUGIN) ? 'present' : 'absent'}; ${denies} skill deny entries`);
  for (const k of ['OPENCODE_DISABLE_CLAUDE_CODE', 'OPENCODE_DISABLE_CLAUDE_CODE_SKILLS', 'OPENCODE_DISABLE_EXTERNAL_SKILLS']) if (process.env[k]) say(`  warning: ${k} is set, so opencode skips ~/.claude/skills`);
  if (fs.existsSync(DIRS.cursor)) say(`cursor                loads ~/.claude through its third-party import: ${cursorThirdParty()}`);
  say(`marketplace plugins   ${LEGACY.filter((id) => installedPlugins()[id]).join(', ') || 'none'}`);
  say(`upstream cache        ${fs.existsSync(UPSTREAM_CACHE) ? UPSTREAM_CACHE : 'none'}`);
  say(`temp leftovers        ${tempLeftovers().length}`);
}

function install() {
  return argv.includes('--marketplace') ? installMarketplace() : installDirect();
}

// Plugin route, Claude Code only: Matt from the official marketplace (which fetches his
// GitHub repo at the listing's pin), the add-on through this folder (or --addon-repo)
// added as a marketplace. Plugin skills are namespaced, so the built-in `code-review`
// must be hidden too.
function installMarketplace() {
  const previous = readJson(MANIFEST, null);
  if (previous && previous.mode !== 'marketplace') { say(`${yes ? '->' : '   would'} remove the direct install first`); if (yes) removeInstalled(previous); }
  const inst = installedPlugins();
  if (!inst[LEGACY[1]]) step(`install ${LEGACY[1]} (github.com/mattpocock/skills via the official marketplace)`, () => claude('plugin', 'install', LEGACY[1]));
  if (!inst[LEGACY[0]]) {
    const source = opt('--addon-repo') ?? ROOT;
    step(`add the aih-extensions marketplace from ${source}`, () => claude('plugin', 'marketplace', 'add', source));
    step(`install ${LEGACY[0]}`, () => claude('plugin', 'install', LEGACY[0]));
  }
  const keys = ['code-review', 'simplify'];
  const { added } = addOverrides(readJson(CONFIG.claude, {}), keys);
  if (added.length) step(`set skillOverrides [${added.join(', ')}]`, () => writeJson(CONFIG.claude, addOverrides(readJson(CONFIG.claude, {}), keys).next));
  step(`write ${MANIFEST}`, () => {
    fs.mkdirSync(OWN_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST, JSON.stringify({ mode: 'marketplace', installedAt: new Date().toISOString(), files: [OWN_DIR], overrides: [...new Set([...(previous?.mode === 'marketplace' ? previous.overrides : []), ...added])] }, null, 2) + '\n');
  });
  say('\nStart a new Claude session to load the plugins. After changing what the add-on loads, bump its version, then `claude plugin update aih-extensions`.');
}

function installDirect() {
  let tools;
  try { tools = selectTools(opt('--tools')?.split(',').map((t) => t.trim()).filter(Boolean), detectTools()); } catch (e) { console.error(e.message); process.exit(2); }
  if (!tools.length) { console.error(`No supported tool found (looked for ${TOOLS.map((t) => DIRS[t]).join(', ')}). Pass --tools.`); process.exit(1); }

  // Sources: Matt from GitHub at the tested pin (or --matt-ref); the add-on from this folder or --addon-repo.
  const mattSha = opt('--matt-ref') ? resolveRef(upstreams.matt.repo, opt('--matt-ref')) : upstreams.matt.sha;
  say(`Matt's skills from ${upstreams.matt.repo} @${mattSha.slice(0, 7)}`);
  const mattDir = checkoutPinned('matt', { repo: upstreams.matt.repo, sha: mattSha });
  let addonDir = ROOT, addon;
  if (opt('--addon-repo')) {
    const repo = opt('--addon-repo'), sha = resolveRef(repo, opt('--addon-ref') ?? 'HEAD');
    addonDir = checkoutPinned('aih-extensions', { repo, sha });
    addon = { source: repo, sha, dirty: false };
  } else {
    const g = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
    addon = { source: fwd(ROOT), sha: g('rev-parse', 'HEAD'), dirty: g('status', '--porcelain', '--', 'skills', 'agents', 'commands', 'references', 'hooks') !== '' };
  }
  say(`aih-extensions from ${addon.source} @${addon.sha.slice(0, 7)}${addon.dirty ? ' (with uncommitted changes)' : ''}`);
  say(`tools: ${tools.join(', ')}\n`);

  const previous = readJson(MANIFEST, null);
  const sources = gatherSources(mattDir, addonDir);
  const ocCommands = fs.existsSync(path.join(DIRS.opencode, 'command')) && !fs.existsSync(path.join(DIRS.opencode, 'commands')) ? 'command' : 'commands';
  const plan = planFor(tools, DIRS, sources, { opencodeCommandDir: ocCommands });
  if (tools.includes('opencode')) plan.push({ tool: 'opencode', dest: OPENCODE_PLUGIN, content: opencodePluginFile(HOOKS_DIR) });
  const clash = conflicts(plan, fs.existsSync, previous?.files ?? []);
  if (clash.length) {
    console.error(`Stopped: these already exist and were not installed by aih-extensions:\n  ${clash.join('\n  ')}\nRename or remove them, then run install again.`);
    process.exit(1);
  }
  const oc = tools.includes('opencode') ? readJson(CONFIG.opencode, {}) : null;
  const userOnly = sources.skills.filter((s) => s.userOnly).map((s) => s.name);
  const denies = oc ? addSkillDenies(oc, userOnly) : null;
  if (denies?.skipped) { console.error(`Stopped: cannot add typed-only skills to ${CONFIG.opencode}: ${denies.skipped}.`); process.exit(1); }

  removeLegacyPlugins(); // a marketplace copy alongside the direct install would duplicate every skill
  if (previous) { say(`${yes ? '->' : '   would'} replace the previous install (${previous.addon?.sha?.slice(0, 7) ?? previous.mode})`); if (yes) removeInstalled(previous); }

  const roots = [...new Set([OWN_DIR, ...plan.map((c) => path.dirname(c.dest))])];
  const createdDirs = roots.filter((d) => !fs.existsSync(d) || previous?.createdDirs?.includes(d));
  const createdFiles = [CONFIG.codex, CONFIG.kimi, CONFIG.opencode].filter((f, i) => tools.includes(['codex', 'kimi', 'opencode'][i]) && (!fs.existsSync(f) || previous?.createdFiles?.includes(f)));
  for (const tool of tools) {
    const ops = plan.filter((c) => c.tool === tool);
    if (!ops.length) { say(`   ${tool}: nothing to copy (${tool === 'cursor' ? 'loads the Claude Code folders' : 'uses the Claude Code skills folder'})`); continue; }
    step(`${tool}: ${ops.filter((c) => c.src).length} copies and ${ops.filter((c) => c.content).length} generated files under ${DIRS[tool]}`, () => {
      for (const c of ops) {
        fs.mkdirSync(path.dirname(c.dest), { recursive: true });
        if (c.src) fs.cpSync(c.src, c.dest, { recursive: true });
        else fs.writeFileSync(c.dest, c.content);
      }
    });
  }
  step(`copy the hook scripts to ${HOOKS_DIR}`, () => fs.cpSync(path.join(addonDir, 'hooks'), HOOKS_DIR, { recursive: true, filter: (s) => !s.endsWith('hooks.json') }));

  let overrides = [];
  if (tools.includes('claude')) {
    overrides = addOverrides(readJson(CONFIG.claude, {}), OVERRIDES).added;
    step(`claude: add 3 hooks (git-guard, skill-guard, lanes-card) and skillOverrides [${overrides.join(', ')}] to ${CONFIG.claude}`, () =>
      writeJson(CONFIG.claude, addOverrides(addHooks(readJson(CONFIG.claude, {}), hookEntries('claude', HOOKS_DIR)), OVERRIDES).next));
  }
  if (tools.includes('codex')) {
    step(`codex: add 2 hooks (git-guard, lanes-card) to ${CONFIG.codex}`, () => writeJson(CONFIG.codex, addHooks(readJson(CONFIG.codex, {}), hookEntries('codex', HOOKS_DIR))));
  }
  if (tools.includes('kimi')) {
    step(`kimi: add a [[hooks]] block (git-guard) to ${CONFIG.kimi}`, () => writeWithBackup(CONFIG.kimi, addTomlBlock(readText(CONFIG.kimi), kimiBlock(HOOKS_DIR))));
  }
  if (tools.includes('opencode')) {
    step(`opencode: deny ${denies.added.length} typed-only skills to the model in ${CONFIG.opencode} (still typeable as /name)`, () =>
      writeJson(CONFIG.opencode, addSkillDenies(readJson(CONFIG.opencode, {}), userOnly).next));
  }
  step(`write ${MANIFEST}`, () => fs.writeFileSync(MANIFEST, JSON.stringify({
    version: 2,
    installedAt: new Date().toISOString(),
    matt: { repo: upstreams.matt.repo, sha: mattSha },
    addon,
    tools,
    counts: { matt: sources.skills.filter((s) => s.from === 'matt').length, addon: sources.skills.filter((s) => s.from === 'addon').length },
    items: plan.map((c) => ({ tool: c.tool, dest: c.dest })),
    files: [...plan.map((c) => c.dest), OWN_DIR],
    overrides: [...new Set([...(previous?.overrides ?? []), ...overrides])],
    skillDenies: [...new Set([...(previous?.skillDenies ?? []), ...(denies?.added ?? [])])],
    createdDirs,
    createdFiles,
  }, null, 2) + '\n'));

  say('\nStart a new session in each tool to load the skills and hooks.');
  if (tools.includes('codex')) say('Codex runs new hooks only after you trust them: open `codex` once and accept them (or review with /hooks).');
  if (tools.includes('cursor')) say(`Cursor loads ~/.claude through its third-party import: ${cursorThirdParty()}.`);
  say('Per repo: /setup-matt-pocock-skills, then /install-commit-gate.');
}

function uninstall() {
  const m = readJson(MANIFEST, null);
  if (m) removeInstalled(m);
  else { say('   no install recorded (no manifest); removing anything found by marker'); removeConfigEdits(null); }
  removeLegacyPlugins();
  if (argv.includes('--all')) clean();
  say('Repos with the commit gate keep it until you run: node scripts/setup.mjs remove-gate <repo>');
}

function removeGate() {
  const repo = argv.find((a, i) => i > 0 && !a.startsWith('--'));
  if (!repo) { console.error('usage: setup.mjs remove-gate <repo> [--yes]'); process.exit(2); }
  const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  const root = git('rev-parse', '--show-toplevel').stdout.trim();
  if (!root) { console.error(`${repo} is not a git repo`); process.exit(1); }
  const hooksPath = git('config', 'core.hooksPath').stdout.trim();
  const candidates = [path.join(root, '.husky', 'commit-msg'), hooksPath && path.resolve(root, hooksPath, 'commit-msg'), path.resolve(root, git('rev-parse', '--git-path', 'hooks/commit-msg').stdout.trim())].filter(Boolean);
  for (const f of [...new Set(candidates)]) {
    if (!fs.existsSync(f)) continue;
    const { text, changed, empty } = stripGateLine(fs.readFileSync(f, 'utf8'));
    if (!changed) continue;
    if (empty && !f.includes(`${path.sep}.husky${path.sep}`)) step(`delete ${f} (it only ran the gate)`, () => fs.rmSync(f));
    else step(`remove the gate line from ${f}`, () => fs.writeFileSync(f, text));
  }
  const gate = path.join(root, '.githooks', 'commit-gate.mjs');
  if (fs.existsSync(gate)) step(`delete ${gate}`, () => fs.rmSync(gate));
  say('If .githooks/commit-gate.mjs was committed, commit its removal too.');
}

function clean() {
  const leftovers = tempLeftovers();
  step(`delete ${leftovers.length} temp dirs (${TEMP_PREFIXES.join('*, ')}*) in ${os.tmpdir()}`, () => leftovers.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const staging = path.join(ROOT, '.vendor-staging');
  if (fs.existsSync(staging)) step(`delete ${staging}`, () => fs.rmSync(staging, { recursive: true, force: true }));
  if (fs.existsSync(UPSTREAM_CACHE)) step(`delete the upstream cache ${path.dirname(UPSTREAM_CACHE)} (re-fetched on demand)`, () => fs.rmSync(path.dirname(UPSTREAM_CACHE), { recursive: true, force: true }));
  // Backups this script made, per edited file: keep the newest one.
  for (const file of Object.values(CONFIG)) {
    const dir = path.dirname(file), base = path.basename(file);
    if (!fs.existsSync(dir)) continue;
    const ours = fs.readdirSync(dir).filter((n) => n.startsWith(`${base}.aih-bak-`) || (file === CONFIG.claude && /^settings\.json\.bak-\d{4}-\d\d-\d\dT/.test(n)));
    const byTime = ours.sort((a, b) => a.replace(/^.*bak-/, '').localeCompare(b.replace(/^.*bak-/, '')));
    const old = byTime.slice(0, -1);
    if (old.length) step(`delete ${old.length} older ${base} backup(s) this script made (keeping ${byTime.at(-1)})`, () => old.forEach((n) => fs.rmSync(path.join(dir, n))));
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invoked) {
  const commands = { status, install, uninstall, 'remove-gate': removeGate, clean };
  const cmd = commands[argv[0]];
  if (!cmd) { console.error(`usage: setup.mjs <${Object.keys(commands).join('|')}> [--yes]`); process.exit(2); }
  if (!yes && argv[0] !== 'status') say('Dry run: nothing will change. Re-run with --yes to apply.\n');
  cmd();
}
