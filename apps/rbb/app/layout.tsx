import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Nav } from '../components/Nav.tsx';
import './globals.css';

export const metadata: Metadata = {
  title: 'Risky Biscuit Brigade — League History',
  description:
    'Nine seasons of Risky Biscuit Brigade fantasy football: champions, all-time ' +
    'standings, records, drafts and every lineup ever set.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#5a4632' },
    { media: '(prefers-color-scheme: dark)', color: '#14100c' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="wrap">
            <div className="brand">
              {/* The league's own logo, lifted out of the League History sheet. */}
              <img src="/logos/league.png" alt="" width={46} height={46} />
              <div>
                <h1>
                  <Link href="/">Risky Biscuit Brigade</Link>
                </h1>
                <p className="tagline">League history since 2016</p>
              </div>
            </div>
          </div>
          <Nav />
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site">
          <div className="wrap">
            Built from the commissioner&apos;s own spreadsheets — they stay the system of
            record, and the site follows them.
          </div>
        </footer>
      </body>
    </html>
  );
}
