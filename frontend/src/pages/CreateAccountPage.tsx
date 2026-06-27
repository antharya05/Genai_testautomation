import { Mail, User as UserIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OAuthButtons from '../components/auth/OAuthButtons';
import {
  apiError, AuthShell, Divider, Field, FormError, PasswordField, SubmitButton, TextLink,
} from '../components/auth/ui';
import { useAuth } from '../context/AuthContext';

export default function CreateAccountPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ confirm?: string }>({});
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!name.trim()) return 'Please enter your full name.';
    if (!email.includes('@')) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return 'Password must contain at least one letter and one number.';
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setFieldErrors({});
    const msg = validate();
    if (msg) { setError(msg); return; }
    if (password !== confirm) { setFieldErrors({ confirm: 'Passwords do not match.' }); return; }

    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Could not create your account. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start generating traceable test cases in minutes"
      footer={<>Already have an account? <TextLink to="/signin">Sign in</TextLink></>}
    >
      <OAuthButtons />
      <Divider label="or" />

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field
          label="Full name" icon={UserIcon} autoComplete="name"
          placeholder="Jane Doe" value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
        />
        <Field
          label="Email" icon={Mail} type="email" autoComplete="email"
          placeholder="you@company.com" value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
        />
        <PasswordField
          label="Password" autoComplete="new-password" placeholder="At least 8 characters"
          showStrength value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
        />
        <PasswordField
          label="Confirm password" autoComplete="new-password" placeholder="Re-enter your password"
          value={confirm} error={fieldErrors.confirm}
          onChange={e => { setConfirm(e.target.value); setFieldErrors({}); }}
        />

        {error && <FormError message={error} />}

        <SubmitButton loading={loading}>{loading ? 'Creating account…' : 'Create account'}</SubmitButton>
      </form>

      <p style={{ marginTop: 16, fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.5 }}>
        By creating an account you agree to our Terms of Service and Privacy Policy.
      </p>
    </AuthShell>
  );
}
