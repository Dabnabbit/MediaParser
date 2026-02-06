---
phase: 07
plan: 01
subsystem: export-engine
tags: [export, file-copy, output-organization, background-task]
requires: [06-duplicate-detection]
provides: [export-task-engine, output-filename-generation, year-based-folders]
affects: [07-02-tagging, 07-03-batch-operations]
tech-stack:
  added: []
  patterns: [timestamp-to-filename-conversion, collision-resolution, batch-file-copy]
key-files:
  created: [app/lib/export.py]
  modified: [app/tasks.py, app/routes/jobs.py]
key-decisions:
  - decision: "Year-based folder organization (YYYY/)"
    rationale: "Chronological organization by year provides human-browsable structure"
    impact: "Output directories organized by capture year"
  - decision: "YYYYMMDD_HHMMSS.ext filename format"
    rationale: "Sortable timestamp format, unique per second, preserves extension"
    impact: "Standardized filenames across entire archive"
  - decision: "Counter suffix for collisions (_001, _002)"
    rationale: "Handles multiple files with same timestamp without modifying timestamp"
    impact: "Deterministic collision resolution up to 999 files per second"
  - decision: "unknown/ subfolder for files without timestamps"
    rationale: "Separates files needing manual review from timestamped archive"
    impact: "Easy identification of files requiring timestamp assignment"
  - decision: "Export as separate job type"
    rationale: "Preserves import job history, enables independent progress tracking"
    impact: "Export can be retried without re-importing, clear audit trail"
  - decision: "File.output_path tracks export status"
    rationale: "Enables resume support - skip already exported files"
    impact: "Robust handling of paused/cancelled export jobs"
patterns-established:
  - pattern: "Timestamp-to-path conversion"
    location: "app/lib/export.py:generate_output_filename"
    description: "Converts file object with timestamp to organized output path"
  - pattern: "Collision resolution via counter suffix"
    location: "app/lib/export.py:resolve_collision"
    description: "Deterministic filename collision handling with _NNN suffix"
  - pattern: "Export job with resume support"
    location: "app/tasks.py:process_export_job"
    description: "Huey task follows import job pattern with pause/cancel/resume"
duration: "2.3 minutes"
completed: 2026-02-06
---

# Phase 7 Plan 01: Export Task Engine Summary

**One-liner:** Export engine copies non-discarded files to year-based output folders with YYYYMMDD_HHMMSS.ext filenames and collision resolution

## What Shipped

The core export pipeline that transforms reviewed files into an organized output archive. Files are copied (never moved) to year-based subdirectories with standardized timestamps in filenames. Handles edge cases like files without timestamps (unknown/ subfolder), same-timestamp collisions (counter suffix), and supports pause/resume for long-running exports.

## Performance Metrics

- **Execution time:** 2.3 minutes
- **Tasks completed:** 2/2 (100%)
- **Commits:** 2 atomic commits
- **Files created:** 1 (app/lib/export.py)
- **Files modified:** 2 (app/tasks.py, app/routes/jobs.py)
- **Lines added:** ~470 lines

## Accomplishments

### Task 1: Export Library Module
**Commit:** `c0ddcfd` - feat(07-01): create export library module

Created `app/lib/export.py` with three core functions:

1. **`generate_output_filename(file_obj, output_base)`**
   - Converts File object to organized output path
   - Uses final_timestamp → detected_timestamp priority
   - Year subfolder: `output_base/YYYY/YYYYMMDD_HHMMSS.ext`
   - Unknown subfolder: `output_base/unknown/sanitized_filename.ext`
   - Preserves original extension (lowercase)

2. **`resolve_collision(output_path)`**
   - Detects filename collisions at target path
   - Adds counter suffix: `_001`, `_002`, etc.
   - Deterministic ordering (first processed gets base name)
   - Max 999 collisions (raises ValueError if exceeded)

3. **`copy_file_to_output(source_path, output_path)`**
   - Creates parent directory structure
   - Resolves collision before copy
   - Uses `shutil.copy2` to preserve filesystem metadata
   - Verifies copy (existence + size match)
   - Returns final path (after collision resolution)

**Key design:** Separation of concerns - `generate_output_filename` doesn't handle collisions, enabling deterministic ordering via sort before copy.

### Task 2: Export Huey Task and API Endpoint
**Commit:** `401982b` - feat(07-01): add export Huey task and API endpoint

Added `process_export_job()` Huey task to `app/tasks.py`:
- Follows exact same pattern as `process_import_job` for consistency
- Queries non-discarded files without `output_path` (resume support)
- Sorts by `final_timestamp → detected_timestamp → filename` (deterministic ordering)
- Batch commits every BATCH_COMMIT_SIZE files for performance
- Progress tracking: `progress_current`, `current_filename` for UI updates
- Pause/cancel/resume: checks `job.status` after each file
- Error threshold: uses `_should_halt_job()` pattern from import
- Sets `File.output_path` after successful copy (enables resume)

Added `enqueue_export_job(job_id)` helper for web routes.

Added `POST /api/jobs/:id/export` endpoint to `app/routes/jobs.py`:
- Validates source job is completed import job
- Creates new export Job with `job_type='export'`
- Associates same files as import job (via job_files table)
- Counts non-discarded files for reporting
- Enqueues export job via `enqueue_export_job()`
- Returns export `job_id`, `file_count`, `task_id`

**Key design:** Export as separate job type preserves import history and enables independent retry without re-processing.

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `c0ddcfd` | feat(07-01): create export library module |
| 2 | `401982b` | feat(07-01): add export Huey task and API endpoint |

## Files Created/Modified

### Created
- `app/lib/export.py` - Export library with filename generation and file copy functions

### Modified
- `app/tasks.py` - Added `process_export_job()` and `enqueue_export_job()`
- `app/routes/jobs.py` - Added `POST /api/jobs/:id/export` endpoint

## Decisions Made

1. **Year-based folder organization (YYYY/)**
   - **Context:** How to organize thousands of timestamped files
   - **Decision:** Single-level year folders (e.g., `2024/`, `2023/`)
   - **Rationale:** Balances human browsability (year navigation) with filesystem performance (hundreds of files per folder is fine)
   - **Alternatives considered:** Month subfolders (YYYY/MM/) felt too deep for household use
   - **Impact:** Simple, intuitive archive structure

2. **YYYYMMDD_HHMMSS.ext filename format**
   - **Context:** How to standardize filenames across entire archive
   - **Decision:** ISO-8601-like compact format without delimiters
   - **Rationale:** Sortable, unique per second, readable, no special characters
   - **Alternatives considered:** Delimited format (YYYY-MM-DD_HH-MM-SS) felt verbose
   - **Impact:** Clean, consistent naming across all exported files

3. **Counter suffix for collisions (_001, _002)**
   - **Context:** Multiple files with same timestamp (burst photos, format conversions)
   - **Decision:** Append counter to filename stem before extension
   - **Rationale:** Preserves timestamp in filename, deterministic ordering
   - **Alternatives considered:** Adding random suffix loses determinism, changing timestamp loses accuracy
   - **Impact:** Handles burst photos gracefully while maintaining chronological sorting

4. **unknown/ subfolder for files without timestamps**
   - **Context:** How to handle files where timestamp detection failed
   - **Decision:** Separate `unknown/` subfolder with original filenames
   - **Rationale:** Segregates files needing manual review from clean timestamped archive
   - **Alternatives considered:** Using filesystem mtime as fallback felt dishonest
   - **Impact:** Easy identification of files requiring timestamp assignment

5. **Export as separate job type**
   - **Context:** Should export be part of import job or separate?
   - **Decision:** Create new Job record with `job_type='export'`
   - **Rationale:** Preserves import job history, enables retry without re-import, independent progress tracking
   - **Alternatives considered:** Reusing import job muddles audit trail
   - **Impact:** Clear separation of concerns, robust retry behavior

6. **File.output_path tracks export status**
   - **Context:** How to track which files have been exported
   - **Decision:** Set `File.output_path` after successful copy, query `output_path.is_(None)` for resume
   - **Rationale:** Database field provides durable state for pause/resume
   - **Alternatives considered:** In-memory tracking loses state on cancel/crash
   - **Impact:** Robust handling of interrupted exports

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all functions implemented and tested successfully.

## Next Phase Readiness

**Phase 7 Plan 02 (Metadata Tagging)** is ready to proceed:
- Export engine provides `File.output_path` for metadata writing
- Output files exist on filesystem for EXIF/XMP writing
- Tag associations exist in database from Phase 4

**Blockers:** None

**Recommendations:**
- Plan 02 should handle metadata writing to exported files
- Consider both embedded metadata (EXIF/XMP) and sidecar files
- User decision needed: overwrite existing EXIF or preserve?

## Self-Check: PASSED

All created files exist:
- ✓ app/lib/export.py

All commits exist:
- ✓ c0ddcfd
- ✓ 401982b
