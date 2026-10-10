---
description: "Writing a README for a small CLI from its source."
expected_outcome: "documentation-and-adrs is explicitly invoked; the README has a working quick start and documents only what the code does."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /documentation-and-adrs for this task.

Write the README for this CLI. Put the complete README in your reply; do not create or edit files.

package.json:
```json
{ "name": "tally", "version": "1.0.0", "bin": { "tally": "bin/tally.js" }, "scripts": { "test": "node --test" } }
```

bin/tally.js:
```js
#!/usr/bin/env node
const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'sum') console.log(args.map(Number).reduce((a, b) => a + b, 0));
else if (cmd === 'count') console.log(args.length);
else { console.error('usage: tally <sum|count> [numbers...]'); process.exit(1); }
```
