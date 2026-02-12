# MediaParser

## What This Is

A web-based home media normalizer that takes photos from mixed sources (phones, cameras, scanners, internet downloads), corrects timestamps, detects duplicates, and organizes them into a clean archive structure. Designed for household use — simple enough for family members to import their phone dumps and messy photo folders, with a review workflow for decisions that need human judgment.

## Core Value

Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Timestamp detection from multiple sources (EXIF, filename patterns, file dates, other metadata)
- [x] Tag extraction from folder names and `{tag1,tag2}` filename syntax
- [x] Output files named `YYYYMMDD_HHMMSS.ext`
- [x] Output organized in folders by year
- [x] Extension correction when metadata disagrees with file extension
- [x] `[FORCE]` filename syntax to override timestamp detection
- [x] Confidence handling — multi-level scoring (HIGH/MEDIUM/LOW/NONE) with weighted source agreement

### Shipped (v1)

<!-- All 7 GSD phases complete. -->

**Web Interface:**
- [x] Web GUI accessible via browser (Flask)
- [x] Input via file upload (drag-drop) or server directory path import
- [x] Configurable output directory path (via settings UI)
- [x] Simple, intuitive interface for non-technical household members
- [x] Thumbnail grid with virtual scrolling for large file sets
- [x] Carousel viewport for full-image review with FLIP animations

**Timestamp Processing:**
- [x] Confidence scoring for timestamp detection (sources weighted and compared)
- [x] Review queue for low-confidence timestamps
- [x] User interface to resolve timestamp conflicts (timestamp options with source info)
- [x] User interface to provide timestamps for files with no determinable date
- [x] Auto-confirm high-confidence files in bulk
- [x] Bulk review operations (accept, mark reviewed, clear review by selection/filter/confidence)

**Duplicate Detection:**
- [x] Exact duplicate detection via SHA256 hash
- [x] Perceptual duplicate detection via dHash (near-identical images, burst photos, crops, resizes)
- [x] Duplicate groups with quality metrics (resolution, file size)
- [x] Review queue showing duplicate/similar groups side-by-side
- [x] User selection of which file(s) to keep from each group
- [x] Keep-all and resolve-group workflows for both exact and similar groups
- [x] Metadata accumulation (tags/timestamps from discarded files transfer to kept files)

**Tagging:**
- [x] Auto-generated tags from folder structure during export
- [x] Bulk tag management during review (add/remove tags to multiple files)
- [x] Tag assignment interface in web GUI with autocomplete
- [x] Tag-based filtering in review grid

**Processing & Export:**
- [x] Multi-threaded processing via ThreadPoolExecutor
- [x] Progress indication with ETA, elapsed time, and per-file status
- [x] Pause/resume/cancel job control
- [x] Export pipeline: copy to output with corrected metadata, year-based organization
- [x] Post-export finalization (cleanup working data, keep output)
- [x] Option to keep or delete source files after export

### Shipped (post-v1)

<!-- Shipped after GSD phases, outside phase tracking. -->

**Docker Deployment:**
- [x] Dockerfile (python:3.12-slim + exiftool + ffmpeg + libmagic, non-root user with configurable UID/GID)
- [x] docker-compose.yml (two-service: Gunicorn web + Huey worker, shared named volumes)
- [x] GitHub Actions CI/CD auto-builds and pushes to `ghcr.io/dabnabbit/mediaparser:latest`
- [x] NAS deployment: `docker compose pull && docker compose up -d`
- [x] Read-only bind mount for NAS media input (`/media` inside container)

**UI Polish (outside GSD tracking):**
- [x] Anchored modal positioning (confirmation dialogs appear near triggering button)
- [x] In-viewport group advancement (resolving a group loads next without exiting viewport)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Full video support — Some video formats work (mp4, mov, avi, mkv) but not all. Defer to v2.
- Multi-user support — Single user for v1. Multi-user with separate workspaces is v2.
- Authentication/login — No auth for v1, home network trusted. Add in v2 with multi-user.
- QuMagie integration — Current archive uses QuMagie but no direct integration needed. May evaluate alternatives later.
- Mobile app — Web-first, responsive design sufficient for phone browsers.

## Context

**Current architecture:**
- Flask web application with blueprint-based routing (upload, jobs, api, settings, review)
- SQLAlchemy ORM with SQLite database (WAL mode for concurrency)
- Huey task queue with SQLite backend for background processing
- Modular processing library (`app/lib/`) — processing, hashing, metadata, timestamp, confidence, duplicates, perceptual, export, tagging, thumbnail
- Vanilla JS frontend with 28 modules — virtual scroll, tile manager, carousel viewport, particle effects, Web Audio sound system

**Original codebase:**
- `old/PhotoTimeFixer.py` — Original CLI script. Timestamp detection and tag extraction logic refactored into `app/lib/timestamp.py` and `app/lib/metadata.py`.

**Technical environment:**
- Development: WSL2 (Ubuntu) with Python 3.12
- Production: Docker on QNAP TS-464 NAS (Container Station), image from GHCR
- Output destination is QNAP NAS with QuMagie, accessed via configurable path
- Users are household family members with varying technical comfort

**Scale:**
- Handles thousands to tens of thousands of files
- Ongoing use for periodic imports (phone backups, etc.)

## Constraints

- **Framework**: Flask 3.x with Jinja2 templates and vanilla JS
- **Database**: SQLite via SQLAlchemy 2.x (WAL mode)
- **Task queue**: Huey with SQLite backend (thread-based workers)
- **Deployment**: Docker on QNAP NAS via GHCR; dev on WSL2
- **Performance**: Multi-threaded processing, batch DB commits, virtual scrolling for large file sets
- **Compatibility**: Timestamp detection logic preserved from original CLI

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Flask (not Django) | Lightweight, brownfield-friendly for wrapping existing CLI logic | Decided |
| imagehash (dHash algorithm) | Industry standard for perceptual hashing, works with Pillow | Decided |
| SQLite + SQLAlchemy | Household scale (tens of thousands of files), zero ops overhead | Decided |
| Huey (not Celery/Redis) | SQLite backend avoids Redis dependency, simpler for single-server | Decided |
| Preserve existing timestamp logic | Refactored from PhotoTimeFixer.py into app/lib/timestamp.py | Done |
| Vanilla JS (no framework) | Simpler for household tool, no build step needed | Decided |
| Docker two-service compose | Web (Gunicorn) + Worker (Huey) sharing image and volumes, deploys as one Container Station app | Done |
| GHCR via GitHub Actions | Auto-build on push to main, NAS pulls pre-built image instead of building locally | Done |
| Copy-first architecture | Never modify originals — copy to output, write metadata to copies only | Done |
| Earliest timestamp selection | When multiple timestamps found, select earliest as authoritative | Done |
| FLIP animations for viewport | Smooth tile-to-viewport transitions using First-Last-Invert-Play technique | Done |
| Web Audio synthesized sounds | No audio files — particle effects generate sounds via Web Audio API | Done |

---
*Last updated: 2026-02-11 — Docker deployment and GHCR CI/CD*
