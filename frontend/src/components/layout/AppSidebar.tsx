import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { listProjects } from '../../api/client';
import type { Project } from '../../types';

const PROJECT_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#60a5fa', '#f472b6', '#a78bfa'];

interface Props {
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
}

export function AppSidebar({ collapsed, onCollapse }: Props) {
  const w = collapsed ? 64 : 240;
  const location = useLocation();
  const projectsActive = location.pathname.startsWith('/app/projects');
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => {});
  }, []);

  return (
    <motion.aside
      animate={{ width: w }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        width: w, position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
        background: 'var(--c-bg-2)', borderRight: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: '18px 16px', borderBottom: '1px solid var(--c-border)',
        flexShrink: 0, minHeight: 57, display: 'flex', alignItems: 'center',
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
            {!collapsed && (
              <motion.div
                key="logo-text"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>AutoTest AI</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-3)', letterSpacing: '0.02em', marginTop: 1 }}>ISO 26262</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem to="/app/dashboard" icon={LayoutDashboard} label="Dashboard" collapsed={collapsed} />

          {/* Projects with real sub-items */}
          <div>
            <NavItem to="/app/projects" icon={FolderOpen} label="Projects" collapsed={collapsed} />
            <AnimatePresence initial={false}>
              {!collapsed && projects.length > 0 && (
                <motion.div
                  key="projects-sub"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ margin: '2px 0 4px 14px', paddingLeft: 10, borderLeft: '1px solid var(--c-border)' }}>
                    {projects.slice(0, 5).map((p, i) => (
                      <NavLink
                        key={p.id}
                        to="/app/projects"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          padding: '4px 8px', borderRadius: 6, textDecoration: 'none',
                          fontSize: '0.75rem', color: 'var(--c-text-3)', fontWeight: 400,
                          transition: 'color 0.12s', whiteSpace: 'nowrap', overflow: 'hidden',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--c-text-2)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--c-text-3)'; }}
                      >
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                          background: PROJECT_COLORS[i % PROJECT_COLORS.length],
                          opacity: projectsActive ? 1 : 0.6,
                        }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      </NavLink>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <NavItem to="/app/generate" icon={Sparkles} label="Generate Tests" collapsed={collapsed} />
          <NavItem to="/app/test-cases" icon={ListChecks} label="Test Cases" collapsed={collapsed} />
          <NavItem to="/app/validation" icon={CheckCircle2} label="Validation" collapsed={collapsed} />
          <NavItem to="/app/traceability" icon={GitBranch} label="Traceability" collapsed={collapsed} />
          <NavItem to="/app/runs" icon={PlayCircle} label="Runs" collapsed={collapsed} />
        </div>
      </nav>

      {/* Bottom */}
      <div style={{ padding: '6px 6px 12px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
        <NavItem to="/app/settings" icon={Settings} label="Settings" collapsed={collapsed} />
        <button
          onClick={() => onCollapse(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '9px' : '8px 12px', marginTop: 4,
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
      </div>
    </motion.aside>
  );
}

interface NavItemProps {
  to: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  collapsed: boolean;
}

function NavItem({ to, icon: Icon, label, collapsed }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 10,
        padding: collapsed ? '9px 0' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8, textDecoration: 'none',
        fontSize: '0.8125rem', fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden',
        transition: 'all 0.15s ease',
        background: isActive ? 'var(--c-accent-dim)' : 'transparent',
        color: isActive ? 'var(--c-accent)' : 'var(--c-text-2)',
        boxShadow: isActive && !collapsed ? 'inset 2px 0 0 var(--c-accent)' : 'none',
      })}
    >
      <Icon size={17} strokeWidth={1.75} />
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
