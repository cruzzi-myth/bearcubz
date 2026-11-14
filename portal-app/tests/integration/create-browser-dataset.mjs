import { assertSafeToRunIntegrationTests } from './_guard.mjs';
import { buildClients } from './_client.mjs';
import { createBrowserDataset } from './browser-dataset.mjs';

const safe = assertSafeToRunIntegrationTests(process.env);
const clients = buildClients({
  supabaseUrl: safe.supabaseUrl,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
const ctx = { supabaseUrl: safe.supabaseUrl, anonKey: process.env.SUPABASE_ANON_KEY };

const dataset = await createBrowserDataset(clients, ctx);
console.log('Browser review dataset created.');
console.log('Collaborations:', JSON.stringify(dataset.collaborations, null, 2));
console.log('Identities (emails only — run show-browser-credentials.mjs locally for the password):');
for (const [role, identity] of Object.entries(dataset.identities)) {
  console.log(' ', role, '->', identity.email);
}
