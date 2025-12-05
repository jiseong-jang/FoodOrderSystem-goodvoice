from __future__ import annotations

from typing import Iterable, List
import functools
import threading

import httpx
from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.context import get_system_prompt, BASE_SYSTEM_PROMPT
from app.openai_client import get_openai_client
from app.order_summary import build_summary_prompt, parse_summary_text
from app.schemas import ChatMessage, OrderSummary

try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, GenerationConfig
    from peft import PeftModel
except Exception:  # noqa: BLE001
    torch = None
    AutoModelForCausalLM = None
    AutoTokenizer = None
    GenerationConfig = None
    PeftModel = None


def _with_system_prompt(messages: Iterable[ChatMessage]) -> List[ChatMessage]:
    messages = list(messages)
    if messages and messages[0].role == "system":
        return messages
    prompt = ChatMessage(role="system", content=get_system_prompt())
    return [prompt, *messages]


def _normalize_messages(messages: Iterable[ChatMessage]) -> List[dict]:
    """Convert ChatMessage objects to dict format for LLM API."""
    return [
        {"role": message.role, "content": message.content}
        for message in messages
    ]


async def _call_openai_chat(messages: List[dict], model: str) -> str:
    client = get_openai_client()

    def _create_chat_completion() -> str:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
        )
        choice = completion.choices[0].message.content if completion.choices else None
        if not choice:
            raise RuntimeError("OpenAI 응답이 비어 있습니다.")
        return choice

    return await run_in_threadpool(_create_chat_completion)


async def _call_hf_chat(
    messages: List[dict],
    endpoint: str,
    model: str,
    temperature: float,
    top_p: float,
    max_tokens: int,
) -> str:
    headers = {"Content-Type": "application/json"}
    token = settings.huggingface_token
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "max_tokens": max_tokens,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            if response.status_code >= 400:
                error_text = response.text[:500] if response.text else "Unknown error"
                print(f"[ERROR] HuggingFace API 호출 실패: {response.status_code}")
                print(f"[ERROR] Endpoint: {endpoint}")
                print(f"[ERROR] Response: {error_text}")
                raise HTTPException(status_code=502, detail=f"Hugging Face 호출 실패 ({response.status_code}): {error_text}")
            data = response.json()
    except httpx.TimeoutException:
        print(f"[ERROR] HuggingFace API 타임아웃: {endpoint}")
        raise HTTPException(status_code=504, detail="Hugging Face API 호출 타임아웃")
    except httpx.RequestError as e:
        print(f"[ERROR] HuggingFace API 요청 실패: {endpoint}")
        print(f"[ERROR] Error: {e}")
        raise HTTPException(status_code=502, detail=f"Hugging Face API 연결 실패: {str(e)}")

    return (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content")
        or data.get("generated_text")
        or data.get("text")
        or ""
    )


# -------- Output sanitization --------

def _strip_system_echo(text: str) -> str:
    """Remove accidental system-prompt echoes from model output."""
    cleaned = text or ""
    if BASE_SYSTEM_PROMPT and BASE_SYSTEM_PROMPT in cleaned:
        cleaned = cleaned.replace(BASE_SYSTEM_PROMPT, "")
    # Sometimes the model prepends 'system\n...' chunk; drop everything before the last 'assistant' or bullet/menu.
    markers = ["assistant", "Assistant", "안녕하세요", "- 발렌타인 디너", "- 프렌치 디너", "- 잉글리시 디너"]
    for marker in markers:
        idx = cleaned.rfind(marker)
        if idx != -1:
            cleaned = cleaned[idx:]
            break
    # Remove leading role prefixes like "assistant: ..." or "Assistant ..."
    lowered = cleaned.lstrip()
    if lowered.lower().startswith("assistant:"):
        cleaned = lowered[len("assistant:"):].lstrip()
    elif lowered.lower().startswith("assistant"):
        # e.g., "assistant\nHello" or "assistant Hello"
        cleaned = lowered[len("assistant"):].lstrip(" :\n-")
    return cleaned.strip()


# -------- Local (transformers + peft) --------
_local_lock = threading.Lock()
_local_loaded = {"model": None, "tokenizer": None}


def _load_local_model() -> tuple:
    with _local_lock:
        if _local_loaded["model"] is not None:
            return _local_loaded["model"], _local_loaded["tokenizer"]
        if torch is None or AutoModelForCausalLM is None or AutoTokenizer is None:
            raise RuntimeError("transformers/peft/torch가 설치되어 있지 않습니다.")

        base_id = settings.VOICE_ORDER_LOCAL_MODEL
        adapter_path = settings.VOICE_ORDER_LOCAL_ADAPTER
        if not base_id or not adapter_path:
            raise RuntimeError("local_finetune 사용 시 VOICE_ORDER_LOCAL_MODEL, VOICE_ORDER_LOCAL_ADAPTER를 설정하세요.")

        tokenizer = AutoTokenizer.from_pretrained(base_id, padding_side="left")
        if tokenizer.pad_token_id is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            base_id,
            torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float16,
            device_map="auto",
        )
        model = PeftModel.from_pretrained(model, adapter_path)
        model.eval()
        _local_loaded["model"] = model
        _local_loaded["tokenizer"] = tokenizer
        return model, tokenizer


def _generate_local(messages: List[dict], is_summary: bool = False) -> str:
    model, tokenizer = _load_local_model()
    max_new_tokens = settings.VOICE_ORDER_LOCAL_MAX_NEW_TOKENS
    temperature = settings.VOICE_ORDER_LOCAL_TEMPERATURE
    top_p = settings.VOICE_ORDER_LOCAL_TOP_P

    prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt").to(model.device)
    gen_cfg = GenerationConfig(
        max_new_tokens=max_new_tokens,
        temperature=temperature,
        top_p=top_p,
        do_sample=True,
        eos_token_id=tokenizer.eos_token_id,
        pad_token_id=tokenizer.pad_token_id,
    )
    with torch.no_grad():
        outputs = model.generate(prompt, generation_config=gen_cfg)
    text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    rendered = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    return text.replace(rendered, "").strip()


async def _generate_llm_response(messages: List[dict], is_summary: bool = False) -> str:
    """
    Unified LLM provider selection logic.
    Routes to OpenAI or HuggingFace based on settings.
    """
    provider = settings.VOICE_ORDER_LLM_PROVIDER.lower()

    if provider == "openai":
        model = settings.summary_model if is_summary else settings.VOICE_ORDER_CHAT_MODEL
        if not model:
            raise HTTPException(status_code=500, detail="OpenAI 모델이 설정되어 있지 않습니다.")
        raw = await _call_openai_chat(messages, model)
        return _strip_system_echo(raw)
    if provider == "local":
        raw = await run_in_threadpool(functools.partial(_generate_local, messages, is_summary))
        return _strip_system_echo(raw)

    # HuggingFace parameters
    if is_summary:
        raw = await _call_hf_chat(
            messages,
            settings.summary_hf_endpoint,
            settings.summary_hf_model,
            settings.VOICE_ORDER_SUMMARY_TEMPERATURE,
            settings.VOICE_ORDER_SUMMARY_TOP_P,
            settings.VOICE_ORDER_SUMMARY_MAX_TOKENS,
        )
        return _strip_system_echo(raw)

    # .env 파일에서 설정값 로드
    temperature = settings.VOICE_ORDER_HF_TEMPERATURE
    top_p = settings.VOICE_ORDER_HF_TOP_P
    max_tokens = settings.VOICE_ORDER_HF_MAX_TOKENS
    raw = await _call_hf_chat(
        messages,
        settings.VOICE_ORDER_HF_ENDPOINT,
        settings.VOICE_ORDER_HF_MODEL,
        temperature,
        top_p,
        max_tokens,
    )
    return _strip_system_echo(raw)


async def generate_completion(messages: List[ChatMessage]) -> str:
    scoped_messages = _with_system_prompt(messages)
    normalized = _normalize_messages(scoped_messages)
    return await _generate_llm_response(normalized, is_summary=False)


async def summarize_order(history: List[ChatMessage], final_message: str) -> OrderSummary:
    # history already has system prompt from generate_completion, no need to add again
    prompt_messages = build_summary_prompt(history, final_message, settings.VOICE_ORDER_ASSUMED_DELIVERY_DATE)
    raw_text = await _generate_llm_response(prompt_messages, is_summary=True)
    parsed = parse_summary_text(raw_text)
    return parsed
