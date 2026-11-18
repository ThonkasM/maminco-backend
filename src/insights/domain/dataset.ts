export type ColumnKind = 'time' | 'category' | 'number' | 'text';
export type ColumnFormat = 'currency' | 'integer' | 'percent' | 'decimal';
export type Cell = string | number | null;

export interface DatasetColumn {
  name: string;
  label: string;
  kind: ColumnKind;
  format?: ColumnFormat;
}

export interface Dataset {
  id: string;
  title: string;
  columns: DatasetColumn[];
  rows: Record<string, Cell>[];
  summary?: Record<string, Cell>;
}
