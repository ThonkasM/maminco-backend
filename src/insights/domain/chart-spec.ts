import type { Cell, ColumnFormat, Dataset, DatasetColumn } from './dataset';

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'combo';

export interface ChartIntent {
  dataset?: string;
  type: ChartType;
  x: string;
  y: string[];
  title?: string;
}

export interface ChartSeries {
  field: string;
  label: string;
  format?: ColumnFormat;
  mark: 'bar' | 'line' | 'area';
  axis: 'left' | 'right';
}

export interface ChartSpec {
  id: string;
  type: ChartType;
  title: string;
  x: { field: string; label: string; kind: DatasetColumn['kind'] };
  series: ChartSeries[];
  data: Record<string, Cell>[];
  note?: string;
}

const MAX_ROWS = 120;
const MAX_PIE_SLICES = 7;
const MAX_BAR_CATEGORIES = 14;

function numericColumns(dataset: Dataset): DatasetColumn[] {
  return dataset.columns.filter((column) => column.kind === 'number');
}

function sortDescBy(rows: Dataset['rows'], field: string) {
  return [...rows].sort(
    (a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0),
  );
}

function collapseTail(
  rows: Dataset['rows'],
  xField: string,
  yFields: string[],
  keep: number,
): Dataset['rows'] {
  if (rows.length <= keep) return rows;
  const head = rows.slice(0, keep);
  const tail = rows.slice(keep);
  const other: Dataset['rows'][number] = { [xField]: 'Otros' };
  for (const field of yFields) {
    other[field] = tail.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
  }
  return [...head, other];
}

export function buildChartSpec(
  dataset: Dataset,
  intent: ChartIntent,
): ChartSpec | null {
  const columns = new Map(
    dataset.columns.map((column) => [column.name, column]),
  );
  const x = columns.get(intent.x);
  const ys = intent.y
    .map((name) => columns.get(name))
    .filter((column): column is DatasetColumn => column?.kind === 'number');
  if (!x || ys.length === 0 || dataset.rows.length === 0) return null;
  if (intent.type === 'pie' && ys.length !== 1) return null;

  let rows = dataset.rows;
  let note: string | undefined;
  const yFields = ys.map((column) => column.name);

  if (intent.type === 'pie') {
    rows = collapseTail(
      sortDescBy(rows, yFields[0]),
      x.name,
      yFields,
      MAX_PIE_SLICES,
    );
    if (rows.length < 2) return null;
  } else if (x.kind !== 'time') {
    const sorted = sortDescBy(rows, yFields[0]);
    if (sorted.length > MAX_BAR_CATEGORIES) {
      rows = collapseTail(sorted, x.name, yFields, MAX_BAR_CATEGORIES);
      note = `Se muestran las ${MAX_BAR_CATEGORIES} categorías principales; el resto se agrupa en «Otros».`;
    } else if (x.kind === 'category') {
      rows = sorted;
    }
  } else if (rows.length > MAX_ROWS) {
    rows = rows.slice(-MAX_ROWS);
    note = `Se muestran los últimos ${MAX_ROWS} puntos.`;
  }

  const defaultMark: ChartSeries['mark'] =
    intent.type === 'bar' || intent.type === 'pie'
      ? 'bar'
      : intent.type === 'area'
        ? 'area'
        : 'line';

  const series: ChartSeries[] = ys.map((column, index) => {
    const isCombo = intent.type === 'combo';
    const mark = isCombo ? (index === 0 ? 'bar' : 'line') : defaultMark;
    return {
      field: column.name,
      label: column.label,
      format: column.format,
      mark,
      axis: isCombo && index > 0 ? 'right' : 'left',
    };
  });

  return {
    id: `${dataset.id}:${intent.type}`,
    type: intent.type,
    title: intent.title?.trim() || dataset.title,
    x: { field: x.name, label: x.label, kind: x.kind },
    series,
    data: rows,
    note,
  };
}

export function autoChartIntent(dataset: Dataset): ChartIntent | null {
  const x =
    dataset.columns.find((column) => column.kind === 'time') ??
    dataset.columns.find((column) => column.kind === 'category');
  const numbers = numericColumns(dataset);
  if (!x || numbers.length === 0 || dataset.rows.length < 2) return null;

  const currency = numbers.filter((column) => column.format === 'currency');
  const primary = currency[0] ?? numbers[0];

  const sameFormat = numbers.filter(
    (column) => column.format === primary.format,
  );
  if (sameFormat.length >= 2 && dataset.rows.length <= 62) {
    return {
      dataset: dataset.id,
      type:
        x.kind === 'time' || /vs|compar/i.test(dataset.title) ? 'line' : 'bar',
      x: x.name,
      y: sameFormat.map((column) => column.name),
      title: dataset.title,
    };
  }

  if (x.kind === 'time') {
    const second = numbers.find((column) => column.name !== primary.name);
    return second
      ? {
          dataset: dataset.id,
          type: 'combo',
          x: x.name,
          y: [primary.name, second.name],
          title: dataset.title,
        }
      : {
          dataset: dataset.id,
          type: 'area',
          x: x.name,
          y: [primary.name],
          title: dataset.title,
        };
  }

  const isShare =
    dataset.rows.length <= MAX_PIE_SLICES &&
    /pago|método|metodo|payment|turno|shift/i.test(dataset.title);
  return {
    dataset: dataset.id,
    type: isShare ? 'pie' : 'bar',
    x: x.name,
    y: [primary.name],
    title: dataset.title,
  };
}
