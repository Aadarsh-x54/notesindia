# NotesIndia — Community Notes Sharing & Padhaku AI Learning Platform

**NotesIndia** is a production-ready, community-driven educational notes sharing platform integrated with **Padhaku AI** (*"Padhai ko smart banao."*), a local-LLM Retrieval-Augmented Generation (RAG) learning assistant.

## Visual Identity & Design System
- **Strict Monochromatic Palette**: Dark grey primary canvas (`#161616`), layered charcoal surfaces (`#1E1E1E`, `#262626`), **Pure AMOLED Black (`#000000`)** notes cards and category boxes, crisp white (`#FFFFFF`) typography, and subtle grey borders (`#2E2E2E`).
- **Typography**: **Roboto** throughout the entire application.
- **Zero Visual Clutter**: No default gradients, no glassmorphism, no excessive shadows.
- **Color-Coded Category Identification**: Category boxes and note category badges remain strictly black/monochrome with a **thin colored accent line** uniquely identifying each category (e.g., SSC Blue, Banking Green, Railway Orange, Programming Purple, Java Orange, Python Yellow, Mathematics Cyan, Engineering Red).

## Key Features
- **Unfiltered Chronological Homepage Feed**: Every recently uploaded note appears in reverse chronological order (`newest first`), with no default filters or opaque ranking algorithms.
- **Dynamic Multi-Category System**: Categories are never permanently hardcoded. Users can select multiple existing categories/subcategories or dynamically create new ones during upload with real-time normalization and fuzzy duplicate detection. Notes and categories use a many-to-many relationship (`note_categories`) — zero note duplication.
- **Global Search**: Debounced, indexed search across titles, descriptions, subjects, exams, programming languages, institutions, authors, and categories.
- **Padhaku AI (Local LLM + RAG)**:
  - Runs open-source LLMs locally via **Ollama** (`qwen3:8b`, `llama3.1:8b`, or lightweight `qwen2.5:3b`) — swappable via `.env` without modifying Java code.
  - Searches uploaded NotesIndia study materials via **SentenceTransformers + FAISS / ChromaDB** and cites exact source notes.
  - Supports dedicated note-focused study sessions and ad-hoc PDF/DOCX/PPTX document Q&A, MCQ generation, summaries, simplification, code explanation, and revision notes with SSE streaming.
- **Full User & Admin Workflows**: JWT authentication + refresh tokens, password recovery, bookmarks, upload history, recently viewed notes, inline PDF/TXT/MD preview, download tracking, moderation reporting, and a full Admin Dashboard with **Category Growth Analytics** and **Duplicate Category Merging**.

---

## Project Structure

```
.
├── docker-compose.yml          # Full stack: Postgres, Redis, MinIO, Ollama, AI Service, Java Backend, Frontend
├── .env.example                # Environment variables template
├── database/schema.sql         # Canonical PostgreSQL relational schema
├── docs/
│   ├── ARCHITECTURE.md         # System architecture & security boundaries
│   └── API.md                  # Complete REST & SSE API reference
├── backend/                    # Java 21 + Spring Boot 3.4 + Spring Security + JPA + Flyway + S3/Local Storage
├── ai-service/                 # Python FastAPI + Ollama + PyMuPDF + SentenceTransformers + FAISS/ChromaDB
└── frontend/                   # React + TypeScript + Tailwind CSS + Vite + TanStack Query + Lucide
```

---

## Quick Start — Docker Compose (Recommended Production-Like Stack)

1. **Create `.env` from template**:
   ```bash
   cp .env.example .env
   ```
2. **Start all services**:
   ```bash
   docker compose up --build -d
   ```
3. **Pull a local LLM into Ollama** (choose based on available RAM/VRAM):
   ```bash
   # Recommended general model (~5 GB RAM/VRAM):
   docker exec -it notesindia-ollama ollama pull qwen3:8b

   # Alternative Llama 3.1:
   # docker exec -it notesindia-ollama ollama pull llama3.1:8b

   # Low-resource systems (~2 GB RAM):
   # docker exec -it notesindia-ollama ollama pull qwen2.5:3b
   ```
   *(If you switch models, update `OLLAMA_MODEL` in `.env` and restart `ai-service`.)*

4. **Open NotesIndia**:
   - Web App: `http://localhost:3000`
   - Java Backend API & Swagger Docs: `http://localhost:8080/api/docs/swagger-ui.html`
   - MinIO Object Storage Console: `http://localhost:9001`
   - Python Padhaku AI Health: `http://localhost:8000/health`

---

## Local Development (Without Docker)

### 1. Java 21 Spring Boot Backend
For instant local development without installing PostgreSQL/Redis, run the `local` profile (uses embedded H2 in PostgreSQL compatibility mode + local disk file storage + demo seed data):
```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=local
```
For PostgreSQL + Redis + MinIO locally, configure `.env` / `application.yml` and run `mvn spring-boot:run`.

### 2. Python FastAPI AI Service (Padhaku AI)
```bash
cd ai-service
python -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Make sure Ollama is running (`ollama serve`) and your configured model (`OLLAMA_MODEL=qwen3:8b`) is pulled.

### 3. React + TypeScript Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` (Vite proxies `/api` to `http://localhost:8080`).

---

## Seeded Local Demo Accounts
When `SEED_DEMO_DATA=true` (enabled by default on first boot of an empty database):
- **Admin**: `admin` / `Admin@123`
- **Student Contributor**: `aarav_sharma` / `Student@123`
- **Engineering Contributor**: `priya_verma` / `Student@123`

*(Change or disable `SEED_DEMO_DATA=false` and rotate `JWT_SECRET` and `AI_SERVICE_API_KEY` before deploying to production.)*
