import React, { useState, useEffect } from 'react';
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
  title: string | null;
  status: string;
  messages: ThreadMessage[];
}

interface ThreadViewProps {
  reportId: string;
  accessToken: string;
}

export function ThreadView({ reportId, accessToken }: ThreadViewProps) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  
  const [isClinicianMock, setIsClinicianMock] = useState(false);
  const [clinicianMeaning, setClinicianMeaning] = useState('');
  const [clinicianUrgency, setClinicianUrgency] = useState('routine');
  const [clinicianAction, setClinicianAction] = useState('');

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backend}/api/v1/reports/${reportId}/threads`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setThreads(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch threads', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    const intv = setInterval(fetchThreads, 10000);
    return () => clearInterval(intv);
  }, [reportId, accessToken, backend]);

  const handleSendReply = async (threadId: string) => {
    if (!replyText.trim()) return;
    try {
      await fetch(`${backend}/api/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body: replyText }),
      });
      setReplyText('');
      fetchThreads();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendClinicianTemplate = async (threadId: string) => {
    if (!clinicianMeaning.trim() || !clinicianAction.trim()) return;
    try {
      await fetch(`${backend}/api/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          template_payload: {
            meaning: clinicianMeaning,
            urgency: clinicianUrgency,
            action: clinicianAction,
          }
        }),
      });
      setClinicianMeaning('');
      setClinicianUrgency('routine');
      setClinicianAction('');
      setIsClinicianMock(false);
      fetchThreads();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading && threads.length === 0) return <div>Loading threads...</div>;
  if (threads.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2>Conversations</h2>
      <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
        {threads.map((thread) => (
          <div key={thread.id} className="card" style={{ padding: '1rem', border: '1px solid #ccc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{thread.title || 'Thread'}</h3>
                <div>
                   <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: '#ebf8ff', padding: '0.3rem', borderRadius: '4px' }}>
                    <input type="checkbox" checked={isClinicianMock} onChange={e => setIsClinicianMock(e.target.checked)} />
                    Simulate Clinician Access
                   </label>
                </div>
            </div>
            
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {thread.messages.map((msg) => {
                const isMe = msg.author_user_id === user?.id;
                
                if (msg.kind === 'template') {
                  let payload: any = {};
                  try { payload = JSON.parse(msg.body); } catch(e){}
                  
                  return (
                    <div key={msg.id} style={{ alignSelf: 'flex-start', background: '#f0fdf4', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #16a34a', maxWidth: '80%' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem', color: '#16a34a' }}>
                        Clinician Response
                      </div>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>What it means:</strong> {payload.meaning}
                      </div>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>Urgency:</strong> <span style={{ textTransform: 'capitalize', padding: '0.1rem 0.4rem', background: payload.urgency === 'urgent' ? '#fee2e2' : payload.urgency === 'soon' ? '#fef3c7' : '#e0e7ff', borderRadius: '4px' }}>{payload.urgency}</span>
                      </div>
                      <div>
                        <strong>Next step:</strong> {payload.action}
                      </div>
                      <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>{new Date(msg.created_at).toLocaleString()}</small>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', background: isMe ? '#dbeafe' : '#f3f4f6', padding: '0.75rem', borderRadius: '8px', maxWidth: '70%' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.2rem' }}>{msg.author_name}</div>
                    <div>{msg.body}</div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.2rem', textAlign: 'right' }}>
                      {new Date(msg.created_at).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                {isClinicianMock ? (
                  <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 1rem 0' }}>Clinician Response Template</h4>
                    <div className="field" style={{ marginBottom: '0.5rem' }}>
                      <label>What the result means:</label>
                      <textarea value={clinicianMeaning} onChange={e => setClinicianMeaning(e.target.value)} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
                    </div>
                    <div className="field" style={{ marginBottom: '0.5rem' }}>
                      <label>Urgency:</label>
                      <select value={clinicianUrgency} onChange={e => setClinicianUrgency(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}>
                        <option value="routine">Routine</option>
                        <option value="soon">Soon</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: '1rem' }}>
                      <label>Recommended action:</label>
                      <textarea value={clinicianAction} onChange={e => setClinicianAction(e.target.value)} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
                    </div>
                    <button className="nav-btn nav-btn-primary" onClick={() => handleSendClinicianTemplate(thread.id)}>Submit Clinical Response</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} 
                      type="text" 
                      placeholder="Type a reply..." 
                      value={replyText} 
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendReply(thread.id); }}
                    />
                    <button className="nav-btn nav-btn-primary" onClick={() => handleSendReply(thread.id)}>Reply</button>
                  </div>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
