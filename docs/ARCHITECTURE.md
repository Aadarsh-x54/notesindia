# NotesIndia — System Architecture

## High-Level Topology

```
Frontend (React + TypeScript + Tailwind CSS + Vite)
        │  HTTPS / REST + SSE Streaming (JWT Bearer Auth)
        ▼
Java 21 Spring Boot Main Backend (Central Security & Business Authority)
  ├── PostgreSQL 16 (Normalized Relational Schema + Flyway Migrations)
  ├── Redis 7 (Caching & Distributed Rate Limiting Ready)
  ├── S3-Compatible Object Storage (MinIO / AWS S3 / Local Dev Storage)
  └── Internal Authenticated REST + SSE Client (X-AI-Service-Key)
        │
        ▼
Python FastAPI AI Service — Padhaku AI ("Padhai ko smart banao.")
  ├── Document Extractors (PyMuPDF, python-docx, python-pptx, UTF-8)
  ├── Chunker & SentenceTransformers Embeddings
  ├── Persistent Vector Store (FAISS or ChromaDB)
  └── Configurable Local LLM Provider (Ollama: Qwen 3 / Llama 3.1 / Qwen 2.5)
```

## Core Architectural Principles

1. **Java as the Single Authority**
   - Spring Boot + Spring Security manages all user accounts, BCrypt password hashes, JWT access/refresh tokens, RBAC (`USER`, `MODERATOR`, `ADMIN`), notes metadata, multi-category graph, bookmarks, downloads, moderation reports, and rate limits.
   - The Python AI service never talks to PostgreSQL directly and cannot bypass Java authorization. Every request to Python requires a shared internal secret header (`X-AI-Service-Key`), which is never exposed to the browser.

2. **Chronological, Unfiltered Homepage Feed**
   - `GET /api/notes` queries `notes` filtered strictly by `status = 'PUBLISHED'` ordered by `created_at DESC` using the composite index `idx_notes_status_created_at`.
   - No default category filtering, no popularity ranking, and no opaque personalization algorithms.

3. **Dynamic Multi-Category System (Zero Note Duplication)**
   - Notes and Categories are connected via a canonical many-to-many junction table (`note_categories`).
   - One uploaded note can simultaneously belong to `SSC`, `SSC CGL`, `SSC CHSL`, `Mathematics`, and `Quantitative Aptitude` while stored once in `notes` and once in object storage.
   - Category normalization (`CategoryNormalizer`) trims whitespace, normalizes slugs, and performs Levenshtein edit-distance duplicate checks (`GET /api/categories/check-duplicate`) before users create new categories during upload.
   - Admins can merge duplicate categories (`POST /api/admin/categories/merge`), atomically re-linking affected notes and child categories without duplicating notes.

4. **Object Storage Separation**
   - Large binary documents (PDF, DOCX, PPTX, TXT, MD) are never stored inside PostgreSQL.
   - `StorageService` abstracts local filesystem storage (`STORAGE_PROVIDER=local`) and S3-compatible object storage (`STORAGE_PROVIDER=s3` for MinIO or AWS S3).
   - `FileValidator` verifies extension allowlists, MIME types, file size caps (50 MB), PDF/OOXML magic bytes, SHA-256 duplicate detection, and invokes the pluggable `MalwareScanner` hook.

5. **Padhaku AI — Model-Agnostic Local RAG**
   - On upload, `NoteIndexingService` asynchronously sends the document to the Python AI service (`POST /api/ai/ingest`), which extracts text via PyMuPDF / python-docx / python-pptx, splits chunks, computes SentenceTransformer embeddings, and persists them in FAISS (or ChromaDB).
   - Changing the local LLM (`qwen3:8b`, `llama3.1:8b`, `qwen2.5:3b`) requires only changing `OLLAMA_MODEL` in `.env` — zero Java or frontend code changes.
   - Streaming responses flow via Server-Sent Events (SSE) from Ollama → FastAPI → Spring Boot (`SseEmitter`) → React UI, persisting full conversation history and note citations in PostgreSQL.
