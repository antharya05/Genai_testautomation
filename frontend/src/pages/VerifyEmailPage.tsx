import { Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resendVerification, verifyEmail } from '../api/client';
import {
  apiError, AuthShell, Field, FormError, FormSuccess, SubmitButton, SuccessCheck, TextLink,
} from '../components/auth/ui';

type Status = 'verifying' | 'success' | 'error' | 'idle';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'idle');
  const [error, setError] = useState('');
  const ran = useRef(false);

  // Resend form (shown when there's no token / verification failed).
  const [email, setEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await verifyEmail(token);
        setStatus('success');
      } catch (err) {
        setError(apiError(err, 'This verification link is invalid or has expired.'));
        setStatus('error');
      }
    })();
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { setError('Enter a valid email address.'); return; }
    setError(''); setResendLoading(true);
    try {
      const r = await resendVerification(email.trim());
      setDevLink(r.verify_url ?? null);
      setResent(true);
    } catch (err) {
      setError(apiError(err, 'Could not send the verification email.'));
    } finally {
      setResendLoading(false);
    }
  }

  if (status === 'verifying') {
    return (
      <AuthShell title="Verifying your email" subtitle="Hang tight, this only takes a moment…">
        <SubmitButton loading disabled>Verifying…</SubmitButton>
      </AuthShell>
    );
  }

  if (status === 'success') {
    return (
      <AuthShell
        title="Email verified"
        subtitle="Your email address has been confirmed."
        footer={<TextLink to="/app/dashboard">Go to dashboard</TextLink>}
      >
        <SuccessCheck />
        <FormSuccess message="You're all set. You can now access every feature of your workspace." />
      </AuthShell>
    );
  }

  // idle (no token) or error → offer to (re)send a link
  return (
    <AuthShell
      title={status === 'error' ? 'Verification failed' : 'Verify your email'}
      subtitle={status === 'error'
        ? 'That link didn’t work. Request a fresh verification email below.'
        : 'Enter your email to receive a new verification link.'}
      footer={<TextLink to="/signin">Back to sign in</TextLink>}
    >
      {status === 'error' && error && <div style={{ marginBottom: 16 }}><FormError message={error} /></div>}

      {resent ? (
        <>
          <SuccessCheck />
          <FormSuccess message={`If an account exists for ${email}, a new verification link is on its way.`} />
          {devLink && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)' }}>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                Development mode — use this link:
              </div>
              <a href={devLink} style={{ fontSize: '0.78rem', color: 'rgba(129,140,248,1)', wordBreak: 'break-all' }}>{devLink}</a>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field
            label="Email" icon={Mail} type="email" autoComplete="email"
            placeholder="you@company.com" value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
          />
          {status !== 'error' && error && <FormError message={error} />}
          <SubmitButton loading={resendLoading}>{resendLoading ? 'Sending…' : 'Send verification link'}</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
