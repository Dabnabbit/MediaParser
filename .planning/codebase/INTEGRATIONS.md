# External Integrations

**Analysis Date:** 2026-02-11

## APIs & External Services

**ExifTool Command-Line Utility:**
- SDK/Client: PyExifTool wrapper (`exiftool` Python package)
- Invocation: Context manager pattern (`with exiftool.ExifToolHelper() as et:`)
- Primary methods: `et.get_metadata()` (read) and `et.set_tags()` (write)
- Auth: None (local binary execution)
- Config: `EXIFTOOL_PATH` environment variable (defaults to system `exiftool`)
- Used in: `app/lib/metadata.py` (extract + write), `app/lib/hashing.py` (metadata for dimensions)

**ffmpeg:**
- Invocation: `subprocess.run()` with timeout (30s)
- Purpose: Video frame extraction for thumbnails and perceptual hashing
- Auth: None (local binary)
- Used in: `app/lib/thumbnail.py` (`extract_video_frame()`)

## Data Storage

**Databases:**
- SQLite via SQLAlchemy 2.x
- Path: `instance/mediaparser.db`
- WAL mode enabled for concurrent read/write (web server + worker)
- Busy timeout: 5 seconds
- Foreign keys enforced via PRAGMA

**Database Tables:**
- `files` — Media file records (metadata, hashes, timestamps, review state)
- `jobs` — Processing jobs (import/export, status, progress)
- `job_files` — Many-to-many association (jobs ↔ files)
- `duplicates` — Duplicate relationships (file pairs with similarity scores)
- `user_decisions` — Audit trail of user review decisions
- `settings` — Key-value application settings
- `tags` — Tag definitions with usage counts
- `file_tags` — Many-to-many association (files ↔ tags)

**Huey Queue Database:**
- Separate SQLite: `instance/huey_queue.db`
- Managed by Huey (SqliteHuey)
- Stores pending tasks, results, and schedule data

**File Storage:**
- `storage/uploads/` — Uploaded files organized by job (`job_N/`)
- `storage/thumbnails/` — Generated thumbnails (`{file_id}_thumb.jpg`, `{file_id}_preview.jpg`)
- `storage/output/` — Default export output (year-based: `YYYY/YYYYMMDD_HHMMSS.ext`)
- `storage/processing/` — Working directory (created but currently unused)

**Caching:**
- No explicit caching layer
- SQLAlchemy session cache for ORM objects within request/task scope
- `db.session.expire_all()` used in progress polling to bypass cache

## Metadata Formats

**EXIF/XMP/IPTC Tags Read:**
- `EXIF:DateTimeOriginal` — Original capture time (highest priority)
- `EXIF:CreateDate` — When digitized
- `QuickTime:CreateDate` — Video creation date (assumed UTC per spec)
- `EXIF:ModifyDate` — Last modification
- `File:FileModifyDate` — Filesystem modification date
- `File:FileCreateDate` — Filesystem creation date
- `File:FileType`, `File:FileTypeExtension`, `File:MIMEType` — File type info
- `EXIF:ImageWidth`, `EXIF:ImageHeight` — Image dimensions

**EXIF/XMP/IPTC Tags Written (to output copies only):**
- `EXIF:DateTimeOriginal` — Corrected timestamp
- `EXIF:CreateDate` — Corrected timestamp
- `QuickTime:CreateDate` — Video timestamp (video files only)
- `QuickTime:ModifyDate` — Video timestamp (video files only)
- `IPTC:Keywords` — Tags (for broad compatibility)
- `XMP:Subject` — Tags (for broad compatibility)
- All writes use `-overwrite_original` to prevent backup clutter

## Authentication & Identity

**Auth Provider:**
- None — v1 is single-user, trusted home network
- Planned for v2 (AUTH-01, AUTH-02, AUTH-03 requirements)

## Monitoring & Observability

**Error Tracking:**
- No external error tracking service
- Errors logged to stdout via Python `logging` module
- Per-file processing errors stored in `File.processing_error` column
- Job-level errors stored in `Job.error_message` column
- Debug log at `/tmp/job_debug.log` for pause/resume tracking

**Logs:**
- Format: `[YYYY-MM-DD HH:MM:SS] LEVEL:module: message`
- Output: stdout (captured by terminal or log file)
- SQLAlchemy engine logging at WARNING level (reduces noise)

**Health Checks:**
- Worker health: `GET /api/worker-health` (uses `pgrep` to detect worker process)
- Task health: `health_check()` Huey task (verifies queue is operational)

## CI/CD & Deployment

**Hosting:**
- Development: WSL2 (Ubuntu) with Flask dev server + Huey consumer
- Production (planned): Docker container with Gunicorn

**CI Pipeline:**
- None configured
- Tests run manually via `pytest`

## Environment Configuration

**Required env vars:**
- None strictly required (all have defaults)

**Optional env vars:**
- `SECRET_KEY` — Flask secret key
- `FLASK_ENV` — Environment (development/production)
- `TIMEZONE` — Default timezone
- `EXIFTOOL_PATH` — Path to exiftool binary

**Secrets:**
- No external secrets (no API keys, no auth tokens)
- Flask SECRET_KEY uses dev default (must change for production)

## Webhooks & Callbacks

**Incoming:** None
**Outgoing:** None

## File Processing Pipeline

**Input Methods:**
1. Browser upload: `POST /api/upload` (multipart/form-data, multiple files)
2. Server path import: `POST /api/import-path` (JSON body with directory path)

**Processing Steps:**
1. File validation (exists, size, MIME type check via python-magic)
2. SHA256 hash calculation (chunked reading, 64KB chunks)
3. Perceptual hash calculation (imagehash.phash, via Pillow)
4. ExifTool metadata extraction (single call per file)
5. Image dimension extraction from metadata
6. Timestamp candidate collection (EXIF tags + filename parsing)
7. Confidence scoring (weighted source agreement)
8. Thumbnail generation (Pillow with EXIF orientation correction)
9. Duplicate grouping (SHA256 exact + perceptual near-match)

**Export Steps:**
1. Auto-tag generation from folder structure
2. Copy to output directory (year-based organization)
3. Collision resolution with counter suffix (`_001`, `_002`)
4. Metadata write to output copy (corrected timestamps + tags)
5. Copy verification (file exists + size match)

**Output:**
- Files organized by year: `output/YYYY/YYYYMMDD_HHMMSS.ext`
- Files without timestamps: `output/unknown/original_filename.ext`
- Original files preserved (never modified)

---

*Integration audit: 2026-02-11*
