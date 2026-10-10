---
description: "A slow endpoint with an N+1 query pattern."
expected_outcome: "performance-optimization is explicitly invoked; the reply measures first, batches the queries, and proposes a budget or regression check."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /performance-optimization for this task.

GET /orders takes about 4 seconds for 200 orders. Make it fast.

```js
async function listOrders(db) {
  const orders = await db.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200');
  for (const order of orders) {
    order.customer = (await db.query('SELECT * FROM customers WHERE id = ?', [order.customer_id]))[0];
    order.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  }
  return orders;
}
```
