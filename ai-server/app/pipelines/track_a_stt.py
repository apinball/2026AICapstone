"""
Track A — STT 및 텍스트 문맥 감성 분석 (Lexical Pipeline)
  1. Whisper로 한국어 전사 + 타임스탬프 추출
  2. pyannote-audio로 화자 분리 (HF_TOKEN 있을 때) or 규칙 기반 fallback
  3. RoBERTa-XLM (multilingual) 으로 세그먼트별 감성 분류
"""

import os
import tempfile
import warnings
from typing import Any

import librosa
import numpy as np
import soundfile as sf
import torch
import torchaudio
import whisper
from transformers import pipeline as hf_pipeline

warnings.filterwarnings("ignore", message=".*backend.*parameter is not used by TorchCodec.*")

# torchaudio nightly 호환 shim — pyannote 3.3.2가 참조하는 옛 API 보충
if not hasattr(torchaudio, "AudioMetaData"):
    class _AudioMetaData:
        def __init__(self, sample_rate=0, num_frames=0, num_channels=0,
                     bits_per_sample=0, encoding=""):
            self.sample_rate = sample_rate
            self.num_frames = num_frames
            self.num_channels = num_channels
            self.bits_per_sample = bits_per_sample
            self.encoding = encoding
    torchaudio.AudioMetaData = _AudioMetaData

if not hasattr(torchaudio, "list_audio_backends"):
    torchaudio.list_audio_backends = lambda: ["soundfile"]

if not hasattr(torchaudio, "get_audio_backend"):
    torchaudio.get_audio_backend = lambda: "soundfile"

if not hasattr(torchaudio, "set_audio_backend"):
    torchaudio.set_audio_backend = lambda x: None

# torchaudio nightly에서 info()도 제거됨 — soundfile로 메타데이터 조회
if not hasattr(torchaudio, "info"):
    import soundfile as _sf
    def _torchaudio_info(filepath, backend=None):
        info = _sf.info(str(filepath))
        return torchaudio.AudioMetaData(
            sample_rate=info.samplerate,
            num_frames=info.frames,
            num_channels=info.channels,
            bits_per_sample=getattr(info, "subtype_info", 0) or 16,
            encoding=info.format or "",
        )
    torchaudio.info = _torchaudio_info

# torch 2.6+ weights_only 기본값이 True로 바뀌면서 pyannote 체크포인트 로드가 막힘.
# pyannote 공식 모델은 신뢰 가능하므로 torch.load 호출 시 강제로 False 적용.
# (pytorch-lightning 등 내부에서 명시적으로 True 전달해도 덮어씀)
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

try:
    from pyannote.audio import Pipeline as PyannotePipeline
    PYANNOTE_AVAILABLE = True
except (ImportError, AttributeError) as e:
    print(f"[TrackA] pyannote import failed: {e}")
    PYANNOTE_AVAILABLE = False


EMOTION_LABEL_MAP = {
    "POSITIVE": "joy",
    "NEGATIVE": "sadness",
    "NEUTRAL": "neutral",
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
        self.device = device

        print("[TrackA] Loading RoBERTa-XLM sentiment model...")
        hf_device = 0 if device == "cuda" else -1
        self.sentiment_pipe = hf_pipeline(
            "text-classification",
            model="cardiffnlp/twitter-xlm-roberta-base-sentiment",
            device=hf_device,
            top_k=1,
        )

        # ── Pyannote 화자 분리 (HF_TOKEN 필요) ────────────────────────────
        self.diarization = None
        hf_token = os.getenv("HF_TOKEN", "").strip()
        if PYANNOTE_AVAILABLE and hf_token:
            try:
                print("[TrackA] Loading pyannote diarization model...")
                self.diarization = PyannotePipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=hf_token,
                )
                if device == "cuda":
                    self.diarization.to(torch.device("cuda"))
                print("[TrackA] Pyannote ready.")
            except Exception as e:
                print(f"[TrackA] Pyannote load failed ({e}) — falling back to rule-based")
                self.diarization = None
        else:
            print("[TrackA] HF_TOKEN not set or pyannote unavailable — using rule-based diarization")

        print("[TrackA] Ready.")

    # ── 화자 분리 ────────────────────────────────────────────────────────

    def _normalize_audio_for_pyannote(self, audio_path: str) -> str:
        """
        pyannote 3.3.2 + torchaudio nightly의 텐서 크기 불일치 버그 우회.
        오디오를 16kHz mono로 변환 + chunk size(10초)에 맞춰 패딩한 임시 wav 생성.
        """
        y, _ = librosa.load(audio_path, sr=16000, mono=True)
        chunk_samples = 16000 * 10  # pyannote 기본 segmentation chunk
        target_len = ((len(y) + chunk_samples - 1) // chunk_samples) * chunk_samples
        if len(y) < target_len:
            y = np.pad(y, (0, target_len - len(y)), mode="constant")

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp.close()
        sf.write(tmp.name, y, 16000, subtype="PCM_16")
        return tmp.name

    def _diarize_pyannote(self, audio_path: str) -> list[dict]:
        """pyannote로 (start, end, speaker_id) 리스트 반환.
        1대1 상담이라는 도메인 정보를 활용해 화자 수를 2명으로 강제.
        """
        normalized_path = self._normalize_audio_for_pyannote(audio_path)
        try:
            diar_result = self.diarization(normalized_path, num_speakers=2)
        finally:
            try:
                os.unlink(normalized_path)
            except OSError:
                pass

        turns = []
        for turn, _, speaker_id in diar_result.itertracks(yield_label=True):
            turns.append({
                "start": turn.start,
                "end": turn.end,
                "speaker_id": speaker_id,
            })
        return turns

    def _map_speakers_by_overlap(
        self, segments: list[dict], diar_turns: list[dict]
    ) -> list[dict]:
        """
        Whisper 세그먼트와 pyannote turn을 시간 겹침으로 매칭.
        휴리스틱: 총 발화 시간이 짧은 화자 = 상담사 (경청 위주)
                  긴 화자 = 내담자 (자기 얘기를 더 함)
        """
        if not diar_turns:
            return self._assign_speakers_by_gap(segments)

        # 화자별 총 발화 시간 집계
        speaker_durations: dict[str, float] = {}
        for turn in diar_turns:
            sid = turn["speaker_id"]
            speaker_durations[sid] = speaker_durations.get(sid, 0.0) + (turn["end"] - turn["start"])

        print(f"[TrackA] Detected speakers (total seconds): {speaker_durations}")

        if not speaker_durations:
            return self._assign_speakers_by_gap(segments)

        # 가장 짧게 말한 사람 = 상담사
        counselor_id = min(speaker_durations, key=speaker_durations.get)
        print(f"[TrackA] Counselor inferred as: {counselor_id} (least talking time)")

        # 각 세그먼트의 dominant 화자 결정
        for seg in segments:
            best_overlap = 0.0
            best_speaker = None
            for turn in diar_turns:
                overlap = max(0, min(seg["end"], turn["end"]) - max(seg["start"], turn["start"]))
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_speaker = turn["speaker_id"]

            if best_speaker is None:
                seg["speaker"] = "unknown"
            elif best_speaker == counselor_id:
                seg["speaker"] = "counselor"
            else:
                seg["speaker"] = "client"
        return segments

    def _assign_speakers_by_gap(self, segments: list[dict]) -> list[dict]:
        """Fallback: 1.5초 갭 기반 규칙"""
        current = "counselor"
        prev_end = 0.0
        for seg in segments:
            if seg["start"] - prev_end > 1.5:
                current = "client" if current == "counselor" else "counselor"
            seg["speaker"] = current
            prev_end = seg["end"]
        return segments

    # ── 텍스트 처리 ──────────────────────────────────────────────────────

    def _vad_filter(self, segments: list[dict]) -> list[dict]:
        return [s for s in segments if s.get("text", "").strip()]

    def _classify_text_emotion(self, text: str) -> tuple[str, float]:
        if not text.strip():
            return "neutral", 0.5
        results = self.sentiment_pipe(text[:512])
        top = results[0][0]
        label = EMOTION_LABEL_MAP.get(top["label"].upper(), top["label"].lower())
        return label, round(top["score"], 4)

    # ── 공개 인터페이스 ─────────────────────────────────────────────────

    def run(self, audio_path: str) -> dict[str, Any]:
        print(f"[TrackA] Transcribing {audio_path} (Korean)...")
        result = self.whisper_model.transcribe(
            audio_path,
            language="ko",       # 한국어 강제
            word_timestamps=False,
            verbose=False,
        )

        raw_segments = [
            {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
            for seg in result.get("segments", [])
        ]
        filtered = self._vad_filter(raw_segments)

        # 화자 분리 — pyannote 시도 후 실패 시 규칙 기반 fallback
        with_speakers = None
        if self.diarization is not None:
            print("[TrackA] Running pyannote diarization...")
            try:
                diar_turns = self._diarize_pyannote(audio_path)
                with_speakers = self._map_speakers_by_overlap(filtered, diar_turns)
            except Exception as e:
                print(f"[TrackA] Pyannote runtime error ({type(e).__name__}: {e}) — falling back to rule-based")
                with_speakers = None

        if with_speakers is None:
            with_speakers = self._assign_speakers_by_gap(filtered)

        # 텍스트 감성 분석
        enriched = []
        for seg in with_speakers:
            emotion, score = self._classify_text_emotion(seg["text"])
            enriched.append({**seg, "text_emotion": emotion, "text_emotion_score": score})

        return {"segments": enriched}
