---
description: "An in-codebase module design question: codebase-design territory, not the network API skill."
expected_outcome: "api-and-interface-design does not fire."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

OrderService has 14 public methods and every caller uses a different subset. Where should the seam go so the module gets deeper and easier to test? Just discuss the design, no code yet.
