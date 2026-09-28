---
description: "Instrumenting a production background worker."
expected_outcome: "observability-and-instrumentation fires; the reply covers structured logs with correlation ids, RED metrics, symptom-based alerts and keeping secrets out of logs."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

We are shipping a payment-retry worker next week: it pulls failed charges from a queue and retries them with backoff. What should we add so that in production we can tell whether it is working, and find out quickly when it is not?
