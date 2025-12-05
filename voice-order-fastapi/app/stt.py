from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.openai_client import get_openai_client


def _short_language_code(language: Optional[str]) -> Optional[str]:
    if not language:
        return None
    lang = language.strip()
    if not lang:
        return None
    return lang.split("-")[0].split("_")[0]


async def transcribe_audio(file: UploadFile, language: Optional[str]) -> str:
    client = get_openai_client()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="빈 오디오 파일입니다.")

    lang_code = _short_language_code(language)

    def _run_transcription() -> str:
        suffix = Path(file.filename or "audio").suffix or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)

        try:
            with tmp_path.open("rb") as audio_file:
                response = client.audio.transcriptions.create(
                    file=audio_file,
                    model=settings.VOICE_ORDER_STT_MODEL,
                    **({"language": lang_code} if lang_code else {}),
                )
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass

        text = getattr(response, "text", None)
        if not text:
            raise RuntimeError("STT 응답이 비어 있습니다.")
        return text

    return await run_in_threadpool(_run_transcription)
