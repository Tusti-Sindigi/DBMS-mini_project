'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Public registration creates Clients. The first administrator can be
 * bootstrapped once with the server-side setup token.
 */
export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapAdminAvailable, setBootstrapAdminAvailable] = useState(false);
  const [createInitialAdmin, setCreateInitialAdmin] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already authenticated, redirect straight to dashboard
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) {
          router.replace('/dashboard');
        }
      })
      .catch(() => {});

    fetch('/api/auth/signup')
      .then((response) => response.json())
      .then((data) => setBootstrapAdminAvailable(Boolean(data.bootstrapAdminAvailable)))
      .catch(() => setBootstrapAdminAvailable(false));
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          password,
          role: createInitialAdmin ? 'LegalAdmin' : 'Client',
          ...(createInitialAdmin ? { bootstrapToken } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Signup failed');
        return;
      }

      if (data.user?.role === 'LegalAdmin') {
        setBootstrapAdminAvailable(false);
      }
      // Replace /signup in history so going back does not return to signup
      router.replace('/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '2.5rem' }}>⚖</span>
        </div>
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">Join ClauseGuard to get started</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="signup-name">
              Username
            </label>
            <input
              id="signup-name"
              type="text"
              className="form-input"
              placeholder="Choose a username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              minLength={2}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              className="form-input"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="form-group">
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius)',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>👤</span>
              <strong>{createInitialAdmin ? 'Initial Legal Admin' : 'Client Account'}</strong>
              {createInitialAdmin ? ' (Set up system access and staff)' : ' (Upload & monitor contracts)'}
            </div>
            <span className="form-hint" style={{ marginTop: '0.35rem', display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Public registration creates Client accounts. Reviewer accounts are provisioned by a Legal Admin.
            </span>
          </div>

          {bootstrapAdminAvailable && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createInitialAdmin}
                  onChange={(event) => setCreateInitialAdmin(event.target.checked)}
                />
                Set up the initial Legal Admin account
              </label>
              {createInitialAdmin && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label className="form-label" htmlFor="bootstrap-token">Initial setup token</label>
                  <input
                    id="bootstrap-token"
                    type="password"
                    className="form-input"
                    value={bootstrapToken}
                    onChange={(event) => setBootstrapToken(event.target.value)}
                    autoComplete="off"
                    required
                  />
                  <span className="form-hint">Use the token configured by the person running the app.</span>
                </div>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" /> Creating account…
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <a href="/login">Sign in</a>
        </div>
      </div>
    </div>
  );
}
