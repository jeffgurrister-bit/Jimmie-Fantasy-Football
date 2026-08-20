import Link from 'next/link';
import { NoData } from '../../components/NoData.tsx';
import { ScrollTable } from '../../components/Table.tsx';
import { ordinal } from '../../lib/format.ts';
import { champions, titleCounts } from '../../lib/data.ts';

export const metadata = { title: 'Champions — Risky Biscuit Brigade' };

export default function ChampionsPage(): React.ReactElement {
  const champs = champions();
  const titles = titleCounts();
  if (champs.length === 0) return <NoData />;

  return (
    <>
      <h2>The banner wall</h2>
      <p className="lede">
        Every recorded champion. A season appears here once its final placings are
        entered in the <code>Finishes</code> sheet.
      </p>
      <section>
        <div className="banners">
          {champs.map((c) => (
            <div className="banner" key={c.year}>
              <div className="yr">{c.year} CHAMPION</div>
              <div className="who">
                <Link href={`/managers/${c.manager_id}`}>{c.display_name}</Link>
              </div>
              {c.canonical_name !== c.display_name ? (
                <div className="real">{c.canonical_name}</div>
              ) : null}
              <div className="real">
                Finished {ordinal(c.regular_finish)} in the regular season
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Titles per manager</h2>
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
                {t.canonical_name !== t.display_name ? (
                  <span className="muted tiny"> · {t.canonical_name}</span>
                ) : null}
              </td>
              <td className="num-strong">{t.titles}</td>
              <td className="muted">{t.years}</td>
            </tr>
          ))}
        </ScrollTable>
      </section>
    </>
  );
}
