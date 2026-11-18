from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import List


@dataclass
class ExtractedPage:
    page_number: int
    text: str


@dataclass
class ExtractedDocument:
    text: str
    page_count: int
    pages: List[ExtractedPage] = field(default_factory=list)


def extract_text_from_bytes(filename: str, data: bytes, file_format: str | None = None) -> ExtractedDocument:
    """
    Extracts clean page-aware text from PDF (PyMuPDF or pypdf fallback),
    DOCX (python-docx), PPTX (python-pptx), or plain text/markdown documents.
    """
    ext = (file_format or (filename.rsplit(".", 1)[-1] if "." in filename else "txt")).lower().strip()

    if ext == "pdf":
        return _extract_pdf(data)
    if ext == "docx":
        return _extract_docx(data)
    if ext == "pptx":
        return _extract_pptx(data)

    # TXT, MD, or fallback text decode
    decoded = data.decode("utf-8", errors="replace").strip()
    pages = [ExtractedPage(page_number=1, text=decoded)] if decoded else []
    return ExtractedDocument(text=decoded, page_count=1, pages=pages)


def _extract_pdf(data: bytes) -> ExtractedDocument:
    try:
        import fitz  # PyMuPDF

        extracted_pages: List[ExtractedPage] = []
        formatted_pages: List[str] = []
        with fitz.open(stream=data, filetype="pdf") as doc:
            total_pages = len(doc)
            for idx, page in enumerate(doc, start=1):
                page_text = page.get_text("text").strip()
                if page_text:
                    extracted_pages.append(ExtractedPage(page_number=idx, text=page_text))
                    formatted_pages.append(f"[Page {idx}]\n{page_text}")
            return ExtractedDocument(
                text="\n\n".join(formatted_pages),
                page_count=total_pages,
                pages=extracted_pages,
            )
    except ImportError:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        extracted_pages = []
        formatted_pages = []
        total_pages = len(reader.pages)
        for idx, page in enumerate(reader.pages, start=1):
            page_text = (page.extract_text() or "").strip()
            if page_text:
                extracted_pages.append(ExtractedPage(page_number=idx, text=page_text))
                formatted_pages.append(f"[Page {idx}]\n{page_text}")
        return ExtractedDocument(
            text="\n\n".join(formatted_pages),
            page_count=total_pages,
            pages=extracted_pages,
        )


def _extract_docx(data: bytes) -> ExtractedDocument:
    from docx import Document

    doc = Document(io.BytesIO(data))
    parts: List[str] = []
    for para in doc.paragraphs:
        if para.text and para.text.strip():
            parts.append(para.text.strip())
    for table in doc.tables:
        for row in table.rows:
            row_vals = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_vals:
                parts.append(" | ".join(row_vals))
    full_text = "\n\n".join(parts)
    page_count = max(1, len(parts) // 25)
    pages = [ExtractedPage(page_number=1, text=full_text)] if full_text else []
    return ExtractedDocument(text=full_text, page_count=page_count, pages=pages)


def _extract_pptx(data: bytes) -> ExtractedDocument:
    from pptx import Presentation

    prs = Presentation(io.BytesIO(data))
    extracted_pages: List[ExtractedPage] = []
    slides: List[str] = []
    for idx, slide in enumerate(prs.slides, start=1):
        lines: List[str] = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text and shape.text.strip():
                lines.append(shape.text.strip())
        if lines:
            slide_text = "\n".join(lines)
            extracted_pages.append(ExtractedPage(page_number=idx, text=slide_text))
            slides.append(f"[Slide {idx}]\n{slide_text}")
    return ExtractedDocument(
        text="\n\n".join(slides),
        page_count=len(prs.slides),
        pages=extracted_pages,
    )
