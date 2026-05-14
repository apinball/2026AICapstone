"""
01_diarization.py
─────────────────
1. pyannote.audio로 발화자 분리 (diarization)
2. WhisperX로 단어 단위 정렬 포함 전사 (word-level alignment)
3. 발화 세그먼트별 JSON 저장

출력 형식 (outputs/transcripts.json):
[
  {
    "segment_id": 0,
    "speaker":    "SPEAKER_00",
    "start":      1.23,
    "end":        4.56,
    "text":       "안녕하세요",
    "audio_path": "outputs/segments/seg_000.wav"
  },
  ...
]

사용법:
  python 01_diarization.py --audio path/to/recording.wav \
                           --hf_token YOUR_HF_TOKEN
"""

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from tqdm import tqdm

from config import (DATA_DIR, OUTPUT_DIR, SAMPLE_RATE,
                    MIN_DURATION, NUM_SPEAKERS, WHISPER_MODEL, LANGUAGE)

SEGMENT_DIR = OUTPUT_DIR / "segments"
SEGMENT_DIR.mkdir(exist_ok=True)


# ──────────────────────────────────────────────────────────────
# 발화자 분리
# ──────────────────────────────────────────────────────────────
def run_diarization(audio_path: Path, hf_token: str):
    """
    pyannote.audio 3.x 파이프라인으로 발화자 분리 수행.
    반환: pyannote Timeline (segment → speaker 매핑)
    """
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=hf_token
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pipeline.to(device)

    print(f"[1/3] 발화자 분리 중: {audio_path.name}")
    diarization = pipeline(
        str(audio_path),
        num_speakers=NUM_SPEAKERS
    )
    return diarization


# ──────────────────────────────────────────────────────────────
# WhisperX STT + 단어 정렬
# ──────────────────────────────────────────────────────────────
def run_whisperx(audio_path: Path, hf_token: str):
    """
    WhisperX: Whisper 전사 + 단어 단위 타임스탬프 정렬.
    반환: dict (whisperx result with word-level alignment)
    """
    import whisperx

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    print(f"[2/3] WhisperX 전사 중 (model={WHISPER_MODEL}) ...")
    model = whisperx.load_model(WHISPER_MODEL, device, compute_type=compute_type)
    audio = whisperx.load_audio(str(audio_path))
    result = model.transcribe(audio, language=LANGUAGE, batch_size=16)

    # 단어 단위 정렬
    align_model, metadata = whisperx.load_align_model(
        language_code=LANGUAGE, device=device
    )
    result = whisperx.align(
        result["segments"], align_model, metadata, audio, device
    )

    # 발화자 ID 부여
    diarize_model = whisperx.DiarizationPipeline(
        use_auth_token=hf_token, device=device
    )
    diarize_segments = diarize_model(audio, num_speakers=NUM_SPEAKERS)
    result = whisperx.assign_word_speakers(diarize_segments, result)

    return result


# ──────────────────────────────────────────────────────────────
# 세그먼트 wav 추출
# ──────────────────────────────────────────────────────────────
def extract_segment_audio(
    full_audio: np.ndarray,
    sr: int,
    start: float,
    end: float,
    seg_id: int
) -> Path:
    """발화 구간을 잘라서 wav로 저장하고 경로 반환."""
    s = int(start * sr)
    e = int(end * sr)
    chunk = full_audio[s:e]
    out_path = SEGMENT_DIR / f"seg_{seg_id:04d}.wav"
    sf.write(str(out_path), chunk, sr)
    return out_path


# ──────────────────────────────────────────────────────────────
# 세그먼트 병합: diarization + whisperx
# ──────────────────────────────────────────────────────────────
def merge_segments(whisperx_result: dict, audio: np.ndarray, sr: int) -> list[dict]:
    """
    WhisperX 결과에서 segment별 발화자, 텍스트, 타임스탬프 추출.
    MIN_DURATION보다 짧은 세그먼트는 건너뜁니다.
    """
    records = []
    seg_id = 0

    for seg in tqdm(whisperx_result.get("segments", []), desc="[3/3] 세그먼트 구성"):
        start   = seg.get("start", 0.0)
        end     = seg.get("end", 0.0)
        text    = seg.get("text", "").strip()
        speaker = seg.get("speaker", "UNKNOWN")

        if (end - start) < MIN_DURATION or not text:
            continue

        audio_path = extract_segment_audio(audio, sr, start, end, seg_id)

        records.append({
            "segment_id": seg_id,
            "speaker":    speaker,
            "start":      round(start, 3),
            "end":        round(end, 3),
            "duration":   round(end - start, 3),
            "text":       text,
            "audio_path": str(audio_path),
            "label":      None,   # 수동 레이블링 후 채움
        })
        seg_id += 1

    return records


# ──────────────────────────────────────────────────────────────
# 폴백: 순수 pyannote + Whisper (WhisperX 없을 때)
# ──────────────────────────────────────────────────────────────
def run_fallback_pipeline(audio_path: Path, hf_token: str):
    """
    WhisperX 설치가 없을 때 사용하는 폴백.
    pyannote diarization + openai-whisper STT 조합.
    """
    import whisper
    from pyannote.audio import Pipeline

    print("[FALLBACK] pyannote + openai-whisper 사용")
    device = "cuda" if torch.cuda.is_available() else "cpu"

    # 발화자 분리
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1", use_auth_token=hf_token
    )
    pipeline.to(torch.device(device))
    diarization = pipeline(str(audio_path), num_speakers=NUM_SPEAKERS)

    # Whisper 전사
    model = whisper.load_model(WHISPER_MODEL, device=device)
    w_result = model.transcribe(str(audio_path), language=LANGUAGE)

    audio, sr = sf.read(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    # diarization 구간 × whisper 세그먼트 교차 매핑
    records = []
    seg_id = 0
    whisper_segs = w_result["segments"]

    for turn, _, speaker in diarization.itertracks(yield_label=True):
        d_start, d_end = turn.start, turn.end
        # 해당 구간과 겹치는 whisper 세그먼트 텍스트 합치기
        texts = []
        for ws in whisper_segs:
            ws_s, ws_e = ws["start"], ws["end"]
            overlap = min(d_end, ws_e) - max(d_start, ws_s)
            if overlap > 0:
                texts.append(ws["text"].strip())

        text = " ".join(texts).strip()
        if not text or (d_end - d_start) < MIN_DURATION:
            continue

        audio_path_seg = extract_segment_audio(audio, sr, d_start, d_end, seg_id)
        records.append({
            "segment_id": seg_id,
            "speaker":    speaker,
            "start":      round(d_start, 3),
            "end":        round(d_end, 3),
            "duration":   round(d_end - d_start, 3),
            "text":       text,
            "audio_path": str(audio_path_seg),
            "label":      None,
        })
        seg_id += 1

    return records


# ──────────────────────────────────────────────────────────────
# 레이블 인터랙티브 보조 (선택)
# ──────────────────────────────────────────────────────────────
def auto_label_with_sentiment(records: list[dict]) -> list[dict]:
    """
    KSentiment / KLUE 감성 분석 모델로 초기 레이블 자동 부여.
    연구자가 검토 후 수정하는 silver label 용도.
    """
    try:
        from transformers import pipeline as hf_pipeline
        print("자동 레이블링 중 (klue/roberta-base-sentiment)...")
        sentiment = hf_pipeline(
            "text-classification",
            model="snunlp/KR-FinBert-SC",
            device=0 if torch.cuda.is_available() else -1,
            top_k=1,
        )
        label_map = {"positive": "긍정", "negative": "부정", "neutral": "중립"}
        for rec in tqdm(records, desc="Auto-labeling"):
            if not rec["text"]:
                continue
            pred = sentiment(rec["text"][:512])[0]
            raw  = pred["label"].lower()
            rec["label"]      = label_map.get(raw, "중립")
            rec["label_conf"] = round(pred["score"], 4)
    except Exception as e:
        print(f"[WARN] 자동 레이블링 실패: {e}")
    return records


# ──────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="발화자 분리 + STT 전사")
    parser.add_argument("--audio",     required=True, help="입력 오디오 파일 경로")
    parser.add_argument("--hf_token",  default="",   help="HuggingFace 액세스 토큰")
    parser.add_argument("--use_whisperx", action="store_true", default=True)
    parser.add_argument("--auto_label",   action="store_true", default=True)
    args = parser.parse_args()

    audio_path = Path(args.audio)
    assert audio_path.exists(), f"파일 없음: {audio_path}"

    # 전체 오디오 로드
    audio, sr = sf.read(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)   # 모노 변환

    # 파이프라인 실행
    try:
        if args.use_whisperx:
            wx_result = run_whisperx(audio_path, args.hf_token)
            records   = merge_segments(wx_result, audio, sr)
        else:
            raise ImportError("fallback 강제")
    except (ImportError, ModuleNotFoundError):
        records = run_fallback_pipeline(audio_path, args.hf_token)

    # 자동 레이블
    if args.auto_label:
        records = auto_label_with_sentiment(records)

    # 저장
    out_json = OUTPUT_DIR / "transcripts.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"\n✓ 완료: {len(records)}개 세그먼트 저장 → {out_json}")
    print(f"  speakers: {set(r['speaker'] for r in records)}")

    # 통계 출력
    if records:
        import pandas as pd
        df = pd.DataFrame(records)
        print("\n[발화자별 통계]")
        print(df.groupby("speaker")["duration"].agg(["count", "sum", "mean"]).round(2))
        if "label" in df and df["label"].notna().any():
            print("\n[레이블 분포]")
            print(df["label"].value_counts())


if __name__ == "__main__":
    main()
