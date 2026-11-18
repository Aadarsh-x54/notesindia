from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import AsyncIterator, Dict, List

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main as ai_main
from app.config import Settings
from app.models.schemas import ChatRequest
from app.services.chunker import split_pages
from app.services.document_extractor import extract_text_from_bytes
from app.services.embeddings import EmbeddingService
from app.services.llm_provider import (
    BaseLLMProvider,
    LLMHealthStatus,
    LLMModelNotFoundError,
    LLMTimeoutError,
    LLMUnavailableError,
    OllamaLLMProvider,
)
from app.services.rag_engine import PadhakuRagEngine
from app.services.vector_store import FaissVectorStore


def build_multipage_pdf(pages_text: List[str]) -> bytes:
    """Builds a valid multi-page PDF 1.4 document with Helvetica text streams (no external deps)."""
    def escape_pdf(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    objects: List[bytes] = []
    # 1: Catalog, 2: Pages, 3: Font
    num_pages = len(pages_text)
    page_obj_ids = [4 + i * 2 for i in range(num_pages)]
    kids_str = " ".join(f"{pid} 0 R" for pid in page_obj_ids)

    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(f"2 0 obj\n<< /Type /Pages /Kids [{kids_str}] /Count {num_pages} >>\nendobj\n".encode("ascii"))
    objects.append(b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")

    for i, text in enumerate(pages_text):
        page_id = 4 + i * 2
        content_id = page_id + 1
        lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
        stream_cmds = ["BT", "/F1 11 Tf", "50 760 Td", "14 TL"]
        for line in lines:
            stream_cmds.append(f"({escape_pdf(line)}) Tj T*")
        stream_cmds.append("ET")
        stream_bytes = "\n".join(stream_cmds).encode("latin-1", errors="replace")

        page_obj = (
            f"{page_id} 0 obj\n"
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>\n"
            f"endobj\n"
        ).encode("ascii")
        content_obj = (
            f"{content_id} 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("ascii")
            + stream_bytes
            + b"\nendstream\nendobj\n"
        )
        objects.append(page_obj)
        objects.append(content_obj)

    header = b"%PDF-1.4\n"
    offsets = []
    body = bytearray(header)
    for obj in objects:
        offsets.append(len(body))
        body.extend(obj)

    xref_pos = len(body)
    xref_lines = [f"xref\n0 {len(objects) + 1}\n", "0000000000 65535 f \n"]
    for off in offsets:
        xref_lines.append(f"{off:010d} 00000 n \n")
    trailer = (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    )
    body.extend("".join(xref_lines).encode("ascii"))
    body.extend(trailer.encode("ascii"))
    return bytes(body)


SAMPLE_EDUCATIONAL_PDF_PAGES = [
    (
        "Indian Constitutional Law and Polity Study Notes\n"
        "Chapter 1: Fundamental Rights in the Constitution of India.\n"
        "Article 14 guarantees Equality before law and equal protection of laws.\n"
        "Article 19 guarantees six freedoms including freedom of speech and expression.\n"
        "Article 21 protects life and personal liberty according to procedure established by law.\n"
        "Article 32 provides the Right to Constitutional Remedies and was called the heart and soul of the Constitution by Dr. B. R. Ambedkar."
    ),
    (
        "Chapter 2: Directive Principles and Parliamentary Procedure.\n"
        "Directive Principles of State Policy are contained in Part IV from Article 36 to Article 51.\n"
        "Article 40 directs the State to organize village panchayats as units of self-government.\n"
        "Article 44 directs the State to secure a Uniform Civil Code for citizens throughout India.\n"
        "A Money Bill under Article 110 can only be introduced in the Lok Sabha with prior recommendation of the President."
    ),
    (
        "Chapter 3: Constitutional Amendments and Basic Structure.\n"
        "Article 368 lays down the procedure for amending the Constitution of India.\n"
        "The 42nd Constitutional Amendment Act of 1976 added the words Socialist, Secular, and Integrity to the Preamble.\n"
        "In Kesavananda Bharati v. State of Kerala (1973), the Supreme Court established the Basic Structure Doctrine."
    ),
]


class RecordingStubLLM(BaseLLMProvider):
    def __init__(self, reply: str = "According to [Indian Polity Notes, Page 2], Article 44 covers the Uniform Civil Code.", model: str = "qwen2.5:1.5b"):
        self.reply = reply
        self._model = model
        self.recorded_messages: List[List[Dict[str, str]]] = []
        self.healthy = True
        self.model_present = True
        self.fail_with: Exception | None = None

    @property
    def active_model(self) -> str:
        return self._model

    async def check_health(self) -> LLMHealthStatus:
        return LLMHealthStatus(
            server_reachable=self.healthy,
            model_available=self.model_present,
            available_models=[self._model] if self.model_present else [],
            detail="ready" if (self.healthy and self.model_present) else "degraded",
        )

    async def is_available(self) -> bool:
        return self.healthy and self.model_present

    async def generate(self, messages: List[Dict[str, str]]) -> str:
        self.recorded_messages.append(messages)
        if self.fail_with:
            raise self.fail_with
        return self.reply

    async def stream_generate(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:
        self.recorded_messages.append(messages)
        if self.fail_with:
            raise self.fail_with
        for word in self.reply.split(" "):
            yield word + " "


@pytest.fixture
def isolated_app(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        embedder = EmbeddingService("offline-test")
        embedder._tried_load = True
        embedder._backend = "hash-fallback"

        store = FaissVectorStore(tmpdir, embedder)
        stub_llm = RecordingStubLLM()
        cfg = Settings(
            ai_service_api_key="test-internal-key",
            ollama_model="qwen2.5:1.5b",
            vector_store_dir=tmpdir,
            rag_min_score=0.05,
        )
        engine = PadhakuRagEngine(vector_store=store, llm_provider=stub_llm, cfg=cfg)

        monkeypatch.setattr(ai_main, "settings", cfg)
        monkeypatch.setattr("app.security.settings", cfg)
        monkeypatch.setattr(ai_main, "embedder", embedder)
        monkeypatch.setattr(ai_main, "vector_store", store)
        monkeypatch.setattr(ai_main, "llm_provider", stub_llm)
        monkeypatch.setattr(ai_main, "rag_engine", engine)

        client = TestClient(ai_main.app)
        yield client, store, stub_llm, tmpdir


def test_health_check_states(isolated_app):
    client, _, stub_llm, _ = isolated_app

    # 1. Healthy when both Ollama and model are available
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["ollama_available"] is True
    assert body["model_available"] is True
    assert body["active_model"] == "qwen2.5:1.5b"

    # 2. Degraded when Ollama is reachable but configured model is NOT pulled
    stub_llm.model_present = False
    resp2 = client.get("/health")
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["status"] == "degraded"
    assert body2["ollama_available"] is True
    assert body2["model_available"] is False


def test_internal_api_key_authentication(isolated_app):
    client, _, _, _ = isolated_app

    # Missing key -> 401
    assert client.post("/api/ai/chat", json={"question": "Hello"}).status_code == 401
    assert client.post("/api/ai/chat/stream", json={"question": "Hello"}).status_code == 401
    assert client.post("/api/ai/retrieve", json={"query": "Article 32"}).status_code == 401
    assert client.delete("/api/ai/ingest/note-1").status_code == 401

    # Wrong key -> 401
    bad_headers = {"X-AI-Service-Key": "wrong-secret"}
    assert client.post("/api/ai/chat", json={"question": "Hello"}, headers=bad_headers).status_code == 401


def test_multipage_pdf_ingestion_persistence_and_page_retrieval(isolated_app):
    client, store, _, tmpdir = isolated_app
    headers = {"X-AI-Service-Key": "test-internal-key"}
    pdf_bytes = build_multipage_pdf(SAMPLE_EDUCATIONAL_PDF_PAGES)

    # 1. Ingest multi-page PDF via HTTP endpoint
    resp = client.post(
        "/api/ai/ingest",
        headers=headers,
        data={
            "note_id": "note-polity-1",
            "title": "Indian Polity Study Notes",
            "description": "UPSC and SSC Indian Constitution revision notes",
            "categories": "UPSC,Polity,SSC",
            "file_format": "PDF",
        },
        files={"file": ("indian-polity.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["page_count"] == 3
    assert body["chunks_indexed"] >= 3
    assert body["char_count"] > 300

    # 2. Verify metadata & vector persistence on disk (and reload in fresh store instance)
    assert (Path(tmpdir) / "chunks.json").exists()
    assert (Path(tmpdir) / "vectors.npy").exists()
    reloaded = FaissVectorStore(tmpdir, store.embedder)
    assert reloaded.count_chunks() == body["chunks_indexed"]
    stored_pages = sorted({c.page_number for c in reloaded.get_note_chunks("note-polity-1")})
    assert stored_pages == [1, 2, 3]

    # 3. Verify retrieval hits exact page for Page 2 content (Article 44 Uniform Civil Code)
    ret_resp = client.post(
        "/api/ai/retrieve",
        headers=headers,
        json={"query": "Uniform Civil Code Article 44 Money Bill", "top_k": 3},
    )
    assert ret_resp.status_code == 200
    hits = ret_resp.json()["hits"]
    assert len(hits) >= 1
    assert hits[0]["note_id"] == "note-polity-1"
    assert hits[0]["page_number"] == 2
    assert "Uniform Civil Code" in hits[0]["text"]

    # 4. Verify retrieval hits exact page for Page 3 content (Kesavananda Bharati / Basic Structure)
    ret_p3 = client.post(
        "/api/ai/retrieve",
        headers=headers,
        json={"query": "Kesavananda Bharati Basic Structure Doctrine Article 368", "top_k": 3},
    )
    assert ret_p3.status_code == 200
    p3_hits = ret_p3.json()["hits"]
    assert len(p3_hits) >= 1
    assert p3_hits[0]["page_number"] == 3


def test_permission_enforcement_blocks_restricted_documents(isolated_app):
    client, _, stub_llm, _ = isolated_app
    headers = {"X-AI-Service-Key": "test-internal-key"}

    public_pdf = build_multipage_pdf(["Public Chemistry Notes: Water boils at 100 degrees Celsius at standard pressure."])
    restricted_pdf = build_multipage_pdf(["TOP SECRET RESTRICTED EXAM KEY: Secret password is ALPHA-999-OMEGA."])

    client.post(
        "/api/ai/ingest",
        headers=headers,
        data={"note_id": "public-note", "title": "Public Chemistry", "categories": "Science", "file_format": "PDF"},
        files={"file": ("public.pdf", public_pdf, "application/pdf")},
    )
    client.post(
        "/api/ai/ingest",
        headers=headers,
        data={"note_id": "restricted-note", "title": "Restricted Secret Note", "categories": "Private", "file_format": "PDF"},
        files={"file": ("secret.pdf", restricted_pdf, "application/pdf")},
    )

    # When Java passes allowed_note_ids=["public-note"], restricted-note MUST NOT be retrieved
    ret = client.post(
        "/api/ai/retrieve",
        headers=headers,
        json={
            "query": "What is the secret password ALPHA-999-OMEGA?",
            "allowed_note_ids": ["public-note"],
        },
    )
    assert ret.status_code == 200
    hits = ret.json()["hits"]
    assert all(h["note_id"] != "restricted-note" for h in hits)

    # Even if a caller requests focused_note_id="restricted-note", allowed_note_ids overrides and returns []
    ret_focused = client.post(
        "/api/ai/retrieve",
        headers=headers,
        json={
            "query": "secret password ALPHA-999-OMEGA",
            "focused_note_id": "restricted-note",
            "allowed_note_ids": ["public-note"],
        },
    )
    assert ret_focused.status_code == 200
    assert ret_focused.json()["hits"] == []

    # Empty allowed_note_ids=[] must return zero chunks
    ret_empty = client.post(
        "/api/ai/retrieve",
        headers=headers,
        json={"query": "Water boils at 100", "allowed_note_ids": []},
    )
    assert ret_empty.status_code == 200
    assert ret_empty.json()["hits"] == []

    # Chat endpoint must also never pass restricted-note content to the LLM
    chat_resp = client.post(
        "/api/ai/chat",
        headers=headers,
        json={
            "question": "Tell me the secret password ALPHA-999-OMEGA",
            "allowed_note_ids": ["public-note"],
        },
    )
    assert chat_resp.status_code == 200
    assert all(r["note_id"] != "restricted-note" for r in chat_resp.json()["referenced_notes"])
    last_system_msg = stub_llm.recorded_messages[-1][0]["content"]
    assert "TOP SECRET RESTRICTED EXAM KEY" not in last_system_msg
    assert "TOP SECRET RESTRICTED EXAM KEY" not in stub_llm.recorded_messages[-1][-1]["content"]


def test_rag_chat_and_sse_streaming_with_history(isolated_app):
    client, _, stub_llm, _ = isolated_app
    headers = {"X-AI-Service-Key": "test-internal-key"}
    pdf_bytes = build_multipage_pdf(SAMPLE_EDUCATIONAL_PDF_PAGES)

    client.post(
        "/api/ai/ingest",
        headers=headers,
        data={
            "note_id": "note-polity-sse",
            "title": "Indian Polity Notes",
            "categories": "UPSC,Polity",
            "file_format": "PDF",
        },
        files={"file": ("polity.pdf", pdf_bytes, "application/pdf")},
    )

    # Non-streaming RAG chat with conversation history
    chat_resp = client.post(
        "/api/ai/chat",
        headers=headers,
        json={
            "question": "Which article mentions the Uniform Civil Code?",
            "mode": "GENERAL",
            "allowed_note_ids": ["note-polity-sse"],
            "history": [
                {"role": "user", "content": "I am preparing for UPSC Polity."},
                {"role": "assistant", "content": "Great! Ask me anything from your Polity notes."},
            ],
        },
    )
    assert chat_resp.status_code == 200
    data = chat_resp.json()
    assert data["model_used"] == "qwen2.5:1.5b"
    assert len(data["referenced_notes"]) == 1
    assert data["referenced_notes"][0]["note_id"] == "note-polity-sse"
    assert 2 in data["referenced_notes"][0]["page_numbers"]

    # Verify LLM actually received the retrieved context + page number + conversation history
    sent_messages = stub_llm.recorded_messages[-1]
    combined_prompt = "\n".join(m["content"] for m in sent_messages)
    assert "Page 2" in combined_prompt
    assert "Uniform Civil Code" in combined_prompt
    assert any(m["content"] == "I am preparing for UPSC Polity." for m in sent_messages)

    # SSE Streaming verification
    events = []
    with client.stream(
        "POST",
        "/api/ai/chat/stream",
        headers=headers,
        json={
            "question": "Which article mentions Uniform Civil Code?",
            "allowed_note_ids": ["note-polity-sse"],
        },
    ) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        for line in resp.iter_lines():
            if line.startswith("data:"):
                payload = line[5:].strip()
                if payload == "[DONE]":
                    events.append({"type": "eof"})
                else:
                    events.append(json.loads(payload))

    types = [e["type"] for e in events]
    assert "references" in types
    assert "token" in types
    assert "done" in types
    assert "eof" in types
    ref_event = next(e for e in events if e["type"] == "references")
    assert ref_event["referenced_notes"][0]["note_id"] == "note-polity-sse"
    assert 2 in ref_event["referenced_notes"][0]["page_numbers"]


def test_llm_timeout_and_model_missing_handling(isolated_app):
    client, _, stub_llm, _ = isolated_app
    headers = {"X-AI-Service-Key": "test-internal-key"}

    stub_llm.fail_with = LLMModelNotFoundError("Ollama model 'qwen2.5:1.5b' is not installed.")
    r1 = client.post("/api/ai/chat", headers=headers, json={"question": "Test missing model"})
    assert r1.status_code == 200
    assert "(model-missing)" in r1.json()["model_used"]
    assert "not installed" in r1.json()["answer"]

    stub_llm.fail_with = LLMTimeoutError("Ollama inference timed out after 180s")
    r2 = client.post("/api/ai/chat", headers=headers, json={"question": "Test timeout"})
    assert r2.status_code == 200
    assert "(timeout)" in r2.json()["model_used"]
    assert "timed out" in r2.json()["answer"]

    stub_llm.fail_with = LLMUnavailableError("Cannot connect to Ollama")
    r3 = client.post("/api/ai/chat", headers=headers, json={"question": "Test offline"})
    assert r3.status_code == 200
    assert "(offline-rag-fallback)" in r3.json()["model_used"]


def test_live_ollama_rag_end_to_end():
    """
    Runs real end-to-end RAG verification against local Ollama when Ollama and the
    configured Qwen model are running locally. Skips cleanly if Ollama is not running.
    """
    import asyncio

    asyncio.run(_run_live_ollama_rag_end_to_end())


async def _run_live_ollama_rag_end_to_end():
    ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model = os.environ.get("OLLAMA_MODEL", "qwen2.5:1.5b")
    provider = OllamaLLMProvider(base_url=ollama_url, model=ollama_model, read_timeout=180.0)
    health = await provider.check_health()
    if not (health.server_reachable and health.model_available):
        pytest.skip(f"Live Ollama test skipped: {health.detail}")

    with tempfile.TemporaryDirectory() as tmpdir:
        embedder = EmbeddingService(os.environ.get("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"))
        store = FaissVectorStore(tmpdir, embedder)
        cfg = Settings(ollama_base_url=ollama_url, ollama_model=ollama_model, vector_store_dir=tmpdir, rag_min_score=0.20)
        engine = PadhakuRagEngine(vector_store=store, llm_provider=provider, cfg=cfg)

        pdf_bytes = build_multipage_pdf(SAMPLE_EDUCATIONAL_PDF_PAGES)
        extracted = extract_text_from_bytes("indian-polity.pdf", pdf_bytes, "pdf")
        assert extracted.page_count == 3

        chunks = split_pages(extracted.pages, chunk_size=500, chunk_overlap=80, title="Indian Polity Study Notes")
        count = store.upsert_note("live-polity", "Indian Polity Study Notes", ["UPSC", "Polity"], chunks)
        assert count >= 3

        # 1. Grounded question whose answer is on Page 2
        ans1, refs1, model1 = await engine.answer(
            ChatRequest(
                question="According to Indian Polity Study Notes, which article deals with the Uniform Civil Code and which page is it on?",
                focused_note_id="live-polity",
                focused_note_title="Indian Polity Study Notes",
                allowed_note_ids=["live-polity"],
            )
        )
        assert model1 == ollama_model
        assert "44" in ans1
        assert len(refs1) == 1
        assert 2 in refs1[0].page_numbers

        # 2. Out-of-document question — model must admit the document does not contain the answer
        ans2, _, model2 = await engine.answer(
            ChatRequest(
                question="According to Indian Polity Study Notes, what is the boiling point of liquid nitrogen in Kelvin?",
                focused_note_id="live-polity",
                focused_note_title="Indian Polity Study Notes",
                allowed_note_ids=["live-polity"],
            )
        )
        assert model2 == ollama_model
        lower_ans2 = ans2.lower()
        assert any(
            phrase in lower_ans2
            for phrase in ("do not contain", "does not contain", "not mentioned", "no information", "not provided", "not found")
        ), f"Expected model to admit missing info, got: {ans2}"
