import { motion } from 'framer-motion';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  Shield,
  Zap,
} from 'lucide-react';
import { PageTransition } from '../../components/layout/PageTransition';

// ─── Knowledge source data ────────────────────────────────────────────────────

const SOURCES = [
  {
    id: 'iso26262',
    icon: Shield,
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.1)',
    border: 'rgba(129,140,248,0.2)',
    label: 'ISO 26262',
    subtitle: 'Functional Safety — Road Vehicles',
    status: 'active' as const,
    description: 'International standard for functional safety of electrical and electronic systems in production automobiles. Covers ASIL classification (A–D), safety life cycle, hazard analysis, and verification requirements.',
    tags: ['ASIL A–D', 'Hazard Analysis', 'Safety Goals', 'V-model', 'Functional Safety'],
    items: [
      'Part 4: Product development at the system level',
      'Part 6: Product development at the software level',
      'Part 8: Supporting processes',
      'Part 9: ASIL-oriented and safety-oriented analyses',
      'Technical Safety Concept (TSC) templates',
    ],
  },
  {
    id: 'autosar',
    icon: Activity,
    color: '#34d399',
    bg: 'rgba(52,211,153,0.1)',
    border: 'rgba(52,211,153,0.2)',
    label: 'AUTOSAR',
    subtitle: 'Automotive Open System Architecture',
    status: 'active' as const,
    description: 'Standard software architecture for automotive ECUs. Defines layered software architecture, BSW modules, and RTE specifications used in test pattern generation for component-level validation.',
    tags: ['BSW', 'RTE', 'SWC', 'ECU Abstraction', 'COM Stack'],
    items: [
      'Software Component (SWC) interface patterns',
      'Communication stack (COM/PDUR/CANIF) test patterns',
      'Diagnostic (DCM/DEM) validation rules',
      'Memory (NvM/Mem) test cases',
      'OS (OS/WdgM) timing constraints',
    ],
  },
  {
    id: 'safety-rules',
    icon: CheckCircle2,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.2)',
    label: 'Safety Validation Rules',
    subtitle: 'Automotive Safety Testing Constraints',
    status: 'active' as const,
    description: 'Curated rule set for evaluating requirement completeness and test coverage quality. Identifies missing timing constraints, ambiguous language, and incomplete safety specifications.',
    tags: ['Timing Constraints', 'Threshold Validation', 'Coverage Rules', 'Completeness'],
    items: [
      'Timing constraint completeness checks (< 10ms, cycle time)',
      'Measurable threshold validation (voltage, temperature, RPM)',
      'ASIL consistency — safety goal to requirement alignment',
      'Bidirectional traceability requirements',
      'Failure mode to test case coverage ratios',
    ],
  },
  {
    id: 'test-patterns',
    icon: FileText,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.2)',
    label: 'Automotive Test Patterns',
    subtitle: 'Domain-Specific Test Case Templates',
    status: 'active' as const,
    description: 'Reusable test case templates derived from automotive domain experience. Covers sensor input validation, actuator response verification, diagnostic event handling, and network communication tests.',
    tags: ['Boundary Testing', 'Functional Tests', 'Negative Testing', 'Regression'],
    items: [
      'Sensor range and plausibility test templates (CAN, LiDAR, radar)',
      'ECU power mode and startup/shutdown sequences',
      'Diagnostic Trouble Code (DTC) trigger and clear workflows',
      'CAN/LIN/Ethernet communication error injection',
      'HMI input validation and response timing tests',
    ],
  },
  {
    id: 'fault-injection',
    icon: Zap,
    color: '#f87171',
    bg: 'rgba(248,113,113,0.1)',
    border: 'rgba(248,113,113,0.2)',
    label: 'Fault Injection Patterns',
    subtitle: 'Robustness & Failure Mode Testing',
    status: 'active' as const,
    description: 'Patterns for systematically injecting hardware and software faults to verify system resilience. Essential for ASIL-C/D components requiring fault detection and safe-state transition verification.',
    tags: ['Fault Injection', 'FMEA', 'Recovery Testing', 'Safe State', 'Watchdog'],
    items: [
      'Signal corruption and out-of-range injection templates',
      'Communication timeout and message loss scenarios',
      'Power supply variation and voltage spike tests',
      'Memory bit-flip and stack overflow fault patterns',
      'Watchdog reset and safe-state transition verification',
    ],
  },
];

const STATUS_STYLE = {
  active: {
    label: 'Active',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.22)',
  },
};

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({
  source,
  index,
}: {
  source: typeof SOURCES[number];
  index: number;
}) {
  const st = STATUS_STYLE[source.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      style={{
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 14,
        padding: '20px 22px',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = source.color + '50'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: source.bg, border: `1px solid ${source.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <source.icon size={18} color={source.color} strokeWidth={1.75} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.01em' }}>
              {source.label}
            </span>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 5,
              background: st.bg, border: `1px solid ${st.border}`, color: st.color,
              letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
            }}>
              {st.label}
            </span>
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-3)', marginTop: 2 }}>
            {source.subtitle}
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{
        fontSize: '0.8125rem', color: 'var(--c-text-2)', margin: '0 0 14px',
        lineHeight: 1.6,
      }}>
        {source.description}
      </p>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
        {source.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <ChevronRight size={12} color={source.color} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--c-text-2)', lineHeight: 1.5 }}>{item}</span>
          </div>
        ))}
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {source.tags.map(tag => (
          <span key={tag} style={{
            fontSize: '0.6875rem', padding: '3px 8px', borderRadius: 5,
            background: source.bg, border: `1px solid ${source.border}`,
            color: source.color, fontWeight: 500,
          }}>
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  return (
    <PageTransition>
      <div style={{ padding: '28px 32px 64px', maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={17} color="#f59e0b" strokeWidth={1.75} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', margin: 0 }}>
              Knowledge Sources
            </h1>
          </div>
        </div>
        <p style={{ color: 'var(--c-text-3)', fontSize: '0.8125rem', margin: '0 0 24px 44px' }}>
          Standards, rules, and patterns used during test case generation and validation
        </p>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 20,
            padding: '12px 18px', borderRadius: 10,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            marginBottom: 20, flexWrap: 'wrap',
          }}
        >
          {[
            { label: 'Active Sources', value: SOURCES.length, color: '#10b981' },
            { label: 'ISO Standards', value: 2, color: '#818cf8' },
            { label: 'Test Pattern Libraries', value: 2, color: '#f59e0b' },
            { label: 'Validation Rulesets', value: 1, color: '#34d399' },
          ].map(stat => (
            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: '1rem', fontWeight: 800, color: stat.color,
                lineHeight: 1, letterSpacing: '-0.02em',
              }}>
                {stat.value}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--c-text-3)' }}>{stat.label}</span>
              <span style={{ width: 1, height: 16, background: 'var(--c-border)', marginLeft: 8 }} />
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--c-text-3)' }}>All sources active</span>
          </div>
        </motion.div>

        {/* Source cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {SOURCES.map((source, i) => (
            <SourceCard key={source.id} source={source} index={i} />
          ))}
        </div>

        {/* Footer note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            marginTop: 20, padding: '12px 18px', borderRadius: 10,
            background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
            fontSize: '0.8125rem', color: 'var(--c-text-3)', lineHeight: 1.6,
          }}
        >
          These knowledge sources are applied automatically during generation and validation. Test case quality,
          ASIL classification, and requirement gap detection are all informed by these standards and patterns.
        </motion.div>
      </div>
    </PageTransition>
  );
}
