'use client';

import React from 'react';

export type ThreadMessage = {
  id: string;
  author_user_id: string;
  author_name: string;
  kind: string;
  body: string;
  created_at: string;
};

function labelFor(message: ThreadMessage, currentUserId: string, currentUserRole: string): string {
  if (message.author_user_id === currentUserId) return 'You';
  if (currentUserRole === 'clinician') return 'Patient';
  return 'Clinician';
}

function formatTimestamp(value: string): string {
  const d = new Date(value);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${date}, ${time}`;
}

export function MessageList({
  messages,
  currentUserId,
  currentUserRole,
  scrolledToBottom,
}: {
  messages: ThreadMessage[];
  currentUserId: string;
  currentUserRole: string;
  scrolledToBottom?: boolean;
}) {
  const sorted = [...messages].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  if (sorted.length === 0) {
    return <p>No messages yet. Send the first message below.</p>;
  }

  return (
    <div data-testid="thread-message-list" data-scrolled-to-bottom={scrolledToBottom ? 'true' : 'false'}>
      {sorted.map((m) => (
        <article key={m.id} data-testid="thread-message-item" style={{ borderTop: '1px solid #ddd', padding: '0.5rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <strong>{labelFor(m, currentUserId, currentUserRole)}</strong>
            <small data-testid="thread-message-time">{formatTimestamp(m.created_at)}</small>
          </div>
          <p style={{ margin: '0.35rem 0 0' }}>{m.body}</p>
        </article>
      ))}
    </div>
  );
}
