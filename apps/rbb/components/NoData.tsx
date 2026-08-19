/**
 * Shown when the committed snapshot is empty — a fresh checkout before anyone has
 * run the generator. Not an error, and not something a visitor should ever see on
 * the live site.
 */
export function NoData(): React.ReactElement {
  return (
    <div className="notice">
      <h2>No league data yet</h2>
      <p className="muted">
        The site reads a snapshot generated from the commissioner&apos;s workbook, and
        that snapshot is currently empty. Generate it once:
      </p>
      <pre>pnpm snapshot --file RBB_League_History.xlsx</pre>
      <p className="muted tiny">
        Then commit <code>apps/rbb/data/snapshot.json</code>. No database required.
      </p>
    </div>
  );
}
