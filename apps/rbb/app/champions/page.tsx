import Link from 'next/link';
import { champions, isDatabaseConfigured, titleCounts } from '@jff/db';
import { NotConnected } from '../../components/NotConnected.tsx';
import { ordinal } from '../../lib/format.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Champions — Risky Biscuit Brigade' };

export default async function ChampionsPage(): Promise<React.ReactElement> {
  const [champs, titles] = await Promise.all([champions('rbb'), titleCounts('rbb')]);
  if (champs.length === 0) return <NotConnected configured={isDatabaseConfigured()} />;

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
        <ul className="plain card card-pad">
          {titles.map((t) => (
            <li key={t.manager_id} className="row-between">
              <span>
                <Link href={`/managers/${t.manager_id}`}>{t.display_name}</Link>
                {t.canonical_name !== t.display_name ? (
                  <span className="muted tiny"> · {t.canonical_name}</span>
                ) : null}
              </span>
              <span>
                <strong>{t.titles}</strong> <span className="muted tiny">{t.years}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
