"""
04_fusion.py
────────────
멀티모달 피처 융합 전략 3가지:

  1. Early Fusion  : 오디오 + 텍스트 피처를 단순 concatenate → 1개 분류기
  2. Late Fusion   : 각 모달리티의 예측 확률을 weighted sum/voting으로 결합
  3. Attention Fusion : 학습 가능한 cross-attention으로 두 모달 통합

출력:
  - outputs/features_fused.pkl  (Early Fusion 피처 포함 DataFrame)
  - 학습 시 Late/Attention 융합은 05_train_compare.py에서 직접 사용

사용법:
  python 04_fusion.py
"""

import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import StandardScaler

from config import (OUTPUT_DIR, NUM_CLASSES, RANDOM_SEED)

TEXT_FEAT_PKL = OUTPUT_DIR / "features_text.pkl"
OUT_PKL       = OUTPUT_DIR / "features_fused.pkl"


# ──────────────────────────────────────────────────────────────
# 피처 행렬 조립 헬퍼
# ──────────────────────────────────────────────────────────────
def get_feature_matrix(df: pd.DataFrame,
                        feat_cols: list[str],
                        scale: bool = True) -> np.ndarray:
    """
    여러 피처 컬럼(각각 1D array)을 수평 concat해서
    (N, D) 행렬로 반환합니다.
    """
    parts = []
    for col in feat_cols:
        if col not in df:
            print(f"[WARN] 피처 없음: {col}")
            continue
        arr = np.vstack(df[col].values)   # (N, D_i)
        parts.append(arr)

    if not parts:
        raise ValueError("유효한 피처 컬럼이 없습니다.")

    X = np.hstack(parts).astype(np.float32)

    if scale:
        scaler = StandardScaler()
        X = scaler.fit_transform(X)

    return X


# ──────────────────────────────────────────────────────────────
# 1. Early Fusion
# ──────────────────────────────────────────────────────────────
class EarlyFusion:
    """
    오디오 피처 + 텍스트 피처를 단순 연결(concatenate).
    이후 어떤 ML 모델에도 바로 적용 가능한 단일 피처 행렬 생성.
    """

    FUSION_CONFIGS = {
        # (audio_cols, text_cols)
        "handcraft_only":   (["feat_handcraft"], []),
        "tfidf_only":       ([], ["feat_tfidf", "feat_linguistic"]),
        "kobert_only":      ([], ["feat_kobert"]),
        "wav2vec_only":     (["feat_wav2vec2"], []),
        "early_hc_ling":    (["feat_handcraft"], ["feat_linguistic"]),
        "early_hc_tfidf":   (["feat_handcraft"], ["feat_tfidf", "feat_linguistic"]),
        "early_hc_kobert":  (["feat_handcraft"], ["feat_kobert"]),
        "early_w2v_kobert": (["feat_wav2vec2"],  ["feat_kobert"]),
        "early_all":        (["feat_handcraft", "feat_wav2vec2"],
                             ["feat_tfidf", "feat_linguistic", "feat_kobert"]),
    }

    def build(self, df: pd.DataFrame) -> dict[str, np.ndarray]:
        """모든 Early Fusion 조합의 피처 행렬을 반환합니다."""
        result = {}
        for name, (audio_cols, text_cols) in self.FUSION_CONFIGS.items():
            valid_cols = [c for c in audio_cols + text_cols if c in df.columns]
            if not valid_cols:
                continue
            try:
                X = get_feature_matrix(df, valid_cols, scale=True)
                result[name] = X
                print(f"  [{name}] shape: {X.shape}")
            except Exception as e:
                print(f"  [{name}] 건너뜀: {e}")
        return result


# ──────────────────────────────────────────────────────────────
# 2. Late Fusion
# ──────────────────────────────────────────────────────────────
class LateFusion:
    """
    각 모달리티의 분류기가 출력한 확률을 가중 평균으로 결합.

    사용법:
      lf = LateFusion(weights={"audio": 0.4, "text": 0.6})
      proba = lf.predict_proba(audio_proba, text_proba)
    """

    def __init__(self, weights: dict[str, float] | None = None):
        # 기본값: 동일 가중치
        self.weights = weights or {"audio": 0.5, "text": 0.5}

    def predict_proba(self,
                      proba_dict: dict[str, np.ndarray]) -> np.ndarray:
        """
        proba_dict: {"audio": (N, C), "text": (N, C), ...}
        반환: (N, C) 가중 평균 확률
        """
        total_weight = sum(self.weights.get(k, 1.0)
                           for k in proba_dict)
        combined = np.zeros_like(next(iter(proba_dict.values())))
        for modality, proba in proba_dict.items():
            w = self.weights.get(modality, 1.0) / total_weight
            combined += w * proba
        return combined

    def predict(self, proba_dict: dict[str, np.ndarray]) -> np.ndarray:
        combined = self.predict_proba(proba_dict)
        return np.argmax(combined, axis=1)

    def optimize_weights(self,
                         proba_dict: dict[str, np.ndarray],
                         y_true: np.ndarray,
                         n_search: int = 50) -> dict[str, float]:
        """
        그리드 서치로 최적 가중치 탐색 (2 모달리티 기준).
        """
        from sklearn.metrics import f1_score
        keys = list(proba_dict.keys())
        best_f1, best_w = 0., {k: 1.0 / len(keys) for k in keys}

        for alpha in np.linspace(0, 1, n_search):
            if len(keys) == 2:
                trial_weights = {keys[0]: alpha, keys[1]: 1 - alpha}
                lf = LateFusion(trial_weights)
                y_pred = lf.predict(proba_dict)
                f1 = f1_score(y_true, y_pred, average="macro")
                if f1 > best_f1:
                    best_f1 = f1
                    best_w  = trial_weights.copy()

        print(f"최적 Late Fusion 가중치: {best_w}  (F1={best_f1:.4f})")
        self.weights = best_w
        return best_w


# ──────────────────────────────────────────────────────────────
# 3. Attention Fusion (학습 가능한 크로스 어텐션)
# ──────────────────────────────────────────────────────────────
class AttentionFusionLayer(nn.Module):
    """
    두 모달리티 임베딩을 크로스 어텐션으로 통합.

    Args:
      audio_dim: 오디오 피처 차원
      text_dim:  텍스트 피처 차원
      hidden_dim: 공유 임베딩 차원
      num_heads:  멀티헤드 어텐션 헤드 수
      dropout:    드롭아웃 비율
    """

    def __init__(self,
                 audio_dim: int,
                 text_dim:  int,
                 hidden_dim: int = 256,
                 num_heads:  int = 4,
                 dropout:    float = 0.3,
                 num_classes: int = NUM_CLASSES):
        super().__init__()

        # 각 모달을 동일 차원으로 투영
        self.audio_proj = nn.Sequential(
            nn.Linear(audio_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout)
        )
        self.text_proj = nn.Sequential(
            nn.Linear(text_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout)
        )

        # Cross-Attention: audio queries, text keys/values
        self.cross_attn = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True
        )

        # Self-Attention으로 두 모달 통합
        self.self_attn = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True
        )

        self.norm1 = nn.LayerNorm(hidden_dim)
        self.norm2 = nn.LayerNorm(hidden_dim)

        # 최종 분류기
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, num_classes)
        )

    def forward(self,
                audio_feat: torch.Tensor,
                text_feat:  torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        audio_feat: (B, audio_dim)
        text_feat:  (B, text_dim)
        반환: (logits (B, C), attn_weights (B, 1, 1))
        """
        # (B, D) → (B, 1, D) for attention
        a = self.audio_proj(audio_feat).unsqueeze(1)   # (B, 1, H)
        t = self.text_proj(text_feat).unsqueeze(1)     # (B, 1, H)

        # Cross-Attention: audio가 text를 바라봄
        a_cross, attn_w = self.cross_attn(query=a, key=t, value=t)
        a_cross = self.norm1(a + a_cross)

        # Self-Attention: 두 모달 concat 후 통합
        combined = torch.cat([a_cross, t], dim=1)      # (B, 2, H)
        combined, _ = self.self_attn(combined, combined, combined)
        combined = self.norm2(combined)

        # 두 위치 평균 → 분류
        pooled = combined.mean(dim=1)                   # (B, H)
        # 원래 표현과 concat으로 skip connection
        skip = torch.cat([
            a_cross.squeeze(1),
            t.squeeze(1)
        ], dim=1)                                        # (B, 2H)

        logits = self.classifier(skip)
        return logits, attn_w


class AttentionFusionClassifier(nn.Module):
    """AttentionFusionLayer를 감싼 학습용 모듈."""

    def __init__(self, audio_dim, text_dim, **kwargs):
        super().__init__()
        self.fusion = AttentionFusionLayer(audio_dim, text_dim, **kwargs)

    def forward(self, audio_feat, text_feat):
        return self.fusion(audio_feat, text_feat)


# ──────────────────────────────────────────────────────────────
# Attention Fusion 학습 루프
# ──────────────────────────────────────────────────────────────
def train_attention_fusion(
    X_audio_train: np.ndarray,
    X_text_train:  np.ndarray,
    y_train:       np.ndarray,
    X_audio_val:   np.ndarray,
    X_text_val:    np.ndarray,
    y_val:         np.ndarray,
    epochs:        int = 30,
    lr:            float = 1e-4,
    batch_size:    int = 32,
) -> tuple[AttentionFusionClassifier, dict]:
    """
    Attention Fusion 모델 학습.
    반환: (학습된 모델, 학습 history)
    """
    from torch.utils.data import DataLoader, TensorDataset
    from sklearn.metrics import accuracy_score, f1_score

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    audio_dim = X_audio_train.shape[1]
    text_dim  = X_text_train.shape[1]

    model = AttentionFusionClassifier(
        audio_dim=audio_dim, text_dim=text_dim,
        hidden_dim=256, num_heads=4, dropout=0.3
    ).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    # 클래스 불균형 대응 (가중치 손실)
    class_counts = np.bincount(y_train, minlength=NUM_CLASSES)
    class_weights = torch.tensor(
        1.0 / (class_counts + 1e-6), dtype=torch.float32
    ).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    # DataLoader
    def make_loader(Xa, Xt, y, shuffle=True):
        ds = TensorDataset(
            torch.tensor(Xa, dtype=torch.float32),
            torch.tensor(Xt, dtype=torch.float32),
            torch.tensor(y,  dtype=torch.long)
        )
        return DataLoader(ds, batch_size=batch_size, shuffle=shuffle)

    train_loader = make_loader(X_audio_train, X_text_train, y_train)
    val_loader   = make_loader(X_audio_val,   X_text_val,   y_val, False)

    history = {"train_loss": [], "val_acc": [], "val_f1": []}
    best_f1, best_state = 0., None

    for epoch in range(1, epochs + 1):
        # Train
        model.train()
        total_loss = 0.
        for a, t, labels in train_loader:
            a, t, labels = a.to(device), t.to(device), labels.to(device)
            logits, _ = model(a, t)
            loss = criterion(logits, labels)
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()

        scheduler.step()

        # Validate
        model.eval()
        all_preds, all_labels = [], []
        with torch.no_grad():
            for a, t, labels in val_loader:
                logits, _ = model(a.to(device), t.to(device))
                preds = logits.argmax(dim=1).cpu().numpy()
                all_preds.extend(preds)
                all_labels.extend(labels.numpy())

        acc = accuracy_score(all_labels, all_preds)
        f1  = f1_score(all_labels, all_preds, average="macro")
        history["train_loss"].append(total_loss / len(train_loader))
        history["val_acc"].append(acc)
        history["val_f1"].append(f1)

        if f1 > best_f1:
            best_f1   = f1
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

        if epoch % 5 == 0:
            print(f"Epoch {epoch:3d}/{epochs} | "
                  f"Loss={total_loss/len(train_loader):.4f} | "
                  f"Val Acc={acc:.4f} | Val F1={f1:.4f}")

    model.load_state_dict(best_state)
    print(f"\n✓ Attention Fusion 최고 Val F1: {best_f1:.4f}")
    return model, history


# ──────────────────────────────────────────────────────────────
# 피처 조합 준비 및 저장
# ──────────────────────────────────────────────────────────────
def prepare_and_save(df: pd.DataFrame) -> dict[str, np.ndarray]:
    """Early Fusion 피처 행렬을 모두 생성하고 DataFrame에 저장."""
    ef = EarlyFusion()
    fusion_feats = ef.build(df)

    # Early Fusion 결과를 DataFrame에 저장
    for name, X in fusion_feats.items():
        df[f"fusion_{name}"] = list(X)

    return fusion_feats


# ──────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────
def main():
    assert TEXT_FEAT_PKL.exists(), \
        f"먼저 03_feature_text.py를 실행하세요: {TEXT_FEAT_PKL}"

    with open(TEXT_FEAT_PKL, "rb") as f:
        df = pickle.load(f)

    print(f"피처 DataFrame 로드: {len(df)}행")
    print("Early Fusion 피처 생성 중...")
    prepare_and_save(df)

    with open(OUT_PKL, "wb") as f:
        pickle.dump(df, f)

    print(f"\n✓ 완료: {OUT_PKL}")
    print(f"  총 컬럼 수: {len(df.columns)}")


if __name__ == "__main__":
    main()
