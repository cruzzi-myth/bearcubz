// Minimal async test harness for integration scenarios — same
// no-new-dependency philosophy as tests/security/runner.mjs, extended
// with an async assert since every check here involves a real network
// round-trip to Supabase.
let passed = 0;
let failed = 0;
const failures = [];

export async function check(name, fn) {
  try {
    const ok = await fn();
    if (ok) {
      passed += 1;
      console.log('PASS', name);
    } else {
      failed += 1;
      failures.push(name);
      console.log('FAIL', name);
    }
  } catch (err) {
    failed += 1;
    failures.push(name);
    console.log('FAIL', name, '(threw)', err?.message ?? err);
  }
}

export function summary(label) {
  console.log(`\n${label}: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failed:', failures.join(', '));
    process.exitCode = 1;
  }
}

export function resetCounters() {
  passed = 0;
  failed = 0;
  failures.length = 0;
}

export function totals() {
  return { passed, failed };
}
