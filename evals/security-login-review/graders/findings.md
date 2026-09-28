---
type: llm
---

PASS only if the reply does ALL of: (1) identifies SQL injection from string concatenation and fixes it with a parameterised query; (2) flags that passwords are stored or compared in plaintext and recommends a slow hash such as bcrypt, scrypt or argon2; (3) flags the missing rate limiting or brute-force protection; (4) flags the session cookie (a predictable user id and/or missing httpOnly, secure or sameSite). FAIL if any of the four is missing.
