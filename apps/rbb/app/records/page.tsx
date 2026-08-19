import Link from 'next/link';
import { isDatabaseConfigured, marginRecords, recordGames } from '@jff/db';
import { NotConnected } from '../../components/NotConnected.tsx';
import { ScrollTable } from '../../components/Table.tsx';
import { num } from '../../lib/format.ts';
import type { RecordGame } from '@jff/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Records — Risky Biscuit Brigade' };

function GameTable({ rows, showDiff }: { rows: RecordGame[]; showDiff?: boolean }) {
  return (
    <ScrollTable
      hint={false}
      head={
        <tr>
          <th>Manager</th>
          <th>Score</th>
          {showDiff ? <th>Margin</th> : null}
          <th>Opponent</th>
          <th>When</th>
        </tr>
      }
    >
      {rows.map((r, i) => (
        <tr key={`${r.year}-${r.week}-${r.manager_id}-${i}`}>
          <td>
            <Link href={`/managers/${r.manager_id}`}>{r.display_name}</Link>
          </td>
          <td className="num-strong">{num(r.score)}</td>
          {showDiff ? <td>{num(r.point_diff)}</td> : null}
          <td className="muted">
            {r.opponent_name ?? '—'} <span className="tiny">({num(r.opponent_score)})</span>
          </td>
          <td className="muted">
            <Link href={`/seasons/${r.year}`}>{r.year}</Link> wk {r.week}
          </td>
        </tr>
      ))}
    </ScrollTable>
  );
}

export default async function RecordsPage(): Promise<React.ReactElement> {
  const [careerHigh, careerLow, blowouts, nailbiters] = await Promise.all([
    recordGames('rbb', 'career_high'),
    recordGames('rbb', 'career_low'),
    marginRecords('rbb', 'blowout'),
    marginRecords('rbb', 'nailbiter'),
  ]);
  if (careerHigh.length === 0) return <NotConnected configured={isDatabaseConfigured()} />;

  return (
    <>
      <h2>Records book</h2>
      <p className="lede">
        These come straight from the commissioner&apos;s own spreadsheet markers rather than
        being recalculated here — his definitions are the ones the league argues about.
        Each manager has exactly one career-best and one career-worst game.
      </p>

      <section>
        <h2>
          Career-best games <span className="count">one per manager</span>
        </h2>
        <GameTable rows={careerHigh} />
      </section>

      <section>
        <h2>Biggest blowouts</h2>
        <GameTable rows={blowouts} showDiff />
      </section>

      <section>
        <h2>Closest games</h2>
        <GameTable rows={nailbiters} showDiff />
      </section>

      <section>
        <h2>
          Career-worst games <span className="count">one per manager</span>
        </h2>
        <GameTable rows={careerLow} />
      </section>
    </>
  );
}
