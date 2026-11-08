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
