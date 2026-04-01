"use client";
import Disclaimer from '@/components/Disclaimer';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  return (
    <div className="stack">
      <section className="hero">
        <h1 className="hero-title">Understand your lab results with confidence</h1>
        <p className="hero-sub">ReportX explains lab reports in clear language. Use anonymous parsing instantly, or create an account to save and revisit reports anytime.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Button variant="primary" size="lg" onClick={() => (window.location.href = '/parse')}>Review My Report</Button>
          <Button variant="outline" size="lg" onClick={() => (window.location.href = '/reports')}>My Reports</Button>
          <Button variant="outline" size="lg" onClick={() => (window.location.href = '/auth/login')}>Login</Button>
          <Button variant="outline" size="lg" onClick={() => (window.location.href = '/auth/register')}>Register</Button>
          <Button variant="outline" size="lg" onClick={() => (window.location.href = '/health')}>Check Backend Health</Button>
        </div>
      </section>

      <Disclaimer />
    </div>
  );
}
