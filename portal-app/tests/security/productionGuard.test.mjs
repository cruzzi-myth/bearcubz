import { assert, report } from './runner.mjs';
import { assertSafeToRunIntegrationTests, ProductionGuardError, PRODUCTION_PROJECT_REF } from '../integration/_guard.mjs';

function throwsGuardError(fn) {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ProductionGuardError;
  }
}

assert('no SUPABASE_URL at all -> refuses (fail-closed, not "assume safe")', throwsGuardError(() => assertSafeToRunIntegrationTests({})));

assert(
  'SUPABASE_URL pointed at the real production ref -> refuses, even with the opt-in flag set',
  throwsGuardError(() =>
    assertSafeToRunIntegrationTests({ SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`, ALLOW_INTEGRATION_TESTS: '1' }),
  ),
);

assert(
  'a non-production URL without the explicit opt-in flag -> still refuses (two independent gates)',
  throwsGuardError(() => assertSafeToRunIntegrationTests({ SUPABASE_URL: 'https://some-test-project.supabase.co' })),
);

assert(
  'a non-production URL + opt-in flag set to the wrong value -> still refuses',
  throwsGuardError(() =>
    assertSafeToRunIntegrationTests({ SUPABASE_URL: 'https://some-test-project.supabase.co', ALLOW_INTEGRATION_TESTS: 'true' }),
  ),
);

assert(
  'a non-production URL + opt-in flag set exactly to "1" -> allowed through',
  !throwsGuardError(() =>
    assertSafeToRunIntegrationTests({ SUPABASE_URL: 'https://some-test-project.supabase.co', ALLOW_INTEGRATION_TESTS: '1' }),
  ),
);

assert(
  'a local Supabase stack URL (http://127.0.0.1:54321) can never collide with the production ref pattern',
  !throwsGuardError(() =>
    assertSafeToRunIntegrationTests({ SUPABASE_URL: 'http://127.0.0.1:54321', ALLOW_INTEGRATION_TESTS: '1' }),
  ),
);

assert(
  'falls back to VITE_SUPABASE_URL when SUPABASE_URL is unset',
  !throwsGuardError(() =>
    assertSafeToRunIntegrationTests({ VITE_SUPABASE_URL: 'https://some-test-project.supabase.co', ALLOW_INTEGRATION_TESTS: '1' }),
  ),
);

report('productionGuard (integration-test production safeguard)');
