from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

from app.services.document_extractor import ExtractedPage


@dataclass
class PageChunk:
    text: str
    page_number: int
    chunk_index: int


def split_text(text: str, chunk_size: int = 800, chunk_overlap: int = 150) -> List[str]:
    """
    Splits educational documents into overlapping chunks using LangChain's
    RecursiveCharacterTextSplitter, with a clean stdlib fallback.
    """
    cleaned = text.strip()
    if not cleaned:
        return []

    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        return [c.strip() for c in splitter.split_text(cleaned) if c.strip()]
    except ImportError:
        return _stdlib_recursive_split(cleaned, chunk_size=chunk_size, chunk_overlap=chunk_overlap)


def split_pages(
    pages: Sequence[ExtractedPage],
    chunk_size: int = 800,
    chunk_overlap: int = 150,
    title: str = "",
    description: str = "",
) -> List[PageChunk]:
    """
    Splits extracted pages individually so every chunk retains its exact 1-based page_number.
    """
    result: List[PageChunk] = []
    chunk_idx = 0

    for idx, page in enumerate(pages):
        page_text = page.text.strip()
        if not page_text:
            continue

        # Attach title/description context to page 1 only so metadata queries still match
        if idx == 0 and (title or description):
            header_parts = []
            if title:
                header_parts.append(f"Title: {title}")
            if description:
                header_parts.append(f"Description: {description}")
            source_text = "\n".join(header_parts) + "\n\n" + page_text
        else:
            source_text = page_text

        sub_chunks = split_text(source_text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        for piece in sub_chunks:
            result.append(
                PageChunk(
                    text=piece,
                    page_number=page.page_number,
                    chunk_index=chunk_idx,
                )
            )
            chunk_idx += 1

    # Fallback if pages had no text (e.g., scanned PDF) — still index title + description
    if not result and (title or description):
        fallback_text = f"Title: {title}\nDescription: {description}".strip()
        for piece in split_text(fallback_text, chunk_size=chunk_size, chunk_overlap=chunk_overlap):
            result.append(PageChunk(text=piece, page_number=1, chunk_index=chunk_idx))
            chunk_idx += 1

    return result


def _stdlib_recursive_split(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    if len(text) <= chunk_size:
        return [text]

    chunks: List[str] = []
    step = max(1, chunk_size - min(chunk_overlap, chunk_size // 2))
    start = 0
    length = len(text)

    while start < length:
        end = min(length, start + chunk_size)
        if end < length:
            # Prefer breaking on paragraph, newline, sentence, or word boundary
            window = text[start:end]
            for sep in ("\n\n", "\n", ". ", " "):
                pos = window.rfind(sep)
                if pos > chunk_size // 2:
                    end = start + pos + len(sep)
                    break

        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= length:
            break
        start = max(start + 1, end - chunk_overlap)

    return chunks
