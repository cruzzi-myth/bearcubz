import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/lib/navDestination.ts', import.meta.url).pathname);
const { resolveNavDestination, PROJECT_INDEPENDENT_PATH } = mod;

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

assert(
  'PROJECT_INDEPENDENT_PATH has exactly one real route per chamber segment, nothing duplicated',
  ['listen', 'proposal', 'visuals', 'respond'].every((seg) => typeof PROJECT_INDEPENDENT_PATH[seg] === 'string') &&
    new Set(Object.values(PROJECT_INDEPENDENT_PATH)).size === 4,
);
assert(
  'every project-independent path starts with /chambers/, never /collaboration/ (never carries a fabricated id)',
  Object.values(PROJECT_INDEPENDENT_PATH).every((p) => p.startsWith('/chambers/') && !p.includes('undefined') && !p.includes('null')),
);
assert(
  'the project-independent paths match the real registered routes exactly',
  PROJECT_INDEPENDENT_PATH.listen === '/chambers/listening' &&
    PROJECT_INDEPENDENT_PATH.respond === '/chambers/transmission' &&
    PROJECT_INDEPENDENT_PATH.visuals === '/chambers/visuals' &&
    PROJECT_INDEPENDENT_PATH.proposal === '/chambers/proposals',
);

report('navDestination (Stage K1.6A chamber nav project-selection branching)');
