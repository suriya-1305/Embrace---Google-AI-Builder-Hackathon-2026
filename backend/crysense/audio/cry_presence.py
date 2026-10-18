"""Cry-presence detection: detected / not_detected / uncertain.

Never infers hunger, gas, pain or illness. CRY_MODEL=mock uses a transparent
energy heuristic for demos; CRY_MODEL=yamnet uses Google's YAMNet (AudioSet)
"Baby cry, infant cry" class as an evaluated baseline.
"""
from __future__ import annotations

import numpy as np

LIMITATIONS = [
    "Only tells whether crying is present. It does not tell why a baby is crying.",
    "Background sound, distance and phone microphones change results.",
    "A result here never replaces your judgement or medical advice.",
]


class MockCryPresence:
    version = "mock-energy-0.1"

    def detect(self, samples: np.ndarray, rate: int, quality: dict) -> dict:
        if not quality["ok"] or any(i["code"] == "background_noise" for i in quality["issues"]):
            return {"presence": "uncertain", "confidence": None}
        if quality["activeRatio"] >= 0.35 and quality["rmsDb"] > -32:
            return {"presence": "detected", "confidence": round(min(0.95, 0.55 + quality["activeRatio"] / 2), 2)}
        if quality["activeRatio"] < 0.1:
            return {"presence": "not_detected", "confidence": 0.7}
        return {"presence": "uncertain", "confidence": None}


class YamnetCryPresence:
    """Requires: pip install tensorflow tensorflow-hub (see requirements-ml.txt)."""

    version = "yamnet-audioset-1"
    DETECT_AT, REJECT_BELOW = 0.35, 0.10  # tune on an audited, licensed evaluation set

    def __init__(self) -> None:
        import csv

        import tensorflow as tf
        import tensorflow_hub as hub

        self._model = hub.load("https://tfhub.dev/google/yamnet/1")
        class_map = self._model.class_map_path().numpy().decode()
        with tf.io.gfile.GFile(class_map) as fh:
            names = [row["display_name"] for row in csv.DictReader(fh)]
        self._cry_index = names.index("Baby cry, infant cry")

    def detect(self, samples: np.ndarray, rate: int, quality: dict) -> dict:
        if not quality["ok"]:
            return {"presence": "uncertain", "confidence": None}
        if rate != 16000:  # YAMNet expects 16 kHz mono float32
            idx = np.linspace(0, len(samples) - 1, int(len(samples) * 16000 / rate))
            samples = np.interp(idx, np.arange(len(samples)), samples).astype(np.float32)
        scores, _, _ = self._model(samples)
        cry = float(np.max(scores.numpy()[:, self._cry_index]))
        if cry >= self.DETECT_AT:
            return {"presence": "detected", "confidence": round(cry, 2)}
        if cry < self.REJECT_BELOW:
            return {"presence": "not_detected", "confidence": round(1 - cry, 2)}
        return {"presence": "uncertain", "confidence": None}


_MODEL = None


def get_cry_model(name: str):
    global _MODEL
    if _MODEL is None:
        _MODEL = YamnetCryPresence() if name == "yamnet" else MockCryPresence()
    return _MODEL
