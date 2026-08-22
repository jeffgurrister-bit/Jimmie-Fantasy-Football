import Link from 'next/link';
import { NoData } from '../../components/NoData.tsx';
import { powerRankingYears, powerRankings } from '../../lib/data.ts';

export const metadata = { title: 'Power rankings — Risky Biscuit Brigade' };

export default function PowerRankingsIndex(): React.ReactElement {
  const years = powerRankingYears();
  if (years.length === 0) return <NoData />;

  return (
    <>
      <h2>Power rankings</h2>
      <p className="lede">
        Every week the commissioner has published, {years.at(-1)} to {years[0]} — the
        rankings, the movement, and the write-ups, as pages instead of screenshots.
      </p>
      <div className="banners">
        {years.map((y) => {
          const weeks = new Set(powerRankings(y).map((r) => r.week)).size;
          return (
            <Link className="banner season-link" href={`/power-rankings/${y}`} key={y}>
              <div className="yr">{y}</div>
              <div className="who">{weeks} weeks</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
