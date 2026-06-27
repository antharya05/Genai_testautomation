/**
 * Shared building blocks for the authentication experience.
 *
 * A small, self-contained design system (dark glass, indigo accent) used by every
 * auth page so Sign In / Create Account / Forgot / Reset / Verify feel like one
 * polished product. Inline-styled to match the rest of the app's auth pages.
 */
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, Loader2, type LucideIcon } from 'lucide-react';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const ACCENT = 'rgba(99,102,241,1)';

// ─── Page shell ───────────────────────────────────────────────────────────────

export function AuthShell({
  title, subtitle, children, footer, badge,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div style={{
      minHeight: '100vh', background: '#09090B',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font)', position: 'relative', overflow: 'hidden',
      padding: '40px 0',
    }}>
      {/* Grid backdrop */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.018, pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      {/* Ambient glows */}
      <motion.div
        animate={{ scale: [1, 1.16, 1], opacity: [0.14, 0.26, 0.14] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: '12%', right: '14%', width: 520, height: 520,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.16) 0%, transparent 70%)',
          filter: 'blur(80px)', pointerEvents: 'none',
        }}
      />
      <motion.div
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        style={{
          position: 'absolute', bottom: '16%', left: '10%', width: 440, height: 440,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.13) 0%, transparent 70%)',
          filter: 'blur(70px)', pointerEvents: 'none',
        }}
      />

      {/* Back to home */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        style={{ position: 'absolute', top: 28, left: 28, zIndex: 20 }}
      >
        <Link to="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: 'rgba(255,255,255,0.35)', textDecoration: 'none',
          fontSize: '0.875rem', transition: 'color 0.2s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; }}
        >
          <ArrowLeft size={15} /> Back to Home
        </Link>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 420, padding: '0 24px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}
          >
            <img src="/logo-removebg-preview.png" alt="GuJ Tech"
              style={{ height: 50, width: 'auto', objectFit: 'contain', display: 'block' }} />
          </motion.div>
          {badge}
          <h1 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em', margin: '0 0 6px' }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
              {subtitle}
            </p>
          )}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.035)',
          backdropFilter: 'blur(48px) saturate(180%)',
          WebkitBackdropFilter: 'blur(48px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: 28,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
          {children}
        </div>

        {footer && (
          <div style={{ textAlign: 'center', marginTop: 22, fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)' }}>
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
      <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
    </div>
  );
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

const inputBase: CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10, boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', outline: 'none',
  fontFamily: 'var(--font)', transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
};

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={{
      display: 'block', fontSize: '0.8125rem', fontWeight: 500,
      color: 'rgba(255,255,255,0.55)', marginBottom: 7,
    }}>{children}</label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: '0.78rem', color: '#fca5a5' }}
    >
      <AlertCircle size={12} /> {message}
    </motion.div>
  );
}

export function Field({
  label, icon: Icon, error, type = 'text', ...rest
}: {
  label: string;
  icon?: LucideIcon;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <Icon size={14} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
          }} />
        )}
        <input
          id={id} type={type}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            ...inputBase, paddingLeft: Icon ? 36 : 12,
            borderColor: error ? 'rgba(239,68,68,0.5)' : focused ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)',
            boxShadow: focused && !error ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
          }}
          {...rest}
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}

export function PasswordField({
  label, error, showStrength, value, ...rest
}: {
  label: string;
  error?: string;
  showStrength?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', display: 'inline-flex' }}>
          {/* lock glyph */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </span>
        <input
          id={id} type={show ? 'text' : 'password'} value={value}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            ...inputBase, paddingLeft: 36, paddingRight: 40,
            borderColor: error ? 'rgba(239,68,68,0.5)' : focused ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)',
            boxShadow: focused && !error ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
          }}
          {...rest}
        />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.3)', display: 'flex', padding: 2,
          }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {showStrength && <StrengthMeter password={String(value ?? '')} />}
      <FieldError message={error} />
    </div>
  );
}

// ─── Password strength ──────────────────────────────────────────────────────────

export function passwordScore(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  score = Math.min(score, 4);
  const meta = [
    { label: 'Too short', color: '#ef4444' },
    { label: 'Weak', color: '#f59e0b' },
    { label: 'Fair', color: '#eab308' },
    { label: 'Good', color: '#84cc16' },
    { label: 'Strong', color: '#22c55e' },
  ][score];
  return { score, ...meta };
}

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = passwordScore(password);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < score ? color : 'rgba(255,255,255,0.1)',
            transition: 'background 0.25s ease',
          }} />
        ))}
      </div>
      <div style={{ marginTop: 5, fontSize: '0.72rem', color }}>{label}</div>
    </div>
  );
}

// ─── Buttons / banners ──────────────────────────────────────────────────────────

export function SubmitButton({
  loading, children, disabled, ...rest
}: {
  loading?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const isDisabled = loading || disabled;
  return (
    <motion.button
      type="submit" disabled={isDisabled}
      whileHover={!isDisabled ? { scale: 1.01 } : {}}
      whileTap={!isDisabled ? { scale: 0.99 } : {}}
      style={{
        width: '100%', padding: '12px', borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: isDisabled ? 'rgba(99,102,241,0.3)' : `linear-gradient(180deg, ${ACCENT} 0%, rgba(79,70,229,1) 100%)`,
        border: '1px solid rgba(99,102,241,0.5)',
        cursor: isDisabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        color: isDisabled ? 'rgba(255,255,255,0.55)' : 'white',
        fontSize: '0.9375rem', fontWeight: 600, fontFamily: 'var(--font)',
        marginTop: 4, transition: 'background 0.2s',
        boxShadow: isDisabled ? 'none' : '0 8px 24px rgba(79,70,229,0.35)',
      }}
      {...(rest as React.ComponentProps<typeof motion.button>)}
    >
      {loading && (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          style={{ display: 'inline-flex' }}
        >
          <Loader2 size={16} />
        </motion.span>
      )}
      {children}
    </motion.button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 8, marginBottom: 2,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
        fontSize: '0.8125rem', color: '#fca5a5',
      }}
    >
      <AlertCircle size={14} style={{ flexShrink: 0 }} /> {message}
    </motion.div>
  );
}

export function FormSuccess({ message }: { message: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '11px 12px', borderRadius: 8,
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
        fontSize: '0.8125rem', color: '#86efac', lineHeight: 1.5,
      }}
    >
      <Check size={14} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{message}</span>
    </motion.div>
  );
}

export function SuccessCheck() {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      style={{
        width: 64, height: 64, borderRadius: '50%', margin: '0 auto 6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)',
      }}
    >
      <Check size={30} color="#22c55e" strokeWidth={3} />
    </motion.div>
  );
}

/** Pull a human message out of an axios error (FastAPI `detail`), else fallback. */
export function apiError(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return fallback;
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} style={{ color: ACCENT, textDecoration: 'none', fontWeight: 600 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
    >{children}</Link>
  );
}
