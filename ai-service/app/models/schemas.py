from typing import List, Optional
from pydantic import BaseModel, Field


class ChatHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=8000)
    mode: str = Field(default="GENERAL")
    history: List[ChatHistoryItem] = Field(default_factory=list)
    focused_note_id: Optional[str] = None
    focused_note_title: Optional[str] = None
    allowed_note_ids: Optional[List[str]] = None
    ad_hoc_document_text: Optional[str] = None
    ad_hoc_document_name: Optional[str] = None
    top_k: Optional[int] = Field(default=None, ge=1, le=12)


class RetrieveRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    top_k: Optional[int] = Field(default=None, ge=1, le=20)
    focused_note_id: Optional[str] = None
    allowed_note_ids: Optional[List[str]] = None


class RetrievedChunkItem(BaseModel):
    note_id: str
    title: str
    page_number: int
    chunk_index: int
    score: float
    text: str
    categories: List[str] = Field(default_factory=list)


class RetrieveResponse(BaseModel):
    query: str
    hits: List[RetrievedChunkItem] = Field(default_factory=list)


class ReferencedNoteItem(BaseModel):
    note_id: str
    title: str
    score: float
    snippet: str
    categories: List[str] = Field(default_factory=list)
    page_numbers: List[int] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    referenced_notes: List[ReferencedNoteItem] = Field(default_factory=list)
    model_used: str


class IngestResponse(BaseModel):
    success: bool
    note_id: str
    chunks_indexed: int
    char_count: int
    page_count: int = 1


class ExtractResponse(BaseModel):
    filename: str
    page_count: int
    char_count: int
    extracted_text: str


class HealthResponse(BaseModel):
    status: str
    llm_provider: str
    active_model: str
    ollama_available: bool
    model_available: bool = False
    vector_store: str
    embedding_backend: str = "unknown"
    indexed_chunks: int
    message: str
