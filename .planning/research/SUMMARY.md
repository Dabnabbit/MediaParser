# Project Research Summary

**Project:** MediaParser - Home Media Normalizer
**Domain:** Home media management and photo organization
**Researched:** 2026-02-02
**Confidence:** MEDIUM

## Executive Summary

MediaParser is a home media normalization tool that extends an existing Python CLI (`PhotoTimeFixer.py`) with a web GUI and advanced duplicate detection. This project operates in the self-hosted photo management domain, where products like PhotoPrism, Immich, and DigiKam provide reference implementations. The core challenge is adding web-based workflows to existing brownfield code while maintaining data integrity for irreplaceable family photos.

The recommended approach is **Flask-based web wrapper with background workers** using task queuing (Celery/Huey + Redis), SQLite database for metadata and perceptual hashes, and Docker deployment. The architecture separates interactive web UI from long-running background processing - a production-standard pattern for media processing applications. Flask is chosen over Django for its lightweight brownfield-friendly nature, allowing existing CLI logic to be wrapped with minimal refactoring.

The highest risks are **data loss from in-place modification** and **perceptual hash false positives** in duplicate detection. Both are mitigated through quarantine-style workflows (never delete originals until review), conservative similarity thresholds, and mandatory human-in-the-loop review queues. Additional risks include memory exhaustion with large file sets (50k+ photos), timezone corruption during timestamp normalization, and Docker volume permission issues common in home server deployments.

## Key Findings

### Recommended Stack

The stack prioritizes **brownfield compatibility** (wrap existing CLI without major refactoring), **household scale appropriateness** (tens of thousands of files, not millions), and **non-technical user deployment** (Docker Compose, not Kubernetes).

**Core technologies:**
- **Flask (3.0.x)**: Lightweight web framework — perfect for adding web layer to existing Python CLI without Django's opinionated structure. Flask-SocketIO enables real-time progress updates during long-running operations.
- **SQLite (3.45+)**: Embedded database — handles household scale (tens of thousands of files) with zero operational overhead. Stores file metadata, perceptual hashes, duplicate groups, and user decisions. PostgreSQL would be overkill for single-household deployment.
- **imagehash (4.3.x)**: Perceptual hashing — industry standard for duplicate detection using multiple algorithms (pHash, dHash, aHash). Works with existing Pillow/PIL library.
- **Celery (5.3.x) + Redis (7.2.x)**: Background task queue — essential for responsive web UI. Processing thousands of files cannot block HTTP requests. Celery provides cancellation, retries, and progress tracking that raw threading cannot.
- **Docker Compose (3.8+)**: Multi-container orchestration — manages Flask app, Celery worker, and Redis broker as single stack. Simple deployment for non-technical family members.
- **Python 3.11-slim**: Base image — 50% smaller than standard Python image with 25% performance improvement over 3.9/3.10.

**Key architectural decision:** Flask + Celery over Django, FastAPI, or synchronous processing. Flask matches the lightweight CLI tool nature, Celery is essential for long operations (users need "Cancel" buttons that actually work).

### Expected Features

**Must have (table stakes):**
- **Thumbnail grid view** — visual scanning is how humans review photos
- **File upload (drag & drop)** — standard web interaction pattern
- **Progress indication** — long operations need feedback or users think system froze
- **Undo/review before commit** — non-technical users fear permanent changes
- **Duplicate grouping UI** — if tool detects duplicates, must show them grouped for review
- **Keep/delete decision UI** — for duplicate groups, user chooses which to keep
- **Basic metadata display** — users need to see what the tool "sees" (date, resolution, location)
- **Responsive design** — family members will use phones to review on couch

**Should have (competitive differentiators):**
- **Confidence scoring visualization** — shows *why* a timestamp was chosen, builds trust with non-technical users
- **Smart duplicate detection (near-identical)** — goes beyond exact duplicates to find burst photos, crops, compressions, format conversions using perceptual hashing
- **Quality scoring for duplicates** — automatically recommends best version (resolution, file size, format) to reduce decision fatigue
- **Visual conflict resolution** — show thumbnail + all detected timestamps side-by-side when sources disagree
- **Non-destructive edits** — keep originals, store edits separately until user commits

**Defer (v2+):**
- Timeline view (nice-to-have visualization)
- Batch timestamp adjustment (power user feature)
- Tag suggestions from AI/ML (high complexity, privacy concerns)
- RAW format support (prosumer feature, use Lightroom instead)
- Face recognition (privacy concerns, scope creep)

**Anti-features (explicitly avoid):**
- Automatic destructive operations (terrifies non-technical users)
- Image editing (crop, rotate, filters) — scope creep, many tools do this better
- Cloud sync/backup — users have their own solutions
- Multi-user with permissions — adds auth/access control complexity

### Architecture Approach

Media processing web applications require separating **interactive UI** from **long-running background work**. The recommended architecture uses a **job queue pattern** where the Flask web app handles uploads/configuration/review but immediately enqueues processing jobs for background workers. This prevents HTTP timeouts, enables progress tracking, and allows users to close browser without stopping work.

**Major components:**
1. **Web Application (Flask)** — serves HTTP endpoints, handles uploads, creates jobs, renders review queues (duplicates, low-confidence timestamps), accepts user decisions. Does NOT process files directly.
2. **Background Workers** — dequeue jobs, execute processing (metadata extraction with PyExifTool, timestamp detection from existing CLI, perceptual hashing with imagehash, duplicate grouping), update job status, write results to database.
3. **Job Queue (Huey/Celery + Redis)** — coordinates work between web app and workers, tracks job status (pending/processing/completed/failed), provides progress updates.
4. **Database (SQLite → PostgreSQL if multi-user)** — stores file records, perceptual hashes, duplicate groups, user decisions, job status, configuration.
5. **File Storage** — uploads/ (temporary), processing/ (working), output/ (final organized files by year).

**Critical pattern:** Never process files in HTTP request handlers. Always: upload → create job record → enqueue → worker processes → update status → user reviews → commit output.

**Data flow:** User uploads → web app saves to uploads/job_123/ → creates job in database → enqueues job → returns job_id → worker dequeues → processes files (metadata, hashes) → writes to database → user reviews duplicate groups/timestamp conflicts via web UI → makes decisions → web app records decisions → enqueues output job → worker writes corrected EXIF, renames files (YYYYMMDD_HHMMSS.ext), organizes by year in output/.

### Critical Pitfalls

1. **Data loss from in-place modification without backup** — processing modifies originals without creating backups. If bugs exist, irreplaceable family photos are lost forever. **Prevention:** Never modify originals until after review. Copy to working directory first, implement quarantine folder, add explicit "commit" step after user confirms results. Track file provenance in database.

2. **Perceptual hash collision false positives** — duplicate detection marks non-duplicates as duplicates due to hash collisions. Similar compositions (same location, different people) hash similarly. **Prevention:** Conservative threshold defaults (hamming distance ≤ 5), multi-algorithm consensus (pHash + dHash + aHash must agree), metadata cross-checks (timestamps within 5 seconds for burst mode), always show both images side-by-side, default to keeping both (require explicit user selection to delete).

3. **Memory exhaustion from loading all file metadata** — with 50,000+ photos, loading all metadata into memory exceeds available RAM, causing crashes. **Prevention:** Use streaming iterators (os.scandir), process in batches (1000 files at a time), store perceptual hashes in database (not memory), use Python generators throughout pipeline. Design for streaming from start - retrofitting is expensive.

4. **Timestamp corruption from timezone confusion** — EXIF DateTimeOriginal has no timezone field (just local time). Mixing timezone-aware and timezone-naive datetime objects shifts all timestamps by N hours. **Prevention:** Store original timezone data, never assume timezone (default to "unknown"), use timezone-aware datetime objects everywhere, show timezone in UI for user verification. Note: existing codebase has hardcoded -4 offset (PhotoTimeFixer.py line 244) - this is already a bug.

5. **Docker volume permission disasters** — container runs as root but mounted volumes have host user permissions. Container cannot read input files or write to output directory. **Prevention:** USER directive in Dockerfile (run as non-root matching host UID), build-time UID argument, entrypoint fixes permissions, clear error messages, documentation with examples.

## Implications for Roadmap

Based on research, suggested phase structure follows dependency-driven build order:

### Phase 1: Foundation Architecture
**Rationale:** Cannot build web app or workers without database schema, file storage structure, and job queue infrastructure. Refactoring CLI logic into library functions enables parallel development of web + workers.

**Delivers:**
- Database schema (SQLite + SQLAlchemy models for files, jobs, duplicates, decisions)
- File storage structure (uploads/, processing/, output/ directories)
- Job queue setup (Huey with database backend for simplicity)
- CLI logic refactored into reusable library functions (extract_timestamp_from_filename, extract_timestamp_from_exif, calculate_timestamp_confidence)

**Addresses:**
- Memory exhaustion prevention (design for streaming from start)
- Data loss prevention (copy-first architecture, never modify originals)
- Path handling (use pathlib.Path, convert hardcoded Windows paths)

**Avoids:**
- Pitfall 3 (memory exhaustion) - must use generators/streaming from start
- Pitfall 1 (data loss) - copy-first architecture baked into foundation
- Pitfall 9 (Windows/Linux path inconsistencies)

**Validation:** Can create job records, enqueue jobs, worker can dequeue (no-op processing).

---

### Phase 2: Background Workers + Core Processing
**Rationale:** Workers are independent of web UI. Can test processing logic without web layer. Core timestamp detection and metadata extraction already exist in CLI - need to adapt to worker context.

**Delivers:**
- Worker process that dequeues jobs
- Import job processing (metadata extraction via PyExifTool, timestamp detection from refactored CLI, perceptual hash calculation with imagehash, write file records to database)
- Job status updates with progress tracking
- Confidence scoring for timestamps (HIGH: EXIF agreement, MEDIUM: single source, LOW: conflicts)

**Uses:**
- imagehash library for perceptual hashing (pHash algorithm)
- Existing PyExifTool patterns from CLI
- SQLAlchemy for database writes

**Implements:**
- Background worker component from architecture
- Job queue consumption pattern

**Avoids:**
- Pitfall 11 (web UI blocks) - establishes async processing from start
- Pitfall 10 (ExifTool subprocess leaks) - maintain context manager pattern
- Pitfall 5 (timezone corruption) - implement timezone-aware datetime handling

**Validation:** Create job manually in database, worker processes it, file records appear with metadata and hashes.

---

### Phase 3: Web UI - Upload + Status
**Rationale:** End-to-end flow (upload → worker → status) enables testing full pipeline. Simple HTML + Flask is sufficient - don't overcomplicate with React/Vue for household tool.

**Delivers:**
- Flask app skeleton
- Upload endpoint (save files to uploads/, create job, enqueue)
- Job status endpoint (query database, return JSON)
- Simple HTML page with drag-drop upload form and progress polling
- Basic metadata display (show EXIF data, detected timestamp, confidence)

**Addresses:**
- File upload (table stakes feature)
- Progress indication (table stakes feature)
- Basic metadata display (table stakes feature)

**Avoids:**
- Pitfall 11 (synchronous processing) - upload immediately enqueues, doesn't process
- Pitfall 14 (unvalidated paths) - implement path whitelist/validation
- Pitfall 6 (unbounded queue growth) - persistent queue with size limits

**Validation:** Upload files via web UI, see progress updates, files processed in background, metadata visible in UI.

---

### Phase 4: Review Queues - Timestamps
**Rationale:** Timestamp correction is core existing value. Make it transparent and trustworthy through confidence scoring and conflict resolution UI. Builds on existing CLI strength.

**Delivers:**
- Timestamp conflict resolution UI (show file with all detected timestamps, user chooses correct one)
- Confidence scoring visualization (color-coded badges: green/yellow/red)
- Batch selection for multi-file operations
- Undo/review before commit workflow
- Low-confidence review queue (files flagged for human review)

**Addresses:**
- Timestamp conflict resolution (table stakes + differentiator)
- Confidence scoring visualization (differentiator)
- Batch select (table stakes)
- Undo/review before commit (table stakes)

**Avoids:**
- Pitfall 5 (timezone corruption) - UI shows timezone, allows user correction
- Pitfall 13 (collision filename generation) - use millisecond timestamps or sequence suffixes

**Validation:** Upload files with ambiguous timestamps, conflict UI shows sources, user selects correct one, decision recorded.

---

### Phase 5: Duplicate Detection - Exact
**Rationale:** Exact duplicates are low-hanging fruit (simple file hash). Delivers value before tackling complex perceptual hashing. Validates review queue UI patterns.

**Delivers:**
- File hash calculation (SHA256) during import
- Exact duplicate grouping by file hash
- Duplicate review UI (show groups as cards, side-by-side comparison)
- Keep/delete decision UI (radio buttons per group)
- Quality scoring for exact duplicates (resolution, file size, format preference)

**Addresses:**
- Exact duplicate detection (table stakes)
- Duplicate grouping UI (table stakes)
- Keep/delete decision UI (table stakes)

**Avoids:**
- Pitfall 1 (data loss) - review queue ensures user confirms before deletion
- Pitfall 12 (no dry run) - review queue IS the dry run

**Validation:** Upload files with exact duplicates, review UI shows groups, user selects files to keep, originals not deleted until commit.

---

### Phase 6: Duplicate Detection - Perceptual (Killer Feature)
**Rationale:** This is the new feature driving the milestone. More complex than exact duplicates - needs threshold tuning, format normalization, testing with burst photos and edited versions.

**Delivers:**
- Perceptual hash calculation (imagehash library: pHash, dHash, aHash)
- Near-duplicate grouping by hash similarity (configurable threshold)
- Quality scoring for near-duplicates (resolution × format preference)
- Multi-algorithm consensus (require 2+ algorithms to agree)
- Format normalization before hashing (JPEG vs PNG vs HEIC handled correctly)

**Addresses:**
- Smart duplicate detection (differentiator - the killer feature)
- Quality scoring for duplicates (differentiator)

**Avoids:**
- Pitfall 2 (false positives) - conservative thresholds, multi-algorithm, metadata cross-checks
- Pitfall 7 (false negatives from format differences) - normalize before hashing
- Pitfall 16 (EXIF rotation ignored) - apply rotation before hashing

**Research flag:** Phase needs deeper research into perceptual hashing algorithm selection (pHash vs dHash vs aHash), threshold tuning with real family photos, performance optimization for 50k+ files. Use `/gsd:research-phase` during planning.

**Validation:** Upload burst photos, crops, format conversions (JPG/PNG/HEIC), review UI groups correctly, false positive rate acceptable (user testing with family members).

---

### Phase 7: Output Generation + Tagging
**Rationale:** Requires decisions from review queues. Final step in processing pipeline. Tag extraction already exists in CLI - just need UI wrapper.

**Delivers:**
- Output job worker (write corrected EXIF metadata, rename to YYYYMMDD_HHMMSS.ext, organize by year in output/)
- Output browsing UI (list files, download, view metadata)
- Bulk tag assignment from folder structure (expose existing CLI feature)
- Filter by date range
- Search by filename

**Addresses:**
- Bulk tag assignment from folders (differentiator, already exists in CLI)
- Filter by date range (table stakes)
- Search by filename (table stakes)

**Avoids:**
- Pitfall 1 (data loss) - originals never deleted, output is separate
- Pitfall 13 (timestamp collision) - improved filename generation

**Validation:** Complete review workflow, output job runs, files appear in output/ with correct names/metadata/tags, originals still in source.

---

### Phase 8: Docker Deployment + Polish
**Rationale:** After all components work locally, containerize for deployment. Responsive design enables couch-based review (family members on phones/tablets).

**Delivers:**
- Dockerfile for web + workers (same image, different commands)
- docker-compose.yml (web service, worker service, Redis, volumes for output/ and database)
- Environment configuration (paths, worker count, duplicate threshold)
- Responsive design (CSS grid, touch-friendly targets)
- Documentation (setup, troubleshooting, Docker volume permissions)

**Addresses:**
- Responsive design (table stakes)
- Docker deployment for non-technical users

**Avoids:**
- Pitfall 8 (Docker volume permissions) - non-root user, UID matching, clear docs
- Pitfall 9 (path handling) - tested on Linux throughout development

**Validation:** `docker-compose up` starts web + workers, full workflow works in containers, NAS volume mounts work, non-root user can access files.

---

### Phase Ordering Rationale

- **Foundation first (Phase 1):** Database, queue, file storage are prerequisites for all other work. Streaming architecture prevents memory exhaustion (cannot be retrofitted).
- **Workers before web UI (Phase 2 → 3):** Workers can be tested independently. Establishing async pattern prevents "web UI blocks on long operations" pitfall.
- **Timestamp workflow before duplicate detection (Phase 4 → 5-6):** Leverages existing CLI strength, builds user trust before tackling complex new feature. Review queue UI patterns established with timestamps, reused for duplicates.
- **Exact duplicates before perceptual (Phase 5 → 6):** Incremental value delivery. Simple file hash validates architecture before complex perceptual hashing.
- **Output generation late (Phase 7):** Depends on all review decisions. Final commit step ensures no data loss.
- **Docker deployment last (Phase 8):** After local development complete. Avoids debugging Docker issues while building features.

### Research Flags

**Needs deeper research during planning:**
- **Phase 6 (Perceptual Duplicate Detection):** Algorithm selection (pHash vs dHash vs aHash performance/accuracy tradeoffs), threshold tuning methodology, false positive rate targets, format normalization approaches (JPEG vs PNG vs HEIC), performance optimization for large datasets. Recommend `/gsd:research-phase` spike before implementation.

**Standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** SQLAlchemy models, job queue setup - well-documented patterns
- **Phase 2 (Workers):** Background processing patterns - established in Celery/Huey docs
- **Phase 3 (Web UI):** Flask upload endpoints - straightforward, many examples
- **Phase 4 (Review Queues):** Standard CRUD operations for review workflows
- **Phase 5 (Exact Duplicates):** File hashing is trivial (hashlib.sha256)
- **Phase 7 (Output):** Existing CLI logic, just adapt to worker context
- **Phase 8 (Docker):** Docker Compose patterns for Flask + Celery well-documented

**De-risk early:**
- Prototype perceptual hashing in Phase 1-2 (spike to validate library choice, performance at scale)
- Test thumbnail generation with 10k+ files early to catch memory/performance issues
- User test timestamp conflict UI (Phase 4) with non-technical family members before building all review queues

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Flask, SQLite, imagehash, Celery are appropriate for household scale and brownfield context. Alternatives (Django, PostgreSQL) valid but more complex than needed. |
| Features | HIGH | Table stakes and differentiators identified from training knowledge of PhotoPrism, Immich, DigiKam, Google Photos, Apple Photos. Patterns consistent across multiple tools. |
| Architecture | HIGH | Job queue pattern for media processing is production-standard (ImageKit, Cloudinary, video transcoding services). Separation of web UI and background workers is essential. |
| Pitfalls | HIGH | Data loss, perceptual hash false positives, memory exhaustion, timezone corruption, Docker permissions are well-known failure modes in this domain. Existing codebase already exhibits some issues (hardcoded paths/timezone, collision handling). |

**Overall confidence:** MEDIUM

Confidence is MEDIUM (not HIGH) due to **web search unavailable during research** - all recommendations based on training data through January 2025, not verified with current external sources. However, core architectural patterns (Flask + Celery, SQLite for household scale, imagehash for perceptual hashing) are well-established and unlikely to have shifted dramatically by February 2026.

### Gaps to Address

**Current versions verification:** Verify Python 3.11 vs 3.12 adoption, Flask 3.x stability, imagehash current version/API, Celery 5.x vs alternatives during implementation. Training data cutoff January 2025 means 13 months of potential library updates.

**Perceptual hashing algorithm choice:** Cannot definitively recommend pHash vs dHash vs aHash without testing on actual family photo datasets. Phase 6 needs spike to evaluate false positive/negative rates with burst photos, crops, format conversions, edits.

**Household scale performance:** Estimates for 10k-50k files based on typical family collections, not load tested. SQLite write contention with 2-4 workers needs validation. May need PostgreSQL if performance issues arise.

**ExifTool concurrency limits:** Current CLI uses one ExifTool instance. Workers will each have their own instance - needs testing for resource limits (memory, file descriptors) at scale.

**Duplicate threshold tuning:** Cannot specify exact hamming distance threshold without real data. Likely 0.85-0.95 similarity range, but user-tunable. Phase 6 needs experimentation.

**Docker volume mounts for NAS:** Performance of metadata read/write over network mount unknown. May need local processing, then move to NAS. Test during Phase 8.

**Timezone handling complexity:** Existing codebase has hardcoded -4 offset bug. Full timezone-aware implementation more complex than appears - needs careful design in Phase 2/4.

## Sources

### Primary (HIGH confidence)
- **Existing codebase analysis:** PhotoTimeFixer.py (227 lines) - timestamp detection logic, EXIF handling patterns, tag extraction, filename collision handling, identified bugs (hardcoded paths line 13-14, timezone offset line 244)
- **Architecture patterns:** Training knowledge of media processing platforms (ImageKit, Cloudinary workers), video transcoding services (Mux, Zencoder), photo management tools (PhotoPrism, Immich, Piwigo, DigiKam)
- **Technology documentation:** Flask, SQLAlchemy, Celery, Huey, imagehash, PyExifTool (as of January 2025 training cutoff)

### Secondary (MEDIUM confidence)
- **Feature patterns:** Training knowledge of Google Photos, Apple Photos, Adobe Lightroom, DigiKam workflow patterns
- **Pitfall knowledge:** Common failure modes in photo management tools (data loss, duplicate detection accuracy, memory issues, timezone handling)
- **Docker patterns:** Multi-container orchestration for web + workers, volume permission issues in home server deployments

### Tertiary (LOW confidence - needs validation)
- **Current library versions:** Python 3.11 vs 3.12 adoption by Feb 2026, Flask 3.x stability status, imagehash API updates since Jan 2025
- **Performance estimates:** SQLite handling 50k+ files with concurrent workers, perceptual hashing speed at scale, thumbnail generation performance
- **NAS deployment patterns:** Network mount performance for metadata operations, QNAP-specific Docker considerations

**Note:** Web search and Context7 tools unavailable during research. All recommendations based on training data (January 2025 cutoff) and existing codebase analysis. For production deployment, verify current versions, library API stability, and security updates. Test at scale (50k+ files) before committing to SQLite vs PostgreSQL decision.

---

**Research completed:** 2026-02-02
**Ready for roadmap:** Yes
**Recommended next step:** Use phase suggestions above as starting structure for roadmap. Flag Phase 6 (perceptual duplicate detection) for deeper research during planning (`/gsd:research-phase`).
