export type FilterableRow = { title: string; artistDisplayName: string };

/**
 * Pure — extracted so the Collaborations report's search box can be
 * tested without rendering React. Matches on title OR artist, case-
 * insensitively; an empty/whitespace-only query returns every row
 * unfiltered rather than zero rows.
 */
export function filterCollaborationRows<T extends FilterableRow>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.title.toLowerCase().includes(q) || r.artistDisplayName.toLowerCase().includes(q));
}
