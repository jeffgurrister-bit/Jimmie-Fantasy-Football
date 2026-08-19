import Link from 'next/link';
import { benchRegret, draftSlotPerformance, isDatabaseConfigured } from '@jff/db';
import { NotConnected } from '../../components/NotConnected.tsx';
import { ScrollTable } from '../../components/Table.tsx';
import { int, num, ordinal, pct } from '../../lib/format.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bench regret — Risky Biscuit Brigade' };

export default async function BenchPage(): Promise<React.ReactElement> {
  const [regret, slots] = await Promise.all([
    benchRegret('rbb', 25),
    draftSlotPerformance('rbb'),
  ]);
  if (regret.length === 0) return <NotConnected configured={isDatabaseConfigured()} />;

  return (
    <>
      <h2>Bench regret</h2>
      <p className="lede">
        The worst lineup decisions in league history: points scored by a player left on
        the bench, over and above the starter who played instead. Drawn from every one of
        the league&apos;s ~24,700 recorded roster slots.
      </p>

      <section>
        <ScrollTable
          head={
            <tr>
              <th>Manager</th>
              <th>Left on bench</th>
              <th>He scored</th>
              <th>Player</th>
              <th>When</th>
            </tr>
          }
        >
          {regret.map((r, i) => (
            <tr key={`${r.year}-${r.week}-${r.manager_id}-${i}`}>
              <td>
                <Link href={`/managers/${r.manager_id}`}>{r.display_name}</Link>
              </td>
              <td className="num-strong loss">+{num(r.bench_gap)}</td>
              <td>{num(r.points)}</td>
              <td className="muted">{r.player_name ?? '—'}</td>
              <td className="muted">
                <Link href={`/seasons/${r.year}`}>{r.year}</Link> wk {r.week}
              </td>
            </tr>
          ))}
        </ScrollTable>
      </section>

      <section>
        <h2>Does the draft slot matter?</h2>
        <p className="lede">
          Regular-season win rate by the draft slot each team picked from that year.
        </p>
        <ScrollTable
          hint={false}
          head={
            <tr>
              <th>Drafted from</th>
              <th>Games</th>
              <th>Wins</th>
              <th>Win rate</th>
            </tr>
          }
        >
          {slots.map((s) => (
            <tr key={s.draft_slot}>
              <td>{ordinal(s.draft_slot)}</td>
              <td>{int(s.games)}</td>
              <td>{int(s.wins)}</td>
              <td className="num-strong">{pct(s.win_pct)}</td>
            </tr>
          ))}
        </ScrollTable>
      </section>
    </>
  );
}
