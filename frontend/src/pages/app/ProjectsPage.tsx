import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, FileText, FolderOpen, GitBranch, Loader2, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createProject, getProjectStats, listProjects } from '../../api/client';
import { PageTransition } from '../../components/layout/PageTransition';
import type { Project, ProjectStats } from '../../types';

const PROJECT_COLORS = ['#6366f1', '#818cf8', '#34d399', '#f59e0b', '#60a5fa', '#f472b6', '#a78bfa', '#4ade80'];

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch { return '—'; }
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}

// ─── Create Project Modal ─────────────────────────────────────────────────────

function CreateProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (p: Project) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Project name is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const p = await createProject(trimmed, description.trim());
      onCreate(p);
      onClose();
    } catch {
      setError('Failed to create project. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 18, padding: '28px', width: '100%', maxWidth: 460,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FolderOpen size={16} color="var(--c-accent)" strokeWidth={1.75} />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.01em' }}>New Project</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: 1 }}>Create a project to organize your runs</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)', padding: 4, borderRadius: 6 }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: 7 }}>
              Project Name <span style={{ color: 'var(--c-accent)' }}>*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="e.g. AEB Validation, Battery Management System"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
                background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
                color: 'var(--c-text)', fontSize: '0.875rem', outline: 'none',
                fontFamily: 'var(--font)', transition: 'border-color 0.15s',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--c-accent)'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--c-border)'; }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-2)', marginBottom: 7 }}>
              Description <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of this project's scope"
              rows={3}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
                background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
                color: 'var(--c-text)', fontSize: '0.875rem', outline: 'none',
                fontFamily: 'var(--font)', resize: 'none', lineHeight: 1.55,
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--c-accent)'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--c-border)'; }}
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '9px 12px', borderRadius: 8,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
                fontSize: '0.8125rem', color: '#fca5a5',
              }}
            >
              {error}
            </motion.div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--c-border)',
                background: 'var(--c-bg-2)', color: 'var(--c-text-2)', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font)', transition: 'all 0.15s',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 2, padding: '10px', borderRadius: 9,
                background: loading ? 'rgba(99,102,241,0.4)' : 'var(--c-accent)',
                border: 'none', color: 'white', cursor: loading ? 'wait' : 'pointer',
                fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'opacity 0.15s',
              }}
            >
              {loading
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</>
                : <><Plus size={14} /> Create Project</>
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, color, index }: { project: Project; color: string; index: number }) {
  const [stats, setStats] = useState<ProjectStats | null>(null);

  useEffect(() => {
    getProjectStats(project.id).then(setStats).catch(() => {});
  }, [project.id]);

  const lastActivity = project.last_run_at ?? project.updated_at ?? project.created_at;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 14, padding: '18px 22px',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color + '60'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: color + '15', border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FolderOpen size={18} color={color} strokeWidth={1.75} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.01em', marginBottom: 3 }}>
            {project.name}
          </div>
          {project.description && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--c-text-3)', margin: '0 0 12px', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.description}
            </p>
          )}

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: project.description ? 0 : 8 }}>
            {stats ? (
              <>
                <StatChip icon={GitBranch} value={stats.total_runs} label="runs" color="#60a5fa" />
                <StatChip icon={Sparkles} value={stats.total_test_cases} label="cases" color="#818cf8" />
                <StatChip icon={FileText} value={stats.total_requirements} label="requirements" color="#34d399" />
                <StatChip icon={CheckCircle2} value={stats.completed_runs} label="completed" color="#10b981" />
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--c-text-3)', fontSize: '0.75rem' }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                Loading stats…
              </div>
            )}
          </div>

          {lastActivity && (
            <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: 10 }}>
              Updated {formatRelative(lastActivity)} · {formatDate(lastActivity)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Link
            to="/app/generate"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 7, fontSize: '0.8125rem', fontWeight: 600,
              background: 'var(--c-accent-dim)', border: '1px solid var(--c-accent-glow)',
              color: 'var(--c-accent)', textDecoration: 'none',
            }}
          >
            <Sparkles size={12} />
            Generate
          </Link>
          <Link
            to="/app/runs"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 7, fontSize: '0.8125rem', fontWeight: 500,
              background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
              color: 'var(--c-text-2)', textDecoration: 'none',
            }}
          >
            Runs
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function StatChip({
  icon: Icon, value, label, color,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  value: number; label: string; color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <Icon size={12} strokeWidth={1.75} />
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text)' }}>{value.toLocaleString()}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--c-text-3)' }}>{label}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(p: Project) {
    setProjects(prev => [p, ...prev]);
  }

  return (
    <PageTransition>
      <div style={{ padding: '28px 32px 48px', maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FolderOpen size={17} color="var(--c-accent)" strokeWidth={1.75} />
              </div>
              <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', margin: 0 }}>Projects</h1>
            </div>
            <p style={{ color: 'var(--c-text-3)', fontSize: '0.8125rem', margin: 0 }}>
              Manage your validation projects and generation runs
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              background: 'var(--c-accent)', color: 'white', border: 'none',
              cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
              fontFamily: 'var(--font)', boxShadow: '0 0 14px rgba(99,102,241,0.3)',
              transition: 'opacity 0.15s',
            }}
          >
            <Plus size={14} />
            New Project
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Loader2 size={20} color="var(--c-accent)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {/* Empty */}
        {!loading && projects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderRadius: 16, padding: '60px 40px', textAlign: 'center',
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 13, margin: '0 auto 18px',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FolderOpen size={22} color="var(--c-accent)" strokeWidth={1.75} />
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--c-text)', margin: '0 0 8px' }}>No projects yet</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--c-text-3)', margin: '0 0 22px', lineHeight: 1.6 }}>
              Create a project to organize your generation runs and test cases.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 8,
                background: 'var(--c-accent)', color: 'white', border: 'none',
                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font)',
              }}
            >
              <Plus size={14} />
              Create your first project
            </button>
          </motion.div>
        )}

        {/* Projects list */}
        {!loading && projects.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map((p, i) => (
              <ProjectCard
                key={p.id}
                project={p}
                color={PROJECT_COLORS[i % PROJECT_COLORS.length]}
                index={i}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={handleCreated} />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}
