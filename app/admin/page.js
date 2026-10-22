'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [openFlags, setOpenFlags] = useState([]);
  const [reviewers, setReviewers] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [assigningId, setAssigningId] = useState(null);
  const [autoAssigning, setAutoAssigning] = useState(false);

  // Staff provisioning form state
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Reviewer');
  const [creatingStaff, setCreatingStaff] = useState(false);

  useEffect(() => {
    loadAdminData();
  }, []);

  async function loadAdminData() {
    try {
      setLoading(true);
      const [adminRes, flagsRes, reviewersRes, staffRes] = await Promise.all([
        fetch('/api/admin/dashboard'),
        fetch('/api/flags?status=Open'),
        fetch('/api/users/reviewers'),
        fetch('/api/admin/users'),
      ]);

      const aData = await adminRes.json();
      const fData = await flagsRes.json();
      const rData = await reviewersRes.json();
      const sData = await staffRes.json();

      if (aData.error) throw new Error(aData.error);

      setData(aData);
      if (fData.flags) setOpenFlags(fData.flags);
      if (rData.reviewers) setReviewers(rData.reviewers);
      if (sData.staff) setStaffList(sData.staff);
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
      setError(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignReviewer(flagId, reviewerId) {
    if (!reviewerId) return;

    try {
      setAssigningId(flagId);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch(`/api/flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewerId }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Assignment failed');

      const assignedRev = reviewers.find((r) => String(r.id) === String(reviewerId));
      setSuccessMsg(`Flag #${flagId} assigned to ${assignedRev?.name || 'Reviewer'}`);

      // Update flag row in state
      setOpenFlags((prev) =>
        prev.map((f) =>
          f.flag_id === flagId
            ? { ...f, reviewer_id: reviewerId, reviewer_name: assignedRev?.name }
            : f
        )
      );

      // Refresh staff counts
      const staffRes = await fetch('/api/admin/users');
      const sData = await staffRes.json();
      if (sData.staff) setStaffList(sData.staff);
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigningId(null);
    }
  }

  async function handleAutoAssign() {
    try {
      setAutoAssigning(true);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch('/api/admin/auto-assign', {
        method: 'POST',
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Auto-assignment failed');

      setSuccessMsg(result.message);
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    } finally {
      setAutoAssigning(false);
    }
  }

  async function handleCreateStaff(e) {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffPassword) return;

    try {
      setCreatingStaff(true);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStaffName.trim(),
          password: newStaffPassword,
          role: newStaffRole,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to provision staff account');

      setSuccessMsg(result.message);
      setNewStaffName('');
      setNewStaffPassword('');

      // Reload staff list and reviewers dropdown
      const [reviewersRes, staffRes] = await Promise.all([
        fetch('/api/users/reviewers'),
        fetch('/api/admin/users'),
      ]);
      const rData = await reviewersRes.json();
      const sData = await staffRes.json();
      if (rData.reviewers) setReviewers(rData.reviewers);
      if (sData.staff) setStaffList(sData.staff);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingStaff(false);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ textAlign: 'center', padding: '6rem 0' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1.5rem auto' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading Legal Admin Dashboard...</p>
        </div>
      </>
    );
  }

  const unassignedCount = openFlags.filter((f) => !f.reviewer_id).length;

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '2.5rem 1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Legal Admin Oversight</h1>
              <span className="badge badge-primary">Rubric #8: CTE View & Stored Procedures</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              System-wide risk monitoring, reviewer workload allocation, staff provisioning, and executive client risk analytics.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/admin/risk-library" className="btn btn-secondary btn-sm">
              ⚙️ Manage Risk Library
            </Link>
            <Link href="/contracts" className="btn btn-secondary btn-sm">
              📄 View All Contracts
            </Link>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
            ✓ {successMsg}
          </div>
        )}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {/* Stats Grid */}
        {data?.stats && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '1rem',
              marginBottom: '2.5rem',
            }}
          >
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL CONTRACTS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: '#fff' }}>
                {data.stats.totalContracts}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL CLAUSES</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--accent-hover)' }}>
                {data.stats.totalClauses}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>OPEN FLAGS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--danger)' }}>
                {data.stats.openFlags}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CLEARED FLAGS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--success)' }}>
                {data.stats.clearedFlags}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ESCALATED FLAGS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--warning)' }}>
                {data.stats.escalatedFlags}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SIMILARITY THRESHOLD</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-accent)' }}>
                {data.stats.similarityThreshold}
              </div>
            </div>
          </div>
        )}

        {/* Section 1: The CTE-Backed View Table */}
        <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Unresolved Flags by Client (SQL View)</h2>
                <span className="badge badge-primary">VIEW unresolved_flags_by_client</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Evaluates two CTEs (<code>client_flags</code>, <code>client_contracts</code>) to calculate per-client
                unresolved exposure, average similarity %, and weighted risk scores without table lockups.
              </p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Client Name</th>
                  <th>Total Contracts</th>
                  <th>Unresolved Flags</th>
                  <th>Avg Similarity</th>
                  <th>Avg Risk Score (0-100)</th>
                  <th>Latest Flagged Date</th>
                </tr>
              </thead>
              <tbody>
                {data?.unresolvedByClient && data.unresolvedByClient.length > 0 ? (
                  data.unresolvedByClient.map((client) => (
                    <tr key={client.client_id}>
                      <td style={{ fontWeight: 600, color: '#fff' }}>{client.client_name}</td>
                      <td>{client.total_contracts}</td>
                      <td>
                        {client.open_flag_count > 0 ? (
                          <span className="badge badge-danger">{client.open_flag_count} Open</span>
                        ) : (
                          <span className="badge badge-success">0 (Clean)</span>
                        )}
                      </td>
                      <td>
                        {client.avg_similarity_score !== null
                          ? `${(client.avg_similarity_score * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td>
                        {client.avg_risk_score !== null ? (
                          <strong
                            style={{
                              color:
                                client.avg_risk_score > 60
                                  ? 'var(--danger)'
                                  : client.avg_risk_score > 30
                                  ? 'var(--warning)'
                                  : 'var(--success)',
                            }}
                          >
                            {client.avg_risk_score} / 100
                          </strong>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {client.latest_flag_date ? new Date(client.latest_flag_date).toLocaleDateString() : 'None'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      No client records available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Open Flags Management & Reviewer Assignment */}
        <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Open Flags Reviewer Assignment</h2>
                <span className="badge badge-warning">{unassignedCount} Unassigned</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Allocate open triage flags to designated reviewers.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleAutoAssign}
                disabled={autoAssigning || unassignedCount === 0 || reviewers.length === 0}
              >
                {autoAssigning ? 'Distributing...' : '⚡ Auto-Assign Open Flags (Round-Robin)'}
              </button>
            </div>
          </div>

          {openFlags.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>
              🎉 All risk flags have been resolved.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Flag ID</th>
                    <th>Contract & Clause</th>
                    <th>Risk Category</th>
                    <th>Similarity %</th>
                    <th>Risk Score</th>
                    <th>Current Assignee</th>
                    <th>Assign Reviewer</th>
                  </tr>
                </thead>
                <tbody>
                  {openFlags.map((f) => (
                    <tr key={f.flag_id}>
                      <td style={{ color: 'var(--text-muted)' }}>#{f.flag_id}</td>
                      <td>
                        <Link href={`/contracts/${f.contract_id}`} style={{ fontWeight: 600 }}>
                          {f.contract_name}
                        </Link>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Clause {f.clause_number} ({f.client_name})
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-primary">{f.risk_category}</span>
                      </td>
                      <td>{(f.similarity_score * 100).toFixed(1)}%</td>
                      <td>
                        <strong style={{ color: f.risk_score > 60 ? 'var(--danger)' : 'var(--warning)' }}>
                          {f.risk_score}
                        </strong>
                      </td>
                      <td>
                        <span style={{ color: f.reviewer_name ? 'var(--text-accent)' : 'var(--text-muted)' }}>
                          {f.reviewer_name ? `Assigned to ${f.reviewer_name}` : 'Unassigned'}
                        </span>
                      </td>
                      <td>
                        <select
                          className="input"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', width: 'auto' }}
                          value={f.reviewer_id || ''}
                          disabled={assigningId === f.flag_id}
                          onChange={(e) => handleAssignReviewer(f.flag_id, e.target.value)}
                        >
                          <option value="">-- Assign Reviewer --</option>
                          {reviewers.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.active_queue_count} pending)
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 3: Staff Account Provisioning (RBAC Control) */}
        <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Staff Account Provisioning</h2>
                <span className="badge badge-primary">Rubric #12: RBAC</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Secure staff account management. Public registration is restricted to Clients; Legal Admins provision internal Reviewers and Admins here.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            {/* Create Staff Form */}
            <form onSubmit={handleCreateStaff} style={{ background: 'rgba(22, 24, 48, 0.4)', padding: '1.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }}>+ Provision New Staff Account</h3>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Staff Username</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. tina_reviewer"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  required
                  minLength={2}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Temporary Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Minimum 6 characters"
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Assigned Staff Role</label>
                <select
                  className="input"
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                >
                  <option value="Reviewer">Reviewer (Adjudicate assigned flags)</option>
                  <option value="LegalAdmin">LegalAdmin (Full management & assignment)</option>
                </select>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={creatingStaff || !newStaffName.trim() || !newStaffPassword}
                style={{ width: '100%' }}
              >
                {creatingStaff ? 'Provisioning...' : 'Provision Staff Account'}
              </button>
            </form>

            {/* Existing Staff Table */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }}>Active Staff Directory ({staffList.length})</h3>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Active Queue</th>
                      <th>Reviews Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600, color: '#fff' }}>{s.name}</td>
                        <td>
                          <span className={`badge ${s.role === 'LegalAdmin' ? 'badge-primary' : 'badge-info'}`}>
                            {s.role}
                          </span>
                        </td>
                        <td>
                          {s.role === 'Reviewer' ? (
                            <span style={{ color: s.open_queue_count > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                              {s.open_queue_count} pending
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{s.total_reviews_completed || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Recent Review History Audit Trail */}
        <div className="card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Audit Trail (review_history)</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Immutable historical review events populated by reviewer transactions.
              </p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Reviewer</th>
                  <th>Contract</th>
                  <th>Clause</th>
                  <th>Risk Category</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentActivity && data.recentActivity.length > 0 ? (
                  data.recentActivity.map((act) => (
                    <tr key={act.id}>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {new Date(act.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <span className={`badge ${act.action === 'Cleared' ? 'badge-success' : 'badge-danger'}`}>
                          {act.action}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: '#fff' }}>{act.reviewer_name}</td>
                      <td>{act.file_name}</td>
                      <td>Clause {act.clause_number}</td>
                      <td>{act.risk_category}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      No audit events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
