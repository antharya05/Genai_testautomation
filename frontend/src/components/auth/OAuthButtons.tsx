/** OAuth provider buttons — appear automatically for every configured provider.
 *  Rendered in a fixed brand order (Google → Microsoft → GitHub). */
import { useEffect, useState, type ReactNode } from 'react';
import { getAuthProviders, oauthStartUrl } from '../../api/client';

const PROVIDER_ORDER = ['google', 'microsoft', 'github'];

const LABEL: Record<string, string> = {
  google: 'Continue with Google',
  microsoft: 'Continue with Microsoft',
  github: 'Continue with GitHub',
};

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.5l6.5 5.5C41.4 36.2 44 30.6 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff" aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  google: <GoogleIcon />, microsoft: <MicrosoftIcon />, github: <GitHubIcon />,
};

export default function OAuthButtons() {
  const [providers, setProviders] = useState<string[] | null>(null);

  useEffect(() => {
    getAuthProviders().then(p => setProviders(p.oauth)).catch(() => setProviders([]));
  }, []);

  if (providers === null || providers.length === 0) return null;

  const ordered = [
    ...PROVIDER_ORDER.filter(p => providers.includes(p)),
    ...providers.filter(p => !PROVIDER_ORDER.includes(p)),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ordered.map(p => (
        <a key={p} href={oauthStartUrl(p)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '11px 14px', borderRadius: 10, textDecoration: 'none',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.92)', fontSize: '0.875rem', fontWeight: 600,
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
          }}
        >
          <span style={{ display: 'inline-flex' }}>{ICONS[p]}</span>
          {LABEL[p] ?? `Continue with ${p}`}
        </a>
      ))}
    </div>
  );
}
