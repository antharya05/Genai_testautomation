import { motion } from 'framer-motion';
import { Eye, EyeOff, Key, LogOut, Palette, Settings, Trash2, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteProviderKey, listProviderKeys, saveProviderKey } from '../../api/client';
import { PageTransition } from '../../components/layout/PageTransition';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import type { ProviderConfig } from '../../types';

// ─── Provider catalogue ───────────────────────────────────────────────────────

const PROVIDERS: { id: string; label: string; keyLabel: string; useEndpoint?: boolean; color: string }[] = [
  { id: 'anthropic',   label: 'Anthropic',   keyLabel: 'API Key',        color: '#818cf8' },
  { id: 'openai',      label: 'OpenAI',      keyLabel: 'API Key',        color: '#34d399' },
  { id: 'gemini',      label: 'Gemini',      keyLabel: 'API Key',        color: '#60a5fa' },
  { id: 'groq',        label: 'Groq',        keyLabel: 'API Key',        color: '#f59e0b' },
  { id: 'openrouter',  label: 'OpenRouter',  keyLabel: 'API Key',        color: '#f472b6' },
  { id: 'ollama',      label: 'Ollama',      keyLabel: 'Endpoint URL',   useEndpoint: true, color: '#a78bfa' },
];

// ─── Provider row ─────────────────────────────────────────────────────────────

function ProviderRow({
  def,
  saved,
  onSaved,
}: {
  def: typeof PROVIDERS[number];
  saved: ProviderConfig | undefined;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await saveProviderKey(
        def.id,
        def.useEndpoint ? undefined : value.trim(),
        def.useEndpoint ? value.trim() : undefined,
      );
      setValue('');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteProviderKey(def.id);
      onSaved();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{
      padding: '16px 20px',
      borderBottom: '1px solid var(--c-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: saved?.has_key || saved?.endpoint ? 10 : 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: def.color + '18', border: `1px solid ${def.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Key size={14} color={def.color} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--c-text)' }}>{def.label}</span>
            {(saved?.has_key || saved?.endpoint) && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, letterSpacing: '0.04em',
                background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399',
              }}>
                CONFIGURED
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: 1 }}>
            {def.useEndpoint ? (saved?.endpoint ? `Endpoint: ${saved.endpoint}` : 'No endpoint configured') : (saved?.has_key ? '••••••••••••••••••••' : 'No key saved')}
          </div>
        </div>
        {(saved?.has_key || saved?.endpoint) && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 7, cursor: deleting ? 'wait' : 'pointer',
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)',
              color: '#f87171', fontSize: '0.75rem', fontWeight: 500, fontFamily: 'var(--font)',
              transition: 'all 0.15s ease', flexShrink: 0,
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(239,68,68,0.12)'; el.style.borderColor = 'rgba(239,68,68,0.3)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(239,68,68,0.06)'; el.style.borderColor = 'rgba(239,68,68,0.18)'; }}
          >
            <Trash2 size={12} />
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>

      {/* Key / endpoint input */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type={show || def.useEndpoint ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder={def.useEndpoint ? 'http://localhost:11434' : `Enter ${def.label} ${def.keyLabel}`}
            style={{
              width: '100%', padding: '8px 36px 8px 10px', borderRadius: 8, boxSizing: 'border-box',
              background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
              color: 'var(--c-text)', fontSize: '0.8125rem', outline: 'none',
              fontFamily: 'var(--font)', transition: 'border-color 0.15s',
            }}
            onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-accent)'; }}
            onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
          />
          {!def.useEndpoint && (
            <button
              type="button"
              onClick={() => setShow(v => !v)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--c-text-3)', display: 'flex', padding: 2,
              }}
            >
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          style={{
            padding: '8px 14px', borderRadius: 8, cursor: saving || !value.trim() ? 'not-allowed' : 'pointer',
            background: saving || !value.trim() ? 'var(--c-bg-2)' : 'var(--c-accent)',
            border: `1px solid ${saving || !value.trim() ? 'var(--c-border)' : 'var(--c-accent)'}`,
            color: saving || !value.trim() ? 'var(--c-text-3)' : 'white',
            fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { isDark, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [providerKeys, setProviderKeys] = useState<ProviderConfig[]>([]);

  useEffect(() => {
    listProviderKeys().then(setProviderKeys).catch(() => {});
  }, []);

  function refreshKeys() {
    listProviderKeys().then(setProviderKeys).catch(() => {});
  }

  function handleSignOut() {
    signOut();
    navigate('/signin', { replace: true });
  }

  function savedKey(id: string) {
    return providerKeys.find(k => k.provider === id);
  }

  return (
    <PageTransition>
      <div style={{ padding: '36px 40px', maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Settings size={17} color="var(--c-text-2)" strokeWidth={1.75} />
          </div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', margin: 0 }}>
            Settings
          </h1>
        </div>
        <p style={{ color: 'var(--c-text-2)', fontSize: '0.875rem', margin: '0 0 32px' }}>
          Workspace preferences and account
        </p>

        {/* Appearance */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, padding: '20px 24px', marginBottom: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Palette size={17} color="#a855f7" strokeWidth={1.75} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--c-text)', marginBottom: 2 }}>
                Appearance
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-3)' }}>
                Currently: {isDark ? 'Dark mode' : 'Light mode'}
              </div>
            </div>
          </div>
          <button
            onClick={toggle}
            style={{
              padding: '7px 18px', borderRadius: 8, border: '1px solid var(--c-border)',
              background: 'var(--c-bg-2)', color: 'var(--c-text-2)', cursor: 'pointer',
              fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'var(--font)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--c-accent)'; el.style.color = 'var(--c-accent)'; el.style.background = 'var(--c-accent-dim)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--c-border)'; el.style.color = 'var(--c-text-2)'; el.style.background = 'var(--c-bg-2)'; }}
          >
            Toggle Theme
          </button>
        </motion.div>

        {/* AI Providers */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, overflow: 'hidden', marginBottom: 12,
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Key size={17} color="var(--c-accent)" strokeWidth={1.75} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--c-text)' }}>AI Providers</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: 1 }}>
                Keys are stored securely on the backend — never in the browser
              </div>
            </div>
          </div>
          {PROVIDERS.map(def => (
            <ProviderRow key={def.id} def={def} saved={savedKey(def.id)} onSaved={refreshKeys} />
          ))}
        </motion.div>

        {/* Account */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={17} color="var(--c-accent)" strokeWidth={1.75} />
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--c-text)' }}>Account</div>
          </div>

          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--c-text)', marginBottom: 3 }}>
                {user?.name ?? '—'}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-3)' }}>
                {user?.email ?? '—'}
              </div>
              {user?.isDemo && (
                <div style={{
                  display: 'inline-block', marginTop: 6, padding: '2px 8px', borderRadius: 5,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                  fontSize: '0.6875rem', color: '#fbbf24', fontWeight: 600, letterSpacing: '0.02em',
                }}>
                  DEMO SESSION
                </div>
              )}
            </div>
            <button
              onClick={handleSignOut}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)',
                color: '#f87171', fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'var(--font)',
                transition: 'all 0.15s ease', flexShrink: 0,
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(239,68,68,0.12)'; el.style.borderColor = 'rgba(239,68,68,0.3)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(239,68,68,0.06)'; el.style.borderColor = 'rgba(239,68,68,0.18)'; }}
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
