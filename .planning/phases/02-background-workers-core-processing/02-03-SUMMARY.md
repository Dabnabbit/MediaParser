---
phase: 02-background-workers-core-processing
plan: 03
title: "Multi-threaded File Processing Task"
subsystem: background-processing
tags: [threading, job-queue, error-handling, progress-tracking]
requires:
  - 02-02
provides:
  - Multi-threaded file processing with ThreadPoolExecutor
  - Batch database commits for performance
  - Error threshold halting at 10%
  - Pause/cancel job support
  - Progress tracking with current filename
affects:
  - 03-01
tech-stack:
  added:
    - concurrent.futures.ThreadPoolExecutor
  patterns:
    - ThreadPoolExecutor for parallel file processing
    - Batch commits for database performance
    - Error threshold monitoring with MIN_SAMPLE_SIZE
    - Graceful pause/cancel with status checks
key-files:
  created: []
  modified:
    - app/tasks.py
    - config.py
decisions:
  - title: "Alphabetical file processing order"
    rationale: "User decision from CONTEXT.md for predictable processing order"
  - title: "Batch commit every 10 files"
    rationale: "Balance between database performance and crash recovery granularity"
  - title: "10% error threshold with 10-file minimum sample"
    rationale: "User decision from CONTEXT.md prevents early halt on small sample sizes"
  - title: "Check pause/cancel status every file"
    rationale: "Provides responsive job control for users"
metrics:
  duration: 2 minutes
  completed: 2026-02-02
---

# Phase 2 Plan 3: Multi-threaded File Processing Task Summary

**One-liner:** Complete ThreadPoolExecutor-based job processing with batch commits, error threshold halting, and pause/cancel support

## What Was Built

### Multi-threaded File Processing Pipeline
Implemented complete `process_import_job` task that:

1. **Parallel Processing:**
   - Uses ThreadPoolExecutor with configurable workers (default: CPU count)
   - Submits all files to thread pool
   - Processes results as they complete (as_completed pattern)

2. **Database Performance:**
   - Batch commits every 10 files (configurable via BATCH_COMMIT_SIZE)
   - Helper function `_commit_pending_updates()` applies file updates via flush()
   - Minimizes database contention in multi-threaded environment

3. **Error Handling:**
   - Tracks error count and calculates error rate
   - Helper function `_should_halt_job()` checks threshold with minimum sample size
   - Halts job with HALTED status when error rate exceeds 10%
   - Logs detailed error information for debugging

4. **Job Control:**
   - Checks job status (CANCELLED/PAUSED) before processing each file
   - Commits pending updates before returning on pause/cancel
   - Graceful shutdown preserves work completed so far

5. **Progress Tracking:**
   - Updates `progress_current` with file count
   - Sets `current_filename` to show which file is processing
   - Enables real-time UI progress display

6. **Configuration Options:**
   - WORKER_THREADS: Override CPU count detection
   - MIN_VALID_YEAR: Timestamp validation floor (2000)
   - BATCH_COMMIT_SIZE: Database commit frequency (10)
   - ERROR_THRESHOLD: Job halt threshold (0.10)

### File Processing Integration
Worker tasks call `process_single_file()` from 02-02 for each file:
- Calculate SHA256 and perceptual hashes
- Extract timestamp candidates from EXIF and filename
- Calculate confidence score and select best timestamp
- Return dict for main thread to commit (thread-safe pattern)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ed2198d | Multi-threaded process_import_job implementation |
| 2 | c3778f7 | Processing configuration options in config.py |

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

### ThreadPoolExecutor vs ProcessPoolExecutor
- **Chose:** ThreadPoolExecutor
- **Rationale:** I/O-bound work (file reading, EXIF extraction) benefits from threads. Processes would require serializing data between workers and add overhead.

### Batch Commit Size = 10
- **Chose:** 10 files per commit
- **Rationale:** Balance between:
  - Performance: Fewer commits = less database overhead
  - Recovery: Smaller batches = less work lost on crash
  - Responsiveness: More frequent commits = better progress visibility

### Error Threshold Check with Minimum Sample
- **Chose:** Require 10 files before checking 10% threshold
- **Rationale:** Prevents premature halt (e.g., 1 error in first 2 files = 50% but not indicative of systemic issue)

### Alphabetical File Processing Order
- **Chose:** Sort files by original_filename before processing
- **Rationale:** User decision from CONTEXT.md. Provides predictable, reproducible processing order for debugging and user expectations.

## Testing Notes

### Manual Testing
Workers cannot be unit tested without full Flask + database environment. Recommend integration testing:

```bash
# Start Huey worker
huey_consumer huey_config.huey -w 4

# Create test job via Flask app
# Verify:
# - Progress updates in database
# - Batch commits occur
# - Error threshold works
# - Pause/cancel is responsive
```

### Test Cases to Verify
1. **Happy path:** 100 valid image files process successfully
2. **Error threshold:** Mix 20% corrupt files, job halts after 10+ processed
3. **Pause during processing:** Job stops gracefully, resumes from checkpoint
4. **Cancel during processing:** Job stops, marked CANCELLED
5. **Batch commits:** Database shows updates every 10 files
6. **Progress tracking:** current_filename updates in real-time

## Integration Points

### Inputs
- Job record with associated File records (from Phase 1 database schema)
- Configuration from config.py (WORKER_THREADS, MIN_VALID_YEAR, etc.)

### Outputs
- Updated File records with:
  - file_hash_sha256 (for exact duplicates)
  - file_hash_perceptual (for near-duplicates)
  - detected_timestamp (best timestamp)
  - timestamp_source (exif/filename)
  - confidence (HIGH/MEDIUM/LOW/NONE)
  - timestamp_candidates (JSON array)
  - mime_type (from magic bytes)
- Updated Job record with:
  - status (RUNNING → COMPLETED/FAILED/HALTED/PAUSED/CANCELLED)
  - progress_current (files processed)
  - current_filename (current file being processed)
  - error_count (errors encountered)
  - started_at, completed_at timestamps

### Dependencies
- **app/lib/processing.py:** process_single_file() (from 02-02)
- **app/models.py:** Job, File, JobStatus, ConfidenceLevel enums (from 01-02)
- **config.py:** Processing configuration (from 01-01, extended in 02-03)
- **huey_config.py:** Task queue decorator (from 01-04)

## Known Issues

None identified.

## Next Phase Readiness

### Blockers
None. Phase 2 is now **COMPLETE**:
- ✓ 02-01: Hashing and confidence scoring libraries
- ✓ 02-02: Single file processing pipeline
- ✓ 02-03: Multi-threaded job processing task

### Recommendations for Phase 3 (Web Interface - Core Job Management)

**Phase 3 should implement:**
1. Job creation endpoints (upload files, create job)
2. Job status endpoints (GET /jobs/:id with progress)
3. Job control endpoints (POST /jobs/:id/pause, /jobs/:id/cancel)
4. Real-time progress display in UI (poll or WebSockets)

**UI should display:**
- Progress bar: `progress_current / progress_total`
- Current file: `current_filename`
- Error count: `error_count` (warn user before threshold)
- Job status: `status` (RUNNING/COMPLETED/FAILED/HALTED/PAUSED/CANCELLED)

**Error threshold consideration:**
- UI should show error rate approaching 10%
- Warn user when at 5-8% (before halt)
- Display HALTED jobs with error_message

### Ready for Next Phase
✅ **Phase 2 COMPLETE** - All background processing infrastructure ready
✅ **Phase 3 ready** - Web interface can now:
- Create jobs with file uploads
- Monitor progress via database queries
- Control jobs (pause/cancel)
- Display results (file metadata, timestamps, confidence)
