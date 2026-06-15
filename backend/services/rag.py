"""
RAG Pipeline Orchestrator.

ARCHITECTURE:
This module owns the full RAG lifecycle:
1. Initialization: load knowledge base, chunk docs, embed, index in ChromaDB
2. Retrieval: for any requirement, retrieve relevant engineering context
3. Prompt enrichment: inject context into the generation prompt

CHUNKING STRATEGY:
Documents are split at paragraph boundaries (double newline).
Chunks are filtered to minimum 50 characters.
Each chunk stores its source filename for attribution.

This means: if we retrieve a chunk from fault_injection.md, the generated
test case knows it was influenced by fault injection engineering knowledge,
and we can attribute that in the audit trail (rag_chunks field on TestCase).

INITIALIZATION TIMING:
Called once during FastAPI lifespan startup. The first call downloads the
embedding model (~135MB) and builds the vector index. Subsequent calls
(server restarts) load from ChromaDB's persistent disk storage (~1-2s).
"""

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).parent.parent / "knowledge"
CHUNK_MIN_LEN = 50


def rag_enabled() -> bool:
    """RAG is opt-out via env var (default on for local dev).

    Set RAG_ENABLED=false on resource-constrained hosts (e.g. Render free tier)
    so the heavy chromadb/sentence-transformers/torch stack is never imported,
    instantiated, or downloaded. Mirrors the PROVIDER env-var toggle pattern.
    """
    return os.getenv("RAG_ENABLED", "true").strip().lower() not in ("false", "0", "no")


def _load_and_chunk(knowledge_dir: Path) -> list[dict]:
    """Load all .md files, split into paragraph chunks, return list of chunk dicts."""
    from vectorstore.chroma_store import ChromaVectorStore

    chunks = []
    for md_file in sorted(knowledge_dir.glob("*.md")):
        try:
            text = md_file.read_text(encoding="utf-8")
        except Exception as exc:
            logger.warning("Could not read %s: %s", md_file, exc)
            continue

        source = md_file.name
        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) >= CHUNK_MIN_LEN]

        for i, paragraph in enumerate(paragraphs):
            chunk_id = ChromaVectorStore.make_chunk_id(source, i, paragraph)
            chunks.append({
                "id": chunk_id,
                "text": paragraph,
                "source": source,
                "chunk_index": i,
            })

    logger.info("Loaded %d chunks from %d knowledge files", len(chunks), len(list(knowledge_dir.glob("*.md"))))
    return chunks


class RAGPipeline:
    """Singleton RAG pipeline. Initialize once at startup, use throughout app lifetime."""

    def __init__(self) -> None:
        # Heavy objects are created lazily in initialize() so that importing this
        # module never pulls in chromadb / sentence-transformers / torch. When
        # RAG_ENABLED=false these stay None and the pipeline is a no-op.
        self._store = None
        self._embedder = None
        self._retriever = None
        self._ready = False

    async def initialize(self) -> None:
        """
        Build the vector index from the knowledge base.
        Idempotent: safe to call multiple times (skips already-indexed chunks).
        Called in FastAPI lifespan startup hook.
        """
        if self._ready:
            return

        if not rag_enabled():
            logger.info("RAG disabled (RAG_ENABLED=false) — skipping pipeline init.")
            return

        # Lazy imports: only required when RAG is actually enabled.
        from embeddings.sentence_transformer import get_embedding_model
        from vectorstore.chroma_store import ChromaVectorStore
        from retrievers.chroma_retriever import ChromaRetriever

        import asyncio
        loop = asyncio.get_event_loop()

        try:
            self._store = ChromaVectorStore()

            # Load embedding model (may download on first run)
            self._embedder = get_embedding_model()

            # Load and chunk knowledge documents
            chunks = await loop.run_in_executor(None, lambda: _load_and_chunk(KNOWLEDGE_DIR))

            if not chunks:
                logger.warning("No knowledge chunks found in %s — RAG disabled", KNOWLEDGE_DIR)
                self._ready = True
                return

            # Generate embeddings for all chunks
            texts = [c["text"] for c in chunks]
            embeddings = await loop.run_in_executor(
                None, lambda: self._embedder.embed(texts)
            )

            # Index in ChromaDB
            self._store.add_documents(
                texts=texts,
                embeddings=embeddings,
                metadatas=[{"source": c["source"], "chunk_id": c["id"]} for c in chunks],
                ids=[c["id"] for c in chunks],
            )

            # Build retriever
            self._retriever = ChromaRetriever(
                store=self._store,
                embedding_model=self._embedder,
                top_k=3,
                min_score=0.40,
            )

            self._ready = True
            logger.info(
                "RAG pipeline ready — %d chunks indexed in ChromaDB",
                self._store.count(),
            )
        except Exception as exc:
            logger.error("RAG initialization failed (will run without RAG): %s", exc)
            self._ready = True  # Mark ready to avoid blocking startup

    def retrieve(self, requirement: str) -> list[dict]:
        """Retrieve relevant knowledge chunks for a requirement. Returns [] if RAG unavailable."""
        if not self._ready or self._retriever is None:
            return []
        try:
            return self._retriever.retrieve(requirement)
        except Exception as exc:
            logger.warning("RAG retrieval failed: %s", exc)
            return []

    def build_enriched_prompt(self, requirement: str) -> tuple[str, list[dict]]:
        """
        Build an enriched user message with retrieved context injected.
        Returns (enriched_message, retrieved_chunks).

        The retrieved_chunks are stored in the TestCase for auditability.
        """
        chunks = self.retrieve(requirement)

        if not chunks:
            return (
                f"Generate test cases for this automotive requirement:\n\n{requirement}",
                [],
            )

        context = self._retriever.format_context(chunks)
        enriched = (
            f"Generate test cases for this automotive requirement:\n\n"
            f"{requirement}\n\n"
            f"{'─' * 60}\n"
            f"{context}\n"
            f"{'─' * 60}\n\n"
            f"Using the requirement and engineering knowledge above, generate "
            f"comprehensive, precise, and standards-compliant test cases."
        )
        return enriched, chunks

    @property
    def is_ready(self) -> bool:
        return self._ready


# Module-level singleton
rag_pipeline = RAGPipeline()
