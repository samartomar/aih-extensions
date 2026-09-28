---
type: llm
---

PASS only if the reply covers ALL of: (1) structured logs with a correlation, charge or request id on each retry; (2) metrics for rate, errors and duration (or equivalent throughput, failure and latency) plus queue depth or age; (3) alerts on user-visible symptoms such as backlog age or success rate, rather than paging on every individual error; (4) keeping card data, tokens or other secrets out of logs. FAIL if any is missing.
