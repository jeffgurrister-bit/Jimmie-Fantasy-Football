import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScrollTable } from '../../../components/Table.tsx';
import { int, num, ordinal, record } from '../../../lib/format.ts';
import { seasonGames, seasonStandings, seasonSummary, seasonYears } from '../../../lib/data.ts';
import { divisionLogo } from '../../../lib/divisions.ts';

/** Prerenders one page per season at build time. */
export function generateStaticParams(): Array<{ year: string }> {
  return seasonYears().map((year) => ({ year: String(year) }));
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<React.ReactElement> {
  const { year: yearParam } = await params;
  const year = Number.parseInt(yearParam, 10);
  if (Number.isNaN(year)) notFound();

  const summary = seasonSummary(year);
  const standings = seasonStandings(year);
  const games = seasonGames(year);
  if (!summary && standings.length === 0) notFound();

  // Group by week so the results read like a season rather than a flat list.
  const weeks = new Map<number, typeof games>();
  for (const g of games) {
    const list = weeks.get(g.week) ?? [];
    list.push(g);
    weeks.set(g.week, list);
  }

  const divisions = [...new Set(standings.map((s) => s.division_name).filter(Boolean))];

  return (
    <>
      <h2>
        {year} season
        {summary?.champion_manager_id ? (
          <span className="count">
            Champion:{' '}
            <Link href={`/managers/${summary.champion_manager_id}`}>
              {summary.champion_display_name}
            </Link>
          </span>
        ) : (
          <span className="count">no champion recorded</span>
        )}
      </h2>

      {!summary?.champion_manager_id ? (
        <p className="lede">
          This season&apos;s final placings have not been filled in on the source
          spreadsheet, so the site can show the regular season but not the postseason.
        </p>
      ) : null}

      {divisions.length > 0 ? (
        <section>
          <h3>Divisions</h3>
          <div className="divisions">
            {divisions.map((d) => {
              const logo = divisionLogo(d);
              return (
                <span className="division-mark" key={d}>
                  {logo ? <img src={logo} alt="" width={42} height={42} /> : null}
                  {d}
                </span>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h3>Final standings</h3>
        <ScrollTable
          head={
            <tr>
              <th>Manager</th>
              {divisions.length > 0 ? <th>Division</th> : null}
              <th>W-L</th>
              <th>PF</th>
              <th>PA</th>
              <th>Reg.</th>
              <th>Final</th>
              <th>Draft slot</th>
            </tr>
          }
        >
          {standings.map((s) => (
            <tr key={s.manager_id}>
              <td>
                <Link href={`/managers/${s.manager_id}`}>{s.display_name}</Link>
                {s.final_finish === 1 ? <span className="pill gold"> Champ</span> : null}
              </td>
              {divisions.length > 0 ? (
                <td className="muted">{s.division_name ?? '—'}</td>
              ) : null}
              <td className="num-strong">{record(s.wins, s.losses)}</td>
              <td>{int(s.points_for)}</td>
              <td>{int(s.points_against)}</td>
              <td>{ordinal(s.regular_finish)}</td>
              <td>{ordinal(s.final_finish)}</td>
              <td>{ordinal(s.draft_slot)}</td>
            </tr>
          ))}
        </ScrollTable>
      </section>

      <section>
        <h2>
          Results <span className="count">{games.length} games</span>
        </h2>
        {[...weeks.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([week, list]) => (
            <div key={week} style={{ marginBottom: 14 }}>
              <h3>
                Week {week}
                {list[0] && list[0].time_of_season !== 'Regular' ? (
                  <span className="pill" style={{ marginLeft: 8 }}>
                    {list[0].time_of_season === 'TB' ? 'Toilet bowl' : 'Playoffs'}
                  </span>
                ) : null}
              </h3>
              <ScrollTable hint={false} head={null} variant="scores">
                {list.map((g) => {
                  const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
                  return (
                    <tr key={g.game_id}>
                      {/* Winner in bold, loser dimmed. Colouring both names green and
                          red made every row shout; weight carries it more quietly. */}
                      <td className={homeWon ? 'strong' : 'muted'}>{g.home_name}</td>
                      <td className={homeWon ? 'num-strong' : 'muted'}>{num(g.home_score)}</td>
                      <td className="muted dash">–</td>
                      <td className={homeWon ? 'muted' : 'num-strong'}>{num(g.away_score)}</td>
                      <td className={homeWon ? 'muted' : 'strong'}>{g.away_name ?? '—'}</td>
                      <td className="muted tiny">{g.round_game ?? ''}</td>
                    </tr>
                  );
                })}
              </ScrollTable>
            </div>
          ))}
      </section>
    </>
  );
}
