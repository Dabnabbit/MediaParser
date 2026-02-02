---
phase: 02-background-workers-core-processing
plan: 01
subsystem: core-algorithms
status: complete
tags: [hashing, confidence-scoring, timestamp-detection, duplicate-detection, models]

# Dependencies
requires:
  - phase: 01-foundation-architecture
    plan: 02
    reason: Database models and SQLAlchemy setup
  - phase: 01-foundation-architecture
    plan: 03
    reason: Timestamp and metadata library patterns

provides:
  - SHA256 hashing for exact duplicate detection
  - Perceptual hashing (dHash) for near-duplicate detection
  - Weighted confidence scoring for timestamp sources
  - Extended Job model with PAUSED/CANCELLED/HALTED statuses
  - File model with timestamp_candidates storage

affects:
  - phase: 02-background-workers-core-processing
    plan: 02+
    reason: File processing workers will use these algorithms
  - phase: 04-review-queue-correction
    reason: Confidence levels determine review queue filtering
  - phase: 05-duplicate-review
    reason: Perceptual hashing enables near-duplicate detection
  - phase: 06-output-organization
    reason: SHA256 prevents exact duplicate copying

# Technical Details
tech-stack:
  added:
    - imagehash (dHash algorithm for perceptual hashing)
    - hashlib.sha256 (HACL*-backed for exact duplicates)
  patterns:
    - Chunked file reading for memory-safe hashing
    - Weighted source scoring for confidence calculation
    - Graceful degradation (perceptual hash returns None for non-images)
    - Path | str type flexibility following Phase 1 patterns

key-files:
  created:
    - app/lib/hashing.py
    - app/lib/confidence.py
  modified:
    - app/models.py (JobStatus enum, File.timestamp_candidates, Job fields)
    - app/lib/__init__.py (exports)

decisions:
  - decision: Use dHash over pHash for perceptual hashing
    rationale: Faster computation, good for duplicate detection (per research)
    date: 2026-02-02
  - decision: Select earliest valid timestamp with min_year filter
    rationale: User decision from CONTEXT.md, filters out epoch dates
    date: 2026-02-02
  - decision: Store all timestamp candidates as JSON
    rationale: Enables Phase 4 review UI to show side-by-side comparison
    date: 2026-02-02
  - decision: Return None for perceptual hash on non-images
    rationale: Expected behavior, videos can use thumbnails in Phase 6
    date: 2026-02-02
  - decision: Add PAUSED/CANCELLED/HALTED statuses
    rationale: Enables graceful job control and error threshold halting
    date: 2026-02-02

# Metrics
metrics:
  duration: 100 seconds (~1.7 minutes)
  tasks-completed: 3
  files-created: 2
  files-modified: 2
  commits: 3
  completed: 2026-02-02
---

# Phase 2 Plan 1: Hashing and Confidence Scoring Summary

**One-liner:** SHA256 exact hashing with chunked reading, dHash perceptual hashing for images, weighted timestamp confidence scoring with source agreement detection

## What Was Built

Created two core algorithm libraries that enable background workers to process files:

1. **Hashing Library (`app/lib/hashing.py`)**
   - `calculate_sha256()`: Chunked file reading (64KB blocks) prevents memory issues with large videos
   - `calculate_perceptual_hash()`: dHash algorithm via imagehash for near-duplicate detection
   - Graceful fallback when imagehash unavailable or file is not an image

2. **Confidence Scoring Library (`app/lib/confidence.py`)**
   - `calculate_confidence()`: Weighted scoring based on timestamp source reliability
   - SOURCE_WEIGHTS dict defines priority (EXIF:DateTimeOriginal = 10, filename = 2-3, filesystem = 1)
   - Agreement detection: timestamps within 1 second tolerance boost confidence
   - Sanity filtering: configurable min_year (default 2000) filters out epoch dates
   - Returns selected timestamp + confidence level + all candidates for review UI

3. **Model Extensions (`app/models.py`)**
   - JobStatus enum: Added PAUSED, CANCELLED, HALTED for job control
   - File model: Added `timestamp_candidates` Text field for JSON storage
   - Job model: Added `current_filename` and `error_count` for progress/threshold tracking

## Architecture Decisions

**Confidence Algorithm:**
- **Selection strategy:** Earliest valid timestamp (user decision from CONTEXT.md)
- **Confidence levels:**
  - HIGH: EXIF source (weight >= 8) AND multiple sources agree
  - MEDIUM: Reliable source (weight >= 5) OR multiple sources agree
  - LOW: Filename only or low-weight source alone
  - NONE: No valid candidates after filtering
- **Agreement tolerance:** 1 second (accommodates rounding differences between sources)

**Hashing Strategy:**
- **SHA256:** Chunked reading (65536 bytes) for memory safety with large files
- **Perceptual hash:** dHash (faster than pHash, sufficient for duplicates per research)
- **Non-images:** Perceptual hash returns None (expected, videos deferred to Phase 6)

**Job Status Flow:**
- PENDING → RUNNING → {COMPLETED | FAILED | PAUSED | CANCELLED | HALTED}
- PAUSED: User-initiated, can resume
- CANCELLED: User-initiated, graceful stop
- HALTED: System-initiated when error rate exceeds threshold

## Implementation Highlights

**Type Safety:**
```python
def calculate_sha256(file_path: Path | str, chunk_size: int = 65536) -> str
def calculate_confidence(
    timestamp_candidates: List[Tuple[datetime, str]],
    min_year: int = 2000
) -> Tuple[Optional[datetime], ConfidenceLevel, List[Tuple[datetime, str]]]
```

**Chunked Hashing:**
```python
sha256 = hashlib.sha256()
with open(path, 'rb') as f:
    while chunk := f.read(chunk_size):
        sha256.update(chunk)
return sha256.hexdigest()
```

**Confidence Scoring:**
```python
# Filter by sanity floor
valid_candidates = [(dt, src) for dt, src in timestamp_candidates if dt.year >= min_year]
# Select earliest
selected_dt, selected_source = sorted(valid_candidates, key=lambda x: x[0])[0]
# Check agreement (within 1 second)
agreements = [dt for dt, src in valid_candidates if abs(dt - selected_dt) <= timedelta(seconds=1)]
# Score based on weight + agreement
if selected_weight >= 8 and len(agreements) > 1:
    confidence = ConfidenceLevel.HIGH
```

## Testing Notes

**Manual Verification:**
- All modules compile successfully (syntax checked with py_compile)
- Function signatures match plan specification
- SOURCE_WEIGHTS exported from confidence module
- New enum values and model fields present in app/models.py

**Integration Testing:**
- Phase 1 integration tests still pass (no breaking changes to existing models)
- Imports work correctly (app.lib exports hashing functions)

**Future Testing (Phase 2 Plan 02+):**
- Test calculate_sha256 with large video files (multi-GB)
- Test calculate_perceptual_hash with various image formats (JPEG, PNG, HEIC)
- Test confidence scoring with conflicting timestamps
- Test min_year filtering with epoch dates (1970-01-01)

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed

**Created:**
- `app/lib/hashing.py` (87 lines): SHA256 and perceptual hash functions
- `app/lib/confidence.py` (115 lines): Confidence scoring with SOURCE_WEIGHTS

**Modified:**
- `app/models.py` (+6 lines): JobStatus enum extensions, File.timestamp_candidates, Job progress fields
- `app/lib/__init__.py` (+9 lines): Export hashing functions

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| e4b7ac0 | feat(02-01): create hashing library module | app/lib/hashing.py, app/lib/__init__.py |
| ecacb1e | feat(02-01): create confidence scoring library module | app/lib/confidence.py |
| f632afd | feat(02-01): extend Job and File models for Phase 2 | app/models.py |

## Next Phase Readiness

**Blockers:** None

**Considerations for Phase 2 Plan 02 (File Processing Workers):**
1. **Database migration needed:** New model fields require migration (timestamp_candidates, current_filename, error_count)
2. **imagehash dependency:** Must be installed for perceptual hashing (`pip install imagehash pillow`)
3. **Timestamp candidate format:** Workers should store JSON array like `[{"datetime": "2024-01-15T12:00:00Z", "source": "EXIF:DateTimeOriginal"}, ...]`
4. **Error threshold:** Implement 10% threshold check using Job.error_count field
5. **Agreement tolerance:** Use 1 second tolerance from confidence.py when displaying timestamp conflicts in Phase 4 UI

**What's Ready:**
- ✓ Core algorithms implemented and tested for syntax
- ✓ Model schema extended for job control and progress tracking
- ✓ Confidence scoring supports review queue filtering (HIGH/MEDIUM/LOW/NONE)
- ✓ Perceptual hashing foundation ready for Phase 5/6 duplicate detection

**What's NOT Ready (out of scope for this plan):**
- Database migration script (Phase 2 Plan 02 should create Alembic migration)
- Worker task implementation (Phase 2 Plan 02+)
- Thread pool configuration (Phase 2 Plan 02+)
- Error threshold enforcement logic (Phase 2 Plan 02+)

---

**Plan Duration:** 1.7 minutes (3 tasks, 3 commits)
**Status:** Complete
**Next Plan:** 02-02 (File Processing Workers)
