# Evals

Each folder here is one `claude plugin eval` case: a prompt, run with and without the add-on, graded on whether the expected skill fired and on the answer's content. These are advisory model measurements for prompt-loaded changes, separate from the required deterministic [checks](../docs/maintaining.md#checks). They require paid model access.

```bash
claude plugin eval . --runs 2 --no-publish
```

## Results

2026-09-27, Sonnet, 2 runs per arm, $2.62. A score is the share of runs that passed a strict content grader.

| Case | With | Without | Skill fired |
|---|---|---|---|
| Observability for a payment worker | 1.0 | 0.5 | 2/2 |
| Security review of a login handler | 1.0 | 1.0 | 2/2 |
| Public REST API contract | 1.0 | 1.0 | 2/2 |
| N+1 performance fix | 0 | 0 | 1/2 |
| Simplify a parser | 0 | 0 | 2/2 |
| README from source | 0 | 0.5 | 2/2 |
| Rename (nothing should fire) | 1.0 | 1.0 | 0/2, correct |
| Module design (the API skill should stay quiet) | 1.0 | 1.0 | 0/2, correct |

What it supports:

- **Routing is right.** The expected skill fired in 11 of 12 runs, and stayed quiet in all 4 runs where it shouldn't fire.
- **Only observability measurably beat the plain model in this sample**, so it and `shipping-and-launch` (behind `/ship`) are the only specialists that start on their own. The rest run only when typed; promoting one in [`scripts/upstream.config.mjs`](../scripts/upstream.config.mjs) requires a fresh with-and-without eval showing a gain.
- **The sample is small.** With two runs per arm, one run moves a score by 0.5. The two cases at 0 in both arms say nothing either way. The README case let the model write a file the grader never saw; it now asks for the text in the reply, and hasn't been re-run.

## Context cost

`npm run context` starts Claude Code headless with and without the add-on (skill-listing cap lifted) and compares input tokens. The **2026-09-27 snapshot** measured **576 added tokens** per session on top of Matt's skills, which added about 370 in that run. Typed-only skills were not listed to the model. This is a historical result, not a measurement of the current checkout.

Record fresh successful results with their date and conditions before claiming a new context cost. An unavailable or failed run supplies no measurement; retain the previous dated snapshot rather than substituting zero. Model access or quota does not block unrelated hook, installer or maintainer changes.
