"""
Embedding abstraction using sentence-transformers.

WHY BAAI/bge-small-en-v1.5:
- State-of-the-art retrieval performance on BEIR benchmark
- Small (135MB) — fast startup, fits in memory
- Optimized for asymmetric retrieval (short query vs. long document)
- Outperforms OpenAI ada-002 on many benchmarks at fraction of cost
- Runs entirely locally — no API calls, no data leaves your infrastructure

ABSTRACTION DESIGN:
The EmbeddingModel class is a thin wrapper. To swap to a different model
(e.g., sentence-transformers/all-mpnet-base-v2 or OpenAI embeddings),
implement a new class with the same interface. The vectorstore and retriever
never know which embedding model is in use.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_MODEL_NAME = "BAAI/bge-small-en-v1.5"


class EmbeddingModel:
    """Lazy-loaded sentence-transformer embedding model."""

    def __init__(self, model_name: str = _MODEL_NAME) -> None:
        self._model_name = model_name
        self._model = None  # loaded on first use

    def _load(self) -> None:
        if self._model is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading embedding model %s (first run may download ~135MB)...", self._model_name)
            self._model = SentenceTransformer(self._model_name)
            logger.info("Embedding model loaded.")
        except ImportError as exc:
            raise RuntimeError(
                "sentence-transformers not installed. Run: pip install sentence-transformers"
            ) from exc

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts, returning a list of float vectors."""
        self._load()
        # BAAI/bge models work best with query prefix for retrieval
        embeddings = self._model.encode(texts, normalize_embeddings=True)
        return embeddings.tolist()

    def embed_query(self, query: str) -> list[float]:
        """Embed a single query string with the retrieval-optimized prefix."""
        self._load()
        # BGE-specific: prefix queries with "Represent this sentence for retrieval:"
        prefixed = f"Represent this sentence for retrieval: {query}"
        embedding = self._model.encode([prefixed], normalize_embeddings=True)
        return embedding[0].tolist()

    @property
    def model_name(self) -> str:
        return self._model_name


# Module-level singleton — one model instance per process
_default_model: Optional[EmbeddingModel] = None


def get_embedding_model() -> EmbeddingModel:
    global _default_model
    if _default_model is None:
        _default_model = EmbeddingModel()
    return _default_model
