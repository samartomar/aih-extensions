// opencode adapter: the same git policy as git-guard.mjs, and the routing note
// from lanes.md in the system prompt. setup.mjs writes a one-line plugin into
// ~/.config/opencode/plugins that imports createPlugin from here.
// opencode plugins block by throwing and cannot ask, so a push is refused with
// an explanation instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkShell, shellsFor } from './lib/git-policy.mjs';

const LANES = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'lanes.md'), 'utf8').trim();

export function verdictFor(tool, args, platform = process.platform) {
  if (tool !== 'bash') return null;
  const v = checkShell(String(args?.command ?? ''), { shells: shellsFor('Shell', platform) });
  if (!v) return null;
  return `aih-extensions git-guard: ${v.reason}${v.decision === 'ask' ? ' opencode cannot pause to ask, so it is refused: ask the user to run it.' : ''}`;
}

export function createPlugin() {
  return async () => ({
    'tool.execute.before': async (input, output) => {
      const reason = verdictFor(input?.tool, output?.args);
      if (reason) throw new Error(reason);
    },
    'experimental.chat.system.transform': async (_input, output) => {
      if (Array.isArray(output?.system) && !output.system.includes(LANES)) output.system.push(LANES);
    },
  });
}
