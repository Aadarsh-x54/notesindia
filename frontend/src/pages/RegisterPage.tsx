import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, extractErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/layout/Layout';

export const RegisterPage: React.FC = () => {
  const { loginWithAuthResponse } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [institution, setInstitution] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authApi.register({
        username: username.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        institution: institution.trim() || undefined,
        password,
      });
      loginWithAuthResponse(res);
      navigate('/', { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err, 'Registration failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-ni-black border border-ni-border p-8">
          <h1 className="text-2xl font-bold text-white mb-1">Join NotesIndia</h1>
          <p className="text-xs text-ni-muted mb-6">
            Share educational notes, create dynamic categories, and unlock Padhaku AI.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-ni-muted mb-1">Full Name *</label>
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rohan Mehta"
                className="ni-input"
              />
            </div>

            <div>
              <label className="block text-xs text-ni-muted mb-1">Username *</label>
              <input
                type="text"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="rohan_mehta"
                className="ni-input"
              />
            </div>

            <div>
              <label className="block text-xs text-ni-muted mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rohan@example.com"
                className="ni-input"
              />
            </div>

            <div>
              <label className="block text-xs text-ni-muted mb-1">Institution / Exam Goal (Optional)</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. B.Tech CSE / SSC CGL Aspirant"
                className="ni-input"
              />
            </div>

            <div>
              <label className="block text-xs text-ni-muted mb-1">Password (min 8 characters) *</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ni-input"
              />
            </div>

            {error && <p className="text-xs text-white bg-ni-surface border border-white p-3">{error}</p>}

            <button type="submit" disabled={submitting} className="w-full ni-btn-primary">
              {submitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 pt-5 border-t border-ni-border text-xs text-ni-muted text-center">
            Already have an account?{' '}
            <Link to="/login" className="text-white underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
};
