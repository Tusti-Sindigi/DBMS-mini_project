'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params.id;

  const [contract, setContract] = useState(null);
  const [clauses, setClauses] = useState([]);
  const [user, setUser] = useState(null);
  const [reviewers, setReviewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [processingFlagId, setProcessingFlagId] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('ALL'); // 'ALL' | 'FLAGGED' | 'CLEAN'

  useEffect(() => {
    async function loadContractData() {
      try {
        setLoading(true);
        const [meRes, contractRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch(`/api/contracts/${contractId}`),
        ]);

        const meData = await meRes.json();
        const cData = await contractRes.json();

        if (meData.user) {
          setUser(meData.user);
          if (meData.user.role === 'LegalAdmin') {
            // Load reviewers list for assignment dropdown
            fetch('/api/users/reviewers')
              .then((r) => r.json())
              .then((data) => {
                if (data.reviewers) setReviewers(data.reviewers);
              })
              .catch(() => {});
          }
        }

        if (cData.error) {
          setError(cData.error);
        } else {
          setContract(cData.contract);
          setClauses(cData.clauses);
        }
      } catch (err) {
        console.error('Failed to load contract:', err);
        setError('Failed to load contract details.');
      } finally {
        setLoading(false);
      }
    }

    if (contractId) {
      loadContractData();
    }
  }, [contractId]);

  // Handle reviewer action (Clear / Escalate) inside atomic TRANSACTION
  async function handleReviewAction(flagId, action) {
    try {
      setProcessingFlagId(flagId);
      setActionSuccess(null);
      setError(null);

      const res = await fetch(`/api/flags/${flagId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to review flag');
      }

      // Update state locally
      setClauses((prev) =>
        prev.map((c) =>
          c.flag_id === flagId
            ? { ...c, flag_status: action, last_review_action: action }
            : c
        )
      );

      setActionSuccess(`Flag successfully ${action.toLowerCase()} via database transaction.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingFlagId(null);
    }
  }

  // Handle reviewer assignment (LegalAdmin only)
  async function handleAssignReviewer(flagId, reviewerId) {
    try {
      setProcessingFlagId(flagId);
      setError(null);

      const res = await fetch(`/api/flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewerId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign reviewer');
      }

      const assignedRev = reviewers.find((r) => String(r.id) === String(reviewerId));
      const nextReviewerId = reviewerId || null;

      setClauses((prev) =>
        prev.map((c) =>
          c.flag_id === flagId
            ? { ...c, reviewer_id: nextReviewerId, reviewer_name: assignedRev?.name || null }
            : c
        )
      );

      setActionSuccess(assignedRev ? `Assigned flag to ${assignedRev.name}.` : 'Reviewer assignment removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingFlagId(null);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ textAlign: 'center', padding: '6rem 0' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1.5rem auto' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading clause breakdown...</p>
        </div>
      </>
    );
  }

  const isReviewer = user?.role === 'Reviewer';
  const contractsHref = isReviewer ? '/reviewer' : '/contracts';
  const contractsLabel = isReviewer ? 'Review Queue' : 'Contracts';

  if (error && !contract) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ padding: '3rem 1rem', maxWidth: '800px' }}>
          <div className="alert alert-danger">{error}</div>
          <div style={{ marginTop: '1.5rem' }}>
            <Link href={contractsHref} className="btn btn-secondary">
              ← Return to {contractsLabel}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const flaggedClauses = clauses.filter((c) => c.flag_id);
  const openFlags = clauses.filter((c) => c.flag_id && c.flag_status === 'Open');
  const maxRiskScore = Math.max(...clauses.map((c) => parseFloat(c.risk_score) || 0), 0);
  const filteredClauses = clauses.filter((c) => {
    if (selectedFilter === 'FLAGGED') return !!c.flag_id;
    if (selectedFilter === 'CLEAN') return !c.flag_id;
    return true;
  });

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '2.5rem 1rem' }}>
        {/* Navigation Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          <Link href={contractsHref} style={{ color: 'var(--text-muted)' }}>
            {contractsLabel}
          </Link>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{contract.fileName}</span>
        </div>

        {/* Contract Header & Metadata */}
        <div
          className="card"
          style={{
            padding: '2rem',
            marginBottom: '2rem',
            border: '1px solid var(--border)',
            background: 'linear-gradient(135deg, rgba(15, 17, 32, 0.9) 0%, rgba(22, 24, 48, 0.7) 100%)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{contract.fileName}</h1>
                <span className={`badge ${contract.status === 'Analyzed' ? 'badge-success' : 'badge-warning'}`}>
                  {contract.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                <div>Client: <strong style={{ color: '#fff' }}>{contract.clientName}</strong></div>
                <div>Uploaded: <strong style={{ color: '#fff' }}>{new Date(contract.uploadDate).toLocaleString()}</strong></div>
                <div>Contract ID: <strong style={{ color: '#fff' }}>#{contract.id}</strong></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Link href={contractsHref} className="btn btn-secondary btn-sm">
                ← {isReviewer ? 'Review Queue' : 'All Contracts'}
              </Link>
              {user?.role === 'Client' && (
                <Link href="/contracts/upload" className="btn btn-primary btn-sm">
                  + Upload Another
                </Link>
              )}
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{isReviewer ? 'ASSIGNED REVIEW ITEMS' : 'TOTAL CLAUSES'}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginTop: '0.25rem' }}>
                {clauses.length}
              </div>
            </div>

            {!isReviewer && <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>FLAGGED CLAUSES</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: flaggedClauses.length > 0 ? 'var(--danger)' : 'var(--success)', marginTop: '0.25rem' }}>
                {flaggedClauses.length}
              </div>
            </div>}

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{isReviewer ? 'OPEN ASSIGNED FLAGS' : 'UNRESOLVED (OPEN)'}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: openFlags.length > 0 ? 'var(--warning)' : 'var(--success)', marginTop: '0.25rem' }}>
                {openFlags.length}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{isReviewer ? 'PEAK ASSIGNED RISK SCORE' : 'PEAK RISK SCORE'}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: maxRiskScore > 60 ? 'var(--danger)' : maxRiskScore > 30 ? 'var(--warning)' : 'var(--success)', marginTop: '0.25rem' }}>
                {maxRiskScore > 0 ? `${maxRiskScore.toFixed(1)} / 100` : 'None'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Alerts */}
        {actionSuccess && (
          <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
            ✓ {actionSuccess}
          </div>
        )}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {/* Filter Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Clause Breakdown & Risk Triage</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {isReviewer
                ? 'Only clauses with flags assigned to you are shown. Other contract clauses are outside your review queue.'
                : 'Individual clauses extracted from contract. Color-coded by pgvector similarity & severity.'}
            </p>
          </div>

          {!isReviewer && <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${selectedFilter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedFilter('ALL')}
            >
              All Clauses ({clauses.length})
            </button>
            <button
              className={`btn btn-sm ${selectedFilter === 'FLAGGED' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedFilter('FLAGGED')}
            >
              Flagged Only ({flaggedClauses.length})
            </button>
            <button
              className={`btn btn-sm ${selectedFilter === 'CLEAN' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedFilter('CLEAN')}
            >
              Clean Only ({clauses.length - flaggedClauses.length})
            </button>
          </div>}
        </div>

        {/* Clause Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {filteredClauses.map((cl) => {
            const isFlagged = !!cl.flag_id;
            const severity = cl.severity_weight || 0;
            const simScore = cl.similarity_score !== null ? (cl.similarity_score * 100).toFixed(1) : null;
            const riskScore = cl.risk_score ? parseFloat(cl.risk_score).toFixed(1) : null;

            // Border color by severity
            let cardBorder = 'rgba(99, 102, 241, 0.12)';
            let statusBadge = null;

            if (isFlagged) {
              if (cl.flag_status === 'Open') {
                cardBorder = severity >= 4 ? 'rgba(239, 68, 68, 0.6)' : severity === 3 ? 'rgba(245, 158, 11, 0.6)' : 'rgba(59, 130, 246, 0.6)';
                statusBadge = <span className="badge badge-danger">Open Flag</span>;
              } else if (cl.flag_status === 'Cleared') {
                cardBorder = 'rgba(16, 185, 129, 0.4)';
                statusBadge = <span className="badge badge-success">Cleared by Reviewer</span>;
              } else if (cl.flag_status === 'Escalated') {
                cardBorder = 'rgba(245, 158, 11, 0.5)';
                statusBadge = <span className="badge badge-warning">Escalated for Further Review</span>;
              }
            }

            const canReview =
              isFlagged &&
              cl.flag_status === 'Open' &&
              user?.role === 'Reviewer' &&
              String(cl.reviewer_id) === String(user?.id);

            return (
              <div
                key={cl.clause_id}
                id={`clause-${cl.clause_id}`}
                className="card"
                style={{
                  border: `1px solid ${cardBorder}`,
                  padding: '1.75rem',
                  position: 'relative',
                  boxShadow: isFlagged && cl.flag_status === 'Open' ? '0 4px 20px rgba(239, 68, 68, 0.08)' : 'none',
                }}
              >
                {/* Clause Header Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(99, 102, 241, 0.15)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: 'var(--text-accent)',
                      }}
                    >
                      Clause {cl.clause_number}
                    </span>
                    {isFlagged ? (
                      statusBadge
                    ) : (
                      <span className="badge badge-secondary" style={{ opacity: 0.7 }}>
                        No Risk Detected
                      </span>
                    )}
                  </div>

                  {isFlagged && (
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Assigned:</span>
                      <strong style={{ color: cl.reviewer_name ? 'var(--text-accent)' : 'var(--text-muted)' }}>
                        {cl.reviewer_name || 'Unassigned'}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Clause Text */}
                <div
                  style={{
                    fontSize: '1rem',
                    lineHeight: 1.65,
                    color: '#f0f1f5',
                    marginBottom: isFlagged ? '1.5rem' : '0.5rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {cl.clause_text}
                </div>

                {/* Flag Analysis Details (if clause matched a pattern) */}
                {isFlagged && (
                  <div
                    style={{
                      background: 'rgba(22, 24, 48, 0.6)',
                      border: '1px solid rgba(99, 102, 241, 0.2)',
                      borderRadius: 'var(--radius)',
                      padding: '1.25rem',
                      marginTop: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠️ Matched Pattern:</span>
                          <span className="badge badge-primary">{cl.risk_category}</span>
                          <span className="badge badge-secondary">Severity: {cl.severity_weight}/5</span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '700px' }}>
                          &ldquo;{cl.matched_pattern}&rdquo;
                        </p>
                      </div>

                      {/* Score Pills */}
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <div
                          style={{
                            textAlign: 'center',
                            background: 'rgba(6, 6, 15, 0.6)',
                            padding: '0.5rem 0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>COSINE SIMILARITY</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-accent)' }}>
                            {simScore}%
                          </div>
                        </div>

                        <div
                          style={{
                            textAlign: 'center',
                            background: 'rgba(6, 6, 15, 0.6)',
                            padding: '0.5rem 0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SQL RISK SCORE</div>
                          <div
                            style={{
                              fontSize: '1.1rem',
                              fontWeight: 800,
                              color: riskScore > 60 ? 'var(--danger)' : riskScore > 30 ? 'var(--warning)' : 'var(--success)',
                            }}
                          >
                            {riskScore} / 100
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Review Actions Bar (Transaction execution) */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid rgba(99, 102, 241, 0.1)',
                      }}
                    >
                      {/* LegalAdmin Assignment Dropdown */}
                      {user?.role === 'LegalAdmin' && cl.flag_status === 'Open' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Assign Reviewer:</span>
                          <select
                            className="input"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', width: 'auto' }}
                            value={cl.reviewer_id || ''}
                            onChange={(e) => handleAssignReviewer(cl.flag_id, e.target.value)}
                            disabled={processingFlagId === cl.flag_id}
                          >
                            <option value="">{cl.reviewer_id ? '-- Unassign Reviewer --' : '-- Select Reviewer --'}</option>
                            {reviewers.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.active_queue_count} pending)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Transactional Clear / Escalate Buttons */}
                      {canReview && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            onClick={() => handleReviewAction(cl.flag_id, 'Cleared')}
                            disabled={processingFlagId === cl.flag_id}
                          >
                            ✓ Clear Flag
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => handleReviewAction(cl.flag_id, 'Escalated')}
                            disabled={processingFlagId === cl.flag_id}
                          >
                            ⚠️ Escalate for Further Review
                          </button>
                        </div>
                      )}

                      {/* Show message if assigned reviewer is someone else */}
                      {user?.role === 'Reviewer' &&
                        cl.flag_status === 'Open' &&
                        cl.reviewer_id &&
                        String(cl.reviewer_id) !== String(user?.id) && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Assigned to {cl.reviewer_name || 'another reviewer'}. Only the assigned Reviewer can adjudicate.
                          </div>
                        )}

                      {/* Historical action record if closed */}
                      {cl.flag_status !== 'Open' && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Status: <strong>{cl.flag_status}</strong> (Logged to <code>review_history</code>)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
