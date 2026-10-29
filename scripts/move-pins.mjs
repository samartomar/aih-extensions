// Move upstream pins by exact text, so nothing else in the files changes: each
// pin is written once as sha: '<40 hex>' in upstream.config.mjs and once as
// "sha": "<40 hex>" in source-declarations/v1.json, whose declared provenance
// must keep matching the config (scripts/source-declarations.mjs check).
import fs from 'node:fs';
import path from 'node:path';

const FILES = [
  { file: 'scripts/upstream.config.mjs', pin: (sha) => `sha: '${sha}'` },
  { file: 'source-declarations/v1.json', pin: (sha) => `"sha": "${sha}"` },
];

// moves: [{ name, pinned, latest }]. Checks every file before writing any.
export function movePins({ root, moves }) {
  const updated = FILES.map(({ file, pin }) => {
    let text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const u of moves) {
      if (text.split(pin(u.pinned)).length !== 2) throw new Error(`the ${u.name} pin is not written once as ${pin(u.pinned)} in ${file}`);
      text = text.replace(pin(u.pinned), pin(u.latest));
    }
    return { file, text };
  });
  for (const { file, text } of updated) fs.writeFileSync(path.join(root, file), text);
}
