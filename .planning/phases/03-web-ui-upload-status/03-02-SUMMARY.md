---
phase: 03-web-ui-upload-status
plan: 02
subsystem: backend-api
tags: [flask, routes, blueprints, upload, file-handling, job-control, rest-api]

# Dependency graph
requires:
  - phase: 01-foundation-architecture
    provides: Flask app factory, database models (Job, File), task queue (enqueue_import_job)
  - phase: 02-background-workers
    provides: process_import_job worker, job status management
  - phase: 03-web-ui-upload-status
    plan: 01
    provides: HTML templates (index.html)
provides:
  - POST /api/upload endpoint for browser file upload
  - POST /api/import-path endpoint for server path import
  - GET /api/jobs/:id endpoint for job status queries
  - POST /api/jobs/:id/control endpoint for job control (pause/cancel/resume)
  - GET /api/jobs/:id/files endpoint with pagination and filtering
  - GET /api/jobs/:id/duplicates endpoint for duplicate detection
  - Main route '/' that renders index.html
affects: [03-03-progress-api, 03-04-results-display, 03-05-realtime-updates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flask Blueprint organization for API endpoints"
    - "secure_filename() sanitization for upload security"
    - "Job subdirectories for upload organization"
    - "State transition validation for job control"
    - "Paginated API responses with SQLAlchemy paginate()"

key-files:
  created:
    - app/routes/__init__.py
    - app/routes/upload.py
    - app/routes/jobs.py
  modified:
    - app/__init__.py

key-decisions:
  - "File upload creates job-specific subdirectories for better organization"
  - "Extension whitelist validation prevents invalid file types"
  - "Server path import scans recursively for media files"
  - "State transition validation ensures only valid control actions"
  - "Pagination for file lists prevents memory issues with large jobs"
  - "Duplicate detection via SHA256 hash grouping"

patterns-established:
  - "Blueprint route organization: upload routes, job routes, separate concerns"
  - "Error response format: {error: message} with appropriate HTTP status codes"
  - "Success response format: {job_id, file_count, status} for job creation"
  - "Job control validation: check current status before state transitions"
  - "Query parameter support: confidence filtering, pagination, grouping"

# Metrics
duration: 4min
completed: 2026-02-02
---

# Phase 03 Plan 02: Upload and Job Management Routes Summary

**Flask routes for file upload, server path import, job status queries, and job control actions with validation and security**

## Performance

- **Duration:** 3m 31s
- **Started:** 2026-02-02T19:29:47Z
- **Completed:** 2026-02-02T19:33:18Z
- **Tasks:** 3
- **Files modified:** 3 (created 2 route files, modified app/__init__.py)

## Accomplishments
- Complete upload API with browser file upload and server path import
- Job management API with status queries, control actions, and file listings
- Blueprint registration and main route setup
- Security measures: extension whitelist, secure_filename(), state validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create upload routes for file and path import** - `f3f113f` (feat)
2. **Task 2: Create job management routes** - `293584b` (feat)
3. **Task 3: Register blueprints and add main route** - No commit (already completed in 03-03)

## Files Created/Modified

### Created
- `app/routes/__init__.py` - Routes package initialization, exports upload_bp and jobs_bp (6 lines)
- `app/routes/upload.py` - File upload and server path import endpoints (228 lines)
- `app/routes/jobs.py` - Job status and control endpoints (293 lines)

### Modified
- `app/__init__.py` - Blueprint registration and main route (already present from 03-03 commit)

### Key Features

**Upload Routes (upload.py):**
- `POST /api/upload` - Browser file upload endpoint
  - Accepts multipart/form-data with 'files' field (multiple files)
  - Extension whitelist validation (jpg, jpeg, png, gif, heic, mp4, mov, avi, mkv)
  - secure_filename() sanitization for security
  - Creates job-specific subdirectory (job_{id}/) for organization
  - Creates File records with original_filename and storage_path
  - Creates Job record with job_type='import', status=PENDING
  - Enqueues job via enqueue_import_job(job_id)
  - Returns {job_id, file_count, status: 'queued'}

- `POST /api/import-path` - Server-side path import endpoint
  - Accepts JSON body: {path: '/path/to/folder'}
  - Validates path exists and is directory
  - Scans directory recursively for media files (same extensions as upload)
  - Creates File records with original_path (no copying - files stay in place)
  - Creates Job and enqueues for processing
  - Returns {job_id, file_count, status: 'queued'}

**Security measures:**
- Extension whitelist validation (prevents executable uploads)
- secure_filename() on all uploaded filenames (prevents directory traversal)
- Server path validation (must be absolute, must exist)
- Error handling with appropriate HTTP status codes (400/413/500)

**Job Routes (jobs.py):**
- `GET /api/jobs/:id` - Get job status and details
  - Returns job info: id, status, job_type, progress metrics
  - Calculates progress_percent = (current / total * 100)
  - Includes timestamps: created_at, started_at, completed_at
  - Returns 404 if job not found

- `POST /api/jobs/:id/control` - Job control actions
  - Accepts JSON body: {action: 'pause' | 'cancel' | 'resume'}
  - Validates current status allows action:
    - pause: Only valid if RUNNING
    - cancel: Valid if RUNNING/PAUSED/PENDING
    - resume: Only valid if PAUSED (re-enqueues job)
  - Returns updated job status
  - Returns 400 for invalid action or state transition

- `GET /api/jobs/:id/files` - Get job files with filtering
  - Query params: confidence, page, per_page (max 200), group_by
  - Supports confidence filtering (high/medium/low/none)
  - Supports grouping by confidence level (returns nested structure)
  - Paginated results with SQLAlchemy paginate()
  - Returns file metadata: id, filename, timestamp, confidence, hash

- `GET /api/jobs/:id/duplicates` - Get duplicate groups
  - Groups files by file_hash_sha256 for exact duplicates
  - Returns array of groups (each with array of files)
  - Includes file metadata and storage paths for comparison
  - Only includes groups with >1 file

**Main Route (app/__init__.py):**
- `GET /` - Main application route
  - Renders index.html template
  - Queries current job for session resume (RUNNING/PAUSED/PENDING)
  - Passes current_job to template for state restoration

**Storage Configuration:**
- THUMBNAILS_FOLDER configured in app.config
- Thumbnails directory created on app startup (storage/thumbnails/)

## Decisions Made

1. **Job-specific subdirectories for uploaded files**
   - Rationale: Prevents filename collisions, improves organization
   - Impact: Each upload job gets isolated subdirectory (job_{id}/)

2. **Extension whitelist validation**
   - Rationale: Security - prevents upload of executables or scripts
   - Impact: Only image/video formats accepted (jpg, png, gif, heic, mp4, mov, avi, mkv)

3. **Server path import scans recursively**
   - Rationale: User may have nested folder structures
   - Impact: Finds all media files in subdirectories, not just top level

4. **State transition validation for job control**
   - Rationale: Prevents invalid actions (can't pause completed job)
   - Impact: Returns 400 with allowed states, clear error messages

5. **Pagination with max 200 per_page**
   - Rationale: Large jobs could return thousands of files
   - Impact: Prevents memory exhaustion, ensures API responsiveness

6. **SHA256 hash grouping for duplicates**
   - Rationale: Exact duplicate detection (perceptual duplicates deferred to Phase 6)
   - Impact: Simple and fast duplicate detection for identical files

7. **Resume action re-enqueues job**
   - Rationale: Job may have been cancelled in worker, need to restart processing
   - Impact: Seamless resume from paused state

## Deviations from Plan

### Task 3: Blueprint registration already completed

**Found during:** Task 3 execution

**Issue:** app/__init__.py already had blueprint registration, main route, and thumbnails config from commit 5b27449 (03-03)

**Resolution:** No changes needed - Task 3 requirements already satisfied

**Rationale:** Plan 03-03 was executed before 03-02, likely by user or another agent. Work is functionally complete.

**Files affected:** app/__init__.py

**Commit:** N/A (no commit needed for Task 3)

**Classification:** Not a bug or missing feature - just execution order difference

## Issues Encountered

None - all tasks completed successfully. Task 3 was already complete from prior work.

## User Setup Required

None - no external service configuration required.

## Authentication Gates

None - all operations completed without authentication requirements.

## Next Phase Readiness

**Ready for next phase (03-03: Progress API):**
- Upload endpoints create jobs and enqueue for processing
- Job status endpoint provides progress tracking data
- Job control endpoint supports pause/cancel/resume
- File listing endpoint supports pagination and filtering

**Integration points established:**
- Upload routes integrate with models (Job, File) and tasks (enqueue_import_job)
- Job routes query database for status and files
- Main route renders index.html with current job context
- THUMBNAILS_FOLDER configured for thumbnail generation

**API contract defined:**
- Upload: POST /api/upload and POST /api/import-path return {job_id, file_count, status}
- Status: GET /api/jobs/:id returns progress metrics and timestamps
- Control: POST /api/jobs/:id/control with {action} returns updated status
- Files: GET /api/jobs/:id/files supports pagination and confidence filtering
- Duplicates: GET /api/jobs/:id/duplicates returns hash-grouped duplicate sets

**Technical notes:**
- Job subdirectories created in UPLOAD_FOLDER (storage/uploads/job_{id}/)
- Server path imports leave files in place (no copying to UPLOAD_FOLDER)
- Job control actions update database status; worker checks status on each file
- Duplicate detection currently exact only (SHA256); perceptual duplicates in Phase 6

**No blockers or concerns.**

---
*Phase: 03-web-ui-upload-status*
*Completed: 2026-02-02*
