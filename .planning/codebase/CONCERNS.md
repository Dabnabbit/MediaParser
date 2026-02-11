# Codebase Concerns

**Analysis Date:** 2026-02-11

## Tech Debt

**O(n^2) Perceptual Duplicate Detection:**
- Issue: Pairwise Hamming distance comparison of all file perceptual hashes grows quadratically
- Files: `app/lib/perceptual.py` (`_compare_all_pairs()`)
- Impact: Processing time becomes impractical for large imports (10k+ files)
- Fix approach: Spatial indexing (VP-tree, BK-tree) or locality-sensitive hashing for sub-quadratic lookup

**No JavaScript Build Step:**
- Issue: 28 JS modules loaded via individual `<script>` tags with no bundling, minification, or tree-shaking
- Files: `app/templates/index.html` (28 script tags), `app/static/js/` (28 files)
- Impact: Slower initial page load; no dead code elimination; global namespace pollution; no module imports
- Fix approach: Adopt a bundler (esbuild, vite) or ES modules with import maps

**Inconsistent JavaScript Indentation:**
- Issue: Some JS files use 4-space indent, others use 2-space; no formatter configured
- Files: Various files in `app/static/js/`
- Impact: Minor readability concern; no functional impact
- Fix approach: Configure Prettier or similar formatter

**No Linting or Formatting Configuration:**
- Issue: No `.flake8`, `pyproject.toml` (for black), `.prettierrc`, or similar config files
- Impact: Style drift over time; reliance on convention rather than enforcement
- Fix approach: Add black + flake8 for Python, prettier for JS/CSS

**Duplicate Test Fixture:**
- Issue: `tests/test_integration.py` defines its own `app` and `client` fixtures identical to `tests/conftest.py`
- Files: `tests/test_integration.py` lines 23-45, `tests/conftest.py` lines 17-39
- Impact: Maintenance burden; risk of fixture drift
- Fix approach: Remove duplicate fixtures from test_integration.py, rely on conftest.py

**pgrep-Based Worker Health Check:**
- Issue: Worker health detection uses `pgrep -f huey_consumer` subprocess call
- Files: `app/routes/api.py` (`/api/worker-health` endpoint)
- Impact: Fragile on systems where process names differ; not portable to Docker without adjustment
- Fix approach: Use Huey's built-in health check task (already exists as fallback) or a heartbeat file

## Known Bugs

No critical bugs identified in current audit. All v1 requirements verified working.

## Security Considerations

**No Authentication:**
- Risk: Any network user can access all endpoints including destructive ones
- Files: All route files — no auth middleware
- Current mitigation: Designed for trusted home network (v1 scope decision)
- Recommendations: Add authentication before exposing to untrusted networks; planned for v2 (AUTH-01/02/03)

**Unprotected Debug Endpoints:**
- Risk: `POST /api/debug/clear-database` and `POST /api/debug/clear-storage` can destroy all data
- Files: `app/routes/settings.py`
- Current mitigation: None — accessible to any user on the network
- Recommendations: Gate behind admin auth or restrict to FLASK_ENV=development

**Server Path Import Accepts Arbitrary Directories:**
- Risk: `POST /api/import-path` accepts any server filesystem path; could scan sensitive directories
- Files: `app/routes/upload.py` (`import_from_path()`)
- Current mitigation: Only reads media files (ALLOWED_EXTENSIONS filter); uses absolute path validation
- Recommendations: Add path allowlist or restrict to configured import directories

**ExifTool Metadata Injection:**
- Risk: Maliciously crafted EXIF data could contain unexpected values passed to ExifTool write operations
- Files: `app/lib/metadata.py` (`write_timestamps()`, `write_tags_to_file()`)
- Current mitigation: PyExifTool handles argument escaping; only controlled values (timestamps, tag strings) are written
- Recommendations: Validate tag strings before writing; sanitize any user-provided values

## Performance Bottlenecks

**Perceptual Duplicate Detection (O(n^2)):**
- Problem: Every file's perceptual hash compared against every other file's hash
- Files: `app/lib/perceptual.py` (`_compare_all_pairs()`)
- Cause: Brute-force pairwise comparison needed for Hamming distance grouping
- Impact: ~5,000 files = ~12.5M comparisons; ~50,000 files = ~1.25B comparisons
- Improvement path: BK-tree or VP-tree for Hamming space; pre-filter by hash prefix; batch processing

**Progress Polling:**
- Problem: Frontend polls `/api/progress/:id` every 1-2 seconds via HTTP requests
- Files: `app/static/js/progress.js`, `app/routes/api.py`
- Cause: No WebSocket or SSE implementation
- Impact: Unnecessary server load during long processing jobs; slight latency in UI updates
- Improvement path: Server-Sent Events (SSE) for push-based progress; WebSocket for bidirectional control

**Individual Script Loading:**
- Problem: 28 JS files loaded via separate HTTP requests on page load
- Files: `app/templates/index.html`
- Cause: No build step or bundler configured
- Impact: Multiple round trips on initial load; no HTTP/2 push; no code splitting
- Improvement path: Bundle with esbuild/vite or use ES module imports with `<script type="module">`

**ExifTool Process Overhead:**
- Problem: ExifTool spawns a subprocess via context manager; overhead per invocation
- Files: `app/lib/metadata.py` (context manager pattern per call in worker)
- Cause: PyExifTool manages exiftool binary lifecycle
- Impact: Subprocess creation overhead per file during metadata extraction and writing
- Improvement path: Batch ExifTool operations; keep single persistent process across file batches

## Fragile Areas

**Timestamp Parsing Regex:**
- Files: `app/lib/timestamp.py` (`get_datetime_from_name()`, `convert_str_to_datetime()`)
- Why fragile: Multiple regex patterns for various filename date formats; edge cases in padding, separators, and partial timestamps
- Safe modification: Add new patterns as additional cases; don't modify existing patterns without adding test coverage
- Test coverage: Tested in `test_integration.py` (TestTimestampLibrary) — basic patterns covered but not all edge cases

**Confidence Scoring Weights:**
- Files: `app/lib/confidence.py` (`SOURCE_WEIGHTS`, `calculate_confidence()`)
- Why fragile: Weight values and agreement tolerance (30 seconds) affect all timestamp decisions; changes cascade to every file's confidence level
- Safe modification: Adjust weights conservatively; test with representative data before deploying
- Test coverage: Good coverage in `test_processing.py` (TestConfidenceScoring)

**Perceptual Hash Thresholds:**
- Files: `app/lib/perceptual.py` (`EXACT_THRESHOLD=5`, `SIMILAR_THRESHOLD=16`)
- Why fragile: Threshold values determine exact vs similar vs unrelated classification; too low = false negatives, too high = false positives
- Safe modification: Threshold tuning should be data-driven with sample images
- Test coverage: Good coverage in `test_perceptual.py` with explicit threshold boundary tests

**Job State Machine:**
- Files: `app/tasks.py` (status transitions), `app/models.py` (JobStatus enum)
- Why fragile: 7 job states (PENDING, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED, EXPORTING) with transitions managed in multiple locations (tasks.py, routes/jobs.py)
- Safe modification: Add new states carefully; ensure all status checks use enum values
- Test coverage: Minimal — `test_integration.py` tests basic lifecycle only

## Scaling Limits

**SQLite Concurrent Writes:**
- Current capacity: WAL mode with 5-second busy timeout supports web server reads + single worker writes
- Limit: Multiple simultaneous workers would contend for write lock; batch imports limited to one at a time
- Scaling path: PostgreSQL for multi-worker deployments; connection pooling

**Perceptual Hash Storage:**
- Current capacity: All file hashes loaded into memory for O(n^2) comparison
- Limit: ~100k files with 16-char hex hashes + file objects = significant memory pressure
- Scaling path: Database-side comparison queries; chunked processing; spatial index

**Thumbnail Storage:**
- Current capacity: Two thumbnails per file (`_thumb.jpg` + `_preview.jpg`) stored on filesystem
- Limit: 100k files = 200k thumbnail files in single directory (filesystem inode pressure)
- Scaling path: Subdirectory sharding (e.g., by file ID range); on-demand generation with caching

**Single Huey Worker Process:**
- Current capacity: 2 thread workers in single process; handles one job at a time with parallel file processing within job
- Limit: Cannot process multiple independent jobs simultaneously
- Scaling path: Multiple Huey consumer processes; or switch to Celery/RQ for distributed workers

## Dependencies at Risk

**ExifTool Binary:**
- Risk: System dependency not bundled with application; version-specific behavior differences
- Impact: Missing exiftool = metadata extraction and writing completely broken
- Migration plan: Docker image should include exiftool; version pin in Dockerfile

**ffmpeg Binary:**
- Risk: System dependency for video thumbnail extraction; not required for image-only workflows
- Impact: Missing ffmpeg = video thumbnails and video perceptual hashing silently fail (returns None)
- Migration plan: Graceful degradation already implemented; Docker image should include ffmpeg

**PyExifTool Wrapper:**
- Risk: Python wrapper around exiftool CLI; less actively maintained than exiftool itself
- Impact: API changes in PyExifTool could break metadata operations
- Migration plan: Pin version in requirements.txt; consider subprocess fallback

**imagehash Library:**
- Risk: Used for pHash calculation; relatively stable but niche library
- Impact: Library deprecation would require finding alternative perceptual hashing implementation
- Migration plan: Algorithm is well-documented (pHash); could implement directly with Pillow + DCT if needed

## Test Coverage Gaps

**Route/API Endpoint Tests:**
- What's not tested: All 5 blueprint route handlers (upload, jobs, api, settings, review)
- Files: `app/routes/*.py` (5 files, ~60 endpoints)
- Risk: API contract changes undetected; error handling regressions
- Priority: High

**Metadata Operations:**
- What's not tested: ExifTool reading/writing, dimension extraction, timestamp candidate collection
- Files: `app/lib/metadata.py` (8 functions)
- Risk: Metadata extraction regressions; incorrect timestamp writing on export
- Priority: High

**Thumbnail Generation:**
- What's not tested: Pillow image processing, EXIF orientation correction, video frame extraction
- Files: `app/lib/thumbnail.py`
- Risk: Thumbnail generation failures; incorrect orientation
- Priority: Medium

**Background Task Integration:**
- What's not tested: Full import job pipeline (file processing + batch commits + duplicate detection); export job pipeline (copy + metadata write + verification)
- Files: `app/tasks.py` (process_import_job, process_export_job)
- Risk: Job processing regressions; batch commit edge cases; pause/resume state issues
- Priority: High

**Frontend:**
- What's not tested: All 28 JS modules, DOM interactions, FLIP animations, Web Audio sounds
- Files: `app/static/js/` (28 files)
- Risk: UI regressions undetected; browser compatibility issues
- Priority: Low (v1 scope — manual testing sufficient)

---

*Concerns audit: 2026-02-11*
