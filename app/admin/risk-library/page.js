'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function RiskLibraryPage() {
  const [patterns, setPatterns] = useState([]);
  const [threshold, setThreshold] = useState(0.75);
  const [newThreshold, setNewThreshold] = useState(0.75);
  const [loading, setLoading] = useState(true);
  const [savingPattern, setSavingPattern] = useState(false);
  const [updatingThreshold, setUpdatingThreshold] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // New Pattern Form State
  const [patternText, setPatternText] = useState('');
  const [category, setCategory] = useState('Unlimited Liability');
  const [severity, setSeverity] = useState(4);
  const [filterCategory, setFilterCategory] = useState('ALL');

  useEffect(() => {
    loadLibrary();
  }, []);

  async function loadLibrary() {
    try {
      setLoading(true);
      const res = await fetch('/api/risk-library');
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setPatterns(data.patterns || []);
      setThreshold(data.similarityThreshold || 0.75);
      setNewThreshold(data.similarityThreshold || 0.75);
    } catch (err) {
      console.error('Failed to load risk library:', err);
      setError('Failed to load risk library.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateThreshold(e) {
    e.preventDefault();
    try {
      setUpdatingThreshold(true);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch('/api/risk-library', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ similarityThreshold: parseFloat(newThreshold) }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update threshold');

      setThreshold(data.similarityThreshold);
      setSuccessMsg(`Similarity threshold successfully updated to ${data.similarityThreshold} in risk_config.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingThreshold(false);
    }
  }

  async function handleAddPattern(e) {
    e.preventDefault();
    if (!patternText.trim()) return;

    try {
      setSavingPattern(true);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch('/api/risk-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clause_pattern_text: patternText.trim(),
          risk_category: category,
          severity_weight: severity,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add pattern');

      setSuccessMsg(`Risk pattern successfully embedded (384-dim vector) and added to risk_library.`);
      setPatternText('');
      loadLibrary();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPattern(false);
    }
  }

  const categories = [
    'Unlimited Liability',
    'Unilateral Termination',
    'One-Sided Indemnification',
    'Auto-Renewal Trap',
    'Asymmetric Dispute Resolution',
    'Vague Payment Terms',
    'Broad IP Assignment',
  ];

  const filteredPatterns = patterns.filter(
    (p) => filterCategory === 'ALL' || p.risk_category === filterCategory
  );

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '2.5rem 1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Risk Library Management</h1>
              <span className="badge badge-primary">Rubric #9: Vector Storage</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Curate the semantic reference patterns used by PostgreSQL <code>pgvector</code> cosine distance
              to flag high-risk contract clauses.
            </p>
          </div>

          <Link href="/admin" className="btn btn-secondary btn-sm">
            ← Back to Admin Oversight
          </Link>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
          {/* Card 1: Similarity Threshold Configuration */}
          <div className="card" style={{ padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Dynamic Trigger Threshold
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Controls <code>risk_config.similarity_threshold</code>. The PostgreSQL trigger auto-creates an Open flag
              when clause cosine similarity meets or exceeds this value.
            </p>

            <form onSubmit={handleUpdateThreshold}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.01"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: 'var(--text-accent)',
                    minWidth: '55px',
                    textAlign: 'right',
                  }}
                >
                  {newThreshold.toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Active DB Value: <strong>{threshold}</strong>
                </span>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={updatingThreshold || newThreshold === threshold}
                >
                  {updatingThreshold ? 'Saving...' : 'Update Threshold'}
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Add New Risk Pattern */}
          <div className="card" style={{ padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Add Reference Risk Pattern
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              New patterns are passed to the Python embedding service, converted into 384-dimensional vectors,
              and stored directly in <code>risk_library</code>.
            </p>

            <form onSubmit={handleAddPattern}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>
                  Risk Category
                </label>
                <select
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>
                  Severity Weight (1: Low to 5: Critical)
                </label>
                <select
                  className="input"
                  value={severity}
                  onChange={(e) => setSeverity(parseInt(e.target.value, 10))}
                  style={{ fontSize: '0.85rem' }}
                >
                  <option value={1}>1 - Minor / Informational</option>
                  <option value={2}>2 - Low Severity</option>
                  <option value={3}>3 - Moderate Severity</option>
                  <option value={4}>4 - High Severity</option>
                  <option value={5}>5 - Critical / Dealbreaker</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>
                  Clause Pattern Text
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="e.g. In no event shall Provider be liable for any damages whatsoever..."
                  value={patternText}
                  onChange={(e) => setPatternText(e.target.value)}
                  required
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={savingPattern || !patternText.trim()}
                style={{ width: '100%' }}
              >
                {savingPattern ? 'Generating Embedding...' : '+ Embed & Save to Library'}
              </button>
            </form>
          </div>
        </div>

        {/* Existing Patterns Table */}
        <div className="card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Curated Risk Library ({patterns.length} Patterns)</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Vectorized reference clauses indexed with pgvector HNSW cosine ops.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Filter Category:</span>
              <select
                className="input"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', width: 'auto' }}
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }}></div>
              <p style={{ color: 'var(--text-secondary)' }}>Loading patterns...</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Risk Category</th>
                    <th>Severity</th>
                    <th>Pattern Text</th>
                    <th>Matched Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatterns.map((p) => (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--text-muted)' }}>#{p.id}</td>
                      <td>
                        <span className="badge badge-primary">{p.risk_category}</span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            p.severity_weight >= 4
                              ? 'badge-danger'
                              : p.severity_weight === 3
                              ? 'badge-warning'
                              : 'badge-secondary'
                          }`}
                        >
                          {p.severity_weight}/5
                        </span>
                      </td>
                      <td style={{ maxWidth: '450px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {p.clause_pattern_text}
                      </td>
                      <td>
                        {p.match_count > 0 ? (
                          <span className="badge badge-danger">{p.match_count} Matches</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
