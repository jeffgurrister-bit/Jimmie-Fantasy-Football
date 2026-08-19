import Link from 'next/link';

export default function NotFound(): React.ReactElement {
  return (
    <div className="notice">
      <h2>Nothing here</h2>
      <p className="muted">
        That season or manager isn&apos;t in the league history.{' '}
        <Link href="/">Back to the front page</Link>.
      </p>
    </div>
  );
}
