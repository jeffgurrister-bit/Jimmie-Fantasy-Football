import Link from 'next/link';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/champions', label: 'Champions' },
  { href: '/standings', label: 'All-time' },
  { href: '/seasons', label: 'Seasons' },
  { href: '/records', label: 'Records' },
  { href: '/bench', label: 'Bench regret' },
];

export function Nav({ current }: { current?: string }): React.ReactElement {
  return (
    <nav className="tabs" aria-label="Sections">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.href === current ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
