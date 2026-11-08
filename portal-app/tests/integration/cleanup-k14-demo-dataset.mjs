import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { assertSafeToRunIntegrationTests } from './_guard.mjs';
import { buildClients } from './_client.mjs';
import { deleteTestUser } from './_client.mjs';

const TRACKING_FILE = new URL('.k14-demo-dataset.json', import.meta.url).pathname;

if (!existsSync(TRACKING_FILE)) {
  console.log('No K1.4 demo dataset tracking file found — nothing to clean up.');
  process.exit(0);
}

const safe = assertSafeToRunIntegrationTests(process.env);
const clients = buildClients({ supabaseUrl: safe.supabaseUrl, anonKey: process.env.SUPABASE_ANON_KEY, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
const tracked = JSON.parse(readFileSync(TRACKING_FILE, 'utf8'));

const errors = [];
for (const collaborationId of tracked.collaborationIds ?? []) {
  const { error } = await clients.admin.from('collaborations').delete().eq('id', collaborationId);
  if (error) errors.push({ collaborationId, message: error.message });
}
for (const uid of tracked.userUids ?? []) {
  try {
    await deleteTestUser(clients, uid);
  } catch (err) {
    errors.push({ uid, message: err.message });
  }
}

unlinkSync(TRACKING_FILE);

if (errors.length > 0) {
  console.log('Cleanup completed with errors:', JSON.stringify(errors));
} else {
  console.log('K1.4 demo dataset cleaned up successfully.');
}
