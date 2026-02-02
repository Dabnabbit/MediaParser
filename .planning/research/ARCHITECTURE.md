# Architecture Patterns: Media Processing Web Application

**Domain:** Home media normalizer with duplicate detection and timestamp correction
**Researched:** 2026-02-02
**Context:** Adding web GUI to existing Python CLI (`PhotoTimeFixer.py`)

## Executive Summary

Media processing web applications require separating **interactive UI** from **long-running background work**. The architecture must support:

1. **Responsive web interface** — Upload files, configure settings, review results without blocking
2. **Background workers** — Process thousands of files asynchronously without timing out HTTP requests
3. **Job queue** — Coordinate work between web app and workers, track progress
4. **Persistent state** — Store file metadata, hashes, processing decisions, review queues
5. **File storage** — Handle uploaded files, work-in-progress, and output files

This architecture is **production-standard** for media processing (ImageKit, Cloudinary workers, video transcoding services, photo management platforms).

**Key insight:** Never process files in HTTP request handlers. Always queue → worker → callback pattern.

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Browser                         │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Web Application (Flask)                     │
│  - Upload endpoints                                          │
│  - Review UI (duplicates, low confidence timestamps)         │
│  - Job status/progress                                       │
│  - Configuration                                             │
└───┬──────────────────────────┬──────────────────────────────┘
    │                          │
    │ Enqueue jobs             │ Read/write state
    ▼                          ▼
┌─────────────────┐    ┌──────────────────────────────────────┐
│   Job Queue     │    │     Database (PostgreSQL/SQLite)      │
│   (Redis/DB)    │    │  - Files table (path, hash, metadata)│
│                 │    │  - Jobs table (status, progress)     │
│                 │    │  - Duplicates table (groups)         │
│                 │    │  - Decisions table (user choices)    │
└───┬─────────────┘    └──────────────────────────────────────┘
    │                          ▲
    │ Dequeue jobs             │ Read/write results
    ▼                          │
┌─────────────────────────────┴───────────────────────────────┐
│              Background Workers (1-N processes)              │
│  - Timestamp detection (existing logic from CLI)             │
│  - Perceptual hashing (imagehash)                            │
│  - Duplicate grouping                                        │
│  - EXIF metadata read/write (PyExifTool)                     │
│  - File output (rename, organize by year)                    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
                     ┌──────────────────┐
                     │   File Storage    │
                     │  - Uploads/       │
                     │  - Processing/    │
                     │  - Output/        │
                     └──────────────────┘
```

## Component Boundaries

### 1. Web Application (Flask)

**Responsibility:**
- Serve HTTP endpoints and HTML pages
- Handle file uploads to temporary storage
- Create background jobs
- Query job status and results
- Render review queues (duplicates, low-confidence timestamps)
- Accept user decisions (which duplicate to keep, timestamp corrections)

**Does NOT:**
- Process media files directly
- Run EXIF operations
- Calculate hashes
- Heavy computation

**Technology:**
- Flask (lightweight, suitable for single-user household use)
- Flask-SocketIO or Server-Sent Events (optional, for real-time progress updates)
- Jinja2 templates
- SQLAlchemy (ORM for database)

**API surface:**
```python
POST   /upload              # Upload files, return job_id
GET    /jobs/{job_id}       # Poll job status
GET    /review/duplicates   # Show duplicate groups
POST   /review/duplicates/{group_id}  # User picks which files to keep
GET    /review/timestamps   # Show low-confidence timestamps
POST   /review/timestamps/{file_id}   # User corrects timestamp
GET    /output              # Browse processed files
```

**Why Flask over Django:**
- Simpler for single-user household app (no need for Django admin, user management, permissions)
- Existing CLI is single Python file — Flask matches that lightweight style
- Faster to add web layer to existing logic
- **Counter-indication:** If multi-user support planned (future v2), Django would be better

**Confidence:** HIGH (Flask is standard for lightweight Python web apps)

---

### 2. Background Workers

**Responsibility:**
- Dequeue jobs from queue
- Execute processing logic:
  - Extract metadata using PyExifTool (existing CLI logic)
  - Detect timestamps from filename, EXIF, file dates
  - Calculate perceptual hashes for duplicate detection
  - Group duplicates by hash similarity
  - Write corrected EXIF metadata
  - Organize output files by year
- Update job status and progress
- Write results to database

**Does NOT:**
- Serve HTTP requests
- Render UI
- Accept user input directly

**Technology:**
- Python multiprocessing or separate worker processes
- Reuse existing `PhotoTimeFixer.py` logic (refactor into functions)
- PyExifTool (already in use)
- imagehash library (for perceptual hashing)

**Worker process count:**
- Start with 2-4 workers (configurable via environment variable)
- CPU-bound work (hashing, metadata extraction) benefits from multiple processes
- Avoid too many workers (ExifTool spawns subprocesses, can overwhelm system)

**Confidence:** HIGH (Standard pattern for async processing)

---

### 3. Job Queue

**Responsibility:**
- Store pending jobs
- Ensure jobs are processed exactly once
- Track job status (pending, processing, completed, failed)
- Provide worker coordination (multiple workers, no job duplication)

**Technology Options:**

#### Option A: Redis + RQ (Python-RQ)
**When to use:**
- Need production-grade queue
- Planning to scale workers across multiple machines (future)
- Want job retries, failure handling, monitoring

**Pros:**
- Battle-tested, used by major platforms
- Simple Python API
- Built-in web dashboard (RQ Dashboard)
- Handles worker failures gracefully

**Cons:**
- Extra dependency (Redis server)
- Adds complexity for single-user home app

#### Option B: Database-backed queue (Huey with SQLite/PostgreSQL)
**When to use:**
- Want simplicity (fewer moving parts)
- Database already required for file metadata
- Single-server deployment

**Pros:**
- No separate queue service needed
- Transactional guarantees (job + database update in same transaction)
- Simpler Docker setup (one less container)

**Cons:**
- Database becomes single point of contention
- Slower than Redis for high-throughput queues
- Less mature tooling than RQ

#### Option C: Celery + Redis/RabbitMQ
**When to use:**
- Need advanced features (scheduled tasks, workflows, chaining)
- Large scale (many workers, complex job dependencies)

**Pros:**
- Most powerful, handles complex workflows
- Rich ecosystem

**Cons:**
- Overkill for household media app
- Heavy configuration
- Known for brittle setup experience

**Recommendation:** **Start with Huey + database-backed queue**

**Rationale:**
- Simpler Docker composition (web + workers + database, no separate Redis)
- Transactional safety (job creation + file record in same transaction)
- Sufficient for household scale (thousands of files, not millions)
- Easy to migrate to Redis-backed Huey later if needed

**Confidence:** MEDIUM (Redis+RQ is more common in production, but Huey is better fit for project constraints)

---

### 4. Database

**Responsibility:**
- Store file records (path, original name, detected timestamp, confidence)
- Store perceptual hashes for duplicate detection
- Store duplicate groups (which files are duplicates)
- Store user decisions (which duplicate to keep, corrected timestamps)
- Store job status and progress
- Store configuration (output path, tag rules)

**Schema (conceptual):**

```sql
-- Files being processed
CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id),
    original_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_hash TEXT,  -- SHA256 for exact duplicates
    perceptual_hash TEXT,  -- imagehash dhash/phash
    detected_timestamp TIMESTAMP,
    timestamp_confidence REAL,  -- 0.0 to 1.0
    timestamp_sources TEXT,  -- JSON: which sources contributed
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    tags TEXT,  -- JSON array
    status TEXT,  -- 'pending', 'processed', 'needs_review', 'output'
    output_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Duplicate groups
CREATE TABLE duplicate_groups (
    id INTEGER PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id),
    similarity_score REAL,  -- 0.0 to 1.0
    group_type TEXT,  -- 'exact', 'perceptual', 'burst'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Members of duplicate groups
CREATE TABLE duplicate_members (
    group_id INTEGER REFERENCES duplicate_groups(id),
    file_id INTEGER REFERENCES files(id),
    is_best_quality BOOLEAN,  -- largest resolution, file size
    PRIMARY KEY (group_id, file_id)
);

-- User decisions
CREATE TABLE decisions (
    id INTEGER PRIMARY KEY,
    file_id INTEGER REFERENCES files(id),
    decision_type TEXT,  -- 'keep_duplicate', 'discard_duplicate', 'corrected_timestamp', 'added_tags'
    decision_data TEXT,  -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Background jobs
CREATE TABLE jobs (
    id INTEGER PRIMARY KEY,
    job_type TEXT,  -- 'import', 'detect_duplicates', 'output'
    status TEXT,  -- 'pending', 'running', 'completed', 'failed'
    progress_current INTEGER DEFAULT 0,
    progress_total INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

**Technology Options:**

#### Option A: PostgreSQL
**Pros:**
- Production-grade
- Full-text search (for tag queries)
- JSON columns (for metadata)
- Concurrent access

**Cons:**
- Extra container in Docker setup
- Overkill for household scale

#### Option B: SQLite
**Pros:**
- Single file, no server
- Simpler Docker setup
- Sufficient for household scale
- Python standard library

**Cons:**
- Limited concurrent writes (workers contend for lock)
- No network access (workers must be on same machine)

**Recommendation:** **Start with SQLite, migrate to PostgreSQL if needed**

**Rationale:**
- Household scale doesn't need PostgreSQL
- SQLite write contention acceptable with 2-4 workers
- Simpler deployment (single file, no extra container)
- Easy migration path (SQLAlchemy supports both)

**Migration trigger:** If you add multi-user support (v2) or run workers on separate machines, switch to PostgreSQL.

**Confidence:** HIGH (SQLite is appropriate for single-user household apps)

---

### 5. File Storage

**Responsibility:**
- Store uploaded files temporarily
- Store work-in-progress files during processing
- Store output files organized by year

**Directory structure:**

```
/app/storage/
├── uploads/          # Temporary uploaded files (job-specific subdirs)
│   └── job_123/
│       ├── IMG_0001.jpg
│       └── IMG_0002.jpg
├── processing/       # Working directory for workers (optional)
│   └── job_123/
│       └── IMG_0001_working.jpg
└── output/           # Final organized files
    ├── 2020/
    │   ├── 20200315_143022.jpg
    │   └── 20200316_120033.jpg
    └── 2021/
        └── 20210101_000000.jpg
```

**Cleanup strategy:**
- Delete `uploads/job_*` after successful processing (or keep for N days)
- Delete `processing/job_*` after job completion
- Keep `output/` permanently (or until user deletes via NAS)

**Docker volume:**
- Mount `/app/storage/output` to host directory (or NAS share)
- Keep `uploads/` and `processing/` inside container (ephemeral)

**Confidence:** HIGH (Standard pattern for file processing apps)

---

## Data Flow

### Primary Flow: File Upload → Processing → Output

```
1. USER uploads files via web UI
   ↓
2. WEB APP saves to uploads/job_123/
   ↓
3. WEB APP creates job record in database (status='pending')
   ↓
4. WEB APP enqueues job to queue
   ↓
5. WEB APP returns job_id to user
   ↓
6. USER polls GET /jobs/{job_id} for status updates
   ---
7. WORKER dequeues job
   ↓
8. WORKER updates job status='running'
   ↓
9. For each file in uploads/job_123/:
   a. WORKER reads metadata (PyExifTool)
   b. WORKER detects timestamp (existing CLI logic)
   c. WORKER calculates file_hash (SHA256) and perceptual_hash (imagehash)
   d. WORKER writes file record to database
   e. WORKER updates job progress_current
   ↓
10. WORKER groups duplicates (query perceptual_hash similarity)
   ↓
11. WORKER writes duplicate_groups and duplicate_members to database
   ↓
12. WORKER updates job status='completed'
   ---
13. USER views GET /review/duplicates (query duplicate_groups)
   ↓
14. USER selects which files to keep
   ↓
15. WEB APP records decisions in decisions table
   ↓
16. WEB APP enqueues output job
   ---
17. WORKER processes output job:
   a. For kept files, write corrected EXIF metadata
   b. Rename files to YYYYMMDD_HHMMSS.ext
   c. Move to output/YYYY/
   d. Update file records (status='output', output_path)
   ↓
18. WORKER updates job status='completed'
   ---
19. USER browses output files via GET /output (or directly on NAS)
```

### Secondary Flow: Low-Confidence Timestamp Review

```
1. During processing (step 9 above), WORKER detects timestamp with confidence < threshold
   ↓
2. WORKER marks file record (status='needs_review')
   ↓
3. USER views GET /review/timestamps (query files WHERE status='needs_review')
   ↓
4. USER corrects timestamp via POST /review/timestamps/{file_id}
   ↓
5. WEB APP updates file record (detected_timestamp, timestamp_confidence=1.0, status='processed')
   ↓
6. WEB APP enqueues output job (or adds to existing output job)
```

### Job Types

| Job Type | Triggered By | Worker Actions | Output |
|----------|-------------|----------------|--------|
| `import` | File upload | Extract metadata, detect timestamps, calculate hashes | File records in database |
| `detect_duplicates` | Import completion | Group files by perceptual hash similarity | Duplicate groups in database |
| `output` | User review completion | Write EXIF, rename, organize by year | Files in output/ |

**Note:** Import and detect_duplicates can be combined into one job for simplicity (recommended for v1).

---

## Scalability Considerations

| Concern | At 100 files | At 10,000 files | At 100,000 files |
|---------|--------------|-----------------|------------------|
| **Upload** | Direct HTTP upload | Direct HTTP upload | Chunked upload or pre-signed URLs |
| **Processing** | Single worker, sequential | 2-4 workers, parallel | 8+ workers, batch processing |
| **Database** | SQLite | SQLite (with WAL mode) | PostgreSQL with indexes |
| **Queue** | Database-backed | Database-backed or Redis | Redis with job prioritization |
| **Storage** | Local disk | Local disk or NAS | NAS with file sharding |
| **Progress updates** | Polling every 2s | Polling or SSE | WebSocket or SSE with rate limiting |

**For household use (target: 10,000-50,000 files), recommended configuration:**
- 2-4 worker processes
- SQLite with WAL mode
- Database-backed queue (Huey)
- Local disk or NAS mount
- HTTP polling for progress (fallback: SSE if needed)

**Confidence:** MEDIUM (Household scale estimates based on typical family photo collections)

---

## Patterns to Follow

### Pattern 1: Job Status Polling (Simple)

**What:** Web UI polls GET /jobs/{job_id} every 2 seconds for status updates

**When:** Simplest implementation, sufficient for household use

**Example:**
```javascript
// Frontend JavaScript
function pollJobStatus(jobId) {
    const interval = setInterval(async () => {
        const response = await fetch(`/jobs/${jobId}`);
        const job = await response.json();

        updateProgressBar(job.progress_current, job.progress_total);

        if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(interval);
            handleJobComplete(job);
        }
    }, 2000);
}
```

**Pros:**
- Simple to implement
- Works everywhere (no WebSocket support needed)
- Stateless

**Cons:**
- Slight delay (up to 2s)
- Extra HTTP requests

---

### Pattern 2: Server-Sent Events (Advanced)

**What:** Server pushes updates to browser as job progresses

**When:** Want real-time updates without polling overhead

**Example:**
```python
# Flask endpoint
@app.route('/jobs/<int:job_id>/stream')
def job_stream(job_id):
    def generate():
        while True:
            job = get_job(job_id)
            yield f"data: {json.dumps(job.to_dict())}\n\n"
            if job.status in ['completed', 'failed']:
                break
            time.sleep(1)
    return Response(generate(), mimetype='text/event-stream')
```

**Pros:**
- Real-time updates
- Lower overhead than polling

**Cons:**
- Keeps HTTP connection open
- More complex than polling

**Recommendation:** Start with polling (Pattern 1), add SSE later if needed.

---

### Pattern 3: Refactor CLI Logic into Functions

**What:** Extract existing `PhotoTimeFixer.py` logic into reusable functions

**Why:** Web workers need same timestamp detection, tag extraction, EXIF operations

**Example refactoring:**
```python
# Before (CLI script):
def Main():
    # ... massive function with loops, prints, file operations ...

# After (library functions):
def extract_timestamp_from_filename(filename: str) -> Optional[datetime]:
    """Extract timestamp from filename using regex patterns."""
    # ... existing regex logic ...

def extract_timestamp_from_exif(filepath: str, et: ExifToolHelper) -> Optional[datetime]:
    """Extract timestamp from EXIF metadata."""
    # ... existing PyExifTool logic ...

def calculate_timestamp_confidence(sources: List[TimestampSource]) -> float:
    """Calculate confidence score based on timestamp sources."""
    # ... new confidence scoring logic ...

def process_file(filepath: str, config: Config) -> FileRecord:
    """Process single file: extract metadata, detect timestamp, calculate hashes."""
    # Orchestrate all extraction functions
    # Return structured FileRecord object
```

**Confidence:** HIGH (Essential refactoring for web architecture)

---

### Pattern 4: Transaction Safety for Job + File Records

**What:** Create job and initial file records in same database transaction

**Why:** Ensures consistency (no orphaned jobs or file records)

**Example:**
```python
from sqlalchemy.orm import Session

def create_import_job(uploaded_files: List[str], db: Session):
    with db.begin():  # Transaction
        job = Job(job_type='import', status='pending', progress_total=len(uploaded_files))
        db.add(job)
        db.flush()  # Get job.id

        for filepath in uploaded_files:
            file_record = File(
                job_id=job.id,
                original_path=filepath,
                original_name=os.path.basename(filepath),
                status='pending'
            )
            db.add(file_record)

        db.commit()
        return job.id
```

**Confidence:** HIGH (Standard database pattern)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Processing Files in HTTP Request Handler

**What:** Running timestamp detection, hashing, EXIF operations inside Flask route handler

**Why bad:**
- HTTP request times out (browsers timeout after 30-120 seconds)
- Blocks web server (other users can't access UI)
- No progress updates
- If browser closes, processing stops

**Instead:** Always enqueue job and process in background worker

**Example of what NOT to do:**
```python
# BAD - Don't do this!
@app.route('/upload', methods=['POST'])
def upload():
    files = request.files.getlist('files')
    for file in files:
        process_file(file)  # ❌ Blocks HTTP request
    return "Done"
```

**Confidence:** HIGH (Universal anti-pattern for async work)

---

### Anti-Pattern 2: Storing Large Files in Database

**What:** Storing uploaded file bytes in database BLOB columns

**Why bad:**
- Database bloat (multi-GB database files)
- Slow queries (file data fetched with every query)
- Backup issues (database backups huge)
- Memory issues (loading files into RAM)

**Instead:** Store files on disk, store file paths in database

**Confidence:** HIGH (Universal anti-pattern)

---

### Anti-Pattern 3: Synchronous ExifTool Calls Without Connection Pooling

**What:** Spawning new ExifTool process for every file

**Why bad:**
- Process spawn overhead (slow, especially on Windows)
- ExifTool has stay-open mode for connection reuse

**Instead:** Use `exiftool.ExifToolHelper` context manager (already doing this in CLI)

**Current code (good):**
```python
with exiftool.ExifToolHelper() as et:
    for file in files:
        metadata = et.get_metadata(file)  # ✅ Reuses same ExifTool process
```

**Confidence:** HIGH (Already using correct pattern)

---

### Anti-Pattern 4: No Job Cancellation Mechanism

**What:** No way to stop long-running job if user closes browser or changes mind

**Why bad:**
- Wastes resources processing unwanted files
- Confusing UX (job keeps running after user leaves)

**Instead:** Add job cancellation:
- Job table has `cancelled` flag
- Worker checks flag periodically during processing
- UI has "Cancel" button that sets flag

**Implementation:**
```python
# Worker loop
for file in files:
    job = db.query(Job).get(job_id)
    if job.cancelled:
        job.status = 'cancelled'
        db.commit()
        return

    process_file(file)
```

**Priority:** LOW for v1 (household use, jobs usually complete), MEDIUM for v2

**Confidence:** MEDIUM (Nice-to-have feature)

---

### Anti-Pattern 5: No Duplicate Detection Threshold Tuning

**What:** Using fixed threshold for perceptual hash similarity without allowing tuning

**Why bad:**
- Different use cases need different thresholds
- Burst photos (very similar) vs different photos (dissimilar)
- User can't adjust false positive/false negative tradeoff

**Instead:** Make threshold configurable in UI

**Example:**
```python
# Configuration table
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT
);

# Default threshold
INSERT INTO config VALUES ('duplicate_threshold', '0.90');

# Worker uses config
threshold = float(get_config('duplicate_threshold'))
groups = find_similar_hashes(perceptual_hashes, threshold)
```

**Priority:** MEDIUM for v1 (affects duplicate detection quality)

**Confidence:** HIGH (Common mistake in duplicate detection systems)

---

## Build Order Recommendations

**Phase 1: Core Infrastructure (Foundation)**
1. Database schema (SQLite + SQLAlchemy models)
2. File storage structure (uploads/, output/ directories)
3. Job queue setup (Huey with database backend)
4. Refactor CLI logic into library functions

**Why this order:** Can't build web app or workers without database and queue. Refactoring CLI first enables parallel development of web + workers.

**Validation:** Can create job records, enqueue jobs, worker can dequeue (no-op processing).

---

**Phase 2: Background Workers (Processing Core)**
1. Worker process that dequeues jobs
2. Import job processing:
   - File metadata extraction (PyExifTool)
   - Timestamp detection (refactored CLI logic)
   - Perceptual hash calculation (imagehash)
   - Write file records to database
3. Job status updates (progress tracking)

**Why this order:** Workers are independent of web UI. Can test processing without web layer.

**Validation:** Create job manually in database, worker processes it, file records appear in database.

---

**Phase 3: Web UI - Basic (Upload + Status)**
1. Flask app skeleton
2. Upload endpoint (save files to uploads/, create job, enqueue)
3. Job status endpoint (query database, return JSON)
4. Simple HTML page with upload form and progress polling

**Why this order:** End-to-end flow (upload → worker → status) enables testing full pipeline.

**Validation:** Upload files via web UI, see progress updates, files processed in background.

---

**Phase 4: Review Queues (Human-in-the-Loop)**
1. Duplicate detection worker logic (group by perceptual hash)
2. Duplicate review UI (show groups, select files to keep)
3. Timestamp review UI (show low-confidence files, correct timestamps)
4. Decision recording (write decisions to database)

**Why this order:** Depends on Phase 2 (workers) and Phase 3 (web UI). Builds on existing file records.

**Validation:** Upload files with duplicates, review UI shows groups, user selects files, decisions recorded.

---

**Phase 5: Output Generation (Final Processing)**
1. Output job worker logic:
   - Write corrected EXIF metadata
   - Rename files to YYYYMMDD_HHMMSS.ext
   - Organize by year in output/
2. Output browsing UI (list files in output/, download or view)

**Why this order:** Requires decisions from Phase 4. Final step in processing pipeline.

**Validation:** Complete review workflow, output job runs, files appear in output/ with correct names and metadata.

---

**Phase 6: Docker Composition (Deployment)**
1. Dockerfile for web + workers (same image, different commands)
2. docker-compose.yml (web service, worker service, volumes)
3. Environment configuration (paths, worker count)

**Why this order:** After all components work locally, containerize for deployment.

**Validation:** `docker-compose up` starts web + workers, full workflow works in containers.

---

## Docker Composition

### Recommended Structure

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build: .
    command: flask run --host=0.0.0.0 --port=5000
    ports:
      - "5000:5000"
    volumes:
      - ./storage/output:/app/storage/output  # Persistent output
      - ./app.db:/app/app.db                   # SQLite database
    environment:
      - FLASK_APP=app.py
      - DATABASE_URL=sqlite:////app/app.db
      - UPLOAD_DIR=/app/storage/uploads
      - OUTPUT_DIR=/app/storage/output
    depends_on:
      - worker

  worker:
    build: .
    command: python worker.py
    volumes:
      - ./storage/output:/app/storage/output  # Shared output
      - ./app.db:/app/app.db                   # Shared database
    environment:
      - DATABASE_URL=sqlite:////app/app.db
      - UPLOAD_DIR=/app/storage/uploads
      - OUTPUT_DIR=/app/storage/output
      - WORKER_COUNT=2                         # Number of worker processes
    deploy:
      replicas: 1  # Run 1 container with 2 worker processes inside
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

# Install ExifTool (Perl-based, needed for PyExifTool)
RUN apt-get update && apt-get install -y \
    libimage-exiftool-perl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create storage directories
RUN mkdir -p /app/storage/uploads /app/storage/output

# Web app runs on port 5000
EXPOSE 5000

# Default command (overridden in docker-compose.yml)
CMD ["flask", "run", "--host=0.0.0.0"]
```

### Volume Strategy

| Volume | Purpose | Persistence |
|--------|---------|-------------|
| `./storage/output` | Processed files | Persistent (host mount or NAS) |
| `./app.db` | SQLite database | Persistent (host mount) |
| `./storage/uploads` | Temporary uploads | Ephemeral (inside container) |

**For NAS output:** Replace `./storage/output` with NAS mount path (e.g., `/mnt/nas/Photos`).

**Confidence:** HIGH (Standard Docker Compose pattern for web + workers)

---

## Alternative Architectures Considered

### Alternative 1: Monolithic (No Workers)

**What:** Process files directly in Flask request handlers, use threading for parallelism

**Pros:**
- Simpler (no queue, no separate worker processes)
- Fewer components

**Cons:**
- HTTP timeouts for large batches
- No progress updates during processing
- Blocks web server
- Can't scale workers independently

**Why rejected:** Unacceptable UX for household use (browser timeout, no progress).

---

### Alternative 2: Microservices (Separate Services)

**What:** Split into separate services (upload service, processing service, duplicate service, output service)

**Pros:**
- Independent scaling
- Clear separation of concerns
- Production-grade architecture

**Cons:**
- Massive overkill for household app
- Complex orchestration
- Many containers to manage

**Why rejected:** Overengineered for single-user household use.

---

### Alternative 3: Serverless (AWS Lambda / Cloud Functions)

**What:** Use cloud functions for processing, S3 for storage, managed queue

**Pros:**
- No server management
- Auto-scaling

**Cons:**
- Requires cloud provider
- Recurring costs
- Function timeout limits (15 min Lambda)
- Latency for large file uploads
- Not suitable for "home media server" deployment

**Why rejected:** Project explicitly runs on home media server (QNAP NAS environment).

---

## Technology Stack Summary

| Component | Recommendation | Alternative |
|-----------|----------------|-------------|
| Web Framework | Flask | Django (if multi-user planned) |
| Job Queue | Huey (database-backed) | RQ (Redis-backed) for scale |
| Database | SQLite (start) → PostgreSQL (if multi-user) | PostgreSQL from start if confident |
| ORM | SQLAlchemy | Django ORM (if using Django) |
| Workers | Python multiprocessing | Celery (overkill) |
| EXIF | PyExifTool (existing) | — (no alternative needed) |
| Perceptual Hash | imagehash (dhash or phash) | — |
| File Hash | hashlib (SHA256, standard library) | — |
| Progress Updates | HTTP polling | SSE or WebSocket for real-time |
| Docker | docker-compose | Kubernetes (overkill) |

**Confidence:** HIGH for core choices, MEDIUM for queue choice (Huey vs RQ tradeoff)

---

## Open Questions / Research Flags

**For later phases:**

1. **Perceptual hash algorithm:** dhash vs phash vs ahash for duplicate detection
   - Needs phase-specific research during duplicate detection implementation
   - Test with sample family photos (burst shots, crops, edits)

2. **Duplicate grouping threshold:** What similarity score groups files?
   - Needs experimentation with real data
   - Likely 0.85-0.95 range, but user-tunable

3. **ExifTool concurrency:** How many ExifTool processes can run simultaneously?
   - Current CLI uses one ExifTool instance for all files (good)
   - Workers will each have one instance (needs testing for resource limits)

4. **SQLite write contention:** Will 2-4 workers cause locking issues?
   - Enable WAL mode (Write-Ahead Logging) in SQLite
   - Test with realistic file count

5. **NAS mount performance:** How fast is metadata read/write over network?
   - May need local processing, then move to NAS
   - Or mount NAS output directory in Docker container

**Confidence:** MEDIUM (These are implementation details, not architecture blockers)

---

## Sources

**Architecture patterns:**
- Industry knowledge: Media processing platforms (ImageKit, Cloudinary architecture), video transcoding services (Mux, Zencoder), photo management (Piwigo, Photoprism architectures)
- Job queue patterns: Background job processing is well-established pattern in web development

**Technology-specific:**
- Flask: Training data (standard Python web framework)
- Huey: Training data (Python task queue library)
- RQ: Training data (Redis Queue for Python)
- PyExifTool: Existing CLI code uses this library
- imagehash: Training data (common for perceptual hashing in Python)
- Docker Compose: Training data (standard orchestration for multi-container apps)

**Confidence level:**
- Architecture patterns: HIGH (established patterns for media processing)
- Technology choices: MEDIUM-HIGH (Flask/SQLite/Huey appropriate, but alternatives valid)
- Household scale estimates: MEDIUM (based on typical family photo collections)
- Build order: HIGH (dependency-driven, logical progression)

**Note:** Web search and Context7 tools were unavailable during research. Recommendations based on training data (knowledge cutoff January 2025) and established software architecture patterns. For production deployment, verify current versions and security updates for all dependencies.

---

**Research complete:** 2026-02-02
**Ready for roadmap creation:** Yes
**Recommended next step:** Structure roadmap phases following build order above
