/**
 * Shown when no database is configured, or when it holds no data yet.
 *
 * The site is deployed before the database exists, so this is a normal state and
 * not an error page — it explains what is missing and what to do, rather than
 * showing an empty table and letting the visitor wonder if the league has no
 * history.
 */
export function NotConnected({ configured }: { configured: boolean }): React.ReactElement {
  return (
    <div className="notice">
      <h2>{configured ? 'No league data loaded yet' : 'Not connected to the database yet'}</h2>
      {configured ? (
        <>
          <p className="muted">
            The site can reach the database, but no seasons have been imported. Run the
            historical backfill once against the commissioner&apos;s workbook:
          </p>
          <pre>
            pnpm migrate{'\n'}
            pnpm --filter @jff/sync backfill --file RBB_League_History.xlsx
          </pre>
        </>
      ) : (
        <>
          <p className="muted">
            This deployment has no <code>DATABASE_URL</code> set, so there is nothing to read.
            The site builds and deploys without one on purpose — that way the deployment
            pipeline works before the database exists.
          </p>
          <p className="muted tiny">
            To bring it to life: create a Postgres database (Supabase&apos;s free tier is
            enough for nine seasons), add <code>DATABASE_URL</code> to the Vercel project&apos;s
            environment variables, run the migrations, then run the backfill.
          </p>
        </>
      )}
    </div>
  );
}
