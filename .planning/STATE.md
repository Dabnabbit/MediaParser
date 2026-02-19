# Project State: MediaParser

**Last Updated:** 2026-02-19

## Environment

- **Platform:** WSL2 (Ubuntu on Windows) - migrated from Windows-native development
- **Working Directory:** `/home/dab/Projects/MediaParser` (NOT `/mnt/d/...`)
- **Target:** Linux-native, will be Dockerized for deployment
- **Python:** 3.12 with venv

## Project Reference

**Core Value:** Turn chaotic family media from dozens of sources into a clean, organized, timestamped archive — without losing anything important.

**Current Focus:** Phase 8 — Windows Portable Desktop Build (iterative debugging on Windows hardware)

## Current Position

**Phase:** 8 of 8 - Windows Portable Desktop Build
**Plan:** 3 of 3 (ALL COMPLETE)
**Status:** COMPLETE
**Last activity:** 2026-02-19 - Fix ExifTool: standalone exe from SourceForge replaces broken .bat wrapper
**Progress:** `[██████████] 100%` (42/42 plans complete)

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

**Velocity:** 42 plans complete — Phases 1-7 in ~80 min, Phase 8 in ~10 min
**Plan Success Rate:** 100% (42/42 completed successfully)
**Blocker Rate:** 0% (0 blockers encountered)
**Phases Complete:** 8/8 (all phases complete)
**Out-of-band work:** Carousel viewport system refactor (not tracked by GSD plans)

## Accumulated Context

### Roadmap Evolution

- Phase 8 added: Windows Portable Desktop Build

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
| Keep All preserves all files | 2026-02-04 | Removes duplicate_group_id from all files instead of keeping one; treats all as unique | 05-04: Keep All behavior |
| Multi-stage confirmation for discards | 2026-02-04 | Modal shows group/keep/discard counts before executing bulk discard | 05-04: Bulk confirmation |
| Mode-based view switching | 2026-02-04 | Duplicates mode hides grid and shows comparison; other modes reverse | 05-04: Mode integration |
| Auto-switch to unreviewed mode | 2026-02-04 | When duplicates count reaches 0 after resolution, switch to unreviewed mode | 05-04: Mode transitions |
| Carousel viewport system | 2026-02-04 | Replace separate examination modal with in-place tile scaling for unified UX | Viewport refactor |
| Write to both IPTC:Keywords and XMP:Subject | 2026-02-06 | Broadest compatibility with photo management tools (Google Photos, Apple Photos, etc.) | 07-02: Tag format selection |
| Batch metadata writes in single ExifTool context | 2026-02-06 | 50% reduction in subprocess overhead when writing both timestamps and tags | 07-02: Write optimization |
| QuickTime tags for video files | 2026-02-06 | Video files need QuickTime-specific timestamps in addition to EXIF | 07-02: Video metadata |
| Tile as universal container | 2026-02-04 | Same tile element renders at any size (grid to viewport), CSS transitions between states | Viewport refactor |
| MIPMAP resolution switching | 2026-02-04 | ResizeObserver triggers image source upgrade when tile exceeds 400px threshold | Viewport refactor |
| Position-based carousel CSS | 2026-02-04 | Tiles use data-vp-pos (grid/prev/current/next) for GPU-accelerated transitions; non-viewport tiles stay in grid (not hidden) | Viewport refactor |
| Grid stays in document flow | 2026-02-04 | Container uses position:relative (not fixed); only viewport tiles and backdrop use position:fixed | Viewport refactor |
| FLIP animation on enter | 2026-02-04 | Capture grid positions, freeze with inline styles, activate mode, release to animate tiles from grid to viewport | Viewport refactor |
| Grid position locking | 2026-02-04 | Freeze gridTemplateRows/Columns + assign explicit gridRow/gridColumn per tile to prevent reflow when viewport tiles leave flow | Viewport refactor |
| Z-index layering system | 2026-02-04 | Grid tiles z:0 (stacking context for badges), backdrop z:1, prev/next z:5, current z:10, UI z:1010 | Viewport refactor |
| Z-index priority during navigation | 2026-02-04 | Upcoming current gets inline z:10 before swap; tiles entering from grid get z:2 (behind existing viewport tiles) | Viewport refactor |
| setupViewport never bounces through GRID | 2026-02-04 | Only non-viewport tiles set to GRID; viewport tiles transition directly between positions to preserve animation start point | Viewport refactor |
| Backdrop as ::before pseudo-element | 2026-02-04 | Fixed overlay between grid (z:0) and viewport tiles (z:5+); uses @keyframes fade-in instead of class toggle | Viewport refactor |
| Transition duration from CSS variable | 2026-02-04 | JS reads --vp-transition-duration from computed style instead of hardcoding timeout values | Viewport refactor |
| Calculate grid positions from index | 2026-02-04 | Chrome returns "auto" for gridRowStart on auto-placed items; calculate row/col from tile index and column count instead | Viewport refactor |
| TileManager for lifecycle | 2026-02-04 | Central manager for tile creation, file mapping, lazy loading via IntersectionObserver | Viewport refactor |
| ViewportController orchestration | 2026-02-04 | Handles FLIP enter, grid locking, z-index management, keyboard navigation, view mode cycling | Viewport refactor |
| Deferred initialization pattern | 2026-02-04 | Cross-module dependencies resolved after DOMContentLoaded via setViewportController() | Viewport refactor |
| ExaminationHandler as fallback | 2026-02-04 | Legacy modal remains for duplicate group loading but viewport is primary interface | Viewport refactor |
| Cleanup comparison view | 2026-02-04 | Removed orphaned comparison grid code, CSS, HTML modal - now using single-view navigation | Viewport refactor |
| Setting model for import root storage | 2026-02-06 | No migration needed, clean separation from Job status tracking, job-scoped keys | 07-03: Tag auto-generation |
| Filter generic folder names | 2026-02-06 | Prevents noise tags (dcim, camera, numeric years) that don't provide meaningful organization | 07-03: Folder tag extraction |
| Browser uploads skip import root | 2026-02-06 | Folder structure lost via secure_filename, only server imports preserve hierarchy | 07-03: Upload handling |
| Cleanup legacy bucket CSS | 2026-02-04 | Removed 276 lines of unused accordion/bucket styles from main.css and examination.css | CSS cleanup |
| Two-tier duplicate detection | 2026-02-04 | Separate DUPLICATES (exact SHA256 + perceptual 0-4) from SIMILAR (sequences, bursts, perceptual 5-20) | Phase 6: Architecture |
| Sequential duplicate resolution | 2026-02-04 | Workflow enforces: Duplicates → Similar → Unreviewed. Must resolve each before proceeding. | Phase 6: Workflow |
| Confidence reuse for duplicates | 2026-02-04 | Reuse HIGH/MEDIUM/LOW confidence system for duplicate detection (no timestamp overlap due to workflow order) | Phase 6: UI consistency |
| Radio vs checkbox selection | 2026-02-04 | Duplicates = radio (keep one), Similar = checkbox (keep multiple from burst/sequence) | Phase 6: UX |
| Discard clears duplicate status | 2026-02-04 | Discarding a file clears its duplicate_group_id to prevent confusion in Discarded view | 05: Bug fix |
| Undiscard re-evaluates groups | 2026-02-04 | Undiscarding checks SHA256 against non-discarded files to restore duplicate group membership | 05: Bug fix |
| Timestamp-constrained perceptual matching | 2026-02-04 | Use timestamp clustering as constraint for perceptual comparison - O(n log n) vs O(n²). Only compare files within same time cluster. | Phase 6: Performance |
| Perceptual thresholds | 2026-02-04 | Distance 0-5 = DUPLICATE (same image), 6-20 = SIMILAR (burst/panorama), 20+ = unrelated | Phase 6: Algorithm |
| Deferred edge cases | 2026-02-04 | Skip cross-cluster duplicate detection for v1. Edits made weeks later handled manually. Optional "Deep Scan" later. | Phase 6: Scope |
| FLIP animation for navigation | 2026-02-05 | Tiles entering/leaving viewport animate to/from their grid positions using FLIP technique; entering tiles frozen at grid rect then released, leaving tiles animated back to grid rect | Viewport refactor: smooth navigation |
| Narrow tile.css transition selector | 2026-02-05 | `.thumbnail[data-vp-pos]` was too broad — applied transitions to grid tiles causing shoot-off bug; narrowed to only prev/current/next positions | Viewport refactor: bug fix |
| String type for confidence columns | 2026-02-05 | Use String(10) instead of SQLEnum for exact_group_confidence and similar_group_confidence to avoid SQLite Enum complications | Phase 6: Schema |
| Direct SQL for column rename | 2026-02-05 | Use ALTER TABLE RENAME COLUMN directly instead of batch_alter_table to avoid foreign key constraint errors | Phase 6: Migration |
| Clear similar_group_id on discard | 2026-02-05 | Discarding a file clears both exact_group_id and similar_group_id to remove from all duplicate workflows | Phase 6: Consistency |
| Hardware-accelerated Hamming distance | 2026-02-05 | Use int.bit_count() for perceptual hash comparison (Python 3.10+ POPCNT instruction) | Phase 6: Performance |
| Timestamp-constrained perceptual matching | 2026-02-05 | O(n log n) clustering by timestamp before pairwise comparison (~2,500x faster than naive O(n²)) | Phase 6: Algorithm |
| 5-second clustering window | 2026-02-05 | Timestamp proximity window for grouping related images (bursts, panoramas, format conversions) | Phase 6: Tuning |
| Separate exact/similar confidence mapping | 2026-02-05 | Exact duplicates (0-5) always HIGH due to timestamp corroboration; similar (6-20) varies by distance | Phase 6: Confidence |
| Similar groups allow keeping multiple files | 2026-02-05 | Unlike exact duplicates (pick one), similar groups (burst/panorama) may have multiple keepers | Phase 6: Resolution |
| Separate endpoints for exact vs similar | 2026-02-05 | Different resolution semantics (pick-one vs pick-many) warrant different endpoints | Phase 6: API design |
| Sequential workflow enforcement (Duplicates → Similar → Unreviewed) | 2026-02-05 | Auto-select modes in order with warning toasts when user skips ahead; respects user agency while guiding best practices | Phase 6: UI workflow |
| Similar mode reuses viewport system | 2026-02-05 | Same ViewportController and details panel as duplicates with mode-specific action buttons for consistency | Phase 6: UI architecture |
| Keep All marks as not-similar | 2026-02-05 | Clears similar_group_id instead of accepting, allows preserving entire burst sequences or panoramas | Phase 6: Resolution |
| Group type badges color-coded | 2026-02-05 | Burst (blue), panorama (yellow), similar (gray) for visual distinction of grouping reason | Phase 6: UX design |
| Year-based folder organization | 2026-02-06 | Single-level year folders (YYYY/) for output files | 07-01: Output structure |
| YYYYMMDD_HHMMSS.ext filename format | 2026-02-06 | ISO-8601-like compact format for exported filenames | 07-01: Filename standard |
| Counter suffix for collisions | 2026-02-06 | Append _001, _002 for same-timestamp files | 07-01: Collision resolution |
| unknown/ subfolder for no-timestamp files | 2026-02-06 | Separate folder for files needing manual timestamp assignment | 07-01: Export edge cases |
| Export as separate job type | 2026-02-06 | New Job record preserves import history, enables retry without re-import | 07-01: Job architecture |
| File.output_path tracks export status | 2026-02-06 | Database field enables pause/resume for export jobs | 07-01: Resume support |
| Default --host remains 0.0.0.0 | 2026-02-19 | Docker and dev server behavior unchanged; launcher passes --host 127.0.0.1 explicitly | 08-01: --host flag |
| os.kill(pid, 0) for PID health check | 2026-02-19 | Cross-platform process existence check — works on Windows Python 3 without Win32 API | 08-01: Health check |
| 4-tier health check: standalone -> PID -> pgrep -> Huey | 2026-02-19 | PID tier inserted as second check for launcher.py desktop mode | 08-01: Health check order |
| Phase 08-windows-portable-desktop-build P02 | 2 | 2 tasks | 3 files |
| python312.zip stdlib must be extracted to python312/ directory | 2026-02-19 | Leaving as ZIP causes ImportError for pickle and many stdlib modules at runtime on Windows | 08-03: Embeddable Python |
| python-magic-bin replaces python-magic in Windows portable build | 2026-02-19 | Bundles magic.dll — no separate libmagic.so dependency needed on Windows | 08-03: Package substitution |
| windows_exiftool.txt -> exiftool.pl rename is CRITICAL | 2026-02-19 | perl.exe looks for exiftool.pl as its script entry point; wrong name = ExifTool broken | 08-03: ExifTool setup |
| Standalone exiftool.exe replaces .bat wrapper | 2026-02-19 | pyexiftool uses piped stdin/stdout (-stay_open protocol); CMD.exe in a .bat wrapper breaks pipe inheritance; native launcher exe handles pipes correctly | 08: ExifTool fix |
| Download ExifTool from SourceForge in build script | 2026-02-19 | Official standalone package (exiftool(-k).exe + exiftool_files/) from exiftool.org; replaces local exiftool_files/ copy approach | 08: ExifTool fix |
| CREATE_NEW_PROCESS_GROUP for Windows subprocesses | 2026-02-19 | ExifTool/ffmpeg spawning generates console control events that kill Flask/worker; new process group isolates children; launcher handles shutdown via TerminateProcess | 08: Process isolation |
| PYTHONUNBUFFERED=1 for subprocess env | 2026-02-19 | Ensures crash output is visible immediately in the console window; critical for debugging on Windows | 08: Debugging |
| curl for build downloads instead of urllib | 2026-02-19 | SourceForge uses JavaScript-based redirects that Python urllib cannot follow; curl handles the 302 chain correctly | 08: Build reliability |
| Keep python312.zip AND extracted python312/ | 2026-02-19 | Zip needed for Python early init (encodings boot); extracted dir needed for modules requiring filesystem access (pickle, etc.) | 08: Embeddable Python |
| colorama as transitive dependency | 2026-02-19 | click requires colorama on Windows for ANSI color support; missing it causes ImportError at startup | 08: Windows deps |
| Simplified MediaParser.bat (no error handling) | 2026-02-19 | Error-handling code after Python caused CMD to prompt "Terminate batch job?" on Ctrl+C; making Python the last command avoids the prompt | 08: UX |

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

**Phase 5 - Duplicate Detection (Exact) (COMPLETE):**
- [x] 05-01: Quality Metrics & Recommendations API (COMPLETE)
- [x] 05-02: Duplicate Comparison View (COMPLETE - later refactored to viewport)
- [x] 05-03: Duplicate Comparison JavaScript (COMPLETE - later refactored to viewport)
- [x] 05-04: Duplicate Resolution Integration (COMPLETE)

**Phase 6 - Duplicate Detection (Perceptual) (COMPLETE):**
- [x] 06-01: Alembic Setup + Schema Migration (COMPLETE)
- [x] 06-02: Perceptual Detection Algorithm (COMPLETE)
- [x] 06-03: Two-Tier Duplicate Detection API (COMPLETE)
- [x] 06-04: Similar Mode UI Integration (COMPLETE)
- [x] 06-05: Integration Testing (COMPLETE)

**Phase 7 - Output Generation + Tagging (COMPLETE):**
- [x] 07-01: Export task + file copy engine (COMPLETE)
- [x] 07-02: EXIF metadata write-back (COMPLETE)
- [x] 07-03: Tag auto-generation (COMPLETE)
- [x] 07-04: Export UI + source cleanup + tag filter integration (COMPLETE)
- [x] 07-05: Integration testing and regression verification (COMPLETE)

**Phase 8 - Windows Portable Desktop Build (COMPLETE):**
- [x] 08-01: Add --host flag to run.py, PID health check to api.py, build gitignore entries (Wave 1) (COMPLETE)
- [x] 08-02: Create launcher.py desktop orchestrator and MediaParser.bat entry point (Wave 1) (COMPLETE)
- [x] 08-03: Create scripts/build-windows.py cross-build script for Windows portable ZIP (Wave 2) (COMPLETE)

### Known Blockers

None

### Technical Debt

None — legacy `PhotoTimeFixer.py` issues all resolved or superseded by the new `app/lib/` codebase.

### Research Flags

None — all research completed during GSD phases.

## Completed Requirements (Phase 3)

- ✓ WEB-02: Drag-drop file upload
- ✓ WEB-03: Folder picker and server path import
- ✓ WEB-04: Real-time progress with pause/resume
- ✓ WEB-05: Settings configuration (output directory)
- ✓ WEB-06: Results display with confidence buckets

**Context to Preserve:**
- Phase 1 (COMPLETE): Established foundational patterns (pathlib, app factory, env config, database schema, library functions, task queue, integration tests)
- Phase 2 (COMPLETE): Core algorithms and worker implementation (hashing, confidence scoring, processing pipeline, multi-threaded job processing)
- Phase 3 (COMPLETE): Web UI foundation with single-pane layout, EXIF-aware thumbnails, responsive CSS
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
  - app/static/js/results.js: ResultsHandler class - now uses TileManager for grid rendering
  - app/static/js/settings.js: SettingsHandler class for collapsible panel, load/save/reset settings
  - window.* pattern: Global handlers for cross-script communication (uploadHandler, progressHandler, resultsHandler, tileManager, viewportController)
  - XMLHttpRequest for upload progress (fetch doesn't support upload progress events)
  - localStorage for session resume (preserves job ID across page reloads)
  - Client-side extension filtering: jpg, jpeg, png, gif, heic, mp4, mov, avi, mkv
- Results display patterns:
  - Unified grid: single grid view with filter chips (replaced accordion buckets)
  - Lazy loading: IntersectionObserver with 100px rootMargin for thumbnail preloading
  - Thumbnail sizes: compact (100px), medium (150px), large (200px) presets
  - Badges: left side for type info (confidence, video), right side for status (reviewed, failed)
  - Filter integration: filterChange custom event triggers grid reload
  - Click handling: delegated to SelectionHandler (results.js does NOT handle clicks)
  - Pagination: prev/next controls for jobs with >100 files
  - Placeholder: app/static/img/placeholder.svg for missing thumbnails
  - API integration: /api/jobs/:id/files with filter/sort params, /api/jobs/:id/summary for counts
- Selection patterns (04-04, refactored 2026-02-05):
  - Split into 3 modules for maintainability:
    - selection-core.js: SelectionHandler class, state management, UI updates
    - selection-events.js: Click/keyboard event handlers (prototype extension)
    - selection-actions.js: Bulk API actions (prototype extension)
  - Owns all .thumbnail-grid click handling (event delegation)
  - selectedIds Set tracks selected file IDs
  - Shift-click for range selection, Ctrl/Cmd-click for toggle
  - Keyboard shortcuts: Escape (clear), Delete (discard), Ctrl+A (select all), Enter (examine)
  - Duplicate group auto-selection on click
  - Selection toolbar: sticky bar with count, quick tag input, duplicate actions
  - ViewportController integration: openExamination() uses viewport.enter() as primary interface
  - Deferred initialization: setViewportController() called after DOMContentLoaded
  - Fallback: dispatches fileExamine event if ViewportController not available
- Carousel viewport system (replaces examination modal):
  - app/static/js/tile.js: Tile class for universal file containers
    - MIPMAP resolution: ResizeObserver upgrades image source at 400px threshold
    - Position states: grid/prev/current/next/hidden via CSS data attributes
    - Preloading: preloadFullRes() for smooth transitions
    - Cleanup: destroy() for memory management
  - app/static/js/tile-manager.js: TileManager class for tile lifecycle
    - File-to-tile mapping: getTile(fileId), getAllTiles()
    - Lazy loading: IntersectionObserver for offscreen tiles
    - Bulk operations: renderFiles(), destroyAll()
    - Navigation helpers: setupViewport() for prev/current/next positioning
  - ViewportController (refactored 2026-02-05 into 4 modules for maintainability):
    - viewport-core.js: Class definition, state, enter/exit lifecycle
    - viewport-animation.js: FLIP animation logic, grid locking
    - viewport-navigation.js: next/prev/goTo navigation methods
    - viewport-ui.js: UI elements, event handlers, view modes
    - Mode management: enter(fileId, navigableIds), exit()
    - Navigation: next(), previous() with keyboard support (arrows, escape)
    - Position updates: updateTilePositions() manages carousel state
    - Events: viewportEnter, viewportNavigate, viewportExit custom events
  - app/static/js/viewport-details.js: ViewportDetails class for file info panel
    - Fetches full file details from /api/files/:id
    - Updates tile's file data for MIPMAP resolution switching
    - Integrates with timestampHandler and tagsHandler
    - Action buttons: confirm, discard, keep/not-duplicate
  - app/static/css/viewport.css: Viewport-specific styles
    - CSS custom properties: --vp-side-offset, --vp-side-scale
    - Position-based transforms for carousel animation
    - GPU-accelerated transitions via transform/opacity
- Examination modal (legacy fallback):
  - app/static/js/examination.js: ExaminationHandler for duplicate group loading
  - Primarily used for loadDuplicateGroup() to fetch and setup duplicate navigation
  - Single file navigation now handled by ViewportController
  - Simplified: removed comparison grid, bulk selection, confirmation modal
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
- Duplicate handling (refactored):
  - Duplicate navigation uses same viewport system as regular files
  - ExaminationHandler.loadDuplicateGroup() fetches group from /api/jobs/:id/duplicates
  - Single-view carousel navigation through duplicate group files
  - Action buttons: "Keep This, Discard Others" and "Not a Duplicate"
  - Quality metrics (resolution, file size) shown in viewport details panel
  - No separate comparison grid - unified UX across all view modes
  - DELETED: app/static/js/duplicates.js, app/static/css/duplicates.css

## Session Continuity

**Phase 4 Execution Status:** ✓ COMPLETE (all 9 plans)

**Phase 5 Execution Status (Duplicate Detection - Exact):** ✓ COMPLETE (all 4 plans)

**Phase 6 Execution Status (Duplicate Detection - Perceptual):** ✓ COMPLETE (all 5 plans)

**Phase 7 Execution Status (Output Generation + Tagging):** ✓ COMPLETE (all 5 plans)

**Viewport Refactor Status (Out-of-band):** ✓ COMPLETE
- Carousel viewport system replaces examination modal
- FLIP animation for enter, grid position locking, z-index layering
- Keyboard navigation (arrows, escape), view mode cycling
- Context-aware action buttons per mode (duplicates/review/discarded)
- Duplicate resolution flow (keep/discard/not-a-duplicate) with auto-navigation

**Session Work Completed (2026-02-05 - Out-of-band):**
- **Frontend Module Refactoring** (reduce context overhead for debugging):
  - Split viewport-controller.js (1169 lines) into 4 focused modules:
    - viewport-core.js (331): Class, state, enter/exit lifecycle
    - viewport-animation.js (350): FLIP animation logic
    - viewport-navigation.js (177): next/prev/goTo navigation
    - viewport-ui.js (347): UI elements, event handlers
  - Split selection.js (811 lines) into 3 focused modules:
    - selection-core.js (392): State, viewport integration, UI
    - selection-events.js (223): Click/keyboard handlers
    - selection-actions.js (284): Bulk API actions
  - Fixed missing data-index on Tile elements (broke shift-click range selection)
  - Uses prototype extension pattern (no build tooling required)
  - Updated STRUCTURE.md and STATE.md to reflect new file structure
  - Reverted uncommitted auto-scroll experiment (will approach fresh later)

**Session Work Completed (2026-02-04 - Out-of-band):**
- **Carousel Viewport System** (major architectural refactor):
  - Replaced separate examination modal with in-place tile scaling
  - New files: tile.js, tile-manager.js, viewport-details.js, viewport.css
  - ViewportController split into 4 modules (2026-02-05): viewport-core.js, viewport-animation.js, viewport-navigation.js, viewport-ui.js
  - MIPMAP-style resolution switching: thumbnails → full-res based on rendered size
  - CSS-based carousel: position states (grid/prev/current/next) with GPU-accelerated transitions
  - TileManager: tile lifecycle, file↔tile mapping, lazy loading via IntersectionObserver
  - ViewportController: examination mode orchestration, keyboard navigation
  - ViewportDetails: file info panel, integrates with timestamp/tag handlers
  - Unified UX: same examination behavior across all view modes (duplicates, unreviewed, etc.)
- **Cleanup of orphaned code (examination system)**:
  - Removed comparison view HTML from index.html
  - Removed ~234 lines of comparison CSS from examination.css
  - Removed comparison methods from examination.js (renderComparisonView, calculateBestValues, etc.)
  - Removed duplicate confirmation modal HTML and CSS
  - Removed orphaned event listeners and state variables
  - Deleted: duplicates.js, duplicates.css
  - Updated examination.js header comments
- **Cleanup of legacy bucket/accordion CSS (276 lines total)**:
  - main.css (-262 lines): Removed `.buckets-container`, `.buckets-header`, `.bucket*` accordion styles, `.failed-file*`, `.duplicate-group` container styles (old expandable groups), `.duplicate-file*` comparison cards, `.bucket-pagination`
  - examination.css (-14 lines): Removed orphaned `.examination-preview` and `.nav-arrow` from mobile media query
  - Preserved: `.confidence-badge` and level classes, `.thumb-size-toggle`, `.thumbnail-grid`, `.thumbnail.duplicate-group` border styling

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

**Key viewport files (refactored 2026-02-05):**
- ViewportController (split into 4 modules):
  - `app/static/js/viewport-core.js` - class, state, enter/exit lifecycle
  - `app/static/js/viewport-animation.js` - FLIP animation logic
  - `app/static/js/viewport-navigation.js` - next/prev/goTo navigation
  - `app/static/js/viewport-ui.js` - UI elements, event handlers
- SelectionHandler (split into 3 modules):
  - `app/static/js/selection-core.js` - class, state, UI updates
  - `app/static/js/selection-events.js` - click/keyboard handlers
  - `app/static/js/selection-actions.js` - bulk API actions
- `app/static/js/viewport-details.js` - details panel, context-aware action buttons
- `app/static/js/tile-manager.js` - tile lifecycle, setupViewport() navigation
- `app/static/css/viewport.css` - viewport styling, z-index layers, transitions
- `.planning/carousel-viewport-plan.md` - architecture overview (references old file names)

**Last session:** 2026-02-19
**Stopped at:** ExifTool standalone exe fix applied — awaiting Windows test of upload/process workflow
**Last commit:** fix: ExifTool standalone exe from SourceForge (replaces broken .bat wrapper)

### QNAP Deployment (COMPLETE)

All deployment steps finished:
1. ✅ Pushed license commit and all subsequent Docker fixes
2. ✅ Made GitHub repo public
3. ✅ Verified GHCR image pulls without auth
4. ✅ Deployed to QNAP via stack (`qnap-stack.yml`)
5. ✅ Fixed Docker issues found during deployment testing (fresh DB, health check, output mount)
6. ✅ Added browser ZIP download for export results

**Deployment info:**
- GHCR image: `ghcr.io/dabnabbit/mediaparser:latest`
- QNAP media mount: `/share/CACHEDEV2_DATA/Pix:/media:ro`
- QNAP output mount: `/share/CACHEDEV2_DATA/MediaParser-Output:/output`
- Stack: two services (web + worker) with shared named volumes for instance/storage

### Export Portability (COMPLETE)

Made export output accessible regardless of deployment method:
- **`OUTPUT_DIR` env var** (`0bf238b`): Docker can mount a host directory for export output instead of a named volume the user can't easily browse. Used by QNAP stack to write to `/share/CACHEDEV2_DATA/MediaParser-Output`.
- **Browser ZIP download** (`0bf238b`): `GET /api/download-output` zips the output directory and serves it as a browser download. Download button appears on finalize-complete card. Works for any deployment where the user doesn't have filesystem access.
- **Entrypoint hardening** (`69e4531`): `docker-entrypoint.sh` warns (not crashes) if `OUTPUT_DIR` isn't writable, so the container stays up for import/review instead of restart-looping.

### Windows Portable Desktop Build (COMPLETE — awaiting human verification)

**Goal:** Download a ZIP, extract, double-click `MediaParser.bat`, app launches in browser. No Python install, no terminal, no dependencies. Full Docker feature parity.

**Status:** All 3 plans executed (2026-02-18). 15/15 automated must-haves verified. Awaiting human testing.
**Plans:** `.planning/phases/08-windows-portable-desktop-build/08-{01,02,03}-PLAN.md`
**Summaries:** `.planning/phases/08-windows-portable-desktop-build/08-{01,02,03}-SUMMARY.md`
**Verification:** `.planning/phases/08-windows-portable-desktop-build/08-VERIFICATION.md`
**Research:** `.planning/phases/08-windows-portable-desktop-build/08-RESEARCH.md`

**Architecture (LOCKED):** Two separate processes (Flask + Huey worker) — NOT standalone mode.

**What was built:**
- **08-01:** `--host` flag on `run.py` (default `0.0.0.0`), PID-based health check in `api.py` (reads `MEDIAPARSER_WORKER_PID`, `os.kill(pid, 0)`), build dirs gitignored
- **08-02:** `launcher.py` (240 lines) — portable/system Python detection, env setup, DB init/migration, two-process spawn, browser open, clean Ctrl+C shutdown. `MediaParser.bat` — Windows double-click entry with drive letter handling
- **08-03:** `scripts/build-windows.py` (~460 lines) — 8-step cross-build: Python 3.12 embeddable (stdlib extracted + zip kept, `._pth` + `mediaparser.pth`), FFmpeg (gyan.dev), ExifTool (standalone exe from SourceForge), pip wheels (`python-magic-bin` + `colorama`), app code, `.env`, ZIP. Uses `curl` for downloads (handles SourceForge redirects).

**Post-execution fixes (iterative debugging on Windows hardware):**
- `pip install --target` on Linux rejects win_amd64 wheels → extract .whl files directly (they're ZIPs)
- `python312.zip` must be kept alongside extracted `python312/` dir → both needed (boot vs filesystem access)
- `colorama` added as transitive dep → click requires it on Windows
- `mediaparser.pth` fixed from `../../..` (3 levels, wrong) to `../../../..` (4 levels, correct)
- ExifTool `.bat` wrapper replaced with standalone native exe → pyexiftool's piped stdin/stdout protocol breaks through CMD.exe
- `CREATE_NEW_PROCESS_GROUP` added for Windows subprocesses → prevents ExifTool/ffmpeg console events from killing Flask/worker
- `PYTHONUNBUFFERED=1` added to subprocess env → crash output visible immediately
- `MediaParser.bat` simplified to avoid "Terminate batch job?" prompt on Ctrl+C

**Key decisions (LOCKED):**
- Bundle: Python 3.12 embeddable + FFmpeg (gyan.dev) + ExifTool (standalone from SourceForge) + `python-magic-bin`
- `pip download --platform win_amd64` from WSL2 (no Wine needed — all 24 packages verified)
- `python312.zip` stdlib kept for boot + extracted to `python312/` for modules needing filesystem access
- `MEDIAPARSER_WORKER_PID` env var for PID-based health check (`os.kill(pid, 0)` works on Windows)
- Console window stays visible — tray icon deferred to v2
- Build uses `.build-cache/` for download caching; `curl` for downloads (SourceForge compat)

**Human verification checklist:**
- [x] `python scripts/build-windows.py --version 0.1.0` — ZIP created in `dist/` (multiple successful builds)
- [x] Extract ZIP on Windows, double-click `MediaParser.bat` — app boots, browser opens, Ctrl+C shuts down
- [ ] Full upload/process/export workflow on Windows (ExifTool fix needs testing)
- [ ] Docker, quickstart.sh, dev two-process mode still work unchanged

---

*State initialized: 2026-02-02*
*Last updated: 2026-02-19 — ExifTool standalone exe fix; iterative Windows debugging (boot, process isolation, ExifTool pipes)*
