import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/lib/collaborationReportFilter.ts', import.meta.url).pathname);
const { filterCollaborationRows } = mod;

const rows = [
  { title: 'The Ghost In The Signal', artistDisplayName: 'Paige Duddy / XYLØ' },
  { title: 'Lost Transition', artistDisplayName: 'Issey Cross' },
];

assert('empty query returns every row', filterCollaborationRows(rows, '').length === 2);
assert('whitespace-only query returns every row', filterCollaborationRows(rows, '   ').length === 2);
assert('matches by title, case-insensitive', filterCollaborationRows(rows, 'ghost')[0].title === 'The Ghost In The Signal');
assert('matches by artist, case-insensitive', filterCollaborationRows(rows, 'issey')[0].title === 'Lost Transition');
assert('no match -> empty array, never falls back to showing everything', filterCollaborationRows(rows, 'nonexistent-project-xyz').length === 0);
assert('partial artist match works', filterCollaborationRows(rows, 'xyl').length === 1);

report('collaborationReportFilter (Stage K1.4 Collaborations search)');
