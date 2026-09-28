---
type: llm
---

PASS only if the simplified code keeps ALL of these behaviours: `--a=b=c` gives { a: "b=c" }; `--a b` gives { a: "b" } and consumes b; `--a --b` gives { a: true, b: true }; a trailing `--a` gives { a: true }; arguments not starting with -- that are not consumed as values are ignored. It must also be visibly simpler (less nesting), and the reply must say how behaviour was checked (tests, or a case-by-case comparison). FAIL on any behaviour change, or if no verification is mentioned.
