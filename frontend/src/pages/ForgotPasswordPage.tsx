import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi, extractErrorMessage } from '../lib/api';
import { Layout } from '../components/layout/Layout';

export const ForgotPasswordPage: React.FC = () => {
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setInfo(res.message);
      if (res.resetTokenPreview) {
        setToken(res.resetTokenPreview);
      }
      setStep('reset');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token.trim(), newPassword);
      setStep('done');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-ni-black border border-ni-border p-8">
          <h1 className="text-xl font-bold text-white mb-2">Password Recovery</h1>

          {step === 'request' && (
            <form onSubmit={handleRequestToken} className="space-y-4">
              <p className="text-xs text-ni-muted">
                Enter your registered email address to generate a secure password recovery token.
              </p>
              <div>
                <label className="block text-xs text-ni-muted mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ni-input"
                />
              </div>
              {error && <p className="text-xs text-white bg-ni-surface border border-white p-3">{error}</p>}
              <button type="submit" disabled={submitting} className="w-full ni-btn-primary">
                {submitting ? 'Generating...' : 'Send Recovery Token'}
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              {info && <p className="text-xs text-ni-muted bg-ni-surface border border-ni-border p-3">{info}</p>}
              <div>
                <label className="block text-xs text-ni-muted mb-1">Recovery Token</label>
                <input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="ni-input font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-ni-muted mb-1">New Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="ni-input"
                />
              </div>
              {error && <p className="text-xs text-white bg-ni-surface border border-white p-3">{error}</p>}
              <button type="submit" disabled={submitting} className="w-full ni-btn-primary">
                {submitting ? 'Updating...' : 'Reset Password'}
              </button>
            </form>
          )}

          {step === 'done' && (
            <div className="space-y-4">
              <p className="text-sm text-white">
                Your password has been updated successfully. You can now log in with your new password.
              </p>
              <Link to="/login" className="w-full ni-btn-primary">
                Proceed to Login
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
