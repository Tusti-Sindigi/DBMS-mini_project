'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function ContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    async function init() {
      try {
        const [meRes, contractsRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/contracts'),
        ]);

        const meData = await meRes.json();
        const cData = await contractsRes.json();

        if (meData.user) setUser(meData.user);
        if (cData.contracts) setContracts(cData.contracts);
      } catch (err) {
        console.error('Failed to load contracts:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const filteredContracts = contracts.filter((c) => {
    const matchesSearch =
      c.file_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'HAS_FLAGS' && c.open_flag_count > 0) ||
      (statusFilter === 'CLEAN' && c.open_flag_count === 0);
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '2.5rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Contracts Directory</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              {user?.role === 'LegalAdmin'
                ? 'All contracts registered in the organization across clients.'
                : 'Your uploaded agreements and risk analysis reports.'}
            </p>
          </div>

          {user?.role === 'Client' && (
            <Link href="/contracts/upload" className="btn btn-primary" id="btn-upload-contract">
              + Upload Contract
            </Link>
          )}
        </div>

        {/* Filter Bar */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            id="contracts-search-input"
            className="input"
            placeholder="Search by contract or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '350px' }}
          />

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter('ALL')}
            >
              All ({contracts.length})
            </button>
            <button
              className={`btn btn-sm ${statusFilter === 'HAS_FLAGS' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter('HAS_FLAGS')}
            >
              Risky / Flagged ({contracts.filter((c) => c.open_flag_count > 0).length})
            </button>
            <button
              className={`btn btn-sm ${statusFilter === 'CLEAN' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter('CLEAN')}
            >
              Clean ({contracts.filter((c) => c.open_flag_count === 0).length})
            </button>
          </div>
        </div>

        {/* Contracts Table */}
        <div className="card" style={{ padding: '1.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }}></div>
              <p style={{ color: 'var(--text-secondary)' }}>Loading contracts...</p>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔍</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No matching contracts found</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                Try adjusting your search criteria or upload a new contract.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Contract Name</th>
                    {user?.role === 'LegalAdmin' && <th>Client</th>}
                    <th>Upload Date</th>
                    <th>Status</th>
                    <th>Clauses Segmented</th>
                    <th>Open Risk Flags</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, color: '#fff' }}>
                        <Link href={`/contracts/${c.id}`} style={{ color: 'inherit' }}>
                          {c.file_name}
                        </Link>
                      </td>
                      {user?.role === 'LegalAdmin' && (
                        <td style={{ color: 'var(--text-accent)' }}>{c.client_name}</td>
                      )}
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
                          <span className="badge badge-danger">{c.open_flag_count} Flagged</span>
                        ) : (
                          <span className="badge badge-success">Clean (0)</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/contracts/${c.id}`} className="btn btn-secondary btn-sm">
                          Inspect Clauses →
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
    </>
  );
}
