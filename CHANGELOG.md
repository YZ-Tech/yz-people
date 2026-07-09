# Changelog

## 0.0.4

- Owner identity: every person meta gains the core owner-profile fields
  (location, timezone, github_username, about) plus an `is_owner` flag with
  exactly-one enforcement (`_demote_other_owners`). The owner's profile is
  core-owned; the satellite mirrors and supersedes it UI-wise, hiding the
  editor for the owner and the owner from the roster.
- New person dialog gains an optional profile section; per-person
  ProfileEditor (commit-on-blur) for non-owner people.

## 0.0.1

First public release of the `yz-people` satellite.

- people satellite — per-person voice samples + metadata (substrate for voice clone, speaker embedding, and wake-word corpus).
- JarvYZ dynamic-module IIFE + manifest.
- Pip-installable wheel.
