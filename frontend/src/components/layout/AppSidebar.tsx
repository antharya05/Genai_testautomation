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
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { createProject, getProjectStats, listProjects } from '../../api/client';
import type { Project } from '../../types';

// ─── Sidebar design tokens (navy, isolated from global CSS vars) ──────────────

const SB = {
  bg:          '#0B1120',              // deep navy background
  bgHeader:    'rgba(0,0,0,0.28)',     // slightly darker header/footer strip
  border:      'rgba(255,255,255,0.08)',
  text:        '#E2E8F0',              // primary text
  textMuted:   '#718096',             // inactive nav items
  textDim:     '#3D4F6B',             // section labels, very dim elements
  hover:       'rgba(255,255,255,0.05)',
  activeBg:    'rgba(129,140,248,0.14)', // active item fill
  activeText:  '#FAFAFA',             // active item text
  activeAccent:'#818CF8',             // active icon + left border colour
  divider:     'rgba(255,255,255,0.07)',
  badgeBg:     'rgba(255,255,255,0.06)',
  badgeBorder: 'rgba(255,255,255,0.10)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#60a5fa', '#f472b6', '#a78bfa', '#4ade80', '#fb923c'];

function formatRelativeShort(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d`;
    return `${Math.floor(diff / 2_592_000_000)}mo`;
  } catch { return ''; }
}

// ─── New Project Modal ────────────────────────────────────────────────────────

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
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 14, padding: '22px 24px', width: '100%', maxWidth: 380,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
          New Project
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginBottom: 16 }}>
          Create a project to organise your requirements and test runs.
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="e.g. AEB Safety Validation"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
              background: 'var(--c-bg)', border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'var(--c-border)'}`,
              color: 'var(--c-text)', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--font)',
              transition: 'border-color 0.15s',
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
                background: 'transparent', color: 'var(--c-text-2)', cursor: 'pointer',
                fontSize: '0.8125rem', fontFamily: 'var(--font)',
              }}
            >
              Cancel
            </button>
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
                : <><Plus size={12} /> Create Project</>
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

  const sidebarBase: React.CSSProperties = {
    background: SB.bg,
    borderRight: `1px solid ${SB.border}`,
    display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
  };

  const sidebarStyle: React.CSSProperties = isMobile
    ? {
        ...sidebarBase,
        width: 240, position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1)',
      }
    : {
        ...sidebarBase,
        width: w, position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
      };

  const nav = (
    <nav
      style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        display: 'flex', flexDirection: 'column',
        scrollbarWidth: 'none', padding: '8px 0 4px',
      }}
    >
      {/* ── Main navigation ───────────────────────────────────── */}
      <div style={{ padding: '0 8px' }}>
        {!effectiveCollapsed && (
          <div style={{
            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: SB.textDim,
            padding: '4px 8px 6px',
          }}>
            Platform
          </div>
        )}
        <NavItem to="/app/dashboard"    icon={LayoutDashboard} label="Dashboard"     collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/generate"     icon={Sparkles}        label="Generate Tests" collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/review"       icon={ClipboardCheck}  label="Review"         collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/test-cases"   icon={ListChecks}      label="Test Cases"     collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/validation"   icon={CheckCircle2}    label="Validation"     collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/traceability" icon={GitBranch}       label="Traceability"   collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
        <NavItem to="/app/runs"         icon={PlayCircle}      label="Runs"           collapsed={effectiveCollapsed} onNavigate={isMobile ? onCloseMobile : undefined} />
      </div>

      {/* ── Divider ───────────────────────────────────────────── */}
      <div style={{ height: 1, background: SB.divider, margin: '10px 12px' }} />

      {/* ── Projects ──────────────────────────────────────────── */}
      <div style={{ padding: '0 8px', flex: 1 }}>
        <AnimatePresence initial={false}>
          {!effectiveCollapsed ? (
            <motion.div
              key="ph-full"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 8px 6px' }}
            >
              <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: SB.textDim }}>
                Projects
                {projects.length > 0 && (
                  <span style={{ marginLeft: 6, fontSize: '0.6rem', fontWeight: 600, padding: '0px 5px', borderRadius: 4, background: SB.badgeBg, color: SB.textMuted, border: `1px solid ${SB.badgeBorder}` }}>
                    {projects.length}
                  </span>
                )}
              </span>
              <button
                onClick={() => setShowNewProject(true)}
                title="New Project"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, background: 'transparent', border: `1px solid ${SB.border}`, cursor: 'pointer', color: SB.textMuted, transition: 'all 0.12s' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = SB.activeBg; el.style.borderColor = SB.activeAccent + '60'; el.style.color = SB.activeAccent; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = SB.border; el.style.color = SB.textMuted; }}
              >
                <Plus size={11} strokeWidth={2.5} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="ph-collapsed"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 6px' }}
            >
              <button
                onClick={() => setShowNewProject(true)}
                title="New Project"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, background: 'transparent', border: `1px solid ${SB.border}`, cursor: 'pointer', color: SB.textMuted, transition: 'all 0.12s' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = SB.activeBg; el.style.borderColor = SB.activeAccent + '60'; el.style.color = SB.activeAccent; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = SB.border; el.style.color = SB.textMuted; }}
              >
                <Plus size={12} strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {projects.length === 0 ? (
            !effectiveCollapsed && (
              <div
                style={{ padding: '10px', borderRadius: 8, border: `1px dashed ${SB.border}`, textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onClick={() => setShowNewProject(true)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = SB.activeAccent + '60'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = SB.border; }}
              >
                <div style={{ fontSize: '0.75rem', color: SB.textMuted, lineHeight: 1.5 }}>No projects yet</div>
                <div style={{ fontSize: '0.6875rem', color: SB.activeAccent, marginTop: 3, fontWeight: 500 }}>+ Create first project</div>
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

        {!effectiveCollapsed && projects.length > 0 && (
          <Link
            to="/app/projects"
            onClick={isMobile ? onCloseMobile : undefined}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 7, marginTop: 4, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 500, color: SB.textMuted, transition: 'all 0.12s' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = SB.activeAccent; el.style.background = SB.activeBg; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = SB.textMuted; el.style.background = 'transparent'; }}
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
      {/* ── Brand / Logo ─────────────────────────────────────── */}
      <div style={{
        padding: effectiveCollapsed ? '11px 0' : '14px 16px 12px',
        borderBottom: `1px solid ${SB.border}`,
        background: SB.bgHeader,
        flexShrink: 0,
        display: 'flex',
        flexDirection: effectiveCollapsed ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
        minHeight: 57,
        transition: 'padding 0.28s',
      }}>
        <AnimatePresence initial={false} mode="wait">
          {effectiveCollapsed ? (
            <motion.img
              key="logo-icon"
              src="/logo-removebg-preview.png"
              alt="GuJ Tech"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              style={{ width: 50, height: 50, objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <motion.div
              key="logo-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ width: '100%' }}
            >
              <img
                src="/logo-removebg-preview.png"
                alt="GuJ Tech"
                style={{
                  height: 64, width: 'auto', maxWidth: '100%',
                  objectFit: 'contain', objectPosition: 'left center',
                  display: 'block', marginBottom: 9,
                }}
              />
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: SB.text, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                Automotive TC Gen
              </div>
              <div style={{ fontSize: '0.575rem', color: SB.textDim, letterSpacing: '0.1em', marginTop: 3, textTransform: 'uppercase' as const }}>
                ISO 26262 / ASIL-aware
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Nav ─────────────────────────────────────────────── */}
      {nav}

      {/* ── Bottom ───────────────────────────────────────────── */}
      <div style={{
        padding: '6px 8px 10px',
        borderTop: `1px solid ${SB.border}`,
        background: SB.bgHeader,
        flexShrink: 0,
      }}>
        <NavItem
          to="/app/settings"
          icon={Settings}
          label="Settings"
          collapsed={effectiveCollapsed}
          onNavigate={isMobile ? onCloseMobile : undefined}
        />
        {!isMobile && (
          <button
            onClick={() => onCollapse(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              padding: collapsed ? '8px 0' : '7px 10px', marginTop: 2,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: SB.textMuted, borderRadius: 7,
              fontSize: '0.75rem', fontWeight: 500, transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = SB.hover; el.style.color = SB.text; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = SB.textMuted; }}
          >
            {!collapsed && <span>Collapse</span>}
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
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
  const location = useLocation();
  const lastActive = formatRelativeShort(project.last_run_at ?? project.updated_at);
  const isActive = location.pathname === '/app/projects';

  if (collapsed) {
    return (
      <Link
        to="/app/projects"
        onClick={onNavigate}
        title={project.name}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 0', borderRadius: 7, textDecoration: 'none', transition: 'background 0.12s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = SB.hover; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      </Link>
    );
  }

  return (
    <NavLink
      to="/app/projects"
      onClick={onNavigate}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '5px 10px', borderRadius: 8, textDecoration: 'none',
        transition: 'background 0.12s',
        background: isActive ? SB.activeBg : 'transparent',
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = SB.hover; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 500, color: SB.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {project.name}
      </span>
      <span style={{ flexShrink: 0 }}>
        {runCount !== null ? (
          <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: SB.badgeBg, border: `1px solid ${SB.badgeBorder}`, color: SB.textMuted }}>
            {runCount}
          </span>
        ) : lastActive ? (
          <span style={{ fontSize: '0.625rem', color: SB.textDim }}>{lastActive}</span>
        ) : null}
      </span>
    </NavLink>
  );
}

// ─── Nav Item ─────────────────────────────────────────────────────────────────

interface NavItemProps {
  to: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  collapsed: boolean;
  onNavigate?: () => void;
}

function NavItem({ to, icon: Icon, label, collapsed, onNavigate }: NavItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      style={{
        display: 'flex', alignItems: 'center',
        gap: 10,
        padding: collapsed ? '9px 0' : '7px 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 7,
        textDecoration: 'none',
        fontSize: '0.8125rem',
        fontWeight: isActive ? 600 : 400,
        whiteSpace: 'nowrap', overflow: 'hidden',
        transition: 'background 0.12s, color 0.12s',
        background: isActive ? SB.activeBg : 'transparent',
        color: isActive ? SB.activeText : SB.textMuted,
        boxShadow: isActive && !collapsed ? `inset 2px 0 0 ${SB.activeAccent}` : 'none',
        marginBottom: 1,
      }}
      onMouseEnter={e => {
        if (!isActive) {
          const el = e.currentTarget as HTMLElement;
          el.style.background = SB.hover;
          el.style.color = SB.text;
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          const el = e.currentTarget as HTMLElement;
          el.style.background = 'transparent';
          el.style.color = SB.textMuted;
        }
      }}
    >
      <Icon
        size={15}
        strokeWidth={isActive ? 2 : 1.75}
        color={isActive ? SB.activeAccent : 'currentColor'}
      />
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
