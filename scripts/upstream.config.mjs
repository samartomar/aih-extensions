// What the aih-extensions add-on takes from upstream, and every edit applied on top.
// It sits on top of Matt Pocock's official plugin (`mattpocock-skills`), which
// is installed as-is and never vendored here. This file is the only place to
// change vendored content: `npm run vendor` regenerates skills/, agents/,
// commands/, references/ and licenses/ from it. A patch whose `find` text is
// missing (or appears a different number of times than `count`) aborts the run
// before anything in the repo is touched.

export const upstreams = {
  addy: {
    repo: 'https://github.com/addyosmani/agent-skills.git',
    sha: '1be8e34187e34647bb83adc3a1323b26ae6f6abe',
  },
  matt: {
    repo: 'https://github.com/mattpocock/skills.git',
    sha: '49dd158d1076134a641b33efb035946536778336',
  },
};

const addy = (name) => ({ from: 'addy', src: `skills/${name}`, dest: `skills/${name}` });

export const copies = [
  // Addy Osmani: specialist lanes Matt's plugin does not cover.
  addy('security-and-hardening'),
  addy('performance-optimization'),
  addy('observability-and-instrumentation'),
  addy('ci-cd-and-automation'),
  addy('deprecation-and-migration'),
  addy('frontend-ui-engineering'),
  addy('shipping-and-launch'),
  addy('code-simplification'),
  addy('api-and-interface-design'),
  addy('documentation-and-adrs'),
  addy('doubt-driven-development'),
  addy('source-driven-development'),
  addy('constraint-driven-development'),
  addy('git-workflow-and-versioning'),
  addy('idea-refine'),
  addy('browser-testing-with-devtools'),
  { from: 'addy', src: 'agents/code-reviewer.md', dest: 'agents/code-reviewer.md' },
  { from: 'addy', src: 'agents/security-auditor.md', dest: 'agents/security-auditor.md' },
  { from: 'addy', src: 'agents/test-engineer.md', dest: 'agents/test-engineer.md' },
  { from: 'addy', src: 'agents/web-performance-auditor.md', dest: 'agents/web-performance-auditor.md' },
  { from: 'addy', src: '.claude/commands/ship.md', dest: 'commands/ship.md' },
  { from: 'addy', src: '.claude/commands/webperf.md', dest: 'commands/webperf.md' },
  { from: 'addy', src: 'references', dest: 'references' },

  // Matt Pocock: in his repo's misc/ bucket, so not part of his plugin.
  { from: 'matt', src: 'skills/misc/setup-pre-commit', dest: 'skills/setup-pre-commit' },

  { from: 'addy', src: 'LICENSE', dest: 'licenses/addyosmani-agent-skills.LICENSE' },
  { from: 'matt', src: 'LICENSE', dest: 'licenses/mattpocock-skills.LICENSE' },
];

// Codex UI metadata; this is a Claude Code plugin.
export const exclude = [/[\\/]agents[\\/]openai\.yaml$/];

// Reachable by typing /name, never fired by the model on its own.
// Eval run 2026-09-27 (evals/, Sonnet, 2 runs per arm, with vs without the add-on):
// routing was right (11/12 fired when they should, 4/4 quiet when they should),
// but only observability-and-instrumentation scored higher than plain Claude.
// Skills without a measured gain stay typed-only until an eval shows one;
// promote a skill by deleting its line here.
export const userInvoked = [
  'skills/security-and-hardening/SKILL.md', // eval: 1.0 vs 1.0, plain Claude already covers the checklist
  'skills/performance-optimization/SKILL.md', // eval: 0 vs 0, fired but did not measure first or set a budget
  'skills/api-and-interface-design/SKILL.md', // eval: 1.0 vs 1.0
  'skills/documentation-and-adrs/SKILL.md', // eval: 0 vs 0.5, but the case was flawed (no write tool); re-test
  'skills/code-simplification/SKILL.md', // eval: 0 vs 0
  'skills/ci-cd-and-automation/SKILL.md', // not evaluated yet
  'skills/deprecation-and-migration/SKILL.md', // not evaluated yet
  'skills/frontend-ui-engineering/SKILL.md', // not evaluated yet
  'skills/setup-pre-commit/SKILL.md', // a one-off setup task
  'skills/doubt-driven-development/SKILL.md', // its "non-trivial decision" trigger is ordinary programming; expensive per run
  'skills/source-driven-development/SKILL.md', // a global "verify every framework call" posture that overlaps Matt's research
  'skills/constraint-driven-development/SKILL.md', // run once per repo; the commit gate enforces its floor
  'skills/git-workflow-and-versioning/SKILL.md', // its "any code change" trigger would race every other skill
  'skills/idea-refine/SKILL.md', // divergent ideation; Matt's grilling owns "stress-test"
  'skills/browser-testing-with-devtools/SKILL.md', // needs the chrome-devtools MCP server; type it once that is installed
];

// Names that must not appear in generated files: Addy skills this add-on
// leaves out because Matt's plugin owns the job. The vendor run fails if any
// generated file still points at one.
export const forbiddenRefs = [
  'interview-me', 'spec-driven-development', 'planning-and-task-breakdown', 'incremental-implementation',
  'test-driven-development', 'debugging-and-error-recovery', 'code-review-and-quality',
  'context-engineering', 'using-agent-skills', 'agent-skills:',
];

export const patches = [
  // --- Narrow two Addy skills to the part Matt's plugin does not cover.
  {
    file: 'skills/api-and-interface-design/SKILL.md',
    find: 'description: Guides stable API and interface design. Use when designing APIs, module boundaries, or any public interface. Use when creating REST or GraphQL endpoints, defining type contracts between modules, or establishing boundaries between frontend and backend.',
    replace: 'description: "Design stable REST, GraphQL and RPC contracts, compatibility and versioning. In-codebase module design belongs to codebase-design."',
  },
  {
    file: 'skills/documentation-and-adrs/SKILL.md',
    find: 'description: Records decisions and documentation. Use when you need to document an architecture decision (ADR) or the reasoning behind a design choice, when changing public APIs, shipping features, or when you need to record context that future engineers and agents will need to understand the codebase.',
    replace: 'description: "Write READMEs, API references, OpenAPI docs, changelogs and explanatory comments. ADRs belong to domain-modeling."',
  },
  {
    "file": "skills/documentation-and-adrs/SKILL.md",
    "find": "## When to Use\n\n- Making a significant architectural decision\n- Choosing between competing approaches\n- Adding or changing a public API\n- Shipping a feature that changes user-facing behavior\n- Onboarding new team members (or agents) to the project\n- When you find yourself explaining the same thing repeatedly\n\n**When NOT to use:** Don't document obvious code. Don't add comments that restate what the code already says. Don't write docs for throwaway prototypes.\n\n",
    "replace": "## When to Use\n\nWrite or update public API documentation, user guides, READMEs, changelogs and\ncomments explaining a non-obvious choice. Route ADR work to `domain-modeling`;\nfollow the repository's existing documentation format.\n\n"
  },
  {
    "file": "skills/documentation-and-adrs/SKILL.md",
    "find": "## Architecture Decision Records (ADRs)\n\nADRs capture the reasoning behind significant technical decisions. They're the highest-value documentation you can write.\n\n### When to Write an ADR\n\n- Choosing a framework, library, or major dependency\n- Designing a data model or database schema\n- Selecting an authentication strategy\n- Deciding on an API architecture (REST vs. GraphQL vs. tRPC)\n- Choosing between build tools, hosting platforms, or infrastructure\n- Any decision that would be expensive to reverse\n\n### Match the existing convention first\n\nBefore creating an ADR, inspect the available repository context for an established convention — existing ADRs, project instructions, and ADR-related configuration or tooling (e.g. an `.adr-dir` file). An established convention overrides the defaults below. Match:\n\n- **Location and format** — e.g. `docs/adr/*.md`, `Documentation/Decisions/*.rst`, a MADR layout, or an `adr-tools` setup. Match the existing directory, file extension, and markup (Markdown vs reStructuredText).\n- **Numbering and naming** — continue the existing sequence and filename pattern (`ADR-004-Title.rst`, `0004-title.md`, …); don't restart at 001 or introduce a second scheme.\n- **Section headings** — reuse the project's heading set rather than imposing this template's.\n\nIf the available evidence conflicts, surface the conflict rather than silently introducing another scheme. Only when no convention can be established do you apply the default below.\n\n### ADR Template\n\nStore ADRs in `docs/decisions/` with sequential numbering (unless the project already uses another location — see above):\n\n```markdown\n# ADR-001: Use PostgreSQL for primary database\n\n## Status\nProposed | Accepted | Superseded by ADR-XXX | Deprecated\n\n## Date\n2025-01-15\n\n## Context\nWe need a primary database for the task management application. Key requirements:\n- Relational data model (users, tasks, teams with relationships)\n- ACID transactions for task state changes\n- Support for full-text search on task content\n- Managed hosting available (for small team, limited ops capacity)\n\n## Decision\nUse PostgreSQL with Prisma ORM.\n\n## Alternatives Considered\n\n### MongoDB\n- Pros: Flexible schema, easy to start with\n- Cons: Our data is inherently relational; would need to manage relationships manually\n- Rejected: Relational data in a document store leads to complex joins or data duplication\n\n### SQLite\n- Pros: Zero configuration, embedded, fast for reads\n- Cons: Limited concurrent write support, no managed hosting for production\n- Rejected: Not suitable for multi-user web application in production\n\n### MySQL\n- Pros: Mature, widely supported\n- Cons: PostgreSQL has better JSON support, full-text search, and ecosystem tooling\n- Rejected: PostgreSQL is the better fit for our feature requirements\n\n## Consequences\n- Prisma provides type-safe database access and migration management\n- We can use PostgreSQL's full-text search instead of adding Elasticsearch\n- Team needs PostgreSQL knowledge (standard skill, low risk)\n- Hosting on managed service (Supabase, Neon, or RDS)\n```\n\n### ADR Lifecycle\n\n```\nPROPOSED → ACCEPTED → (SUPERSEDED or DEPRECATED)\n```\n\n- **Don't delete old ADRs.** They capture historical context.\n- When a decision changes, write a new ADR that references and supersedes the old one.\n\n",
    "replace": "## Architecture Decision Records (ADRs)\n\nUse `domain-modeling` for ADRs, including repositories with an established\nlong-form format. Continue here for user and developer documentation.\n\n"
  },

  // --- Cross-references to skills Matt's plugin owns.
  { file: 'skills/security-and-hardening/SKILL.md', find: 'run the postmortem with the `debugging-and-error-recovery` skill.', replace: 'reproduce and fix the cause with the `diagnosing-bugs` skill, then write up the incident.' },
  { file: 'skills/observability-and-instrumentation/SKILL.md', find: 'use the `debugging-and-error-recovery` skill', replace: 'use the `diagnosing-bugs` skill' },
  { file: 'skills/ci-cd-and-automation/SKILL.md', find: 'Test failure → Agent follows debugging-and-error-recovery skill', replace: 'Test failure → Agent follows diagnosing-bugs skill' },
  {
    file: 'skills/deprecation-and-migration/SKILL.md',
    find: 'Treat each phase as a thin vertical slice — see the `incremental-implementation` skill.',
    replace: 'Sequence the phases as expand–contract tickets, each blocked by the one before — see `/to-tickets`.',
  },
  {
    file: 'skills/doubt-driven-development/SKILL.md',
    find: '- **`code-review-and-quality` / `/review`**: complementary. `/review` is post-hoc PR verdict; doubt-driven is in-flight per-decision. Use both.',
    replace: '- **`code-review`**: complementary. `code-review` is a post-hoc verdict on a diff; doubt-driven is in-flight per-decision. Use both.',
  },
  { file: 'skills/doubt-driven-development/SKILL.md', find: '`/review`', replace: '`code-review`', count: 5 },
  { file: 'skills/doubt-driven-development/SKILL.md', find: '- **`test-driven-development`**: TDD', replace: '- **`tdd`**: TDD' },
  { file: 'skills/doubt-driven-development/SKILL.md', find: '- **`debugging-and-error-recovery`**: when the reviewer', replace: '- **`diagnosing-bugs`**: when the reviewer' },
  {
    file: 'skills/constraint-driven-development/SKILL.md',
    find: '`code-review-and-quality` gives you five axes. `test-driven-development` gives you a cycle.',
    replace: '`code-review` gives you two axes (Standards and Spec). `tdd` gives you a cycle.',
  },
  { file: 'skills/constraint-driven-development/SKILL.md', find: 'a code review right now (`code-review-and-quality`)', replace: 'a code review right now (`code-review`)' },
  {
    file: 'skills/constraint-driven-development/SKILL.md',
    find: 'Follow the one-question-at-a-time discipline from `interview-me`, with one change:',
    replace: 'Follow the `grilling` discipline (numbered rounds, a recommended answer on every question), with one change:',
  },
  { file: 'skills/constraint-driven-development/SKILL.md', find: "- `interview-me` — the one-question-at-a-time discipline this skill's intake borrows", replace: "- `grilling` — the interview discipline this skill's intake borrows" },
  { file: 'skills/constraint-driven-development/SKILL.md', find: '- `code-review-and-quality` — how to review;', replace: '- `code-review` — how to review;' },
  { file: 'skills/constraint-driven-development/SKILL.md', find: '- `test-driven-development` — the suite', replace: '- `tdd` — the suite' },
  {
    file: 'skills/constraint-driven-development/SKILL.md',
    find: 'Then add one line to `AGENTS.md` and `CLAUDE.md`:',
    replace: "Then add one line to the repository's maintained agent entry point, following its existing source-of-truth or import convention:",
  },
  { file: 'skills/constraint-driven-development/SKILL.md', find: "You're about to run `/build auto` or any autonomous loop", replace: "You're about to run `/implement` across a batch of tickets or any autonomous loop" },
  { file: 'skills/constraint-driven-development/SKILL.md', find: '| BUILD | `/build` |', replace: '| BUILD | post-edit hook |' },
  { file: 'skills/constraint-driven-development/SKILL.md', find: '| VERIFY | `/test` |', replace: '| VERIFY | `tdd` loop |' },
  { file: 'skills/constraint-driven-development/SKILL.md', find: '| REVIEW | `/review` |', replace: '| REVIEW | `code-review` + commit gate |' },
  {
    file: 'skills/code-simplification/SKILL.md',
    find: '| Long functions (50+ lines) | Multiple responsibilities | Split into focused functions with descriptive names |',
    replace: '| Long functions (50+ lines) | Multiple responsibilities | Split by responsibility, but keep the module deep: extracting helpers that only pass through makes it shallow (apply the deletion test from `codebase-design`) |',
  },
  {
    file: 'skills/git-workflow-and-versioning/SKILL.md',
    find: 'If an agent goes off the rails, `git reset --hard HEAD` takes you back to the last successful state.',
    replace: 'Before undoing work, inspect the diff and preserve unrelated changes. Reverse only the task-owned edits, or use git revert for the selected bad commit. Check enabled guards separately; a hook is not a substitute for scoped recovery.',
  },
  {
    file: 'skills/git-workflow-and-versioning/SKILL.md',
    find: 'See the splitting strategies in `code-review-and-quality` for how to break down large changes.',
    replace: 'Break large changes into tracer-bullet slices with `/to-tickets`.',
  },

  // --- Agents and commands: no /review or /test here, and the five-axis
  //     reviewer belongs to /ship, not to everyday pre-merge review.
  {
    file: 'agents/code-reviewer.md',
    find: 'description: Senior code reviewer that evaluates changes across five dimensions — correctness, readability, architecture, security, and performance. Use for thorough code review before merge.',
    replace: 'description: "Senior code reviewer for the /ship pre-launch fan-out: evaluates a production-bound change across correctness, readability, architecture, security and performance. Everyday pre-merge review belongs to the code-review skill."',
  },
  { file: 'agents/code-reviewer.md', find: 'using the same severity labels as the `code-review-and-quality` skill:', replace: 'using these severity labels:' },
  { file: 'agents/code-reviewer.md', find: '- **Invoke via:** `/review` (single-perspective review) or `/ship`', replace: '- **Invoke via:** `/ship`' },
  { file: 'agents/test-engineer.md', find: '- **Invoke via:** `/test` (TDD workflow) or `/ship`', replace: '- **Invoke via:** direct agent invocation or `/ship`' },
  { file: 'commands/ship.md', find: 'Invoke the agent-skills:shipping-and-launch skill.', replace: 'Invoke the shipping-and-launch skill.' },

  // --- Shared checklists.
  {
    file: 'references/definition-of-done.md',
    find: 'The depth behind these items lives in `code-review-and-quality` (the five-axis review) and `code-simplification` (reducing complexity without changing behavior).',
    replace: 'The depth behind these items lives in `code-review` (the two-axis review) and `code-simplification` (reducing complexity without changing behavior).',
  },
  { file: 'references/definition-of-done.md', find: '(see `documentation-and-adrs`)', replace: '(see `domain-modeling`)' },
  {
    file: 'references/definition-of-done.md',
    find: 'Use it as the final gate in `planning-and-task-breakdown`, `incremental-implementation`, and `shipping-and-launch`.',
    replace: 'Use it as the final gate in `/to-tickets` acceptance criteria, `/implement`, and `shipping-and-launch`.',
  },
  { file: 'references/testing-patterns.md', find: 'illustrating the universal principles from the `test-driven-development` skill.', replace: 'illustrating the universal principles from the `tdd` skill.' },
  { file: 'references/orchestration-patterns.md', find: '/review → code-reviewer (with code-review-and-quality skill) → report', replace: 'code-reviewer (invoked directly) → report' },
];
