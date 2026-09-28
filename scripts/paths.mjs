// Upstream checkouts live outside the repo: nested plugin manifests inside the
// plugin folder get picked up by `claude plugin eval` and copied by a
// local-folder install. Override with AIH_UPSTREAM_CACHE.
import os from 'node:os';
import path from 'node:path';

export const UPSTREAM_CACHE = process.env.AIH_UPSTREAM_CACHE || path.join(os.homedir(), '.cache', 'aih-extensions', 'upstream');
