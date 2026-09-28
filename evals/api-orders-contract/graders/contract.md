---
type: llm
---

PASS only if the reply specifies ALL of: (1) a pagination contract for listing (a cursor or page token, with a limit); (2) one consistent error response format with machine-readable codes; (3) a versioning or compatibility strategy (for example /v1, additive-only changes, a deprecation policy); (4) idempotency for order creation (an idempotency key or equivalent) so retries do not create duplicates. FAIL if any is missing.
