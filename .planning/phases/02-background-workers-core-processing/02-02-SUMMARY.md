---
phase: 02-background-workers-core-processing
plan: 02
subsystem: core-processing
status: complete
tags: [file-processing, threading, pipeline, type-detection, orchestration]
requires: [02-01]
provides:
  - "Thread-safe file processing pipeline"
  - "Type mismatch detection via magic bytes"
  - "Orchestrated metadata/hash/confidence pipeline"
affects: [02-03, 02-04]
tech-stack:
  added:
    - "python-magic: File type detection via magic bytes"
  patterns:
    - "Thread-safe worker functions (return dict, no database)"
    - "Graceful dependency handling (magic optional)"
    - "Complete error containment (no raised exceptions)"
key-files:
  created:
    - "app/lib/processing.py"
  modified:
    - "app/lib/__init__.py"
decisions:
  - id: "PROC-01"
    decision: "Return dict from worker, main thread commits"
    rationale: "ThreadPoolExecutor workers cannot share SQLAlchemy sessions"
    impact: "Pattern for all future worker functions"
  - id: "PROC-02"
    decision: "Use python-magic for type detection, fallback gracefully"
    rationale: "Detect renamed executables masquerading as images"
    impact: "Security and robustness improvement"
  - id: "PROC-03"
    decision: "Normalize jpeg->jpg in type detection"
    rationale: "Common variation causes false mismatch warnings"
    impact: "Cleaner logs, fewer false positives"
metrics:
  duration: "1m 44s"
  tasks: 2
  commits: 2
  files-created: 1
  files-modified: 1
  completed: 2026-02-02
---

# Phase 02 Plan 02: Single File Processing Pipeline Summary

**One-liner:** Thread-safe file processing orchestrator with magic-based type detection, complete hash/metadata/confidence pipeline, dict-based results

## What Was Built

Created the single file processing pipeline that orchestrates all Phase 2 processing libraries into one thread-safe function callable from ThreadPoolExecutor workers.

**Core Implementation:**

1. **`detect_file_type_mismatch()`** - Magic byte type detection
   - Uses python-magic to inspect file contents
   - Compares magic bytes with file extension
   - Returns (extension, mime_type, is_mismatch) tuple
   - Gracefully handles missing python-magic (logs warning, falls back to extension)
   - Normalizes common variations (jpeg -> jpg)

2. **`process_single_file()`** - Complete processing pipeline
   - Thread-safe by design (no database access, no shared state)
   - Returns dict with all extracted data for main thread to commit
   - Pipeline steps:
     a. File validation (exists check, size, type mismatch detection)
     b. Calculate hashes (SHA256 always, perceptual for images)
     c. Extract timestamp candidates (EXIF via `get_best_datetime()`, filename via `get_datetime_from_name()`)
     d. Calculate confidence score (via `calculate_confidence()`)
     e. Serialize all candidates to JSON for database storage
     f. Return complete result dict
   - Error handling: Wraps entire function in try/except, returns status='error' dict
   - Logging: Debug for normal flow, warning for mismatches, error for exceptions

3. **Library exports** - Updated `app/lib/__init__.py`
   - Exported all library functions for consistency
   - Enables clean imports: `from app.lib import process_single_file`

**Thread Safety Design:**
- NO database access (no SQLAlchemy session, no db imports)
- NO shared state modification
- NO file writes to shared locations
- Returns dict for main thread to handle database commit
- This pattern will be used for all future worker functions

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create single file processing module | ad343dd | app/lib/processing.py |
| 2 | Add processing module to library exports | 9e6a0ce | app/lib/__init__.py |

## Decisions Made

**PROC-01: Return dict from worker, main thread commits**
- **Context:** ThreadPoolExecutor workers cannot share SQLAlchemy sessions safely
- **Decision:** Worker functions return dict results, main thread handles database commits
- **Rationale:** Eliminates thread safety concerns, simplifies error handling, enables retry logic
- **Impact:** All future worker functions must follow this pattern

**PROC-02: Use python-magic for type detection, fallback gracefully**
- **Context:** Need to detect executables/malware renamed to look like images
- **Decision:** Use python-magic to check magic bytes, log warning if not available
- **Rationale:** Security improvement (detect malicious files), robustness (catch corrupted files)
- **Impact:** Adds python-magic as optional dependency (pip install python-magic-bin on Windows)

**PROC-03: Normalize jpeg->jpg in type detection**
- **Context:** JPEG files can have .jpeg or .jpg extension
- **Decision:** Normalize both extension and detected type to 'jpg' for comparison
- **Rationale:** Common variation was causing false mismatch warnings
- **Impact:** Cleaner logs, fewer false positives, better user experience

## Integration Points

**Imports (dependencies):**
- `app.lib.hashing` → SHA256 and perceptual hash calculation
- `app.lib.confidence` → Confidence scoring algorithm
- `app.lib.metadata` → EXIF metadata extraction
- `app.lib.timestamp` → Filename datetime parsing
- `app.models` → ConfidenceLevel enum
- `magic` (optional) → Magic byte file type detection

**Exports (used by):**
- Phase 2 Plan 03: Worker functions will call `process_single_file()`
- Phase 2 Plan 04: Main thread receives dict results and commits to database

**Data Flow:**
```
File path (str/Path)
  ↓
process_single_file()
  ├→ detect_file_type_mismatch() → (extension, mime_type, is_mismatch)
  ├→ calculate_sha256() → sha256 hex string
  ├→ calculate_perceptual_hash() → perceptual hash or None
  ├→ get_best_datetime() → (datetime, source, confidence)
  ├→ get_datetime_from_name() → datetime or None
  ├→ calculate_confidence() → (selected_dt, confidence_level, all_candidates)
  ↓
Result dict (JSON-serializable)
  ↓
Main thread commits to database
```

## Testing Notes

**Not Tested Yet (requires integration tests in future plan):**
- Type mismatch detection with actual malicious files
- Perceptual hash on various image formats (PNG, HEIC, WebP)
- Error handling with corrupted files (truncated images, invalid EXIF)
- Performance with large video files (10GB+ files)
- Thread safety with concurrent workers (next plan will test)

**Manual Verification Done:**
- Module imports successfully (all dependencies present)
- Functions return dict format (checked return statements)
- No database imports (grep verified)
- Error handling present (try/except blocks)
- Library exports updated (grep verified)

## Known Limitations

1. **python-magic optional:** If not installed, falls back to extension-based detection (logs warning)
   - Recommendation: Add to requirements.txt for production
   - Windows users need: `pip install python-magic-bin`

2. **No streaming for large files:** Entire file read into memory for perceptual hash
   - Impact: May OOM with extremely large images (100MB+ uncompressed TIFFs)
   - Mitigation: calculate_perceptual_hash already handles errors gracefully (returns None)

3. **No video thumbnail extraction yet:** Videos return None for perceptual_hash
   - Expected behavior per plan
   - Phase 6 can add video thumbnail hashing if needed

4. **Single-threaded filename regex:** Imports VALID_DATE_REGEX inside function (local import)
   - Reason: Avoid circular import (timestamp already imported at module level)
   - Performance: Negligible (import is cached, only runs once per process)

## Deviations from Plan

**None** - Plan executed exactly as written.

All required functionality implemented:
- ✓ detect_file_type_mismatch() with python-magic
- ✓ process_single_file() orchestrates full pipeline
- ✓ Returns dict (no database access)
- ✓ Error handling (no raised exceptions)
- ✓ Library exports updated

## Next Phase Readiness

**Ready to proceed to Plan 02-03** (Worker Implementation)

**What's ready:**
- ✓ File processing pipeline implemented
- ✓ Thread-safe by design (no database access)
- ✓ Error handling complete (returns error dict)
- ✓ All dependencies available (hashing, metadata, confidence)

**What's needed for next plan:**
- Worker function that calls process_single_file() in ThreadPoolExecutor
- Job status updates (update Job record with progress)
- File record creation (commit result dict to File table)
- Error threshold detection (halt job after N failures)

**No blockers.**

---

**Phase Progress:** 2/4 plans complete (50%)
**Requirements Complete:** TIME-01 partial (algorithm ready, needs worker integration), TIME-06 preserved, PROC-01 partial (function ready, needs worker)
**Performance:** 1m 44s for 2 tasks (avg 52s/task)
