'use client';

import React, { useEffect } from 'react';

export type ViewScope = 'summary_only' | 'full_report' | 'full_report_with_threads';

export type SharingPreferencesPanelProps = {
  open: boolean;
  onClose: () => void;
  onShare: () => void;
  onRevoke?: () => void;
  clinicianEmail: string;
  onClinicianEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  viewScope: ViewScope;
  onViewScopeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  includeDoctorSummary: boolean;
  onIncludeDoctorSummaryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  expiresAt: number;
  onExpiresAtChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  shareActive?: boolean;
  statusMessage?: string;
};

export function SharingPreferencesPanel({
  open,
  onClose,
  onShare,
  onRevoke,
  clinicianEmail,
  onClinicianEmailChange,
  viewScope,
  onViewScopeChange,
  includeDoctorSummary,
  onIncludeDoctorSummaryChange,
  expiresAt,
  onExpiresAtChange,
  shareActive,
  statusMessage,
}: SharingPreferencesPanelProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="sharing-panel-overlay"
        data-testid="sharing-panel-overlay"
        onClick={onClose}
      />
      <aside className="sharing-panel" role="complementary" aria-label="Sharing Preferences">
        <div className="sharing-panel-header">
          <h2 className="sharing-panel-title">Sharing Preferences</h2>
          <button
            type="button"
            className="sharing-panel-close"
            onClick={onClose}
            aria-label="Close sharing panel"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="sharing-panel-body">
          <div className="sharing-panel-field">
            <label htmlFor="sp-clinician-email" className="sharing-panel-label">
              Clinician Email
            </label>
            <input
              id="sp-clinician-email"
              type="email"
              className="input"
              placeholder="dr.smith@hospital.org"
              value={clinicianEmail}
              onChange={onClinicianEmailChange}
            />
          </div>

          <div className="sharing-panel-row">
            <div className="sharing-panel-field">
              <label htmlFor="sp-access-scope" className="sharing-panel-label">
                Access Scope
              </label>
              <select
                id="sp-access-scope"
                className="input"
                aria-label="Access scope"
                value={viewScope}
                onChange={onViewScopeChange}
              >
                <option value="summary_only">Summary only</option>
                <option value="full_report">Full report</option>
                <option value="full_report_with_threads">Full report + threads</option>
              </select>
            </div>

            <div className="sharing-panel-field">
              <label htmlFor="sp-expiry-date" className="sharing-panel-label">
                Expiry Date
              </label>
              <input
                id="sp-expiry-date"
                type="date"
                className="input"
                value={new Date(expiresAt).toISOString().slice(0, 10)}
                onChange={onExpiresAtChange}
              />
            </div>
          </div>

          <div className="sharing-panel-field">
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer', fontSize: 'var(--text-body-sm)' }}
            >
              <input
                type="checkbox"
                aria-label="Include doctor summary"
                checked={includeDoctorSummary}
                onChange={onIncludeDoctorSummaryChange}
                style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
              />
              Include doctor-ready summary in clinician view
            </label>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg sharing-panel-share-btn"
            onClick={onShare}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
            Share Report
          </button>

          {shareActive && onRevoke && (
            <button
              type="button"
              className="btn btn-danger btn-md"
              onClick={onRevoke}
              style={{ width: '100%', marginTop: 'var(--space-3)' }}
            >
              Revoke Access
            </button>
          )}

          <p className="sharing-panel-note">
            A secure, encrypted link will be sent to the clinician. You can revoke access at any time in settings.
          </p>

          {statusMessage && (
            <p className="sharing-panel-status">{statusMessage}</p>
          )}
        </div>
      </aside>
    </>
  );
}
