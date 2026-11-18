from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    """Base error for local LLM operations."""


class LLMUnavailableError(LLMError):
    """Raised when the local LLM server cannot be reached."""


class LLMModelNotFoundError(LLMError):
    """Raised when the configured model is not installed in the local LLM server."""


class LLMTimeoutError(LLMError):
    """Raised when model startup or inference exceeds the configured timeout."""


@dataclass
class LLMHealthStatus:
    server_reachable: bool
    model_available: bool
    available_models: List[str] = field(default_factory=list)
    detail: str = ""


def _normalize_model_name(name: str) -> str:
    cleaned = name.strip().lower()
    return cleaned if ":" in cleaned else f"{cleaned}:latest"


class BaseLLMProvider:
    @property
    def active_model(self) -> str:
        raise NotImplementedError

    async def check_health(self) -> LLMHealthStatus:
        available = await self.is_available()
        return LLMHealthStatus(server_reachable=available, model_available=available)

    async def is_available(self) -> bool:
        raise NotImplementedError

    async def generate(self, messages: List[Dict[str, str]]) -> str:
        raise NotImplementedError

    async def stream_generate(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:
        raise NotImplementedError


class OllamaLLMProvider(BaseLLMProvider):
    """
    Local open-source LLM provider backed by Ollama.
    Supports Qwen 2.5 / Qwen 3 (qwen2.5:1.5b, qwen2.5:3b, qwen3:8b), Llama 3.1, Mistral, etc.
    Swappable entirely via OLLAMA_MODEL environment variable.
    """

    def __init__(
        self,
        base_url: str,
        model: str,
        temperature: float = 0.2,
        connect_timeout: float = 10.0,
        read_timeout: float = 180.0,
        num_ctx: int = 4096,
        keep_alive: str = "10m",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout
        self.num_ctx = num_ctx
        self.keep_alive = keep_alive

    @property
    def active_model(self) -> str:
        return self.model

    def _timeout(self) -> httpx.Timeout:
        return httpx.Timeout(
            connect=self.connect_timeout,
            read=self.read_timeout,
            write=30.0,
            pool=10.0,
        )

    async def check_health(self) -> LLMHealthStatus:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code != 200:
                    return LLMHealthStatus(
                        server_reachable=False,
                        model_available=False,
                        detail=f"Ollama returned HTTP {resp.status_code}",
                    )
                data = resp.json()
                models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
                target = _normalize_model_name(self.model)
                installed = any(_normalize_model_name(m) == target for m in models)
                if installed:
                    return LLMHealthStatus(
                        server_reachable=True,
                        model_available=True,
                        available_models=models,
                        detail=f"Padhaku AI ready with {self.model}",
                    )
                return LLMHealthStatus(
                    server_reachable=True,
                    model_available=False,
                    available_models=models,
                    detail=(
                        f"Ollama is online at {self.base_url}, but model '{self.model}' is not pulled. "
                        f"Run: ollama pull {self.model}"
                    ),
                )
        except httpx.TimeoutException:
            return LLMHealthStatus(
                server_reachable=False,
                model_available=False,
                detail=f"Timed out connecting to Ollama at {self.base_url}",
            )
        except Exception as exc:
            return LLMHealthStatus(
                server_reachable=False,
                model_available=False,
                detail=f"Ollama unreachable at {self.base_url}: {exc}",
            )

    async def is_available(self) -> bool:
        health = await self.check_health()
        return health.server_reachable and health.model_available

    def _build_payload(self, messages: List[Dict[str, str]], stream: bool) -> Dict[str, object]:
        payload: Dict[str, object] = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "keep_alive": self.keep_alive,
            "options": {
                "temperature": self.temperature,
                "num_ctx": self.num_ctx,
            },
        }
        # Disable hidden chain-of-thought latency overhead on qwen3 models when running locally
        if self.model.lower().startswith("qwen3"):
            payload["think"] = False
        return payload

    async def generate(self, messages: List[Dict[str, str]]) -> str:
        payload = self._build_payload(messages, stream=False)
        try:
            async with httpx.AsyncClient(timeout=self._timeout()) as client:
                resp = await client.post(f"{self.base_url}/api/chat", json=payload)
                if resp.status_code == 404:
                    raise LLMModelNotFoundError(
                        f"Ollama model '{self.model}' is not installed. Run: ollama pull {self.model}"
                    )
                resp.raise_for_status()
                data = resp.json()
                if "error" in data:
                    err_msg = str(data["error"])
                    if "not found" in err_msg.lower():
                        raise LLMModelNotFoundError(err_msg)
                    raise LLMError(err_msg)
                return data.get("message", {}).get("content", "").strip()
        except (LLMModelNotFoundError, LLMTimeoutError, LLMUnavailableError, LLMError):
            raise
        except httpx.ConnectError as exc:
            raise LLMUnavailableError(f"Cannot connect to Ollama at {self.base_url}: {exc}") from exc
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(
                f"Ollama inference timed out after {self.read_timeout:.0f}s for model '{self.model}'"
            ) from exc
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300]
            if exc.response.status_code == 404 or "not found" in body.lower():
                raise LLMModelNotFoundError(
                    f"Ollama model '{self.model}' not found: {body}"
                ) from exc
            raise LLMError(f"Ollama HTTP {exc.response.status_code}: {body}") from exc

    async def stream_generate(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:
        payload = self._build_payload(messages, stream=True)
        try:
            async with httpx.AsyncClient(timeout=self._timeout()) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
                    if resp.status_code == 404:
                        raise LLMModelNotFoundError(
                            f"Ollama model '{self.model}' is not installed. Run: ollama pull {self.model}"
                        )
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode("utf-8", errors="replace")[:300]
                        if "not found" in body.lower():
                            raise LLMModelNotFoundError(f"Ollama model '{self.model}' not found: {body}")
                        raise LLMError(f"Ollama HTTP {resp.status_code}: {body}")
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if "error" in chunk:
                            err_msg = str(chunk["error"])
                            if "not found" in err_msg.lower():
                                raise LLMModelNotFoundError(err_msg)
                            raise LLMError(err_msg)
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            yield token
                        if chunk.get("done"):
                            break
        except (LLMModelNotFoundError, LLMTimeoutError, LLMUnavailableError, LLMError):
            raise
        except httpx.ConnectError as exc:
            raise LLMUnavailableError(f"Cannot connect to Ollama at {self.base_url}: {exc}") from exc
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(
                f"Ollama streaming timed out after {self.read_timeout:.0f}s for model '{self.model}'"
            ) from exc


class OpenAICompatibleProvider(BaseLLMProvider):
    """Optional provider for vLLM, LM Studio, LiteLLM, or OpenAI-compatible servers."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        temperature: float = 0.2,
        connect_timeout: float = 10.0,
        read_timeout: float = 180.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout

    @property
    def active_model(self) -> str:
        return self.model

    async def check_health(self) -> LLMHealthStatus:
        ok = await self.is_available()
        return LLMHealthStatus(
            server_reachable=ok,
            model_available=ok,
            detail=f"Padhaku AI ready with {self.model}" if ok else f"OpenAI-compatible endpoint unreachable at {self.base_url}",
        )

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def generate(self, messages: List[Dict[str, str]]) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "stream": False,
        }
        timeout = httpx.Timeout(connect=self.connect_timeout, read=self.read_timeout, write=30.0, pool=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"].strip()
        except httpx.ConnectError as exc:
            raise LLMUnavailableError(f"Cannot connect to LLM endpoint {self.base_url}: {exc}") from exc
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(f"LLM request timed out after {self.read_timeout:.0f}s") from exc

    async def stream_generate(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "stream": True,
        }
        timeout = httpx.Timeout(connect=self.connect_timeout, read=self.read_timeout, write=30.0, pool=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if raw == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw)
                            token = chunk["choices"][0]["delta"].get("content", "")
                            if token:
                                yield token
                        except Exception:
                            continue
        except httpx.ConnectError as exc:
            raise LLMUnavailableError(f"Cannot connect to LLM endpoint {self.base_url}: {exc}") from exc
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(f"LLM streaming timed out after {self.read_timeout:.0f}s") from exc


def create_llm_provider(cfg: Settings) -> BaseLLMProvider:
    if cfg.llm_provider.lower() == "openai_compatible":
        return OpenAICompatibleProvider(
            base_url=cfg.openai_compat_base_url,
            api_key=cfg.openai_compat_api_key,
            model=cfg.openai_compat_model,
            temperature=cfg.ollama_temperature,
            connect_timeout=cfg.ollama_connect_timeout,
            read_timeout=cfg.ollama_read_timeout,
        )
    return OllamaLLMProvider(
        base_url=cfg.ollama_base_url,
        model=cfg.ollama_model,
        temperature=cfg.ollama_temperature,
        connect_timeout=cfg.ollama_connect_timeout,
        read_timeout=cfg.ollama_read_timeout,
        num_ctx=cfg.ollama_num_ctx,
        keep_alive=cfg.ollama_keep_alive,
    )
