"""`python -m yz_people` entry point. Defers to yz_people.server."""
from __future__ import annotations

from . import server  # noqa: F401

if __name__ == "__main__":
    server.main()
