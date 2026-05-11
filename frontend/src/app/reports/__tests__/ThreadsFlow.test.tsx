import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ThreadView } from '../../../components/ThreadView';

vi.mock('@/store/authStore', () => ({
  useAuth: () => ({
    user: { id: 'patient-user', email: 'patient@example.com', role: 'patient' },
    status: 'authenticated',
  }),
}));

process.env.NEXT_PUBLIC_BACKEND_URL = 'http://test';

describe('Threads and Questions Flow', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as any;
    vi.clearAllMocks();
  });

  it('fetches and displays AI-suggested question prompts when no threads exist', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),  // threads — empty
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: ['Question 1', 'Question 2'] }),  // prompts
      });

    render(<ThreadView reportId="123" accessToken="token" />);

    await waitFor(() => {
      expect(screen.getByText('Question 1')).toBeInTheDocument();
      expect(screen.getByText('Question 2')).toBeInTheDocument();
    });

    expect(screen.getByText(/Write your own question/i)).toBeInTheDocument();
  });

  it('pre-fills the composer when a prompt chip is clicked', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ([]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prompts: ['What might be causing my ALT to be high?'] }) });

    render(<ThreadView reportId="123" accessToken="token" />);

    await waitFor(() => {
      expect(screen.getByText('What might be causing my ALT to be high?')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('What might be causing my ALT to be high?'));

    await waitFor(() => {
      const textarea = screen.getByRole('textbox');
      expect((textarea as HTMLTextAreaElement).value).toBe('What might be causing my ALT to be high?');
    });
  });

  it('uses the message text (truncated to 60 chars) as the thread title', async () => {
    const longQuestion = 'A'.repeat(80);
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ([]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prompts: [longQuestion] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'thread-new' }) })  // POST thread
      .mockResolvedValueOnce({ ok: true, json: async () => ([]) });  // refetch threads

    render(<ThreadView reportId="123" accessToken="token" />);

    await waitFor(() => expect(screen.getByText(longQuestion)).toBeInTheDocument());

    fireEvent.click(screen.getByText(longQuestion));
    fireEvent.click(screen.getByRole('button', { name: /send to clinician/i }));

    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      const postCall = calls.find(([url, opts]: any) => opts?.method === 'POST');
      const body = JSON.parse(postCall[1].body);
      expect(body.title).toBe('A'.repeat(57) + '…');
      expect(body.initial_message).toBe(longQuestion);
    });
  });

  it('fetches threads and renders message history', async () => {
    const mockThread = {
      id: 'thread-1',
      finding_id: null,
      title: 'My Thread',
      status: 'open',
      messages: [
        {
          id: 'msg-1',
          author_user_id: 'other-user',
          author_name: 'Patient User',
          kind: 'text',
          body: 'What is this?',
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          author_user_id: 'clinician-user',
          author_name: 'Dr. Clinician',
          kind: 'template',
          body: JSON.stringify({ meaning: 'It means nothing.', urgency: 'routine', action: 'Rest.' }),
          created_at: new Date().toISOString(),
        },
      ],
    };

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ([mockThread]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prompts: [] }) });

    render(<ThreadView reportId="123" accessToken="token" />);

    await waitFor(() => {
      expect(screen.getByText('My Thread')).toBeInTheDocument();
    });

    expect(screen.getByText('Patient User')).toBeInTheDocument();
    expect(screen.getByText('What is this?')).toBeInTheDocument();
    expect(screen.getByText('Clinician Response')).toBeInTheDocument();
    expect(screen.getByText('It means nothing.')).toBeInTheDocument();
    expect(screen.getByText('routine')).toBeInTheDocument();
    expect(screen.getByText('Rest.')).toBeInTheDocument();
  });
});
