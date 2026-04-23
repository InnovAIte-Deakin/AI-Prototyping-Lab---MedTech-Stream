import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SharingPreferencesPanel } from '../SharingPreferencesPanel';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onShare: vi.fn(),
  clinicianEmail: '',
  onClinicianEmailChange: vi.fn(),
  scope: 'summary' as const,
  onScopeChange: vi.fn(),
  expiresAt: Date.now() + 86400000,
  onExpiresAtChange: vi.fn(),
};

describe('SharingPreferencesPanel', () => {
  it('renders nothing when closed', () => {
    render(<SharingPreferencesPanel {...defaultProps} open={false} />);
    expect(screen.queryByText('Sharing Preferences')).not.toBeInTheDocument();
  });

  it('renders panel when open', () => {
    render(<SharingPreferencesPanel {...defaultProps} />);
    expect(screen.getByText('Sharing Preferences')).toBeInTheDocument();
  });

  it('renders clinician email input', () => {
    render(<SharingPreferencesPanel {...defaultProps} />);
    expect(screen.getByLabelText(/clinician email/i)).toBeInTheDocument();
  });

  it('renders access scope selector', () => {
    render(<SharingPreferencesPanel {...defaultProps} />);
    expect(screen.getByLabelText(/access scope/i)).toBeInTheDocument();
  });

  it('renders expiry date input', () => {
    render(<SharingPreferencesPanel {...defaultProps} />);
    expect(screen.getByLabelText(/expiry date/i)).toBeInTheDocument();
  });

  it('renders share button', () => {
    render(<SharingPreferencesPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /share report/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<SharingPreferencesPanel {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', async () => {
    const onClose = vi.fn();
    render(<SharingPreferencesPanel {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('sharing-panel-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onShare when share button is clicked', async () => {
    const onShare = vi.fn();
    render(<SharingPreferencesPanel {...defaultProps} onShare={onShare} />);
    await userEvent.click(screen.getByRole('button', { name: /share report/i }));
    expect(onShare).toHaveBeenCalled();
  });

  it('calls onClinicianEmailChange when email is typed', async () => {
    const onClinicianEmailChange = vi.fn();
    render(<SharingPreferencesPanel {...defaultProps} onClinicianEmailChange={onClinicianEmailChange} />);
    await userEvent.type(screen.getByLabelText(/clinician email/i), 'dr@test.com');
    expect(onClinicianEmailChange).toHaveBeenCalled();
  });

  it('shows scope options: Summary only and Full report', () => {
    render(<SharingPreferencesPanel {...defaultProps} />);
    const select = screen.getByLabelText(/access scope/i);
    const options = within(select).getAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(
      expect.arrayContaining(['Summary only', 'Full report'])
    );
  });

  it('shows security note text', () => {
    render(<SharingPreferencesPanel {...defaultProps} />);
    expect(screen.getByText(/secure.*encrypted/i)).toBeInTheDocument();
  });

  it('renders revoke button when active share exists', () => {
    render(<SharingPreferencesPanel {...defaultProps} shareActive onRevoke={vi.fn()} />);
    expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument();
  });

  it('does not render revoke button when no active share', () => {
    render(<SharingPreferencesPanel {...defaultProps} shareActive={false} />);
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
  });

  it('calls onRevoke when revoke button is clicked', async () => {
    const onRevoke = vi.fn();
    render(<SharingPreferencesPanel {...defaultProps} shareActive onRevoke={onRevoke} />);
    await userEvent.click(screen.getByRole('button', { name: /revoke/i }));
    expect(onRevoke).toHaveBeenCalled();
  });
});
