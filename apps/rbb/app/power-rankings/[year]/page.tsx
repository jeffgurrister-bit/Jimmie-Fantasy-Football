import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScrollTable } from '../../../components/Table.tsx';
import { powerRankingYears, powerRankings } from '../../../lib/data.ts';

export function generateStaticParams(): Array<{ year: string }> {
  return powerRankingYears().map((year) => ({ year: String(year) }));
}

/** ▲2 / ▼1 / — , coloured by direction. Null in week one, where there is no prior. */
function Movement({ places }: { places: number | null }): React.ReactElement {
  if (places === null) return <span className="muted">—</span>;
  if (places === 0) return <span className="muted">–</span>;
  const up = places > 0;
  return (
    <span className={up ? 'win' : 'loss'}>
      {up ? '▲' : '▼'}
      {Math.abs(places)}
    </span>
  );
}

export default async function PowerRankingsSeason({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<React.ReactElement> {
  const { year: yearParam } = await params;
  const year = Number.parseInt(yearParam, 10);
  const rows = powerRankings(year);
  if (rows.length === 0) notFound();

  // Already sorted newest week first, ranked within each week.
  const weeks = new Map<number, typeof rows>();
  for (const r of rows) {
    const list = weeks.get(r.week) ?? [];
    list.push(r);
    weeks.set(r.week, list);
  }

  const years = powerRankingYears();

  return (
    <>
      <h2>
        {year} power rankings <span className="count">{weeks.size} weeks</span>
      </h2>

      <nav className="tabs season-switch" aria-label="Season">
        {years.map((y) => (
          <Link key={y} href={`/power-rankings/${y}`} aria-current={y === year ? 'page' : undefined}>
            {y}
          </Link>
        ))}
      </nav>

      {[...weeks.entries()].map(([week, list]) => (
        <section key={week}>
          <h3>Week {week}</h3>
          <ScrollTable
            hint={false}
            variant="rankings"
            head={
              <tr>
                <th>#</th>
                <th>Mv</th>
                <th>Manager</th>
                <th>Team</th>
                <th>Record</th>
              </tr>
            }
          >
            {list.map((r) => (
              <tr key={r.manager_id}>
                <td className="num-strong">{r.rank}</td>
                <td>
                  <Movement places={r.movement} />
                </td>
                <td>
                  <Link href={`/managers/${r.manager_id}`}>{r.display_name}</Link>
                </td>
                <td className="muted">{r.team_name ?? '—'}</td>
                <td className="muted">{r.record ?? '—'}</td>
              </tr>
            ))}
          </ScrollTable>

          {/* The write-ups are the whole point — this is what was stuck in a
              screenshot. Shown under the table so the ranking reads first. */}
          {list.some((r) => r.notes) ? (
            <ul className="plain card card-pad notes">
              {list
                .filter((r) => r.notes)
                .map((r) => (
                  <li key={`${r.manager_id}-note`}>
                    <strong>
                      {r.rank}. {r.display_name}
                    </strong>{' '}
                    <span className="muted">{r.notes}</span>
                  </li>
                ))}
            </ul>
          ) : null}
        </section>
      ))}
    </>
  );
}
