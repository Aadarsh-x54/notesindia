from __future__ import annotations

import json
import logging
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List, Optional, Sequence, Union

import numpy as np

from app.services.chunker import PageChunk
from app.services.embeddings import EmbeddingService

logger = logging.getLogger(__name__)


@dataclass
class StoredChunk:
    chunk_id: str
    note_id: str
    title: str
    categories: List[str]
    text: str
    page_number: int = 1
    chunk_index: int = 0


@dataclass
class SearchHit:
    note_id: str
    title: str
    categories: List[str]
    text: str
    score: float
    page_number: int = 1
    chunk_index: int = 0


class BaseVectorStore:
    def upsert_note(
        self,
        note_id: str,
        title: str,
        categories: List[str],
        chunks: Sequence[Union[str, PageChunk]],
    ) -> int:
        raise NotImplementedError

    def delete_note(self, note_id: str) -> None:
        raise NotImplementedError

    def search(
        self,
        query: str,
        top_k: int = 5,
        focused_note_id: Optional[str] = None,
        allowed_note_ids: Optional[List[str]] = None,
        min_score: float = 0.15,
    ) -> List[SearchHit]:
        raise NotImplementedError

    def count_chunks(self) -> int:
        raise NotImplementedError

    def get_note_chunks(self, note_id: str) -> List[StoredChunk]:
        raise NotImplementedError


def _normalize_chunks(chunks: Sequence[Union[str, PageChunk]]) -> List[PageChunk]:
    normalized: List[PageChunk] = []
    for idx, item in enumerate(chunks):
        if isinstance(item, PageChunk):
            normalized.append(item)
        else:
            normalized.append(PageChunk(text=str(item), page_number=1, chunk_index=idx))
    return normalized


class FaissVectorStore(BaseVectorStore):
    """
    Persistent FAISS cosine-similarity vector store (with pure NumPy fallback
    if faiss-cpu is not installed in a minimal environment).
    Thread-safe and supports strict permission filtering via allowed_note_ids.
    """

    def __init__(self, store_dir: str, embedder: EmbeddingService) -> None:
        self.dir = Path(store_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.meta_path = self.dir / "chunks.json"
        self.vectors_path = self.dir / "vectors.npy"
        self.faiss_path = self.dir / "index.faiss"
        self.embedder = embedder

        self._lock = threading.RLock()
        self._chunks: List[StoredChunk] = []
        self._vectors: Optional[np.ndarray] = None
        self._faiss_index = None
        self._load()

    def _load(self) -> None:
        with self._lock:
            if self.meta_path.exists():
                try:
                    raw = json.loads(self.meta_path.read_text(encoding="utf-8"))
                    self._chunks = [
                        StoredChunk(
                            chunk_id=item["chunk_id"],
                            note_id=item["note_id"],
                            title=item["title"],
                            categories=item.get("categories", []),
                            text=item["text"],
                            page_number=int(item.get("page_number", 1)),
                            chunk_index=int(item.get("chunk_index", idx)),
                        )
                        for idx, item in enumerate(raw)
                    ]
                except Exception as exc:
                    logger.warning("Failed to load chunk metadata: %s", exc)
                    self._chunks = []

            if self.vectors_path.exists() and self._chunks:
                try:
                    loaded = np.load(self.vectors_path)
                    if len(loaded) == len(self._chunks):
                        self._vectors = loaded
                        self._rebuild_faiss()
                    else:
                        logger.warning(
                            "Vector count (%d) != chunk metadata count (%d); re-embedding chunks.",
                            len(loaded),
                            len(self._chunks),
                        )
                        self._vectors = self.embedder.embed_texts([c.text for c in self._chunks])
                        self._persist()
                except Exception as exc:
                    logger.warning("Failed to load vector matrix: %s", exc)
                    self._vectors = None

    def _rebuild_faiss(self) -> None:
        self._faiss_index = None
        if self._vectors is None or len(self._vectors) == 0:
            return
        try:
            import faiss

            dim = self._vectors.shape[1]
            index = faiss.IndexFlatIP(dim)
            index.add(self._vectors.astype(np.float32))
            self._faiss_index = index
            faiss.write_index(index, str(self.faiss_path))
        except ImportError:
            self._faiss_index = None

    def _persist(self) -> None:
        self.meta_path.write_text(
            json.dumps([asdict(c) for c in self._chunks], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        if self._vectors is not None and len(self._vectors) > 0:
            np.save(self.vectors_path, self._vectors)
        elif self.vectors_path.exists():
            self.vectors_path.unlink()
        self._rebuild_faiss()

    def upsert_note(
        self,
        note_id: str,
        title: str,
        categories: List[str],
        chunks: Sequence[Union[str, PageChunk]],
    ) -> int:
        page_chunks = _normalize_chunks(chunks)
        with self._lock:
            self.delete_note(note_id)
            if not page_chunks:
                return 0

            texts = [pc.text for pc in page_chunks]
            new_vecs = self.embedder.embed_texts(texts)

            # Handle embedding dimension mismatch cleanly if model changed
            if (
                self._vectors is not None
                and len(self._vectors) > 0
                and self._vectors.shape[1] != new_vecs.shape[1]
            ):
                logger.warning(
                    "Embedding dimension changed (%d -> %d); re-embedding existing %d chunks.",
                    self._vectors.shape[1],
                    new_vecs.shape[1],
                    len(self._chunks),
                )
                self._vectors = self.embedder.embed_texts([c.text for c in self._chunks])

            new_chunks = [
                StoredChunk(
                    chunk_id=f"{note_id}::{pc.chunk_index}",
                    note_id=note_id,
                    title=title,
                    categories=categories,
                    text=pc.text,
                    page_number=pc.page_number,
                    chunk_index=pc.chunk_index,
                )
                for pc in page_chunks
            ]

            self._chunks.extend(new_chunks)
            if self._vectors is None or len(self._vectors) == 0:
                self._vectors = new_vecs
            else:
                self._vectors = np.vstack([self._vectors, new_vecs])

            self._persist()
            return len(new_chunks)

    def delete_note(self, note_id: str) -> None:
        with self._lock:
            keep_indices = [i for i, c in enumerate(self._chunks) if c.note_id != note_id]
            if len(keep_indices) == len(self._chunks):
                return
            self._chunks = [self._chunks[i] for i in keep_indices]
            if self._vectors is not None and keep_indices:
                self._vectors = self._vectors[keep_indices]
            else:
                self._vectors = None
            self._persist()

    def search(
        self,
        query: str,
        top_k: int = 5,
        focused_note_id: Optional[str] = None,
        allowed_note_ids: Optional[List[str]] = None,
        min_score: float = 0.15,
    ) -> List[SearchHit]:
        with self._lock:
            if not self._chunks or self._vectors is None or len(self._vectors) == 0:
                return []

            allowed_set = set(allowed_note_ids) if allowed_note_ids is not None else None
            if allowed_set is not None and len(allowed_set) == 0:
                return []

            if focused_note_id:
                if allowed_set is not None and focused_note_id not in allowed_set:
                    return []
                candidate_idx = [i for i, c in enumerate(self._chunks) if c.note_id == focused_note_id]
                effective_min = min_score
            elif allowed_set is not None:
                candidate_idx = [i for i, c in enumerate(self._chunks) if c.note_id in allowed_set]
                effective_min = min_score
            else:
                candidate_idx = None
                effective_min = min_score

            q_vec = self.embedder.embed_query(query).astype(np.float32)

            if candidate_idx is not None:
                if not candidate_idx:
                    return []
                sub_vecs = self._vectors[candidate_idx]
                scores = sub_vecs @ q_vec
                ranked = np.argsort(scores)[::-1][:top_k]
                hits: List[SearchHit] = []
                for r in ranked:
                    score = float(scores[r])
                    if score <= effective_min:
                        continue
                    chunk = self._chunks[candidate_idx[int(r)]]
                    hits.append(
                        SearchHit(
                            note_id=chunk.note_id,
                            title=chunk.title,
                            categories=chunk.categories,
                            text=chunk.text,
                            score=score,
                            page_number=chunk.page_number,
                            chunk_index=chunk.chunk_index,
                        )
                    )
                return hits

            k = min(top_k, len(self._chunks))
            if self._faiss_index is not None:
                scores, indices = self._faiss_index.search(q_vec.reshape(1, -1), k)
                hits = []
                for score, idx in zip(scores[0], indices[0]):
                    if idx < 0 or float(score) <= effective_min:
                        continue
                    chunk = self._chunks[int(idx)]
                    hits.append(
                        SearchHit(
                            note_id=chunk.note_id,
                            title=chunk.title,
                            categories=chunk.categories,
                            text=chunk.text,
                            score=float(score),
                            page_number=chunk.page_number,
                            chunk_index=chunk.chunk_index,
                        )
                    )
                return hits

            scores = self._vectors @ q_vec
            ranked = np.argsort(scores)[::-1][:k]
            return [
                SearchHit(
                    note_id=self._chunks[int(r)].note_id,
                    title=self._chunks[int(r)].title,
                    categories=self._chunks[int(r)].categories,
                    text=self._chunks[int(r)].text,
                    score=float(scores[int(r)]),
                    page_number=self._chunks[int(r)].page_number,
                    chunk_index=self._chunks[int(r)].chunk_index,
                )
                for r in ranked
                if float(scores[int(r)]) > effective_min
            ]

    def count_chunks(self) -> int:
        with self._lock:
            return len(self._chunks)

    def get_note_chunks(self, note_id: str) -> List[StoredChunk]:
        with self._lock:
            return [c for c in self._chunks if c.note_id == note_id]


class ChromaVectorStore(BaseVectorStore):
    """Persistent ChromaDB vector store backend (selected via VECTOR_STORE_TYPE=chroma)."""

    def __init__(self, store_dir: str, embedder: EmbeddingService) -> None:
        import chromadb

        Path(store_dir).mkdir(parents=True, exist_ok=True)
        self.embedder = embedder
        self.client = chromadb.PersistentClient(path=store_dir)
        self.collection = self.client.get_or_create_collection(
            name="notesindia_chunks",
            metadata={"hnsw:space": "cosine"},
        )

    def upsert_note(
        self,
        note_id: str,
        title: str,
        categories: List[str],
        chunks: Sequence[Union[str, PageChunk]],
    ) -> int:
        page_chunks = _normalize_chunks(chunks)
        self.delete_note(note_id)
        if not page_chunks:
            return 0
        texts = [pc.text for pc in page_chunks]
        vectors = self.embedder.embed_texts(texts).tolist()
        ids = [f"{note_id}::{pc.chunk_index}" for pc in page_chunks]
        metadatas = [
            {
                "note_id": note_id,
                "title": title,
                "categories": ",".join(categories),
                "page_number": pc.page_number,
                "chunk_index": pc.chunk_index,
            }
            for pc in page_chunks
        ]
        self.collection.add(ids=ids, embeddings=vectors, documents=texts, metadatas=metadatas)
        return len(page_chunks)

    def delete_note(self, note_id: str) -> None:
        self.collection.delete(where={"note_id": note_id})

    def search(
        self,
        query: str,
        top_k: int = 5,
        focused_note_id: Optional[str] = None,
        allowed_note_ids: Optional[List[str]] = None,
        min_score: float = 0.15,
    ) -> List[SearchHit]:
        total = self.collection.count()
        if total == 0:
            return []

        allowed_set = set(allowed_note_ids) if allowed_note_ids is not None else None
        if allowed_set is not None and len(allowed_set) == 0:
            return []

        if focused_note_id:
            if allowed_set is not None and focused_note_id not in allowed_set:
                return []
            where = {"note_id": focused_note_id}
            effective_min = min_score
        elif allowed_set is not None:
            where = {"note_id": {"$in": list(allowed_set)}}
            effective_min = min_score
        else:
            where = None
            effective_min = min_score

        q_vec = self.embedder.embed_query(query).tolist()
        result = self.collection.query(
            query_embeddings=[q_vec],
            n_results=min(top_k, total),
            where=where,
        )
        hits: List[SearchHit] = []
        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]
        dists = result.get("distances", [[]])[0]
        for doc, meta, dist in zip(docs, metas, dists):
            score = max(0.0, 1.0 - float(dist))
            if score <= effective_min:
                continue
            cats = [c for c in meta.get("categories", "").split(",") if c]
            hits.append(
                SearchHit(
                    note_id=meta.get("note_id", ""),
                    title=meta.get("title", "Untitled"),
                    categories=cats,
                    text=doc,
                    score=score,
                    page_number=int(meta.get("page_number", 1)),
                    chunk_index=int(meta.get("chunk_index", 0)),
                )
            )
        return hits

    def count_chunks(self) -> int:
        return self.collection.count()

    def get_note_chunks(self, note_id: str) -> List[StoredChunk]:
        res = self.collection.get(where={"note_id": note_id})
        chunks: List[StoredChunk] = []
        for cid, doc, meta in zip(res.get("ids", []), res.get("documents", []), res.get("metadatas", [])):
            cats = [c for c in meta.get("categories", "").split(",") if c]
            chunks.append(
                StoredChunk(
                    chunk_id=cid,
                    note_id=meta.get("note_id", note_id),
                    title=meta.get("title", "Untitled"),
                    categories=cats,
                    text=doc,
                    page_number=int(meta.get("page_number", 1)),
                    chunk_index=int(meta.get("chunk_index", 0)),
                )
            )
        return chunks


def create_vector_store(store_type: str, store_dir: str, embedder: EmbeddingService) -> BaseVectorStore:
    if store_type.lower() == "chroma":
        try:
            return ChromaVectorStore(store_dir, embedder)
        except Exception as exc:
            logger.warning("ChromaDB unavailable (%s); falling back to FAISS store.", exc)
    return FaissVectorStore(store_dir, embedder)
