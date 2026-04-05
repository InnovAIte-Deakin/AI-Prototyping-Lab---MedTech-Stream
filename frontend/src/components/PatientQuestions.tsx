import React, { useState, useEffect } from 'react';

interface PatientQuestionsProps {
  reportId: string;
  accessToken: string;
  onThreadCreated: (threadId: string) => void;
}

export function PatientQuestions({ reportId, accessToken, onThreadCreated }: PatientQuestionsProps) {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [freeText, setFreeText] = useState(false);

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  useEffect(() => {
    async function fetchPrompts() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${backend}/api/v1/reports/${reportId}/question-prompts`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!response.ok) {
          throw new Error('Failed to load suggested questions');
        }
        const data = await response.json();
        setPrompts(data.prompts || []);
      } catch (err: any) {
        setError(err.message || 'An error occurred loading questions.');
      } finally {
        setLoading(false);
      }
    }
    fetchPrompts();
  }, [reportId, accessToken, backend]);

  const handleSelectPrompt = (index: number) => {
    setSelectedPromptIndex(index);
    setEditValue(prompts[index]);
    setFreeText(false);
  };

  const handleFreeText = () => {
    setSelectedPromptIndex(-1);
    setEditValue('');
    setFreeText(true);
  };

  const handleSend = async () => {
    if (!editValue.trim()) return;
    setSubmitting(true);
    setError('');
    
    try {
      const response = await fetch(`${backend}/api/v1/reports/${reportId}/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          initial_message: editValue,
          title: 'Questions for Clinician',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send question');
      }

      const thread = await response.json();
      onThreadCreated(thread.id);
      
      setSelectedPromptIndex(null);
      setEditValue('');
      setFreeText(false);
    } catch (err: any) {
      setError(err.message || 'Failed to submit question.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="card">Generating personalized questions...</div>;
  }

  return (
    <div className="card">
      <h2>Questions for My Clinician</h2>
      <p>Select a suggested question to ask your healthcare provider, or write your own.</p>
      
      {error && <div className="alert alert-error">{error}</div>}
      
      <div className="flex flex-col gap-2 my-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        {prompts.map((prompt, index) => (
          <button 
            key={index} 
            className="nav-btn" 
            style={{ textAlign: 'left', background: selectedPromptIndex === index ? '#f0f0f0' : 'white', cursor: 'pointer', padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px' }}
            onClick={() => handleSelectPrompt(index)}
          >
            {prompt}
          </button>
        ))}
        <button 
            className="nav-btn" 
            style={{ textAlign: 'left', background: freeText ? '#f0f0f0' : 'white', cursor: 'pointer', padding: '0.75rem', border: '1px dashed #ccc', borderRadius: '4px' }}
            onClick={handleFreeText}
          >
            + Ask something else (Free text)
          </button>
      </div>

      {(selectedPromptIndex !== null || freeText) && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Edit your message:
          </label>
          <textarea 
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '0.5rem' }}
            disabled={submitting}
          />
          <button className="nav-btn nav-btn-primary" onClick={handleSend} disabled={submitting || !editValue.trim()}>
            {submitting ? 'Sending...' : 'Send to Clinician'}
          </button>
        </div>
      )}
    </div>
  );
}
