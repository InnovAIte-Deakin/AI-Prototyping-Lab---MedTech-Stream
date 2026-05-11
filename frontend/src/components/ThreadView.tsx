import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/authStore';

export interface ThreadMessage {
  id: string;
  author_user_id: string;
  author_name: string;
  kind: 'text' | 'template' | 'system';
  body: string;
  created_at: string;
}

export interface ConversationThread {
  id: string;
  report_id: string;
  finding_id: string | null;
  title: string | null;
  status: string;
  messages: ThreadMessage[];
}

interface ThreadViewProps {
  reportId: string;
  accessToken: string;
  onThreadsLoaded?: (threads: ConversationThread[]) => void;
  onThreadCreated?: () => void;
  focusedThreadId?: string;
}

function titleFromMessage(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= 60 ? trimmed : trimmed.slice(0, 57) + '…';
}

function MessageBubble({ msg, myUserId }: { msg: ThreadMessage; myUserId: string | undefined }) {
  const isMe = msg.author_user_id === myUserId;

  if (msg.kind === 'template') {
    let payload: any = {};
    try { payload = JSON.parse(msg.body); } catch { /* ignore */ }
    return (
      <div style={{ alignSelf: 'flex-start', background: '#f0fdf4', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #16a34a', maxWidth: '80%' }}>
        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem', color: '#16a34a' }}>Clinician Response</div>
        <div style={{ marginBottom: '0.5rem' }}><strong>What it means:</strong> {payload.meaning}</div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Urgency:</strong>{' '}
          <span style={{ textTransform: 'capitalize', padding: '0.1rem 0.4rem', borderRadius: '4px', background: payload.urgency === 'urgent' ? '#fee2e2' : payload.urgency === 'soon' ? '#fef3c7' : '#e0e7ff' }}>
            {payload.urgency}
          </span>
        </div>
        <div><strong>Next step:</strong> {payload.action}</div>
        <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>{new Date(msg.created_at).toLocaleString()}</small>
      </div>
    );
  }

  return (
    <div style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', background: isMe ? '#dbeafe' : '#f3f4f6', padding: '0.75rem', borderRadius: '8px', maxWidth: '70%' }}>
      <div style={{ fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.2rem' }}>{msg.author_name}</div>
      <div>{msg.body}</div>
      <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.2rem', textAlign: 'right' }}>{new Date(msg.created_at).toLocaleString()}</div>
    </div>
  );
}

export function ThreadView({
  reportId,
  accessToken,
  onThreadsLoaded,
  onThreadCreated,
  focusedThreadId,
}: ThreadViewProps) {
  const { user } = useAuth();
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [loading, setLoading] = useState(false);

  // Anchored-thread reply state (keyed by thread id)
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [isClinicianMock, setIsClinicianMock] = useState<Record<string, boolean>>({});
  const [clinicianMeaning, setClinicianMeaning] = useState<Record<string, string>>({});
  const [clinicianUrgency, setClinicianUrgency] = useState<Record<string, string>>({});
  const [clinicianAction, setClinicianAction] = useState<Record<string, string>>({});

  // Prompt suggestion state
  const [prompts, setPrompts] = useState<string[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number | null>(null);

  // Clinician mock for the general conversation
  const [generalIsClinicianMock, setGeneralIsClinicianMock] = useState(false);
  const [generalClinicianMeaning, setGeneralClinicianMeaning] = useState('');
  const [generalClinicianUrgency, setGeneralClinicianUrgency] = useState('routine');
  const [generalClinicianAction, setGeneralClinicianAction] = useState('');
  const [generalReplyText, setGeneralReplyText] = useState('');

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backend}/api/v1/reports/${reportId}/threads`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data: ConversationThread[] = await response.json();
        setThreads(data || []);
        onThreadsLoaded?.(data || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [accessToken, backend, onThreadsLoaded, reportId]);

  useEffect(() => {
    fetchThreads();
    const intv = setInterval(fetchThreads, 10000);
    return () => clearInterval(intv);
  }, [fetchThreads]);

  useEffect(() => {
    async function fetchPrompts() {
      setPromptsLoading(true);
      try {
        const response = await fetch(`${backend}/api/v1/reports/${reportId}/question-prompts`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          setPrompts(data.prompts || []);
        }
      } catch { /* non-critical */ } finally {
        setPromptsLoading(false);
      }
    }
    fetchPrompts();
  }, [reportId, accessToken, backend]);

  useEffect(() => {
    if (!focusedThreadId) return;
    const node = document.getElementById(`thread-card-${focusedThreadId}`);
    node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [focusedThreadId, threads]);

  // Split threads: general (no finding) vs anchored (has finding)
  const generalThreads = threads.filter((t) => !t.finding_id);
  const anchoredThreads = threads.filter((t) => !!t.finding_id);

  // Merge all general-thread messages into one chronological list
  const generalMessages: ThreadMessage[] = generalThreads
    .flatMap((t) => t.messages)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // The open general thread to post new messages to (first open one, or null)
  const openGeneralThread = generalThreads.find((t) => t.status === 'open') ?? generalThreads[0] ?? null;

  // Selecting a chip pre-fills the reply input directly
  const handleSelectPrompt = (index: number) => {
    setSelectedPromptIndex(index);
    setGeneralReplyText(prompts[index]);
  };

  const handleFreeText = () => {
    setSelectedPromptIndex(null);
    setGeneralReplyText('');
  };

  // Send: post to existing thread if one exists, otherwise create the first thread
  const handleSendGeneralReply = async () => {
    if (!generalReplyText.trim()) return;
    try {
      if (openGeneralThread) {
        await fetch(`${backend}/api/v1/threads/${openGeneralThread.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ body: generalReplyText.trim() }),
        });
      } else {
        await fetch(`${backend}/api/v1/reports/${reportId}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            initial_message: generalReplyText.trim(),
            title: titleFromMessage(generalReplyText),
          }),
        });
        onThreadCreated?.();
      }
      setGeneralReplyText('');
      setSelectedPromptIndex(null);
      await fetchThreads();
    } catch { /* ignore */ }
  };

  const handleSendGeneralClinicianTemplate = async () => {
    if (!openGeneralThread || !generalClinicianMeaning.trim() || !generalClinicianAction.trim()) return;
    try {
      await fetch(`${backend}/api/v1/threads/${openGeneralThread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          template_payload: { meaning: generalClinicianMeaning, urgency: generalClinicianUrgency, action: generalClinicianAction },
        }),
      });
      setGeneralClinicianMeaning('');
      setGeneralClinicianUrgency('routine');
      setGeneralClinicianAction('');
      setGeneralIsClinicianMock(false);
      fetchThreads();
    } catch { /* ignore */ }
  };

  const handleSendReply = async (threadId: string) => {
    const text = replyText[threadId] || '';
    if (!text.trim()) return;
    try {
      await fetch(`${backend}/api/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ body: text }),
      });
      setReplyText((prev) => ({ ...prev, [threadId]: '' }));
      fetchThreads();
    } catch { /* ignore */ }
  };

  const handleSendClinicianTemplate = async (threadId: string) => {
    const meaning = clinicianMeaning[threadId] || '';
    const action = clinicianAction[threadId] || '';
    if (!meaning.trim() || !action.trim()) return;
    try {
      await fetch(`${backend}/api/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ template_payload: { meaning, urgency: clinicianUrgency[threadId] || 'routine', action } }),
      });
      setClinicianMeaning((prev) => ({ ...prev, [threadId]: '' }));
      setClinicianUrgency((prev) => ({ ...prev, [threadId]: 'routine' }));
      setClinicianAction((prev) => ({ ...prev, [threadId]: '' }));
      setIsClinicianMock((prev) => ({ ...prev, [threadId]: false }));
      fetchThreads();
    } catch { /* ignore */ }
  };

  if (loading && threads.length === 0) return <div>Loading threads...</div>;

  return (
    <div style={{ marginTop: '1rem' }}>

      {/* ── GENERAL CONVERSATION (all non-anchored threads merged) ── */}
      <div className="card" style={{ padding: '1rem', marginBottom: anchoredThreads.length > 0 ? '1.5rem' : 0 }}>

        {/* Merged message history */}
        {generalMessages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {generalMessages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} myUserId={user?.id} />
            ))}
          </div>
        )}

        {/* Clinician mock or reply input */}
        <div style={{ borderTop: generalMessages.length > 0 ? '1px solid #eee' : 'none', paddingTop: generalMessages.length > 0 ? '1rem' : 0, marginBottom: '1.5rem' }}>
          {generalIsClinicianMock ? (
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 1rem 0' }}>Clinician Response Template</h4>
              <div className="field" style={{ marginBottom: '0.5rem' }}>
                <label>What the result means:</label>
                <textarea value={generalClinicianMeaning} onChange={(e) => setGeneralClinicianMeaning(e.target.value)} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div className="field" style={{ marginBottom: '0.5rem' }}>
                <label>Urgency:</label>
                <select value={generalClinicianUrgency} onChange={(e) => setGeneralClinicianUrgency(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}>
                  <option value="routine">Routine</option>
                  <option value="soon">Soon</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label>Recommended action:</label>
                <textarea value={generalClinicianAction} onChange={(e) => setGeneralClinicianAction(e.target.value)} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <button className="nav-btn nav-btn-primary" onClick={handleSendGeneralClinicianTemplate}>Submit Clinical Response</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                type="text"
                placeholder="Write a reply…"
                value={generalReplyText}
                onChange={(e) => { setGeneralReplyText(e.target.value); setSelectedPromptIndex(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendGeneralReply(); }}
              />
              <button className="nav-btn nav-btn-primary" onClick={handleSendGeneralReply} disabled={!generalReplyText.trim()}>Send</button>
              <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', background: '#ebf8ff', padding: '0.3rem 0.5rem', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={generalIsClinicianMock} onChange={(e) => setGeneralIsClinicianMock(e.target.checked)} />
                Simulate Clinician Access
              </label>
            </div>
          )}
        </div>

        {/* Prompt chips — clicking pre-fills the reply input above */}
        <div style={{ borderTop: '1px solid #eee', paddingTop: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
            {generalMessages.length === 0 ? 'Ask your clinician a question' : 'Ask another question'}
          </h3>

          {promptsLoading ? (
            <p style={{ color: '#666', fontSize: '0.9rem' }}>Generating personalised questions…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {prompts.map((prompt, index) => (
                <button
                  key={index}
                  className="nav-btn"
                  style={{ textAlign: 'left', background: selectedPromptIndex === index ? '#eff6ff' : 'white', border: selectedPromptIndex === index ? '1px solid #2563eb' : '1px solid #ccc', cursor: 'pointer', padding: '0.75rem', borderRadius: '4px', color: '#1e293b' }}
                  onClick={() => handleSelectPrompt(index)}
                >
                  {prompt}
                </button>
              ))}
              <button
                className="nav-btn"
                style={{ textAlign: 'left', background: 'white', border: '1px dashed #ccc', cursor: 'pointer', padding: '0.75rem', borderRadius: '4px', color: '#64748b' }}
                onClick={handleFreeText}
              >
                + Write your own question
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── ANCHORED THREADS (one card per finding) ── */}
      {anchoredThreads.map((thread) => (
        <div
          key={thread.id}
          id={`thread-card-${thread.id}`}
          data-testid={`thread-card-${thread.id}`}
          data-focused={thread.id === focusedThreadId ? 'true' : 'false'}
          className="card"
          style={{ padding: '1rem', marginBottom: '1rem', border: thread.id === focusedThreadId ? '2px solid #2563eb' : '1px solid #ccc', boxShadow: thread.id === focusedThreadId ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{thread.title || 'Thread'}</h3>
            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: '#ebf8ff', padding: '0.3rem', borderRadius: '4px' }}>
              <input type="checkbox" checked={isClinicianMock[thread.id] || false} onChange={(e) => setIsClinicianMock((prev) => ({ ...prev, [thread.id]: e.target.checked }))} />
              Simulate Clinician Access
            </label>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {thread.messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} myUserId={user?.id} />
            ))}
          </div>

          <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
            {isClinicianMock[thread.id] ? (
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 1rem 0' }}>Clinician Response Template</h4>
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <label>What the result means:</label>
                  <textarea value={clinicianMeaning[thread.id] || ''} onChange={(e) => setClinicianMeaning((prev) => ({ ...prev, [thread.id]: e.target.value }))} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <label>Urgency:</label>
                  <select value={clinicianUrgency[thread.id] || 'routine'} onChange={(e) => setClinicianUrgency((prev) => ({ ...prev, [thread.id]: e.target.value }))} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}>
                    <option value="routine">Routine</option>
                    <option value="soon">Soon</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: '1rem' }}>
                  <label>Recommended action:</label>
                  <textarea value={clinicianAction[thread.id] || ''} onChange={(e) => setClinicianAction((prev) => ({ ...prev, [thread.id]: e.target.value }))} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>
                <button className="nav-btn nav-btn-primary" onClick={() => handleSendClinicianTemplate(thread.id)}>Submit Clinical Response</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  type="text"
                  placeholder="Write a reply…"
                  value={replyText[thread.id] || ''}
                  onChange={(e) => setReplyText((prev) => ({ ...prev, [thread.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendReply(thread.id); }}
                />
                <button className="nav-btn nav-btn-primary" onClick={() => handleSendReply(thread.id)}>Send</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
