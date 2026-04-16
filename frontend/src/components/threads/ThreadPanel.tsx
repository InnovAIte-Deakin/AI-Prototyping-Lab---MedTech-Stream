'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnchorContext } from './AnchorContext';
import { MessageComposer } from './MessageComposer';
import { MessageList, type ThreadMessage } from './MessageList';
import type { FindingAnchor } from './ThreadLauncher';

export function ThreadPanel({
  isOpen,
  finding,
  loading,
  error,
  messages,
  canWrite,
  canView = true,
  unreadCount = 0,
  currentUserId,
  currentUserRole,
  onRetry,
  onClose,
  onSend,
  onMarkRead,
}: {
  isOpen: boolean;
  finding: FindingAnchor;
  loading: boolean;
  error: string | null;
  messages: ThreadMessage[];
  canWrite: boolean;
  canView?: boolean;
  unreadCount?: number;
  currentUserId: string;
  currentUserRole: string;
  onRetry: () => void;
  onClose: () => void;
  onSend: (text: string) => Promise<ThreadMessage | void>;
  onMarkRead?: () => void;
}) {
  const [localMessages, setLocalMessages] = useState<ThreadMessage[]>(messages);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setLocalMessages(messages), [messages]);

  useEffect(() => {
    if (isOpen && unreadCount > 0 && onMarkRead) {
      onMarkRead();
    }
  }, [isOpen, unreadCount, onMarkRead]);

  const handleSend = async (text: string) => {
    const created = await onSend(text);
    if (created) {
      setLocalMessages((prev) => [...prev, created]);
      setScrolled(true);
    }
  };

  const body = useMemo(() => {
    if (loading) return <p>Loading thread…</p>;
    if (error) {
      return (
        <div>
          <p className="alert alert-error">{error}</p>
          <button type="button" className="nav-btn nav-btn-outline" onClick={onRetry}>Retry</button>
        </div>
      );
    }
    return (
      <>
        <MessageList
          messages={localMessages}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          scrolledToBottom={scrolled}
        />
        <MessageComposer canWrite={canWrite} sending={false} onSend={handleSend} />
      </>
    );
  }, [loading, error, onRetry, localMessages, currentUserId, currentUserRole, scrolled, canWrite]);

  if (!canView || !isOpen) {
    return unreadCount > 0 ? <span data-testid="thread-panel-unread-badge">{unreadCount}</span> : null;
  }

  return (
    <aside role="dialog" aria-label="Finding thread" className="card" style={{ borderLeft: '4px solid #0ea5e9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ marginTop: 0 }}>Finding Thread</h2>
        <button type="button" className="nav-btn nav-btn-outline" onClick={onClose}>Close</button>
      </div>
      {unreadCount > 0 ? <span data-testid="thread-panel-unread-badge">{unreadCount}</span> : null}
      <AnchorContext finding={finding} />
      {body}
    </aside>
  );
}
