import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/lib/supabaseErrors.ts', import.meta.url).pathname);
const { isBackendUnavailableError, messageLooksLikeBackendUnavailable } = mod;

assert('42P01 (undefined table) -> backend unavailable', isBackendUnavailableError({ code: '42P01', message: 'relation does not exist' }) === true);
assert('PGRST202 (missing function) -> backend unavailable', isBackendUnavailableError({ code: 'PGRST202', message: 'could not find the function' }) === true);
assert('PGRST205 (missing table, schema cache) -> backend unavailable', isBackendUnavailableError({ code: 'PGRST205', message: 'x' }) === true);
assert('a genuine RLS/permission error is NOT backend-unavailable', isBackendUnavailableError({ code: '42501', message: 'permission denied for table foo' }) === false);
assert('a plain network/timeout-shaped error is NOT backend-unavailable', isBackendUnavailableError({ code: undefined, message: 'Failed to fetch' }) === false);
assert('null error -> not backend-unavailable', isBackendUnavailableError(null) === false);
assert('undefined error -> not backend-unavailable', isBackendUnavailableError(undefined) === false);

assert('message-only check: "does not exist" matches', messageLooksLikeBackendUnavailable('relation "foo" does not exist') === true);
assert('message-only check: "schema cache" matches', messageLooksLikeBackendUnavailable('Could not find the table in the schema cache') === true);
assert('message-only check: unrelated message does not match', messageLooksLikeBackendUnavailable('permission denied') === false);
assert('message-only check: null/undefined is safe, not a crash', messageLooksLikeBackendUnavailable(null) === false && messageLooksLikeBackendUnavailable(undefined) === false);

report('supabaseErrors');
