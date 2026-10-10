---
description: "A readability refactor that must preserve behaviour."
expected_outcome: "code-simplification is explicitly invoked; the result is simpler with identical behaviour, and the reply says how behaviour was checked."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /code-simplification for this task.

This works but is hard to read. Simplify it without changing behaviour.

```js
function parseFlags(argv) {
  let result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== undefined) {
      if (argv[i].startsWith('--')) {
        if (argv[i].includes('=')) {
          result[argv[i].slice(2).split('=')[0]] = argv[i].slice(2).split('=').slice(1).join('=');
        } else {
          if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
            result[argv[i].slice(2)] = argv[i + 1];
            i = i + 1;
          } else {
            result[argv[i].slice(2)] = true;
          }
        }
      }
    }
  }
  return result;
}
```
