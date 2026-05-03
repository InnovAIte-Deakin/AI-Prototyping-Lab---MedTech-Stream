import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MessageList } from '../MessageList';

function expectedTimestamp(value: string) {
  const d = new Date(value);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${date}, ${time}`;
}

const messages = [
  {
    id: 'm2',
    author_user_id: 'other',
    author_name: 'Dr C',
    kind: 'text',
    body: 'Please track this result monthly.',
    created_at: '2025-01-15T14:35:00Z',
  },
  {
    id: 'm1',
    author_user_id: 'me',
    author_name: 'Pat',
    kind: 'text',
    body: 'What does this mean?',
    created_at: '2025-01-15T14:34:00Z',
  },
];

describe('MessageList', () => {
  it('AC-T8-04 renders all messages in chronological order with role labels and timestamps', () => {
    render(
      <MessageList
        messages={messages}
        currentUserId="me"
        currentUserRole="patient"
      />,
    );

    const items = screen.getAllByTestId('thread-message-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('You');
    expect(items[0]).toHaveTextContent('What does this mean?');
    expect(items[1]).toHaveTextContent('Clinician');
    expect(items[1]).toHaveTextContent('Please track this result monthly.');
    expect(screen.getAllByTestId('thread-message-time')[0]).toHaveTextContent(expectedTimestamp('2025-01-15T14:34:00Z'));
  });

  it('AC-T8-05 shows empty message when there is no history', () => {
    render(
      <MessageList
        messages={[]}
        currentUserId="me"
        currentUserRole="patient"
      />,
    );

    expect(screen.getByText('No messages yet. Send the first message below.')).toBeInTheDocument();
  });
});
