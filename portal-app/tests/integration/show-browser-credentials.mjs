// Run this yourself, in your own terminal — never ask the agent to
// run it, since its output (including the password) would then pass
// through the agent's own tool transcript. This script only reads the
// local, gitignored dataset file; it makes no network calls.
import { loadBrowserDataset } from './browser-dataset.mjs';

const dataset = loadBrowserDataset();
if (!dataset) {
  console.log('No browser dataset found. Run: node tests/integration/create-browser-dataset.mjs');
  process.exit(1);
}

console.log('Signal Portal browser-review credentials (signal-portal-dev only):\n');
console.log('Password (same for every identity below):', dataset.password, '\n');
for (const [role, identity] of Object.entries(dataset.identities)) {
  console.log(role.padEnd(18), identity.email);
}
console.log('\nCollaborations:', JSON.stringify(dataset.collaborations, null, 2));
