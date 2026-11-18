import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, extractErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/layout/Layout';

export const LoginPage: React.FC = () => {
  const { loginWithAuthResponse } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authApi.login({ identifier: identifier.trim(), password });
      loginWithAuthResponse(res);
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err, 'Invalid credentials'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-ni-black border border-ni-border p-8">
          <h1 className="text-2xl font-bold text-white mb-1">Log in to NotesIndia</h1>
          <p className="text-xs text-ni-muted mb-6">
            Upload notes, manage bookmarks, and learn with Padhaku AI.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-ni-muted mb-1">Username or Email</label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="aarav_sharma or aarav@notesindia.in"
                className="ni-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-ni-muted">Password</label>
                <Link to="/forgot-password" className="text-xs text-ni-muted hover:text-white underline">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ni-input"
              />
            </div>

            {error && <p className="text-xs text-white bg-ni-surface border border-white p-3">{error}</p>}

            <button type="submit" disabled={submitting} className="w-full ni-btn-primary">
              {submitting ? 'Signing in...' : 'Log in'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-ni-border text-xs text-ni-muted space-y-2">
            <p>
              New to NotesIndia?{' '}
              <Link to="/register" className="text-white underline">
                Create an account
              </Link>
            </p>
            <div className="bg-ni-surface border border-ni-border p-3 text-[11px] space-y-1">
              <div className="text-white font-medium">Seeded Local Dev Accounts:</div>
              <div>Student: <code>aarav_sharma</code> / <code>Student@123</code></div>
              <div>Admin: <code>admin</code> / <code>Admin@123</code></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
