from __future__ import annotations

from fastapi import HTTPException
from openai import OpenAI

from app.config import settings


_openai_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    """
    Returns a singleton OpenAI client instance.
    Raises HTTPException if OPENAI_API_KEY is not configured.
    """
    global _openai_client
    if _openai_client is None:
        if not settings.OPENAI_API_KEY:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY가 설정되어 있지 않습니다.")
        _openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client
