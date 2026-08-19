import Link from 'next/link';
import { isDatabaseConfigured, seasonSummaries } from '@jff/db';
import { NotConnected } from '../../components/NotConnected.tsx';
import { ScrollTable } from '../../components/Table.tsx';
import { int, num } from '../../lib/format.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seasons — Risky Biscuit Brigade' };

export default async function SeasonsPage(): Promise<React.ReactElement> {
  const seasons = await seasonSummaries('rbb');
  if (seasons.length === 0) return <NotConnected configured={isDatabaseConfigured()} />;

  return (
    <>
      <h2>
        Seasons <span className="count">{seasons.length}</span>
      </h2>
      <ScrollTable
        head={
          <tr>
            <th>Season</th>
            <th>Champion</th>
            <th>Teams</th>
            <th>Games</th>
            <th>High score</th>
            <th>Divisions</th>
          </tr>
        }
      >
        {seasons.map((s) => (
          <tr key={s.year}>
            <td>
              <Link href={`/seasons/${s.year}`}>
                <strong>{s.year}</strong>
              </Link>
            </td>
            <td>
              {s.champion_manager_id ? (
                <Link href={`/managers/${s.champion_manager_id}`}>
                  {s.champion_display_name}
                </Link>
              ) : (
                <span className="muted">not recorded</span>
              )}
            </td>
            <td>{int(s.num_teams)}</td>
            <td>{int(s.games)}</td>
            <td>{num(s.high_score)}</td>
            <td>{s.has_divisions ? 'Yes' : <span className="muted">—</span>}</td>
          </tr>
        ))}
      </ScrollTable>
      <p className="lede tiny" style={{ marginTop: 14 }}>
        The league ran two divisions in 2016, none from 2017 to 2022, and three from 2023 —
        so divisional standings only appear on the seasons that had them.
      </p>
    </>
  );
}
