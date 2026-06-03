"""Satellite-owned settings.

Only one knob today: `data_root` — where on disk the satellite stores
its per-person directories. Defaults to `~/.jarvyz/satellites/yz-people/`
(derived from JARVYZ_HOME, the shared single source of truth), overridable
via `JWT_PEOPLE_ROOT` env to support test sandboxes + multi-machine
deployments.

This module is intentionally minimal. If/when the satellite grows more
knobs (default language, wake-owner enforcement, etc.) they land here
as fields on Settings.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _default_data_root() -> Path:
    """Where the satellite stores per-person directories. Override via
    `JWT_PEOPLE_ROOT` env (mirrors music's `JWT_MUSIC_ROOT` and
    wakeword-trainer's `JWT_WAKEWORD_ROOT` conventions)."""
    env = os.environ.get("JWT_PEOPLE_ROOT")
    if env:
        return Path(env)
    home = Path(os.environ.get("JARVYZ_HOME") or Path.home() / ".jarvyz")
    return home / "satellites" / "yz-people"


@dataclass
class Settings:
    """Snapshot of mutable satellite settings."""

    data_root: Path = field(default_factory=_default_data_root)


# Module singleton. persistent_settings.load() may replace fields from
# the on-disk JSON sidecar at boot.
settings = Settings()
