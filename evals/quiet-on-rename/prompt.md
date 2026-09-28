---
description: "A mechanical rename: no specialist should fire."
expected_outcome: "The agent just performs the rename; neither code-simplification nor security-and-hardening fires."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Rename the variable tmp to totalCents in this function, nothing else.

```js
function total(items) { let tmp = 0; for (const i of items) tmp += i.cents; return tmp; }
```
