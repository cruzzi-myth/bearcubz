let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
// Optional focused reruns avoid exhausting the live development API budgets.
const filter = process.env.SIGNAL_PORTAL_BROWSER_FILTER ? new RegExp(process.env.SIGNAL_PORTAL_BROWSER_FILTER) : null;

export async function check(name, fn) {
  if (filter && !filter.test(name)) {
    skipped += 1;
    return;
  }
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
  console.log(`\n${label}: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) {
    console.log('Failed:', failures.join(', '));
    process.exitCode = 1;
  }
}
