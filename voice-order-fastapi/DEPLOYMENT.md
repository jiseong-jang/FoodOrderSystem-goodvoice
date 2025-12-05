# 음성인식 API 배포 가이드

이 레포지토리는 음성인식 API(FastAPI)만 포함되어 있습니다.

## Render 배포 방법

### 방법 1: render.yaml 사용 (추천)

1. **GitHub에 레포지토리 푸시**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Render 대시보드에서 배포**
   - [Render](https://render.com/) 접속
   - "New" → "Blueprint" 선택
   - GitHub 레포지토리 연결
   - Render가 자동으로 `render.yaml`을 인식하여 서비스 생성

3. **환경 변수 설정**
   Render 대시보드 → 서비스 → "Environment" 탭에서 다음 변수 설정:
   ```env
   VOICE_ORDER_CLIENT_ORIGIN=https://[프론트엔드 URL].onrender.com
   VOICE_ORDER_MODEL_PRESET=openai
   OPENAI_API_KEY=[OpenAI API 키]
   VOICE_ORDER_CHAT_MODEL=gpt-4o-mini
   ```
   
   Hugging Face 사용 시 추가:
   ```env
   VOICE_ORDER_MODEL_PRESET=hf_base
   VOICE_ORDER_HF_BASE_ENDPOINT=https://router.huggingface.co/v1/chat/completions
   VOICE_ORDER_HF_BASE_MODEL=meta-llama/Llama-3.1-8B-Instruct
   HF_TOKEN=[Hugging Face 토큰]
   ```

### 방법 2: 수동 설정

1. **Render 대시보드 접속**
   - [Render](https://render.com/)에 로그인

2. **새 Web Service 생성**
   - "New" → "Web Service" 선택
   - GitHub 레포지토리 연결
   - 다음 설정 입력:
     - **Name**: `mrdinner-voice-api`
     - **Environment**: `Python 3`
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
     - **Root Directory**: (비워두기 - 루트가 voice-order-fastapi 폴더이므로)

3. **환경 변수 설정** (위와 동일)

## 환경 변수 설명

### 필수 변수
- `VOICE_ORDER_CLIENT_ORIGIN`: 프론트엔드 URL (CORS 설정용)
- `VOICE_ORDER_MODEL_PRESET`: 모델 프리셋 (`openai`, `hf_base`, `hf_finetune`, `local_finetune`)
- `OPENAI_API_KEY`: OpenAI API 키 (openai 프리셋 사용 시)

### 선택 변수
- `VOICE_ORDER_CHAT_MODEL`: 사용할 모델명 (기본값: `gpt-4o-mini`)
- `VOICE_ORDER_HF_BASE_ENDPOINT`: Hugging Face 베이스 엔드포인트
- `VOICE_ORDER_HF_BASE_MODEL`: Hugging Face 베이스 모델
- `VOICE_ORDER_HF_FINETUNE_ENDPOINT`: Hugging Face 파인튜닝 엔드포인트
- `VOICE_ORDER_HF_FINETUNE_MODEL`: Hugging Face 파인튜닝 모델
- `HF_TOKEN` 또는 `VOICE_ORDER_HF_TOKEN`: Hugging Face 토큰
- `VOICE_ORDER_ASSUMED_DELIVERY_DATE`: 배달 날짜 (기본값: `2025-12-08`)

## 배포 후 확인

- 음성인식 API URL: `https://[서비스명].onrender.com`
- 헬스 체크: `https://[서비스명].onrender.com/health`

