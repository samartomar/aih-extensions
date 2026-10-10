---
description: "Designing a public REST API for external clients."
expected_outcome: "api-and-interface-design is explicitly invoked; the reply defines pagination, errors, versioning and idempotency."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /api-and-interface-design for this task.

Design the public REST API for orders: create an order, list orders, cancel an order. External partners will integrate with it, so we cannot break them later.
