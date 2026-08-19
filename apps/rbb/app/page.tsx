import Link from 'next/link';
import { NoData } from '../components/NoData.tsx';
import { ScrollTable } from '../components/Table.tsx';
import { int, num, pct, record } from '../lib/format.ts';
import { champions, hasData, standings as allStandings, titleCounts, totals as leagueTotals } from '../lib/data.ts';

export default function HomePage(): React.ReactElement {
  if (!hasData()) return <NoData />;

  const totals = leagueTotals();
  const champs = champions();
  const titles = titleCounts();
  const standings = allStandings('regular');

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
            <div className="n">{int(totals.lineup_rows)}</div>
            <div className="l">Lineup rows</div>
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
        <ul className="plain card card-pad">
          {titles.map((t) => (
            <li key={t.manager_id} className="row-between">
              <span>
                <Link href={`/managers/${t.manager_id}`}>{t.display_name}</Link>{' '}
                <span className="muted tiny">{t.years}</span>
              </span>
              <strong>
                {t.titles} {t.titles === 1 ? 'title' : 'titles'}
              </strong>
            </li>
          ))}
        </ul>
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
