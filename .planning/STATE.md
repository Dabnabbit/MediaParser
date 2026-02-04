# Project State: MediaParser

**Last Updated:** 2026-02-04 00:14 UTC

## Environment

- **Platform:** WSL2 (Ubuntu on Windows) - migrated from Windows-native development
- **Working Directory:** `/home/dab/Projects/MediaParser` (NOT `/mnt/d/...`)
- **Target:** Linux-native, will be Dockerized for deployment
- **Python:** 3.11+ with venv

## Project Reference

**Core Value:** Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

**Current Focus:** Phase 5 - Duplicate Detection (Exact) (In progress)

## Current Position

**Phase:** 5 of 7 - Duplicate Detection (Exact)
**Plan:** 3 of ~3 (In progress)
**Status:** In progress
**Last activity:** 2026-02-04 - Completed 05-03-PLAN.md (Duplicate Comparison JavaScript)
**Progress:** `[███████████████████████████░] 83%` (29/~35 plans complete)

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

**Velocity:** 27 plans in ~59 minutes (avg 2.2 min/plan) - Phase 1+2+3+4 complete, Phase 5 started
**Plan Success Rate:** 100% (27/27 completed successfully)
**Blocker Rate:** 0% (0 blockers encountered)
**Phases Complete:** 4/7 (Phase 1, 2, 3, 4 complete, Phase 5 in progress)

## Accumulated Context

### Key Decisions

| Decision | Date | Rationale | Impact |
|----------|------|-----------|--------|
| WSL2 native development | 2026-02-02 | Linux-native for Docker deployment, better tooling compatibility | All development in `/home/dab/Projects/MediaParser` |
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
| Use minimal JPEG fixture for tests | 2026-02-02 | 1x1 JPEG sufficient for imagehash testing, no large binary files in repo | 02-04: Test fixtures |
| Single-pane vertical layout | 2026-02-02 | User wants continuous workflow without page jumps, upload always visible | 03-01: Web UI structure |
| Accordion bucket pattern | 2026-02-02 | Only one confidence bucket expanded at a time for focused viewing | 03-01: Results display |
| Three thumbnail size presets | 2026-02-02 | Different use cases (compact for bulk, large for duplicates) | 03-01: Thumbnail UI |
| EXIF orientation correction first | 2026-02-02 | Mobile photos have rotation metadata, prevents rotated thumbnails | 03-01: Thumbnail generation |
| CSS variables for theming | 2026-02-02 | Single source of truth for colors, consistent palette across UI | 03-01: Styling approach |
| Job-specific subdirectories for uploads | 2026-02-02 | Prevents filename collisions, improves organization | 03-02: Upload routes |
| Extension whitelist validation | 2026-02-02 | Security - prevents upload of executables or scripts | 03-02: File upload |
| State transition validation for job control | 2026-02-02 | Prevents invalid actions (can't pause completed job) | 03-02: Job control |
| SHA256 hash grouping for duplicates | 2026-02-02 | Exact duplicate detection (perceptual deferred to Phase 6) | 03-02: Duplicate detection |
| Generate thumbnails during processing | 2026-02-02 | ~50ms per thumbnail, immediate display when job completes vs on-demand loading states | 03-03: Thumbnail generation |
| Progress endpoint includes ETA calculation | 2026-02-02 | Better UX than percentage alone, calculates based on per-file timing | 03-03: Progress API |
| Completed jobs include summary data | 2026-02-02 | Confidence counts and duplicate count in progress response, no second API call | 03-03: Progress API |
| Thumbnail failures don't fail processing | 2026-02-02 | Thumbnail is enhancement not critical, log warning and continue | 03-03: Error handling |
| Store relative thumbnail paths | 2026-02-02 | thumbnails/123_thumb.jpg format works with Flask static serving | 03-03: Web serving |
| XMLHttpRequest for file uploads | 2026-02-02 | fetch() doesn't support upload progress events, XHR provides fine-grained tracking | 03-04: Upload UX |
| 1.5 second polling interval | 2026-02-02 | Balance between responsiveness and server load for progress updates | 03-04: Progress polling |
| localStorage for session resume | 2026-02-02 | Preserve job state across page reloads, browser refresh, or tab close/reopen | 03-04: Session continuity |
| Client-side extension filtering | 2026-02-02 | Prevent invalid uploads before network transfer, faster user feedback | 03-04: Upload validation |
| Accordion bucket pattern (one open) | 2026-02-02 | Only one confidence bucket expanded at a time for focused viewing | 03-05: Results display |
| Shift-click multi-select | 2026-02-02 | Standard file manager pattern users expect for range selection | 03-05: Multi-select |
| Three thumbnail size presets | 2026-02-02 | Compact/medium/large for different use cases (bulk vs detail) | 03-05: Thumbnail UI |
| Recommended duplicate highlight | 2026-02-02 | Highest confidence file highlighted to guide user decision | 03-05: Duplicate review |
| Setting model key-value pattern | 2026-02-02 | Generic key-value store allows adding new settings without schema migrations | 03-07: Settings persistence |
| Auto-create output directories | 2026-02-02 | mkdir(parents=True) creates directory if needed, better UX than error message | 03-07: Directory validation |
| Collapsible settings panel | 2026-02-02 | Settings hidden by default reduces visual noise in main workflow | 03-07: Settings UI |
| Reset from config | 2026-02-02 | Reset button loads defaults from current_app.config, not hardcoded strings | 03-07: Settings defaults |
| Duplicate groups rendering | 2026-02-02 | Display exact duplicates with thumbnails, largest file recommended | 03-06: Results display |
| Collapsible duplicate groups | 2026-02-02 | Click group header to expand/collapse, reduces visual clutter | 03-06: Duplicate UX |
| Failed files bucket | 2026-02-02 | Track per-file processing errors, display in dedicated bucket | 03-06: Error visibility |
| Duplicate selection UI deferred | 2026-02-02 | Radio/checkbox selection for keep/discard decisions → Phase 5 | Phase 5: Duplicate review |
| Tag normalization in app code | 2026-02-03 | SQLite func.lower() in unique constraint causes issues; enforce at app level | 04-01: Tag model |
| Duplicate group as field | 2026-02-03 | Use duplicate_group_id field on File rather than separate association table | 04-01: Model design |
| Usage count caching | 2026-02-03 | Cache tag usage_count to avoid expensive COUNT queries on autocomplete | 04-01: Tag performance |
| Delegate grid clicks to selection.js | 2026-02-03 | results.js renders grid but selection.js handles all clicks to avoid conflicts | 04-03: Event handling |
| IntersectionObserver for lazy loading | 2026-02-03 | 100px rootMargin preloads offscreen images for smooth scrolling | 04-03: Performance |
| PAGE_SIZE 100 for grid view | 2026-02-03 | Larger page size for unified grid (was 50 for accordion buckets) | 04-03: UX improvement |
| SelectionHandler owns grid clicks | 2026-02-03 | Prevents conflicts between results.js and selection.js - single source of truth | 04-04: Event handling |
| Duplicate group auto-selection | 2026-02-03 | Clicking duplicate file selects all files with same hash for bulk operations | 04-04: Duplicate workflow |
| Selection state sync | 2026-02-03 | Keep selectedFiles Set in sync between handlers for consistency | 04-04: State management |
| Native HTML dialog for modal | 2026-02-03 | Built-in accessibility (focus trap, Escape), no library needed | 04-05: Examination modal |
| Custom events for handler communication | 2026-02-03 | fileExamine event from selection.js to examination.js for loose coupling | 04-05: Handler integration |
| Tag autocomplete caching | 2026-02-03 | 1-minute cache TTL for recent tags to reduce API calls | 04-08: Tag performance |
| Toast notifications for feedback | 2026-02-03 | Non-blocking user feedback for bulk operations | 04-08: UX improvement |
| Fallback to detected_timestamp on confirm | 2026-02-03 | Allows confirming files even without explicit timestamp selection | 04-07: Review workflow |
| localStorage for one-time auto-confirm | 2026-02-03 | Prevents re-confirming HIGH files on page refresh | 04-07: Auto-confirm |
| Reviewed chip always visible | 2026-02-03 | Shows review progress even when zero files reviewed | 04-07: Filter counts |
| Light/Dark/System theme toggle | 2026-02-03 | CSS variables with data-theme attribute, localStorage persistence, early load to prevent flash | 04-09: Settings |
| Recommended source text color | 2026-02-03 | Green text color instead of badge for cleaner visual hierarchy | 04-09: Timestamp display |
| Backend timestamp grouping | 2026-02-03 | Backend groups timestamps by value, calculates composite scores, returns curated options (earliest + highest-scored + deviants) | 04-09: Timestamp selection |
| Earliest date selection | 2026-02-03 | Backend selects earliest valid date; weight used for confidence scoring not selection; user confirmed this approach | 04-09: Timestamp algorithm |
| On-demand image dimensions | 2026-02-03 | Extract width/height via get_image_dimensions() in API call, not stored in DB | 04-09: File details |
| Resolution-first quality scoring | 2026-02-04 | Score = resolution * 1M + file_size ensures resolution dominates, size is tiebreaker | 05-01: Duplicate quality metrics |
| CSS Grid for duplicate comparison | 2026-02-04 | auto-fit columns (200-300px) provide responsive 1-3 column layout without manual breakpoints | 05-02: Comparison cards |
| Radio buttons for duplicate selection | 2026-02-04 | Mutual exclusivity enforces "keep one file per group" business logic | 05-02: Selection controls |
| Native dialog for duplicate confirmation | 2026-02-04 | Built-in focus trap and backdrop, consistent with examination modal pattern | 05-02: Confirmation modal |
| Pre-select recommended file | 2026-02-04 | Initialize groupSelections Map with recommended_id on load for faster workflow | 05-03: Duplicate UX |
| Map-based selection tracking | 2026-02-04 | Map<groupHash, fileId> for O(1) lookups and clear state management | 05-03: JavaScript patterns |
| Per-group confirm vs bulk | 2026-02-04 | Allow incremental resolution to prevent mistakes with large duplicate sets | 05-03: Resolution workflow |

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
- [x] 02-04: Phase 2 processing tests (COMPLETE)

**Phase 3 - Web UI: Upload + Status (COMPLETE):**
- [x] 03-01: HTML templates, CSS styles, thumbnail library (COMPLETE)
- [x] 03-02: Upload and job management routes (COMPLETE)
- [x] 03-03: Progress API + Thumbnails (COMPLETE)
- [x] 03-04: Upload and Progress JavaScript (COMPLETE)
- [x] 03-05: Results Display with Buckets (COMPLETE)
- [x] 03-06: Real-time Updates and Integration (COMPLETE)
- [x] 03-07: Settings Configuration (COMPLETE)

**Phase 4 - Review Queues: Timestamps (COMPLETE):**
- [x] 04-01: Review API Models and Endpoints (COMPLETE)
- [x] 04-02: Unified Grid with Filter Chips (COMPLETE)
- [x] 04-03: Results handler integration (COMPLETE)
- [x] 04-04: Multi-select and Selection Toolbar (COMPLETE)
- [x] 04-05: Examination Modal View (COMPLETE)
- [x] 04-06: Timestamp source comparison (COMPLETE)
- [x] 04-07: Review workflow integration (COMPLETE)
- [x] 04-08: Tagging UI (COMPLETE)
- [x] 04-09: Human verification (COMPLETE)

**Phase 5 - Duplicate Detection (Exact) (IN PROGRESS):**
- [x] 05-01: Quality Metrics & Recommendations API (COMPLETE)

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

## Completed Requirements (Phase 3)

- ✓ WEB-02: Drag-drop file upload
- ✓ WEB-03: Folder picker and server path import
- ✓ WEB-04: Real-time progress with pause/resume
- ✓ WEB-05: Settings configuration (output directory)
- ✓ WEB-06: Results display with confidence buckets

**Context to Preserve:**
- Phase 1 (COMPLETE): Established foundational patterns (pathlib, app factory, env config, database schema, library functions, task queue, integration tests)
- Phase 2 (COMPLETE): Core algorithms and worker implementation (hashing, confidence scoring, processing pipeline, multi-threaded job processing)
- Phase 3 (IN PROGRESS): Web UI foundation with single-pane layout, EXIF-aware thumbnails, responsive CSS
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
  - app.lib.thumbnail (generate_thumbnail, get_thumbnail_path, SIZES)
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
- Testing: pytest with fixtures (app, client, temp_dir, sample files), temporary database for isolation, test classes by component
  - Test fixtures: sample_text_file, sample_image_file (1x1 JPEG), timestamped_file for isolated testing
  - Test coverage: SHA256 hashing, perceptual hashing, confidence scoring, processing pipeline, type detection, end-to-end workflows
- Hashing: SHA256 with chunked reading (65KB), dHash for perceptual
- Confidence: Weighted scoring (EXIF:DateTimeOriginal=10, filename=2-3, filesystem=1), 1-second agreement tolerance
- Job control: New statuses enable pause/resume, graceful cancel, error threshold halting
- Type detection: python-magic checks magic bytes vs extension, logs warnings for mismatches
- Configuration options: WORKER_THREADS, MIN_VALID_YEAR, BATCH_COMMIT_SIZE, ERROR_THRESHOLD in config.py
- Database migration needed: New fields (timestamp_candidates, current_filename, error_count) require Alembic migration in Phase 3
- UI patterns:
  - Single-pane vertical layout: upload (top) → progress → results (expand below)
  - Accordion buckets: only one confidence level expanded at a time
  - Three thumbnail sizes: compact (100px), medium (150px), large (200px)
  - Data attributes for JS targeting: data-section, data-bucket, data-grid
  - Status badges: RUNNING=blue, COMPLETED=green, FAILED=red, PAUSED=yellow
  - Confidence badges: HIGH=green, MEDIUM=yellow, LOW=red
- Thumbnail generation: ImageOps.exif_transpose() for orientation, RGB conversion for JPEG compatibility, LANCZOS resampling
- Upload routes:
  - POST /api/upload for browser file upload (multipart/form-data, extension whitelist, secure_filename)
  - POST /api/import-path for server-side directory scanning (recursive, same extensions)
  - Job subdirectories: storage/uploads/job_{id}/ for organization
- Job management routes:
  - GET /api/jobs/:id for status with progress percentage
  - POST /api/jobs/:id/control for pause/cancel/resume with state validation
  - GET /api/jobs/:id/files with pagination and confidence filtering
  - GET /api/jobs/:id/duplicates for SHA256-based exact duplicate groups
- Main route: GET / renders index.html with current job for session resume
- Progress API:
  - GET /api/progress/:id returns job status with ETA, current file, error count
  - GET /api/current-job returns most recent incomplete job for session resume
  - Completed jobs include summary (confidence counts, duplicate count, duration)
  - Optimized for 1-2 second polling intervals
- Thumbnail integration:
  - Thumbnails generated during file processing (not on-demand)
  - thumbnail_path field in File model stores relative paths
  - Failures logged but don't block processing
  - Served via Flask static: /thumbnails/{file_id}_thumb.jpg
- JavaScript modules:
  - app/static/js/upload.js: UploadHandler class for drag-drop, file picker, folder picker, server path import
  - app/static/js/progress.js: ProgressHandler class for 1.5s polling, job control, session resume
  - app/static/js/results.js: ResultsHandler class for confidence buckets, thumbnail grid, duplicates, multi-select
  - app/static/js/settings.js: SettingsHandler class for collapsible panel, load/save/reset settings
  - window.* pattern: Global handlers for cross-script communication (uploadHandler, progressHandler, resultsHandler)
  - XMLHttpRequest for upload progress (fetch doesn't support upload progress events)
  - localStorage for session resume (preserves job ID across page reloads)
  - Client-side extension filtering: jpg, jpeg, png, gif, heic, mp4, mov, avi, mkv
- Results display patterns:
  - Unified grid: single grid view with filter chips (replaced accordion buckets)
  - Lazy loading: IntersectionObserver with 100px rootMargin for thumbnail preloading
  - Thumbnail sizes: compact (100px), medium (150px), large (200px) presets
  - Badges: left side for type info (confidence, video), right side for status (reviewed, failed)
  - Filter integration: filterChange custom event triggers grid reload
  - Click handling: delegated to selection.js (results.js does NOT handle clicks)
  - Pagination: prev/next controls for jobs with >100 files
  - Placeholder: app/static/img/placeholder.svg for missing thumbnails
  - API integration: /api/jobs/:id/files with filter/sort params, /api/jobs/:id/summary for counts
- Selection patterns (04-04):
  - app/static/js/selection.js: SelectionHandler class for multi-select
  - Owns all #unified-grid click handling (event delegation)
  - selectedIds Set tracks selected file IDs
  - Shift-click for range selection, Ctrl/Cmd-click for toggle
  - Keyboard shortcuts: Escape (clear), Delete (discard), Ctrl+A (select all), Enter (examine)
  - Duplicate group auto-selection on click
  - Selection toolbar: sticky bar with count, quick tag input, duplicate actions
  - Custom events: fileExamine, filesDiscard for downstream handlers
  - Syncs with resultsHandler.selectedFiles
- Examination modal (04-05, 04-07):
  - app/static/js/examination.js: ExaminationHandler class for file review
  - Native HTML <dialog> with showModal() for accessibility
  - Listens for fileExamine events from selection.js
  - Fetches file details from /api/files/:id
  - Prev/Next navigation with arrow key shortcuts
  - Two-column layout: preview (left), details (right)
  - Placeholder sections for timestamp sources and tags
  - Confirm & Next / Unreview action buttons
  - Updates grid items when review status changes
  - Review workflow: confirmAndNext, moveToNextUnreviewed, unreviewFile
  - Keyboard shortcut: Ctrl+Enter to confirm & next
  - Completion detection: prompts when all files reviewed
- Tagging UI (04-08):
  - app/static/js/tags.js: TagsHandler class for tag management
  - Quick tag input in selection toolbar for bulk operations
  - Full tag management in examination view (add/remove)
  - Autocomplete from recent/common tags (1-minute cache)
  - Toast notifications for user feedback
  - Integration: loadForFile() and reset() called from examination.js
- Review workflow (04-07):
  - HIGH confidence auto-confirmation via /api/jobs/:id/auto-confirm-high
  - One-time operation per job using localStorage flag
  - Filter counts update on review actions via loadSummary()
  - Reviewed chip always visible when files exist
  - filterCountsUpdated custom event for cross-component sync
- Settings API:
  - GET /api/settings returns current settings and defaults (output_directory, timezone)
  - POST /api/settings validates and persists settings with comprehensive error handling
  - Setting model: key-value store for persistent configuration
  - Output directory: validation (exists, is_dir, writable), auto-creation via mkdir(parents=True)
  - Timezone: validation via ZoneInfo
  - Collapsible UI panel: hidden by default to reduce visual clutter
  - Reset button: loads defaults from current_app.config
- Theme system (04-09):
  - app/static/js/theme.js: ThemeManager for light/dark/system themes
  - Loads in <head> without defer to prevent flash of wrong theme
  - localStorage persistence with 'theme-preference' key
  - CSS variables in :root with [data-theme="dark"] overrides
  - @media (prefers-color-scheme: dark) for system preference detection
  - Theme select in settings panel, changes apply immediately
  - Color aliases for component compatibility: --bg-primary, --bg-hover, --border-color, --text-secondary, --accent-color
- Duplicate comparison UI (05-03):
  - app/static/js/duplicates.js: DuplicatesHandler class for group comparison
  - Fetches groups from /api/jobs/:id/duplicates with quality metrics
  - IntersectionObserver lazy loading pattern (same as results.js)
  - Map-based selection state: groupHash → selectedFileId
  - Pre-selects recommended file based on quality metrics
  - Radio buttons scoped per group (name="keep-{hash}")
  - Real-time KEEP/DISCARD badge updates on selection
  - Per-group actions: Keep All, Confirm Selection
  - Event delegation for radios and buttons
  - Integration: shows on duplicates mode, hides on other modes
  - Quality metrics display: resolution, file size, format, timestamp

## Session Continuity

**Last session:** 2026-02-04
**Stopped at:** Completed 05-03-PLAN.md (Duplicate Comparison JavaScript)
**Resume file:** None

**Phase 4 Execution Status:**
- ✓ 04-01: Review API Models and Endpoints
- ✓ 04-02: Unified Grid with Filter Chips
- ✓ 04-03: Results Handler Integration
- ✓ 04-04: Multi-select and Selection Toolbar
- ✓ 04-05: Examination Modal View
- ✓ 04-06: Timestamp Source Comparison
- ✓ 04-07: Review Workflow
- ✓ 04-08: Tagging UI
- ✓ 04-09: Human Verification (COMPLETE)

**Phase 5 Execution Status (Duplicate Detection - Exact):**
- ✓ 05-01: Quality Metrics API (COMPLETE)
- ✓ 05-02: Duplicate Comparison View HTML & CSS (COMPLETE)
- ✓ 05-03: Duplicate Comparison JavaScript (COMPLETE)
- [ ] 05-04: Resolution Handler (Next)
- [ ] 05-09: Human Verification

**Session Work Completed (2026-02-03 afternoon):**
- **Mode-based workflow** (major refactor):
  - Replaced visibility toggles with mutually exclusive modes
  - Modes: Duplicates → Unreviewed → Reviewed → Discarded → Failed
  - Auto-selects Duplicates mode after processing (if any exist)
  - Confidence filters (H/M/L) work within each mode
  - Backend: `/api/jobs/:id/files?mode=X` filtering
  - Frontend: Mode selector UI with counts
- **Discard functionality**:
  - Single file: POST `/api/files/:id/discard`, DELETE to undiscard
  - Bulk: POST `/api/files/bulk/discard`
  - Discard clears reviewed_at (mutually exclusive states)
  - Confirmation dialogs for both toolbar and examination view
  - Discarded files sorted to end, visible in Discarded mode
- **Status pills in examination view**:
  - Shows confidence, reviewed, discarded, duplicate status below image
  - Color-coded badges for quick visual identification
- **Grid updates**:
  - Files auto-remove from grid when they no longer match current mode
  - Discarded badge (trash icon) on thumbnails

**Deferred to Phase 5:**
- Visual duplicate grouping (side-by-side comparison)
- Quality metrics comparison (resolution, file size)
- Bulk duplicate resolution ("keep largest", "keep earliest")

**For Next Session:**
1. `/clear` and start fresh
2. `/gsd:plan-phase 5` - Plan duplicate detection and resolution UI
3. Focus on visual grouping and comparison workflow

**Resume commands:**
- `/gsd:resume-work` - Full context restoration
- `/gsd:plan-phase 5` - Start Phase 5 planning
- `/gsd:progress` - Shows status and routes to next action

---

*State initialized: 2026-02-02*
