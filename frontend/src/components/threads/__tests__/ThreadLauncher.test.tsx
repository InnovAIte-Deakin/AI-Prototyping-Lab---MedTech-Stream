import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ThreadLauncher } from '../ThreadLauncher';

const finding = {
  test_name: 'Hemoglobin',
  value: 13.5,
  unit: 'g/dL',
  reference_range: '11-15',
  flag: 'normal' as const,
};

describe('ThreadLauncher', () => {
  it('AC-T8-01 shows launcher with no unread badge when no thread exists', () => {
    render(
      <ThreadLauncher
        finding={finding}
        unreadCount={0}
        hasThread={false}
        canAccess={true}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /ask about this/i })).toBeInTheDocument();
    expect(screen.queryByTestId('thread-unread-badge')).toBeNull();
  });

  it('AC-T8-02 shows unread badge when thread has unread messages', () => {
    render(
      <ThreadLauncher
        finding={finding}
        unreadCount={3}
        hasThread={true}
        canAccess={true}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByTestId('thread-unread-badge')).toHaveTextContent('3');
  });

  it('opens thread panel callback for selected finding on click', () => {
    const onOpen = vi.fn();
    render(
      <ThreadLauncher
        finding={finding}
        unreadCount={0}
        hasThread={false}
        canAccess={true}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /ask about this/i }));
    expect(onOpen).toHaveBeenCalledWith(finding);
  });

  it('AC-T8-08 hides launcher controls for clinician summary-only access', () => {
    render(
      <ThreadLauncher
        finding={finding}
        unreadCount={0}
        hasThread={false}
        canAccess={false}
        onOpen={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /ask about this/i })).toBeNull();
  });
});
