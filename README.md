# 2026 AI Capstone — AI 상담 분석 플랫폼

멀티모달 감정 분석 + STT 기반 상담 기록 웹 플랫폼

---

## 아키텍처

```
┌─────────────────────────────────┐          ┌──────────────────┐
│         Web Server (:3000)      │  분석    │   AI Server      │
│  ┌───────────┐  ┌────────────┐ │  트리거   │   FastAPI (:8000) │
│  │  React    │  │  Express   │ │────────── │                  │
│  │  (정적)   │  │  (API)     │ │          │  Track A: STT    │
│  └───────────┘  └─────┬──────┘ │◄──────── │  Track B: 음향   │
│                       │        │  JSON    │  Track C: 융합   │
└───────────────────────┼────────┘          └──────────────────┘
                        │
                  ┌─────▼──────┐
                  │   AWS      │
                  │   S3       │
                  │   DynamoDB │
                  └────────────┘
```

프론트엔드와 백엔드는 **하나의 Express 서버**에서 동작합니다.
- React 빌드 파일 → Express가 정적 서빙
- API 요청 (`/api/*`) → Express가 처리
- AI 분석 요청 → AI 서버(FastAPI)로 전달

---

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일에서 AWS 키 등 설정
```

### 2. Docker Compose 실행

```bash
# 웹 서버만 실행 (AI 서버 없이 — 로컬 개발용)
docker compose up --build web

# 전체 실행 (웹 + AI 서버)
docker compose up --build

# GPU 환경 (NVIDIA 드라이버 + nvidia-container-toolkit 필요)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

| 서비스 | URL | 설명 |
|--------|-----|------|
| 웹 (프론트+백엔드) | http://localhost:3000 | React UI + Express API |
| AI 서버 Swagger | http://localhost:8000/docs | FastAPI 문서 |

### 3. 로컬 모드 (AWS 없이 개발)

`.env`에 `USE_LOCAL=true` (기본값) 설정 시 AWS 없이 동작합니다.
- S3 → `local-storage/` 폴더에 파일 저장
- DynamoDB → `local-storage/db.json` 에 세션 저장

AWS 연동 시 `USE_LOCAL=false`로 변경하면 자동 전환됩니다.

---

## 파트별 개발 방법

### 프론트엔드

```bash
# 1. 백엔드를 Docker로 띄움
docker compose up --build web

# 2. 다른 터미널에서 Vite 개발 서버 실행
cd frontend
npm install
npm run dev    # localhost:5173, API는 localhost:3000으로 프록시
```

`localhost:5173`에서 UI 작업하면 됩니다. API 호출은 자동으로 `localhost:3000`으로 연결됩니다.

### 백엔드

```bash
# Docker 없이 직접 실행
cd backend
npm install
USE_LOCAL=true node src/index.js    # localhost:3000
```

### AI 서버

```bash
# Docker로 실행
docker compose up --build ai-server

# 또는 직접 실행
cd ai-server
pip install -r requirements.txt
DEVICE=cpu uvicorn app.main:app --reload --port 8000
```

Swagger 문서: http://localhost:8000/docs

---

## API 검증 방법

서버 실행 후 터미널에서 테스트:

```bash
# 헬스체크
curl.exe http://localhost:3000/api/health
# → {"status":"ok","local":true}

# 오디오 업로드 (아무 파일이나 .mp3로 이름 바꿔서 테스트 가능)
curl.exe -X POST http://localhost:3000/api/upload -F "audio=@test.mp3"
# → {"sessionId":"xxxx-xxxx","status":"pending"}

# 세션 목록 조회
curl.exe http://localhost:3000/api/sessions
# → [{"sessionId":"xxxx-xxxx","status":"pending",...}]

# 세션 상세 조회
curl.exe http://localhost:3000/api/sessions/{sessionId}

# 오디오 스트리밍
curl.exe http://localhost:3000/api/sessions/{sessionId}/audio

# 세션 삭제
curl.exe -X DELETE http://localhost:3000/api/sessions/{sessionId}
# → {"deleted":true}
```

> **참고:** Mac/Linux에서는 `curl.exe` 대신 `curl`을 사용하세요.

---

## 프로젝트 구조

```
2026AICapstone/
├── docker-compose.yml           # 웹 + AI 서버 (컨테이너 2개)
├── docker-compose.gpu.yml       # GPU 환경 오버라이드
├── .env.example
├── .gitignore
│
├── ai-server/                   # FastAPI — 3-Track 분석
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py              # 엔드포인트 / 라이프사이클
│       ├── pipelines/
│       │   ├── track_a_stt.py   # Whisper + RoBERTa
│       │   ├── track_b_acoustic.py  # Wav2Vec2 / CNN
│       │   └── track_c_fusion.py    # Late Fusion
│       └── models/
│           └── emotion_cnn.py   # Mel-Spectrogram CNN
│
├── backend/                     # Express API + React 정적 서빙
│   ├── Dockerfile               # 프론트 빌드 → 백엔드 설치 통합
│   ├── package.json
│   └── src/
│       ├── index.js             # /api/* 라우트 + React 정적 서빙
│       ├── routes/
│       │   ├── upload.js        # POST /api/upload
│       │   └── analysis.js      # GET/DELETE /api/sessions
│       └── services/
│           ├── storage.js       # S3 / 로컬 자동 전환 래퍼
│           ├── storage.local.js # 로컬 파일시스템 (mock)
│           ├── s3.js            # AWS S3
│           ├── db.js            # DynamoDB / 로컬 자동 전환 래퍼
│           ├── db.local.js      # 로컬 JSON DB (mock)
│           ├── dynamodb.js      # AWS DynamoDB
│           └── aiClient.js      # AI 서버 호출
│
└── frontend/                    # React + Vite (빌드 후 Express에서 서빙)
    ├── Dockerfile               # 개발용 (독립 실행 시)
    ├── vite.config.js
    └── src/
        ├── App.jsx
        └── components/
            ├── Dashboard.jsx        # 세션 목록 + 업로드
            ├── SessionDetail.jsx    # 세션 상세 뷰
            ├── AudioPlayer.jsx      # 가사형 재생 + 세그먼트 하이라이트
            ├── EmotionChart.jsx     # 타임라인 / 파이 차트
            └── TranscriptViewer.jsx # 북마크 + 메모 에디터
```

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버 상태 확인 |
| POST | `/api/upload` | 오디오 파일 업로드 → S3 저장 → AI 분석 트리거 |
| GET | `/api/sessions` | 전체 세션 목록 조회 |
| GET | `/api/sessions/:id` | 세션 분석 결과 조회 |
| GET | `/api/sessions/:id/audio` | 오디오 스트리밍 (S3 presigned URL) |
| DELETE | `/api/sessions/:id` | 세션 삭제 (S3 + DynamoDB) |

---

## AI 파이프라인 상세

### Track A — STT + 텍스트 감성 (Lexical)
- **Whisper** (`base` 기본, `.env`로 변경 가능) → 전사 + 타임스탬프
- **화자 분리**: 에너지 갭 기반 규칙 (고도화 시 `pyannote-audio` 교체)
- **텍스트 감성**: `cardiffnlp/twitter-xlm-roberta-base-sentiment`

### Track B — 음향 감정 (Acoustic)
- **기본**: `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition`
- **옵션**: `/app/model_weights/emotion_cnn.pth` 존재 시 자체 CNN 자동 사용
- CNN 입력: Mel-Spectrogram (128x128), 출력: 7개 감정 클래스

### Track C — Late Fusion
- 텍스트(40%) + 음향(60%) 가중 평균
- 텍스트/음향 발랑스 차이 >= 1.2 → `sarcasm` (반어/비꼬기) 플래그

---

## CNN 모델 직접 학습 방법

```python
# Google Colab / 로컬에서 실행
from ai_server.app.models.emotion_cnn import EmotionCNN
import torch

model = EmotionCNN(num_classes=7)
# ... 학습 코드 ...
torch.save(model.state_dict(), "emotion_cnn.pth")
# pth 파일을 Docker volume ai-models 에 복사
```

---

## 역할 매핑

| 담당 | 영역 | 주요 파일 |
|------|------|-----------|
| 프론트엔드 | React UI/UX, 차트 | `frontend/src/` |
| 백엔드 | Express API, AWS 인프라, Docker | `backend/src/`, `docker-compose.yml` |
| AI 인프라 & STT | FastAPI, Track A | `ai-server/app/pipelines/track_a_stt.py` |
| ML 연구 | CNN, Track B/C | `ai-server/app/models/`, `track_b_acoustic.py`, `track_c_fusion.py` |
