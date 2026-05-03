import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { MessageComposer } from '../MessageComposer';

describe('MessageComposer', () => {
  it('disables send while textarea is empty', () => {
    render(<MessageComposer canWrite={true} sending={false} onSend={vi.fn()} />);
    const send = screen.getByRole('button', { name: /send/i });
    expect(send).toBeDisabled();
  });

  it('AC-T8-06 clears textarea and triggers send callback on success', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer canWrite={true} sending={false} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: /thread message input/i });
    fireEvent.change(input, { target: { value: 'Can you explain this result?' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Can you explain this result?'));
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''));
  });

  it('AC-T8-07 preserves message and shows inline error when send fails', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<MessageComposer canWrite={true} sending={false} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: /thread message input/i });
    fireEvent.change(input, { target: { value: 'Please clarify this flag' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument());
    expect((input as HTMLTextAreaElement).value).toBe('Please clarify this flag');
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled();
  });

  it('does not render composer for read-only users', () => {
    render(<MessageComposer canWrite={false} sending={false} onSend={vi.fn()} />);
    expect(screen.queryByRole('textbox', { name: /thread message input/i })).toBeNull();
  });
});
