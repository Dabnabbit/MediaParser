# Project State: MediaParser

**Last Updated:** 2026-02-02

## Project Reference

**Core Value:** Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

**Current Focus:** Phase 1 - Foundation Architecture (In Progress)

## Current Position

**Phase:** 1 - Foundation Architecture
**Plan:** 01-05 of 5 (Integration Tests and Entry Point - Complete)
**Status:** Phase complete
**Last activity:** 2026-02-02 - Completed 01-05-PLAN.md
**Progress:** `[████████████████████] 100%` (5/5 plans complete)

**Active Requirements:**
- INFRA-01: Application runs in Docker container
- INFRA-02: Background job queue for long-running processing
- INFRA-03: Database stores file metadata, hashes, and user decisions
- INFRA-04: Fix hardcoded timezone issue in existing code
- INFRA-05: Remove hardcoded Windows paths, make configurable

## Performance Metrics

**Velocity:** 5 plans in ~11 minutes (avg 2.2 min/plan)
**Plan Success Rate:** 100% (5/5 completed successfully)
**Blocker Rate:** 0% (0 blockers encountered)

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

### Active TODOs

**Phase 1 - Foundation Architecture (COMPLETE):**
- [x] 01-01: Application scaffold with Flask factory and storage (COMPLETE)
- [x] 01-02: Database models (files, jobs, duplicates, decisions) (COMPLETE)
- [x] 01-03: Timestamp and metadata library extraction (COMPLETE)
- [x] 01-04: Background job queue setup (Huey) (COMPLETE)
- [x] 01-05: Integration tests and application entry point (COMPLETE)

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

**Last session:** 2026-02-02 16:51 UTC
**Stopped at:** Completed 01-05-PLAN.md (Phase 1 complete)
**Resume file:** None

**For Next Session:**
1. Begin Phase 2 - File Import and Processing

**Context to Preserve:**
- Phase 1 (COMPLETE): Established foundational patterns (pathlib, app factory, env config, database schema, library functions, task queue, integration tests)
- All future code should follow these patterns: pathlib for paths, env vars for config, Mapped[] for models, get_app() for workers
- Database URI: sqlite:///instance/mediaparser.db (SQLAlchemy configured, WAL mode enabled)
- Storage dirs: storage/{uploads,processing,output}/ (auto-created on app start)
- Timezone: Configurable via TIMEZONE env var (default America/New_York)
- Models: File, Job, Duplicate, UserDecision with type-safe SQLAlchemy 2.x patterns
- Enums: JobStatus (PENDING/RUNNING/COMPLETED/FAILED), ConfidenceLevel (HIGH/MEDIUM/LOW/NONE)
- Library functions: app.lib.timestamp (get_datetime_from_name, convert_str_to_datetime), app.lib.metadata (extract_metadata, get_best_datetime, get_file_type, get_image_dimensions)
- Timezone handling: All library functions accept default_tz parameter, return UTC-normalized datetimes
- Task queue: Huey with SQLite backend (instance/huey_queue.db), thread-based workers
- Task pattern: get_app() + with app.app_context() for database access in workers
- Helper functions: enqueue_import_job(job_id) for web routes, health_check() for worker verification
- Application entry: run.py creates app for development server and WSGI deployment
- Testing: pytest with fixtures (app, client), temporary database for isolation, test classes by component

---

*State initialized: 2026-02-02*
