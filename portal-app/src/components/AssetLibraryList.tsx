import { AssetLibraryRow, type AssetLibraryRowData } from './AssetLibraryRow';
import './asset-library-row.css';

type Props<T extends AssetLibraryRowData> = {
  rows: T[];
  onSelect: (row: T) => void;
  selectedId?: string | null;
  emptyMessage?: string;
};

export function AssetLibraryList<T extends AssetLibraryRowData>({ rows, onSelect, selectedId, emptyMessage }: Props<T>) {
  if (rows.length === 0) {
    return <p className="sp-asset-row-list__empty">{emptyMessage ?? 'No collaborations yet.'}</p>;
  }
  return (
    <ul className="sp-asset-row-list">
      {rows.map((row) => (
        <AssetLibraryRow key={row.id} row={row} selected={selectedId === row.id} onSelect={onSelect} />
      ))}
    </ul>
  );
}
