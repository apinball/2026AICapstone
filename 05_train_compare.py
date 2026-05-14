"""
05_train_compare.py
───────────────────
모든 모델 × 피처 조합을 학습하고 성능을 비교합니다.

비교 모델:
  [전통 ML]
  - SVM (RBF, Linear)
  - RandomForest
  - XGBoost
  - LogisticRegression (baseline)

  [딥러닝]
  - LSTM (오디오 피처 시퀀스)
  - CNN-1D (오디오 스펙트럼)
  - KoBERT Fine-tuning (텍스트)
  - Wav2Vec2 Fine-tuning (오디오)

  [융합]
  - Early Fusion + SVM/RF/XGB
  - Late Fusion (Audio SVM + Text KoBERT)
  - Attention Fusion (학습 가능 크로스 어텐션)

평가 지표: Accuracy, Macro-F1, Precision, Recall, AUC-ROC
교차 검증: Stratified K-Fold (k=5)

출력: outputs/results.csv, outputs/results_summary.pkl

사용법:
  python 05_train_compare.py
  python 05_train_compare.py --quick     # 전통 ML만 빠르게
"""

import argparse
import pickle
import warnings
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import (accuracy_score, f1_score, precision_score,
                              recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.preprocessing import LabelBinarizer, StandardScaler

from config import (OUTPUT_DIR, MODEL_DIR, NUM_CLASSES, CV_FOLDS,
                    RANDOM_SEED, LABELS, LABEL2ID, BATCH_SIZE, EPOCHS_DL)

warnings.filterwarnings("ignore")

FUSED_PKL = OUTPUT_DIR / "features_fused.pkl"
RESULTS_CSV = OUTPUT_DIR / "results.csv"


# ──────────────────────────────────────────────────────────────
# 평가 지표 계산
# ──────────────────────────────────────────────────────────────
def evaluate(y_true: np.ndarray,
             y_pred: np.ndarray,
             y_proba: np.ndarray | None = None) -> dict:
    """통합 평가 지표 딕셔너리 반환."""
    metrics = {
        "accuracy":  round(accuracy_score(y_true, y_pred), 4),
        "macro_f1":  round(f1_score(y_true, y_pred, average="macro",  zero_division=0), 4),
        "macro_pre": round(precision_score(y_true, y_pred, average="macro", zero_division=0), 4),
        "macro_rec": round(recall_score(y_true, y_pred, average="macro",  zero_division=0), 4),
    }
    # 클래스별 F1
    per_class = f1_score(y_true, y_pred, average=None, zero_division=0)
    for i, label in enumerate(LABELS):
        if i < len(per_class):
            metrics[f"f1_{label}"] = round(per_class[i], 4)

    # AUC-ROC (multiclass OvR)
    if y_proba is not None:
        try:
            lb  = LabelBinarizer()
            y_b = lb.fit_transform(y_true)
            if y_b.shape[1] < 2:
                y_b = np.hstack([1 - y_b, y_b])
            metrics["auc_roc"] = round(
                roc_auc_score(y_b, y_proba, multi_class="ovr",
                              average="macro"), 4)
        except Exception:
            metrics["auc_roc"] = None
    return metrics


# ──────────────────────────────────────────────────────────────
# 전통 ML 모델 정의
# ──────────────────────────────────────────────────────────────
def get_traditional_models() -> dict[str, Any]:
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import SVC
    from xgboost import XGBClassifier

    return {
        "LogisticRegression": LogisticRegression(
            max_iter=1000, C=1.0, random_state=RANDOM_SEED,
            class_weight="balanced", solver="lbfgs", multi_class="auto"
        ),
        "SVM_RBF": SVC(
            kernel="rbf", C=1.0, gamma="scale",
            probability=True, class_weight="balanced",
            random_state=RANDOM_SEED
        ),
        "SVM_Linear": SVC(
            kernel="linear", C=1.0,
            probability=True, class_weight="balanced",
            random_state=RANDOM_SEED
        ),
        "RandomForest": RandomForestClassifier(
            n_estimators=200, max_depth=None, min_samples_leaf=2,
            class_weight="balanced", random_state=RANDOM_SEED, n_jobs=-1
        ),
        "XGBoost": XGBClassifier(
            n_estimators=200, max_depth=6, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8,
            scale_pos_weight=1, eval_metric="mlogloss",
            use_label_encoder=False, random_state=RANDOM_SEED
        ),
        "GradientBoosting": GradientBoostingClassifier(
            n_estimators=150, max_depth=5, learning_rate=0.05,
            random_state=RANDOM_SEED
        ),
    }


# ──────────────────────────────────────────────────────────────
# 전통 ML 학습 + CV 평가
# ──────────────────────────────────────────────────────────────
def run_traditional_ml(
    X: np.ndarray,
    y: np.ndarray,
    model_name: str,
    feature_set: str,
    results: list[dict]
) -> None:
    """StratifiedKFold 교차 검증으로 전통 ML 모델을 평가합니다."""
    models = get_traditional_models()
    if model_name not in models:
        return

    clf = models[model_name]
    skf = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True,
                          random_state=RANDOM_SEED)

    fold_metrics = []
    for fold, (tr_idx, va_idx) in enumerate(skf.split(X, y), 1):
        X_tr, X_va = X[tr_idx], X[va_idx]
        y_tr, y_va = y[tr_idx], y[va_idx]

        # PCA 차원 축소 (피처가 1000차 이상일 때)
        if X_tr.shape[1] > 1000:
            from sklearn.decomposition import PCA
            pca = PCA(n_components=min(200, X_tr.shape[0] - 1),
                      random_state=RANDOM_SEED)
            X_tr = pca.fit_transform(X_tr)
            X_va = pca.transform(X_va)

        clf.fit(X_tr, y_tr)
        y_pred  = clf.predict(X_va)
        y_proba = clf.predict_proba(X_va) if hasattr(clf, "predict_proba") else None

        m = evaluate(y_va, y_pred, y_proba)
        m["fold"] = fold
        fold_metrics.append(m)

    # 폴드 평균
    avg = {k: np.mean([fm[k] for fm in fold_metrics if k in fm and fm[k] is not None])
           for k in fold_metrics[0] if k != "fold"}
    std = {k: np.std([fm[k] for fm in fold_metrics if k in fm and fm[k] is not None])
           for k in fold_metrics[0] if k != "fold"}

    row = {
        "model":       model_name,
        "feature_set": feature_set,
        "model_type":  "Traditional ML",
        **{k: round(v, 4) for k, v in avg.items()},
        **{f"{k}_std": round(v, 4) for k, v in std.items()},
    }
    results.append(row)
    print(f"  [{model_name} | {feature_set}] "
          f"Acc={avg['accuracy']:.4f}±{std['accuracy']:.4f}  "
          f"F1={avg['macro_f1']:.4f}±{std['macro_f1']:.4f}")


# ──────────────────────────────────────────────────────────────
# LSTM 모델
# ──────────────────────────────────────────────────────────────
import torch.nn as nn

class LSTMClassifier(nn.Module):
    def __init__(self, input_dim, hidden_dim=128, num_layers=2,
                 num_classes=NUM_CLASSES, dropout=0.3):
        super().__init__()
        self.lstm = nn.LSTM(
            input_dim, hidden_dim, num_layers=num_layers,
            batch_first=True, dropout=dropout, bidirectional=True
        )
        self.attn = nn.Linear(hidden_dim * 2, 1)
        self.fc   = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, num_classes)
        )

    def forward(self, x):
        # x: (B, T, D) or (B, D) → reshape to (B, T, D)
        if x.dim() == 2:
            x = x.unsqueeze(1)  # (B, 1, D)
        out, _ = self.lstm(x)   # (B, T, 2H)
        attn_w = torch.softmax(self.attn(out), dim=1)
        context = (attn_w * out).sum(dim=1)  # (B, 2H)
        return self.fc(context)


class CNN1DClassifier(nn.Module):
    def __init__(self, input_dim, num_classes=NUM_CLASSES, dropout=0.3):
        super().__init__()
        self.convs = nn.ModuleList([
            nn.Sequential(
                nn.Conv1d(1, 64, kernel_size=k, padding=k // 2),
                nn.BatchNorm1d(64),
                nn.ReLU(),
                nn.AdaptiveMaxPool1d(1)
            ) for k in [3, 5, 7]
        ])
        self.fc = nn.Sequential(
            nn.Linear(64 * 3, 128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, num_classes)
        )

    def forward(self, x):
        if x.dim() == 2:
            x = x.unsqueeze(1)  # (B, 1, D)
        pooled = [conv(x).squeeze(-1) for conv in self.convs]
        out = torch.cat(pooled, dim=1)
        return self.fc(out)


# ──────────────────────────────────────────────────────────────
# 딥러닝 학습 루프
# ──────────────────────────────────────────────────────────────
def train_dl_model(
    model: nn.Module,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val:   np.ndarray,
    y_val:   np.ndarray,
    epochs:  int = EPOCHS_DL,
    lr:      float = 1e-3,
) -> tuple[float, float, np.ndarray]:
    """
    간단한 딥러닝 학습 루프.
    반환: (best_val_accuracy, best_val_f1, best_val_proba)
    """
    from torch.utils.data import DataLoader, TensorDataset

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model  = model.to(device)

    class_counts  = np.bincount(y_train, minlength=NUM_CLASSES)
    class_weights = torch.tensor(1.0 / (class_counts + 1e-6),
                                 dtype=torch.float32).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", patience=5, factor=0.5
    )

    tr_ds  = TensorDataset(torch.tensor(X_train, dtype=torch.float32),
                           torch.tensor(y_train, dtype=torch.long))
    va_ds  = TensorDataset(torch.tensor(X_val,   dtype=torch.float32),
                           torch.tensor(y_val,   dtype=torch.long))
    tr_ld  = DataLoader(tr_ds, batch_size=BATCH_SIZE, shuffle=True)
    va_ld  = DataLoader(va_ds, batch_size=BATCH_SIZE, shuffle=False)

    best_acc, best_f1, best_proba = 0., 0., None
    patience_cnt, patience_max = 0, 10

    for epoch in range(1, epochs + 1):
        model.train()
        for xb, yb in tr_ld:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            criterion(model(xb), yb).backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

        model.eval()
        all_preds, all_probas, all_labels = [], [], []
        with torch.no_grad():
            for xb, yb in va_ld:
                logits = model(xb.to(device))
                probas = torch.softmax(logits, dim=1).cpu().numpy()
                preds  = np.argmax(probas, axis=1)
                all_probas.extend(probas)
                all_preds.extend(preds)
                all_labels.extend(yb.numpy())

        acc = accuracy_score(all_labels, all_preds)
        f1  = f1_score(all_labels, all_preds, average="macro")
        scheduler.step(f1)

        if f1 > best_f1:
            best_acc, best_f1 = acc, f1
            best_proba = np.array(all_probas)
            patience_cnt = 0
        else:
            patience_cnt += 1
            if patience_cnt >= patience_max:
                break

    return best_acc, best_f1, best_proba


def run_dl_model(
    X: np.ndarray, y: np.ndarray,
    model_class, model_name: str, feature_set: str,
    results: list[dict], **model_kwargs
) -> None:
    """딥러닝 모델을 CV로 평가합니다."""
    skf = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True,
                          random_state=RANDOM_SEED)
    fold_metrics = []

    for fold, (tr_idx, va_idx) in enumerate(skf.split(X, y), 1):
        X_tr, X_va = X[tr_idx], X[va_idx]
        y_tr, y_va = y[tr_idx], y[va_idx]

        scaler = StandardScaler()
        X_tr   = scaler.fit_transform(X_tr)
        X_va   = scaler.transform(X_va)

        model = model_class(input_dim=X.shape[1], **model_kwargs)
        acc, f1, proba = train_dl_model(model, X_tr, y_tr, X_va, y_va)

        y_pred = np.argmax(proba, axis=1) if proba is not None \
            else np.zeros(len(y_va), dtype=int)
        m = evaluate(y_va, y_pred, proba)
        m["fold"] = fold
        fold_metrics.append(m)

    avg = {k: np.mean([fm[k] for fm in fold_metrics
                        if k in fm and fm[k] is not None])
           for k in fold_metrics[0] if k != "fold"}
    std = {k: np.std([fm[k] for fm in fold_metrics
                       if k in fm and fm[k] is not None])
           for k in fold_metrics[0] if k != "fold"}

    row = {
        "model": model_name, "feature_set": feature_set,
        "model_type": "Deep Learning",
        **{k: round(v, 4) for k, v in avg.items()},
        **{f"{k}_std": round(v, 4) for k, v in std.items()},
    }
    results.append(row)
    print(f"  [{model_name} | {feature_set}] "
          f"Acc={avg['accuracy']:.4f}±{std['accuracy']:.4f}  "
          f"F1={avg['macro_f1']:.4f}±{std['macro_f1']:.4f}")


# ──────────────────────────────────────────────────────────────
# KoBERT Fine-tuning
# ──────────────────────────────────────────────────────────────
def run_kobert_finetune(df: pd.DataFrame, results: list[dict]) -> None:
    """KoBERT/ELECTRA를 감정 분류용으로 fine-tuning합니다."""
    from transformers import (AutoTokenizer, AutoModelForSequenceClassification,
                               Trainer, TrainingArguments)
    from torch.utils.data import Dataset

    class EmotionDataset(Dataset):
        def __init__(self, input_ids, attn_mask, labels):
            self.input_ids = input_ids
            self.attn_mask = attn_mask
            self.labels    = labels

        def __len__(self): return len(self.labels)

        def __getitem__(self, idx):
            return {
                "input_ids":      torch.tensor(self.input_ids[idx], dtype=torch.long),
                "attention_mask": torch.tensor(self.attn_mask[idx], dtype=torch.long),
                "labels":         torch.tensor(self.labels[idx],    dtype=torch.long),
            }

    from config import KOBERT_MODEL
    skf = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True,
                          random_state=RANDOM_SEED)

    input_ids   = np.vstack(df["kobert_input_ids"].values)
    attn_masks  = np.vstack(df["kobert_attn_mask"].values)
    labels      = df["label_id"].values
    fold_metrics = []

    for fold, (tr_idx, va_idx) in enumerate(skf.split(input_ids, labels), 1):
        model = AutoModelForSequenceClassification.from_pretrained(
            KOBERT_MODEL, num_labels=NUM_CLASSES,
            ignore_mismatched_sizes=True
        )
        tr_ds = EmotionDataset(input_ids[tr_idx], attn_masks[tr_idx], labels[tr_idx])
        va_ds = EmotionDataset(input_ids[va_idx], attn_masks[va_idx], labels[va_idx])

        args = TrainingArguments(
            output_dir=str(MODEL_DIR / f"kobert_fold{fold}"),
            num_train_epochs=5,
            per_device_train_batch_size=16,
            per_device_eval_batch_size=32,
            learning_rate=2e-5,
            warmup_ratio=0.1,
            weight_decay=0.01,
            evaluation_strategy="epoch",
            save_strategy="epoch",
            load_best_model_at_end=True,
            metric_for_best_model="eval_loss",
            fp16=torch.cuda.is_available(),
            logging_steps=20,
            report_to="none",
        )
        trainer = Trainer(model=model, args=args,
                          train_dataset=tr_ds, eval_dataset=va_ds)
        trainer.train()

        preds_output = trainer.predict(va_ds)
        logits = preds_output.predictions
        y_pred  = np.argmax(logits, axis=1)
        y_proba = torch.softmax(torch.tensor(logits), dim=1).numpy()

        m = evaluate(labels[va_idx], y_pred, y_proba)
        m["fold"] = fold
        fold_metrics.append(m)
        print(f"  [KoBERT FT | fold {fold}] Acc={m['accuracy']:.4f}")

    avg = {k: np.mean([fm[k] for fm in fold_metrics
                        if k in fm and fm[k] is not None])
           for k in fold_metrics[0] if k != "fold"}
    std = {k: np.std([fm[k] for fm in fold_metrics
                       if k in fm and fm[k] is not None])
           for k in fold_metrics[0] if k != "fold"}

    results.append({
        "model": "KoBERT_FT", "feature_set": "text_kobert_ft",
        "model_type": "Pretrained",
        **{k: round(v, 4) for k, v in avg.items()},
        **{f"{k}_std": round(v, 4) for k, v in std.items()},
    })


# ──────────────────────────────────────────────────────────────
# Attention Fusion CV
# ──────────────────────────────────────────────────────────────
def run_attention_fusion(
    df: pd.DataFrame, results: list[dict],
    audio_col: str = "feat_handcraft",
    text_col:  str = "feat_kobert"
) -> None:
    from config import EPOCHS_DL
    from sklearn.model_selection import StratifiedKFold
    from .04_fusion import AttentionFusionClassifier, train_attention_fusion

    if audio_col not in df or text_col not in df:
        print(f"[WARN] Attention Fusion 건너뜀: {audio_col} 또는 {text_col} 없음")
        return

    X_audio = np.vstack(df[audio_col].values)
    X_text  = np.vstack(df[text_col].values)
    y       = df["label_id"].values

    skf = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_SEED)
    fold_metrics = []

    for fold, (tr_idx, va_idx) in enumerate(skf.split(X_audio, y), 1):
        Xa_tr, Xa_va = X_audio[tr_idx], X_audio[va_idx]
        Xt_tr, Xt_va = X_text[tr_idx],  X_text[va_idx]
        y_tr,  y_va  = y[tr_idx],        y[va_idx]

        model, _ = train_attention_fusion(
            Xa_tr, Xt_tr, y_tr, Xa_va, Xt_va, y_va,
            epochs=EPOCHS_DL
        )

        model.eval()
        device = next(model.parameters()).device
        with torch.no_grad():
            logits, _ = model(
                torch.tensor(Xa_va, dtype=torch.float32).to(device),
                torch.tensor(Xt_va, dtype=torch.float32).to(device)
            )
        y_proba = torch.softmax(logits, dim=1).cpu().numpy()
        y_pred  = np.argmax(y_proba, axis=1)

        m = evaluate(y_va, y_pred, y_proba)
        m["fold"] = fold
        fold_metrics.append(m)

    avg = {k: np.mean([fm[k] for fm in fold_metrics
                        if k in fm and fm[k] is not None])
           for k in fold_metrics[0] if k != "fold"}
    std = {k: np.std([fm[k] for fm in fold_metrics
                       if k in fm and fm[k] is not None])
           for k in fold_metrics[0] if k != "fold"}

    results.append({
        "model": "AttentionFusion", "feature_set": f"{audio_col}+{text_col}",
        "model_type": "Fusion",
        **{k: round(v, 4) for k, v in avg.items()},
        **{f"{k}_std": round(v, 4) for k, v in std.items()},
    })
    print(f"  [AttentionFusion] Acc={avg['accuracy']:.4f}±{std['accuracy']:.4f}  "
          f"F1={avg['macro_f1']:.4f}±{std['macro_f1']:.4f}")


# ──────────────────────────────────────────────────────────────
# 메인 실험 루너
# ──────────────────────────────────────────────────────────────
def run_experiments(df: pd.DataFrame, quick: bool = False) -> pd.DataFrame:
    """
    전체 실험 실행.
    quick=True이면 전통 ML만 실행 (빠른 파이럿 실험용).
    """
    results = []
    y = df["label_id"].values

    # ── 전통 ML × 피처 조합 ──────────────────────────────
    traditional_experiments = [
        # (feature_col,       feature_set_name,     model_list)
        ("feat_handcraft",   "audio_handcraft",     ["SVM_RBF", "RandomForest", "XGBoost"]),
        ("feat_wav2vec2",    "audio_wav2vec2",       ["SVM_RBF", "RandomForest", "XGBoost"]),
        ("feat_tfidf",       "text_tfidf",           ["SVM_Linear", "LogisticRegression", "XGBoost"]),
        ("feat_kobert",      "text_kobert_emb",      ["SVM_RBF", "RandomForest", "XGBoost"]),
        ("feat_linguistic",  "text_linguistic",      ["SVM_RBF", "RandomForest"]),
    ]

    # Early Fusion 피처 컬럼 (04_fusion.py 결과)
    fusion_experiments = [
        ("fusion_early_hc_kobert",   "early_hc+kobert"),
        ("fusion_early_w2v_kobert",  "early_w2v+kobert"),
        ("fusion_early_all",         "early_all"),
    ]

    print("\n" + "="*60)
    print("전통 ML 실험")
    print("="*60)
    for feat_col, feat_name, model_list in traditional_experiments:
        if feat_col not in df:
            print(f"[SKIP] {feat_col} 없음")
            continue
        try:
            X = np.vstack(df[feat_col].values).astype(np.float32)
            scaler = StandardScaler()
            X = scaler.fit_transform(X)
        except Exception as e:
            print(f"[ERROR] {feat_col}: {e}")
            continue

        for mname in model_list:
            run_traditional_ml(X, y, mname, feat_name, results)

    print("\n전통 ML × Early Fusion 실험")
    for feat_col, feat_name in fusion_experiments:
        if feat_col not in df:
            continue
        try:
            X = np.vstack(df[feat_col].values).astype(np.float32)
        except Exception:
            continue
        for mname in ["SVM_RBF", "RandomForest", "XGBoost"]:
            run_traditional_ml(X, y, mname, feat_name, results)

    if quick:
        return pd.DataFrame(results)

    # ── 딥러닝 ────────────────────────────────────────────
    print("\n" + "="*60)
    print("딥러닝 실험")
    print("="*60)

    for feat_col, feat_name, model_class, mname in [
        ("feat_handcraft", "audio_handcraft", LSTMClassifier, "LSTM"),
        ("feat_handcraft", "audio_handcraft", CNN1DClassifier, "CNN1D"),
        ("feat_wav2vec2",  "audio_wav2vec2",  LSTMClassifier, "LSTM_W2V"),
    ]:
        if feat_col not in df:
            continue
        X = np.vstack(df[feat_col].values).astype(np.float32)
        run_dl_model(X, y, model_class, mname, feat_name, results)

    # ── KoBERT Fine-tuning ────────────────────────────────
    if "kobert_input_ids" in df:
        print("\nKoBERT Fine-tuning 실험")
        run_kobert_finetune(df, results)

    # ── Attention Fusion ──────────────────────────────────
    print("\nAttention Fusion 실험")
    # import 방식 수정 (같은 디렉토리)
    import importlib.util, sys
    spec = importlib.util.spec_from_file_location(
        "fusion_mod", Path(__file__).parent / "04_fusion.py"
    )
    fusion_mod = importlib.util.load_from_spec(spec)
    spec.loader.exec_module(fusion_mod)

    if "feat_handcraft" in df and "feat_kobert" in df:
        X_audio = np.vstack(df["feat_handcraft"].values)
        X_text  = np.vstack(df["feat_kobert"].values)
        skf = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_SEED)
        fold_metrics = []

        for fold, (tr_idx, va_idx) in enumerate(skf.split(X_audio, y), 1):
            model, _ = fusion_mod.train_attention_fusion(
                X_audio[tr_idx], X_text[tr_idx], y[tr_idx],
                X_audio[va_idx],  X_text[va_idx],  y[va_idx],
                epochs=EPOCHS_DL
            )
            model.eval()
            device = next(model.parameters()).device
            with torch.no_grad():
                logits, _ = model(
                    torch.tensor(X_audio[va_idx], dtype=torch.float32).to(device),
                    torch.tensor(X_text[va_idx],  dtype=torch.float32).to(device)
                )
            proba  = torch.softmax(logits, dim=1).cpu().numpy()
            y_pred = np.argmax(proba, axis=1)
            m = evaluate(y[va_idx], y_pred, proba)
            m["fold"] = fold
            fold_metrics.append(m)

        avg = {k: np.mean([fm[k] for fm in fold_metrics if fm.get(k) is not None])
               for k in fold_metrics[0] if k != "fold"}
        std = {k: np.std([fm[k] for fm in fold_metrics if fm.get(k) is not None])
               for k in fold_metrics[0] if k != "fold"}
        results.append({
            "model": "AttentionFusion", "feature_set": "handcraft+kobert",
            "model_type": "Fusion",
            **{k: round(v, 4) for k, v in avg.items()},
            **{f"{k}_std": round(v, 4) for k, v in std.items()},
        })
        print(f"  [AttentionFusion] Acc={avg['accuracy']:.4f}  F1={avg['macro_f1']:.4f}")

    return pd.DataFrame(results)


# ──────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true",
                        help="전통 ML만 빠르게 실행")
    args = parser.parse_args()

    assert FUSED_PKL.exists(), \
        f"먼저 04_fusion.py를 실행하세요: {FUSED_PKL}"

    with open(FUSED_PKL, "rb") as f:
        df = pickle.load(f)

    print(f"데이터 로드: {len(df)}개 샘플")
    print(f"레이블 분포:\n{df['label'].value_counts()}\n")

    results_df = run_experiments(df, quick=args.quick)

    # 저장
    results_df.to_csv(RESULTS_CSV, index=False, encoding="utf-8-sig")
    with open(OUTPUT_DIR / "results_summary.pkl", "wb") as f:
        pickle.dump(results_df, f)

    print(f"\n✓ 실험 완료: {len(results_df)}개 실험 결과")
    print(f"  저장 위치: {RESULTS_CSV}")

    # 탑 10 출력
    print("\n[상위 10 모델 (Macro F1 기준)]")
    top = results_df.nlargest(10, "macro_f1")[
        ["model", "feature_set", "accuracy", "macro_f1", "auc_roc"]
    ]
    print(top.to_string(index=False))


if __name__ == "__main__":
    main()
