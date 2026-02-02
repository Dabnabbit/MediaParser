# Project State: MediaParser

**Last Updated:** 2026-02-02

## Project Reference

**Core Value:** Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

**Current Focus:** Phase 2 - Background Workers + Core Processing (Ready to plan)

## Current Position

**Phase:** 2 of 7 - Background Workers + Core Processing
**Plan:** 02-03 complete (Phase 2 COMPLETE)
**Status:** Phase complete
**Last activity:** 2026-02-02 - Completed 02-03-PLAN.md (multi-threaded file processing task)
**Progress:** `[██████░░░░░░░░░░░░░░] 29%` (2/7 phases complete)

**Completed Requirements (Phase 2):**
- ✓ TIME-01: Confidence score for timestamp detection (COMPLETE - integrated in worker)
- ✓ TIME-06: Preserve existing timestamp detection logic from CLI (COMPLETE)
- ✓ PROC-01: Multi-threading for performance (COMPLETE - ThreadPoolExecutor)

**Completed Requirements (Phase 1):**
- ✓ INFRA-02: Background job queue for long-running processing
- ✓ INFRA-03: Database stores file metadata, hashes, and user decisions
- ✓ INFRA-04: Fix hardcoded timezone issue in existing code
- ✓ INFRA-05: Remove hardcoded Windows paths, make configurable

## Performance Metrics

**Velocity:** 8 plans in ~17 minutes (avg 2.1 min/plan) - Phase 1+2
**Plan Success Rate:** 100% (8/8 completed successfully)
**Blocker Rate:** 0% (0 blockers encountered)
**Phases Complete:** 2/7 (Phase 1 and Phase 2 complete)

## Accumulated Context

### Key Decisions

| Decision | Date | Rationale | Impact |
|----------|------|-----------|--------|
| Flask + Celery over Django | 2026-02-02 | Lightweight brownfield-friendly, separates web UI from background processing | Foundation architecture design |
| SQLite for v1 | 2026-02-02 | Handles household scale (tens of thousands), zero operational overhead | Database layer simplicity |
| Job queue pattern (async processing) | 2026-02-02 | Prevents HTTP timeouts, enables progress tracking, allows browser close | Architecture split: web app vs workers |
| Conservative duplicate thresholds | 2026-02-02 | Minimize false positives with multi-algorithm consensus | Phase 6 design constraint |
| Copy-first, never modify originals | 2026-02-02 | Prevent data loss of irreplaceable family photos | File handling throughout |
| Use zoneinfo over pytz | 2026-02-02 | Standard library in Python 3.9+, one less dependency | 01-01: Config validation |
| Config at root not in app/ | 2026-02-02 | Simpler imports, Flask convention for single-app projects | 01-01: Import paths |
| Auto-create directories | 2026-02-02 | Better developer experience, prevents errors | 01-01: Startup behavior |
| INTEGER PRIMARY KEY for all tables | 2026-02-02 | SQLite optimization - 3-4x faster than UUIDs | 01-02: Database schema |
| ConfidenceLevel enum for timestamps | 2026-02-02 | Enables review queue filtering by detection quality | 01-02: User workflow |
| Timezone-aware datetimes everywhere | 2026-02-02 | Prevents naive/aware comparison errors, DST bugs | 01-02: Timestamp handling |
| Many-to-many Job<->File relationship | 2026-02-02 | Supports batch operations and job history | 01-02: Job tracking |
| Use ZoneInfo over hardcoded offset | 2026-02-02 | Configurable timezone vs hardcoded -4, IANA database | 01-03: Timestamp library |
| Normalize to UTC internally | 2026-02-02 | Consistent storage format, eliminates ambiguity | 01-03: Datetime handling |
| Accept Path \| str | 2026-02-02 | Flexibility for callers using pathlib or strings | 01-03: Library functions |
| EXIF:DateTimeOriginal priority | 2026-02-02 | Most reliable source for original capture time | 01-03: Metadata extraction |
| SQLite backend for Huey queue | 2026-02-02 | Separate queue db from app db, thread-based workers | 01-04: Task queue setup |
| get_app() pattern for worker tasks | 2026-02-02 | Avoids circular imports, deferred app creation | 01-04: Flask context in workers |
| Re-raise exceptions after marking FAILED | 2026-02-02 | Enables Huey retry logic with proper job status | 01-04: Error handling |
| pytest fixtures for test isolation | 2026-02-02 | Temporary database per test run prevents pollution | 01-05: Integration testing |
| Test organization by component | 2026-02-02 | Test classes group related tests (Configuration, DatabaseModels, etc.) | 01-05: Test structure |
| Environment-based config in run.py | 2026-02-02 | FLASK_ENV maps to config classes for deployment flexibility | 01-05: Application entry |
| Use dHash over pHash for perceptual hashing | 2026-02-02 | Faster computation, good for duplicate detection | 02-01: Perceptual hash algorithm |
| Select earliest valid timestamp with min_year filter | 2026-02-02 | User decision from CONTEXT.md, filters out epoch dates | 02-01: Confidence scoring |
| Store all timestamp candidates as JSON | 2026-02-02 | Enables Phase 4 review UI to show side-by-side comparison | 02-01: Database design |
| Return None for perceptual hash on non-images | 2026-02-02 | Expected behavior, videos can use thumbnails in Phase 6 | 02-01: Library design |
| Add PAUSED/CANCELLED/HALTED statuses | 2026-02-02 | Enables graceful job control and error threshold halting | 02-01: Job workflow |
| Return dict from worker, main thread commits | 2026-02-02 | ThreadPoolExecutor workers cannot share SQLAlchemy sessions | 02-02: Thread safety pattern |
| Use python-magic for type detection | 2026-02-02 | Detect executables masquerading as images via magic bytes | 02-02: Security improvement |
| Normalize jpeg->jpg in type detection | 2026-02-02 | Common variation causes false mismatch warnings | 02-02: False positive reduction |
| Alphabetical file processing order | 2026-02-02 | User decision from CONTEXT.md for predictable processing order | 02-03: Processing order |
| Batch commit every 10 files | 2026-02-02 | Balance between database performance and crash recovery granularity | 02-03: Database optimization |
| 10% error threshold with 10-file minimum sample | 2026-02-02 | User decision from CONTEXT.md prevents early halt on small sample sizes | 02-03: Error handling |
| Check pause/cancel status every file | 2026-02-02 | Provides responsive job control for users | 02-03: Job control |

### Active TODOs

**Phase 1 - Foundation Architecture (COMPLETE):**
- [x] 01-01: Application scaffold with Flask factory and storage (COMPLETE)
- [x] 01-02: Database models (files, jobs, duplicates, decisions) (COMPLETE)
- [x] 01-03: Timestamp and metadata library extraction (COMPLETE)
- [x] 01-04: Background job queue setup (Huey) (COMPLETE)
- [x] 01-05: Integration tests and application entry point (COMPLETE)

**Phase 2 - Background Workers + Core Processing (COMPLETE):**
- [x] 02-01: Hashing and confidence scoring libraries (COMPLETE)
- [x] 02-02: Single file processing pipeline (COMPLETE)
- [x] 02-03: Multi-threaded file processing task (COMPLETE)

### Known Blockers

None

### Technical Debt

**From Existing Codebase:**
1. ~~Hardcoded timezone offset (-4) in PhotoTimeFixer.py line 244~~ - ✓ RESOLVED in 01-03 (library uses configurable timezone)
2. Hardcoded Windows paths in PhotoTimeFixer.py lines 13-14 - breaks on Linux/Docker
3. Filename collision handling increments by 1 second - can fail with burst photos or high-volume imports
4. No streaming/batching for large file sets - potential memory exhaustion with 50k+ files
5. ~~Monolithic script structure - cannot be imported as library functions~~ - ✓ RESOLVED in 01-03 (extracted to app/lib/)

**Resolution Plan:** Phase 1 Plan 01-03 resolved items 1 and 5. Item 2 remains (PhotoTimeFixer.py itself still has hardcoded paths, but new library code uses pathlib). Phase 2 addresses item 4. Phase 5/6 addresses item 3 with better collision handling.

### Research Flags

**Phase 6 (Perceptual Duplicate Detection):** Needs deeper research during planning.
- Algorithm selection: pHash vs dHash vs aHash performance/accuracy tradeoffs
- Threshold tuning methodology for family photos (burst shots, crops, edits)
- False positive rate targets and mitigation strategies
- Format normalization approaches (JPEG vs PNG vs HEIC)
- Performance optimization for large datasets (50k+ files)

**Recommendation:** Use `/gsd:research-phase` before planning Phase 6.

## Session Continuity

**Last session:** 2026-02-02 18:06 UTC
**Stopped at:** Completed 02-03-PLAN.md (multi-threaded file processing task) - **Phase 2 COMPLETE**
**Resume file:** None

**For Next Session:**
1. Begin Phase 3 - Web Interface: Core Job Management
   - File upload interface
   - Job creation and status endpoints
   - Progress monitoring (real-time or polling)
   - Job control (pause/cancel)

**Context to Preserve:**
- Phase 1 (COMPLETE): Established foundational patterns (pathlib, app factory, env config, database schema, library functions, task queue, integration tests)
- Phase 2 (COMPLETE): Core algorithms and worker implementation (hashing, confidence scoring, processing pipeline, multi-threaded job processing)
- All future code should follow these patterns: pathlib for paths, env vars for config, Mapped[] for models, get_app() for workers
- Database URI: sqlite:///instance/mediaparser.db (SQLAlchemy configured, WAL mode enabled)
- Storage dirs: storage/{uploads,processing,output}/ (auto-created on app start)
- Timezone: Configurable via TIMEZONE env var (default America/New_York)
- Models: File, Job, Duplicate, UserDecision with type-safe SQLAlchemy 2.x patterns
- Enums: JobStatus (PENDING/RUNNING/COMPLETED/FAILED/PAUSED/CANCELLED/HALTED), ConfidenceLevel (HIGH/MEDIUM/LOW/NONE)
- Library functions:
  - app.lib.timestamp (get_datetime_from_name, convert_str_to_datetime)
  - app.lib.metadata (extract_metadata, get_best_datetime, get_file_type, get_image_dimensions)
  - app.lib.hashing (calculate_sha256, calculate_perceptual_hash)
  - app.lib.confidence (calculate_confidence, SOURCE_WEIGHTS)
  - app.lib.processing (process_single_file, detect_file_type_mismatch)
- Processing pipeline: process_single_file() orchestrates all libraries, returns dict (thread-safe)
- Thread safety pattern: Worker functions return dicts, main thread commits to database (no shared SQLAlchemy sessions)
- Timezone handling: All library functions accept default_tz parameter, return UTC-normalized datetimes
- Task queue: Huey with SQLite backend (instance/huey_queue.db), thread-based workers
- Task pattern: get_app() + with app.app_context() for database access in workers
- Worker implementation: process_import_job(job_id) uses ThreadPoolExecutor with configurable workers
  - Helper functions: enqueue_import_job(job_id) for web routes, health_check() for worker verification
  - Batch commits: _commit_pending_updates() every 10 files (configurable via BATCH_COMMIT_SIZE)
  - Error threshold: _should_halt_job() checks 10% threshold with 10-file minimum sample
  - Job control: Checks status (CANCELLED/PAUSED) every file for responsive control
  - Progress tracking: Updates progress_current and current_filename in real-time
- Application entry: run.py creates app for development server and WSGI deployment
- Testing: pytest with fixtures (app, client), temporary database for isolation, test classes by component
- Hashing: SHA256 with chunked reading (65KB), dHash for perceptual
- Confidence: Weighted scoring (EXIF:DateTimeOriginal=10, filename=2-3, filesystem=1), 1-second agreement tolerance
- Job control: New statuses enable pause/resume, graceful cancel, error threshold halting
- Type detection: python-magic checks magic bytes vs extension, logs warnings for mismatches
- Configuration options: WORKER_THREADS, MIN_VALID_YEAR, BATCH_COMMIT_SIZE, ERROR_THRESHOLD in config.py
- Database migration needed: New fields (timestamp_candidates, current_filename, error_count) require Alembic migration in Phase 3

---

*State initialized: 2026-02-02*
