"""FastAPI daemon for the people satellite.

Routes mirror JarvYZ's pre-migration `/api/people/*` surface but live
HERE (no `/api/people` prefix — the JarvYZ-side proxy adds it). All
filesystem reads/writes go through `settings.data_root` so the data
location is overridable via `JWT_PEOPLE_ROOT` env or PATCH /settings.

Endpoints:
  GET  /health                                       — liveness probe
  GET  /                                             — list people + bucket counts
  GET  /script                                       — SCENE_SCRIPT (enrollment wizard)
  POST /                                             — create person
  GET  /{slug}                                       — full person record
  PUT  /{slug}                                       — patch meta fields
  DELETE /{slug}                                     — hard-delete person + recordings
  POST /{slug}/recordings/{bucket}                   — upload one WAV
  DELETE /{slug}/recordings/{bucket}/{name}          — delete one WAV
  GET  /{slug}/recordings/{bucket}/{name}            — stream one WAV back
  GET  /settings                                     — current settings snapshot
  PATCH /settings                                    — mutate satellite settings
  WS   /events                                       — server-pushed people events

Route-order discipline (load-bearing — same gotcha the in-tree version
had): /script must be declared BEFORE /{slug} or FastAPI matches
"script" as a slug param. Same for /settings."""
from __future__ import annotations

import asyncio
import json
import re
import shutil
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import (
    APIRouter,
    Body,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, observer
from yz_satellite_common import make_events_router, run_server
from . import persistent_settings as _persist  # noqa: F401 — load() runs on import
from .settings import settings


app = FastAPI(title="people", version=__version__)


# ────────────────────────── Storage paths ─────────────────────────────

BUCKETS: tuple[str, ...] = (
    "clone_source",
    "speaker_ref",
    "wake_positives",
    "wake_negatives",
)
_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
_FILE_RE = re.compile(r"^[A-Za-z0-9._-]+\.wav$")


def _people_dir() -> Path:
    """Computed every call so PATCH /settings updates take effect
    immediately (no stale capture from module-import time)."""
    return settings.data_root


def _slug_dir(slug: str) -> Path:
    return _people_dir() / slug


def _meta_path(slug: str) -> Path:
    return _slug_dir(slug) / "meta.json"


def _auto_meta_path(slug: str) -> Path:
    return _slug_dir(slug) / "auto_meta.json"


def _bucket_dir(slug: str, bucket: str) -> Path:
    return _slug_dir(slug) / bucket


# ────────────────────────── Validation ────────────────────────────────


def _validate_slug(slug: str) -> None:
    if not _SLUG_RE.match(slug):
        raise HTTPException(400, "slug must match [a-z][a-z0-9_]* (1-32 chars)")


def _validate_bucket(bucket: str) -> None:
    if bucket not in BUCKETS:
        raise HTTPException(400, f"bucket must be one of {BUCKETS}")


# ────────────────────────── Meta IO ───────────────────────────────────


def _load_meta(slug: str) -> dict | None:
    p = _meta_path(slug)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:  # noqa: BLE001
        return None


def _save_meta(slug: str, meta: dict) -> None:
    p = _meta_path(slug)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")


def _demote_other_owners(keep_slug: str) -> None:
    """Enforce exactly-one is_owner: clear the flag on every person except
    keep_slug. The owner is a singleton — it mirrors core's single
    settings.user. Called whenever a person is promoted to owner."""
    root = _people_dir()
    if not root.exists():
        return
    for d in root.iterdir():
        if not d.is_dir() or not _SLUG_RE.match(d.name) or d.name == keep_slug:
            continue
        meta = _load_meta(d.name)
        if meta and meta.get("is_owner"):
            meta["is_owner"] = False
            _save_meta(d.name, meta)


def _load_auto_meta(slug: str) -> dict:
    p = _auto_meta_path(slug)
    if not p.exists():
        return {"tags": [], "attributes": {}, "notes": []}
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:  # noqa: BLE001
        return {"tags": [], "attributes": {}, "notes": []}


# ────────────────────────── Bucket helpers ────────────────────────────


def _bucket_listing(slug: str, bucket: str) -> list[dict]:
    d = _bucket_dir(slug, bucket)
    if not d.exists():
        return []
    out: list[dict] = []
    for f in sorted(d.glob("*.wav")):
        try:
            st = f.stat()
        except OSError:
            continue
        out.append({"name": f.name, "size_bytes": st.st_size, "mtime": st.st_mtime})
    return out


def _bucket_counts(slug: str) -> dict[str, int]:
    return {b: len(_bucket_listing(slug, b)) for b in BUCKETS}


# ─────────────────── Enrollment wizard scene script ───────────────────
#
# Single source of truth — frontend fetches via GET /script and renders
# the wizard from this. Tweaks to wording roll out without a frontend
# rebuild. Copied verbatim from the pre-migration in-tree version
# (web/api/people.py:SCENE_SCRIPT).

SCENE_SCRIPT: dict[str, Any] = {
    "clone_source": {
        "mode": "single_take",
        "purpose": "chatterbox voice-clone source — 3 long calm prompts capturing your natural prosody.",
        "scenes": [
            {
                "id": "calm",
                "instruction": "Read this normally, like you're explaining something to a friend at the kitchen table.",
                "text": (
                    "So I was just messing around with Claude while waiting for my "
                    "tea to steep — three minutes, you know, nothing serious — and "
                    "by the time the timer went off, we'd accidentally built half a "
                    "JarvYZ. That's how this whole thing started."
                ),
                "target_seconds": 12,
            },
            {
                "id": "animated",
                "instruction": "Read this with a bit more energy — eyebrows up, hands moving.",
                "text": (
                    "Have you seen what WLED can do with the new effects? It's wild. "
                    "Like, literally indistinguishable from a real fireplace on the wall."
                ),
                "target_seconds": 10,
            },
            {
                "id": "slow_precise",
                "instruction": "Read this slowly and clearly, like you're dictating to someone taking notes.",
                "text": (
                    "Die Heizung läuft, das Licht ist gedimmt, der Bassshaker ist ready. "
                    "Alles synchron auf zweihundertzwanzig Millisekunden."
                ),
                "target_seconds": 12,
            },
        ],
    },
    "speaker_ref": {
        "mode": "single_take",
        "purpose": "Speaker-embedder reference — many short varied utterances for a robust voice fingerprint.",
        "instruction": "Short clip. Natural delivery. Just say the line.",
        "target_seconds": 4,
        "scenes": [
            {"id": f"ref_{i + 1:02d}", "text": text}
            for i, text in enumerate(
                [
                    "The weather's actually nice today.",
                    "What time did you say you'd be back?",
                    "Das hat überhaupt nicht funktioniert.",
                    "I need to grab something from the kitchen.",
                    "Wo ist meine verdammte Tasse Kaffee?",
                    "That was honestly the best part of the day.",
                    "Mach das Licht bitte ein bisschen wärmer.",
                    "Did you already send the file?",
                    "Ich glaube wir haben das Konzept jetzt durch.",
                    "Can you turn the volume down a bit?",
                    "Soll ich noch was bestellen?",
                    "I'll meet you there in twenty minutes.",
                    "Das war eine richtig gute Idee.",
                    "Honestly, I have no idea what just happened.",
                    "Komm, lass uns das morgen weitermachen.",
                ]
            )
        ],
    },
    "wake_positives": {
        "mode": "batch_reps",
        "purpose": "The actual wake word — many reps across delivery styles.",
        "phrase": "Hey Lumenai",
        "auto_segment": True,
        "batches": [
            {"id": "normal", "instruction": "Normal voice — like you actually call it.", "reps": 10},
            {"id": "fast", "instruction": "A little faster, like you're already mid-thought.", "reps": 10},
            {"id": "slow", "instruction": "Slow & deliberate, full attention.", "reps": 10},
            {"id": "quiet", "instruction": "Quiet — like the kids are sleeping (you know the vibe).", "reps": 10},
            {"id": "distant", "instruction": "From across the room — stand up, walk a few steps back.", "reps": 10},
            {"id": "casual", "instruction": "Casual / slightly mumbled — end of a long day.", "reps": 10},
        ],
    },
    "wake_negatives": {
        "mode": "batch_script",
        "purpose": "Your voice saying things that aren't the wake phrase — drives discrimination.",
        "instruction": "Read this script straight through, normal pace. Pause briefly between lines — we'll auto-split.",
        "auto_segment": True,
        "script_lines": [
            "Hey Loomy. Hey Loom. Lumi. Lumin.",
            "Turn off the lights. Set a timer for ten minutes.",
            "Mach das Licht aus. Stell den Wecker auf sieben.",
            "What's the weather looking like tomorrow?",
            "Wie spät ist es jetzt eigentlich?",
            "Play music. Stop. Pause. Resume.",
            "Lemonade. Luminary. Looney.",
            "Hey there. Hi. Hello. How's it going.",
            "Hallo zusammen. Wie geht's? Alles gut?",
            "I'll be in the next room.",
            "Bin gleich wieder da.",
            "What did you say?",
            "Was hast du gesagt?",
            "That's pretty interesting actually.",
            "Das ist tatsächlich ziemlich interessant.",
            "Let me think about it for a second.",
            "Lass mich kurz nachdenken.",
            "I don't think that's going to work.",
            "Ich glaub das wird nichts.",
            "Okay, okay, okay.",
        ],
    },
}


# ─────────────────────────── lifecycle ────────────────────────────


@app.get("/health")
def health() -> dict:
    """Liveness probe — also surfaces python + version info."""
    return {
        "ok": True,
        "version": __version__,
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "data_root": str(settings.data_root),
    }


# ─────────────────────────── settings ─────────────────────────────


@app.get("/settings")
def get_settings() -> dict:
    """Snapshot of mutable satellite settings."""
    return {"data_root": str(settings.data_root)}


@app.patch("/settings")
def patch_settings(patch: dict = Body(...)) -> dict:
    """Apply a partial settings update + persist. Accepted keys: data_root.
    Unknown keys are dropped. Returns post-merge snapshot."""
    _persist.apply_patch(patch)
    return {"data_root": str(settings.data_root)}


# ─────────────────────── people-collection routes ─────────────────────
#
# Routes use a flat, gateway-native scheme so JarvYZ's generic proxy can
# straight-strip /api/people/<path> -> satellite /<path> (no bespoke remap
# layer). Collection at /list, per-person under /person/{slug}/... . The
# /person/ literal prefix still protects the standalone SPA: a BARE /{slug}
# would catch static-asset requests (/logo.svg etc.) as a slug param before
# StaticFiles (mounted at /) could serve them; /person/{slug} does not.


@app.get("/list")
def people_list() -> dict:
    """List all enrolled people with their bucket counts."""
    root = _people_dir()
    root.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []
    for d in sorted(root.iterdir()):
        if not d.is_dir() or not _SLUG_RE.match(d.name):
            continue
        meta = _load_meta(d.name) or {}
        items.append(
            {
                "slug": d.name,
                "display_name": meta.get("display_name") or d.name.title(),
                "language": meta.get("language", "en"),
                "can_command": bool(meta.get("can_command")),
                "is_wake_owner": bool(meta.get("is_wake_owner")),
                "is_owner": bool(meta.get("is_owner")),
                "voice_clone_id": meta.get("voice_clone_id"),
                "buckets": _bucket_counts(d.name),
                "enrolled_at": meta.get("enrolled_at", 0.0),
            }
        )
    return {"people": items}


@app.get("/script")
def people_script() -> dict:
    """Return the canonical enrollment scene script for the wizard."""
    return SCENE_SCRIPT


@app.post("/list")
def people_create(body: dict = Body(...)) -> dict:
    """Create a new person. Body: {slug, display_name?, language?,
    can_command?, is_wake_owner?}. Bucket dirs created eagerly."""
    slug = str(body.get("slug", "")).strip().lower()
    _validate_slug(slug)
    if _meta_path(slug).exists():
        raise HTTPException(409, f"person '{slug}' already exists")
    meta = {
        "slug": slug,
        "display_name": str(body.get("display_name") or slug.title()),
        "language": str(body.get("language") or "en"),
        "can_command": bool(body.get("can_command", False)),
        "is_wake_owner": bool(body.get("is_wake_owner", False)),
        # Owner flag — exactly one person mirrors core's settings.user (the
        # singleton owner). Managed core-side via the owner card, not here.
        "is_owner": bool(body.get("is_owner", False)),
        # Profile subset — the same fields as core's owner profile
        # (settings.user), so every person carries an identity, not just the
        # owner. Consumed later by speaker-aware context ("you're talking to
        # X, who lives in Y"). display_name is the person's name.
        "location": str(body.get("location") or ""),
        "timezone": str(body.get("timezone") or ""),
        "github_username": str(body.get("github_username") or ""),
        "about": str(body.get("about") or ""),
        "enrolled_at": time.time(),
        "voice_clone_id": None,
        "speaker_embedding_centroid_path": None,
    }
    _save_meta(slug, meta)
    if meta["is_owner"]:
        _demote_other_owners(slug)
    for b in BUCKETS:
        _bucket_dir(slug, b).mkdir(parents=True, exist_ok=True)
    observer.emit("created", slug=slug)
    return {"ok": True, "slug": slug, "meta": meta}


# ─────────────────────── per-person routes ────────────────────────────


@app.get("/person/{slug}")
def people_get(slug: str) -> dict:
    _validate_slug(slug)
    meta = _load_meta(slug)
    if meta is None:
        raise HTTPException(404, f"no person '{slug}'")
    return {
        "slug": slug,
        "meta": meta,
        "auto_meta": _load_auto_meta(slug),
        "buckets": {b: _bucket_listing(slug, b) for b in BUCKETS},
    }


@app.put("/person/{slug}")
def people_update(slug: str, body: dict = Body(...)) -> dict:
    """Patch person meta — only the keys present in body are touched."""
    _validate_slug(slug)
    meta = _load_meta(slug)
    if meta is None:
        raise HTTPException(404, f"no person '{slug}'")
    for k in (
        "display_name",
        "language",
        "can_command",
        "is_wake_owner",
        "is_owner",
        "location",
        "timezone",
        "github_username",
        "about",
        "voice_clone_id",
        "speaker_embedding_centroid_path",
    ):
        if k in body:
            meta[k] = body[k]
    _save_meta(slug, meta)
    if body.get("is_owner"):
        _demote_other_owners(slug)
    observer.emit("updated", slug=slug)
    return {"ok": True, "slug": slug, "meta": meta}


@app.delete("/person/{slug}")
def people_delete(slug: str) -> dict:
    """Remove a person + all their recordings. Destructive — caller
    confirms via UI."""
    _validate_slug(slug)
    d = _slug_dir(slug)
    if not d.exists():
        raise HTTPException(404, f"no person '{slug}'")
    shutil.rmtree(d)
    observer.emit("deleted", slug=slug)
    return {"ok": True, "slug": slug}


@app.post("/person/{slug}/recordings/{bucket}")
async def recording_upload(
    slug: str,
    bucket: str,
    file: UploadFile = File(...),
    name: str | None = None,
) -> dict:
    """Upload one WAV to <slug>/<bucket>/. Filename comes from the
    `name` query param (must match [A-Za-z0-9._-]+\\.wav). If absent,
    we synthesize a timestamped fallback. Overwrites existing files
    with the same name (re-record case)."""
    _validate_slug(slug)
    _validate_bucket(bucket)
    if _load_meta(slug) is None:
        raise HTTPException(404, f"no person '{slug}'")

    if name:
        if not _FILE_RE.match(name):
            raise HTTPException(400, "name must match [A-Za-z0-9._-]+.wav")
    else:
        name = f"clip_{int(time.time() * 1000)}.wav"

    d = _bucket_dir(slug, bucket)
    d.mkdir(parents=True, exist_ok=True)
    target = d / name

    try:
        content = await file.read()
        target.write_bytes(content)
    except OSError as e:
        raise HTTPException(500, f"write failed: {e}") from e

    st = target.stat()
    observer.emit("recording_added", slug=slug, bucket=bucket, name=name)
    return {
        "ok": True,
        "slug": slug,
        "bucket": bucket,
        "name": name,
        "size_bytes": st.st_size,
    }


@app.delete("/person/{slug}/recordings/{bucket}/{name}")
def recording_delete(slug: str, bucket: str, name: str) -> dict:
    _validate_slug(slug)
    _validate_bucket(bucket)
    if not _FILE_RE.match(name):
        raise HTTPException(400, "invalid filename")
    target = _bucket_dir(slug, bucket) / name
    deleted = False
    if target.exists():
        try:
            target.unlink()
            deleted = True
        except OSError as e:
            raise HTTPException(500, f"delete failed: {e}") from e
    observer.emit("recording_deleted", slug=slug, bucket=bucket, name=name)
    return {"ok": True, "deleted": deleted, "name": name}


@app.get("/person/{slug}/recordings/{bucket}/{name}")
def recording_download(slug: str, bucket: str, name: str) -> FileResponse:
    """Stream a recording back for playback (review / re-record flow)."""
    _validate_slug(slug)
    _validate_bucket(bucket)
    if not _FILE_RE.match(name):
        raise HTTPException(400, "invalid filename")
    target = _bucket_dir(slug, bucket) / name
    if not target.exists():
        raise HTTPException(404, "not found")
    return FileResponse(str(target), media_type="audio/wav")


# ─────────────────────────── events WS ────────────────────────────


# The /events WS endpoint (hello frame + queue pump) is the shared router
# from yz-satellite-common — one body instead of a per-satellite copy.
app.include_router(make_events_router(observer.broadcaster))


# ─────────────────────────── SPA mount ────────────────────────────
#
# Mounted LAST so explicit JSON / WS routes win precedence over static
# files. The list/create endpoints live at /people (NOT /) precisely so
# the StaticFiles mount can claim / for the SPA's index.html.
#
# We mkdir + mount unconditionally, even if the dir is empty right now.
# Reason: build:pages might emit the SPA AFTER the satellite has been
# started. A check-at-import here would mean a build-then-restart cycle
# is required to pick up the SPA. With unconditional mount, the freshly
# emitted files become visible on the next request — no restart needed.

_static_dir = Path(__file__).parent / "static"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/",
    StaticFiles(directory=str(_static_dir), html=True),
    name="static",
)


# ─────────────────────────── entrypoint ───────────────────────────


def main() -> None:
    """`python -m yz_people` entry point."""

    run_server(app, 9003, host_env="PEOPLE_HOST", port_env="PEOPLE_PORT")


if __name__ == "__main__":
    main()
