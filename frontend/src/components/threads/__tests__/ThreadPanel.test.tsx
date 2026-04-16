import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ThreadPanel } from '../ThreadPanel';

describe('ThreadPanel', () => {
  const finding = {
    test_name: 'Glucose',
    value: 102,
    unit: 'mg/dL',
    reference_range: '70-99',
    flag: 'high' as const,
  };

  it('AC-T8-03 shows anchor context at top of panel', () => {
    render(
      <ThreadPanel
        isOpen={true}
        finding={finding}
        loading={false}
        error={null}
        messages={[]}
        canWrite={true}
        currentUserId="u1"
        currentUserRole="patient"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(/Glucose/i)).toBeInTheDocument();
    expect(screen.getByText(/102 mg\/dL/i)).toBeInTheDocument();
    expect(screen.getByText(/70-99/i)).toBeInTheDocument();
    expect(screen.getByText(/HIGH/i)).toBeInTheDocument();
  });

  it('shows loading and retryable error states', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ThreadPanel
        isOpen={true}
        finding={finding}
        loading={true}
        error={null}
        messages={[]}
        canWrite={true}
        currentUserId="u1"
        currentUserRole="patient"
        onRetry={onRetry}
        onClose={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText(/loading thread/i)).toBeInTheDocument();

    rerender(
      <ThreadPanel
        isOpen={true}
        finding={finding}
        loading={false}
        error={'Could not load thread'}
        messages={[]}
        canWrite={true}
        currentUserId="u1"
        currentUserRole="patient"
        onRetry={onRetry}
        onClose={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('AC-T8-06 appends new message immediately and scrolls to bottom', async () => {
    const onSend = vi.fn().mockResolvedValue({
      id: 'm1',
      author_user_id: 'u1',
      author_name: 'Me',
      kind: 'text',
      body: 'New message',
      created_at: '2025-01-15T14:36:00Z',
    });

    render(
      <ThreadPanel
        isOpen={true}
        finding={finding}
        loading={false}
        error={null}
        messages={[]}
        canWrite={true}
        currentUserId="u1"
        currentUserRole="patient"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onSend={onSend}
      />,
    );

    const input = screen.getByRole('textbox', { name: /thread message input/i });
    fireEvent.change(input, { target: { value: 'New message' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByText('New message')).toBeInTheDocument());
    expect(screen.getByTestId('thread-message-list').getAttribute('data-scrolled-to-bottom')).toBe('true');
  });

  it('AC-T8-10 renders no panel when unauthorized', () => {
    render(
      <ThreadPanel
        isOpen={true}
        finding={finding}
        loading={false}
        error={null}
        messages={[]}
        canWrite={false}
        canView={false}
        currentUserId="u1"
        currentUserRole="clinician"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole('dialog', { name: /finding thread/i })).toBeNull();
  });

  it('AC-T8-09 shows composer for clinician with full thread access', () => {
    render(
      <ThreadPanel
        isOpen={true}
        finding={finding}
        loading={false}
        error={null}
        messages={[]}
        canWrite={true}
        canView={true}
        currentUserId="c1"
        currentUserRole="clinician"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('textbox', { name: /thread message input/i })).toBeInTheDocument();
  });

  it('AC-T8-11 and AC-T8-12 notification badge shows unread count and clears on open', async () => {
    const markRead = vi.fn();
    const { rerender } = render(
      <ThreadPanel
        isOpen={false}
        finding={finding}
        loading={false}
        error={null}
        messages={[]}
        canWrite={true}
        canView={true}
        unreadCount={4}
        currentUserId="u1"
        currentUserRole="patient"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
        onMarkRead={markRead}
      />,
    );

    expect(screen.getByTestId('thread-panel-unread-badge')).toHaveTextContent('4');

    rerender(
      <ThreadPanel
        isOpen={true}
        finding={finding}
        loading={false}
        error={null}
        messages={[]}
        canWrite={true}
        canView={true}
        unreadCount={4}
        currentUserId="u1"
        currentUserRole="patient"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
        onMarkRead={markRead}
      />,
    );

    await waitFor(() => expect(markRead).toHaveBeenCalled());
  });
});
