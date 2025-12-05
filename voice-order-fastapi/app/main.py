from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from app.config import settings, APP_DIR, BASE_DIR as PROJECT_ROOT
from app.context import get_system_prompt
from app.conversation import (
    ORDER_CONFIRMATION_TOKEN,
    INITIAL_LANGUAGE,
    build_language_instruction,
    detect_language_code,
    get_ui_text,
    greeting_by_language,
)
from app.llm import generate_completion, summarize_order
from app.schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    OrderChangeRequest,
    OrderConfirmRequest,
    OrderConfirmResponse,
    OrderSummary,
)
from app.stt import transcribe_audio


app = FastAPI(title="Voice Order API (FastAPI)")

# CORS 설정: 여러 오리진 허용
# 1. 배포된 프론트엔드 URL을 최우선으로 하드코딩 (필수 - Render 배포 환경)
DEPLOYED_FRONTEND_URL = "https://foodordersystem-front.onrender.com"
allowed_origins = [DEPLOYED_FRONTEND_URL]

# 2. FRONTEND_URL 환경변수에서 프론트엔드 URL 가져오기 (동적 설정)
frontend_url_env = os.environ.get("FRONTEND_URL", "").strip()
if frontend_url_env:
    if not frontend_url_env.startswith("http://") and not frontend_url_env.startswith("https://"):
        frontend_url_env = f"https://{frontend_url_env}"
    if frontend_url_env not in allowed_origins:
        allowed_origins.append(frontend_url_env)

# 3. VOICE_ORDER_CLIENT_ORIGIN 환경변수에서 추가 오리진 가져오기
client_origin_str = settings.VOICE_ORDER_CLIENT_ORIGIN
if client_origin_str:
    origins_from_settings = client_origin_str.split(",") if "," in client_origin_str else [client_origin_str]
    for origin in origins_from_settings:
        origin = origin.strip()
        if origin:
            # http:// 또는 https://가 없으면 추가
            if not origin.startswith("http://") and not origin.startswith("https://"):
                origin = f"http://{origin}"
            if origin not in allowed_origins:
                allowed_origins.append(origin)

# 4. 로컬 개발용 기본 오리진 추가
local_origins = [
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
]
for local_origin in local_origins:
    if local_origin not in allowed_origins:
        allowed_origins.append(local_origin)

# 5. 배포된 프론트엔드 URL 최종 확인 (이중 안전장치)
if DEPLOYED_FRONTEND_URL not in allowed_origins:
    allowed_origins.insert(0, DEPLOYED_FRONTEND_URL)  # 맨 앞에 추가

# 6. 중복 제거 및 빈 문자열 필터링
allowed_origins = [origin for origin in allowed_origins if origin and origin.strip()]
allowed_origins = list(dict.fromkeys(allowed_origins))

# CORS 설정 로그 출력 (디버깅용)
print("=" * 60)
print("[CORS 설정]")
print(f"  배포된 프론트엔드 URL: {DEPLOYED_FRONTEND_URL}")
print(f"  FRONTEND_URL 환경변수: {frontend_url_env or '(설정되지 않음)'}")
print(f"  VOICE_ORDER_CLIENT_ORIGIN: {client_origin_str or '(기본값 사용)'}")
print(f"  최종 허용 오리진 목록 ({len(allowed_origins)}개):")
for i, origin in enumerate(allowed_origins, 1):
    marker = "★" if origin == DEPLOYED_FRONTEND_URL else " "
    print(f"    {i}. {marker} {origin}")
print("=" * 60)
print(f"[OK] LLM Provider: {settings.VOICE_ORDER_LLM_PROVIDER}")
print(f"[OK] 서버 포트: {settings.VOICE_ORDER_SERVER_PORT}")
print(
    f"[OK] HF endpoint/model: {getattr(settings, 'VOICE_ORDER_HF_ENDPOINT', None)} / "
    f"{getattr(settings, 'VOICE_ORDER_HF_MODEL', None)} "
    f"(preset={getattr(settings, 'VOICE_ORDER_MODEL_PRESET', None)})"
)

# CORS 미들웨어 설정 - 프론트엔드 URL을 명시적으로 포함
# allow_origins에 "https://foodordersystem-front.onrender.com"이 포함되어 있음
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

orders_dir = (
    Path(settings.VOICE_ORDER_ORDER_DIR).resolve()
    if settings.VOICE_ORDER_ORDER_DIR
    else APP_DIR / "data" / "orders"
)
orders_dir.mkdir(parents=True, exist_ok=True)
static_dir = APP_DIR / "static"


@app.get("/health")
def health_check():
    """Health check endpoint for frontend."""
    return {"status": "ok"}


@app.get("/config/model-info")
async def fetch_model_info() -> dict:
    """Return current LLM routing info (provider, endpoints, models, preset)."""
    return {
        "preset": settings.VOICE_ORDER_MODEL_PRESET,
        "provider": settings.VOICE_ORDER_LLM_PROVIDER,
        "hf": {
            "endpoint": settings.VOICE_ORDER_HF_ENDPOINT,
            "model": settings.VOICE_ORDER_HF_MODEL,
            "base_endpoint": getattr(settings, "VOICE_ORDER_HF_BASE_ENDPOINT", None),
            "base_model": getattr(settings, "VOICE_ORDER_HF_BASE_MODEL", None),
            "finetune_endpoint": getattr(settings, "VOICE_ORDER_HF_FINETUNE_ENDPOINT", None),
            "finetune_model": getattr(settings, "VOICE_ORDER_HF_FINETUNE_MODEL", None),
        },
        "openai": {
            "model": settings.VOICE_ORDER_CHAT_MODEL,
        },
        "local": {
            "model": settings.VOICE_ORDER_LOCAL_MODEL,
            "adapter": settings.VOICE_ORDER_LOCAL_ADAPTER,
        },
    }


@app.get("/config/system-prompt")
async def fetch_system_prompt() -> dict:
    return {"prompt": get_system_prompt()}


@app.get("/config/order-token")
async def fetch_order_token() -> dict:
    return {"token": ORDER_CONFIRMATION_TOKEN}


@app.get("/config/initial-language")
async def fetch_initial_language() -> dict:
    return {"language": INITIAL_LANGUAGE}


@app.get("/config/ui-text")
async def fetch_ui_text(lang: str = INITIAL_LANGUAGE) -> dict:
    return {"language": lang, "messages": get_ui_text(lang)}


@app.get("/config/greeting")
async def fetch_greeting(lang: str = INITIAL_LANGUAGE, name: str = "고객님") -> dict:
    return {"greeting": greeting_by_language(lang, name)}


@app.get("/config/language-instruction")
async def fetch_language_instruction(lang: str = INITIAL_LANGUAGE) -> dict:
    return {"instruction": build_language_instruction(lang)}


@app.post("/utils/detect-language")
async def api_detect_language(payload: dict) -> dict:
    text = payload.get("text", "")
    return {"language": detect_language_code(text)}


if static_dir.exists():
    app.mount("/demo", StaticFiles(directory=static_dir, html=True), name="static")


@app.get("/")
async def root() -> RedirectResponse:
    if static_dir.exists():
        return RedirectResponse("/demo/", status_code=302)
    return RedirectResponse("/health", status_code=302)


async def _save_order(
    history: list[ChatMessage],
    final_message: str,
    *,
    existing_order_id: str | None = None,
    order_type: str = "주문확정",
) -> tuple[str, OrderSummary]:
    """Save order to JSON file and return order ID and summary."""
    try:
        summary = await summarize_order(history, final_message)
    except Exception as e:
        print(f"[ERROR] 주문 요약 생성 실패: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"주문 요약 생성 실패: {str(e)}")
    
    confirmed_at = datetime.utcnow().isoformat()

    if existing_order_id:
        base_id = existing_order_id.strip()
    elif summary.orderId and summary.orderId.strip():
        base_id = summary.orderId.strip()
    else:
        base_id = f"order-{confirmed_at.replace(':', '-').replace('.', '-')}"
    safe_id = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in base_id).lower()

    summary.orderId = safe_id
    summary.orderTime = confirmed_at

    order_record = {
        "orderType": order_type,
        "orderId": safe_id,
        "confirmedAt": confirmed_at,
        "summary": summary.model_dump(),
    }

    order_path = orders_dir / f"{safe_id}.json"
    order_path.parent.mkdir(parents=True, exist_ok=True)
    order_path.write_text(
        json.dumps(order_record, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return safe_id, summary


@app.post("/api/llm/generate", response_model=ChatResponse)
async def llm_generate(payload: ChatRequest) -> ChatResponse:
    if not payload.messages:
        raise HTTPException(status_code=400, detail="messages 배열이 필요합니다.")

    try:
        reply = await generate_completion(payload.messages)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] LLM 생성 실패: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"LLM 생성 실패: {str(e)}")

    # Check if order is confirmed
    if ORDER_CONFIRMATION_TOKEN in reply:
        # Auto-save order when confirmation token is detected
        try:
            order_id, summary = await _save_order(
                payload.messages,
                reply,
                order_type="주문확정",
            )
            # Remove confirmation token from user-facing message
            clean_message = reply.replace(ORDER_CONFIRMATION_TOKEN, "").strip()
            return ChatResponse(
                message=clean_message,
                orderConfirmed=True,
                orderId=order_id,
                order=summary
            )
        except Exception as e:
            # If order saving fails, still return the message but log the error
            print(f"Warning: Failed to auto-save order: {e}")
            clean_message = reply.replace(ORDER_CONFIRMATION_TOKEN, "").strip()
            return ChatResponse(message=clean_message, orderConfirmed=False)

    return ChatResponse(message=reply, orderConfirmed=False)


@app.post("/api/stt/transcribe")
async def stt_transcribe(file: UploadFile = File(...), language: str | None = None) -> dict:
    transcript = await transcribe_audio(file, language)
    return {"transcript": transcript}


@app.post("/api/order/confirm", response_model=OrderConfirmResponse)
async def order_confirm(payload: OrderConfirmRequest) -> OrderConfirmResponse:
    if not payload.history:
        raise HTTPException(status_code=400, detail="history가 비어 있습니다.")

    order_id, summary = await _save_order(
        payload.history,
        payload.finalMessage or "",
        order_type="주문확정",
    )

    return OrderConfirmResponse(
        orderId=order_id,
        confirmedAt=summary.orderTime or datetime.utcnow().isoformat(),
        order=summary,
    )


@app.post("/api/order/change", response_model=OrderConfirmResponse)
async def order_change(payload: OrderChangeRequest) -> OrderConfirmResponse:
    if not payload.history:
        raise HTTPException(status_code=400, detail="history가 비어 있습니다.")
    if not payload.orderId or not payload.orderId.strip():
        raise HTTPException(status_code=400, detail="orderId가 필요합니다.")

    target_path = orders_dir / f"{payload.orderId}.json"
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="해당 orderId를 찾을 수 없습니다.")

    order_id, summary = await _save_order(
        payload.history,
        payload.finalMessage or "",
        existing_order_id=payload.orderId,
        order_type="주문변경",
    )

    return OrderConfirmResponse(
        orderId=order_id,
        confirmedAt=summary.orderTime or datetime.utcnow().isoformat(),
        order=summary,
    )
