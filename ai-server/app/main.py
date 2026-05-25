"""
AI Inference Server — FastAPI
4-Track 멀티모달 상담 분석 파이프라인:
  Track A: Whisper STT + RoBERTa 텍스트 감성 분석 + pyannote 화자 분리
  Track B: Wav2Vec2 / CNN 음향 감정 분류
  Track C: Late Fusion (가중 평균)
  Track D: 치료 동맹 균열 감지 (Safran & Muran Alliance Rupture)
"""

import os
import tempfile
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import httpx
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pipelines.track_a_stt import STTPipeline
from pipelines.track_b_acoustic import AcousticPipeline
from pipelines.track_c_fusion import FusionPipeline
from pipelines.track_d_rupture import RupturePipeline
from pipelines.summary import SummaryPipeline
from pipelines.redaction import RedactionPipeline
from llm.factory import get_llm_provider

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

    # LLM 기반 파이프라인 (Track D + Summary + Redaction)
    try:
        llm = get_llm_provider()
        pipelines["rupture"] = RupturePipeline(llm)
        pipelines["summary"] = SummaryPipeline(llm)
        pipelines["redaction"] = RedactionPipeline(llm)
        print(f"[startup] LLM pipelines ready (provider: {llm.name})")
    except Exception as e:
        print(f"[startup] LLM pipelines init failed: {e}")

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


# ── Track D — Rupture 감지 엔드포인트 ────────────────────────────────────


class RuptureSegment(BaseModel):
    start: float
    end: float
    speaker: str
    text: str


class RuptureRequest(BaseModel):
    segments: list[RuptureSegment]
    callback_url: Optional[str] = None    # 비동기 처리 시 결과 POST할 백엔드 URL
    session_id: Optional[str] = None      # callback에 같이 보낼 식별자


class RuptureEvent(BaseModel):
    rupture_type: str
    intensity: int
    evidence: list[str]
    recommendation: str
    window_start_idx: int
    window_end_idx: int
    window_start_time: float
    window_end_time: float


class RuptureResponse(BaseModel):
    count: int
    events: list[RuptureEvent]


async def _post_callback(callback_url: str, payload: dict):
    """결과를 백엔드 callback URL로 POST. 실패 시 로그만 남김."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(callback_url, json=payload)
            if r.status_code >= 400:
                print(f"[callback] {callback_url} returned {r.status_code}: {r.text[:200]}")
            else:
                print(f"[callback] Posted to {callback_url} (status {r.status_code})")
    except Exception as e:
        print(f"[callback] Failed to POST {callback_url}: {e}")


async def _process_rupture_async(segments: list[dict], callback_url: str, session_id: str):
    rupture = pipelines.get("rupture")
    if rupture is None:
        await _post_callback(callback_url, {"sessionId": session_id, "error": "pipeline not initialized"})
        return
    try:
        events = await rupture.detect(segments)
        await _post_callback(callback_url, {"sessionId": session_id, "events": events})
    except Exception as e:
        traceback.print_exc()
        await _post_callback(callback_url, {"sessionId": session_id, "error": str(e)})


@app.post("/analyze/rupture", response_model=RuptureResponse)
async def analyze_rupture(request: RuptureRequest, background_tasks: BackgroundTasks):
    """
    이미 STT/화자 분리된 segments를 받아 sliding window로 LLM 호출 → rupture 감지.
    callback_url 제공 시: 즉시 202 응답 후 백그라운드 처리, 완료 시 callback URL로 POST.
    callback_url 없으면: 동기 처리 (긴 오디오는 권장하지 않음).
    """
    rupture = pipelines.get("rupture")
    if rupture is None:
        raise HTTPException(status_code=503, detail="Rupture pipeline not initialized")

    segments_dict = [s.model_dump() for s in request.segments]

    if request.callback_url and request.session_id:
        background_tasks.add_task(
            _process_rupture_async, segments_dict, request.callback_url, request.session_id
        )
        return RuptureResponse(count=0, events=[])

    events = await rupture.detect(segments_dict)
    return RuptureResponse(count=len(events), events=events)


# ── 상담 요약 엔드포인트 ──────────────────────────────────────────────────


class SummaryResponse(BaseModel):
    headline: str
    main_topics: list[str]
    client_issues: list[str]
    counselor_approach: str
    emotional_flow: str
    action_items: list[str]


async def _process_summary_async(segments: list[dict], callback_url: str, session_id: str):
    summary = pipelines.get("summary")
    if summary is None:
        await _post_callback(callback_url, {"sessionId": session_id, "error": "pipeline not initialized"})
        return
    try:
        result = await summary.summarize(segments)
        await _post_callback(callback_url, {"sessionId": session_id, "summary": result})
    except Exception as e:
        traceback.print_exc()
        await _post_callback(callback_url, {"sessionId": session_id, "error": str(e)})


@app.post("/analyze/summary", response_model=SummaryResponse)
async def analyze_summary(request: RuptureRequest, background_tasks: BackgroundTasks):
    """
    segments를 받아 슈퍼바이저 보고용 요약 생성.
    callback_url 제공 시 비동기 처리.
    """
    summary = pipelines.get("summary")
    if summary is None:
        raise HTTPException(status_code=503, detail="Summary pipeline not initialized")

    segments_dict = [s.model_dump() for s in request.segments]

    if request.callback_url and request.session_id:
        background_tasks.add_task(
            _process_summary_async, segments_dict, request.callback_url, request.session_id
        )
        return SummaryResponse(
            headline="", main_topics=[], client_issues=[],
            counselor_approach="", emotional_flow="", action_items=[]
        )

    try:
        result = await summary.summarize(segments_dict)
        return SummaryResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary failed: {e}")


# ── 비식별화 엔드포인트 ──────────────────────────────────────────────────


class RedactionResponse(BaseModel):
    redacted: list[str]


async def _process_redaction_async(segments: list[dict], callback_url: str, session_id: str):
    redaction = pipelines.get("redaction")
    if redaction is None:
        await _post_callback(callback_url, {"sessionId": session_id, "error": "pipeline not initialized"})
        return
    try:
        redacted = await redaction.redact(segments)
        await _post_callback(callback_url, {"sessionId": session_id, "redacted": redacted})
    except Exception as e:
        traceback.print_exc()
        await _post_callback(callback_url, {"sessionId": session_id, "error": str(e)})


@app.post("/analyze/redaction", response_model=RedactionResponse)
async def analyze_redaction(request: RuptureRequest, background_tasks: BackgroundTasks):
    """
    segments의 텍스트에서 개인 식별 정보를 토큰으로 치환.
    callback_url 제공 시 비동기 처리.
    """
    redaction = pipelines.get("redaction")
    if redaction is None:
        raise HTTPException(status_code=503, detail="Redaction pipeline not initialized")

    segments_dict = [s.model_dump() for s in request.segments]

    if request.callback_url and request.session_id:
        background_tasks.add_task(
            _process_redaction_async, segments_dict, request.callback_url, request.session_id
        )
        return RedactionResponse(redacted=[])

    redacted = await redaction.redact(segments_dict)
    return RedactionResponse(redacted=redacted)


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
