# Evals

Each folder here is one `claude plugin eval` case: a prompt, run with and without the add-on, graded on whether the expected skill fired and on the answer's content. These are advisory model measurements for prompt-loaded changes, separate from the required deterministic [checks](../docs/maintaining.md#checks). They require paid model access.

```bash
claude plugin eval . --runs 2 --no-publish
```

The typed-only cases explicitly request their skill. Quiet cases test that unrelated
specialists remain unused; observability retains its automatic trigger. These
current prompts have not been remeasured. Their results must not be compared with
the historical routing counts below as if the invocation conditions were unchanged.

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

- **Routing in that sample:** the expected skill fired in 11 of 12 runs and stayed quiet in all 4 unrelated runs.
- **Only observability measurably beat the plain model in this sample**, so it and `shipping-and-launch` (behind `/ship`) are the only specialists that start on their own. The rest run only when typed; promoting one in [`scripts/upstream.config.mjs`](../scripts/upstream.config.mjs) requires a fresh with-and-without eval showing a gain.
- **The sample is small.** With two runs per arm, one run moves a score by 0.5. The two cases at 0 in both arms say nothing either way. The README case let the model write a file the grader never saw; it now asks for the text in the reply, and hasn't been re-run.

## Context cost

`npm run context` starts Claude Code headless with and without the add-on (skill-listing cap lifted) and compares input tokens. The **2026-09-27 snapshot** measured **576 added tokens** per session on top of Matt's skills, which added about 370 in that run. Typed-only skills were not listed to the model. This is a historical result, not a measurement of the current checkout.

Record fresh successful results with their date and conditions before claiming a new context cost. An unavailable or failed run supplies no measurement; retain the previous dated snapshot rather than substituting zero. Model access or quota does not block unrelated hook, installer or maintainer changes.

## Ask AIH Guide (2026-10-11)

Guide recovery conversations and the saved-manual fallback were exercised with
Kimi Code 2.1.1 / K3 on Windows; see [bounded evidence](../docs/guide-evidence.md).
They are scenario evidence, not a with-and-without effectiveness measurement.
Claude Code 2.1.296 model startup returned revoked OAuth / HTTP 401, so fresh
Claude advisory context/eval measurements were unavailable and were not run.
The historical context snapshot above remains historical; no new effectiveness,
context-cost or auto-invocation-promotion claim is made.

## line-edit (2026-11-27)

Two informal with-and-without trials, run headless with Claude Code 2.1.330 and
Claude Opus 5.5 at medium effort, one run per arm, outside `claude plugin eval`.
The with arm read a draft of the skill as a file. The plain arm was told to make
the writing clear, crisp and precise, with no wasted words, and to lose no
information. Facts and defects were scored with a regular-expression script and
then read by hand, not with this case's grader.

| Document | Arm | Words after | Facts kept | Planted defects fixed | Content decisions |
|---|---|---|---|---|---|
| The [`line-edit`](line-edit/prompt.md) case: 338 words, 14 facts, 8 planted defects | with | 167 | 14 of 14 | 8 of 8 | one, reported: it reworded a claim it doubted. It wrote out a 20-line inventory, kept the link that does not resolve and reported it |
| | plain | 159 | 14 of 14 | 8 of 8 | three: removed that link, moved a warning so it covers every run, added a placeholder the source lacks |
| [`docs/maintaining.md`](../docs/maintaining.md): 1,036 words, already dense | with, earlier draft | 1,040 | not graded | none planted | none; the agent skipped the written inventory, which step 2 now requires |
| | plain | 1,039 | not graded | none planted | none |

What it supports: in this sample the skill did not make the result shorter than a
well-worded plain instruction. In the one run on the case, the with arm showed
where each fact went and left the link and the warning to the user. It reworded
one claim it doubted and said so; step 6 now has such a claim left as written.
The skill's verify step gained a second check after these runs, so they did not
exercise the final text. One run per arm is scenario evidence, not an
effectiveness measurement. The `claude plugin eval` runs below came later.

The first typed run after the skill shipped, on a 3,000-word research note, was
stopped by its user. Before the first edit the agent had searched the whole
workspace for files pointing at the note, for a style guide and for a link
checker. The skill now names where each lookup stops, and verifies the edit
only: not the document's claims, and not its links to the web.

### With-and-without eval (2026-11-28 UTC)

Two `claude plugin eval` runs of this case: Claude Code 2.1.330,
`--model claude-opus-5-5`, five runs per arm, the default judge, source at `f92b445`,
$2.41 together. A score is the share of runs that passed the strict grader.

| Run | First line of the prompt | With | Without | Skill loaded |
|---|---|---|---|---|
| 1 | "Use /line-edit for this task." | 0.2 | 0 | 1 of 5 |
| 2 | The current first line, which names the Skill tool | 1.0 | 0 | 5 of 5 |

In run 1 the model answered, in four of the five with-runs, that `/line-edit` was not
in its list of skills, and edited by hand. A typed-only skill is not listed to the
model, and in a headless prompt `/line-edit` is text, not a command. The case's first
line now tells the model to load the skill with the Skill tool. The other typed-only
cases have not been checked for the same weakness.

Across both runs the skill loaded in 6 runs and not in 14. All 20 replies were read by
hand and measured with a script:

| | Skill loaded (6 runs) | Plain (14 runs) |
|---|---|---|
| Passed the grader | 6 | 0 |
| Words in the edited document | 160 to 175 | 163 to 201 |
| Kept the `#migrations` link and left it to the user | 6 | 0; all removed or replaced it |
| Moved the migration warning ahead of the steps | 0; 5 proposed it | 12 |
| Reworded the `--limit` claim | 0; all 6 reported it as doubtful | 11 |

What it supports: on this case and model the skill does not make the result shorter.
It keeps the document's meaning fixed and hands content decisions to the user; the
plain model makes those decisions itself and reports them. The grader checks exactly
those rules and the plain arm was not told them, so this does not show that the skill
writes a better document, or that a plain instruction stating the same rules would do
worse. One case, one model, five runs per arm. The skill stays typed-only.
