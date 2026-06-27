FROM python:3.11-slim
WORKDIR /app
# Build tools for any source-built RAG deps (e.g. chroma-hnswlib).
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
# Install runtime deps + the heavy RAG stack (torch/chromadb/sentence-transformers).
# RAG is still gated at runtime by RAG_ENABLED, but baking it in lets the worker
# do retrieval enrichment. Drop requirements-rag.txt here to ship a lean image.
COPY requirements.txt requirements-rag.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-rag.txt
COPY . .
RUN mkdir -p uploads
# Render (and most PaaS) inject the port to bind via $PORT; fall back to 8000 locally.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
