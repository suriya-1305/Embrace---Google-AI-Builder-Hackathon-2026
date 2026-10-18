"""Signal-quality checks for uploaded WAV audio. Runs before any model,
so poor recordings return "retry" instead of a fabricated result."""
from __future__ import annotations

import io
import wave

import numpy as np

MIN_SEC, MAX_SEC = 3.0, 30.0
WINDOW_SEC = 0.05
SILENCE_DB = -55.0
LOW_LEVEL_DB = -40.0
NOISE_FLOOR_DB = -35.0
CLIP_RATIO = 0.01


def _db(x: float) -> float:
    return float(20 * np.log10(max(x, 1e-9)))


def decode_wav(data: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(data), "rb") as wf:
        channels, width, rate, frames = wf.getnchannels(), wf.getsampwidth(), wf.getframerate(), wf.getnframes()
        raw = wf.readframes(frames)
    if width != 2:
        raise ValueError("Only 16-bit PCM WAV is supported.")
    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples, rate


def analyse_samples(samples: np.ndarray, rate: int, *, max_sec: float = MAX_SEC) -> dict:
    duration = len(samples) / rate if rate else 0.0
    issues: list[dict] = []
    if duration < MIN_SEC:
        issues.append({"code": "too_short", "blocking": True, "message": f"The recording is {duration:.1f} s. Record at least {MIN_SEC:.0f} seconds."})
    if duration > max_sec:
        issues.append({"code": "too_long", "blocking": True, "message": f"Keep recordings under {max_sec:.0f} seconds."})

    win = max(int(rate * WINDOW_SEC), 1)
    usable = samples[: len(samples) - len(samples) % win] if len(samples) >= win else samples
    windows = usable.reshape(-1, win) if len(usable) >= win else usable.reshape(1, -1)
    win_rms = np.sqrt(np.mean(windows**2, axis=1)) if windows.size else np.array([0.0])
    win_db = np.array([_db(v) for v in win_rms])
    rms_db = _db(float(np.sqrt(np.mean(samples**2)))) if samples.size else -120.0
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    clipping = float(np.mean(np.abs(samples) >= 0.999)) if samples.size else 0.0
    silence_ratio = float(np.mean(win_db < SILENCE_DB))
    active_ratio = float(np.mean(win_db > -30.0))
    noise_floor = float(np.percentile(win_db, 10)) if win_db.size else -120.0

    if samples.size and silence_ratio > 0.9:
        issues.append({"code": "silent", "blocking": True, "message": "We could not hear anything. Move closer and try again."})
    elif rms_db < LOW_LEVEL_DB:
        issues.append({"code": "low_level", "blocking": True, "message": "The sound is very quiet. Hold the phone closer."})
    if clipping > CLIP_RATIO:
        issues.append({"code": "clipping", "blocking": True, "message": "The sound is distorted. Hold the phone a little further away."})
    if noise_floor > NOISE_FLOOR_DB:
        issues.append({"code": "background_noise", "blocking": False, "message": "There is a lot of background sound. Results may be less reliable."})

    return {
        "ok": not any(i["blocking"] for i in issues),
        "durationSec": round(duration, 2), "sampleRate": rate, "rmsDb": round(rms_db, 1), "peak": round(peak, 3),
        "clippingRatio": round(clipping, 4), "silenceRatio": round(silence_ratio, 3), "activeRatio": round(active_ratio, 3),
        "noiseFloorDb": round(noise_floor, 1), "issues": issues,
    }


def validate_wav(data: bytes, *, max_sec: float = MAX_SEC) -> tuple[dict, np.ndarray | None, int]:
    try:
        samples, rate = decode_wav(data)
    except (wave.Error, ValueError, EOFError) as exc:
        return ({"ok": False, "durationSec": 0, "sampleRate": 0, "rmsDb": -120, "peak": 0, "clippingRatio": 0,
                 "silenceRatio": 1, "activeRatio": 0, "noiseFloorDb": -120,
                 "issues": [{"code": "unsupported_format", "blocking": True, "message": f"This file can't be read. Record again in the app. ({exc})"}]}, None, 0)
    return analyse_samples(samples, rate, max_sec=max_sec), samples, rate
