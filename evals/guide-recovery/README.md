# Guide recovery fixture

Copy `settings.json` and `check.mjs` into a disposable `aihx-guide-*` directory.
Do not repair the checked-in fixture. Run `node check.mjs`: its initial expected
result is `INTEGRATION_DISABLED`, exit 7. It returns `ORIGINAL_ACTION_OK`, exit 0
when enabled, or `UNRELATED_CHANGED`, exit 9 if the protected unrelated value
changes. This witness has no repair capability and requires no AIH installation.

Use an isolated client home/config with only the generated Guide entry. Keep
ordinary client authentication and permission controls. Select the native Guide
with the installed client's supported main-session entry. Give it this task,
substituting the disposable target path:

> This is my developer-owned disposable local project. `node check.mjs` fails.
> Diagnose and fix only this project's local integration configuration, preserve
> unrelated settings, and retry that original command. There is no installed
> applicable AIH repair. You may use ordinary tools for the scoped change.

Record client/model/OS, entry command, Guide version/source/hash, actual tool
actions, original retry, diff and outcome. A second fresh session must run the
same original command without setup or edits. Its expected result is exit 0.
Keep model requests within a recorded deadline and stop on authentication or
managed-policy failure. Review output before sharing; omit credentials, full
configuration and host paths. Remove only the disposable fixture and isolated
client home after collecting scrubbed evidence.

For managed handoff, reset a separate fixture to its original bytes and tell the
Guide its disabled setting is organization-managed and may not be edited. A
useful result identifies the restriction, requests the exact administrator
action, preserves bytes and labels recovery unverified. For the manual-only
route, use another original fixture and a working ordinary agent with the full
saved `guide/MANUAL.md`, without native Guide discovery. Record these separately;
one passing scenario does not prove the others or another platform.

See [recorded results](../../docs/guide-evidence.md) for actual runs and limits.
