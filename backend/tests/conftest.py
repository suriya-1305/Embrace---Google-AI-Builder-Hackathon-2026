import io
import os
import wave

import numpy as np
import pytest

os.environ.setdefault("DATA_STORE", "memory")
os.environ.setdefault("AI_PROVIDER", "mock")
os.environ.setdefault("SPEECH_PROVIDER", "mock")
os.environ.setdefault("AUTH_MODE", "mock")

from fastapi.testclient import TestClient  # noqa: E402

from crysense.store import reset_store  # noqa: E402

MEERA = {"Authorization": "Bearer mock-u_meera"}
ARJUN = {"Authorization": "Bearer mock-u_arjun"}
STRANGER = {"Authorization": "Bearer mock-u_stranger"}


@pytest.fixture(autouse=True)
def fresh_store():
    reset_store()
    yield
    reset_store()


@pytest.fixture
def baby():
    from baby_api.main import app
    return TestClient(app)


@pytest.fixture
def mother():
    from mother_api.main import app
    return TestClient(app)


def wav_bytes(samples: np.ndarray, rate: int = 16000) -> bytes:
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def synthetic_cry(seconds: float = 6.0, amp: float = 0.5, noise: float = 0.0, rate: int = 16000) -> np.ndarray:
    t = np.arange(int(seconds * rate)) / rate
    f0 = 450 + 60 * np.sin(2 * np.pi * 0.8 * t)
    tone = sum(np.sin(2 * np.pi * k * np.cumsum(f0) / rate) / k for k in (1, 2, 3))
    envelope = ((t % 1.6) < 1.2).astype(float)
    rng = np.random.default_rng(7)
    return amp * tone / 1.8 * envelope + noise * rng.standard_normal(len(t))
