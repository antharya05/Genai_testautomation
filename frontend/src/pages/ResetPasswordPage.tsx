import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/client';
import {
  apiError, AuthShell, FormError, PasswordField, SubmitButton, SuccessCheck, TextLink,
} from '../components/auth/ui';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { adoptSession } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setConfirmError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Password must contain at least one letter and one number.'); return;
    }
    if (password !== confirm) { setConfirmError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const r = await resetPassword(token, password);
      setDone(true);
      // The backend signs us in (returns a session token); adopt it, then go in.
      if (r.token) {
        await adoptSession().catch(() => {});
        setTimeout(() => navigate('/app/dashboard', { replace: true }), 1100);
      } else {
        setTimeout(() => navigate('/signin', { replace: true }), 1100);
      }
    } catch (err) {
      setError(apiError(err, 'This reset link is invalid or has expired.'));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Invalid reset link" subtitle="This password reset link is missing or malformed."
        footer={<TextLink to="/forgot-password">Request a new link</TextLink>}>
        <FormError message="Please request a new password reset link to continue." />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Signing you in…">
        <SuccessCheck />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password you don't use elsewhere."
      footer={<TextLink to="/signin">Back to sign in</TextLink>}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PasswordField
          label="New password" autoComplete="new-password" placeholder="At least 8 characters"
          showStrength value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
        />
        <PasswordField
          label="Confirm new password" autoComplete="new-password" placeholder="Re-enter your password"
          value={confirm} error={confirmError}
          onChange={e => { setConfirm(e.target.value); setConfirmError(''); }}
        />
        {error && <FormError message={error} />}
        <SubmitButton loading={loading}>{loading ? 'Updating…' : 'Update password'}</SubmitButton>
      </form>
    </AuthShell>
  );
}
