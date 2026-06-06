import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronDown, LogOut, Menu, Moon, Sun, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveProvider } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useProject } from '../../context/ProjectContext';
import { useTheme } from '../../hooks/useTheme';
import { formatModelName } from '../../utils/format';
import type { ActiveProvider } from '../../types';

function formatRelative(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch { return ''; }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  sidebarWidth: number;
  isMobile?: boolean;
  onMobileMenuOpen?: () => void;
}

export function AppTopBar({ sidebarWidth, isMobile, onMobileMenuOpen }: Props) {
  const { isDark, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { projects, selectedProject, setSelectedProject } = useProject();
  const navigate = useNavigate();

  const [activeProvider, setActiveProvider] = useState<ActiveProvider | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveProvider().then(p => { if (!cancelled) setActiveProvider(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!showUserMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUserMenu]);

  useEffect(() => {
    if (!showProjectMenu) return;
    function handleClick(e: MouseEvent) {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setShowProjectMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProjectMenu]);

  function handleSignOut() {
    setShowUserMenu(false);
    signOut();
    navigate('/signin', { replace: true });
  }

  const relative = formatRelative(selectedProject?.last_run_at ?? undefined);
  const userInitials = user ? initials(user.name) : 'U';

  return (
    <motion.header
      animate={{ left: sidebarWidth }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed', top: 0, right: 0, left: sidebarWidth, height: 56,
        background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        gap: 10, zIndex: 30,
      }}
    >
      {/* Hamburger (mobile only) */}
      {isMobile && (
        <button
          onClick={onMobileMenuOpen}
          title="Open navigation"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            cursor: 'pointer', color: 'var(--c-text-2)',
          }}
        >
          <Menu size={17} />
        </button>
      )}

      {/* Project context dropdown */}
      <div ref={projectMenuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => projects.length > 1 && setShowProjectMenu(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 12px', borderRadius: 8,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            color: 'var(--c-text)', fontSize: '0.8125rem', fontWeight: 500,
            cursor: projects.length > 1 ? 'pointer' : 'default', fontFamily: 'var(--font)',
            transition: 'border-color 0.15s ease',
            maxWidth: isMobile ? 'calc(100vw - 180px)' : undefined,
            overflow: 'hidden',
          }}
          onMouseEnter={e => { if (projects.length > 1) (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedProject?.name ?? 'No Project'}
          </span>
          {!isMobile && relative && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-3)', fontWeight: 400, flexShrink: 0 }}>
              &nbsp;·&nbsp;{relative}
            </span>
          )}
          {projects.length > 1 && (
            <ChevronDown size={13} style={{ color: 'var(--c-text-3)', marginLeft: 2, flexShrink: 0 }} />
          )}
        </button>

        <AnimatePresence>
          {showProjectMenu && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 10, zIndex: 200, minWidth: 220,
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)', maxHeight: 320, overflowY: 'auto',
              }}
            >
              <div style={{ padding: '6px 12px 4px', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--c-text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Switch Project
              </div>
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProject(p); setShowProjectMenu(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--c-border)',
                    background: p.id === selectedProject?.id ? 'var(--c-accent-dim)' : 'transparent',
                    color: p.id === selectedProject?.id ? 'var(--c-accent)' : 'var(--c-text-2)',
                    cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                    fontSize: '0.8125rem', fontWeight: 500, transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (p.id !== selectedProject?.id) (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-2)'; }}
                  onMouseLeave={e => { if (p.id !== selectedProject?.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: p.id === selectedProject?.id ? 'var(--c-accent)' : 'var(--c-text-3)' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ flex: 1 }} />

      {/* Active model indicator */}
      {activeProvider?.model && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 6,
          background: activeProvider.has_key ? 'rgba(16,185,129,0.06)' : 'var(--c-surface)',
          border: `1px solid ${activeProvider.has_key ? 'rgba(16,185,129,0.2)' : 'var(--c-border)'}`,
          flexShrink: 0,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: activeProvider.has_key ? '#10b981' : 'var(--c-text-3)',
          }} />
          <span style={{
            fontSize: '0.75rem', fontWeight: 500,
            color: activeProvider.has_key ? '#10b981' : 'var(--c-text-3)',
            whiteSpace: 'nowrap',
          }}>
            {formatModelName(activeProvider.model)}
          </span>
        </div>
      )}

      {/* Notifications */}
      <button className="btn-icon" title="Notifications" style={{ position: 'relative' }}>
        <Bell size={16} />
        <span style={{
          position: 'absolute', top: 3, right: 3,
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--c-accent)', border: '1.5px solid var(--c-bg)',
        }} />
      </button>

      {/* Theme toggle */}
      <motion.button
        className="btn-icon" onClick={toggle}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        whileTap={{ scale: 0.9 }}
      >
        <motion.div
          key={isDark ? 'sun' : 'moon'}
          initial={{ rotate: -30, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </motion.div>
      </motion.button>

      {/* User avatar + dropdown */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <motion.button
          onClick={() => setShowUserMenu(v => !v)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={user?.email ?? 'User menu'}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700, color: 'white',
            cursor: 'pointer', border: 'none',
            boxShadow: showUserMenu
              ? '0 0 0 2px var(--c-bg), 0 0 0 3px rgba(99,102,241,0.6)'
              : '0 0 0 2px var(--c-bg), 0 0 0 3px rgba(99,102,241,0.3)',
            transition: 'box-shadow 0.15s ease',
          }}
        >
          {userInitials}
        </motion.button>

        <AnimatePresence>
          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 12, minWidth: 220, zIndex: 200,
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                overflow: 'hidden',
              }}
            >
              {/* User info */}
              <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--c-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8125rem', fontWeight: 700, color: 'white',
                  }}>
                    {userInitials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.email}
                    </div>
                  </div>
                </div>
                {user?.isDemo && (
                  <div style={{
                    marginTop: 8, padding: '4px 8px', borderRadius: 5,
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                    fontSize: '0.6875rem', color: '#fbbf24', fontWeight: 600, letterSpacing: '0.02em',
                    display: 'inline-block',
                  }}>
                    DEMO SESSION
                  </div>
                )}
              </div>

              {/* Menu items */}
              <div style={{ padding: '6px' }}>
                <button
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 10px', borderRadius: 7, border: 'none',
                    background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)',
                    color: 'var(--c-text-2)', fontSize: '0.8125rem', fontWeight: 500,
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <User size={14} color="var(--c-text-3)" />
                  Profile & Settings
                </button>

                <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />

                <button
                  onClick={handleSignOut}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 10px', borderRadius: 7, border: 'none',
                    background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)',
                    color: '#f87171', fontSize: '0.8125rem', fontWeight: 500,
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}
