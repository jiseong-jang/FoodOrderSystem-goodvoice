from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field, validator
from pydantic_settings import BaseSettings


# Project root directory (voice-order-fastapi/)
BASE_DIR = Path(__file__).resolve().parent.parent
# App directory (voice-order-fastapi/app/)
APP_DIR = Path(__file__).resolve().parent
DEFAULT_ENV_PATHS = [
    BASE_DIR / ".env",
    BASE_DIR.parent / ".env",
]

# .env 파일 로드 (여러 경로 확인)
for env_path in DEFAULT_ENV_PATHS:
    if env_path.exists():
        load_dotenv(env_path, override=True)  # override=True로 기존 환경변수 덮어쓰기
        print(f"[OK] .env 파일 로드됨: {env_path}")
        break
else:
    print("[WARN] .env 파일을 찾을 수 없습니다. 기본 설정을 사용합니다.")


class Settings(BaseSettings):
    """Configuration shared across the FastAPI service."""

    VOICE_ORDER_MODEL_PRESET: Optional[str] = Field(
        default="hf_base",
        description="openai | hf_base | hf_finetune | local_finetune",
    )
    VOICE_ORDER_SERVER_PORT: int = 5001
    VOICE_ORDER_CLIENT_ORIGIN: str = Field(
        default="http://localhost:8080,http://localhost:3000,http://127.0.0.1:8080",
        description="Origin allowed to call this API. Multiple origins can be separated by commas."
    )
    
    # Hugging Face 추가 설정
    VOICE_ORDER_HF_MAX_TOKENS: int = Field(default=512)
    VOICE_ORDER_HF_TEMPERATURE: float = Field(default=0.6)
    VOICE_ORDER_HF_TOP_P: float = Field(default=0.9)
    # Local finetune (transformers+peft) 옵션
    VOICE_ORDER_LOCAL_MODEL: Optional[str] = None  # base HF id 또는 로컬 경로
    VOICE_ORDER_LOCAL_ADAPTER: Optional[str] = None  # LoRA 어댑터 경로
    VOICE_ORDER_LOCAL_MAX_NEW_TOKENS: int = Field(default=512)
    VOICE_ORDER_LOCAL_TEMPERATURE: float = Field(default=0.6)
    VOICE_ORDER_LOCAL_TOP_P: float = Field(default=0.9)

    VOICE_ORDER_LLM_PROVIDER: str = Field(default="huggingface")
    OPENAI_API_KEY: Optional[str] = Field(default=None, repr=False)
    VOICE_ORDER_CHAT_MODEL: Optional[str] = Field(default=None)
    VOICE_ORDER_HF_ENDPOINT: str = Field(
        default="https://router.huggingface.co/v1/chat/completions"
    )
    VOICE_ORDER_HF_MODEL: str = Field(default="meta-llama/Llama-3.1-8B-Instruct")
    # 별도 베이스/파인튜닝 엔드포인트를 함께 정의할 수 있도록 분리
    VOICE_ORDER_HF_BASE_ENDPOINT: Optional[str] = None
    VOICE_ORDER_HF_BASE_MODEL: Optional[str] = None
    VOICE_ORDER_HF_FINETUNE_ENDPOINT: Optional[str] = None
    VOICE_ORDER_HF_FINETUNE_MODEL: Optional[str] = None
    VOICE_ORDER_HF_TOKEN: Optional[str] = None
    HF_TOKEN: Optional[str] = None

    VOICE_ORDER_SUMMARY_MODEL: Optional[str] = None
    VOICE_ORDER_SUMMARY_HF_ENDPOINT: Optional[str] = None
    VOICE_ORDER_SUMMARY_HF_MODEL: Optional[str] = None
    VOICE_ORDER_SUMMARY_TEMPERATURE: float = 0.1
    VOICE_ORDER_SUMMARY_MAX_TOKENS: int = 768
    VOICE_ORDER_SUMMARY_TOP_P: float = 0.95

    VOICE_ORDER_MENU_DATA_DIR: Optional[str] = None
    VOICE_ORDER_ORDER_DIR: Optional[str] = None
    VOICE_ORDER_ASSUMED_DELIVERY_DATE: str = "2025-12-08"

    VOICE_ORDER_STT_MODEL: str = Field(default="whisper-1")

    class Config:
        env_file = ".env"  # .env 파일 명시적으로 지정
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "allow"

    @property
    def huggingface_token(self) -> Optional[str]:
        return self.VOICE_ORDER_HF_TOKEN or self.HF_TOKEN

    @property
    def summary_model(self) -> Optional[str]:
        return self.VOICE_ORDER_SUMMARY_MODEL or self.VOICE_ORDER_CHAT_MODEL

    @property
    def summary_hf_endpoint(self) -> str:
        return self.VOICE_ORDER_SUMMARY_HF_ENDPOINT or self.VOICE_ORDER_HF_ENDPOINT

    @property
    def summary_hf_model(self) -> str:
        return self.VOICE_ORDER_SUMMARY_HF_MODEL or self.VOICE_ORDER_HF_MODEL


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    # .env 파일에서 VOICE_ORDER_CLIENT_ORIGIN이 설정되어 있으면 localhost:8080도 추가
    env_origin = os.getenv("VOICE_ORDER_CLIENT_ORIGIN", "")
    if env_origin and env_origin.strip():
        # .env에 설정된 오리진에 localhost:8080이 없으면 추가
        if "localhost:8080" not in env_origin and "127.0.0.1:8080" not in env_origin:
            settings.VOICE_ORDER_CLIENT_ORIGIN = f"{env_origin},http://localhost:8080,http://127.0.0.1:8080"
        else:
            settings.VOICE_ORDER_CLIENT_ORIGIN = env_origin

    # 모델 프리셋에 따라 기본값 자동 설정 (openai | hf_base | hf_finetune | local_finetune)
    preset = (os.getenv("VOICE_ORDER_MODEL_PRESET") or settings.VOICE_ORDER_MODEL_PRESET or "").strip().lower()
    if preset:
        if preset == "openai":
            settings.VOICE_ORDER_LLM_PROVIDER = "openai"
            settings.VOICE_ORDER_SUMMARY_MODEL = settings.VOICE_ORDER_SUMMARY_MODEL or settings.VOICE_ORDER_CHAT_MODEL
        elif preset == "hf_base":
            settings.VOICE_ORDER_LLM_PROVIDER = "huggingface"
            settings.VOICE_ORDER_HF_ENDPOINT = (
                settings.VOICE_ORDER_HF_BASE_ENDPOINT
                or settings.VOICE_ORDER_HF_ENDPOINT
                or "https://router.huggingface.co/v1/chat/completions"
            )
            settings.VOICE_ORDER_HF_MODEL = (
                settings.VOICE_ORDER_HF_BASE_MODEL
                or settings.VOICE_ORDER_HF_MODEL
                or "meta-llama/Meta-Llama-3.1-8B-Instruct"
            )
            settings.VOICE_ORDER_SUMMARY_HF_MODEL = settings.VOICE_ORDER_SUMMARY_HF_MODEL or settings.VOICE_ORDER_HF_MODEL
            settings.VOICE_ORDER_SUMMARY_HF_ENDPOINT = settings.VOICE_ORDER_SUMMARY_HF_ENDPOINT or settings.VOICE_ORDER_HF_ENDPOINT
        elif preset == "hf_finetune":
            settings.VOICE_ORDER_LLM_PROVIDER = "huggingface"
            settings.VOICE_ORDER_HF_ENDPOINT = (
                settings.VOICE_ORDER_HF_FINETUNE_ENDPOINT
                or settings.VOICE_ORDER_HF_ENDPOINT
                or "http://localhost:8000/v1/chat/completions"
            )
            settings.VOICE_ORDER_HF_MODEL = (
                settings.VOICE_ORDER_HF_FINETUNE_MODEL
                or settings.VOICE_ORDER_HF_MODEL
                or "meta-llama/Meta-Llama-3.1-8B-Instruct"
            )
            settings.VOICE_ORDER_SUMMARY_HF_MODEL = settings.VOICE_ORDER_SUMMARY_HF_MODEL or settings.VOICE_ORDER_HF_MODEL
            settings.VOICE_ORDER_SUMMARY_HF_ENDPOINT = settings.VOICE_ORDER_SUMMARY_HF_ENDPOINT or settings.VOICE_ORDER_HF_ENDPOINT
        elif preset == "local_finetune":
            settings.VOICE_ORDER_LLM_PROVIDER = "local"
            settings.VOICE_ORDER_LOCAL_MODEL = settings.VOICE_ORDER_LOCAL_MODEL or "meta-llama/Meta-Llama-3.1-8B-Instruct"
            settings.VOICE_ORDER_LOCAL_ADAPTER = settings.VOICE_ORDER_LOCAL_ADAPTER or str(
                BASE_DIR.parent / "finetuning" / "outputs" / "llama3.1-8b-sft-h100" / "final"
            )
    return settings


settings = get_settings()
