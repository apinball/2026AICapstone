"""
Track B — 오디오 음향 기반 감정 분석 (Acoustic Pipeline)
  방법 A (기본): HuggingFace Wav2Vec2 파인튜닝 모델 사용
  방법 B (경량): Librosa Mel-Spectrogram → 자체 CNN 모델
                (models/emotion_cnn.py 참조)

  기본값은 방법 A (Wav2Vec2 superb/ced-base).
  로컬 CNN 가중치가 있으면 방법 B 로 자동 전환.
"""

from pathlib import Path
from typing import Tuple

import librosa
import numpy as np
import torch
import torchaudio
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

from models.emotion_cnn import EmotionCNN


EMOTION_LABELS = ["anger", "disgust", "fear", "joy", "neutral", "sadness", "surprise"]
CNN_WEIGHTS_PATH = Path("/app/model_weights/emotion_cnn.pth")

# Wav2Vec2 기반 감정 분류 HuggingFace 모델
WAV2VEC_MODEL_ID = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"


class AcousticPipeline:
    def __init__(self, device: str = "cpu"):
        self.device = device
        self.use_cnn = CNN_WEIGHTS_PATH.exists()

        if self.use_cnn:
            print("[TrackB] Loading local CNN emotion model...")
            self.cnn = EmotionCNN(num_classes=len(EMOTION_LABELS))
            self.cnn.load_state_dict(torch.load(CNN_WEIGHTS_PATH, map_location=device))
            self.cnn.to(device)
            self.cnn.eval()
        else:
            print(f"[TrackB] Loading Wav2Vec2 model ({WAV2VEC_MODEL_ID}) on {device}...")
            self.feature_extractor = AutoFeatureExtractor.from_pretrained(WAV2VEC_MODEL_ID)
            self.wav2vec_model = AutoModelForAudioClassification.from_pretrained(
                WAV2VEC_MODEL_ID
            ).to(device)
            self.wav2vec_model.eval()
        print("[TrackB] Ready.")

    # ── Mel-Spectrogram 추출 (CNN 방법 B용) ──────────────────────────────────

    def _extract_mel_spectrogram(self, audio_path: str) -> np.ndarray:
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, fmax=8000)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        # 고정 길이로 패딩/잘라내기 (128×128)
        target_width = 128
        if mel_db.shape[1] < target_width:
            pad_width = target_width - mel_db.shape[1]
            mel_db = np.pad(mel_db, ((0, 0), (0, pad_width)), mode="constant")
        else:
            mel_db = mel_db[:, :target_width]
        return mel_db.astype(np.float32)

    # ── Wav2Vec2 추론 (방법 A) ────────────────────────────────────────────────

    def _infer_wav2vec(self, audio_path: str) -> Tuple[str, float]:
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        inputs = self.feature_extractor(
            y, sampling_rate=16000, return_tensors="pt", padding=True
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            logits = self.wav2vec_model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]
        top_idx = int(probs.argmax())

        # 모델 레이블 매핑
        id2label = self.wav2vec_model.config.id2label
        label = id2label.get(top_idx, EMOTION_LABELS[top_idx % len(EMOTION_LABELS)])
        return label.lower(), round(float(probs[top_idx]), 4)

    # ── CNN 추론 (방법 B) ─────────────────────────────────────────────────────

    def _infer_cnn(self, audio_path: str) -> Tuple[str, float]:
        mel = self._extract_mel_spectrogram(audio_path)
        tensor = torch.from_numpy(mel).unsqueeze(0).unsqueeze(0).to(self.device)  # (1,1,128,128)
        with torch.no_grad():
            logits = self.cnn(tensor)
        probs = torch.softmax(logits, dim=-1)[0]
        top_idx = int(probs.argmax())
        return EMOTION_LABELS[top_idx], round(float(probs[top_idx]), 4)

    # ── 공개 인터페이스 ───────────────────────────────────────────────────────

    def run(self, audio_path: str) -> Tuple[str, float]:
        """
        Returns: (emotion_label: str, confidence: float)
        """
        print(f"[TrackB] Analyzing acoustic emotion of {audio_path} ...")
        if self.use_cnn:
            return self._infer_cnn(audio_path)
        return self._infer_wav2vec(audio_path)
