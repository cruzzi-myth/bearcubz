import { assertSafeToRunIntegrationTests } from './_guard.mjs';
import { buildClients } from './_client.mjs';
import { cleanupBrowserDataset } from './browser-dataset.mjs';

const safe = assertSafeToRunIntegrationTests(process.env);
const clients = buildClients({
  supabaseUrl: safe.supabaseUrl,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

await cleanupBrowserDataset(clients);
