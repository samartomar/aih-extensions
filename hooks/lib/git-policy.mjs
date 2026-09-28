// Which git commands an agent may run on its own. Shared by every CLI's
// adapter (hooks/git-guard.mjs for command hooks, hooks/opencode-plugin.mjs).
import { gitCommands, hasFlag } from './shell.mjs';

const YOURSELF = 'Run it yourself in a terminal if you really mean it.';
const everyPath = (args) => args.some((a) => a === '.' || a === ':/' || a === '*' || a === ':(top)');

function verdict({ sub, args, config }) {
  const shown = `\`git ${sub} ${args.join(' ')}\``.replace(/ `$/, '`');
  if (config.some((kv) => /^core\.hookspath=/i.test(kv))) return ['deny', `${shown} overrides core.hooksPath, which skips the repo's commit hooks. ${YOURSELF}`];
  switch (sub) {
    case 'push':
      if (hasFlag(args, '--dry-run', 'n')) return null;
      if (hasFlag(args, '--force', 'f') || hasFlag(args, '--delete', 'd') || hasFlag(args, '--mirror') || hasFlag(args, '--prune')
        || args.some((a) => a.startsWith('--force-with-lease') || a === '--force-if-includes' || /^[+:]/.test(a))) {
        return ['deny', `${shown} rewrites or deletes remote history. ${YOURSELF}`];
      }
      return ['ask', `${shown} publishes commits to a remote.`];
    case 'commit':
      return hasFlag(args, '--no-verify', 'n') ? ['deny', `${shown} skips the repo's commit hooks, including the commit gate. Fix what the hook reports instead.`] : null;
    case 'reset':
      return hasFlag(args, '--hard') || hasFlag(args, '--merge') ? ['deny', `${shown} throws away uncommitted work. Use \`git stash\` (recoverable) or \`git revert\`. ${YOURSELF}`] : null;
    case 'clean':
      return !hasFlag(args, '--dry-run', 'n') && hasFlag(args, '--force', 'f') ? ['deny', `${shown} deletes untracked files permanently. \`git clean -n\` lists them first. ${YOURSELF}`] : null;
    case 'branch':
      return hasFlag(args, '--force', 'f') || hasFlag(args, null, 'D') || hasFlag(args, null, 'M') || hasFlag(args, null, 'C')
        ? ['deny', `${shown} force-deletes, force-moves or overwrites a branch, which can orphan commits. Use \`git branch -d\`, or a new branch name. ${YOURSELF}`] : null;
    case 'checkout':
      return hasFlag(args, '--force', 'f') || hasFlag(args, null, 'B') || everyPath(args)
        ? ['deny', `${shown} discards local changes or resets a branch. ${YOURSELF}`] : null;
    case 'switch':
      return hasFlag(args, '--force', 'f') || hasFlag(args, '--discard-changes') || hasFlag(args, '--force-create', 'C')
        ? ['deny', `${shown} discards local changes or resets a branch. ${YOURSELF}`] : null;
    case 'restore':
      if (hasFlag(args, '--staged', 'S') && !hasFlag(args, '--worktree', 'W')) return null;
      return everyPath(args) ? ['deny', `${shown} discards local changes across the tree. ${YOURSELF}`] : null;
    case 'stash':
      if (args[0] === 'clear') return ['deny', `\`git stash clear\` drops every stash. ${YOURSELF}`];
      if (args[0] === 'drop') return ['ask', '`git stash drop` deletes a stash entry.'];
      return null;
    default:
      return null;
  }
}

// null (allow) or { decision: 'deny' | 'ask', reason }. A deny anywhere in the
// command wins over an ask.
export function checkCommand(command, { powershell = false } = {}) {
  const text = String(command ?? '');
  // Fast path: no git and no base64-encoded PowerShell command anywhere.
  if (!/git/i.test(text) && !/\s-(e|ec|enc|encodedcommand)\s/i.test(text)) return null;
  let asked = null;
  for (const c of gitCommands(text, { powershell })) {
    const v = verdict(c);
    if (v?.[0] === 'deny') return { decision: 'deny', reason: v[1] };
    if (v?.[0] === 'ask') asked ??= { decision: 'ask', reason: v[1] };
  }
  return asked;
}

// For a tool whose shell is not known for sure (Cursor's `Shell` on Windows
// can be PowerShell or Git Bash), read the command both ways; the stricter wins.
export function checkShell(command, { shells = ['bash'] } = {}) {
  let result = null;
  for (const shell of shells) {
    const v = checkCommand(command, { powershell: shell === 'powershell' });
    if (v?.decision === 'deny') return v;
    result ??= v;
  }
  return result;
}

// Which shells a hook's tool name implies.
export function shellsFor(toolName, platform = process.platform) {
  if (toolName === 'PowerShell') return ['powershell'];
  if (toolName === 'Bash') return ['bash'];
  return platform === 'win32' ? ['bash', 'powershell'] : ['bash'];
}

// A command given as an argv array (["bash", "-lc", "git push -f"]), rejoined
// with bash quoting so the nested-shell unwrapping in shell.mjs still applies.
export function joinArgv(argv) {
  return argv.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${String(a).replace(/'/g, `'\\''`)}'`)).join(' ');
}
