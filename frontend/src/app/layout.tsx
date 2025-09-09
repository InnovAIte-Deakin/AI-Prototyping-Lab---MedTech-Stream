
import './globals.css';
import '../../styles/theme.css';
import type { ReactNode } from 'react';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata = {
  title: 'ReportRx',
  description: 'Educational health explanations (no storage)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="header">
          <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.5rem' }}>
            <a href="/" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
              <strong>ReportRx</strong>
            </a>
            <nav aria-label="Primary">
              <ul style={{ display: 'flex', gap: '0.75rem', listStyle: 'none', margin: 0, padding: 0 }}>
                <li><a href="/" className="btn btn-outline">Home</a></li>
                <li><a href="/parse" className="btn btn-primary">Parse</a></li>
                <li><a href="/health" className="btn btn-outline">Health</a></li>
                <li><ThemeToggle /></li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" className="container">{children}</main>
        <footer className="container footer">
          <div>© {new Date().getFullYear()} ReportRx — Educational only, not medical advice.</div>
        </footer>
      </body>
    </html>
  );
}
