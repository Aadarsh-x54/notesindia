from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ai_service_api_key: str = "CHANGE_ME_INTERNAL_AI_SERVICE_SECRET_KEY_NOTESINDIA"

    # Configurable LLM provider ("ollama" default, or "openai_compatible")
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    # Hardware-configurable local Qwen model (override via OLLAMA_MODEL env var)
    # Examples: qwen2.5:1.5b (8 GB RAM CPU), qwen2.5:3b (12-16 GB RAM), qwen3:8b (16+ GB / GPU)
    ollama_model: str = "qwen2.5:1.5b"
    ollama_temperature: float = 0.2
    ollama_connect_timeout: float = 10.0
    ollama_read_timeout: float = 180.0
    ollama_num_ctx: int = 4096
    ollama_keep_alive: str = "10m"

    # Optional OpenAI-compatible local/vLLM/LiteLLM endpoint
    openai_compat_base_url: str = "http://localhost:11434/v1"
    openai_compat_api_key: str = "local"
    openai_compat_model: str = "qwen2.5:1.5b"

    # Embeddings & Vector Store ("faiss" or "chroma")
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    vector_store_type: str = "faiss"
    vector_store_dir: str = "./data/vectorstore"

    # RAG chunking & retrieval parameters
    chunk_size: int = 800
    chunk_overlap: int = 150
    rag_top_k: int = 5
    rag_min_score: float = 0.20
    max_ad_hoc_chars: int = 24000


settings = Settings()
