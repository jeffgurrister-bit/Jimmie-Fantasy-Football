import Link from 'next/link';
import { NoData } from '../components/NoData.tsx';
import { ScrollTable } from '../components/Table.tsx';
import { int, num, pct, record } from '../lib/format.ts';
import {
  champions, hasData, seasons as allSeasons, standings as allStandings, titleCounts,
  totals as leagueTotals,
} from '../lib/data.ts';

export default function HomePage(): React.ReactElement {
  if (!hasData()) return <NoData />;

  const totals = leagueTotals();
  const champs = champions();
  const titles = titleCounts();
  const standings = allStandings('regular');
  // Seasons that were played but whose final placings are not filled in on the
  // source sheet. Shown alongside the winners so the wall does not look as though
  // the league simply stopped.
  const unrecorded = allSeasons().filter((s) => s.champion_manager_id === null);

  return (
    <>
      <section>
        <div className="tiles">
          <div className="tile">
            <div className="n">{int(totals.seasons)}</div>
            <div className="l">Seasons</div>
          </div>
          <div className="tile">
            <div className="n">{int(totals.games)}</div>
            <div className="l">Games</div>
          </div>
          <div className="tile">
            <div className="n">{int(totals.managers)}</div>
            <div className="l">Managers</div>
          </div>
          <div className="tile">
            <div className="n">{int(totals.draft_picks)}</div>
            <div className="l">Draft picks</div>
          </div>
        </div>
      </section>

      <section>
        <h2>
          Champions <span className="count">{champs.length} recorded</span>
        </h2>
        <div className="banners">
          {unrecorded.map((s) => (
            <div className="banner pending" key={s.year}>
              <div className="yr">{s.year}</div>
              <div className="who muted">Not recorded</div>
              <div className="real">Playoff results missing from the sheet</div>
            </div>
          ))}
          {champs.map((c) => (
            <div className="banner" key={c.year}>
              <div className="yr">{c.year}</div>
              <div className="who">
                <Link href={`/managers/${c.manager_id}`}>{c.display_name}</Link>
              </div>
              {c.canonical_name !== c.display_name ? (
                <div className="real">{c.canonical_name}</div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Most titles</h2>
        <ScrollTable
          hint={false}
          head={
            <tr>
              <th>Manager</th>
              <th>Titles</th>
              <th>Years</th>
            </tr>
          }
        >
          {titles.map((t) => (
            <tr key={t.manager_id}>
              <td>
                <Link href={`/managers/${t.manager_id}`}>{t.display_name}</Link>
              </td>
              <td className="num-strong">{t.titles}</td>
              <td className="muted">{t.years}</td>
            </tr>
          ))}
        </ScrollTable>
      </section>

      <section>
        <h2>
          All-time standings <span className="count">regular season only</span>
        </h2>
        <p className="lede">
          Playoff games are excluded, because counting them rewards whoever made the
          most playoffs twice over.
        </p>
        <ScrollTable
          head={
            <tr>
              <th>Manager</th>
              <th>W-L</th>
              <th>Pct</th>
              <th>PPG</th>
              <th>PF</th>
              <th>PA</th>
              <th>Titles</th>
            </tr>
          }
        >
          {standings.map((s) => (
            <tr key={s.manager_id}>
              <td>
                <Link href={`/managers/${s.manager_id}`}>{s.display_name}</Link>{' '}
                {s.is_active ? null : <span className="pill muted">Retired</span>}
              </td>
              <td className="num-strong">{record(s.wins, s.losses)}</td>
              <td>{pct(s.win_pct)}</td>
              <td>{num(s.ppg)}</td>
              <td>{int(s.points_for)}</td>
              <td>{int(s.points_against)}</td>
              <td>{s.titles > 0 ? <span className="pill gold">{s.titles}</span> : '—'}</td>
            </tr>
          ))}
        </ScrollTable>
      </section>
    </>
  );
}
