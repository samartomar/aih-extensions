---
description: "A pre-ship security review of a login handler with several classic flaws."
expected_outcome: "security-and-hardening is explicitly invoked; the reply names SQL injection, plaintext passwords, missing brute-force protection and the weak session cookie, with fixes."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /security-and-hardening for this task.

Review this login handler for security before we ship it.

```js
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const rows = await db.query("SELECT * FROM users WHERE username = '" + username + "'");
  const user = rows[0];
  if (user && user.password === password) {
    res.cookie('session', user.id);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid username ' + username });
});
```
