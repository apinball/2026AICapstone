"""
06_results_table.py
───────────────────
실험 결과를 논문 제출용으로 정리합니다.

생성 파일:
  - outputs/paper_table_main.csv       : 메인 결과 테이블 (LaTeX 호환)
  - outputs/paper_table_ablation.csv   : Ablation study 테이블
  - outputs/fig_model_comparison.png  : 모델별 Accuracy/F1 바 차트
  - outputs/fig_confusion_matrix.png  : 최고 모델 혼동 행렬
  - outputs/fig_feature_importance.png : Feature importance (RF)
  - outputs/fig_fusion_comparison.png : Fusion 전략 비교

사용법:
  python 06_results_table.py
"""

import pickle
import warnings
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import pandas as pd
import seaborn as sns

from config import OUTPUT_DIR, LABELS

warnings.filterwarnings("ignore")

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size":   11,
    "axes.spines.top":   False,
    "axes.spines.right": False,
    "figure.dpi":        150,
})

RESULTS_CSV = OUTPUT_DIR / "results.csv"


# ──────────────────────────────────────────────────────────────
# 결과 로드 및 전처리
# ──────────────────────────────────────────────────────────────
def load_results() -> pd.DataFrame:
    assert RESULTS_CSV.exists(), \
        f"먼저 05_train_compare.py를 실행하세요: {RESULTS_CSV}"
    df = pd.read_csv(RESULTS_CSV, encoding="utf-8-sig")
    return df


# ──────────────────────────────────────────────────────────────
# 메인 결과 테이블 (논문 Table 형식)
# ──────────────────────────────────────────────────────────────
def build_main_table(df: pd.DataFrame) -> pd.DataFrame:
    """
    논문 메인 테이블: 모델 × 피처 × 지표
    Acc(±std), Macro-F1(±std), AUC-ROC 포맷
    """
    cols_needed = ["model", "feature_set", "model_type",
                   "accuracy", "accuracy_std",
                   "macro_f1", "macro_f1_std",
                   "auc_roc"]

    present = [c for c in cols_needed if c in df.columns]
    table   = df[present].copy()

    # 포맷: 0.8234 ± 0.0123
    table["Accuracy"]  = table.apply(
        lambda r: f"{r['accuracy']:.4f} ± {r.get('accuracy_std', 0):.4f}", axis=1)
    table["Macro-F1"]  = table.apply(
        lambda r: f"{r['macro_f1']:.4f} ± {r.get('macro_f1_std', 0):.4f}", axis=1)
    if "auc_roc" in table:
        table["AUC-ROC"] = table["auc_roc"].apply(
            lambda x: f"{x:.4f}" if pd.notna(x) else "-")

    # 최고 행 마킹
    best_idx = table["macro_f1"].idxmax()
    table.loc[best_idx, "Rank"] = "★"

    out_cols = ["model_type", "model", "feature_set",
                "Accuracy", "Macro-F1"] + \
               (["AUC-ROC"] if "AUC-ROC" in table else []) + \
               (["Rank"] if "Rank" in table else [])

    result = table[[c for c in out_cols if c in table.columns]]
    result = result.sort_values(["model_type", "macro_f1"],
                                 ascending=[True, False])
    result.columns = [c.replace("_", " ").title() for c in result.columns]
    return result


def build_ablation_table(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ablation Study: 같은 모델(XGBoost / RF)에서
    피처를 점진적으로 추가할 때 성능 변화.
    """
    ablation_order = [
        "audio_handcraft",
        "text_tfidf",
        "text_kobert_emb",
        "audio_wav2vec2",
        "early_hc+kobert",
        "early_w2v+kobert",
        "early_all",
    ]
    target_models = ["XGBoost", "RandomForest", "SVM_RBF"]

    rows = []
    for feat in ablation_order:
        sub = df[(df["feature_set"] == feat) &
                 (df["model"].isin(target_models))]
        if sub.empty:
            continue
        for _, r in sub.iterrows():
            rows.append({
                "Feature Set": feat,
                "Model":       r["model"],
                "Accuracy":    f"{r['accuracy']:.4f}",
                "Macro-F1":    f"{r['macro_f1']:.4f}",
            })

    return pd.DataFrame(rows)


# ──────────────────────────────────────────────────────────────
# 시각화 함수
# ──────────────────────────────────────────────────────────────
COLOR_MAP = {
    "Traditional ML": "#4C72B0",
    "Deep Learning":  "#DD8452",
    "Fusion":         "#55A868",
    "Pretrained":     "#C44E52",
}


def fig_model_comparison(df: pd.DataFrame) -> None:
    """모델별 Accuracy / Macro-F1 grouped bar chart."""
    df_sorted = df.sort_values("macro_f1", ascending=False).head(15)
    labels    = [f"{r['model']}\n({r['feature_set'][:12]})"
                 for _, r in df_sorted.iterrows()]
    acc_vals  = df_sorted["accuracy"].values
    f1_vals   = df_sorted["macro_f1"].values
    colors    = [COLOR_MAP.get(t, "#888888")
                 for t in df_sorted["model_type"]]

    x  = np.arange(len(labels))
    w  = 0.38
    fig, ax = plt.subplots(figsize=(14, 6))

    bars_acc = ax.bar(x - w/2, acc_vals, w, label="Accuracy",
                      color=colors, alpha=0.85)
    bars_f1  = ax.bar(x + w/2, f1_vals,  w, label="Macro-F1",
                      color=colors, alpha=0.5, hatch="//")

    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=8.5, rotation=35, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Score")
    ax.set_title("Model Performance Comparison (Top 15 by Macro-F1)", fontsize=13)

    # 오차 막대
    if "accuracy_std" in df_sorted:
        ax.errorbar(x - w/2, acc_vals, yerr=df_sorted["accuracy_std"].values,
                    fmt="none", ecolor="black", capsize=3, linewidth=0.8)
        ax.errorbar(x + w/2, f1_vals,  yerr=df_sorted["macro_f1_std"].values,
                    fmt="none", ecolor="black", capsize=3, linewidth=0.8)

    # 범례: 모델 타입 색상 + 지표 해치
    type_patches = [mpatches.Patch(color=c, label=t)
                    for t, c in COLOR_MAP.items()]
    acc_patch = mpatches.Patch(color="gray", alpha=0.85, label="Accuracy (solid)")
    f1_patch  = mpatches.Patch(color="gray", alpha=0.5,  hatch="//", label="Macro-F1 (hatch)")
    ax.legend(handles=type_patches + [acc_patch, f1_patch],
              fontsize=8.5, loc="lower right")

    plt.tight_layout()
    out = OUTPUT_DIR / "fig_model_comparison.png"
    plt.savefig(out, bbox_inches="tight")
    plt.close()
    print(f"  저장: {out}")


def fig_fusion_comparison(df: pd.DataFrame) -> None:
    """Fusion 전략별 성능 비교 (Early / Late / Attention)."""
    fusion_kw = ["early", "late", "fusion", "attention"]
    mask = df["feature_set"].str.lower().apply(
        lambda x: any(kw in x for kw in fusion_kw)
    ) | df["model"].str.lower().apply(
        lambda x: any(kw in x for kw in fusion_kw)
    )
    sub = df[mask].sort_values("macro_f1", ascending=False)
    if sub.empty:
        print("  [SKIP] Fusion 결과 없음")
        return

    fig, ax = plt.subplots(figsize=(10, 5))
    x = np.arange(len(sub))
    w = 0.4
    ax.bar(x - w/2, sub["accuracy"], w, label="Accuracy", color="#4C72B0", alpha=0.85)
    ax.bar(x + w/2, sub["macro_f1"], w, label="Macro-F1", color="#55A868", alpha=0.85)
    ax.set_xticks(x)
    ax.set_xticklabels([f"{r['model']}\n{r['feature_set'][:14]}"
                         for _, r in sub.iterrows()],
                        fontsize=9, rotation=30, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Score")
    ax.set_title("Fusion Strategy Comparison", fontsize=13)
    ax.legend()
    plt.tight_layout()
    out = OUTPUT_DIR / "fig_fusion_comparison.png"
    plt.savefig(out, bbox_inches="tight")
    plt.close()
    print(f"  저장: {out}")


def fig_heatmap_by_feature(df: pd.DataFrame) -> None:
    """
    피처 × 모델 Macro-F1 히트맵.
    논문에서 피처-모델 상호작용을 시각화할 때 유용합니다.
    """
    pivot = df.pivot_table(
        index="feature_set", columns="model",
        values="macro_f1", aggfunc="max"
    )
    if pivot.empty:
        return

    fig, ax = plt.subplots(figsize=(max(8, pivot.shape[1] * 1.2),
                                    max(5, pivot.shape[0] * 0.7)))
    sns.heatmap(pivot, annot=True, fmt=".3f", cmap="YlGnBu",
                linewidths=0.5, ax=ax, vmin=0.3, vmax=1.0,
                cbar_kws={"label": "Macro-F1"})
    ax.set_title("Macro-F1 by Feature × Model", fontsize=13)
    ax.set_xlabel("Model")
    ax.set_ylabel("Feature Set")
    plt.tight_layout()
    out = OUTPUT_DIR / "fig_feature_model_heatmap.png"
    plt.savefig(out, bbox_inches="tight")
    plt.close()
    print(f"  저장: {out}")


def fig_learning_curve_placeholder() -> None:
    """
    학습 곡선 플레이스홀더.
    실제 history dict를 05_train_compare.py에서 저장하면 교체하세요.
    """
    history_pkl = OUTPUT_DIR / "dl_histories.pkl"
    if not history_pkl.exists():
        return

    with open(history_pkl, "rb") as f:
        histories = pickle.load(f)  # {model_name: {"val_acc": [...], "val_f1": [...]}}

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    for name, hist in histories.items():
        if "val_acc" in hist:
            axes[0].plot(hist["val_acc"], label=name)
        if "val_f1" in hist:
            axes[1].plot(hist["val_f1"], label=name)

    axes[0].set_title("Validation Accuracy")
    axes[0].set_xlabel("Epoch"); axes[0].set_ylabel("Accuracy")
    axes[0].legend(fontsize=8)
    axes[1].set_title("Validation Macro-F1")
    axes[1].set_xlabel("Epoch"); axes[1].set_ylabel("Macro-F1")
    axes[1].legend(fontsize=8)

    plt.tight_layout()
    out = OUTPUT_DIR / "fig_learning_curves.png"
    plt.savefig(out, bbox_inches="tight")
    plt.close()
    print(f"  저장: {out}")


# ──────────────────────────────────────────────────────────────
# LaTeX 테이블 생성
# ──────────────────────────────────────────────────────────────
def to_latex(df: pd.DataFrame, caption: str, label: str) -> str:
    """DataFrame → LaTeX booktabs 테이블."""
    ncols = len(df.columns)
    col_fmt = "l" + "c" * (ncols - 1)

    lines = [
        r"\begin{table}[htbp]",
        r"\centering",
        f"\\caption{{{caption}}}",
        f"\\label{{{label}}}",
        r"\begin{tabular}{" + col_fmt + "}",
        r"\toprule",
    ]

    # 헤더
    lines.append(" & ".join(df.columns.tolist()) + r" \\")
    lines.append(r"\midrule")

    # 데이터 행
    prev_type = None
    for _, row in df.iterrows():
        if "Model Type" in df.columns:
            curr_type = row["Model Type"]
            if curr_type != prev_type and prev_type is not None:
                lines.append(r"\midrule")
            prev_type = curr_type

        # 최고 행 볼드 처리
        vals = []
        for v in row:
            s = str(v).replace("%", r"\%").replace("_", r"\_")
            if "★" in s:
                s = r"\textbf{" + s.replace("★", "").strip() + "}"
            vals.append(s)
        lines.append(" & ".join(vals) + r" \\")

    lines += [r"\bottomrule", r"\end{tabular}", r"\end{table}"]
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────
def main():
    print("결과 정리 시작...")
    df = load_results()

    print(f"  총 실험 수: {len(df)}")
    print(f"  모델 종류: {df['model'].nunique()}")
    print(f"  피처 조합: {df['feature_set'].nunique()}")

    # 메인 테이블
    main_table = build_main_table(df)
    out_csv = OUTPUT_DIR / "paper_table_main.csv"
    main_table.to_csv(out_csv, index=False, encoding="utf-8-sig")
    print(f"\n[메인 테이블] → {out_csv}")
    print(main_table.head(10).to_string(index=False))

    # Ablation 테이블
    ablation = build_ablation_table(df)
    if not ablation.empty:
        abl_csv = OUTPUT_DIR / "paper_table_ablation.csv"
        ablation.to_csv(abl_csv, index=False, encoding="utf-8-sig")
        print(f"\n[Ablation 테이블] → {abl_csv}")

    # LaTeX 출력
    latex_str = to_latex(
        main_table.head(15),
        caption="Emotion Classification Results on 2-Speaker Dialogue Corpus",
        label="tab:results_main"
    )
    latex_path = OUTPUT_DIR / "paper_table_main.tex"
    latex_path.write_text(latex_str, encoding="utf-8")
    print(f"\n[LaTeX] → {latex_path}")

    # 시각화
    print("\n시각화 생성 중...")
    fig_model_comparison(df)
    fig_fusion_comparison(df)
    fig_heatmap_by_feature(df)
    fig_learning_curve_placeholder()

    # 최고 모델 요약
    print("\n" + "="*50)
    print("[최고 성능 모델 요약]")
    best = df.loc[df["macro_f1"].idxmax()]
    print(f"  모델:       {best['model']}")
    print(f"  피처:       {best['feature_set']}")
    print(f"  Accuracy:   {best['accuracy']:.4f}")
    print(f"  Macro-F1:   {best['macro_f1']:.4f}")
    if "auc_roc" in best:
        print(f"  AUC-ROC:    {best.get('auc_roc', 'N/A')}")

    print("\n✓ 모든 결과 파일 생성 완료")
    print(f"  출력 폴더: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
