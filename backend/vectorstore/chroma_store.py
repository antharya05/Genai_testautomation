"""
ChromaDB vector store abstraction.

WHY ChromaDB:
- Embedded mode: no separate server process needed
- Persists to disk automatically (no data loss on restart)
- Full vector search with cosine similarity
- Production-ready path: swap to ChromaDB Cloud or Qdrant with minimal changes
- Apache 2.0 license: safe for commercial use

PERSISTENCE:
Data is stored in backend/vectorstore_data/ by default.
On first startup, documents are ingested and embeddings generated.
Subsequent startups load from disk — fast initialization.

ABSTRACTION:
The ChromaVectorStore class hides all ChromaDB-specific API calls.
To swap to Qdrant or Pinecone:
1. Write QdrantVectorStore implementing the same interface
2. Update retrievers/__init__.py to use the new store
Zero changes to services/rag.py or any business logic.
"""

import hashlib
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "vectorstore_data")
COLLECTION_NAME = "automotive_knowledge"


class ChromaVectorStore:
    def __init__(self, persist_dir: str = PERSIST_DIR) -> None:
        self._persist_dir = os.path.abspath(persist_dir)
        self._client = None
        self._collection = None

    def _init_client(self) -> None:
        if self._client is not None:
            return
        try:
            import chromadb
            from chromadb.config import Settings
        except ImportError as exc:
            raise RuntimeError(
                "chromadb not installed. Run: pip install chromadb"
            ) from exc

        os.makedirs(self._persist_dir, exist_ok=True)
        self._client = chromadb.PersistentClient(path=self._persist_dir)
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},  # cosine similarity search
        )
        logger.info(
            "ChromaDB initialized at %s — %d documents indexed",
            self._persist_dir,
            self._collection.count(),
        )

    def count(self) -> int:
        self._init_client()
        return self._collection.count()

    def add_documents(
        self,
        texts: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        ids: list[str],
    ) -> None:
        self._init_client()
        # Skip documents already in store (idempotent ingestion)
        existing = set(self._collection.get(ids=ids)["ids"])
        new_indices = [i for i, doc_id in enumerate(ids) if doc_id not in existing]

        if not new_indices:
            logger.info("All %d documents already indexed, skipping.", len(ids))
            return

        self._collection.add(
            embeddings=[embeddings[i] for i in new_indices],
            documents=[texts[i] for i in new_indices],
            metadatas=[metadatas[i] for i in new_indices],
            ids=[ids[i] for i in new_indices],
        )
        logger.info("Indexed %d new document chunks.", len(new_indices))

    def query(
        self,
        query_embedding: list[float],
        n_results: int = 3,
        min_score: float = 0.4,
    ) -> list[dict]:
        """
        Returns top-k results sorted by relevance.
        Each result: {text, source, score, chunk_id}
        """
        self._init_client()
        if self._collection.count() == 0:
            return []

        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, self._collection.count()),
            include=["documents", "metadatas", "distances"],
        )

        hits = []
        for doc, meta, distance in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            # ChromaDB cosine distance = 1 - cosine_similarity
            # Convert to similarity score [0, 1]
            score = 1.0 - distance
            if score >= min_score:
                hits.append({
                    "text": doc,
                    "source": meta.get("source", "unknown"),
                    "score": round(score, 4),
                    "chunk_id": meta.get("chunk_id", ""),
                })

        return sorted(hits, key=lambda x: x["score"], reverse=True)

    @staticmethod
    def make_chunk_id(source: str, chunk_index: int, text: str) -> str:
        """Stable ID for a chunk — same content always gets same ID (idempotent)."""
        payload = f"{source}::{chunk_index}::{text[:50]}"
        return hashlib.sha256(payload.encode()).hexdigest()[:16]
