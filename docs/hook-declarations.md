# Authored hook source declarations

[`hook-declarations/v1.json`](../hook-declarations/v1.json) is versioned public
source data for the authored command hooks, OpenCode callbacks and Git commit
gate. A packager can read it without importing the installer or reconstructing
commands from prose. It is source intent, not an installation plan, an observed
binding, a support claim or proof that a guard is enabled.

Read a real declaration with the data-only consumer:

```sh
node scripts/hook-declarations.mjs git-guard.claude claude
```

The result displays `['node', '{itemDir}/hooks/git-guard.mjs']` as a structured
invocation, with its protocol, event, matcher, runtime and timeout. It always
reports `declared-not-installed`, `installed: false` and an unavailable observed
binding. The optional tool argument labels the requested consumer; it does not
select or qualify an adapter. The reader reads and hashes material bytes; it
never imports or executes them and never reads installed configuration.
Refusals have `status: refused` and the CLI exits with status 1.

## Source schema version 1

The top-level `schemaVersion: 1` versions this source format independently of
the product release. `hooks` contains unique `id` entries:

| Field | Meaning |
| --- | --- |
| `source.protocol`, `source.event`, optional `source.matcher` | The actual source interface and trigger. Matchers retain source syntax, without translation. |
| `script` | Repository-relative authored entrypoint. |
| `materials` | Repository-relative entrypoint and local import/data closure, each with its exact SHA-256. Includes `lanes.md` where read and shared Git policy modules where imported. These hashes identify bytes, not publisher authenticity. |
| `runtime` | Required interpreter name, executable and declared range. Node >=22 follows the repository requirement; no interpreter availability is inferred. Git guard and commit gate also invoke Git, supplied by the host. |
| `invocation` | `command` has an entrypoint and ordered arguments; `module-factory` has an exported factory, options and an empty argument list. Neither is a final shell command. |
| `timeoutSeconds` | Source timeout in seconds; `null` explicitly means no timeout configured by this source (OpenCode callbacks and Git hook). It does not promise unlimited execution or override a client's defaults. |
| `installation` | A source reference, symbolic material root and requirement for a consumer binding. A reference points to authored configuration or declaration/wiring documentation; it is not an authoritative destination path. |

The Git hook's first argument is `{kind: "event-argument", position: 1,
name: "commitMessageFile"}`: Git supplies the commit-message filename. It is
not a new path placeholder or a literal argument to execute. OpenCode's two
callbacks are separate declarations for one `createPlugin` module, whose
`gitGuard: true` is the source factory default. An existing disabled guard must
remain disabled; a declaration does not authorize applying that default.

The Claude command-hook protocol is also imported by Cursor through its Claude
configuration. There is no fabricated Cursor script. Codex and Kimi command
variants separately retain their actual matcher and flags, even where they
share the JSON hook input/output with Claude. OpenCode uses module callbacks,
not a command adapter. Its callback events and factory metadata are preserved
instead of inventing a command, matcher or timeout. The Git commit gate is a
Git hook, separate from all client hook protocols.

Only `{projectDir}`, `{homeDir}`, `{itemDir}` and `{pluginRoot}` may appear as
projection placeholders. Source `${CLAUDE_PLUGIN_ROOT}` syntax in
`hooks/hooks.json` is normalized to `{itemDir}` for the source material root;
the original configuration is untouched. The consumer refuses unknown protocol,
event, schema or placeholder, missing runtime information, missing material and
hash mismatch. It does not resolve placeholders, locate an executable or claim
an installed result. A packager must retain those refusals.

Catalog owns the public hook payload and its projection
([samartomar/aih-catalog#134](https://github.com/samartomar/aih-catalog/issues/134)).
Core/Harness owns observed bindings and final rendering, including Windows
interpreter handling
([samartomar/aih-core#95](https://github.com/samartomar/aih-core/issues/95),
[samartomar/aih-core#97](https://github.com/samartomar/aih-core/issues/97)).
This format supplies no authoritative per-tool target path. An unavailable
binding remains unavailable, even when a source variant exists.

## Maintaining the data

When authored script or local dependency bytes change, update the corresponding
`materials` hashes and review the source metadata against its referenced
configuration. Compute SHA-256 from the actual file bytes, for example:

```sh
node --input-type=module -e "import fs from 'node:fs'; import {createHash} from 'node:crypto'; console.log(createHash('sha256').update(fs.readFileSync('hooks/git-guard.mjs')).digest('hex'))"
node --test tests/hook-declarations.test.mjs
```

The focused fixtures read real declarations, verify the source plugin metadata,
exercise each variant and refuse missing/changed material, missing interpreter
information, unknown protocol/event/placeholder and unavailable bindings. A
copy with a throwing script demonstrates that material is read without running
it. These are data-consumption checks, with no native client qualification.
Run the repository's required vendoring, tests and both-manifest strict
validation before committing. No setup, install, guard restoration or client
session is required by this data-only change.
