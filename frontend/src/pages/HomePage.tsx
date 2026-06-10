import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  GitBranch,
  Key,
  Shield,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// ─── Constants ─────────────────────────────────────────────────────────────────

const PRODUCT_NAME = 'AutoTestAI';

const HERO_BADGES = ['ISO 26262', 'ASIL A–D', 'Traceability', 'Validation', 'Excel Export', 'JIRA Export', 'BYOK'];

const PIPELINE_REQS = [
  { id: 'REQ_ADAS_001', label: 'AEB Activation Threshold', asil: 'D' },
  { id: 'REQ_ADAS_002', label: 'Brake Force Calculation',  asil: 'D' },
  { id: 'REQ_ADAS_003', label: 'Sensor Fusion Override',   asil: 'C' },
];

const PIPELINE_TCS = [
  { id: 'TC-0041', req: 'REQ_ADAS_001', asil: 'D', type: 'functional' },
  { id: 'TC-0042', req: 'REQ_ADAS_001', asil: 'D', type: 'boundary'   },
  { id: 'TC-0043', req: 'REQ_ADAS_002', asil: 'D', type: 'functional' },
];

const WORKFLOW_STEPS = [
  { icon: Upload,       label: 'Requirements', desc: 'PDF · DOCX · Text',        color: '#818cf8' },
  { icon: BookOpen,     label: 'Analysis',     desc: 'ISO 26262 Patterns',        color: '#a78bfa' },
  { icon: Brain,        label: 'Generation',   desc: 'AI · ASIL Classification',  color: '#8b5cf6' },
  { icon: Eye,          label: 'Review',       desc: 'Approve · Reject · Refine', color: '#7c3aed' },
  { icon: CheckCircle2, label: 'Validation',   desc: 'Coverage · Deduplication',  color: '#6d28d9' },
  { icon: FileText,     label: 'Export',       desc: 'Excel · JIRA CSV',          color: '#5b21b6' },
];

const FEATURES = [
  {
    icon: Sparkles, title: 'AI Test Case Generation', color: '#818cf8',
    desc: 'AI-generated test cases with preconditions, steps, and expected results for every requirement.',
  },
  {
    icon: Users, title: 'Review & Approval Workflow', color: '#a78bfa',
    desc: 'Structured review pipeline where engineers can approve, reject, or refine generated test cases before export.',
  },
  {
    icon: CheckCircle2, title: 'Validation & Risk Analysis', color: '#34d399',
    desc: 'Coverage analysis, duplicate detection, and ASIL distribution review for every run.',
  },
  {
    icon: GitBranch, title: 'Traceability Matrix', color: '#60a5fa',
    desc: 'Automatic requirement-to-test linking — full coverage visibility, audit-ready.',
  },
  {
    icon: Shield, title: 'ISO 26262 Alignment', color: '#f59e0b',
    desc: 'ASIL classification from QM to D, aligned to Parts 6, 8 & 9.',
  },
  {
    icon: FileText, title: 'Excel & JIRA Export', color: '#f472b6',
    desc: 'Export to structured Excel or JIRA-compatible CSV for your test management tool.',
  },
  {
    icon: Key, title: 'BYOK Provider Support', color: '#22d3ee',
    desc: 'Use your own Groq, Claude, OpenAI, or Gemini API keys directly from Settings. No platform-managed AI credentials required.',
  },
];

const BYOK_PROVIDERS = [
  { name: 'Groq',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)'  },
  { name: 'Claude', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)' },
  { name: 'OpenAI', color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.22)'  },
  { name: 'Gemini', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.22)'  },
];

const BYOK_FEATURES = [
  'Provider selection',
  'Model selection',
  'Secure key storage',
  'Switch providers anytime',
];

const ASIL_BADGE: Record<string, { bg: string; border: string; color: string }> = {
  D: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.28)',  color: '#fca5a5' },
  C: { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.28)', color: '#fdba74' },
  B: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.28)', color: '#fcd34d' },
  A: { bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)',  color: '#6ee7b7' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tick(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// ─── NavBar ───────────────────────────────────────────────────────────────────

function NavBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, padding: '0 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(9,9,11,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'background 0.3s, backdrop-filter 0.3s, border-color 0.3s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img
          src="/logo-removebg-preview.png"
          alt="GuJ Tech"
          style={{ height: 36, width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {[
          { label: 'Workflow', href: '#workflow' },
          { label: 'Features', href: '#features' },
          { label: 'BYOK',     href: '#byok'     },
        ].map(({ label, href }) => (
          <a key={label} href={href}
            style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: '0.875rem', transition: 'color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'white'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
          >
            {label}
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/signin" style={{
          padding: '6px 18px', borderRadius: 8, textDecoration: 'none',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', fontWeight: 500, transition: 'all 0.2s',
        }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.12)'; el.style.borderColor = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.06)'; el.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          Sign In
        </Link>
        <Link to="/signin" style={{
          padding: '6px 18px', borderRadius: 8, textDecoration: 'none',
          background: '#6366f1', color: 'white', fontSize: '0.875rem', fontWeight: 600,
          boxShadow: '0 0 20px rgba(99,102,241,0.4)', transition: 'all 0.2s',
        }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#4f46e5'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#6366f1'; }}
        >
          Get Started
        </Link>
      </div>
    </motion.nav>
  );
}

// ─── Pipeline Card ────────────────────────────────────────────────────────────

type AnimPhase = 'init' | 'parsing' | 'processing' | 'generating' | 'complete' | 'fade';

function PipelineCard() {
  const [phase, setPhase]       = useState<AnimPhase>('init');
  const [reqCount, setReqCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [tcCount, setTcCount]   = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      while (!cancelled) {
        setPhase('init'); setReqCount(0); setProgress(0); setTcCount(0);
        await tick(400);

        setPhase('parsing');
        for (let i = 1; i <= PIPELINE_REQS.length; i++) {
          if (cancelled) return;
          await tick(520);
          setReqCount(i);
        }
        await tick(500);

        if (cancelled) return;
        setPhase('processing');
        for (let p = 0; p <= 100; p++) {
          if (cancelled) return;
          await tick(20);
          setProgress(p);
        }
        await tick(350);

        if (cancelled) return;
        setPhase('generating');
        for (let i = 1; i <= PIPELINE_TCS.length; i++) {
          if (cancelled) return;
          await tick(440);
          setTcCount(i);
        }

        if (cancelled) return;
        setPhase('complete');
        await tick(3400);

        if (cancelled) return;
        setPhase('fade');
        await tick(700);
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  const showProcessing = phase === 'processing' || phase === 'generating' || phase === 'complete';
  const showTCs        = phase === 'generating' || phase === 'complete';
  const contentAlpha   = phase === 'init' || phase === 'fade' ? 0 : 1;

  const statusLabel =
    phase === 'complete'    ? 'COMPLETE'   :
    phase === 'processing'  ? 'PROCESSING' :
    phase === 'generating'  ? 'GENERATING' :
    (phase === 'fade' || phase === 'init') ? '' : 'PARSING';

  const statusDotColor =
    phase === 'complete'   ? '#34d399' :
    phase === 'processing' ? '#f59e0b' : '#818cf8';

  return (
    <div style={{ perspective: '1400px', perspectiveOrigin: '55% 45%' }}>
      <motion.div
        initial={{ y: 0, rotateX: 3, rotateY: -9 }}
        animate={{ y: [0, -12, 0], rotateX: [3, 4.5, 3], rotateY: [-9, -7, -9] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 390, borderRadius: 18,
          background: 'rgba(12,12,16,0.9)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          borderTop: '1px solid rgba(255,255,255,0.18)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow: [
            '0 48px 96px rgba(0,0,0,0.7)',
            '0 16px 40px rgba(0,0,0,0.5)',
            '0 4px 12px rgba(0,0,0,0.3)',
          ].join(', '),
          overflow: 'hidden',
        }}
      >
        {/* Window chrome */}
        <div style={{
          padding: '11px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'rgba(255,255,255,0.02)',
        }}>
          {['rgba(239,68,68,0.55)', 'rgba(245,158,11,0.55)', 'rgba(52,211,153,0.55)'].map((c, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
          ))}
          <span style={{ flex: 1, fontSize: '0.7rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.28)', marginLeft: 6 }}>
            generation — REQ_SET_AEB_001
          </span>
          {statusLabel && (
            <motion.div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                style={{ width: 5, height: 5, borderRadius: '50%', background: statusDotColor, flexShrink: 0 }}
              />
              <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em', color: statusDotColor }}>
                {statusLabel}
              </span>
            </motion.div>
          )}
        </div>

        {/* Card body */}
        <motion.div
          animate={{ opacity: contentAlpha }}
          transition={{ duration: 0.5 }}
          style={{ padding: '16px' }}
        >
          {/* Requirements */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)',
              marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7,
            }}>
              Requirements
              <span style={{ color: 'rgba(255,255,255,0.14)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                {reqCount} / {PIPELINE_REQS.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {PIPELINE_REQS.map((req, i) => (
                <motion.div
                  key={req.id}
                  animate={{ opacity: reqCount > i ? 1 : 0, x: reqCount > i ? 0 : -10 }}
                  transition={{ duration: 0.28 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.055)',
                  }}
                >
                  <span style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: '#a5b4fc', fontWeight: 600, flexShrink: 0 }}>
                    {req.id}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.42)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {req.label}
                  </span>
                  <span style={{
                    fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                    background: ASIL_BADGE[req.asil]?.bg, border: `1px solid ${ASIL_BADGE[req.asil]?.border}`,
                    color: ASIL_BADGE[req.asil]?.color,
                  }}>
                    {req.asil}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Processing connector */}
          <motion.div
            animate={{ opacity: showProcessing ? 1 : 0, y: showProcessing ? 0 : 5 }}
            transition={{ duration: 0.3 }}
            style={{ marginBottom: 14 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                AI · ISO 26262
              </span>
              <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.05, ease: 'linear' }}
                style={{ height: '100%', background: 'linear-gradient(90deg, #6366f1, #a78bfa)', borderRadius: 2 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.61rem', color: 'rgba(255,255,255,0.16)' }}>ASIL classification · pattern matching</span>
              <span style={{
                fontSize: '0.63rem', fontFamily: 'monospace', fontWeight: 600,
                color: phase === 'complete' ? '#34d399' : 'rgba(255,255,255,0.32)',
              }}>
                {progress}%
              </span>
            </div>
          </motion.div>

          {/* Test cases */}
          <motion.div
            animate={{ opacity: showTCs ? 1 : 0, y: showTCs ? 0 : 5 }}
            transition={{ duration: 0.3 }}
          >
            <div style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)',
              marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7,
            }}>
              Generated Test Cases
              {phase !== 'complete' && showTCs && (
                <motion.span
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                  style={{ color: '#818cf8', fontSize: '0.5rem' }}
                >
                  ●
                </motion.span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {PIPELINE_TCS.map((tc, i) => (
                <motion.div
                  key={tc.id}
                  animate={{ opacity: tcCount > i ? 1 : 0, x: tcCount > i ? 0 : 10 }}
                  transition={{ duration: 0.28 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8,
                    background: 'rgba(99,102,241,0.07)',
                    border: '1px solid rgba(129,140,248,0.15)',
                  }}
                >
                  <span style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: '#a5b4fc', fontWeight: 600, flexShrink: 0 }}>
                    {tc.id}
                  </span>
                  <span style={{ fontSize: '0.69rem', color: 'rgba(255,255,255,0.3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tc.req}
                  </span>
                  <span style={{
                    fontSize: '0.59rem', padding: '1px 5px', borderRadius: 3,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.26)', flexShrink: 0,
                  }}>
                    {tc.type}
                  </span>
                  <span style={{
                    fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                    background: ASIL_BADGE[tc.asil]?.bg, border: `1px solid ${ASIL_BADGE[tc.asil]?.border}`,
                    color: ASIL_BADGE[tc.asil]?.color,
                  }}>
                    {tc.asil}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Complete footer */}
        <motion.div
          animate={{ opacity: phase === 'complete' ? 1 : 0, y: phase === 'complete' ? 0 : 8 }}
          transition={{ duration: 0.35 }}
          style={{
            padding: '10px 16px',
            borderTop: '1px solid rgba(52,211,153,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(52,211,153,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={11} color="#34d399" />
            <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 600 }}>3 test cases · 100% coverage</span>
          </div>
          <span style={{ fontSize: '0.61rem', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>ASIL-D verified</span>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow, eyebrowColor, eyebrowBg, eyebrowBorder, title, sub,
}: {
  eyebrow: string; eyebrowColor: string; eyebrowBg: string; eyebrowBorder: string;
  title: string; sub: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
      style={{ textAlign: 'center', marginBottom: 56 }}
    >
      <span style={{
        display: 'inline-block', padding: '4px 12px', borderRadius: 6, marginBottom: 18,
        background: eyebrowBg, border: `1px solid ${eyebrowBorder}`,
        fontSize: '0.7rem', fontWeight: 700, color: eyebrowColor,
        letterSpacing: '0.09em', textTransform: 'uppercase',
      }}>
        {eyebrow}
      </span>
      <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 700, color: 'white', letterSpacing: '-0.025em', margin: '0 0 14px' }}>
        {title}
      </h2>
      <p style={{ fontSize: '1.0625rem', color: 'rgba(255,255,255,0.44)', maxWidth: 480, margin: '0 auto', lineHeight: 1.65 }}>
        {sub}
      </p>
    </motion.div>
  );
}

// ─── BYOK Section ─────────────────────────────────────────────────────────────

function BYOKSection() {
  return (
    <section id="byok" style={{
      padding: '80px 40px',
      background: 'rgba(255,255,255,0.008)',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 60, alignItems: 'center',
        }}>
          {/* Left: copy */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 6, marginBottom: 18,
              background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)',
              fontSize: '0.7rem', fontWeight: 700, color: '#22d3ee',
              letterSpacing: '0.09em', textTransform: 'uppercase' as const,
            }}>
              BYOK
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 700, color: 'white', letterSpacing: '-0.025em', margin: '0 0 14px' }}>
              Bring Your Own AI
            </h2>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.44)', margin: '0 0 28px', lineHeight: 1.7, maxWidth: 420 }}>
              Connect your own API keys from Settings. No platform-managed credentials — you stay in full control of model choice and costs.
            </p>

            {/* Provider pills */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
              {BYOK_PROVIDERS.map(p => (
                <span key={p.name} style={{
                  padding: '6px 16px', borderRadius: 8,
                  background: p.bg, border: `1px solid ${p.border}`,
                  color: p.color, fontSize: '0.875rem', fontWeight: 600,
                }}>
                  {p.name}
                </span>
              ))}
            </div>

            {/* Feature checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {BYOK_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={14} color="#22d3ee" />
                  <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)' }}>{f}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: settings card mockup */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{
              background: 'rgba(255,255,255,0.025)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(34,211,238,0.1)',
              borderTop: '1px solid rgba(34,211,238,0.22)',
              borderRadius: 18, overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
            }}
          >
            {/* Window chrome */}
            <div style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.02)' }}>
              {['rgba(239,68,68,0.5)', 'rgba(245,158,11,0.5)', 'rgba(52,211,153,0.5)'].map((c, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
              ))}
              <span style={{ marginLeft: 8, fontSize: '0.7rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)' }}>
                Settings — AI Provider
              </span>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 14 }}>
                AI Provider
              </div>

              {BYOK_PROVIDERS.map((p, i) => (
                <motion.div
                  key={p.name}
                  initial={{ opacity: 0, x: 10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.25 + i * 0.07 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10, marginBottom: 8,
                    background: i === 0 ? p.bg : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${i === 0 ? p.border : 'rgba(255,255,255,0.06)'}`,
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? p.color : 'rgba(255,255,255,0.12)',
                  }} />
                  <span style={{
                    flex: 1, fontSize: '0.875rem',
                    color: i === 0 ? 'white' : 'rgba(255,255,255,0.35)',
                    fontWeight: i === 0 ? 600 : 400,
                  }}>
                    {p.name}
                  </span>
                  {i === 0 && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 4,
                      background: p.bg, border: `1px solid ${p.border}`,
                      color: p.color, fontSize: '0.62rem', fontWeight: 700,
                    }}>
                      Active
                    </span>
                  )}
                </motion.div>
              ))}

              {/* API Key row */}
              <div style={{
                marginTop: 16, padding: '11px 14px', borderRadius: 10,
                background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.1)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Key size={12} color="#22d3ee" />
                <span style={{ flex: 1, fontSize: '0.75rem', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace' }}>
                  gsk_••••••••••••••••••••••
                </span>
                <span style={{
                  padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)',
                  color: '#6ee7b7', fontSize: '0.6rem', fontWeight: 700,
                }}>
                  VALID
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [wide, setWide] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1060 : true
  );
  const [workflowWide, setWorkflowWide] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const onResize = () => {
      setWide(window.innerWidth >= 1060);
      setWorkflowWide(window.innerWidth >= 768);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div style={{ background: '#09090B', minHeight: '100vh', fontFamily: 'var(--font)', color: 'white' }}>
      <NavBar />

      {/* ── Hero ── */}
      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', alignItems: 'center',
        padding: wide ? '100px 80px' : '120px 24px 80px',
        overflow: 'hidden',
      }}>
        {/* Subtle grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)',
          backgroundSize: '64px 64px', opacity: 0.018,
        }} />

        {/* Radial lighting */}
        <div style={{
          position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
          width: 700, height: 700, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 65% 45%, rgba(99,102,241,0.14) 0%, rgba(139,92,246,0.07) 38%, transparent 65%)',
        }} />

        <div style={{
          maxWidth: 1280, margin: '0 auto', width: '100%',
          display: 'flex', alignItems: 'center',
          gap: wide ? 80 : 0,
          flexDirection: wide ? 'row' : 'column',
          position: 'relative',
        }}>
          {/* Left: copy */}
          <div style={{ flex: '1 1 0', minWidth: 0, textAlign: wide ? 'left' : 'center' }}>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={{ fontWeight: 800, lineHeight: 1.0, letterSpacing: '-0.04em', color: 'white', margin: '0 0 24px' }}
            >
              <span style={{ display: 'block', fontSize: 'clamp(38px, 5vw, 72px)', color: 'rgba(255,255,255,0.72)', letterSpacing: '-0.035em' }}>
                Automotive
              </span>
              <span style={{
                display: 'block', fontSize: 'clamp(40px, 5.5vw, 78px)', letterSpacing: '-0.04em',
                background: 'linear-gradient(125deg, #a5b4fc 0%, #818cf8 40%, #c4b5fd 75%, #22d3ee 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                Test Case Generator
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              style={{
                fontSize: '1.0625rem', color: 'rgba(255,255,255,0.44)',
                maxWidth: 520, margin: wide ? '0 0 16px' : '0 auto 16px',
                lineHeight: 1.75,
              }}
            >
              Generate ISO 26262-compliant automotive test cases, validation reports, and traceability matrices from requirements using AI.
            </motion.p>

            {/* BYOK callout */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.28 }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 14px', borderRadius: 8, marginBottom: 32,
                background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.16)',
              }}
            >
              <Key size={12} color="#22d3ee" />
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ color: '#22d3ee', fontWeight: 600 }}>Bring Your Own Key</span>
                {' '}— Use Groq, Claude, OpenAI, or Gemini with your own API credentials.
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.36 }}
              style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: wide ? 'flex-start' : 'center' }}
            >
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Link to="/signin" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 9,
                  padding: '13px 28px', borderRadius: 11,
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: 'white', textDecoration: 'none', fontSize: '0.9375rem', fontWeight: 600,
                  boxShadow: '0 0 32px rgba(99,102,241,0.4)',
                }}>
                  Get Started <ArrowRight size={17} />
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <a href="#workflow" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '13px 28px', borderRadius: 11,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: '0.9375rem', fontWeight: 500,
                }}>
                  See How It Works <ChevronDown size={16} />
                </a>
              </motion.div>
            </motion.div>

            {/* Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              style={{ display: 'flex', gap: 6, marginTop: 28, flexWrap: 'wrap', justifyContent: wide ? 'flex-start' : 'center' }}
            >
              {HERO_BADGES.map(tag => (
                <span key={tag} style={{
                  padding: '3px 10px', borderRadius: 5,
                  background: tag === 'BYOK'
                    ? 'rgba(34,211,238,0.06)'
                    : 'rgba(255,255,255,0.04)',
                  border: tag === 'BYOK'
                    ? '1px solid rgba(34,211,238,0.2)'
                    : '1px solid rgba(255,255,255,0.07)',
                  fontSize: '0.72rem',
                  color: tag === 'BYOK' ? '#22d3ee' : 'rgba(255,255,255,0.28)',
                  fontWeight: tag === 'BYOK' ? 600 : 500,
                }}>
                  {tag}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right: pipeline card (desktop only) */}
          {wide && (
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{ flexShrink: 0, position: 'relative' }}
            >
              <div style={{
                position: 'absolute', inset: -60, pointerEvents: 'none',
                background: 'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.12) 0%, transparent 65%)',
              }} />
              <PipelineCard />
            </motion.div>
          )}
        </div>
      </section>

      {/* ── Workflow ── */}
      <section id="workflow" style={{
        padding: '80px 40px',
        background: 'rgba(255,255,255,0.01)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHeader
            eyebrow="Workflow"
            eyebrowColor="#818cf8"
            eyebrowBg="rgba(99,102,241,0.1)"
            eyebrowBorder="rgba(129,140,248,0.2)"
            title="Requirements to export in six steps"
            sub="A fully automated validation pipeline for automotive safety engineering."
          />

          {workflowWide ? (
            /* Desktop: horizontal */
            <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 0 }}>
              {WORKFLOW_STEPS.map((step, i) => (
                <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: '1 1 auto', minWidth: 0 }}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
                    whileHover={{ y: -6, transition: { duration: 0.2 } }}
                    style={{
                      flex: 1, padding: '22px 16px', textAlign: 'center',
                      background: 'rgba(255,255,255,0.03)',
                      backdropFilter: 'blur(16px) saturate(160%)',
                      border: `1px solid ${step.color}22`,
                      borderTop: `1px solid ${step.color}40`,
                      borderRadius: 14, position: 'relative', cursor: 'default',
                      boxShadow: `0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)`,
                      transition: 'box-shadow 0.2s',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.boxShadow = `0 20px 56px rgba(0,0,0,0.5), 0 0 0 1px ${step.color}30, inset 0 1px 0 rgba(255,255,255,0.1)`;
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.boxShadow = `0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)`;
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, margin: '0 auto 12px',
                      background: step.color + '1a', border: `1px solid ${step.color}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 0 16px ${step.color}20`,
                    }}>
                      <step.icon size={17} color={step.color} strokeWidth={1.75} />
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'white', letterSpacing: '-0.01em', marginBottom: 4 }}>{step.label}</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.32)', lineHeight: 1.5 }}>{step.desc}</div>
                    <div style={{ position: 'absolute', top: 8, right: 10, fontSize: '0.62rem', fontWeight: 700, color: step.color + '45', letterSpacing: '0.04em' }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                  </motion.div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <motion.div
                      initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                      transition={{ delay: i * 0.08 + 0.2 }}
                      style={{ flexShrink: 0, padding: '0 5px', color: 'rgba(255,255,255,0.14)', fontSize: '1.1rem' }}
                    >→</motion.div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Mobile: vertical */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420, margin: '0 auto' }}>
              {WORKFLOW_STEPS.map((step, i) => (
                <div key={step.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: i * 0.07 }}
                    style={{
                      width: '100%', padding: '16px 20px',
                      display: 'flex', alignItems: 'center', gap: 16,
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${step.color}22`,
                      borderLeft: `3px solid ${step.color}60`,
                      borderRadius: 12,
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: step.color + '1a', border: `1px solid ${step.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <step.icon size={16} color={step.color} strokeWidth={1.75} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white', marginBottom: 2 }}>{step.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.32)' }}>{step.desc}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, color: step.color + '50' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </motion.div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.08)' }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHeader
            eyebrow="Features"
            eyebrowColor="#60a5fa"
            eyebrowBg="rgba(96,165,250,0.1)"
            eyebrowBorder="rgba(96,165,250,0.2)"
            title="Everything for automotive test automation"
            sub="Purpose-built for functional safety engineering teams."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                style={{
                  background: 'rgba(255,255,255,0.028)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderTop: '1px solid rgba(255,255,255,0.11)',
                  borderRadius: 16, padding: '26px',
                  cursor: 'default',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = f.color + '50';
                  el.style.borderTopColor = f.color + '70';
                  el.style.boxShadow = `0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px ${f.color}18, inset 0 1px 0 rgba(255,255,255,0.08)`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = 'rgba(255,255,255,0.07)';
                  el.style.borderTopColor = 'rgba(255,255,255,0.11)';
                  el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)';
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 11, marginBottom: 18,
                  background: f.color + '18', border: `1px solid ${f.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 20px ${f.color}15`,
                }}>
                  <f.icon size={19} color={f.color} strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'white', margin: '0 0 9px', letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.44)', margin: 0, lineHeight: 1.65 }}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BYOK ── */}
      <BYOKSection />

      {/* ── CTA ── */}
      <section style={{ padding: '80px 40px', textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            maxWidth: 620, margin: '0 auto',
            background: 'rgba(255,255,255,0.025)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(129,140,248,0.18)',
            borderTop: '1px solid rgba(129,140,248,0.35)',
            borderRadius: 24, padding: '56px 48px',
            boxShadow: '0 24px 72px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.08) inset',
          }}
        >
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, color: 'white', letterSpacing: '-0.025em', margin: '0 0 12px' }}>
            Start generating test cases
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.44)', margin: '0 0 36px', lineHeight: 1.65 }}>
            Sign in and upload your requirements to get a full ISO 26262 test suite in minutes.
          </p>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link to="/signin" style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              padding: '14px 36px', borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: 'white', textDecoration: 'none', fontSize: '0.9375rem', fontWeight: 600,
              boxShadow: '0 0 44px rgba(99,102,241,0.5)',
            }}>
              Get Started <ArrowRight size={17} />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '32px 40px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <img
            src="/logo-removebg-preview.png"
            alt="GuJ Tech"
            style={{ height: 28, width: 'auto', objectFit: 'contain', display: 'block', opacity: 0.75 }}
          />
        </div>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8125rem', margin: 0 }}>
          ISO 26262 Automotive Validation Platform
        </p>
      </footer>
    </div>
  );
}
