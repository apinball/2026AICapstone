# 2026 AI Capstone — AI 상담 분석 플랫폼

멀티모달 감정 분석 + STT 기반 상담 기록 웹 플랫폼

---

## 아키텍처

```
┌──────────────┐   오디오 업로드   ┌──────────────┐   분석 트리거   ┌──────────────────┐
│   Frontend   │ ──────────────── │   Backend    │ ─────────────  │   AI Server      │
│  React/Vite  │                  │  Node.js     │                │  FastAPI         │
│  port 5173   │ ◄──────────────  │  port 3000   │ ◄────────────  │  port 8000       │
└──────────────┘   세션 결과 조회  └──────┬───────┘  JSON 결과     └──────────────────┘
                                          │                        Track A: Whisper STT
                                    ┌─────▼──────┐                Track B: Wav2Vec2/CNN
                                    │  AWS       │                Track C: Late Fusion
                                    │  S3        │
                                    │  DynamoDB  │
                                    └────────────┘
```

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일에서 AWS 키 등 설정
```

### 2. Docker Compose 실행

```bash
# CPU 환경 (개발용)
docker compose up --build

# GPU 환경 (NVIDIA 드라이버 + nvidia-container-toolkit 필요)
DEVICE=cuda docker compose up --build
```

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:5173 |
| 백엔드 API | http://localhost:3000 |
| AI 서버 Swagger | http://localhost:8000/docs |

---

## 프로젝트 구조

```
2026AICapstone/
├── docker-compose.yml
├── .env.example
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
├── backend/                     # Node.js Express API
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── routes/
│       │   ├── upload.js        # POST /upload
│       │   └── analysis.js      # GET /sessions
│       └── services/
│           ├── s3.js            # AWS S3
│           ├── dynamodb.js      # AWS DynamoDB
│           └── aiClient.js      # AI 서버 호출
│
└── frontend/                    # React + Vite
    ├── Dockerfile
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

## AI 파이프라인 상세

### Track A — STT + 텍스트 감성 (Lexical)
- **Whisper** (`base` 기본, `.env`로 변경 가능) → 전사 + 타임스탬프
- **화자 분리**: 에너지 갭 기반 규칙 (고도화 시 `pyannote-audio` 교체)
- **텍스트 감성**: `cardiffnlp/twitter-xlm-roberta-base-sentiment`

### Track B — 음향 감정 (Acoustic)
- **기본**: `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition`
- **옵션**: `/app/model_weights/emotion_cnn.pth` 존재 시 자체 CNN 자동 사용
- CNN 입력: Mel-Spectrogram (128×128), 출력: 7개 감정 클래스

### Track C — Late Fusion
- 텍스트(40%) + 음향(60%) 가중 평균
- 텍스트/음향 발랑스 차이 ≥ 1.2 → `sarcasm` (반어/비꼬기) 플래그

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

## 팀원 역할 매핑

| 팀원 | 담당 영역 | 주요 파일 |
|------|----------|-----------|
| A (프론트엔드) | React UI/UX, 차트 | `frontend/src/` |
| B (백엔드) | AWS, Node.js | `backend/src/` |
| C (AI 인프라 & STT) | FastAPI, Track A | `ai-server/app/pipelines/track_a_stt.py` |
| D (ML 연구) | CNN, Track B/C | `ai-server/app/models/`, `track_b_acoustic.py`, `track_c_fusion.py` |