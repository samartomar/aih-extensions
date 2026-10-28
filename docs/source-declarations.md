# Authored source identity, groupings and attributed declarations

[`source-declarations/v1.json`](../source-declarations/v1.json) is versioned public
source data for this framework's authored identity, pinned upstream provenance,
the content owner's intended groups and source-scoped compatibility facts. Its
schema is [`source-declarations/v1.schema.json`](../source-declarations/v1.schema.json);
both ship in the distributed source artifact. A packager can read them without
importing the installer or reconstructing intent from prose. This is source
intent, not an installation plan, a support claim or an observed binding.

Read the declaration with the data-only consumer:

```sh
node scripts/source-declarations.mjs
node scripts/source-declarations.mjs check   # pins and vendored groups match authored config
```

The result reports `status: "declared"`, the identity, provenance, groups (each
member resolved to `file` or `directory`), and the attributed compatibility
facts. It always reports `installation: { status: "not-declared" }` and
`support: { status: "not-claimed" }`. The reader only reads the declaration and
stats member paths; it never imports or executes installer scripts, client
adapters or hooks, and never reads installed configuration. Refusals have
`status: "refused"` with a `code` and the CLI exits with status 1.

## Source schema version 1

The top-level `schemaVersion: 1` versions this source format independently of
the product release; any other version, or a missing declaration file, is
refused as `unknown-schema-version`.

| Field | Meaning |
| --- | --- |
| `identity` | The authored framework identity (name, title, description, author, license, repository). `versionSource` names the authored file and field that holds the canonical release version (`package.json#version`), so the declaration never copies a version number. |
| `provenance.source` | The authored file the pins are taken from (`scripts/upstream.config.mjs`). |
| `provenance.upstreams[]` | Each upstream repository URL, its pinned 40-hex commit, and `vendored`: `true` when content is copied into this repository by the vendor script, `false` when the upstream is installed from its own repository at that commit and never vendored here (Matt Pocock's plugin; only its `misc/` setup-pre-commit skill and LICENSE are copied). Malformed pins are refused as `invalid-provenance`. |
| `groups[]` | The content owner's intended groups, each with the authored metadata it comes from. `upstream.addy` and `upstream.matt` follow `scripts/upstream.config.mjs#copies`; `original` lists what AGENTS.md marks original to this repo. Omitted groups stay omitted: the reader never invents a group. |
| `groups[].members[]` | Repository-relative authored content. Every member must resolve to an existing file or directory inside the source root; anything else is refused (`unknown-member`, `invalid-member` for traversal). The same member may legitimately belong to several distinct groups; a duplicate inside one group is refused (`duplicate-member`). |
| `compatibility.facts[]` | Source-scoped facts and limitations. `tool` is a stable public Core tool identifier (`claude`, `codex`, `cursor`, `kimi`, `opencode`) or `all`; unknown identifiers are refused. `source` names the authored repository file the fact is recorded in. |

### Compatibility facts: evidence stays within its scope

Each fact has a `kind`:

- `verified` — observed behavior. Must carry `evidence` (`date`, `platform`,
  plus `toolVersion`/`model` where recorded). A `verified` fact without
  evidence is refused as `evidence-required`; absent evidence stays absent and
  is never synthesized or backfilled.
- `limitation` — a recorded constraint or unqualified behavior. May carry
  evidence where it exists; without it, the limitation stands unverified.
- `requirement` — a stated prerequisite (for example Node.js 22+ and git).

The current facts record the 2026-09-27 Windows 11 live verification from
[tools.md](tools.md#verified-live) and the dated limitations in its per-tool
notes. A fact never prescribes a per-tool install location, never generates
per-tool copies, and never marks a tool as supported; a declaration does not
create or enable a binding. The reader exposes no install path, no `supported`
flag and no observed binding.

## Boundaries

Group members are source paths, not destinations. Core/Harness determines tool
fit, per-tool delivery and observed bindings
([samartomar/aih-core#94](https://github.com/samartomar/aih-core/issues/94),
[samartomar/aih-core#95](https://github.com/samartomar/aih-core/issues/95),
[samartomar/aih-core#97](https://github.com/samartomar/aih-core/issues/97));
Catalog packages one item per content and resolves declared groups
([samartomar/aih-catalog#142](https://github.com/samartomar/aih-catalog/issues/142),
[samartomar/aih-catalog#145](https://github.com/samartomar/aih-catalog/issues/145)).
This format supplies no authoritative per-tool target path, and an unqualified
tool remains unqualified even when a source variant exists.

## Maintaining the data

- When `scripts/upstream.config.mjs` pins or `copies` move (an authorized
  vendor run), update `provenance.upstreams` and the `upstream.*` group members
  to match. `node scripts/source-declarations.mjs check` regenerates the
  machine-derivable parts from the authored config and reports drift; CI and
  reviewers can run it before committing.
- When authored content is added, removed or renamed, update the affected
  group members so every member still resolves.
- When a compatibility observation is recorded in `docs/tools.md` or
  `guide-evidence.md`, add or adjust the fact with its exact evidence scope
  (date, platform, tool version). Do not promote a limitation to `verified`
  without new evidence.

The focused fixtures read the real declaration, verify the identity against the
authored plugin metadata, compare pins against `vendor.lock.json`, exercise the
data-only consumer, and refuse unknown versions and members, duplicate
membership inside a group, malformed pins and evidence-free `verified` claims;
a copy with throwing installer scripts demonstrates nothing is imported or
executed. These are data-consumption checks, with no native client
qualification. Run the repository's required vendoring, tests and both-manifest
strict validation before committing. No setup, install, guard restoration or
client session is required by this data-only change.
