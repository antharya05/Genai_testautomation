import { motion } from 'framer-motion';
import { Activity, CheckCircle2, Eye, EyeOff, LogOut, RefreshCw, Settings, Trash2, User, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteProviderKey, getProviderHealth, listProviderKeys, saveProviderKey } from '../../api/client';
import { PageTransition } from '../../components/layout/PageTransition';
import { useAuth } from '../../context/AuthContext';
import type { ProviderHealth } from '../../types';

// ─── Provider / model catalogue ───────────────────────────────────────────────

const PROVIDER_MODELS: Record<string, string[]> = {
  Anthropic: [
    'claude-opus-4-8',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ],
  OpenAI: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
  ],
  Gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro',
  ],
  Groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
    'gemma-7b-it',
  ],
  Ollama: [
    'llama3.2',
    'llama3.1',
    'mistral',
    'codellama',
    'phi3',
    'qwen2.5',
  ],
};


const PROVIDER_IDS: Record<string, string> = {
  Anthropic:  'anthropic',
  OpenAI:     'openai',
  Gemini:     'gemini',
  Groq:       'groq',
  Ollama:     'ollama',
};

const USE_ENDPOINT_PROVIDERS = new Set(['ollama']);

// Status → colour. Healthy = green, transient (rate/quota) = amber, hard fail = red.
function healthColor(status: string): string {
  if (status === 'healthy') return '#10b981';
  if (status === 'not_configured') return 'var(--c-text-3)';
  if (status === 'rate_limit' || status === 'quota_exhausted' || status === 'timeout') return '#f59e0b';
  return '#ef4444';
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', groq: 'Groq', ollama: 'Ollama',
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [selectedProvider, setSelectedProvider] = useState('Anthropic');
  const [selectedModel, setSelectedModel] = useState(PROVIDER_MODELS['Anthropic'][0]);

  const [keyValue, setKeyValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [savedEndpoint, setSavedEndpoint] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [checkingHealth, setCheckingHealth] = useState(false);

  useEffect(() => {
    loadKeyForProvider(selectedProvider);
  }, [selectedProvider]);

  async function loadHealth() {
    setCheckingHealth(true);
    try {
      setHealth(await getProviderHealth());
    } catch { /* ignore — backend may be offline */ }
    finally { setCheckingHealth(false); }
  }

  function handleProviderChange(provider: string) {
    setSelectedProvider(provider);
    setSelectedModel(PROVIDER_MODELS[provider]?.[0] ?? '');
    setKeyValue('');
    setShowKey(false);
  }

  async function loadKeyForProvider(provider: string) {
    try {
      const keys = await listProviderKeys();
      const id = PROVIDER_IDS[provider];
      const saved = keys.find(k => k.provider === id);
      setHasKey(saved?.has_key ?? false);
      setSavedEndpoint(saved?.endpoint ?? '');
    } catch { /* ignore */ }
  }

  async function handleSave() {
    if (!keyValue.trim()) return;
    setSaving(true);
    try {
      const id = PROVIDER_IDS[selectedProvider];
      const isEndpoint = USE_ENDPOINT_PROVIDERS.has(id);
      await saveProviderKey(
        id,
        isEndpoint ? undefined : keyValue.trim(),
        isEndpoint ? keyValue.trim() : undefined,
        selectedModel,
      );
      setKeyValue('');
      setHasKey(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await deleteProviderKey(PROVIDER_IDS[selectedProvider]);
      setHasKey(false);
      setSavedEndpoint('');
    } finally {
      setRemoving(false);
    }
  }

  function handleSignOut() {
    signOut();
    navigate('/signin', { replace: true });
  }

  const isEndpointProvider = USE_ENDPOINT_PROVIDERS.has(PROVIDER_IDS[selectedProvider]);
  const isConfigured = isEndpointProvider ? !!savedEndpoint : hasKey;

  return (
    <PageTransition>
      <div style={{ padding: '36px 40px', maxWidth: 680, margin: '0 auto' }}>
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

        {/* AI Configuration */}
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
              background: isConfigured ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
              border: `1px solid ${isConfigured ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isConfigured
                ? <Wifi size={17} color="#10b981" strokeWidth={1.75} />
                : <WifiOff size={17} color="var(--c-text-3)" strokeWidth={1.75} />
              }
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--c-text)' }}>AI Configuration</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: 1 }}>
                Keys are stored securely on the backend — never in the browser
              </div>
            </div>
          </div>

          <div style={{ padding: '20px' }}>
            {/* Provider + Model selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: 6 }}>
                  Provider
                </label>
                <select
                  value={selectedProvider}
                  onChange={e => handleProviderChange(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 9,
                    background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
                    color: 'var(--c-text)', fontSize: '0.875rem', fontFamily: 'var(--font)',
                    outline: 'none', cursor: 'pointer', appearance: 'auto',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-accent)'; }}
                  onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
                >
                  {Object.keys(PROVIDER_MODELS).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: 6 }}>
                  Model
                </label>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 9,
                    background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
                    color: 'var(--c-text)', fontSize: '0.875rem', fontFamily: 'var(--font)',
                    outline: 'none', cursor: 'pointer', appearance: 'auto',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-accent)'; }}
                  onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
                >
                  {(PROVIDER_MODELS[selectedProvider] ?? []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* API Key / Endpoint input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: 6 }}>
                {isEndpointProvider ? 'Endpoint URL' : 'API Key'}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type={showKey || isEndpointProvider ? 'text' : 'password'}
                    value={keyValue}
                    onChange={e => setKeyValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                    placeholder={
                      isEndpointProvider
                        ? (savedEndpoint || 'http://localhost:11434')
                        : (isConfigured ? '•'.repeat(20) : `Enter ${selectedProvider} API Key`)
                    }
                    style={{
                      width: '100%', padding: '8px 36px 8px 10px', borderRadius: 9, boxSizing: 'border-box',
                      background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
                      color: 'var(--c-text)', fontSize: '0.875rem', outline: 'none',
                      fontFamily: 'var(--font)', transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-accent)'; }}
                    onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
                  />
                  {!isEndpointProvider && (
                    <button
                      type="button"
                      onClick={() => setShowKey(v => !v)}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--c-text-3)', display: 'flex', padding: 2,
                      }}
                    >
                      {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || !keyValue.trim()}
                  style={{
                    padding: '8px 14px', borderRadius: 9, cursor: saving || !keyValue.trim() ? 'not-allowed' : 'pointer',
                    background: saving || !keyValue.trim() ? 'var(--c-bg-2)' : 'var(--c-accent)',
                    border: `1px solid ${saving || !keyValue.trim() ? 'var(--c-border)' : 'var(--c-accent)'}`,
                    color: saving || !keyValue.trim() ? 'var(--c-text-3)' : 'white',
                    fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {isConfigured && (
                  <button
                    onClick={handleRemove}
                    disabled={removing}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '8px 10px', borderRadius: 9, cursor: removing ? 'wait' : 'pointer',
                      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)',
                      color: '#f87171', fontFamily: 'var(--font)',
                      transition: 'all 0.15s ease', flexShrink: 0,
                    }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(239,68,68,0.12)'; el.style.borderColor = 'rgba(239,68,68,0.3)'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(239,68,68,0.06)'; el.style.borderColor = 'rgba(239,68,68,0.18)'; }}
                    title="Remove key"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Connection status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 9,
              background: isConfigured ? 'rgba(16,185,129,0.06)' : 'rgba(148,163,184,0.05)',
              border: `1px solid ${isConfigured ? 'rgba(16,185,129,0.18)' : 'rgba(148,163,184,0.12)'}`,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: isConfigured ? '#10b981' : 'var(--c-text-3)',
              }} />
              {isConfigured
                ? <CheckCircle2 size={13} color="#10b981" strokeWidth={2} style={{ flexShrink: 0 }} />
                : null
              }
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: isConfigured ? '#10b981' : 'var(--c-text-3)' }}>
                {isConfigured
                  ? `Connected — ${selectedProvider} configured`
                  : `Not configured — enter ${isEndpointProvider ? 'an endpoint' : 'an API key'} above`
                }
              </span>
              {isConfigured && isEndpointProvider && savedEndpoint && (
                <span style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  · {savedEndpoint}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Provider Health */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
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
              <Activity size={17} color="var(--c-accent)" strokeWidth={1.75} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--c-text)' }}>Provider Health</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: 1 }}>
                Live status, quota and latency for each configured provider
              </div>
            </div>
            <button
              onClick={loadHealth}
              disabled={checkingHealth}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, cursor: checkingHealth ? 'wait' : 'pointer',
                background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
                color: 'var(--c-text-2)', fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'var(--font)',
              }}
            >
              <RefreshCw size={13} style={{ opacity: checkingHealth ? 0.5 : 1 }} />
              {checkingHealth ? 'Checking…' : 'Check health'}
            </button>
          </div>

          <div style={{ padding: health.length ? '8px 20px 14px' : '18px 20px' }}>
            {health.length === 0 ? (
              <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-3)' }}>
                Run a health check to probe each provider's live status.
              </div>
            ) : (
              health.map(h => (
                <div
                  key={h.provider}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 0', borderBottom: '1px solid var(--c-border)',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: healthColor(h.status) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.8625rem', fontWeight: 600, color: 'var(--c-text)' }}>
                        {PROVIDER_LABELS[h.provider] ?? h.provider}
                      </span>
                      {h.active && (
                        <span style={{
                          fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em',
                          padding: '1px 6px', borderRadius: 4, color: 'var(--c-accent)',
                          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                        }}>ACTIVE</span>
                      )}
                    </div>
                    {h.last_error && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--c-text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.last_error}
                      </div>
                    )}
                  </div>
                  {h.latency_ms != null && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--c-text-3)', flexShrink: 0 }}>
                      {Math.round(h.latency_ms)}ms
                    </span>
                  )}
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: healthColor(h.status), flexShrink: 0, minWidth: 92, textAlign: 'right' }}>
                    {h.label}
                  </span>
                </div>
              ))
            )}
          </div>
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
