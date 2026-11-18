from __future__ import annotations

import json
import logging
from typing import AsyncIterator

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    ExtractResponse,
    HealthResponse,
    IngestResponse,
    RetrieveRequest,
    RetrieveResponse,
    RetrievedChunkItem,
)
from app.security import verify_internal_api_key
from app.services.chunker import split_pages
from app.services.document_extractor import extract_text_from_bytes
from app.services.embeddings import EmbeddingService
from app.services.llm_provider import create_llm_provider
from app.services.rag_engine import PadhakuRagEngine
from app.services.vector_store import create_vector_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="Padhaku AI — NotesIndia AI Service",
    description="Local-LLM & RAG educational assistant backend for NotesIndia. Padhai ko smart banao.",
    version="1.0.0",
)

embedder = EmbeddingService(model_name=settings.embedding_model)
vector_store = create_vector_store(
    store_type=settings.vector_store_type,
    store_dir=settings.vector_store_dir,
    embedder=embedder,
)
llm_provider = create_llm_provider(settings)
rag_engine = PadhakuRagEngine(vector_store=vector_store, llm_provider=llm_provider, cfg=settings)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    llm_health = await llm_provider.check_health()
    ready = llm_health.server_reachable and llm_health.model_available
    return HealthResponse(
        status="ok" if ready else "degraded",
        llm_provider=settings.llm_provider,
        active_model=llm_provider.active_model,
        ollama_available=llm_health.server_reachable,
        model_available=llm_health.model_available,
        vector_store=settings.vector_store_type,
        embedding_backend=embedder.backend_name,
        indexed_chunks=vector_store.count_chunks(),
        message=llm_health.detail
        or (
            f"Padhaku AI ready with {llm_provider.active_model}"
            if ready
            else f"AI service online, waiting for local LLM ({llm_provider.active_model}) at {settings.ollama_base_url}"
        ),
    )


@app.post(
    "/api/ai/ingest",
    response_model=IngestResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
async def ingest_note(
    note_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(default=""),
    categories: str = Form(default=""),
    file_format: str = Form(default=""),
    file: UploadFile = File(...),
) -> IngestResponse:
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded for indexing")

    extracted = extract_text_from_bytes(
        filename=file.filename or "note.txt",
        data=raw_bytes,
        file_format=file_format or None,
    )
    page_chunks = split_pages(
        extracted.pages,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        title=title,
        description=description,
    )
    cat_list = [c.strip() for c in categories.split(",") if c.strip()]
    indexed_count = vector_store.upsert_note(
        note_id=note_id,
        title=title,
        categories=cat_list,
        chunks=page_chunks,
    )
    combined_len = len(title) + len(description) + len(extracted.text)
    return IngestResponse(
        success=True,
        note_id=note_id,
        chunks_indexed=indexed_count,
        char_count=combined_len,
        page_count=extracted.page_count,
    )


@app.delete(
    "/api/ai/ingest/{note_id}",
    dependencies=[Depends(verify_internal_api_key)],
)
async def delete_note_index(note_id: str) -> dict:
    vector_store.delete_note(note_id)
    return {"success": True, "note_id": note_id}


@app.post(
    "/api/ai/retrieve",
    response_model=RetrieveResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
async def retrieve_chunks(req: RetrieveRequest) -> RetrieveResponse:
    top_k = req.top_k or settings.rag_top_k
    hits = vector_store.search(
        query=req.query,
        top_k=top_k,
        focused_note_id=req.focused_note_id,
        allowed_note_ids=req.allowed_note_ids,
        min_score=settings.rag_min_score,
    )
    return RetrieveResponse(
        query=req.query,
        hits=[
            RetrievedChunkItem(
                note_id=h.note_id,
                title=h.title,
                page_number=h.page_number,
                chunk_index=h.chunk_index,
                score=round(h.score, 4),
                text=h.text,
                categories=h.categories,
            )
            for h in hits
        ],
    )


@app.post(
    "/api/ai/extract",
    response_model=ExtractResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
async def extract_document(file: UploadFile = File(...)) -> ExtractResponse:
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty document")
    filename = file.filename or "document.pdf"
    extracted = extract_text_from_bytes(filename=filename, data=raw_bytes)
    trimmed = extracted.text[: settings.max_ad_hoc_chars]
    return ExtractResponse(
        filename=filename,
        page_count=extracted.page_count,
        char_count=len(trimmed),
        extracted_text=trimmed,
    )


@app.post(
    "/api/ai/chat",
    response_model=ChatResponse,
    dependencies=[Depends(verify_internal_api_key)],
)
async def chat(req: ChatRequest) -> ChatResponse:
    answer_text, refs, model_used = await rag_engine.answer(req)
    return ChatResponse(
        answer=answer_text,
        referenced_notes=refs,
        model_used=model_used,
    )


@app.post(
    "/api/ai/chat/stream",
    dependencies=[Depends(verify_internal_api_key)],
)
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    refs, token_stream = await rag_engine.stream_answer(req)

    async def event_generator() -> AsyncIterator[str]:
        ref_payload = {
            "type": "references",
            "referenced_notes": [r.model_dump() for r in refs],
        }
        yield f"data: {json.dumps(ref_payload)}\n\n"

        async for token in token_stream:
            yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'model_used': llm_provider.active_model})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
