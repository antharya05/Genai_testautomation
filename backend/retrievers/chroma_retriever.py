"""
Semantic retriever using ChromaDB + sentence-transformers.

RETRIEVAL FLOW:
1. Embed the query (requirement text) using BGE model
2. Search ChromaDB for top-k most similar chunks (cosine similarity)
3. Filter by minimum similarity score
4. Return ranked results with source attribution

WHY TOP-K = 3:
LLM context windows are limited. More context = more tokens = higher cost + slower.
3 chunks at ~200 tokens each = ~600 tokens of context — enough to be meaningful,
small enough not to dominate the prompt or cause context confusion.

WHY COSINE SIMILARITY:
Measures the angle between vectors, not magnitude. Normalized embeddings
(which BGE provides) make cosine similarity robust to document length differences.
A short safety rule and a long FMEA document can both match at the right score.
"""

import logging
from vectorstore.chroma_store import ChromaVectorStore
from embeddings.sentence_transformer import EmbeddingModel

logger = logging.getLogger(__name__)


class ChromaRetriever:
    def __init__(
        self,
        store: ChromaVectorStore,
        embedding_model: EmbeddingModel,
        top_k: int = 3,
        min_score: float = 0.4,
    ) -> None:
        self._store = store
        self._embedder = embedding_model
        self._top_k = top_k
        self._min_score = min_score

    def retrieve(self, query: str) -> list[dict]:
        """
        Retrieve top-k relevant knowledge chunks for a requirement.
        Returns list of {text, source, score, chunk_id}.
        """
        if self._store.count() == 0:
            logger.warning("Vector store is empty — RAG context unavailable")
            return []

        query_embedding = self._embedder.embed_query(query)
        results = self._store.query(
            query_embedding=query_embedding,
            n_results=self._top_k,
            min_score=self._min_score,
        )

        logger.info(
            "RAG: query='%s...' → %d chunks retrieved (top score=%.3f)",
            query[:40],
            len(results),
            results[0]["score"] if results else 0.0,
        )
        return results

    def format_context(self, chunks: list[dict]) -> str:
        """Format retrieved chunks for prompt injection."""
        if not chunks:
            return ""

        parts = ["Relevant Engineering Knowledge:"]
        for chunk in chunks:
            source = chunk["source"]
            score = chunk["score"]
            text = chunk["text"].strip()
            parts.append(f"\n[Source: {source} | Relevance: {score:.2f}]\n{text}")

        return "\n".join(parts)
