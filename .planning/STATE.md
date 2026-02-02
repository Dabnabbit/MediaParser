# Project State: MediaParser

**Last Updated:** 2026-02-02

## Project Reference

**Core Value:** Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

**Current Focus:** Phase 1 - Foundation Architecture (In Progress)

## Current Position

**Phase:** 1 - Foundation Architecture
**Plan:** 01-04 of 5 (Huey Task Queue - Complete)
**Status:** In progress
**Last activity:** 2026-02-02 - Completed 01-04-PLAN.md
**Progress:** `[████████████░░░░░░░░] 60%` (3/5 plans complete)

**Active Requirements:**
- INFRA-01: Application runs in Docker container
- INFRA-02: Background job queue for long-running processing
- INFRA-03: Database stores file metadata, hashes, and user decisions
- INFRA-04: Fix hardcoded timezone issue in existing code
- INFRA-05: Remove hardcoded Windows paths, make configurable

## Performance Metrics

**Velocity:** 3 plans in ~6.5 minutes (avg 2.2 min/plan)
**Plan Success Rate:** 100% (3/3 completed successfully)
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
| SQLite backend for Huey queue | 2026-02-02 | Separate queue db from app db, thread-based workers | 01-04: Task queue setup |
| get_app() pattern for worker tasks | 2026-02-02 | Avoids circular imports, deferred app creation | 01-04: Flask context in workers |
| Re-raise exceptions after marking FAILED | 2026-02-02 | Enables Huey retry logic with proper job status | 01-04: Error handling |

### Active TODOs

**Phase 1 - Foundation Architecture (in progress):**
- [x] 01-01: Application scaffold with Flask factory and storage (COMPLETE)
- [x] 01-02: Database models (files, jobs, duplicates, decisions) (COMPLETE)
- [x] 01-04: Background job queue setup (Huey) (COMPLETE)
- [ ] 01-03: Refactor timestamp detection from PhotoTimeFixer.py
- [ ] 01-05: Additional foundation components

### Known Blockers

None

### Technical Debt

**From Existing Codebase:**
1. Hardcoded timezone offset (-4) in PhotoTimeFixer.py line 244 - causes incorrect timestamps for non-local timezone files
2. Hardcoded Windows paths in PhotoTimeFixer.py lines 13-14 - breaks on Linux/Docker
3. Filename collision handling increments by 1 second - can fail with burst photos or high-volume imports
4. No streaming/batching for large file sets - potential memory exhaustion with 50k+ files
5. Monolithic script structure - cannot be imported as library functions

**Resolution Plan:** Phase 1 addresses items 1, 2, 5 directly. Phase 2 addresses item 4. Phase 5/6 addresses item 3 with better collision handling.

### Research Flags

**Phase 6 (Perceptual Duplicate Detection):** Needs deeper research during planning.
- Algorithm selection: pHash vs dHash vs aHash performance/accuracy tradeoffs
- Threshold tuning methodology for family photos (burst shots, crops, edits)
- False positive rate targets and mitigation strategies
- Format normalization approaches (JPEG vs PNG vs HEIC)
- Performance optimization for large datasets (50k+ files)

**Recommendation:** Use `/gsd:research-phase` before planning Phase 6.

## Session Continuity

**Last session:** 2026-02-02 16:43 UTC
**Stopped at:** Completed 01-04-PLAN.md
**Resume file:** None

**For Next Session:**
1. Execute 01-03-PLAN.md: Refactor timestamp detection from PhotoTimeFixer.py
2. Execute 01-05-PLAN.md: Remaining foundation components

**Context to Preserve:**
- Phase 1 Plans 01-01, 01-02, 01-04 established foundational patterns (pathlib, app factory, env config, database schema, task queue)
- All future code should follow these patterns: pathlib for paths, env vars for config, Mapped[] for models, get_app() for workers
- Database URI: sqlite:///instance/mediaparser.db (SQLAlchemy configured, WAL mode enabled)
- Storage dirs: storage/{uploads,processing,output}/ (auto-created on app start)
- Timezone: Configurable via TIMEZONE env var (default America/New_York)
- Models: File, Job, Duplicate, UserDecision with type-safe SQLAlchemy 2.x patterns
- Enums: JobStatus (PENDING/RUNNING/COMPLETED/FAILED), ConfidenceLevel (HIGH/MEDIUM/LOW/NONE)
- Task queue: Huey with SQLite backend (instance/huey_queue.db), thread-based workers
- Task pattern: get_app() + with app.app_context() for database access in workers
- Helper functions: enqueue_import_job(job_id) for web routes, health_check() for worker verification

---

*State initialized: 2026-02-02*
