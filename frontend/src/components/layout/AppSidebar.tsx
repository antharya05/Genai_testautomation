import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Loader2,
  PlayCircle,
  Plus,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { createProject, getProjectStats, listProjects } from '../../api/client';
import type { Project } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#60a5fa', '#f472b6', '#a78bfa', '#4ade80', '#fb923c'];

function formatRelativeShort(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d`;
    return `${Math.floor(diff / 2_592_000_000)}mo`;
  } catch { return ''; }
}

// ─── New Project Inline Modal ─────────────────────────────────────────────────

function NewProjectModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Name required'); return; }
    setLoading(true);
    setError('');
    try {
      const p = await createProject(trimmed);
      onCreated(p);
      onClose();
      navigate('/app/projects');
    } catch {
      setError('Failed to create project');
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 16, padding: '22px 24px', width: '100%', maxWidth: 380,
          boxShadow: '0 20px 64px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--c-text)', marginBottom: 14 }}>
          New Project
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="Project name (e.g. AEB Validation)"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9, boxSizing: 'border-box',
              background: 'var(--c-bg-2)', border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'var(--c-border)'}`,
              color: 'var(--c-text)', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--font)',
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--c-accent)'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'var(--c-border)'; }}
          />
          {error && <span style={{ fontSize: '0.75rem', color: '#f87171' }}>{error}</span>}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <button
              type="button" onClick={onClose}
              style={{
                flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--c-border)',
                background: 'var(--c-bg-2)', color: 'var(--c-text-2)', cursor: 'pointer',
                fontSize: '0.8125rem', fontFamily: 'var(--font)',
              }}
            >Cancel</button>
            <button
              type="submit" disabled={loading}
              style={{
                flex: 2, padding: '8px', borderRadius: 8, border: 'none',
                background: loading ? 'rgba(99,102,241,0.5)' : 'var(--c-accent)',
                color: 'white', cursor: loading ? 'wait' : 'pointer',
                fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'var(--font)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              {loading
                ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                : <><Plus size={12} /> Create</>
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

interface Props {
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  isMobile?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AppSidebar({ collapsed, onCollapse, isMobile, mobileOpen, onCloseMobile }: Props) {
  const effectiveCollapsed = isMobile ? false : collapsed;
  const w = isMobile ? 240 : (collapsed ? 64 : 240);

  const [projects, setProjects] = useState<Project[]>([]);
  const [runCounts, setRunCounts] = useState<Record<string, number>>({});
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    listProjects().then(ps => {
      setProjects(ps);
      // Fetch run counts for all projects in parallel
      ps.forEach(p => {
        getProjectStats(p.id).then(stats => {
          setRunCounts(prev => ({ ...prev, [p.id]: stats.total_runs }));
        }).catch(() => {});
      });
    }).catch(() => {});
  }, []);

  function handleProjectCreated(p: Project) {
    setProjects(prev => [p, ...prev]);
    setRunCounts(prev => ({ ...prev, [p.id]: 0 }));
  }

  const sidebarStyle: React.CSSProperties = isMobile
    ? {
        width: 240,
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        background: 'var(--c-bg-2)', borderRight: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1)',
      }
    : {
        width: w, position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
        background: 'var(--c-bg-2)', borderRight: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
      };

  const nav = (
    <nav
      style={{
        flex: 1,
        overflowY: 'auto', overflowX: 'hidden',
        display: 'flex', flexDirection: 'column',
        scrollbarWidth: 'none',
      }}
    >
      {/* ── Main navigation ───────────────────────────────────── */}
      <div style={{ padding: '6px 6px 0' }}>
        <NavItem to="/app/dashboard" icon={LayoutDashboard} label="Dashboard" collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/generate"  icon={Sparkles}        label="Generate Tests" collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/review"    icon={ClipboardCheck}  label="Review"         collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/test-cases" icon={ListChecks}     label="Test Cases"     collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/validation" icon={CheckCircle2}   label="Validation"     collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/traceability" icon={GitBranch}    label="Traceability"   collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/runs"      icon={PlayCircle}      label="Runs"           collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
      </div>

      {/* ── Divider ───────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'var(--c-border)', margin: '8px 10px' }} />

      {/* ── Projects section ──────────────────────────────────── */}
      <div style={{ padding: '0 6px', flex: 1 }}>
        {/* Section header */}
        <AnimatePresence initial={false}>
          {!effectiveCollapsed ? (
            <motion.div
              key="projects-header"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 8px 6px',
              }}
            >
              <span style={{
                fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--c-text-3)',
              }}>
                Projects
                {projects.length > 0 && (
                  <span style={{
                    marginLeft: 5, fontSize: '0.6rem', fontWeight: 600,
                    padding: '1px 5px', borderRadius: 4,
                    background: 'var(--c-bg)', color: 'var(--c-text-3)',
                    border: '1px solid var(--c-border)',
                  }}>
                    {projects.length}
                  </span>
                )}
              </span>
              <button
                onClick={() => setShowNewProject(true)}
                title="New Project"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: 5,
                  background: 'transparent', border: '1px solid var(--c-border)',
                  cursor: 'pointer', color: 'var(--c-text-3)',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'var(--c-accent-dim)';
                  el.style.borderColor = 'var(--c-accent-glow)';
                  el.style.color = 'var(--c-accent)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'transparent';
                  el.style.borderColor = 'var(--c-border)';
                  el.style.color = 'var(--c-text-3)';
                }}
              >
                <Plus size={11} strokeWidth={2.5} />
              </button>
            </motion.div>
          ) : (
            /* Collapsed: just the + button */
            <motion.div
              key="projects-header-collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 6px' }}
            >
              <button
                onClick={() => setShowNewProject(true)}
                title="New Project"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 7,
                  background: 'transparent', border: '1px solid var(--c-border)',
                  cursor: 'pointer', color: 'var(--c-text-3)', transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'var(--c-accent-dim)';
                  el.style.borderColor = 'var(--c-accent-glow)';
                  el.style.color = 'var(--c-accent)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'transparent';
                  el.style.borderColor = 'var(--c-border)';
                  el.style.color = 'var(--c-text-3)';
                }}
              >
                <Plus size={12} strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Project list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {projects.length === 0 ? (
            !effectiveCollapsed && (
              <div
                style={{
                  padding: '10px 10px',
                  borderRadius: 8,
                  border: '1px dashed var(--c-border)',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setShowNewProject(true)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-accent-glow)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', lineHeight: 1.5 }}>
                  No projects yet
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--c-accent)', marginTop: 3, fontWeight: 500 }}>
                  + Create first project
                </div>
              </div>
            )
          ) : (
            projects.slice(0, 6).map((p, i) => (
              <ProjectRow
                key={p.id}
                project={p}
                color={PROJECT_COLORS[i % PROJECT_COLORS.length]}
                runCount={runCounts[p.id] ?? null}
                collapsed={effectiveCollapsed}
                onNavigate={isMobile ? onCloseMobile : undefined}
              />
            ))
          )}
        </div>

        {/* View all link */}
        {!effectiveCollapsed && projects.length > 0 && (
          <Link
            to="/app/projects"
            onClick={isMobile ? onCloseMobile : undefined}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px', borderRadius: 7, marginTop: 4,
              textDecoration: 'none', fontSize: '0.75rem', fontWeight: 500,
              color: 'var(--c-text-3)', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = 'var(--c-accent)';
              el.style.background = 'var(--c-accent-dim)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = 'var(--c-text-3)';
              el.style.background = 'transparent';
            }}
          >
            <span>View all projects</span>
            <ChevronRight size={11} />
          </Link>
        )}
      </div>
    </nav>
  );

  const SidebarContent = (
    <>
      {/* Logo */}
      <div style={{
        padding: '0 16px', borderBottom: '1px solid var(--c-border)',
        flexShrink: 0, height: 57, display: 'flex', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(99,102,241,0.4)',
          }}>
            <Zap size={15} color="white" fill="white" />
          </div>
          <AnimatePresence initial={false}>
            {!effectiveCollapsed && (
              <motion.div
                key="logo-text"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                  Automotive TC Gen
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--c-text-3)', letterSpacing: '0.08em', marginTop: 2, textTransform: 'uppercase' }}>
                  ISO 26262
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Scrollable nav + projects */}
      {nav}

      {/* Bottom: Settings + Collapse */}
      <div style={{ padding: '6px 6px 12px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
        <NavItem to="/app/settings" icon={Settings} label="Settings" collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        {!isMobile && (
          <button
            onClick={() => onCollapse(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              padding: collapsed ? '9px 0' : '8px 12px', marginTop: 4,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--c-text-3)', borderRadius: 8,
              fontSize: '0.75rem', fontWeight: 500, transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--c-accent-dim)'; el.style.color = 'var(--c-accent)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--c-text-3)'; }}
          >
            {!collapsed && <span>Collapse</span>}
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        )}
      </div>
    </>
  );

  const sidebar = isMobile ? (
    <div style={sidebarStyle}>{SidebarContent}</div>
  ) : (
    <motion.aside
      animate={{ width: w }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={sidebarStyle}
    >
      {SidebarContent}
    </motion.aside>
  );

  return (
    <>
      {sidebar}
      <AnimatePresence>
        {showNewProject && (
          <NewProjectModal
            onClose={() => setShowNewProject(false)}
            onCreated={handleProjectCreated}
          />
        )}
      </AnimatePresence>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ─── Project Row ──────────────────────────────────────────────────────────────

function ProjectRow({
  project, color, runCount, collapsed, onNavigate,
}: {
  project: Project;
  color: string;
  runCount: number | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const lastActive = formatRelativeShort(project.last_run_at ?? project.updated_at);

  if (collapsed) {
    return (
      <Link
        to="/app/projects"
        onClick={onNavigate}
        title={project.name}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '5px 0', borderRadius: 7, textDecoration: 'none',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--c-bg)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: color,
          flexShrink: 0, boxShadow: `0 0 5px ${color}60`,
        }} />
      </Link>
    );
  }

  return (
    <NavLink
      to="/app/projects"
      onClick={onNavigate}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '6px 10px', borderRadius: 8, textDecoration: 'none',
        transition: 'background 0.12s',
        background: isActive ? 'var(--c-accent-dim)' : 'transparent',
      })}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        if (!el.dataset.active) el.style.background = 'var(--c-bg)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        if (!el.dataset.active) el.style.background = 'transparent';
      }}
    >
      {/* Color dot */}
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        flexShrink: 0, boxShadow: `0 0 5px ${color}50`,
      }} />

      {/* Name */}
      <span style={{
        flex: 1, fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        minWidth: 0,
      }}>
        {project.name}
      </span>

      {/* Right: run count or last active */}
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        {runCount !== null ? (
          <span style={{
            fontSize: '0.65rem', fontWeight: 600,
            padding: '1px 5px', borderRadius: 4,
            background: 'var(--c-bg)', border: '1px solid var(--c-border)',
            color: 'var(--c-text-3)',
          }}>
            {runCount}
          </span>
        ) : lastActive ? (
          <span style={{ fontSize: '0.65rem', color: 'var(--c-text-3)' }}>
            {lastActive}
          </span>
        ) : null}
      </span>
    </NavLink>
  );
}

// ─── Nav Item ──────────────────────────────────────────────────────────────────

interface NavItemProps {
  to: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  collapsed: boolean;
  onNavigate?: () => void;
}

function NavItem({ to, icon: Icon, label, collapsed, onNavigate }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 10,
        padding: collapsed ? '9px 0' : '8px 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8, textDecoration: 'none',
        fontSize: '0.8125rem', fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden',
        transition: 'all 0.15s ease',
        background: isActive ? 'var(--c-accent-dim)' : 'transparent',
        color: isActive ? 'var(--c-accent)' : 'var(--c-text-2)',
        boxShadow: isActive && !collapsed ? 'inset 2px 0 0 var(--c-accent)' : 'none',
      })}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        if (!el.getAttribute('aria-current')) {
          el.style.background = 'var(--c-bg)';
          el.style.color = 'var(--c-text)';
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        if (!el.getAttribute('aria-current')) {
          el.style.background = '';
          el.style.color = '';
        }
      }}
    >
      <Icon size={16} strokeWidth={1.75} />
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            key="label"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </NavLink>
  );
}
