"""
AI Inference Server — FastAPI
3-Track 멀티모달 감정 분석 파이프라인:
  Track A: Whisper STT + RoBERTa 텍스트 감성 분석
  Track B: Wav2Vec2 / CNN 음향 감정 분류
  Track C: Late Fusion (가중 평균)
"""

import os
import tempfile
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pipelines.track_a_stt import STTPipeline
from pipelines.track_b_acoustic import AcousticPipeline
from pipelines.track_c_fusion import FusionPipeline

# ── 전역 파이프라인 인스턴스 ────────────────────────────────────────────────
pipelines: dict = {}


def resolve_device() -> str:
    """환경변수 DEVICE를 읽되, cuda 미가용 시 cpu로 자동 fallback."""
    requested = os.getenv("DEVICE", "cpu").lower()
    if requested == "cuda" and not torch.cuda.is_available():
        print("[startup] DEVICE=cuda requested but CUDA unavailable — falling back to cpu")
        return "cpu"
    return requested


@asynccontextmanager
async def lifespan(app: FastAPI):
    device = resolve_device()
    whisper_size = os.getenv("WHISPER_MODEL_SIZE", "base")

    print(f"[startup] Loading models on device={device}, whisper={whisper_size}")
    pipelines["stt"] = STTPipeline(model_size=whisper_size, device=device)
    pipelines["acoustic"] = AcousticPipeline(device=device)
    pipelines["fusion"] = FusionPipeline()
    print("[startup] All models loaded.")
    yield
    pipelines.clear()


app = FastAPI(
    title="AI Counseling Server",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 응답 스키마 ────────────────────────────────────────────────────────────


class Segment(BaseModel):
    start: float
    end: float
    speaker: str          # "counselor" | "client" | "unknown"
    text: str
    text_emotion: str     # Track A 결과
    text_emotion_score: float


class AnalysisResult(BaseModel):
    session_id: str
    segments: list[Segment]
    acoustic_emotion: str         # Track B 전체 오디오 결과
    acoustic_emotion_score: float
    final_emotion: str            # Track C 융합 결과
    final_emotion_score: float
    counselor_talk_ratio: float   # 상담사 발화 비율 (0~1)
    summary_emotions: dict        # 감정별 등장 비율


# ── 엔드포인트 ─────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": list(pipelines.keys())}


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_audio(
    session_id: str,
    file: UploadFile = File(...),
):
    """
    오디오 파일(.m4a, .wav, .mp3)을 받아 3-Track 분석 후 결과 반환.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = Path(file.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # Track A — STT + 텍스트 감성
        stt_result = pipelines["stt"].run(tmp_path)

        if not stt_result["segments"]:
            raise HTTPException(status_code=422, detail="No speech detected in audio")

        # Track B — 음향 감정 (전체 오디오 기준)
        acoustic_emotion, acoustic_score = pipelines["acoustic"].run(tmp_path)

        # Track C — Late Fusion
        final_emotion, final_score = pipelines["fusion"].run(
            text_segments=stt_result["segments"],
            acoustic_emotion=acoustic_emotion,
            acoustic_score=acoustic_score,
        )

        # 상담사 발화 비율 계산
        total_duration = sum(
            s["end"] - s["start"] for s in stt_result["segments"]
        ) or 1
        counselor_duration = sum(
            s["end"] - s["start"]
            for s in stt_result["segments"]
            if s["speaker"] == "counselor"
        )
        counselor_ratio = counselor_duration / total_duration

        # 감정별 등장 비율 집계
        emotion_counts: dict[str, int] = {}
        for seg in stt_result["segments"]:
            e = seg["text_emotion"]
            emotion_counts[e] = emotion_counts.get(e, 0) + 1
        total_segs = len(stt_result["segments"]) or 1
        summary_emotions = {k: round(v / total_segs, 3) for k, v in emotion_counts.items()}

        segments = [
            Segment(
                start=s["start"],
                end=s["end"],
                speaker=s["speaker"],
                text=s["text"],
                text_emotion=s["text_emotion"],
                text_emotion_score=s["text_emotion_score"],
            )
            for s in stt_result["segments"]
        ]

        return AnalysisResult(
            session_id=session_id,
            segments=segments,
            acoustic_emotion=acoustic_emotion,
            acoustic_emotion_score=round(acoustic_score, 4),
            final_emotion=final_emotion,
            final_emotion_score=round(final_score, 4),
            counselor_talk_ratio=round(counselor_ratio, 4),
            summary_emotions=summary_emotions,
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
