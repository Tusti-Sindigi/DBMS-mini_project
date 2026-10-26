'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function ReviewerQueuePage() {
  const [flags, setFlags] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Open'); // 'Open' | 'Cleared' | 'Escalated' | 'ALL'
  const [processingId, setProcessingId] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null);
  const [alertType, setAlertType] = useState('success');

  useEffect(() => {
    loadQueue();
  }, [activeTab]);

  async function loadQueue() {
    try {
      setLoading(true);
      const [meRes, flagsRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch(`/api/flags${activeTab !== 'ALL' ? `?status=${activeTab}` : ''}`),
      ]);

      const meData = await meRes.json();
      const fData = await flagsRes.json();

      if (meData.user) setUser(meData.user);
      if (fData.flags) setFlags(fData.flags);
    } catch (err) {
      console.error('Failed to load queue:', err);
      setAlertMessage('Failed to load review queue.');
      setAlertType('danger');
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(flagId, action) {
    try {
      setProcessingId(flagId);
      setAlertMessage(null);

      const res = await fetch(`/api/flags/${flagId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Review submission failed');
      }

      setAlertMessage(
        `✓ Flag #${flagId} atomically ${action.toLowerCase()} and logged to review_history.`
      );
      setAlertType('success');

      // Refresh queue
      loadQueue();
    } catch (err) {
      setAlertMessage(err.message);
      setAlertType('danger');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '2.5rem 1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Reviewer Queue</h1>
              <span className="badge badge-info">{user?.role || 'Reviewer'}</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Review only flags assigned to you. Each decision is recorded in the review history.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${activeTab === 'Open' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('Open')}
            >
              Open (Pending Action)
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'Cleared' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('Cleared')}
            >
              Cleared
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'Escalated' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('Escalated')}
            >
              Escalated
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('ALL')}
            >
              All Assigned
            </button>
          </div>
        </div>

        {/* Notifications */}
        {alertMessage && (
          <div className={`alert alert-${alertType}`} style={{ marginBottom: '1.5rem' }}>
            {alertMessage}
          </div>
        )}

        {/* Queue Items */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 1.5rem auto' }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading review queue...</p>
          </div>
        ) : flags.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎉</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              No {activeTab !== 'ALL' ? activeTab.toLowerCase() : ''} flags in queue
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '450px', margin: '0 auto' }}>
              {activeTab === 'Open'
                ? 'All assigned risk flags have been resolved. Check back when clients upload new agreements.'
                : 'No historical records found for this filter tab.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {flags.map((f) => {
              const simPercent = (f.similarity_score * 100).toFixed(1);
              const isProcessing = processingId === f.flag_id;
              const isOpen = f.flag_status === 'Open';

              return (
                <div
                  key={f.flag_id}
                  id={`queue-flag-${f.flag_id}`}
                  className="card"
                  style={{
                    padding: '1.75rem',
                    border: isOpen
                      ? f.severity_weight >= 4
                        ? '1px solid rgba(239, 68, 68, 0.5)'
                        : '1px solid rgba(245, 158, 11, 0.4)'
                      : '1px solid var(--border)',
                    boxShadow: isOpen ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
                  }}
                >
                  {/* Top Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="badge badge-primary">{f.risk_category}</span>
                      <span className="badge badge-secondary">Severity: {f.severity_weight}/5</span>
                      <span
                        className={`badge ${f.flag_status === 'Open' ? 'badge-danger' : f.flag_status === 'Cleared' ? 'badge-success' : 'badge-warning'}`}
                      >
                        {f.flag_status}
                      </span>
                      {f.flag_status === 'Open' && (
                        <span className="badge badge-info">Assigned to You</span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Contract:{' '}
                      <Link href={`/contracts/${f.contract_id}`} style={{ fontWeight: 600, color: 'var(--text-accent)' }}>
                        {f.contract_name}
                      </Link>{' '}
                      • Client: <strong style={{ color: '#fff' }}>{f.client_name}</strong>
                    </div>
                  </div>

                  {/* Clause Text */}
                  <div
                    style={{
                      background: 'rgba(6, 6, 15, 0.5)',
                      border: '1px solid rgba(99, 102, 241, 0.1)',
                      borderRadius: 'var(--radius)',
                      padding: '1.25rem',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                      CLAUSE {f.clause_number} TEXT
                    </div>
                    <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#fff', fontStyle: 'italic', margin: 0 }}>
                      &ldquo;{f.clause_text}&rdquo;
                    </p>
                  </div>

                  {/* Matched Pattern & Scores */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      marginBottom: isOpen ? '1.5rem' : 0,
                    }}
                  >
                    <div style={{ maxWidth: '600px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>
                        MATCHED RISK PATTERN (REFERENCE LIBRARY)
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                        {f.risk_pattern}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <div
                        style={{
                          background: 'rgba(15, 17, 32, 0.7)',
                          border: '1px solid var(--border)',
                          padding: '0.5rem 1rem',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>COSINE SIMILARITY</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-accent)' }}>
                          {simPercent}%
                        </div>
                      </div>

                      <div
                        style={{
                          background: 'rgba(15, 17, 32, 0.7)',
                          border: '1px solid var(--border)',
                          padding: '0.5rem 1rem',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>RISK SCORE</div>
                        <div
                          style={{
                            fontSize: '1.15rem',
                            fontWeight: 800,
                            color: f.risk_score > 60 ? 'var(--danger)' : 'var(--warning)',
                          }}
                        >
                          {f.risk_score} / 100
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Review Action Buttons (Transaction) */}
                  {isOpen && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '1rem',
                        borderTop: '1px solid var(--border)',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      <Link href={`/contracts/${f.contract_id}`} className="btn btn-ghost btn-sm">
                        View Entire Contract in Context →
                      </Link>

                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                          type="button"
                          id={`btn-clear-${f.flag_id}`}
                          className="btn btn-sm btn-success"
                          disabled={isProcessing}
                          onClick={() => handleReview(f.flag_id, 'Cleared')}
                        >
                          {isProcessing ? 'Processing...' : '✓ Clear Flag'}
                        </button>
                        <button
                          type="button"
                          id={`btn-escalate-${f.flag_id}`}
                          className="btn btn-sm btn-danger"
                          disabled={isProcessing}
                          onClick={() => handleReview(f.flag_id, 'Escalated')}
                        >
                          {isProcessing ? 'Processing...' : '⚠️ Escalate for Further Review'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
