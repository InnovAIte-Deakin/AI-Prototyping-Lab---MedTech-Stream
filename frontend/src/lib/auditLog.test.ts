import { describe, expect, it } from 'vitest';

import { describeAuditAction, shareStateFrom } from './auditLog';

describe('describeAuditAction', () => {
  it.each([
    ['created', 'Share created'],
    ['revoked', 'Share revoked'],
    ['expired', 'Share expired'],
    ['view', 'Clinician viewed report'],
  ])('describes %s', (action, expected) => {
    expect(describeAuditAction(action)).toBe(expected);
  });

  it('falls back to a humanised form for unknown actions', () => {
    expect(describeAuditAction('policy_changed')).toBe('policy changed');
  });
});

describe('shareStateFrom', () => {
  const now = new Date('2026-04-18T12:00:00Z').getTime();

  it('returns inactive when prefs are undefined', () => {
    expect(shareStateFrom(undefined, now)).toBe('inactive');
  });

  it('returns inactive when active flag is false', () => {
    expect(shareStateFrom({ active: false, expiresAt: now + 10_000 }, now)).toBe('inactive');
  });

  it('returns expired when the share is active but past expiry', () => {
    expect(shareStateFrom({ active: true, expiresAt: now - 1 }, now)).toBe('expired');
  });

  it('returns active when the share is active and not past expiry', () => {
    expect(shareStateFrom({ active: true, expiresAt: now + 5_000 }, now)).toBe('active');
  });
});
