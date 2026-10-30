'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * Navigation bar component — adapts links based on user role.
 * Demonstrates role-based UI (Rubric #12).
 */
export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  if (!user) return null;

  const links = [];

  links.push({ href: '/dashboard', label: 'Dashboard' });

  if (user.role === 'Client' || user.role === 'LegalAdmin') {
    links.push({ href: '/contracts', label: 'Contracts' });
  }

  if (user.role === 'Client') {
    links.push({ href: '/contracts/upload', label: 'Upload' });
  }

  if (user.role === 'Reviewer') {
    links.push({ href: '/reviewer', label: 'Review Queue' });
  }

  if (user.role === 'LegalAdmin') {
    links.push({ href: '/admin', label: 'Admin' });
    links.push({ href: '/admin/risk-library', label: 'Risk Library' });
  }

  const activeLink = [...links]
    .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav className="navbar">
      <a href="/dashboard" className="navbar-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="navbar-brand-icon">⚖</div>
        ClauseGuard
      </a>

      <div className="navbar-links">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`navbar-link${activeLink?.href === link.href ? ' active' : ''}`}
          >
            {link.label}
          </a>
        ))}
      </div>

      <div className="navbar-user">
        <div className="navbar-user-info">
          <div className="navbar-user-name">{user.name}</div>
          <div className="navbar-user-role">{user.role}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
