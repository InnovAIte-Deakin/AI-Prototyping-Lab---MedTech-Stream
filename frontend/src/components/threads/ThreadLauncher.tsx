'use client';

import React from 'react';

export type FindingAnchor = {
  test_name: string;
  value: string | number;
  unit: string | null;
  reference_range: string | null;
  flag: 'low' | 'high' | 'normal' | 'abnormal' | null;
};

export function ThreadLauncher({
  finding,
  unreadCount,
  hasThread,
  canAccess,
  onOpen,
}: {
  finding: FindingAnchor;
  unreadCount: number;
  hasThread: boolean;
  canAccess: boolean;
  onOpen: (finding: FindingAnchor) => void;
}) {
  if (!canAccess) return null;

  return (
    <button
      type="button"
      className="nav-btn nav-btn-outline"
      aria-label={hasThread ? 'Open thread for this finding' : 'Ask about this finding'}
      onClick={() => onOpen(finding)}
      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', position: 'relative' }}
    >
      Ask about this
      {unreadCount > 0 ? (
        <span
          data-testid="thread-unread-badge"
          style={{ marginLeft: '0.4rem', background: '#d00', color: '#fff', borderRadius: '999px', padding: '0 0.4rem' }}
        >
          {unreadCount}
        </span>
      ) : null}
    </button>
  );
}
