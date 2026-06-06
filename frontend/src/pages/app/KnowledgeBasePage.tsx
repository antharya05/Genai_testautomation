import { BookOpen } from 'lucide-react';
import { PageTransition } from '../../components/layout/PageTransition';
import { PlaceholderCard } from './TraceabilityPage';

const PLANNED = [
  'Browse ISO 26262 knowledge base documents',
  'View RAG-indexed test patterns and examples',
  'Upload custom knowledge documents',
  'See which KB entries informed a test case',
  'Manage embedding refresh and indexing',
  'Search across knowledge base content',
];

export default function KnowledgeBasePage() {
  return (
    <PageTransition>
      <div style={{ padding: '36px 40px', maxWidth: 1280 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={17} color="#f59e0b" strokeWidth={1.75} />
          </div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', margin: 0 }}>
            Knowledge Base
          </h1>
        </div>
        <p style={{ color: 'var(--c-text-2)', fontSize: '0.875rem', margin: '0 0 32px' }}>
          ISO 26262 patterns and automotive testing knowledge used by the RAG pipeline
        </p>

        <PlaceholderCard
          icon={BookOpen}
          iconColor="#f59e0b"
          iconBg="rgba(245,158,11,0.1)"
          iconBorder="rgba(245,158,11,0.2)"
          title="Knowledge Base Explorer"
          description="Browse and manage the automotive testing knowledge documents that power the RAG retrieval pipeline."
          planned={PLANNED}
        />
      </div>
    </PageTransition>
  );
}
