# Architecture

**Analysis Date:** 2026-02-11

## Pattern Overview

**Overall:** Flask web application with background task queue and modular processing pipeline

**Key Characteristics:**
- Application factory pattern (`create_app()`) with blueprint-based routing
- SQLAlchemy ORM with SQLite database (WAL mode for concurrency)
- Huey task queue with SQLite backend for background processing
- Modular processing library (`app/lib/`) with clear separation of concerns
- Vanilla JS frontend with 28+ modules (no build step)
- Copy-first architecture — never modifies source files

## Layers

**Configuration Layer:**
- Purpose: Application configuration, environment handling, path setup
- Location: `config.py` (Config, DevelopmentConfig, ProductionConfig classes)
- Contains: Database URI, storage paths, timezone, worker threads, batch sizes, error thresholds
- Environment: Uses `os.environ` for SECRET_KEY, TIMEZONE; pathlib.Path for all paths
- Used by: App factory, tasks, routes

**Application Factory Layer:**
- Purpose: Create and configure Flask app, register blueprints, initialize database
- Location: `app/__init__.py` (`create_app()`)
- Contains: SQLAlchemy init, WAL mode setup, directory creation, blueprint registration
- Depends on: Configuration layer, models
- Used by: `run.py` (dev server), `app/tasks.py` (worker context)

**Routes Layer (5 Blueprints):**
- Purpose: HTTP API endpoints for all user interactions
- Location: `app/routes/` (upload.py, jobs.py, api.py, settings.py, review.py)
- Contains: Upload handling, job status/control, progress polling, settings CRUD, review/tag/duplicate operations
- Depends on: Models, tasks (for enqueuing), lib modules (for quality metrics)
- Used by: Frontend JS modules

**Task Queue Layer:**
- Purpose: Background job processing separate from web server
- Location: `huey_config.py` (queue setup), `app/tasks.py` (task definitions)
- Contains: `process_import_job()`, `process_export_job()`, `health_check()`
- Depends on: App factory (creates own app context), lib modules, models
- Used by: Routes (via `enqueue_import_job()`, `enqueue_export_job()`)

**Processing Library Layer:**
- Purpose: Core file processing logic, isolated from web/database concerns
- Location: `app/lib/` (10 modules)
- Contains: File processing pipeline, hashing, metadata extraction, timestamp parsing, confidence scoring, duplicate detection, perceptual hashing, export, tagging, thumbnail generation
- Depends on: PyExifTool, Pillow, imagehash, python-magic
- Used by: Task queue layer

**Data Model Layer:**
- Purpose: Database schema and ORM models
- Location: `app/models.py`
- Contains: File, Job, Duplicate, UserDecision, Setting, Tag models + enums (JobStatus, ConfidenceLevel)
- Depends on: SQLAlchemy, Flask-SQLAlchemy
- Used by: All layers above

**Frontend Layer:**
- Purpose: Web UI with thumbnail grid, carousel viewport, review workflows
- Location: `app/static/js/` (28 modules), `app/static/css/` (5 stylesheets), `app/templates/` (2 templates)
- Contains: Virtual scrolling, tile management, viewport carousel, FLIP animations, particle effects, Web Audio sounds, upload, progress, filters, selection, timestamps, tags, settings
- Depends on: Routes layer (via fetch API), chrono.min.js (vendor)
- Used by: End users via browser

## Data Flow

**Import Flow:**
1. User uploads files (browser drag-drop) or specifies server directory path
2. Route creates Job + File records in database, saves files to `storage/uploads/job_N/`
3. Route enqueues `process_import_job(job_id)` via Huey
4. Worker picks up task, creates own Flask app context
5. ThreadPoolExecutor processes files in parallel:
   - SHA256 hash (exact duplicate detection)
   - Perceptual hash via pHash (near-duplicate detection)
   - ExifTool metadata extraction
   - Filename timestamp parsing
   - Confidence scoring (weighted source agreement)
   - Thumbnail generation (Pillow + EXIF orientation correction)
6. Batch commits to database every 10 files
7. After all files: SHA256-based duplicate grouping, perceptual duplicate detection
8. Job marked COMPLETED

**Review Flow:**
1. Frontend polls `/api/progress/:id` during processing
2. On completion, loads thumbnail grid via `/api/jobs/:id/files` with mode filtering
3. Modes: duplicates, similar, unreviewed, reviewed, discarded, failed
4. User reviews in carousel viewport (full image, timestamp options, tags)
5. User actions: confirm timestamp, bulk review, discard/undiscard, resolve duplicates, add/remove tags
6. Each action hits review API endpoints, updates database

**Export Flow:**
1. User triggers export from completed import job
2. Route validates duplicate groups resolved, creates export Job
3. Worker processes export:
   - Auto-generates tags from folder structure
   - Copies non-discarded files to `output/YYYY/YYYYMMDD_HHMMSS.ext`
   - Writes corrected EXIF metadata + tags to output copies
   - Collision resolution with counter suffixes (`_001`, `_002`)
4. Post-export finalization: cleanup working data, delete DB records, keep output

**State Management:**
- Database: All persistent state (files, jobs, decisions, tags, settings)
- SQLite WAL mode: Concurrent reads from web + writes from workers
- Job status polling: Frontend polls every 1-2 seconds during processing
- Session resume: Active jobs detected on page load via `/api/current-job`

## Key Abstractions

**Processing Pipeline (`app/lib/processing.py`):**
- Purpose: Complete file processing in thread pool workers
- Pattern: Pure function returning dict — no database access, thread-safe
- Steps: Validate → Hash → Extract metadata → Parse timestamp → Score confidence → Return results

**Confidence Scoring (`app/lib/confidence.py`):**
- Purpose: Weighted scoring of timestamp sources with inter-source agreement
- Pattern: Collect candidates → Filter by min year → Sort → Score by weight + agreement count
- Levels: HIGH (EXIF + agreement), MEDIUM (reliable source OR agreement), LOW (filename only), NONE

**Duplicate Detection (`app/lib/perceptual.py`):**
- Purpose: O(n²) pairwise Hamming distance comparison on perceptual hashes
- Pattern: Compare all pairs → Merge into groups → Finalize group confidence/type
- Thresholds: ≤5 bits = exact, 6-16 bits = similar, >16 = unrelated

**Export Pipeline (`app/lib/export.py`):**
- Purpose: Organize files into year-based output structure
- Pattern: Generate path → Resolve collisions → Copy with verification → Write metadata

## Entry Points

**Web Server:**
- Location: `run.py`
- Triggers: `python run.py` or `gunicorn 'run:app'`
- Binds: 0.0.0.0:5000 (WSL → Windows access)

**Background Worker:**
- Location: `run_worker.py`
- Triggers: `python run_worker.py`
- Config: 2 threads, 50ms initial poll, 300ms max delay, health checks

**Main Page:**
- Location: `app/templates/index.html` (loads all JS modules)
- Triggers: Browser navigation to `/`

## Error Handling

**Strategy:** Layered — per-file errors don't crash jobs, error threshold halts gracefully

**Patterns:**
- Processing errors: Caught per-file in thread pool, stored in `file.processing_error`
- Error threshold: Job halts if >10% of files fail (configurable, min 10 file sample)
- Job failures: Exception caught, job marked FAILED, re-raised for Huey retry (2 retries, 30s delay)
- Pause/cancel: Worker checks job status after each file, commits pending work before stopping
- API errors: Standard HTTP error responses with JSON error messages

## Cross-Cutting Concerns

**Logging:** Python `logging` module throughout. Structured format: `[timestamp] LEVEL:module: message`. SQLAlchemy engine logging reduced to WARNING. Debug file at `/tmp/job_debug.log` for pause/resume tracking.

**Validation:**
- File extensions: Allowlist (jpg, jpeg, png, gif, heic, mp4, mov, avi, mkv)
- File types: python-magic for MIME type verification (media files only)
- Paths: `secure_filename()` for uploads, absolute path validation for imports
- Timestamps: Min year filter (2000), regex patterns, year range bounds (2000-2100)
- Timezone: ZoneInfo validation on startup and settings save

**Authentication:** None (v1, trusted home network)

**Timezone Handling:** Configurable via settings (default: America/New_York). All internal storage in UTC. ZoneInfo for timezone conversion. QuickTime dates assumed UTC per spec, EXIF dates use configured default.

---

*Architecture analysis: 2026-02-11*
