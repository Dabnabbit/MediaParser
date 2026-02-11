# Technology Stack

**Analysis Date:** 2026-02-11

## Languages

**Primary:**
- Python 3.12.3 — Backend application (Flask, processing pipeline, background workers)
- JavaScript (ES6+) — Frontend (vanilla JS, no framework, no build step)
- HTML5 / CSS3 — Templates and styling (Jinja2 templates, CSS custom properties)
- SQL — Database (SQLite via SQLAlchemy ORM)

## Runtime

**Environment:**
- Python 3.12.3 (CPython) on WSL2 Ubuntu
- Virtual environment at `.venv/`

**Package Manager:**
- pip with `requirements.txt` (pinned minimum versions)

## Frameworks

**Core:**
- Flask 3.x — Web framework (application factory, blueprints)
- Flask-SQLAlchemy 3.x — ORM integration
- SQLAlchemy 2.x — Database ORM with type-safe patterns (Mapped, mapped_column)
- Huey 2.6 — Background task queue (SQLite backend, thread workers)

**Processing:**
- PyExifTool — EXIF metadata reading/writing via ExifTool CLI wrapper
- Pillow 10+ — Image processing (thumbnails, EXIF orientation, format conversion)
- imagehash 4.3+ — Perceptual hashing (pHash algorithm for duplicate detection)
- python-magic 0.4.27+ — File type detection via magic bytes

**Database:**
- SQLite — Application database (WAL mode for concurrency)
- Alembic 1.18+ — Database migrations (via Flask-SQLAlchemy)

**Testing:**
- pytest 7+ — Test runner with fixtures and temp directory support

## Key Dependencies

**Critical:**
- `flask` — Web application framework, blueprint routing, request handling
- `flask-sqlalchemy` — SQLAlchemy integration for Flask
- `sqlalchemy` — ORM for database models (File, Job, Tag, etc.)
- `huey` — Background task queue (SqliteHuey with thread workers)
- `pyexiftool` — Python wrapper for ExifTool binary
- `pillow` — Image processing for thumbnails and perceptual hashing
- `imagehash` — Perceptual hashing (pHash, dHash, aHash algorithms)
- `python-magic` — MIME type detection from file content
- `python-dotenv` — Environment variable loading from .env files
- `werkzeug` — WSGI utilities (secure_filename, development server)
- `alembic` — Database schema migrations
- `tzdata` — Timezone data for zoneinfo module

**Standard Library (key modules):**
- `zoneinfo` — Timezone handling (replaces hardcoded offsets)
- `pathlib` — Path handling throughout (no string path manipulation)
- `concurrent.futures` — ThreadPoolExecutor for parallel file processing
- `hashlib` — SHA256 for exact duplicate detection
- `json` — Timestamp candidates storage, API serialization
- `re` — Filename date/time pattern matching
- `logging` — Structured logging throughout

## External Binaries

**ExifTool:**
- Binary: System `exiftool` (configurable via EXIFTOOL_PATH env var)
- Purpose: EXIF/XMP/IPTC metadata reading and writing
- Install: `sudo apt install libimage-exiftool-perl`

**ffmpeg:**
- Binary: System `ffmpeg`
- Purpose: Video frame extraction for thumbnails and perceptual hashing
- Install: `sudo apt install ffmpeg`

## Configuration

**Environment Variables:**
- `SECRET_KEY` — Flask secret key (defaults to dev key)
- `FLASK_ENV` — Environment selector (development/production)
- `TIMEZONE` — Default timezone (defaults to America/New_York)
- `EXIFTOOL_PATH` — Path to exiftool binary (defaults to system `exiftool`)

**Application Config (`config.py`):**
- Database: SQLite at `instance/mediaparser.db`
- Storage: `storage/uploads/`, `storage/processing/`, `storage/output/`
- Processing: Worker threads (auto-detect CPU), batch commit size (10), error threshold (10%)
- Timezone: Validated on startup via zoneinfo.ZoneInfo

**Runtime Settings (database `settings` table):**
- `output_directory` — User-configurable output path
- `timezone` — User-configurable timezone

## Platform Requirements

**Development:**
- WSL2 (Ubuntu) on Windows
- Python 3.12+ with venv
- ExifTool (`libimage-exiftool-perl`)
- ffmpeg (for video thumbnail/hash support)

**Production (planned):**
- Docker container (Linux-based)
- Same binary dependencies (exiftool, ffmpeg)
- Gunicorn WSGI server

## Media Format Support

**Images:** jpg, jpeg, png, gif, heic
**Videos:** mp4, mov, avi, mkv

Defined in `app/routes/upload.py:ALLOWED_EXTENSIONS`

---

*Stack analysis: 2026-02-11*
