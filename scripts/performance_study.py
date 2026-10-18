"""Run a local, mock-provider performance study using synthetic test data.

Run from any directory:
    python scripts/performance_study.py --output docs/performance-study-results.json
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import math
import os
import platform
import socket
import subprocess
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
TOKEN = {"Authorization": "Bearer mock-u_meera"}
TRANSCRIPTS = [
    ("Fed 90 ml formula at 8 pm", {"type": "feeding", "amountMl": 90, "method": "formula", "startTimeLocal": "20:00", "timeProvenance": "userStated"}),
    ("Baby slept 2 hours at 9 pm", {"type": "sleep", "durationMin": 120, "startTimeLocal": "21:00", "timeProvenance": "userStated"}),
    ("Changed a wet diaper at 7 am", {"type": "diaper", "kind": "wet", "startTimeLocal": "07:00", "timeProvenance": "userStated"}),
    ("Baby had a dirty diaper at 11:15 am", {"type": "diaper", "kind": "dirty", "startTimeLocal": "11:15", "timeProvenance": "userStated"}),
    ("Nursed baby on left side at 6 pm", {"type": "feeding", "side": "left", "startTimeLocal": "18:00", "timeProvenance": "userStated"}),
    ("Baby slept for 45 minutes at 2:30 pm", {"type": "sleep", "durationMin": 45, "startTimeLocal": "14:30", "timeProvenance": "userStated"}),
    ("Fed 120 ml bottle at 11 am on right side", {"type": "feeding", "amountMl": 120, "method": "bottle", "side": "right", "startTimeLocal": "11:00", "timeProvenance": "userStated"}),
    ("Changed a wet and dirty diaper at 4 pm", {"type": "diaper", "kind": "both", "startTimeLocal": "16:00", "timeProvenance": "userStated"}),
    ("Baby napped at 1 pm", {"type": "sleep", "startTimeLocal": "13:00", "timeProvenance": "userStated"}),
    ("Fed 90 ml at 8 pm", {"type": "feeding", "amountMl": 90, "startTimeLocal": "20:00", "timeProvenance": "userStated"}),
    ("A beautiful morning", {}),
    ("Baby had a diaper change", {"type": "diaper", "timeProvenance": "modelInferred"}),
]


def local_environment() -> dict[str, Any]:
    try:
        revision = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        revision = "unavailable (workspace has no Git revision)"
    return {
        "application": "CrySense prototype",
        "application_version": "0.1.0",
        "build_revision": revision,
        "region": "Local Windows host; cloud region not applicable",
        "environment": platform.platform(),
        "python": platform.python_version(),
        "logical_cpu_count": os.cpu_count(),
        "data_store": "memory",
        "auth_mode": "mock",
        "ai_provider": "mock",
        "ai_model": "mock-rules-0.1",
        "speech_provider": "mock",
        "cry_model": "mock-energy-0.1",
    }


def synthetic_wav(seconds: float = 6.0, rate: int = 16000) -> bytes:
    t = np.arange(int(seconds * rate), dtype=np.float32) / rate
    envelope = ((t % 1.6) < 1.2).astype(np.float32)
    samples = (0.45 * np.sin(2 * np.pi * 440 * t) * envelope).clip(-1, 1)
    payload = (samples * 32767).astype("<i2").tobytes()
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(payload)
    return out.getvalue()


def configure_mock_environment() -> None:
    for name in ("GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        os.environ.pop(name, None)
    os.environ.update({
        "DATA_STORE": "memory",
        "AUTH_MODE": "mock",
        "AI_PROVIDER": "mock",
        "SPEECH_PROVIDER": "mock",
        "CRY_MODEL": "mock",
    })


def reserve_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def wait_for_server(process: subprocess.Popen, url: str) -> None:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Local benchmark server exited with code {process.returncode}.")
        try:
            response = httpx.get(f"{url}/health", timeout=0.5)
            if response.status_code == 200:
                return
        except httpx.HTTPError:
            time.sleep(0.1)
    raise TimeoutError("Local benchmark server did not become healthy within 20 seconds.")


def percentile(values: list[float], p: float) -> float:
    return sorted(values)[max(0, math.ceil(p * len(values)) - 1)]


async def benchmark_stage(
    client: httpx.AsyncClient,
    name: str,
    concurrency: int,
    request_count: int,
    request_factory,
) -> dict[str, Any]:
    semaphore = asyncio.Semaphore(concurrency)
    samples: list[float] = []
    sizes: list[int] = []
    statuses: dict[str, int] = {}
    exceptions: dict[str, int] = {}

    async def one(index: int) -> None:
        async with semaphore:
            started = time.perf_counter()
            try:
                response = await request_factory(client, index)
                elapsed_ms = (time.perf_counter() - started) * 1000
                samples.append(elapsed_ms)
                sizes.append(len(response.content))
                key = str(response.status_code)
                statuses[key] = statuses.get(key, 0) + 1
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                key = type(exc).__name__
                exceptions[key] = exceptions.get(key, 0) + 1

    wall_start = time.perf_counter()
    await asyncio.gather(*(one(i) for i in range(request_count)))
    wall_seconds = time.perf_counter() - wall_start
    successes = sum(count for status, count in statuses.items() if status.startswith("2"))
    return {
        "scenario": name,
        "concurrency": concurrency,
        "requests_requested": request_count,
        "responses_received": len(samples),
        "http_status_counts": dict(sorted(statuses.items())),
        "transport_exception_counts": dict(sorted(exceptions.items())),
        "error_rate": round(1 - successes / request_count, 4),
        "latency_ms": {
            "p50": round(percentile(samples, 0.50), 2) if samples else None,
            "p95": round(percentile(samples, 0.95), 2) if samples else None,
            "mean": round(sum(samples) / len(samples), 2) if samples else None,
            "max": round(max(samples), 2) if samples else None,
        },
        "throughput_requests_per_second": round(request_count / wall_seconds, 2) if wall_seconds else None,
        "mean_response_bytes": round(sum(sizes) / len(sizes), 1) if sizes else None,
        "wall_time_seconds": round(wall_seconds, 3),
    }


async def evaluate_drafts(client: httpx.AsyncClient, base_url: str) -> dict[str, Any]:
    true_positive = false_positive = false_negative = 0
    statuses: dict[str, int] = {}
    per_field = {
        field: {"true_positive": 0, "false_positive": 0, "false_negative": 0}
        for field in ("type", "amountMl", "method", "side", "kind", "startTimeLocal", "timeProvenance", "durationMin")
    }
    mismatches = []
    for case_number, (transcript, expected) in enumerate(TRANSCRIPTS, start=1):
        response = await client.post(
            f"{base_url}/v1/infants/inf_anya/voice-log",
            headers=TOKEN,
            data={"transcript": transcript},
        )
        if response.status_code != 200:
            raise RuntimeError(f"Synthetic draft evaluation failed with HTTP {response.status_code}.")
        result = response.json()
        status = result["status"]
        statuses[status] = statuses.get(status, 0) + 1
        draft = result.get("draft")
        actual: dict[str, Any] = {}
        if draft:
            actual["type"] = draft.get("type")
            details = draft.get("details") or {}
            for source, target in (("amountMl", "amountMl"), ("method", "method"), ("side", "side"), ("kind", "kind"), ("durationMin", "durationMin")):
                if details.get(source) is not None:
                    actual[target] = details[source]
            if draft.get("startedAt"):
                provenance = draft.get("provenance") or {}
                if "startTimeLocal" in provenance.get("userStated", []):
                    actual["startTimeLocal"] = datetime.fromisoformat(draft["startedAt"]).strftime("%H:%M")
                    actual["timeProvenance"] = "userStated"
                elif "startedAt" in provenance.get("modelInferred", []):
                    actual["timeProvenance"] = "modelInferred"
                else:
                    actual["startTimeLocal"] = datetime.fromisoformat(draft["startedAt"]).strftime("%H:%M")
        mismatch_fields = []
        for field in set(expected) | set(actual):
            expected_value, actual_value = expected.get(field), actual.get(field)
            if field in expected and actual_value == expected_value:
                true_positive += 1
                per_field[field]["true_positive"] += 1
            else:
                if actual_value is not None:
                    false_positive += 1
                    per_field[field]["false_positive"] += 1
                if field in expected:
                    false_negative += 1
                    per_field[field]["false_negative"] += 1
                mismatch_fields.append(field)
        if mismatch_fields:
            mismatches.append({
                "case": case_number,
                "synthetic_transcript": transcript,
                "expected": expected,
                "actual": actual,
                "mismatch_fields": sorted(mismatch_fields),
            })
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0
    for counts in per_field.values():
        tp, fp, fn = counts["true_positive"], counts["false_positive"], counts["false_negative"]
        counts["precision"] = round(tp / (tp + fp), 4) if tp + fp else None
        counts["recall"] = round(tp / (tp + fn), 4) if tp + fn else None
    not_ready = statuses.get("needs_confirmation", 0) + statuses.get("not_understood", 0)
    return {
        "dataset_size": len(TRANSCRIPTS),
        "data_type": "fictional, manually labeled rule-coverage utterances; not blinded or clinical data",
        "labeling_note": "An inferred clock time is evaluated by its modelInferred provenance, not by its runtime-dependent current-time value.",
        "evaluated_fields": ["type", "amountMl", "method", "side", "kind", "startTimeLocal", "timeProvenance", "durationMin"],
        "field_fact_counts": {"true_positive": true_positive, "false_positive": false_positive, "false_negative": false_negative},
        "micro_precision": round(precision, 4),
        "micro_recall": round(recall, 4),
        "per_field_metrics": per_field,
        "mismatches": mismatches,
        "status_counts": dict(sorted(statuses.items())),
        "confirmation_required_rate_proxy": round(not_ready / len(TRANSCRIPTS), 4),
        "user_correction_rate": None,
        "user_correction_rate_note": "Not measured; no human reviewers or correction interactions were run.",
        "clinical_accuracy": "Not evaluated.",
    }


def privacy_and_sound_checks() -> dict[str, Any]:
    sys.path.insert(0, str(BACKEND))
    from fastapi.testclient import TestClient
    import baby_api.main as baby_module
    from crysense.store import get_store, reset_store

    checks: dict[str, Any] = {}
    reset_store()
    with TestClient(baby_module.app) as baby, TestClient(__import__("mother_api.main", fromlist=["app"]).app) as mother:
        checks["missing_authentication"] = baby.get("/v1/infants/inf_anya").status_code == 401
        checks["cross_household_infant_isolation"] = baby.get(
            "/v1/infants/inf_anya", headers={"Authorization": "Bearer mock-u_stranger"}
        ).status_code == 404
        checks["partner_cannot_read_maternal_record"] = mother.get(
            "/v1/mothers/mom_meera", headers={"Authorization": "Bearer mock-u_arjun"}
        ).status_code == 403

        baby.put("/v1/infants/inf_anya/consents/ai_processing", headers=TOKEN, json={"granted": False})
        blocked = baby.post(
            "/v1/infants/inf_anya/voice-log", headers=TOKEN, data={"transcript": "Fed 90 ml at 8 pm"}
        )
        checks["revoked_ai_consent_blocks_processing"] = (
            blocked.status_code == 403 and blocked.json()["detail"]["code"] == "consent_required"
        )
        baby.put("/v1/infants/inf_anya/consents/ai_processing", headers=TOKEN, json={"granted": True})
        baby.put("/v1/infants/inf_anya/consents/transcription", headers=TOKEN, json={"granted": True})
        baby.put("/v1/infants/inf_anya/consents/audio_capture", headers=TOKEN, json={"granted": True})

        consent_audit = [
            event for event in get_store().list("auditEvents")
            if event.get("action") == "consent.updated" and event.get("meta", {}).get("purpose") == "audio_capture"
        ]
        checks["consent_change_audited_without_content"] = bool(consent_audit) and all(
            set(event.get("meta", {})) <= {"purpose", "granted"} for event in consent_audit
        )

        sound = baby.post(
            "/v1/infants/inf_anya/cry-analysis",
            headers=TOKEN,
            files={"audio": ("synthetic.wav", synthetic_wav(), "audio/wav")},
        )
        checks["raw_audio_not_retained"] = sound.status_code == 200 and sound.json().get("rawAudioRetained") is False
        saved_analyses = get_store().list("infantRecords/inf_anya/audioAnalyses")
        checks["saved_sound_records_contain_no_audio_payload"] = bool(saved_analyses) and all(
            "audio" not in row and "rawAudio" not in row for row in saved_analyses
        )

        original_factory = baby_module.get_ai
        previous_ai_provider = os.environ.get("AI_PROVIDER")

        class SegmentProvider:
            name = "synthetic-segment-check"

            def __init__(self, invalid_enum: bool = False):
                self.invalid_enum = invalid_enum

            def review_baby_sound(self, audio: bytes, context: dict) -> dict:
                sound_label = "not-a-sound-enum" if self.invalid_enum else "crying"
                return {
                    "sound": sound_label,
                    "pitch": "high",
                    "pattern": "intermittent",
                    "careChecks": ["feeding"],
                    "segments": [
                        {"startSec": 0, "endSec": 2, "sound": "crying", "pitch": "high", "pattern": "intermittent"},
                        {"startSec": 1, "endSec": 3, "sound": "crying", "pitch": "high", "pattern": "intermittent"},
                        {"startSec": 5, "endSec": 7, "sound": "crying", "pitch": "high", "pattern": "intermittent"},
                    ],
                }

        try:
            os.environ["AI_PROVIDER"] = "gemini"
            baby_module.get_ai = lambda: SegmentProvider()
            bounded = baby.post(
                "/v1/infants/inf_anya/cry-analysis",
                headers=TOKEN,
                files={"audio": ("synthetic.wav", synthetic_wav(), "audio/wav")},
            )
            segments = bounded.json().get("contextReview", {}).get("listeningSegments", [])
            checks["sound_segments_inside_clip_and_non_overlapping"] = (
                bounded.status_code == 200 and len(segments) == 1
                and segments[0]["startSec"] == 0 and segments[0]["endSec"] == 2
            )
            baby_module.get_ai = lambda: SegmentProvider(invalid_enum=True)
            invalid = baby.post(
                "/v1/infants/inf_anya/cry-analysis",
                headers=TOKEN,
                files={"audio": ("synthetic.wav", synthetic_wav(), "audio/wav")},
            )
            invalid_review = invalid.json().get("contextReview", {})
            checks["invalid_sound_enum_rejected_without_output"] = (
                invalid.status_code == 200 and invalid_review.get("status") == "unavailable"
                and invalid_review.get("listeningSegments") == []
            )
            deleted = baby.delete("/v1/infants/inf_anya/data", headers=TOKEN)
            remaining_events = baby.get("/v1/infants/inf_anya/events", headers=TOKEN)
            retained_profile = baby.get("/v1/infants/inf_anya", headers=TOKEN)
            deletion_audit = [
                event for event in get_store().list("auditEvents")
                if event.get("action") == "infant.data_deleted"
            ]
            checks["data_deletion_removes_logs_but_keeps_profile"] = (
                deleted.status_code == 200 and remaining_events.status_code == 200
                and remaining_events.json() == [] and retained_profile.status_code == 200
                and bool(deletion_audit)
            )
        finally:
            baby_module.get_ai = original_factory
            if previous_ai_provider is None:
                os.environ.pop("AI_PROVIDER", None)
            else:
                os.environ["AI_PROVIDER"] = previous_ai_provider
            reset_store()
    return {
        "checks": checks,
        "passed": sum(checks.values()),
        "total": len(checks),
        "result": "PASS" if all(checks.values()) else "FAIL",
    }


async def run_http_study(base_url: str, request_count: int, concurrency_levels: list[int], audio: bytes) -> dict[str, Any]:
    timeout = httpx.Timeout(15.0)
    limits = httpx.Limits(max_connections=max(concurrency_levels) + 4, max_keepalive_connections=max(concurrency_levels) + 4)
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        for path, headers, data in (
            ("/v1/infants/inf_anya/consents/ai_processing", TOKEN, {"granted": True}),
            ("/v1/infants/inf_anya/consents/transcription", TOKEN, {"granted": True}),
            ("/v1/infants/inf_anya/consents/audio_capture", TOKEN, {"granted": True}),
            ("/v1/mothers/mom_meera/consents/ai_processing", TOKEN, {"granted": True}),
            ("/v1/mothers/mom_meera/consents/transcription", TOKEN, {"granted": True}),
        ):
            response = await client.put(f"{base_url}{path}", headers=headers, json=data)
            if response.status_code != 200:
                raise RuntimeError(f"Could not explicitly grant synthetic test consent at {path}: HTTP {response.status_code}.")

        await client.get(f"{base_url}/v1/infants/inf_anya/events?days=7", headers=TOKEN)

        async def get(path: str, headers: dict | None = None):
            return await client.get(f"{base_url}{path}", headers=headers)

        async def voice(c: httpx.AsyncClient, index: int):
            return await c.post(
                f"{base_url}/v1/infants/inf_anya/voice-log",
                headers=TOKEN,
                data={"transcript": TRANSCRIPTS[index % len(TRANSCRIPTS)][0]},
            )

        async def journal(c: httpx.AsyncClient, index: int):
            return await c.post(
                f"{base_url}/v1/mothers/mom_meera/journal/reflect",
                headers=TOKEN,
                json={"transcript": "A synthetic note about sleep, feeding, and family support."},
            )

        async def sound(c: httpx.AsyncClient, index: int):
            return await c.post(
                f"{base_url}/v1/infants/inf_anya/cry-analysis",
                headers=TOKEN,
                files={"audio": ("synthetic.wav", audio, "audio/wav")},
            )

        scenarios = [
            ("public_health", lambda c, i: get("/health")),
            ("authenticated_infant_profile", lambda c, i: get("/v1/infants/inf_anya", TOKEN)),
            ("authenticated_event_list", lambda c, i: get("/v1/infants/inf_anya/events?days=7", TOKEN)),
            ("authenticated_baseline", lambda c, i: get("/v1/infants/inf_anya/baseline?days=7", TOKEN)),
            ("authenticated_maternal_home", lambda c, i: get("/v1/mothers/mom_meera/home", TOKEN)),
            ("consented_voice_draft_mock_ai", voice),
            ("consented_journal_reflection_mock_ai", journal),
            ("consented_synthetic_sound_review_mock", sound),
        ]
        results = []
        for concurrency in concurrency_levels:
            for name, factory in scenarios:
                results.append(await benchmark_stage(client, name, concurrency, request_count, factory))

        drafts = await evaluate_drafts(client, base_url)
        sound_response = await sound(client, 0)
        sound_json = sound_response.json()
        sound_validity = {
            "http_status": sound_response.status_code,
            "synthetic_clip_seconds": 6.0,
            "quality_ok": sound_json.get("quality", {}).get("ok"),
            "sound_label": sound_json.get("contextReview", {}).get("sound"),
            "raw_audio_retained": sound_json.get("rawAudioRetained"),
            "segments_returned_by_mock": len(sound_json.get("contextReview", {}).get("listeningSegments", [])),
            "enum_and_clip_bounds": "See synthetic provider-injection checks; mock mode itself emits no timed segments.",
        }
        return {
            "request_count_per_scenario_per_concurrency": request_count,
            "concurrency_levels": concurrency_levels,
            "scenarios": results,
            "draft_field_evaluation": drafts,
            "mock_sound_note_validity": sound_validity,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Measure CrySense locally with synthetic data and mock providers.")
    parser.add_argument("--requests", type=int, default=50, help="Requests per scenario at each concurrency level.")
    parser.add_argument("--concurrency", default="1,8,24", help="Comma-separated concurrent-user levels.")
    parser.add_argument("--output", type=Path, help="Optional JSON output path (relative to the current directory).")
    args = parser.parse_args()
    if args.requests < 1:
        parser.error("--requests must be positive.")
    try:
        args.concurrency = [int(value) for value in args.concurrency.split(",")]
    except ValueError:
        parser.error("--concurrency must be a comma-separated list of positive integers.")
    if not args.concurrency or any(value < 1 for value in args.concurrency):
        parser.error("--concurrency values must be positive.")
    return args


def main() -> int:
    args = parse_args()
    configure_mock_environment()
    port = reserve_port()
    base_url = f"http://127.0.0.1:{port}"
    server_env = os.environ.copy()
    command = [
        sys.executable, "-m", "uvicorn", "dev_combined:app",
        "--host", "127.0.0.1", "--port", str(port), "--workers", "1", "--no-access-log",
    ]
    process = subprocess.Popen(
        command, cwd=BACKEND, env=server_env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        wait_for_server(process, base_url)
        run = asyncio.run(run_http_study(base_url, args.requests, args.concurrency, synthetic_wav()))
        privacy = privacy_and_sound_checks()
        result = {
            "study_timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "measurement_scope": "Local ASGI HTTP benchmark plus in-process synthetic validation checks; no cloud services called.",
            "metadata": local_environment(),
            "dataset": {
                "voice_utterances": len(TRANSCRIPTS),
                "voice_data": "fictional manually labeled short text; no personal or clinical data",
                "audio": "deterministic 6-second mono 16 kHz generated tone/WAV; not a baby recording",
                "stored_demo_records": "application's fictional seeded memory-store records",
            },
            "load_test": run,
            "privacy_sound_checks": privacy,
            "interpretation_limits": [
                "Mock-provider latency and availability do not measure Gemini, Speech-to-Text, Firebase Auth, Firestore, Cloud Run, or network-region performance.",
                "Local results are not production SLOs, cost forecasts, clinical accuracy, or diagnostic evidence.",
                "Draft metrics describe this small labeled rule-coverage set; review was not blinded and no human correction rate was measured.",
            ],
        }
        serialized = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            output = args.output if args.output.is_absolute() else Path.cwd() / args.output
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(serialized + "\n", encoding="utf-8")
        print(serialized)
        return 0 if privacy["result"] == "PASS" else 1
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
