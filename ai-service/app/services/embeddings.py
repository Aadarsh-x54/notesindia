from __future__ import annotations

import hashlib
import logging
import re
from typing import List

import numpy as np

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Generates normalized dense semantic embeddings using SentenceTransformers
    (or HuggingFace Transformers mean-pooling if sentence-transformers is not installed).
    Falls back gracefully to deterministic normalized n-gram hashing only when
    model weights cannot be loaded (e.g., offline unit tests).
    """

    def __init__(self, model_name: str, fallback_dim: int = 384) -> None:
        self.model_name = model_name
        self.fallback_dim = fallback_dim
        self._st_model = None
        self._hf_tokenizer = None
        self._hf_model = None
        self._tried_load = False
        self._backend = "uninitialized"

    @property
    def backend_name(self) -> str:
        return self._backend

    def _ensure_model(self) -> None:
        if self._tried_load:
            return
        self._tried_load = True

        # 1. Primary: SentenceTransformers
        try:
            from sentence_transformers import SentenceTransformer

            self._st_model = SentenceTransformer(self.model_name)
            self._backend = "sentence-transformers"
            logger.info("Loaded SentenceTransformer model: %s", self.model_name)
            return
        except Exception as st_exc:
            logger.info(
                "SentenceTransformers not used for '%s' (%s); attempting Transformers dense backend.",
                self.model_name,
                st_exc,
            )

        # 2. Secondary dense semantic backend: PyTorch + HuggingFace Transformers (mean pooling + L2 norm)
        try:
            from transformers import AutoModel, AutoTokenizer

            self._hf_tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self._hf_model = AutoModel.from_pretrained(self.model_name)
            self._hf_model.eval()
            self._backend = "transformers"
            logger.info("Loaded HuggingFace Transformers dense embedding model: %s", self.model_name)
            return
        except Exception as hf_exc:
            logger.warning(
                "Dense embedding model '%s' unavailable (%s); using lightweight lexical hash embeddings.",
                self.model_name,
                hf_exc,
            )
            self._st_model = None
            self._hf_tokenizer = None
            self._hf_model = None
            self._backend = "hash-fallback"

    def embed_texts(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.fallback_dim), dtype=np.float32)

        self._ensure_model()

        if self._st_model is not None:
            vectors = self._st_model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
            return np.asarray(vectors, dtype=np.float32)

        if self._hf_model is not None and self._hf_tokenizer is not None:
            import torch
            import torch.nn.functional as F

            all_vecs: List[np.ndarray] = []
            batch_size = 32
            with torch.no_grad():
                for start in range(0, len(texts), batch_size):
                    batch = texts[start : start + batch_size]
                    encoded = self._hf_tokenizer(
                        batch,
                        padding=True,
                        truncation=True,
                        max_length=512,
                        return_tensors="pt",
                    )
                    output = self._hf_model(**encoded)
                    token_embeddings = output.last_hidden_state
                    mask = encoded["attention_mask"].unsqueeze(-1).expand(token_embeddings.size()).float()
                    summed = torch.sum(token_embeddings * mask, dim=1)
                    counts = torch.clamp(mask.sum(dim=1), min=1e-9)
                    pooled = summed / counts
                    normalized = F.normalize(pooled, p=2, dim=1)
                    all_vecs.append(normalized.cpu().numpy().astype(np.float32))
            return np.vstack(all_vecs).astype(np.float32)

        return np.vstack([self._hash_embed(t) for t in texts]).astype(np.float32)

    def embed_query(self, query: str) -> np.ndarray:
        return self.embed_texts([query])[0]

    def _hash_embed(self, text: str) -> np.ndarray:
        vec = np.zeros(self.fallback_dim, dtype=np.float32)
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        for tok in tokens:
            digest = hashlib.blake2b(tok.encode("utf-8"), digest_size=4).digest()
            idx = int.from_bytes(digest, "little") % self.fallback_dim
            vec[idx] += 1.0
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec
