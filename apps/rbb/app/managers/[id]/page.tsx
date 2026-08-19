import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headToHead, managerProfile, managerSeasons } from '@jff/db';
import { ScrollTable } from '../../../components/Table.tsx';
import { int, num, ordinal, pct, record } from '../../../lib/format.ts';

export const dynamic = 'force-dynamic';

export default async function ManagerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const [profile, seasons, h2h] = await Promise.all([
    managerProfile('rbb', id),
    managerSeasons('rbb', id),
    headToHead('rbb', id),
  ]);
  if (!profile) notFound();

  const winPct = profile.wins + profile.losses > 0
    ? profile.wins / (profile.wins + profile.losses)
    : 0;

  return (
    <>
      <h2>
        {profile.display_name}
        {profile.is_active ? null : <span className="pill muted">Retired</span>}
        {profile.is_confirmed ? null : <span className="pill">Identity provisional</span>}
      </h2>
      {profile.canonical_name !== profile.display_name ? (
        <p className="lede">{profile.canonical_name}</p>
      ) : null}

      <section>
        <div className="tiles">
          <div className="tile">
            <div className="n">{profile.titles}</div>
            <div className="l">{profile.titles === 1 ? 'Title' : 'Titles'}</div>
          </div>
          <div className="tile">
            <div className="n">{record(profile.wins, profile.losses)}</div>
            <div className="l">Regular season</div>
          </div>
          <div className="tile">
            <div className="n">{num(profile.ppg)}</div>
            <div className="l">Points per game</div>
          </div>
          <div className="tile">
            <div className="n">{profile.seasons}</div>
            <div className="l">Seasons</div>
          </div>
        </div>
        <p className="lede tiny" style={{ marginTop: 10 }}>
          Win rate {pct(winPct)} · best game {num(profile.best_game)} · worst{' '}
          {num(profile.worst_game)} · {int(profile.points_for)} career points
          {profile.first_year ? ` · played from ${profile.first_year}` : ''}
          {profile.last_year ? ` to ${profile.last_year}` : ''}
        </p>
      </section>

      <section>
        <h2>Season by season</h2>
        <ScrollTable
          head={
            <tr>
              <th>Season</th>
              <th>W-L</th>
              <th>PF</th>
              <th>Reg.</th>
              <th>Final</th>
              <th>Division</th>
            </tr>
          }
        >
          {seasons.map((s) => (
            <tr key={s.year}>
              <td>
                <Link href={`/seasons/${s.year}`}>{s.year}</Link>
                {s.final_finish === 1 ? <span className="pill gold"> Champ</span> : null}
              </td>
              <td className="num-strong">{record(s.wins, s.losses)}</td>
              <td>{int(s.points_for)}</td>
              <td>{ordinal(s.regular_finish)}</td>
              <td>{ordinal(s.final_finish)}</td>
              <td className="muted">{s.division_name ?? '—'}</td>
            </tr>
          ))}
        </ScrollTable>
      </section>

      <section>
        <h2>
          Head to head <span className="count">all games, all seasons</span>
        </h2>
        <ScrollTable
          head={
            <tr>
              <th>Opponent</th>
              <th>Meetings</th>
              <th>W-L</th>
              <th>Pct</th>
            </tr>
          }
        >
          {h2h.map((o) => (
            <tr key={o.opponent_manager_id}>
              <td>
                <Link href={`/managers/${o.opponent_manager_id}`}>{o.opponent_name}</Link>
              </td>
              <td>{o.games}</td>
              <td className="num-strong">
                <span className={o.wins > o.losses ? 'win' : o.wins < o.losses ? 'loss' : ''}>
                  {record(o.wins, o.losses)}
                </span>
              </td>
              <td>{pct(o.games > 0 ? o.wins / o.games : 0)}</td>
            </tr>
          ))}
        </ScrollTable>
      </section>
    </>
  );
}
