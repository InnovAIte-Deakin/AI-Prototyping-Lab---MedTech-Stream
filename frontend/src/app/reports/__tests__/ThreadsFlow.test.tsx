import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { PatientQuestions } from '../../../../components/PatientQuestions';
import { ThreadView } from '../../../../components/ThreadView';

process.env.NEXT_PUBLIC_BACKEND_URL = 'http://test';

describe('Threads and Questions Flow', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as any;
    vi.clearAllMocks();
  });

  it('PatientQuestions fetches prompts and displays them', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prompts: ['Question 1', 'Question 2'] }),
    });

    render(<PatientQuestions reportId="123" accessToken="token" onThreadCreated={vi.fn()} />);

    expect(screen.getByText(/Generating personalized questions/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Question 1')).toBeInTheDocument();
      expect(screen.getByText('Question 2')).toBeInTheDocument();
    });
  });

  it('ThreadView fetches threads and renders them', async () => {
    const mockThread = {
      id: 'thread-1',
      title: 'My Thread',
      messages: [
        {
          id: 'msg-1',
          author_name: 'Patient User',
          kind: 'text',
          body: 'What is this?',
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          author_name: 'Dr. Clinician',
          kind: 'template',
          body: JSON.stringify({ meaning: 'It means nothing.', urgency: 'routine', action: 'Rest.' }),
          created_at: new Date().toISOString(),
        }
      ]
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ([mockThread]),
    });

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
