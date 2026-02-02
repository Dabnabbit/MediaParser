# Domain Pitfalls: Media Normalization & Duplicate Detection

**Domain:** Home media normalizer with photo duplicate detection
**Researched:** 2026-02-02
**Confidence:** HIGH (based on existing codebase analysis and media processing domain knowledge)

## Critical Pitfalls

Mistakes that cause data loss, rewrites, or major system failures.

### Pitfall 1: Data Loss from In-Place Modification Without Backup

**What goes wrong:** Processing modifies original files (EXIF updates, moves, renames) without creating backups. If duplicate detection or normalization has bugs, original files are lost forever.

**Why it happens:**
- Performance optimization (avoiding double storage)
- Assumption that processing logic is correct
- Treating processing as one-way operation with no undo

**Consequences:**
- Irreplaceable family photos corrupted or lost
- No way to recover from false positive duplicates
- Users lose trust in system completely

**Prevention:**
1. **Never modify originals until after review** - Copy to working directory first
2. **Implement quarantine folder** - Keep originals until user confirms results
3. **Add explicit "commit" step** - User reviews results, then confirms deletion of originals
4. **Track file provenance** - Database records which output file came from which source
5. **Defer deletion** - Mark for deletion, don't actually delete until after N days

**Detection:**
- User reports missing files
- Output count doesn't match source count
- Files appear in output but originals already deleted
- No way to reverse processing results

**Phase mapping:** Core architecture decision (Phase 1 - Foundation). Must be built into file processing pipeline from start.

---

### Pitfall 2: Perceptual Hash Collision False Positives

**What goes wrong:** Duplicate detection marks non-duplicates as duplicates due to perceptual hash collisions. Family deletes wrong photo from pair, loses important shot.

**Why it happens:**
- Perceptual hashing algorithms (pHash, dHash) have collision rates
- Similar compositions (same location, different people) hash similarly
- Overly aggressive similarity thresholds
- Burst mode photos where only one frame has critical moment

**Consequences:**
- Lost important photos (kid's first smile, wedding kiss)
- User distrust in duplicate detection
- Manual review becomes mandatory, defeating automation purpose

**Prevention:**
1. **Conservative threshold defaults** - Start with hamming distance <= 5 for pHash (very similar only)
2. **Multi-algorithm consensus** - Require 2+ algorithms to agree (pHash + dHash + aHash)
3. **Metadata cross-checks** - Verify timestamps within reasonable window (5 seconds for burst)
4. **User-adjustable sensitivity** - Expose threshold in UI with clear examples
5. **Always show both images** - Side-by-side comparison in review queue
6. **Default to keeping both** - Require explicit user selection to delete

**Detection:**
- User reports "these aren't duplicates"
- Duplicate groups contain images with different people/subjects
- Timestamps differ by more than burst-mode window
- File sizes differ dramatically (not just resize)

**Phase mapping:** Duplicate detection implementation (Phase 3). Testing with known edge cases required before release.

---

### Pitfall 3: Memory Exhaustion from Loading All File Metadata

**What goes wrong:** System loads all file metadata into memory before processing. With 50,000+ photos, memory usage exceeds available RAM, causing crashes or extreme slowdown.

**Why it happens:**
- Using `os.listdir()` instead of `os.scandir()` (loads all filenames at once)
- Building full metadata dictionaries for all files before processing
- Keeping all perceptual hashes in memory for comparison
- No streaming or batch processing

**Consequences:**
- System crashes mid-processing with OOM error
- Partial processing completed, unclear which files were handled
- Swapping to disk makes processing 100x slower
- Cannot process large archives without upgrading hardware

**Prevention:**
1. **Use streaming iterators** - `os.scandir()` for directory traversal
2. **Process in batches** - Handle 1000 files at a time, persist state
3. **Database for hashes** - Store perceptual hashes in SQLite, query on demand
4. **Lazy metadata loading** - Only fetch metadata when needed for current file
5. **Generator patterns** - Use Python generators throughout pipeline
6. **Memory profiling** - Test with 10k, 50k, 100k file sets before release

**Detection:**
- Process memory grows linearly with number of files
- System becomes unresponsive during processing
- OOM killer terminates process
- Processing time increases non-linearly with file count

**Phase mapping:** Foundation architecture (Phase 1). Must be designed for streaming from start. Retrofitting is expensive.

---

### Pitfall 4: Race Conditions in Multi-Threaded File Operations

**What goes wrong:** Multiple threads process files concurrently, leading to race conditions in file moves, duplicate filename collisions, or corrupted metadata writes.

**Why it happens:**
- Adding threading for performance without proper synchronization
- Multiple threads writing to same output directory
- Filename collision detection not atomic
- ExifTool subprocess management not thread-safe

**Consequences:**
- Files silently overwritten (data loss)
- Corrupted EXIF metadata
- Intermittent crashes or hangs
- Results non-deterministic, bugs hard to reproduce

**Prevention:**
1. **Use process pools, not thread pools** - Python GIL issues with threading
2. **Atomic file operations** - Write to temp, then atomic move/rename
3. **File-level locking** - Use `fcntl.flock()` or `msvcrt.locking()` on Windows
4. **Single writer per directory** - Queue pattern with one thread per output dir
5. **Separate ExifTool per thread** - Each worker gets its own ExifTool instance
6. **Integration tests with concurrency** - Test with 8+ concurrent workers

**Detection:**
- Intermittent file corruption
- Missing files in output
- Crash logs showing file access violations
- Results differ between runs with same input

**Phase mapping:** Performance optimization phase (Phase 4). Do NOT add concurrency until after single-threaded correctness proven.

---

### Pitfall 5: Timestamp Corruption from Timezone Confusion

**What goes wrong:** System applies wrong timezone conversions, shifting all timestamps by N hours. Family photos from vacation appear on wrong days. EXIF timestamps stored in local time but interpreted as UTC.

**Why it happens:**
- EXIF DateTimeOriginal has no timezone field (just local time)
- Mixing timezone-aware and timezone-naive datetime objects
- Assuming all photos taken in one timezone
- Filename timestamps vs EXIF timestamps use different timezone conventions

**Consequences:**
- All timestamps shifted by consistent offset (e.g., -5 hours)
- Photos organized into wrong day folders
- Duplicate detection misses pairs due to timestamp mismatch
- User cannot trust system-assigned timestamps

**Prevention:**
1. **Store original timezone data** - Preserve EXIF SubSecTime and OffsetTime tags
2. **Never assume timezone** - Require explicit timezone or default to "unknown"
3. **Timezone-aware datetime objects** - Use `datetime.datetime(..., tzinfo=...)` everywhere
4. **Show timezone in UI** - Let user verify/correct timezone per batch
5. **GPS timezone inference** - If GPS coordinates available, infer timezone from location
6. **Test with multi-timezone datasets** - Travel photos that cross timezones

**Detection:**
- All timestamps off by consistent amount (3, 5, 8 hours)
- Photos from known events appear on wrong dates
- Timestamps don't match user memory of when photos taken
- `[FORCE]` flag frequently needed to override detection

**Phase mapping:** Core timestamp processing (Phase 1-2). Existing codebase has hardcoded -4 offset (line 244 in PhotoTimeFixer.py) - this is already a bug.

---

### Pitfall 6: Unbounded Task Queue Memory Growth

**What goes wrong:** Web UI queues long-running background jobs (processing 10k files). Task queue grows without bounds, consuming all memory and crashing web server.

**Why it happens:**
- Using in-memory queue (Python `Queue`) for persistent background tasks
- No queue size limits
- No job persistence across server restarts
- Large file paths or metadata stored in queue items

**Consequences:**
- Web server crashes mid-processing
- All processing state lost on restart
- Users cannot submit new jobs when queue full
- No way to resume interrupted processing

**Prevention:**
1. **Persistent task queue** - Use Celery + Redis or RQ, not in-memory Queue
2. **Queue size limits** - Reject new jobs when queue exceeds threshold
3. **Job chunking** - Break large batches into smaller sub-jobs
4. **Store only job IDs** - Queue contains minimal data, retrieve details from DB
5. **Job expiration** - Auto-cleanup completed jobs after N days
6. **Monitor queue depth** - Alert when queue approaches limits

**Detection:**
- Memory grows continuously as jobs queued
- Server becomes unresponsive under load
- Jobs lost when server restarts
- Queue processing stops but no error shown

**Phase mapping:** Web GUI + background processing (Phase 2). Choose persistent queue system early.

---

### Pitfall 7: Duplicate Detection False Negatives from Format Differences

**What goes wrong:** System fails to detect duplicates when same photo saved in different formats (JPEG vs PNG vs HEIC) or with different color profiles (sRGB vs Adobe RGB). User ends up keeping both unknowingly.

**Why it happens:**
- Perceptual hashing on compressed JPEG vs lossless PNG produces different hashes
- HEIC files decoded differently than JPEG equivalents
- Color profile conversions affect pixel values
- Metadata differences (EXIF vs XMP) prevent file hash match

**Consequences:**
- Archive contains many undetected duplicates
- Storage waste (user thinks duplicates removed)
- User manually finds duplicates later, loses trust
- Cannot achieve "clean archive" goal

**Prevention:**
1. **Normalize before hashing** - Decode all formats to common color space (sRGB)
2. **Resize to standard dimensions** - 256x256 or 512x512 before hashing to reduce noise
3. **Test cross-format datasets** - Same image in JPG, PNG, HEIC, WEBP, TIFF
4. **Metadata signature matching** - If EXIF timestamps + dimensions match, compare hashes
5. **User feedback loop** - "Report missed duplicate" button to improve algorithm
6. **Multiple hash algorithms** - Combine pHash (content) with dHash (edges) and aHash (average)

**Detection:**
- User reports "I still see duplicates"
- Archive contains multiple files with same timestamp + similar filenames
- Format conversions not caught (IMG_1234.jpg and IMG_1234.png both present)
- File size ratios suggest one is derivative of other

**Phase mapping:** Duplicate detection refinement (Phase 3). Start with single format, then expand.

---

### Pitfall 8: Docker Volume Permission Disasters

**What goes wrong:** Docker container runs as root but mounted volumes have host user permissions. Container cannot read input files or write to output directory. Processing appears to work but silently fails or writes to wrong location.

**Why it happens:**
- Docker container runs as root (UID 0)
- Host directories mounted with host user ownership (UID 1000)
- Container writes files as root, host user cannot read them
- Unclear error messages from permission denied errors

**Consequences:**
- Files processed but output not visible to host user
- Input files unreadable, processing skips them silently
- Host user cannot delete container-created files (owned by root)
- Fresh Docker users completely stuck

**Prevention:**
1. **USER directive in Dockerfile** - Run as non-root user matching host UID
2. **Build-time UID argument** - `docker build --build-arg UID=$(id -u)`
3. **Entrypoint fixes permissions** - Use `chown` in entrypoint script
4. **Clear error messages** - Detect permission errors, show helpful message
5. **Documentation** - Provide docker-compose.yml with volume examples
6. **Test on fresh Linux install** - Verify as non-root user

**Detection:**
- Processing succeeds but output directory empty
- "Permission denied" in container logs
- Files created but host user cannot read them
- `ls -la` shows root-owned files in mounted volumes

**Phase mapping:** Docker deployment (Phase 5). Common enough that documentation must include troubleshooting section.

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded performance.

### Pitfall 9: Inconsistent Path Handling (Windows vs Linux)

**What goes wrong:** Code uses Windows-style paths (`C:\path\to\file`) or assumes case-insensitive filesystem. Breaks when deployed in Docker (Linux) or tested on Mac.

**Why it happens:**
- Development on Windows, deployment on Linux
- Using `\` instead of `/` or `os.sep`
- Hardcoded absolute paths (existing codebase has `D:/Work/Scripts/...`)
- Assumptions about drive letters

**Prevention:**
1. **Always use `pathlib.Path`** - Cross-platform path handling
2. **Never hardcode absolute paths** - Use environment variables or config files
3. **Test on Linux early** - Use Docker for development, not just deployment
4. **Use forward slashes** - Even on Windows, Python accepts `/`

**Phase mapping:** Foundation (Phase 1). Convert existing hardcoded paths before adding features.

---

### Pitfall 10: ExifTool Subprocess Leaks

**What goes wrong:** Each ExifTool call spawns subprocess. If not properly cleaned up, hundreds of zombie processes accumulate, exhausting file descriptors or process limits.

**Why it happens:**
- Using PyExifTool incorrectly (not using context manager)
- Exception handling doesn't close ExifTool instance
- Long-running web server doesn't restart ExifTool periodically

**Prevention:**
1. **Always use context manager** - `with ExifToolHelper() as et:`
2. **Exception-safe cleanup** - Ensure ExifTool closed even on error
3. **Process pool with lifecycle** - Restart ExifTool every N files
4. **Monitor file descriptors** - Alert when approaching ulimit

**Phase mapping:** Foundation (Phase 1). Existing code uses context manager correctly, maintain this pattern.

---

### Pitfall 11: Web UI Blocks on Long-Running Operations

**What goes wrong:** User uploads 10,000 files, clicks "Process", web request times out after 60 seconds. User sees error, unsure if processing started. Clicking again creates duplicate jobs.

**Why it happens:**
- Processing files synchronously in web request handler
- No background task queue
- No job status tracking

**Prevention:**
1. **Background tasks from day one** - Use Celery, RQ, or similar
2. **Return job ID immediately** - Web handler queues job, returns ticket
3. **Status endpoint** - Poll `/jobs/{id}/status` for progress
4. **WebSocket updates** - Real-time progress without polling
5. **Idempotency tokens** - Prevent duplicate job submission

**Phase mapping:** Web GUI architecture (Phase 2). Do NOT build synchronous processing.

---

### Pitfall 12: No Dry Run Mode

**What goes wrong:** Users cannot preview what will happen without actually processing files. Forced to process small test batch, then full batch, wasting time. Mistakes discovered too late.

**Why it happens:**
- Implementing preview seems like extra work
- Assumption that review queue is sufficient
- Underestimating user need for confidence before processing

**Prevention:**
1. **Dry run flag** - Process everything but don't write files
2. **Preview report** - Show what would be renamed, moved, detected as duplicate
3. **Confidence scoring** - Surface low-confidence decisions before processing
4. **Sample mode** - Process first 10 files, show results, ask to continue

**Phase mapping:** User experience (Phase 3). Add after basic processing works.

---

### Pitfall 13: Hash Collision Filename Generation

**What goes wrong:** Existing code increments timestamp by 1 second to resolve filename collisions (lines 168-172 of PhotoTimeFixer.py). With burst mode photos (10 shots per second), this creates artificial timestamps that don't reflect actual capture time.

**Why it happens:**
- Filename format is `YYYYMMDD_HHMMSS.ext` (1-second resolution)
- Modern cameras shoot faster than 1 fps
- Simple increment seems reasonable but distorts timeline

**Prevention:**
1. **Millisecond timestamps** - Use `YYYYMMDD_HHMMSS_mmm.ext` format
2. **Sequence suffix** - Use `_001`, `_002` instead of incrementing time
3. **Preserve original filename** - Append original name as tag or suffix
4. **Subsecond EXIF data** - Use EXIF SubSecTimeOriginal if available

**Phase mapping:** Timestamp processing (Phase 2). Refactor existing collision logic.

---

### Pitfall 14: Unvalidated User Input Paths

**What goes wrong:** Web UI accepts user-specified input/output directories. Malicious or accidental input points to system directories (`/etc`, `C:\Windows`), resulting in processing system files or exposing sensitive data.

**Why it happens:**
- Trusting user input
- No path validation or sandboxing
- Assumption of "home network, trusted users"

**Prevention:**
1. **Whitelist allowed directories** - User selects from pre-configured list
2. **Path validation** - Reject paths outside allowed root
3. **Sandboxing** - Run processor in container with limited filesystem access
4. **Path canonicalization** - Resolve symlinks, reject `..` traversal

**Phase mapping:** Web GUI (Phase 2). Security requirement, not optional.

---

### Pitfall 15: Progress Reporting Overhead

**What goes wrong:** Background job updates progress database every file (line 86 prints per file). With 50,000 files, database writes become bottleneck, slowing processing by 50%.

**Why it happens:**
- Fine-grained progress feels responsive
- Not testing at scale
- Synchronous database writes in hot loop

**Prevention:**
1. **Batch progress updates** - Update every 100 files, not every file
2. **Async progress writes** - Non-blocking updates
3. **In-memory counters** - Write to Redis, sync to DB periodically
4. **Progress estimation** - Show "~30% complete" instead of exact count

**Phase mapping:** Performance optimization (Phase 4). Don't prematurely optimize, but test at scale.

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily fixable.

### Pitfall 16: EXIF Rotation vs Image Pixels

**What goes wrong:** Duplicate detection compares pixel data but ignores EXIF Orientation tag. Same photo with different orientations not detected as duplicate.

**Prevention:**
- Apply EXIF rotation before hashing
- Normalize all images to orientation = 1

**Phase mapping:** Duplicate detection (Phase 3).

---

### Pitfall 17: Video File Memory Explosion

**What goes wrong:** Attempting to load video files into memory for processing like images. Even short videos consume gigabytes of RAM.

**Prevention:**
- Extract single frame (keyframe or midpoint) for video processing
- Use ffmpeg for video metadata, not full loading
- Treat videos separately from photos in pipeline

**Phase mapping:** Video support (Future). Existing code supports mp4/mpeg/mov but per PROJECT.md, full video support deferred to v2.

---

### Pitfall 18: Case-Sensitive Extension Checking

**What goes wrong:** Code checks `filename.endswith('jpg')` but misses `IMG_1234.JPG`.

**Prevention:**
- Already handled in existing code (line 68: `document_path.lower().endswith(valid_extensions)`)
- Maintain this pattern in new code

**Phase mapping:** Foundation (Phase 1). Existing code handles correctly.

---

### Pitfall 19: Unicode Filename Handling

**What goes wrong:** Filenames with unicode characters (Chinese, emoji, accents) cause encoding errors or crashes.

**Prevention:**
- Python 3 handles Unicode by default
- Test with international character sets
- Use UTF-8 everywhere

**Phase mapping:** Foundation (Phase 1). Test with unicode filenames early.

---

### Pitfall 20: Git LFS for Test Images

**What goes wrong:** Committing test images (JPEGs, PNGs) to Git causes repository bloat. Clones become slow.

**Prevention:**
- Use Git LFS for binary test assets
- Or generate test images programmatically
- Keep sample images < 100KB

**Phase mapping:** Development workflow (Phase 0). Address if test suite grows large.

---

## Phase-Specific Warnings

Pitfalls organized by which phase they're most likely to affect.

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| **Phase 1: Foundation Architecture** | Memory exhaustion from loading all files | Use generators, streaming, batch processing from start |
| **Phase 1: Foundation Architecture** | Data loss from modifying originals | Copy-first, quarantine originals until review complete |
| **Phase 1: Foundation Architecture** | Path handling inconsistencies | Use `pathlib`, test on Linux immediately |
| **Phase 2: Web GUI + Background Jobs** | Synchronous processing blocks web server | Background task queue (Celery/RQ) required |
| **Phase 2: Web GUI + Background Jobs** | Unbounded task queue growth | Persistent queue, size limits, job expiration |
| **Phase 2: Web GUI + Background Jobs** | Unvalidated user paths | Path whitelist, sandbox, validation |
| **Phase 3: Duplicate Detection** | False positives from hash collisions | Conservative thresholds, multi-algorithm, user review |
| **Phase 3: Duplicate Detection** | False negatives from format differences | Normalize formats before hashing |
| **Phase 3: Duplicate Detection** | EXIF orientation ignored | Apply rotation before hashing |
| **Phase 3: Timestamp Processing** | Timezone corruption | Timezone-aware datetimes, preserve original timezone |
| **Phase 3: Timestamp Processing** | Collision resolution distorts timeline | Millisecond timestamps or sequence suffixes |
| **Phase 4: Performance Optimization** | Race conditions from concurrency | Process pools, atomic operations, file locking |
| **Phase 4: Performance Optimization** | Progress reporting overhead | Batch updates, async writes |
| **Phase 5: Docker Deployment** | Volume permission disasters | Non-root user, UID matching, clear docs |

---

## Lessons from Existing Codebase

**Already doing well:**
- Using ExifTool context manager (prevents subprocess leaks)
- Case-insensitive extension checking
- Confidence-based review queue (`CHECK` folder)
- Tag extraction from filenames/folders

**Already problematic (documented in CONCERNS.md):**
- Hardcoded absolute Windows paths (line 13-14)
- Hardcoded timezone offset -4 (line 244)
- Sequential processing (no parallelization)
- Timestamp collision handled by incrementing seconds (loses subsecond precision)
- No backup/rollback capability
- Global state (`startTime`)

**Must preserve when refactoring:**
- Tag extraction from `{tag1,tag2}` syntax
- Multi-source datetime resolution logic
- EXIF metadata update patterns
- Year-based folder organization

---

## Testing Checklist for Each Phase

**Phase 1-2 (Foundation + Web GUI):**
- [ ] Test with 100, 1000, 10000 file batches
- [ ] Test with files containing unicode names
- [ ] Test with input path on different filesystem than output
- [ ] Test with insufficient disk space
- [ ] Test with insufficient memory
- [ ] Test with read-only source files
- [ ] Test with corrupted/truncated image files

**Phase 3 (Duplicate Detection):**
- [ ] Test with known duplicate sets (same file, different names)
- [ ] Test with burst mode photos (10 shots in 1 second)
- [ ] Test with same image in JPG/PNG/HEIC formats
- [ ] Test with resized versions (original + thumbnails)
- [ ] Test with edited versions (cropped, filters applied)
- [ ] Test with similar but different images (same scene, different moment)
- [ ] Test with false positive prone sets (white walls, blue skies)

**Phase 4 (Performance):**
- [ ] Test with 50,000+ file batch
- [ ] Monitor memory usage throughout processing
- [ ] Verify no file descriptor leaks
- [ ] Test with 8+ concurrent workers
- [ ] Verify deterministic results regardless of concurrency

**Phase 5 (Docker):**
- [ ] Test as non-root user on Linux
- [ ] Test with volume mounts from different host users
- [ ] Test with NAS/network share mounts
- [ ] Verify container restart doesn't lose jobs
- [ ] Test with insufficient container memory limits

---

## Resources for Further Research

**When implementing duplicate detection (Phase 3):**
- ImageHash library documentation (pHash, dHash, aHash implementations)
- Study of perceptual hash collision rates at different thresholds
- Duplicate photo detection academic papers (e.g., "Near-Duplicate Image Detection")

**When implementing background jobs (Phase 2):**
- Celery best practices for long-running tasks
- RQ (Redis Queue) as simpler alternative
- Job persistence and retry strategies

**When optimizing performance (Phase 4):**
- Python multiprocessing vs threading for I/O bound tasks
- Memory profiling with `memory_profiler` or `tracemalloc`
- Batch processing patterns for large datasets

---

**Confidence Assessment:**
- **Data loss pitfalls:** HIGH confidence (fundamental to media processing)
- **Duplicate detection pitfalls:** HIGH confidence (well-known domain problems)
- **Concurrency pitfalls:** HIGH confidence (Python GIL and filesystem race conditions)
- **Docker pitfalls:** HIGH confidence (common deployment issue)
- **Phase-specific timing:** MEDIUM confidence (depends on actual roadmap structure)

**Sources:**
- As of my training data (Jan 2025), based on:
  - Common patterns in media processing applications
  - Known limitations of perceptual hashing algorithms
  - Python multiprocessing best practices
  - Docker volume permission issues (frequent in home server deployments)
  - Analysis of existing PhotoTimeFixer.py codebase
  - Patterns from photo management tools (PhotoPrism, Immich, Piwigo)

Note: Web search unavailable during research. Recommendations based on training knowledge and existing codebase analysis. Specific library documentation (ImageHash, Celery, etc.) should be verified during implementation phases.
