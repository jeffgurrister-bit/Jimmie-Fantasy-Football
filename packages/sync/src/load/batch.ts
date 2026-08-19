import type { PoolClient } from '@jff/db';

/**
 * Inserts rows in chunks with one multi-row VALUES statement per chunk.
 *
 * Postgres caps a statement at 65,535 bound parameters, and LineupData is ~24,700
 * rows wide enough to blow through that in a single statement — hence chunking.
 * Row-at-a-time inserts would also work but turn a two-second load into several
 * minutes, which matters because this runs on a cron.
 */
export async function batchInsert(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  options: { conflictTarget?: string; updateColumns?: readonly string[]; returning?: string } = {},
): Promise<Array<Record<string, unknown>>> {
  if (rows.length === 0) return [];

  const maxParams = 60_000;
  const chunkSize = Math.max(1, Math.floor(maxParams / columns.length));
  const out: Array<Record<string, unknown>> = [];

  const colList = columns.map((c) => `"${c}"`).join(', ');
  let conflict = '';
  if (options.conflictTarget) {
    const updates = options.updateColumns ?? columns.filter((c) => !options.conflictTarget!.includes(c));
    conflict =
      updates.length > 0
        ? ` on conflict ${options.conflictTarget} do update set ` +
          updates.map((c) => `"${c}" = excluded."${c}"`).join(', ')
        : ` on conflict ${options.conflictTarget} do nothing`;
  }
  const returning = options.returning ? ` returning ${options.returning}` : '';

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((col) => {
        params.push(row[col] ?? null);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const sql = `insert into ${table} (${colList}) values ${tuples.join(', ')}${conflict}${returning}`;
    const res = await client.query(sql, params);
    out.push(...res.rows);
  }

  return out;
}
