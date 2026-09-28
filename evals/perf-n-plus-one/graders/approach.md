---
type: llm
---

PASS only if the reply does ALL of: (1) identifies the N+1 query pattern (up to 401 queries); (2) replaces it with batched queries (a JOIN, or WHERE id IN (...) lookups), not just caching or Promise.all around the same per-row queries; (3) recommends measuring before and after (a baseline timing or a profile); (4) proposes a performance budget or a regression check so it stays fast. FAIL if any is missing.
