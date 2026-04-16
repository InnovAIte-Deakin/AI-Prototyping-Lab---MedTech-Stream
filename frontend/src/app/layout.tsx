import './globals.css';
import '../../styles/header.css';
import '../../styles/parse.css';
import '../../styles/report-detail.css';
import type { ReactNode } from 'react';
import Header from '@/components/Header';
import { AuthProvider } from '@/store/authStore';

export const metadata = {
  title: 'ReportX',
  description: 'Educational health explanations with optional user accounts and saved reports',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Header />
          <main id="main" className="container">{children}</main>
          <footer className="footer">
            <div className="footer-inner">
              <div>
                <strong>ReportX</strong>
                <br />
                <span>&copy; {new Date().getFullYear()} ReportX Clinical Excellence</span>
              </div>
              <div className="footer-links">
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
                <a href="/contact">Contact</a>
              </div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
