"use client";
import Disclaimer from '@/components/Disclaimer';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  return (
    <div className="stack">
      {/* Hero — matches Figma: large heading with accent color on "Lab Results" */}
      <section className="hero">
        <h1 className="hero-title">
          Understand Your{' '}
          <span className="hero-accent">Lab Results</span>.
        </h1>
        <p className="hero-sub">
          Get clinical-grade clarity on your blood work and diagnostic tests.
          We translate complex medical jargon so you can talk confidently with
          your clinician. Use anonymous parsing instantly, or create an account to save and revisit reports anytime.
        </p>
      </section>

      {/* Upload section placeholder — directs to /parse */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', justifyContent: 'center', marginTop: 'var(--space-4)' }}>
        <Button variant="primary" size="lg" onClick={() => (window.location.href = '/parse')}>
          Review My Report
        </Button>
        <Button variant="outline" size="lg" onClick={() => (window.location.href = '/reports')}>
          My Reports
        </Button>
        <Button variant="outline" size="lg" onClick={() => (window.location.href = '/auth/login')}>
          Login
        </Button>
        <Button variant="outline" size="lg" onClick={() => (window.location.href = '/auth/register')}>
          Register
        </Button>
      </div>

      {/* Feature cards — 3-column with accent bars matching Figma */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)', marginTop: 'var(--space-8)' }}>
        <div className="feature-card">
          <svg className="feature-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3>Smart Markers</h3>
          <p>Our AI recognizes over 4,000 unique biomarkers across hematology, metabolic, and hormonal panels.</p>
        </div>
        <div className="feature-card accent-purple">
          <svg className="feature-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
          </svg>
          <h3>Trend Analysis</h3>
          <p>Upload multiple reports to see how your levels change over time with high-precision trend visualization.</p>
        </div>
        <div className="feature-card accent-orange">
          <svg className="feature-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3>Doctor-Ready</h3>
          <p>Generated insights include specific questions and talking points for your next physician consultation.</p>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
