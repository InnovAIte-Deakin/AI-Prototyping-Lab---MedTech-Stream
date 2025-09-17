import './globals.css';
import '../../styles/header.css';
import '../../styles/parse.css';
import type { ReactNode } from 'react';
import Header from '@/components/Header';

export const metadata = {
  title: 'ReportX',
  description: 'Educational health explanations (no storage)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main id="main" className="container">{children}</main>
        <footer className="container footer">
          <div>© {new Date().getFullYear()} ReportX — Educational only, not medical advice.</div>
        </footer>
      </body>
    </html>
  );
}
