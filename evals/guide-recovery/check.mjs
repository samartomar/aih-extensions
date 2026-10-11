// A controlled symptom witness, not a repair implementation.
import fs from 'node:fs';
const settings = JSON.parse(fs.readFileSync(new URL('./settings.json', import.meta.url), 'utf8'));
if (settings.unrelated?.keep !== 'owner-value') {
  console.error('UNRELATED_CHANGED');
  process.exitCode = 9;
} else if (settings.integration?.enabled === true) {
  console.log('ORIGINAL_ACTION_OK');
} else {
  console.error('INTEGRATION_DISABLED');
  process.exitCode = 7;
}
