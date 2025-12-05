from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

from app.config import APP_DIR


@lru_cache()
def _load_language_data() -> dict:
    """Load language data from JSON file with caching."""
    lang_file = APP_DIR / "data" / "languages.json"
    try:
        with lang_file.open(encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: Failed to load language data from {lang_file}: {e}")
        # Fallback minimal data
        return {
            "orderConfirmationToken": "<<CONFIRM_ORDER>>",
            "initialLanguage": "ko-KR",
            "languageNames": {"ko-KR": "Korean", "en-US": "English"},
            "uiMessages": {"ko-KR": {}, "en-US": {}},
            "greetings": {
                "ko-KR": "안녕하세요, {name} 고객님.",
                "en-US": "Hello {name}."
            }
        }


ORDER_CONFIRMATION_TOKEN = _load_language_data()["orderConfirmationToken"]
INITIAL_LANGUAGE = _load_language_data()["initialLanguage"]
LANGUAGE_NAMES = _load_language_data()["languageNames"]
UI_MESSAGES = _load_language_data()["uiMessages"]
_GREETINGS = _load_language_data()["greetings"]


def detect_language_code(text: Optional[str]) -> str:
    if not text or not text.strip():
        return INITIAL_LANGUAGE
    sample = text.strip()
    if any("\uac00" <= ch <= "\ud7a3" for ch in sample):
        return "ko-KR"
    if any("\u3040" <= ch <= "\u30ff" for ch in sample):
        return "ja-JP"
    if any("\u4e00" <= ch <= "\u9fff" for ch in sample):
        return "zh-CN"
    if any("а" <= ch.lower() <= "я" for ch in sample):
        return "ru-RU"
    if any("\u0590" <= ch <= "\u05ff" for ch in sample):
        return "he-IL"
    accented_spanish = set("áéíóúñü¿¡")
    if accented_spanish.intersection(sample.casefold()):
        return "es-ES"
    if set("äöüß").intersection(sample.casefold()):
        return "de-DE"
    if set("êéèàçôûîœ").intersection(sample.casefold()):
        return "fr-FR"
    return "en-US"


def build_language_instruction(lang_code: str) -> str:
    language_name = LANGUAGE_NAMES.get(lang_code, lang_code)
    return (
        f"System override: The customer is communicating in {language_name}. "
        f"Respond exclusively in {language_name}, mirror their tone, and do not switch to another language "
        f"unless the customer changes languages again and explicitly signals the change."
    )


def greeting_by_language(lang_code: str, customer_name: str) -> str:
    name = customer_name or "고객님"
    template = _GREETINGS.get(lang_code, _GREETINGS.get("ko-KR", "안녕하세요, {name} 고객님."))
    return template.replace("{name}", name)


def get_ui_text(lang_code: str) -> Dict[str, str]:
    return UI_MESSAGES.get(lang_code, UI_MESSAGES["en-US"])
