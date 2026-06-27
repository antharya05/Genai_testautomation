import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import OAuthButtons from '../components/auth/OAuthButtons';
import {
  apiError, AuthShell, Divider, Field, FormError, PasswordField, SubmitButton, TextLink,
} from '../components/auth/ui';
import { useAuth } from '../context/AuthContext';

export default function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/app/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Password is required.'); return; }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiError(err, 'Invalid email or password.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace"
      footer={<>Don&apos;t have an account? <TextLink to="/signup">Create account</TextLink></>}
    >
      <OAuthButtons />
      <Divider label="or" />

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field
          label="Email" icon={Mail} type="email" autoComplete="email"
          placeholder="you@company.com" value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
        />

        <div>
          <PasswordField
            label="Password" autoComplete="current-password" placeholder="••••••••"
            value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
          />
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <TextLink to="/forgot-password"><span style={{ fontSize: '0.78rem' }}>Forgot password?</span></TextLink>
          </div>
        </div>

        {error && <FormError message={error} />}

        <SubmitButton loading={loading}>{loading ? 'Signing in…' : 'Sign In'}</SubmitButton>
      </form>
    </AuthShell>
  );
}
