import tempfile
from pathlib import Path

from app.config import Settings
from app.models.schemas import ChatRequest
from app.services.chunker import split_text
from app.services.document_extractor import extract_text_from_bytes
from app.services.embeddings import EmbeddingService
from app.services.rag_engine import PadhakuRagEngine
from app.services.vector_store import FaissVectorStore


class DummyLLM:
    @property
    def active_model(self) -> str:
        return "dummy-local-model"

    async def is_available(self) -> bool:
        return True

    async def generate(self, messages):
        return "Inheritance in Java lets a child class extend a parent class using the `extends` keyword."


def test_chunking_and_vector_retrieval():
    with tempfile.TemporaryDirectory() as tmpdir:
        embedder = EmbeddingService("non-existent-offline-model")
        embedder._tried_load = True  # Force fast deterministic offline embeddings in test
        store = FaissVectorStore(tmpdir, embedder)

        text = (
            "Java Inheritance allows a subclass to acquire fields and methods of a superclass "
            "using the extends keyword. Polymorphism supports runtime method overriding."
        )
        chunks = split_text(text, chunk_size=120, chunk_overlap=20)
        assert len(chunks) >= 1

        indexed = store.upsert_note(
            note_id="note-java-1",
            title="Java OOP Complete Notes",
            categories=["Programming", "Java"],
            chunks=chunks,
        )
        assert indexed == len(chunks)
        assert store.count_chunks() == len(chunks)

        hits = store.search("Explain inheritance in Java", top_k=3)
        assert len(hits) >= 1
        assert hits[0].note_id == "note-java-1"

        # Verify clean deletion
        store.delete_note("note-java-1")
        assert store.count_chunks() == 0


def test_extract_plain_text_and_rag_context():
    doc = extract_text_from_bytes("ssc.txt", b"SSC CGL Trigonometry: sin^2(x) + cos^2(x) = 1")
    assert "Trigonometry" in doc.text
    assert doc.page_count == 1

    with tempfile.TemporaryDirectory() as tmpdir:
        embedder = EmbeddingService("offline")
        embedder._tried_load = True
        store = FaissVectorStore(tmpdir, embedder)
        store.upsert_note("n1", "SSC Trigonometry", ["SSC", "Mathematics"], [doc.text])

        engine = PadhakuRagEngine(store, DummyLLM(), Settings())
        context, refs = engine.retrieve_context(ChatRequest(question="What is sin^2 + cos^2 in SSC?"))
        assert "SSC Trigonometry" in context
        assert len(refs) == 1
        assert refs[0].note_id == "n1"
