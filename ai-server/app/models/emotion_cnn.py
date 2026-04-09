"""
Turkcell 벤치마킹 기반 CNN 감정 분류 모델 (Track B 방법 B)
입력: Mel-Spectrogram (1, 128, 128)
출력: 감정 클래스 로짓 (num_classes)
"""

import torch
import torch.nn as nn


class EmotionCNN(nn.Module):
    """
    2D CNN — Spectrogram 이미지에서 주파수 패턴 기반 감정 분류
    Turkcell Global Bilgi (2024) 아키텍처를 참고한 경량 버전.
    """

    def __init__(self, num_classes: int = 7):
        super().__init__()
        self.features = nn.Sequential(
            # Block 1
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),  # 64×64

            # Block 2
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),  # 32×32

            # Block 3
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),  # 16×16

            # Block 4
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((4, 4)),  # 4×4
        )

        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256 * 4 * 4, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.4),
            nn.Linear(512, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        return self.classifier(x)


# ── 빠른 테스트 ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    model = EmotionCNN(num_classes=7)
    dummy = torch.randn(4, 1, 128, 128)  # batch=4
    out = model(dummy)
    print("Output shape:", out.shape)  # (4, 7)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Total params: {total_params:,}")
