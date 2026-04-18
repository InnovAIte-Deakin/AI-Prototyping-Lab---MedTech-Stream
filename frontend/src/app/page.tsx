'use client';

import Disclaimer from '@/components/Disclaimer';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  return (
    <div className="stack-loose">
      <section className="hero">
        <span className="eyebrow">for patients, in plain language</span>
        <h1 className="hero-title">
          Lab results, explained <em>gently</em>.
        </h1>
        <p className="hero-sub">
          Upload a report, or paste the numbers from a printout. ReportX walks you through what
          each value means in plain words, translates it into your language, and if you want to,
          keeps a private history you can share with your clinician on your terms. Create an
          account to save and revisit reports anytime.
        </p>

        <div
          style={{
            display: 'flex',
            gap: '0.65rem',
            flexWrap: 'wrap',
            marginTop: '1.75rem',
            alignItems: 'center',
          }}
        >
          <Button variant="primary" size="lg" onClick={() => (window.location.href = '/parse')}>
            Review my report
          </Button>
          <Button variant="outline" size="lg" onClick={() => (window.location.href = '/reports')}>
            My reports
          </Button>
          <span
            aria-hidden="true"
            style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 0.25rem' }}
          />
          <Button variant="outline" onClick={() => (window.location.href = '/auth/login')}>
            Login
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = '/auth/register')}>
            Register
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = '/health')}>
            Health check
          </Button>
        </div>
      </section>

      <section
        className="stack-tight"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.25rem',
          marginTop: '2rem',
        }}
      >
        <article className="card">
          <span className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            Private by default
          </span>
          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 'var(--step-1)', fontWeight: 500 }}>
            Nothing is shared unless you say so.
          </h4>
          <p className="muted" style={{ fontSize: '0.95rem', marginBottom: 0 }}>
            Anonymous parsing runs without an account. If you sign up, your reports live behind
            your session and nobody else sees a row until you grant a clinician access, with a
            time limit you set.
          </p>
        </article>

        <article className="card">
          <span className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            No fabrication
          </span>
          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 'var(--step-1)', fontWeight: 500 }}>
            When data is missing, we say so.
          </h4>
          <p className="muted" style={{ fontSize: '0.95rem', marginBottom: 0 }}>
            A single test result doesn't get a made-up trend line. A revoked share disappears
            immediately. An unsupported language falls back honestly to English.
          </p>
        </article>

        <article className="card">
          <span className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            Written for humans
          </span>
          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 'var(--step-1)', fontWeight: 500 }}>
            Fewer acronyms. More sentences.
          </h4>
          <p className="muted" style={{ fontSize: '0.95rem', marginBottom: 0 }}>
            Each flagged finding comes with a short, readable explanation. You can ask structured
            questions, and a clinician can reply with a template that still reads like a person.
          </p>
        </article>
      </section>

      <Disclaimer />
    </div>
  );
}
