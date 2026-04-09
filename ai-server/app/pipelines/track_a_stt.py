"""
Track A — STT 및 텍스트 문맥 감성 분석 (Lexical Pipeline)
  1. Whisper로 전사 + 타임스탬프 추출
  2. VAD 스타일 묵음 필터링 (에너지 임계값)
  3. RoBERTa-XLM (multilingual) 으로 세그먼트별 감성 분류
  4. 화자 분리: Whisper 결과의 발화 패턴으로 간단한 규칙 기반 분리
     (고도화 시 pyannote-audio 화자 분리 모델 연동 권장)
"""

import re
from typing import Any

import numpy as np
import torch
import whisper
from transformers import pipeline as hf_pipeline


EMOTION_LABEL_MAP = {
    "POSITIVE": "joy",
    "NEGATIVE": "sadness",
    "NEUTRAL": "neutral",
    # multilingual-sentiment 모델이 반환하는 레이블
    "1 star": "anger",
    "2 stars": "sadness",
    "3 stars": "neutral",
    "4 stars": "joy",
    "5 stars": "joy",
}


class STTPipeline:
    def __init__(self, model_size: str = "base", device: str = "cpu"):
        print(f"[TrackA] Loading Whisper ({model_size}) on {device}...")
        self.whisper_model = whisper.load_model(model_size, device=device)

        print("[TrackA] Loading RoBERTa-XLM sentiment model...")
        hf_device = 0 if device == "cuda" else -1
        # 한국어 포함 다국어 감성 분류 모델
        self.sentiment_pipe = hf_pipeline(
            "text-classification",
            model="cardiffnlp/twitter-xlm-roberta-base-sentiment",
            device=hf_device,
            top_k=1,
        )
        print("[TrackA] Ready.")

    def _vad_filter(self, segments: list[dict]) -> list[dict]:
        """묵음(텍스트 없는) 세그먼트 제거"""
        return [s for s in segments if s.get("text", "").strip()]

    def _assign_speakers(self, segments: list[dict]) -> list[dict]:
        """
        간단한 규칙 기반 화자 구분.
        - 첫 번째 화자 → counselor (상담사가 먼저 말하는 관행)
        - 이후 짧은 발화(<5초)와 긴 발화(>5초)를 교대로 구분
        실제 배포 시 pyannote-audio 로 교체 권장.
        """
        assigned = []
        current_speaker = "counselor"
        prev_end = 0.0

        for seg in segments:
            gap = seg["start"] - prev_end
            if gap > 1.5:
                # 1.5초 이상 공백이면 화자 교체로 간주
                current_speaker = "client" if current_speaker == "counselor" else "counselor"
            seg["speaker"] = current_speaker
            prev_end = seg["end"]
            assigned.append(seg)

        return assigned

    def _classify_text_emotion(self, text: str) -> tuple[str, float]:
        if not text.strip():
            return "neutral", 0.5
        results = self.sentiment_pipe(text[:512])  # 최대 512 토큰
        top = results[0][0]
        label = EMOTION_LABEL_MAP.get(top["label"].upper(), top["label"].lower())
        return label, round(top["score"], 4)

    def run(self, audio_path: str) -> dict[str, Any]:
        """
        Returns:
            {
              "segments": [
                {
                  "start": float, "end": float, "speaker": str,
                  "text": str, "text_emotion": str, "text_emotion_score": float
                }, ...
              ]
            }
        """
        print(f"[TrackA] Transcribing {audio_path} ...")
        result = self.whisper_model.transcribe(
            audio_path,
            language=None,        # 자동 감지
            word_timestamps=False,
            verbose=False,
        )

        raw_segments = [
            {
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"].strip(),
            }
            for seg in result.get("segments", [])
        ]

        # VAD 필터링
        filtered = self._vad_filter(raw_segments)

        # 화자 분리
        with_speakers = self._assign_speakers(filtered)

        # 텍스트 감성 분석
        enriched = []
        for seg in with_speakers:
            emotion, score = self._classify_text_emotion(seg["text"])
            enriched.append({**seg, "text_emotion": emotion, "text_emotion_score": score})

        return {"segments": enriched}
