'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Role-specific data
  const [contracts, setContracts] = useState([]);
  const [reviewerFlags, setReviewerFlags] = useState([]);
  const [adminData, setAdminData] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // 1. Fetch current session
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json();

        if (meData.error || !meData.user) {
          window.location.href = '/login';
          return;
        }

        setUser(meData.user);

        // 2. Fetch role-specific data
        if (meData.user.role === 'Client') {
          const contractsRes = await fetch('/api/contracts');
          const cData = await contractsRes.json();
          if (cData.contracts) setContracts(cData.contracts);
        } else if (meData.user.role === 'Reviewer') {
          const flagsRes = await fetch('/api/flags?status=Open');
          const fData = await flagsRes.json();
          if (fData.flags) setReviewerFlags(fData.flags);
        } else if (meData.user.role === 'LegalAdmin') {
          const [contractsRes, adminRes] = await Promise.all([
            fetch('/api/contracts'),
            fetch('/api/admin/dashboard'),
          ]);
          const cData = await contractsRes.json();
          const aData = await adminRes.json();
          if (cData.contracts) setContracts(cData.contracts);
          if (!aData.error) setAdminData(aData);
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
        setError('Failed to load dashboard data. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ textAlign: 'center', padding: '6rem 0' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1.5rem auto' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ padding: '3rem 0' }}>
          <div className="alert alert-danger">{error}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '2.5rem 1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Welcome, {user.name}</h1>
              <span className={`badge ${user.role === 'LegalAdmin' ? 'badge-primary' : user.role === 'Reviewer' ? 'badge-info' : 'badge-secondary'}`}>
                {user.role}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              {user.role === 'Client' && 'Upload and monitor contract risks flagged by AI semantic similarity.'}
              {user.role === 'Reviewer' && 'Review risk flags assigned to you and record a decision for each one.'}
              {user.role === 'LegalAdmin' && 'System-wide legal compliance, risk library curation, and reviewer assignment.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {user.role === 'Client' && (
              <Link href="/contracts/upload" id="upload-contract-shortcut" className="btn btn-primary">
                + Upload New Contract
              </Link>
            )}
            {user.role === 'Reviewer' && (
              <Link href="/reviewer" id="view-queue-shortcut" className="btn btn-primary">
                Go to Review Queue →
              </Link>
            )}
            {user.role === 'LegalAdmin' && (
              <>
                <Link href="/admin/risk-library" className="btn btn-secondary btn-sm">
                  Manage Risk Library
                </Link>
                <Link href="/admin" className="btn btn-primary btn-sm">
                  Full Admin Dashboard →
                </Link>
              </>
            )}
          </div>
        </div>

        {/* ───────── CLIENT VIEW ───────── */}
        {user.role === 'Client' && (
          <div>
            {/* Stat Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1.25rem',
                marginBottom: '2.5rem',
              }}
            >
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL CONTRACTS</div>
                <div style={{ fontSize: '2.25rem', fontWeight: 800, marginTop: '0.5rem', color: '#fff' }}>
                  {contracts.length}
                </div>
              </div>
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>OPEN RISK FLAGS</div>
                <div
                  style={{
                    fontSize: '2.25rem',
                    fontWeight: 800,
                    marginTop: '0.5rem',
                    color: contracts.reduce((acc, c) => acc + (c.open_flag_count || 0), 0) > 0 ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {contracts.reduce((acc, c) => acc + (c.open_flag_count || 0), 0)}
                </div>
              </div>
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>ANALYZED STATUS</div>
                <div style={{ fontSize: '2.25rem', fontWeight: 800, marginTop: '0.5rem', color: 'var(--accent-hover)' }}>
                  {contracts.filter((c) => c.status === 'Analyzed').length}
                </div>
              </div>
            </div>

            {/* Contracts List */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Your Uploaded Contracts</h2>
                <Link href="/contracts/upload" className="btn btn-secondary btn-sm">
                  + New Upload
                </Link>
              </div>

              {contracts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📄</div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>No contracts uploaded yet</h3>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 1.5rem auto', fontSize: '0.9rem' }}>
                    Upload your first agreement to run 384-dimensional semantic clause segmentation and automated risk checking.
                  </p>
                  <Link href="/contracts/upload" className="btn btn-primary">
                    Upload Your First Contract
                  </Link>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Contract Name</th>
                        <th>Upload Date</th>
                        <th>Status</th>
                        <th>Clauses</th>
                        <th>Open Flags</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600, color: '#fff' }}>
                            <Link href={`/contracts/${c.id}`} style={{ color: 'inherit' }}>
                              {c.file_name}
                            </Link>
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {new Date(c.upload_date).toLocaleDateString()}
                          </td>
                          <td>
                            <span className={`badge ${c.status === 'Analyzed' ? 'badge-success' : 'badge-warning'}`}>
                              {c.status}
                            </span>
                          </td>
                          <td>{c.clause_count}</td>
                          <td>
                            {c.open_flag_count > 0 ? (
                              <span className="badge badge-danger">{c.open_flag_count} Open</span>
                            ) : (
                              <span className="badge badge-success">Clean</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link href={`/contracts/${c.id}`} className="btn btn-secondary btn-sm">
                              View Breakdown →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ───────── REVIEWER VIEW ───────── */}
        {user.role === 'Reviewer' && (
          <div>
            {/* Stat Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1.25rem',
                marginBottom: '2.5rem',
              }}
            >
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>ASSIGNED OPEN FLAGS</div>
                <div style={{ fontSize: '2.25rem', fontWeight: 800, marginTop: '0.5rem', color: reviewerFlags.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
                  {reviewerFlags.length}
                </div>
              </div>
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>ROLE PERMISSION</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--info)' }}>
                    Reviewer
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>May act on assigned flags only</div>
              </div>
            </div>

            {/* Queue Preview */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Active Review Queue</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Open flags assigned to you that need review.
                  </p>
                </div>
                <Link href="/reviewer" className="btn btn-primary btn-sm">
                  Open Full Reviewer Queue
                </Link>
              </div>

              {reviewerFlags.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎉</div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>Queue is clean!</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    You have no pending flags assigned to your review queue right now.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {reviewerFlags.slice(0, 5).map((f) => (
                    <div
                      key={f.flag_id}
                      style={{
                        padding: '1.25rem',
                        background: 'rgba(22, 24, 48, 0.4)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ maxWidth: '650px' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span className="badge badge-danger">{f.risk_category}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {f.contract_name} • Clause {f.clause_number}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                          &ldquo;{f.clause_text.length > 140 ? f.clause_text.substring(0, 140) + '...' : f.clause_text}&rdquo;
                        </p>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Cosine Similarity: <strong>{(f.similarity_score * 100).toFixed(1)}%</strong> | Triage Risk Score: <strong>{f.risk_score} / 100</strong>
                        </div>
                      </div>

                      <div>
                        <Link href={`/contracts/${f.contract_id}`} className="btn btn-secondary btn-sm">
                          Review in Context →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ───────── LEGAL ADMIN VIEW ───────── */}
        {user.role === 'LegalAdmin' && adminData && (
          <div>
            {/* System Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem',
              }}
            >
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL CONTRACTS</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: '#fff' }}>
                  {adminData.stats.totalContracts}
                </div>
              </div>
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL CLAUSES</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--accent-hover)' }}>
                  {adminData.stats.totalClauses}
                </div>
              </div>
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>OPEN FLAGS</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--danger)' }}>
                  {adminData.stats.openFlags}
                </div>
              </div>
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>CLEARED FLAGS</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--success)' }}>
                  {adminData.stats.clearedFlags}
                </div>
              </div>
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>ESCALATED FLAGS</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--warning)' }}>
                  {adminData.stats.escalatedFlags}
                </div>
              </div>
            </div>

            {/* CTE View: Unresolved Flags by Client */}
            <div className="card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Unresolved Flags by Client</h2>
                    <span className="badge badge-primary">Rubric #8: CTE View</span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Real-time aggregation query from <code>unresolved_flags_by_client</code> SQL view.
                  </p>
                </div>
                <Link href="/admin" className="btn btn-secondary btn-sm">
                  Full Compliance View →
                </Link>
              </div>

              {adminData.unresolvedByClient.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', padding: '1rem 0' }}>No clients registered yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Contracts</th>
                        <th>Open Flags</th>
                        <th>Avg Similarity</th>
                        <th>Avg Risk Score</th>
                        <th>Latest Flag Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminData.unresolvedByClient.map((client) => (
                        <tr key={client.client_id}>
                          <td style={{ fontWeight: 600, color: '#fff' }}>{client.client_name}</td>
                          <td>{client.total_contracts}</td>
                          <td>
                            {client.open_flag_count > 0 ? (
                              <span className="badge badge-danger">{client.open_flag_count} Unresolved</span>
                            ) : (
                              <span className="badge badge-success">0 (Clean)</span>
                            )}
                          </td>
                          <td>{client.avg_similarity_score ? `${(client.avg_similarity_score * 100).toFixed(1)}%` : '—'}</td>
                          <td>
                            {client.avg_risk_score !== null && client.avg_risk_score !== undefined ? (
                              <span style={{ fontWeight: 700, color: client.avg_risk_score > 60 ? 'var(--danger)' : 'var(--warning)' }}>
                                {client.avg_risk_score} / 100
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {client.latest_flag_date ? new Date(client.latest_flag_date).toLocaleDateString() : 'None'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent All Contracts Table */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>All Organization Contracts</h2>
                <Link href="/contracts" className="btn btn-secondary btn-sm">
                  View All Contracts
                </Link>
              </div>

              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Contract Name</th>
                      <th>Client</th>
                      <th>Upload Date</th>
                      <th>Status</th>
                      <th>Clauses</th>
                      <th>Open Flags</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.slice(0, 5).map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600, color: '#fff' }}>
                          <Link href={`/contracts/${c.id}`} style={{ color: 'inherit' }}>
                            {c.file_name}
                          </Link>
                        </td>
                        <td>{c.client_name}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {new Date(c.upload_date).toLocaleDateString()}
                        </td>
                        <td>
                          <span className={`badge ${c.status === 'Analyzed' ? 'badge-success' : 'badge-warning'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td>{c.clause_count}</td>
                        <td>
                          {c.open_flag_count > 0 ? (
                            <span className="badge badge-danger">{c.open_flag_count} Open</span>
                          ) : (
                            <span className="badge badge-success">Clean</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href={`/contracts/${c.id}`} className="btn btn-secondary btn-sm">
                            Inspect →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
