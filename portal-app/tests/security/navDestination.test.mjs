import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/lib/navDestination.ts', import.meta.url).pathname);
const { resolveNavDestination } = mod;

assert('zero collaborations -> none, never fabricates a destination', resolveNavDestination('listen', []).kind === 'none');
assert(
  'exactly one collaboration -> auto-navigate, route matches the real chamber route shape',
  (() => {
    const d = resolveNavDestination('listen', [{ id: 'abc', title: 'X' }]);
    return d.kind === 'navigate' && d.path === '/collaboration/abc/listen';
  })(),
);
assert(
  'auto-navigate builds the correct path for every chamber segment',
  ['listen', 'proposal', 'visuals', 'respond'].every(
    (seg) => resolveNavDestination(seg, [{ id: 'xyz', title: 'X' }]).path === `/collaboration/xyz/${seg}`,
  ),
);
assert(
  'more than one collaboration -> select-project, never auto-picks one',
  (() => {
    const d = resolveNavDestination('proposal', [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    return d.kind === 'select-project' && d.choices.length === 2;
  })(),
);
assert(
  'select-project choices carry the real id/title, not fabricated',
  resolveNavDestination('visuals', [{ id: 'p1', title: 'Ghost Signal' }, { id: 'p2', title: 'Static Bloom' }]).choices[0].title === 'Ghost Signal',
);

report('navDestination (Stage K1.6A chamber nav project-selection branching)');
