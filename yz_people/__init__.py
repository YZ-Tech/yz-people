"""people — per-person voice samples + meta substrate.

Storage layout (created lazily at <data_root>):
    <data_root>/<slug>/
        meta.json          # user-curated (display_name, language, can_command, ...)
        auto_meta.json     # Loom-synthesized facts (Phase 5b)
        clone_source/      # chatterbox voice-clone source WAVs (long calm prompts)
        speaker_ref/       # speaker-embedder reference WAVs (short varied)
        wake_positives/    # "Hey Lumenai" reps — only the wake-owner has these
        wake_negatives/    # voice samples that AREN'T the wake phrase

`<data_root>` defaults to `~/.jarvyz/satellites/yz-people/` (derived from
JARVYZ_HOME), overridable via `JWT_PEOPLE_ROOT`
env. The satellite owns this directory; JarvYZ-side and frontend talk
HTTP to it via the proxy at /api/people/*.
"""
from __future__ import annotations

__version__ = "0.1.0"
__all__ = ["__version__"]
