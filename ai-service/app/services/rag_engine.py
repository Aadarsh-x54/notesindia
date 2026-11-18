from __future__ import annotations

import logging
from typing import AsyncIterator, Dict, List, Set, Tuple

from app.config import Settings
from app.models.schemas import ChatRequest, ReferencedNoteItem
from app.services.llm_provider import (
    BaseLLMProvider,
    LLMModelNotFoundError,
    LLMTimeoutError,
    LLMUnavailableError,
)
from app.services.vector_store import BaseVectorStore, SearchHit

logger = logging.getLogger(__name__)

MODE_INSTRUCTIONS: Dict[str, str] = {
    "GENERAL": "Answer clearly, accurately, and step-by-step using structured headings or bullet points where helpful.",
    "SUMMARY": "Provide a crisp, high-yield structured summary highlighting definitions, formulas, and key takeaways.",
    "SIMPLIFY": "Explain the concept in very simple beginner-friendly language with concrete real-world examples.",
    "MCQ": "Generate 5 exam-grade Multiple Choice Questions (4 options A-D each) followed by an Answer Key with brief explanations.",
    "PRACTICE": "Create 5 progressive practice questions (from foundational to exam-level) with hints or brief model answers.",
    "REVISION": "Produce concise, exam-ready rapid revision notes with key formulas, rules, and common pitfalls.",
    "CODE": "Explain the programming concept or code line-by-line, include clean runnable code examples, and mention time/space complexity.",
}

SYSTEM_PROMPT = """You are Padhaku AI ("Padhai ko smart banao."), the integrated educational assistant for NotesIndia.
Your mission is to help Indian students, competitive exam aspirants (SSC, Banking, Railway, UPSC, GATE), programmers, and independent learners master concepts accurately.

Strict Grounding & Citation Rules:
1. Whenever RETRIEVED STUDY CONTEXT is provided below, answer strictly based on the facts in that context.
2. Always cite the exact document title and page number for facts taken from the context, using the format `[Document Title, Page X]` (for example: `[Quantum Computing Basics, Page 2]`).
3. NEVER fabricate information, quotes, or page numbers.
4. If the retrieved study context does NOT contain the answer to the user's question, you MUST explicitly state: "The provided document/notes do not contain information to answer this question." Do not guess or invent facts as if they came from the document.
5. Keep explanations clean, concise, well-structured in Markdown, and directly focused on learning."""


class PadhakuRagEngine:
    def __init__(
        self,
        vector_store: BaseVectorStore,
        llm_provider: BaseLLMProvider,
        cfg: Settings,
    ) -> None:
        self.vector_store = vector_store
        self.llm_provider = llm_provider
        self.cfg = cfg

    def retrieve_context(
        self, req: ChatRequest
    ) -> Tuple[str, List[ReferencedNoteItem]]:
        top_k = req.top_k or self.cfg.rag_top_k
        mode_key = (req.mode or "GENERAL").upper()
        whole_doc_mode = mode_key in {"SUMMARY", "MCQ", "PRACTICE", "REVISION"}
        min_score = 0.0 if (req.focused_note_id and whole_doc_mode) else self.cfg.rag_min_score
        hits: List[SearchHit] = self.vector_store.search(
            query=req.question,
            top_k=top_k,
            focused_note_id=req.focused_note_id,
            allowed_note_ids=req.allowed_note_ids,
            min_score=min_score,
        )

        context_blocks: List[str] = []
        unique_refs: Dict[str, ReferencedNoteItem] = {}
        ref_pages: Dict[str, Set[int]] = {}

        if req.ad_hoc_document_text and req.ad_hoc_document_text.strip():
            trimmed = req.ad_hoc_document_text.strip()[: self.cfg.max_ad_hoc_chars]
            doc_name = req.ad_hoc_document_name or "Uploaded Document"
            context_blocks.append(f"### Uploaded Study Document: {doc_name}\n{trimmed}")

        for idx, hit in enumerate(hits, start=1):
            cat_str = ", ".join(hit.categories) if hit.categories else "General"
            context_blocks.append(
                f"### NotesIndia Reference [{idx}]: {hit.title} (Page {hit.page_number}, Categories: {cat_str})\n"
                f"{hit.text}"
            )
            ref_pages.setdefault(hit.note_id, set()).add(hit.page_number)
            if hit.note_id not in unique_refs:
                snippet = hit.text.replace("\n", " ").strip()
                if len(snippet) > 200:
                    snippet = snippet[:197] + "..."
                unique_refs[hit.note_id] = ReferencedNoteItem(
                    note_id=hit.note_id,
                    title=hit.title,
                    score=round(hit.score, 4),
                    snippet=snippet,
                    categories=hit.categories,
                    page_numbers=[],
                )

        refs_list: List[ReferencedNoteItem] = []
        for note_id, ref in unique_refs.items():
            ref.page_numbers = sorted(ref_pages.get(note_id, set()))
            refs_list.append(ref)

        return "\n\n".join(context_blocks), refs_list

    def build_messages(
        self, req: ChatRequest, context_text: str
    ) -> List[Dict[str, str]]:
        mode_key = (req.mode or "GENERAL").upper()
        mode_instruction = MODE_INSTRUCTIONS.get(mode_key, MODE_INSTRUCTIONS["GENERAL"])

        system_content = f"{SYSTEM_PROMPT}\n\nTask Mode ({mode_key}): {mode_instruction}"
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_content}]
        for item in req.history[-10:]:
            messages.append({"role": item.role, "content": item.content})

        if context_text:
            user_prompt = (
                "Use ONLY the study context below to answer the student's question. "
                "Include the document title and page number [Document Title, Page X] in your answer. "
                "If the study context does not mention the topic or answer, say clearly that the provided document does not contain that information.\n\n"
                "<context>\n"
                f"{context_text}\n"
                "</context>\n\n"
                f"Question: {req.question}"
            )
            messages.append({"role": "user", "content": user_prompt})
        elif req.focused_note_id:
            note_label = req.focused_note_title or req.focused_note_id
            user_prompt = (
                f"No passages matching this question were found in the document '{note_label}'.\n"
                f"Question: {req.question}\n\n"
                "Inform the student clearly that the provided document does not contain information to answer this question."
            )
            messages.append({"role": "user", "content": user_prompt})
        else:
            messages.append({"role": "user", "content": req.question})
        return messages

    async def answer(self, req: ChatRequest) -> Tuple[str, List[ReferencedNoteItem], str]:
        context_text, refs = self.retrieve_context(req)
        messages = self.build_messages(req, context_text)

        try:
            text = await self.llm_provider.generate(messages)
            return text, refs, self.llm_provider.active_model
        except LLMModelNotFoundError as exc:
            logger.warning("Local LLM model missing: %s", exc)
            return self._build_rag_fallback(req, refs, reason=str(exc)), refs, f"{self.llm_provider.active_model} (model-missing)"
        except LLMTimeoutError as exc:
            logger.warning("Local LLM timed out: %s", exc)
            return self._build_rag_fallback(req, refs, reason=str(exc)), refs, f"{self.llm_provider.active_model} (timeout)"
        except LLMUnavailableError as exc:
            logger.warning("Local LLM unreachable: %s", exc)
            return self._build_rag_fallback(req, refs, reason=str(exc)), refs, f"{self.llm_provider.active_model} (offline-rag-fallback)"
        except Exception as exc:
            logger.warning("Local LLM generation failed (%s); returning RAG-grounded fallback.", exc)
            return self._build_rag_fallback(req, refs, reason=str(exc)), refs, f"{self.llm_provider.active_model} (offline-rag-fallback)"

    async def stream_answer(
        self, req: ChatRequest
    ) -> Tuple[List[ReferencedNoteItem], AsyncIterator[str]]:
        context_text, refs = self.retrieve_context(req)
        messages = self.build_messages(req, context_text)

        async def _generator() -> AsyncIterator[str]:
            try:
                async for token in self.llm_provider.stream_generate(messages):
                    yield token
            except Exception as exc:
                logger.warning("Local LLM streaming failed (%s); yielding RAG fallback.", exc)
                yield self._build_rag_fallback(req, refs, reason=str(exc))

        return refs, _generator()

    def _build_rag_fallback(
        self,
        req: ChatRequest,
        refs: List[ReferencedNoteItem],
        reason: str = "",
    ) -> str:
        lines = [
            f"Local Ollama model (`{self.llm_provider.active_model}`) could not complete generation.",
        ]
        if reason:
            lines.append(f"Reason: {reason}")
        lines.extend(
            [
                "",
                "Verify Ollama is running and the configured model is pulled:",
                f"```bash\nollama pull {self.llm_provider.active_model}\n```",
            ]
        )
        if refs:
            lines.append("")
            lines.append("### Relevant Excerpts Retrieved from NotesIndia:")
            for ref in refs:
                pages = ", ".join(str(p) for p in ref.page_numbers) if ref.page_numbers else "1"
                lines.append(f"- **{ref.title}** (Page {pages}, match `{ref.score:.2f}`): {ref.snippet}")
        return "\n".join(lines)
