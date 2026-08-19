import Link from 'next/link';
import { allTimeStandings, isDatabaseConfigured } from '@jff/db';
import { NotConnected } from '../../components/NotConnected.tsx';
import { ScrollTable } from '../../components/Table.tsx';
import { int, num, pct, record } from '../../lib/format.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'All-time standings — Risky Biscuit Brigade' };

export default async function StandingsPage(): Promise<React.ReactElement> {
  const [regular, everything] = await Promise.all([
    allTimeStandings('rbb', 'Regular'),
    allTimeStandings('rbb', 'all'),
  ]);
  if (regular.length === 0) return <NotConnected configured={isDatabaseConfigured()} />;

  const table = (rows: typeof regular): React.ReactElement => (
    <ScrollTable
      head={
        <tr>
          <th>Manager</th>
          <th>G</th>
          <th>W-L</th>
          <th>Pct</th>
          <th>PPG</th>
          <th>PF</th>
          <th>PA</th>
          <th>Seasons</th>
          <th>Titles</th>
        </tr>
      }
    >
      {rows.map((s) => (
        <tr key={s.manager_id}>
          <td>
            <Link href={`/managers/${s.manager_id}`}>{s.display_name}</Link>{' '}
            {s.is_active ? null : <span className="pill muted">Retired</span>}
          </td>
          <td>{int(s.games)}</td>
          <td className="num-strong">{record(s.wins, s.losses)}</td>
          <td>{pct(s.win_pct)}</td>
          <td>{num(s.ppg)}</td>
          <td>{int(s.points_for)}</td>
          <td>{int(s.points_against)}</td>
          <td className="muted">
            {s.first_year}
            {s.last_year ? `–${s.last_year}` : '–'}
          </td>
          <td>{s.titles > 0 ? <span className="pill gold">{s.titles}</span> : '—'}</td>
        </tr>
      ))}
    </ScrollTable>
  );

  return (
    <>
      <h2>All-time standings</h2>
      <p className="lede">
        Former members are included and marked retired — they are part of the league&apos;s
        history, so hiding them would quietly rewrite it.
      </p>
      <section>
        <h3>Regular season</h3>
        {table(regular)}
      </section>
      <section>
        <h3>Every game, playoffs and toilet bowl included</h3>
        {table(everything)}
      </section>
    </>
  );
}
