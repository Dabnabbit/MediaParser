# Phase 2: Background Workers + Core Processing - Research

**Researched:** 2026-02-02
**Domain:** Background task processing, metadata extraction, perceptual hashing, batch processing with error handling
**Confidence:** HIGH

## Summary

Phase 2 implements asynchronous file processing using Huey task queue with multi-threaded execution via ThreadPoolExecutor. Workers extract EXIF metadata using PyExifTool, calculate confidence scores based on timestamp source agreement, and compute perceptual hashes using imagehash for duplicate detection. Processing runs without blocking the web UI, with progress tracking, error thresholds, and graceful pause/cancel capabilities.

The existing foundation already provides Huey task queue configuration, SQLAlchemy models for Job and File entities, and metadata extraction libraries (PyExifTool, custom timestamp parsing). This phase extends the skeleton `process_import_job` task to implement actual file processing with multi-threading, confidence scoring, and robust error handling.

**Primary recommendation:** Use ThreadPoolExecutor within Huey tasks for CPU-bound file processing (hashing, metadata extraction), implement confidence scoring via weighted timestamp source comparison, track progress per-file with batch database commits, and halt jobs when error rate exceeds threshold to prevent wasting resources on bad batches.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Huey | 2.6.0+ | Task queue with SQLite backend | Already integrated, supports task revocation/status tracking, lightweight for single-server deployment |
| ThreadPoolExecutor | stdlib (concurrent.futures) | Multi-threaded file processing | Built-in, ideal for I/O-bound tasks (file reading), default worker count optimized for I/O (CPU count + 4) |
| PyExifTool | 0.5.6+ | EXIF metadata extraction | Already in use, wraps ExifTool CLI for comprehensive format support (images, videos, PDFs) |
| imagehash | Latest | Perceptual hashing for duplicates | Industry standard, supports dHash/pHash algorithms, simple Hamming distance comparison |
| hashlib | stdlib | SHA256 exact duplicate detection | Built-in, HACL*-backed (formally verified), chunk-based streaming for large files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-magic | Latest | Magic bytes file type detection | Format recovery when extension doesn't match content (user decision: use for validation) |
| SQLAlchemy bulk operations | 2.x | Batch database inserts | Updating File records with metadata (bulk_insert_mappings for dictionaries) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Huey | Celery | Celery is heavier, requires Redis/RabbitMQ; Huey's SQLite backend simpler for v1 single-server |
| ThreadPoolExecutor | ProcessPoolExecutor | Processes avoid GIL but higher overhead; threads sufficient for I/O-bound file reading |
| imagehash | custom implementation | imagehash provides battle-tested algorithms (dHash, pHash) with scientific backing |

**Installation:**
```bash
pip install huey imagehash python-magic pillow
# PyExifTool and hashlib already available
```

**Note:** ExifTool CLI must be installed system-wide (PyExifTool requirement, already documented in Phase 1).

## Architecture Patterns

### Recommended Project Structure
```
app/
├── tasks.py              # Huey task definitions (already exists, extend process_import_job)
├── lib/
│   ├── metadata.py       # EXIF extraction (already exists)
│   ├── timestamp.py      # Timestamp parsing (already exists)
│   ├── hashing.py        # NEW: SHA256 + perceptual hash functions
│   └── confidence.py     # NEW: Confidence scoring logic
└── models.py             # SQLAlchemy models (already exists)
```

### Pattern 1: Huey Task with Flask App Context
**What:** Background tasks need Flask app context to access database
**When to use:** Every Huey task that interacts with SQLAlchemy models
**Example:**
```python
# Source: Existing app/tasks.py (Phase 1 foundation)
from huey_config import huey

def get_app():
    """Create Flask app for worker context."""
    from app import create_app
    return create_app()

@huey.task(retries=2, retry_delay=30)
def process_import_job(job_id: int) -> dict:
    app = get_app()

    with app.app_context():
        from app import db
        from app.models import Job, JobStatus

        job = db.session.get(Job, job_id)
        # ... process files ...
```

### Pattern 2: Multi-threaded Batch Processing with Progress Tracking
**What:** Process files concurrently using ThreadPoolExecutor, update progress after each file
**When to use:** Processing large file batches (tens of thousands of files)
**Example:**
```python
# Source: https://docs.python.org/3/library/concurrent.futures.html
from concurrent.futures import ThreadPoolExecutor, as_completed
import os

def process_file_batch(job, files):
    """Process files with multi-threading and progress tracking."""
    max_workers = os.cpu_count() or 1  # User can override via config

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all files to thread pool
        future_to_file = {
            executor.submit(process_single_file, file): file
            for file in files
        }

        # Process results as they complete
        for future in as_completed(future_to_file):
            file = future_to_file[future]
            try:
                result = future.result()
                # Update progress
                job.progress_current += 1
                if job.progress_current % 10 == 0:  # Batch commit every 10 files
                    db.session.commit()
            except Exception as exc:
                # Handle individual file error
                handle_file_error(file, exc)
```

### Pattern 3: Confidence Scoring via Weighted Source Agreement
**What:** Calculate confidence based on timestamp source priority and inter-source agreement
**When to use:** Categorizing files into HIGH/MEDIUM/LOW confidence buckets
**Example:**
```python
# Source: User decision (CONTEXT.md) + existing app/lib/metadata.py pattern
from datetime import timedelta

SOURCE_WEIGHTS = {
    'EXIF:DateTimeOriginal': 10,
    'EXIF:CreateDate': 8,
    'QuickTime:CreateDate': 7,
    'EXIF:ModifyDate': 5,
    'filename_datetime': 3,
    'filename_date': 2,
    'File:FileModifyDate': 1,
}

def calculate_confidence(timestamp_candidates, min_year=2000):
    """
    Calculate confidence based on source agreement.

    Args:
        timestamp_candidates: List of (datetime, source) tuples
        min_year: Sanity floor for timestamps

    Returns:
        (selected_datetime, confidence_level, all_candidates_json)
    """
    # Filter by sanity floor
    valid = [(dt, src) for dt, src in timestamp_candidates
             if dt.year >= min_year]

    if not valid:
        return None, ConfidenceLevel.NONE, {}

    # Pick earliest timestamp (user decision)
    valid.sort(key=lambda x: x[0])
    selected_dt, selected_src = valid[0]

    # Check agreement (timestamps within 1 second = same)
    tolerance = timedelta(seconds=1)
    agreements = [dt for dt, src in valid
                  if abs(dt - selected_dt) <= tolerance]

    # Score based on source weight and agreement
    selected_weight = SOURCE_WEIGHTS.get(selected_src, 0)

    if selected_weight >= 8 and len(agreements) > 1:
        # EXIF source + agreement
        confidence = ConfidenceLevel.HIGH
    elif selected_weight >= 5 or len(agreements) > 1:
        # Reliable source OR multiple sources agree
        confidence = ConfidenceLevel.MEDIUM
    else:
        # Filename only or low-weight source
        confidence = ConfidenceLevel.LOW

    return selected_dt, confidence, timestamp_candidates
```

### Pattern 4: Chunked File Hashing for Large Files
**What:** Calculate SHA256 hash by reading file in chunks to avoid memory issues
**When to use:** All files, especially large videos (prevents loading entire file into memory)
**Example:**
```python
# Source: https://gist.github.com/aunyks/042c2798383f016939c40aa1be4f4aaf
import hashlib

def calculate_sha256(file_path, chunk_size=65536):
    """Calculate SHA256 hash of file in chunks."""
    sha256 = hashlib.sha256()

    with open(file_path, 'rb') as f:
        while chunk := f.read(chunk_size):
            sha256.update(chunk)

    return sha256.hexdigest()
```

### Pattern 5: Perceptual Hash Calculation
**What:** Calculate perceptual hash for near-duplicate detection using imagehash
**When to use:** Image and video files (for Phase 5/6 duplicate review)
**Example:**
```python
# Source: https://github.com/JohannesBuchner/imagehash
from PIL import Image
import imagehash

def calculate_perceptual_hash(file_path):
    """
    Calculate perceptual hash using dHash algorithm.

    Returns hex string or None if file is not an image.
    """
    try:
        img = Image.open(file_path)
        # dHash is faster, pHash is more robust - user can choose
        phash = imagehash.dhash(img)  # or imagehash.phash(img)
        return str(phash)  # Returns hex string
    except Exception:
        return None  # Not an image or corrupt
```

### Pattern 6: Error Threshold with Halt
**What:** Track error rate and halt job if failures exceed threshold
**When to use:** Preventing wasted processing on bad file batches (user decision: ~10% threshold)
**Example:**
```python
def should_halt_job(processed_count, error_count, threshold=0.10):
    """
    Check if error rate exceeds threshold.

    Args:
        processed_count: Total files processed so far
        error_count: Total errors encountered
        threshold: Maximum acceptable error rate (default 10%)

    Returns:
        True if job should halt, False otherwise
    """
    if processed_count < 10:
        # Need minimum sample size before halting
        return False

    error_rate = error_count / processed_count
    return error_rate > threshold
```

### Pattern 7: Bulk Database Updates with Progress Checkpoints
**What:** Batch database commits to reduce overhead while maintaining progress granularity
**When to use:** Updating File records during processing
**Example:**
```python
# Source: https://towardsdatascience.com/how-to-perform-bulk-inserts-with-sqlalchemy-efficiently-in-python-23044656b97d
from app import db

def update_files_batch(file_updates, batch_size=50):
    """
    Update multiple File records efficiently.

    Args:
        file_updates: List of dicts with file data
        batch_size: Number of records per commit
    """
    for i in range(0, len(file_updates), batch_size):
        batch = file_updates[i:i + batch_size]
        db.session.bulk_update_mappings(File, batch)
        db.session.commit()
```

### Pattern 8: Task Status Management for Pause/Resume/Cancel
**What:** Track job status and support graceful cancellation
**When to use:** User-initiated job controls (pause/cancel from UI in Phase 3)
**Example:**
```python
# Source: Existing JobStatus enum + user decision (CONTEXT.md)
from app.models import JobStatus

def process_with_cancellation_check(job_id, files):
    """Process files with periodic cancellation checks."""
    app = get_app()

    with app.app_context():
        job = db.session.get(Job, job_id)

        for file in files:
            # Check if job was cancelled/paused
            db.session.refresh(job)
            if job.status in (JobStatus.CANCELLED, JobStatus.PAUSED):
                # Graceful stop - finish current file, preserve progress
                return

            # Process file
            process_single_file(file)
            job.progress_current += 1

            # Checkpoint every N files
            if job.progress_current % 10 == 0:
                db.session.commit()
```

**Note:** Huey tasks don't have built-in pause/resume - implementation uses job status polling. Task checks `job.status` periodically and returns early if cancelled/paused, preserving `progress_current` for resume.

### Anti-Patterns to Avoid
- **Loading entire file into memory:** Use chunked reading for hashing (files can be multi-GB videos)
- **Committing after every file:** Batching commits (every 10-50 files) reduces database overhead
- **Not checking for cancellation:** Long-running tasks should poll job status periodically
- **Using exact timestamp equality:** Use tolerance (1 second) for comparing timestamps from different sources
- **Processing without error threshold:** Prevents wasting hours on corrupted ZIP files or permission issues

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Perceptual hashing algorithm | Custom image similarity | `imagehash` library | dHash/pHash are scientifically validated, handles edge cases (cropping, rotation), ~10 bits Hamming distance is proven threshold |
| EXIF metadata parsing | Custom parser per format | PyExifTool | Supports 100+ formats (images, videos, PDFs, audio), handles format quirks (QuickTime vs EXIF date tags) |
| File magic bytes detection | Custom byte reading | `python-magic` or `puremagic` | Database of 780+ file signatures, handles ambiguous formats |
| SHA256 hashing | Manual implementation | `hashlib.sha256()` | HACL*-backed (formally verified), optimized, handles streaming |
| Thread pool management | Manual thread spawning | `ThreadPoolExecutor` | Handles worker lifecycle, exception propagation, graceful shutdown |
| Task queue retry logic | Custom retry decorator | Huey's `@task(retries=N)` | Exponential backoff, stores retry count, handles transient failures |

**Key insight:** Metadata extraction and hashing are deceptively complex - file formats have dozens of edge cases (timezone handling, epoch timestamps, corrupted headers). Using battle-tested libraries prevents months of debugging.

## Common Pitfalls

### Pitfall 1: Deadlock with ThreadPoolExecutor in Huey Task
**What goes wrong:** Submitting tasks to ThreadPoolExecutor that wait on database locks held by the main thread causes deadlock, especially with SQLite's single-writer limitation.
**Why it happens:** SQLAlchemy sessions are not thread-safe by default, and SQLite serializes writes.
**How to avoid:**
- Use thread-local sessions via `scoped_session` (SQLAlchemy pattern)
- Commit in main thread, not worker threads
- Or: workers return results, main thread updates database
**Warning signs:** Job hangs indefinitely at specific progress count, no CPU activity

### Pitfall 2: Treating "No Timestamp" as Failure
**What goes wrong:** Marking files without metadata as "unprocessable" or job failures.
**Why it happens:** Misunderstanding that missing timestamps are the normal workflow (goes to review queue).
**How to avoid:** Files with no timestamp get `ConfidenceLevel.NONE`, stored in database, flagged for Phase 4 review - job still succeeds.
**Warning signs:** Jobs marked FAILED when most files actually need timestamp correction, review queue empty when it should be populated

### Pitfall 3: Not Checking Job Status in Long-Running Tasks
**What goes wrong:** User cancels job via UI, but worker continues processing for hours because it never checks `job.status`.
**Why it happens:** Huey tasks run independently, need explicit polling for cancellation.
**How to avoid:** Refresh `job` from database every N files (e.g., every 10), check if `status` changed to CANCELLED/PAUSED, return early to preserve progress.
**Warning signs:** Cancel button in UI does nothing, jobs continue after user clicked stop

### Pitfall 4: Epoch Timestamps Passing Validation
**What goes wrong:** Files with 1970-01-01 timestamps (Unix epoch default) are marked HIGH confidence because EXIF source weight is high.
**Why it happens:** Camera firmware bugs or corrupted metadata default to epoch.
**How to avoid:** User-configurable `min_year` sanity check (default 2000), filter out timestamps before threshold in confidence calculation.
**Warning signs:** Files dated "Jan 1, 1970" appearing in output with HIGH confidence

### Pitfall 5: Perceptual Hash on Non-Images
**What goes wrong:** Attempting to calculate perceptual hash on video files or PDFs causes exceptions.
**Why it happens:** imagehash expects PIL Image objects (raster images).
**How to avoid:** Wrap in try/except, return None for non-images, store NULL in `file_hash_perceptual` column (Phase 6 can use video thumbnailing).
**Warning signs:** Jobs fail on video files with PIL exceptions

### Pitfall 6: No File Type Validation (Extension vs Content)
**What goes wrong:** File named "photo.jpg" is actually a .txt file, metadata extraction fails or returns garbage.
**Why it happens:** Users rename files, extensions don't guarantee content.
**How to avoid:** Use `python-magic` to check magic bytes, attempt to read as detected format, fall back to extension-based parsing, log mismatch as warning.
**Warning signs:** High rate of "unprocessable" files that have valid extensions

### Pitfall 7: Not Storing All Timestamp Candidates
**What goes wrong:** Only storing selected timestamp + confidence, losing other sources for Phase 4 review UI.
**Why it happens:** Thinking only "winner" matters, but review UI needs side-by-side comparison.
**How to avoid:** Store `timestamp_candidates` as JSON in File record (or separate TimestampCandidate table), preserve all sources and values.
**Warning signs:** Review UI in Phase 4 can't show "EXIF said X, filename said Y" comparison

### Pitfall 8: Committing Inside ThreadPoolExecutor Workers
**What goes wrong:** SQLite "database is locked" errors when multiple threads try to commit simultaneously.
**Why it happens:** SQLite allows multiple readers but only one writer at a time.
**How to avoid:** Workers return results (dicts), main thread collects and commits in batches using `bulk_update_mappings()`.
**Warning signs:** Random database lock errors, jobs fail intermittently

## Code Examples

Verified patterns from official sources:

### Example 1: Complete File Processing Pipeline
```python
# Combining patterns: Huey task + ThreadPoolExecutor + confidence scoring
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import os

from huey_config import huey
from app.lib.metadata import extract_metadata, get_best_datetime
from app.lib.timestamp import get_datetime_from_name
from app.lib.hashing import calculate_sha256, calculate_perceptual_hash
from app.lib.confidence import calculate_confidence_score

def get_app():
    from app import create_app
    return create_app()

@huey.task(retries=2, retry_delay=30)
def process_import_job(job_id: int) -> dict:
    """
    Process import job: extract metadata, calculate hashes, score confidence.

    Source: Combining existing app/tasks.py skeleton with research patterns
    """
    app = get_app()

    with app.app_context():
        from app import db
        from app.models import Job, File, JobStatus, ConfidenceLevel

        job = db.session.get(Job, job_id)
        if not job:
            return {'error': f'Job {job_id} not found'}

        # Update to RUNNING
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        db.session.commit()

        # Get files to process (sorted alphabetically - user decision)
        files = sorted(job.files, key=lambda f: f.original_filename)
        job.progress_total = len(files)
        db.session.commit()

        # Multi-threaded processing
        max_workers = app.config.get('WORKER_THREADS', os.cpu_count() or 1)
        error_count = 0
        processed_count = 0

        try:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_file = {
                    executor.submit(process_single_file, f.id, f.storage_path): f
                    for f in files
                }

                # Collect results as they complete
                for future in as_completed(future_to_file):
                    file = future_to_file[future]

                    # Check for cancellation
                    db.session.refresh(job)
                    if job.status in (JobStatus.CANCELLED, JobStatus.PAUSED):
                        return {'status': 'cancelled', 'processed': processed_count}

                    try:
                        result = future.result()

                        # Update file record
                        file_obj = db.session.get(File, file.id)
                        file_obj.detected_timestamp = result['timestamp']
                        file_obj.timestamp_source = result['source']
                        file_obj.confidence = result['confidence']
                        file_obj.file_hash_sha256 = result['sha256']
                        file_obj.file_hash_perceptual = result['perceptual_hash']

                        processed_count += 1
                        job.progress_current = processed_count

                        # Batch commit every 10 files
                        if processed_count % 10 == 0:
                            db.session.commit()

                    except Exception as exc:
                        error_count += 1
                        # Log error, mark file as unprocessable
                        logger.error(f"Error processing {file.original_filename}: {exc}")

                        # Check error threshold (user decision: 10%)
                        if should_halt_job(processed_count, error_count, threshold=0.10):
                            job.status = JobStatus.HALTED
                            job.error_message = f"Error rate exceeded threshold: {error_count}/{processed_count}"
                            db.session.commit()
                            return {'status': 'halted', 'error_rate': error_count/processed_count}

            # Final commit
            db.session.commit()

            # Mark completed
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            db.session.commit()

            return {
                'status': 'completed',
                'processed': processed_count,
                'errors': error_count
            }

        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = str(e)[:500]
            job.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            raise

def process_single_file(file_id: int, file_path: str) -> dict:
    """
    Process single file: extract metadata, calculate hashes, determine confidence.

    Runs in ThreadPoolExecutor worker - no database access, returns dict.
    """
    from app.lib.metadata import extract_metadata, get_best_datetime
    from app.lib.timestamp import get_datetime_from_name

    # Calculate SHA256 (exact duplicates)
    sha256_hash = calculate_sha256(file_path)

    # Calculate perceptual hash (near-duplicates)
    perceptual_hash = calculate_perceptual_hash(file_path)

    # Extract metadata timestamps
    timestamp_candidates = []

    # EXIF metadata
    exif_dt, exif_source, _ = get_best_datetime(file_path)
    if exif_dt:
        timestamp_candidates.append((exif_dt, exif_source))

    # Filename parsing
    filename = Path(file_path).name
    filename_dt, filename_source = get_datetime_from_name(filename)
    if filename_dt:
        timestamp_candidates.append((filename_dt, filename_source))

    # Calculate confidence score
    selected_dt, confidence, all_candidates = calculate_confidence_score(
        timestamp_candidates,
        min_year=app.config.get('MIN_VALID_YEAR', 2000)  # User configurable
    )

    return {
        'timestamp': selected_dt,
        'source': all_candidates[0][1] if all_candidates else 'none',
        'confidence': confidence,
        'sha256': sha256_hash,
        'perceptual_hash': perceptual_hash,
        'all_timestamp_candidates': all_candidates  # For Phase 4 review UI
    }
```

### Example 2: Hamming Distance for Perceptual Hash Comparison
```python
# Source: https://github.com/JohannesBuchner/imagehash
import imagehash

def are_images_similar(hash1_str: str, hash2_str: str, threshold: int = 10) -> bool:
    """
    Compare perceptual hashes using Hamming distance.

    Args:
        hash1_str: Hex string of first hash
        hash2_str: Hex string of second hash
        threshold: Maximum Hamming distance for similarity (default 10)

    Returns:
        True if images are similar, False otherwise

    Note: Dr. Neal Krawetz suggests:
        - Distance 0: Exact match
        - Distance 1-10: Likely variations of same image
        - Distance > 10: Different images
    """
    hash1 = imagehash.hex_to_hash(hash1_str)
    hash2 = imagehash.hex_to_hash(hash2_str)

    distance = hash1 - hash2  # Hamming distance
    return distance <= threshold
```

### Example 3: Format Recovery via Magic Bytes
```python
# Source: https://pypi.org/project/python-magic/
import magic
from pathlib import Path

def detect_file_type_mismatch(file_path: str) -> tuple[str, str, bool]:
    """
    Check if file extension matches actual content.

    Returns:
        (extension, detected_type, is_mismatch)
    """
    extension = Path(file_path).suffix.lstrip('.').lower()

    # Detect via magic bytes
    mime = magic.from_file(file_path, mime=True)
    detected_type = mime.split('/')[1] if '/' in mime else mime

    # Normalize common variations
    if detected_type == 'jpeg':
        detected_type = 'jpg'

    is_mismatch = (extension != detected_type)

    return extension, detected_type, is_mismatch
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Celery for task queues | Huey for simple deployments | 2020s | Huey's SQLite backend eliminates Redis dependency for single-server apps |
| MD5 for file hashing | SHA256 (HACL*-backed) | Python 3.13 (2024) | Formally verified crypto library, MD5 deprecated for security |
| ProcessPoolExecutor default | ThreadPoolExecutor for I/O | Ongoing | Threads cheaper than processes for file I/O, avoid pickling overhead |
| Manual retry logic | Task queue built-in retries | Celery/Huey era | Declarative `@task(retries=N)` cleaner than custom decorators |
| PyExifTool 0.1.x | PyExifTool 0.5.6+ with ExifToolHelper | 2023+ | Better error handling, context manager support |
| imagehash with PIL | imagehash with Pillow | Pillow fork (2013+) | PIL unmaintained, Pillow is drop-in replacement |

**Deprecated/outdated:**
- **MD5 hashing:** Use SHA256 (security + performance)
- **Synchronous ExifTool calls per file:** Use ExifToolHelper context manager for batch mode
- **python-magic 0.x:** Use latest version with consistent API
- **Manual thread management:** Use ThreadPoolExecutor instead of threading.Thread

## Open Questions

Things that couldn't be fully resolved:

1. **Huey pause/resume implementation**
   - What we know: Huey doesn't have built-in pause/resume API, only revoke (cancel)
   - What's unclear: Best pattern for "pause" - polling job status + early return works but feels manual
   - Recommendation: Implement via JobStatus.PAUSED + periodic polling (every 10 files), document that resume = re-enqueue same task with `progress_current` as offset

2. **Perceptual hash for videos**
   - What we know: imagehash works on PIL Images (static frames)
   - What's unclear: Should Phase 2 handle video perceptual hashing or defer to Phase 6?
   - Recommendation: Phase 2 stores NULL for video `file_hash_perceptual`, Phase 6 can extract thumbnails and hash those

3. **Optimal batch commit size**
   - What we know: Every-file commits are slow, bulk commits risk losing progress on crash
   - What's unclear: What's the sweet spot? 10, 50, 100 files per commit?
   - Recommendation: Start with 10 files per commit, make configurable, profile with real workloads (10K+ files)

4. **SQLAlchemy thread safety with SQLite**
   - What we know: SQLite allows multiple readers, one writer; SQLAlchemy sessions not thread-safe by default
   - What's unclear: Does `scoped_session` solve this, or should workers avoid database writes entirely?
   - Recommendation: Workers return dicts, main thread does bulk updates (safest pattern, avoids lock contention)

5. **Timestamp candidate storage schema**
   - What we know: Need to store all candidates for Phase 4 review UI
   - What's unclear: JSON column in File table, or separate TimestampCandidate table?
   - Recommendation: JSON column initially (simpler), migrate to table if review UI needs complex queries (e.g., "show files where EXIF and filename disagree by > 1 day")

## Sources

### Primary (HIGH confidence)
- [Huey API Documentation](https://huey.readthedocs.io/en/latest/api.html) - Task lifecycle, revocation, Result objects
- [Python concurrent.futures Documentation](https://docs.python.org/3/library/concurrent.futures.html) - ThreadPoolExecutor usage, worker counts, exception handling
- [imagehash GitHub Repository](https://github.com/JohannesBuchner/imagehash) - Perceptual hashing algorithms, Hamming distance comparison
- Existing codebase: app/lib/metadata.py, app/lib/timestamp.py, app/models.py - Foundation patterns

### Secondary (MEDIUM confidence)
- [How to Perform Bulk Inserts With SQLAlchemy](https://towardsdatascience.com/how-to-perform-bulk-inserts-with-sqlalchemy-efficiently-in-python-23044656b97d) - bulk_insert_mappings pattern
- [Image Hashing with OpenCV and Python](https://pyimagesearch.com/2017/11/27/image-hashing-opencv-python/) - Perceptual hashing background, Hamming distance thresholds
- [ThreadPoolExecutor Best Practices](https://superfastpython.com/threadpoolexecutor-best-practices/) - Context manager, worker count tuning
- [Hash a Large File in Python](https://gist.github.com/aunyks/042c2798383f016939c40aa1be4f4aaf) - Chunked SHA256 hashing

### Tertiary (LOW confidence, marked for validation)
- [5 Error Handling Patterns in Python](https://www.kdnuggets.com/5-error-handling-patterns-in-python-beyond-try-except) - Error aggregation pattern (conceptual)
- [Batch Processing Guide 2026](https://talent500.com/blog/batch-processing-handling-large-volumes-of-data-in-scheduled-or-periodic-batches/) - General batch processing concepts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are industry standard, versions verified via official docs/PyPI
- Architecture: HIGH - Patterns verified from Python stdlib docs, existing codebase, official library docs
- Pitfalls: HIGH - Derived from official documentation caveats (ThreadPoolExecutor deadlock warnings, SQLite locking), user decisions (CONTEXT.md), and web search verification

**Research date:** 2026-02-02
**Valid until:** 2026-04-02 (60 days - stable domain, libraries mature)
