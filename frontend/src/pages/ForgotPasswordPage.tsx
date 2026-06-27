import { Mail } from 'lucide-react';
import { useState } from 'react';
import {
  apiError, AuthShell, Field, FormError, FormSuccess, SubmitButton, SuccessCheck, TextLink,
} from '../components/auth/ui';
import { forgotPassword } from '../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // In local dev the backend returns the reset link directly (no email service).
  const [devLink, setDevLink] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) { setError('Enter a valid email address.'); return; }
    setLoading(true);
    try {
      const r = await forgotPassword(email.trim());
      setDevLink(r.reset_url ?? null);
      setSent(true);
    } catch (err) {
      setError(apiError(err, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`If an account exists for ${email}, we've sent a link to reset your password.`}
        footer={<><TextLink to="/signin">Back to sign in</TextLink></>}
      >
        <SuccessCheck />
        <FormSuccess message="The reset link is valid for 1 hour. Didn't get it? Check your spam folder or try again." />
        {devLink && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)' }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
              Development mode — no email service configured. Use this link:
            </div>
            <a href={devLink} style={{ fontSize: '0.78rem', color: 'rgba(129,140,248,1)', wordBreak: 'break-all' }}>{devLink}</a>
          </div>
        )}
        <button
          onClick={() => { setSent(false); setDevLink(null); }}
          style={{
            marginTop: 16, width: '100%', padding: '11px', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font)',
          }}
        >
          Use a different email
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to reset it."
      footer={<>Remembered it? <TextLink to="/signin">Sign in</TextLink></>}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field
          label="Email" icon={Mail} type="email" autoComplete="email"
          placeholder="you@company.com" value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
        />
        {error && <FormError message={error} />}
        <SubmitButton loading={loading}>{loading ? 'Sending…' : 'Send reset link'}</SubmitButton>
      </form>
    </AuthShell>
  );
}
