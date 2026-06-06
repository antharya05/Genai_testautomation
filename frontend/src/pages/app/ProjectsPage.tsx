import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2, Edit2, FileText, FolderOpen, GitBranch,
  Loader2, MoreHorizontal, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createProject, deleteProject, getProjectStats, listProjects, updateProject } from '../../api/client';
import { PageTransition } from '../../components/layout/PageTransition';
import type { Project, ProjectStats } from '../../types';

const PROJECT_COLORS = ['#6366f1', '#818cf8', '#34d399', '#f59e0b', '#60a5fa', '#f472b6', '#a78bfa', '#4ade80'];

const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001';

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

function CreateProjectModal({ onClose, onCreate }: {
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
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
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)' }}>New Project</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: 1 }}>Create a project to organize your runs</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)', padding: 4, borderRadius: 6 }}>
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
                color: 'var(--c-text)', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--font)',
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
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--c-accent)'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--c-border)'; }}
            />
          </div>

          {error && (
            <div style={{
              padding: '9px 12px', borderRadius: 8,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
              fontSize: '0.8125rem', color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button" onClick={onClose}
              style={{
                flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--c-border)',
                background: 'var(--c-bg-2)', color: 'var(--c-text-2)', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font)',
              }}
            >Cancel</button>
            <button
              type="submit" disabled={loading}
              style={{
                flex: 2, padding: '10px', borderRadius: 9,
                background: loading ? 'rgba(99,102,241,0.4)' : 'var(--c-accent)',
                border: 'none', color: 'white', cursor: loading ? 'wait' : 'pointer',
                fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
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

// ─── Rename Modal ──────────────────────────────────────────────────────────────

function RenameModal({ project, onClose, onRenamed }: {
  project: Project;
  onClose: () => void;
  onRenamed: (p: Project) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); nameRef.current?.select(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const updated = await updateProject(project.id, trimmed, description.trim());
      onRenamed(updated);
      onClose();
    } catch {
      setError('Failed to rename project.');
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
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
          borderRadius: 18, padding: '26px', width: '100%', maxWidth: 420,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)' }}>Rename Project</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="Project name"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
              background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
              color: 'var(--c-text)', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--font)',
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--c-accent)'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--c-border)'; }}
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
              background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
              color: 'var(--c-text)', fontSize: '0.875rem', outline: 'none',
              fontFamily: 'var(--font)', resize: 'none',
            }}
            onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--c-accent)'; }}
            onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--c-border)'; }}
          />
          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', fontSize: '0.8125rem', color: '#fca5a5' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1px solid var(--c-border)', background: 'var(--c-bg-2)', color: 'var(--c-text-2)', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'var(--font)' }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: '9px', borderRadius: 9, background: loading ? 'rgba(99,102,241,0.4)' : 'var(--c-accent)', border: 'none', color: 'white', cursor: loading ? 'wait' : 'pointer', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              Save
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirmModal({ project, onClose, onDeleted }: {
  project: Project;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setLoading(true);
    setError('');
    try {
      await deleteProject(project.id);
      onDeleted(project.id);
      onClose();
    } catch {
      setError('Failed to delete project.');
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'var(--c-surface)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 18, padding: '28px', width: '100%', maxWidth: 400,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 14px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trash2 size={20} color="#f87171" strokeWidth={1.75} />
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>Delete Project?</div>
          <p style={{ fontSize: '0.875rem', color: 'var(--c-text-3)', margin: '0 0 4px', lineHeight: 1.6 }}>
            This will permanently delete <strong style={{ color: 'var(--c-text-2)' }}>{project.name}</strong> and all associated runs and test cases.
          </p>
          <p style={{ fontSize: '0.8125rem', color: '#f87171', margin: 0, fontWeight: 500 }}>
            This action cannot be undone.
          </p>
        </div>
        {error && (
          <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', fontSize: '0.8125rem', color: '#fca5a5', marginBottom: 14 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--c-border)', background: 'var(--c-bg-2)', color: 'var(--c-text-2)', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'var(--font)' }}>Cancel</button>
          <button
            onClick={handleDelete}
            disabled={loading}
            style={{ flex: 2, padding: '10px', borderRadius: 9, background: loading ? 'rgba(239,68,68,0.4)' : '#ef4444', border: 'none', color: 'white', cursor: loading ? 'wait' : 'pointer', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, color, index,
  onRename, onDelete,
}: {
  project: Project; color: string; index: number;
  onRename: () => void; onDelete: () => void;
}) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDefault = project.id === DEFAULT_PROJECT_ID;

  useEffect(() => {
    getProjectStats(project.id).then(setStats).catch(() => {});
  }, [project.id]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const lastActivity = project.last_run_at ?? project.updated_at ?? project.created_at;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 14, padding: '18px 22px', transition: 'border-color 0.15s',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.01em' }}>
              {project.name}
            </div>
            {isDefault && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                color: 'var(--c-accent)', letterSpacing: '0.05em',
              }}>
                DEFAULT
              </span>
            )}
          </div>
          {project.description && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--c-text-3)', margin: '0 0 12px', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.description}
            </p>
          )}

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: project.description ? 0 : 8 }}>
            {stats ? (
              <>
                <StatChip icon={GitBranch} value={stats.total_runs} label="runs" />
                <StatChip icon={Sparkles} value={stats.total_test_cases} label="cases" />
                <StatChip icon={FileText} value={stats.total_requirements} label="requirements" />
                <StatChip icon={CheckCircle2} value={stats.completed_runs} label="completed" />
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

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start' }}>
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

          {/* Kebab menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{
                width: 32, height: 32, borderRadius: 7,
                background: menuOpen ? 'var(--c-bg-2)' : 'transparent',
                border: '1px solid transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--c-text-3)', transition: 'all 0.12s',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--c-bg-2)'; el.style.borderColor = 'var(--c-border)'; el.style.color = 'var(--c-text-2)'; }}
              onMouseLeave={e => { if (!menuOpen) { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'transparent'; el.style.color = 'var(--c-text-3)'; } }}
            >
              <MoreHorizontal size={15} />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                    borderRadius: 10, minWidth: 150, zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.25)', overflow: 'hidden',
                    padding: 5,
                  }}
                >
                  <button
                    onClick={() => { setMenuOpen(false); onRename(); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 7, border: 'none',
                      background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)',
                      color: 'var(--c-text-2)', fontSize: '0.8125rem', fontWeight: 500,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <Edit2 size={13} />
                    Rename
                  </button>
                  {!isDefault && (
                    <button
                      onClick={() => { setMenuOpen(false); onDelete(); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: 7, border: 'none',
                        background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)',
                        color: '#f87171', fontSize: '0.8125rem', fontWeight: 500,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatChip({ icon: Icon, value, label }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  value: number; label: string;
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
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(p: Project) { setProjects(prev => [p, ...prev]); }
  function handleRenamed(updated: Project) {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  }
  function handleDeleted(id: string) {
    setProjects(prev => prev.filter(p => p.id !== id));
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
            }}
          >
            <Plus size={14} />
            New Project
          </button>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Loader2 size={20} color="var(--c-accent)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

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

        {!loading && projects.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map((p, i) => (
              <ProjectCard
                key={p.id}
                project={p}
                color={PROJECT_COLORS[i % PROJECT_COLORS.length]}
                index={i}
                onRename={() => setRenameTarget(p)}
                onDelete={() => setDeleteTarget(p)}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={handleCreated} />}
        {renameTarget && <RenameModal project={renameTarget} onClose={() => setRenameTarget(null)} onRenamed={handleRenamed} />}
        {deleteTarget && <DeleteConfirmModal project={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}
