# Technology Stack

**Project:** MediaParser - Home Media Normalizer
**Researched:** 2026-02-02
**Confidence:** MEDIUM (WebSearch unavailable, based on training data through Jan 2025)

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Flask** | 3.0.x | Web framework | Lightweight, perfect for brownfield addition to existing CLI tool. Django adds unnecessary complexity (ORM, admin, templates) when you already have working Python code. Flask lets you wrap existing logic with minimal refactoring. |
| **Flask-SocketIO** | 5.3.x | Real-time updates | Essential for showing file processing progress to non-technical users. WebSocket support for live status updates during long-running operations. |
| **Gunicorn** | 21.2.x | WSGI server | Production-grade server for Docker deployment. Handles multiple workers for concurrent requests. |

### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **SQLite** | 3.45+ | Primary database | Perfect fit for tens of thousands of files on single-household scale. Zero configuration, file-based (easy Docker volume mounting), handles perceptual hash storage efficiently. PostgreSQL is overkill and adds operational complexity (separate container, connection pooling, backups). |
| **SQLAlchemy** | 2.0.x | ORM | Type-safe database interactions, handles schema migrations via Alembic. 2.0 syntax is cleaner than 1.x. |
| **Alembic** | 1.13.x | Schema migrations | Manage database schema evolution as you add features. |

### Perceptual Hashing
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **imagehash** | 4.3.x | Perceptual hashing | Industry standard for duplicate detection. Supports multiple algorithms (average hash, perceptual hash, difference hash, wavelet hash). Pure Python, works with PIL/Pillow (which you already use). Use `phash` for best accuracy vs speed. |
| **Pillow** | 10.2.x | Image processing | Already in use - imagehash requires it. Handles image loading and manipulation. |

**Alternatives NOT recommended:**
- `dhash` (standalone): Less maintained, imagehash includes it
- `opencv-python`: Overkill, 500MB+ Docker image bloat for features you don't need
- Manual hash implementation: Reinventing wheel, imagehash is battle-tested

### Multi-threading & Task Queue
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Celery** | 5.3.x | Task queue | Handle long-running file processing in background. Required for web GUI responsiveness - can't block HTTP requests for minutes while processing thousands of files. Better than raw threading for cancellation, retries, progress tracking. |
| **Redis** | 7.2.x (Alpine) | Message broker | Celery backend. Lightweight, fast, simple Docker deployment. RabbitMQ is heavier and more complex than needed. |

**Why NOT raw threading:**
- Hard to cancel operations from web UI
- No built-in progress tracking
- Difficult to restart interrupted jobs
- No retry logic for transient failures

### Docker & Deployment
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Python** | 3.11-slim | Base image | Slim variant = 50% smaller than standard Python image. 3.11 has performance improvements over 3.9/3.10 (up to 25% faster). 3.12 not yet widely supported by all libraries. |
| **docker-compose** | 3.8+ | Multi-container orchestration | Manage Flask app, Celery worker, Redis broker as single stack. Volume mounts for input/output directories and SQLite database. |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **PyExifTool** | 0.5.x | EXIF manipulation | Already in use - continue using it |
| **python-dotenv** | 1.0.x | Environment configuration | Manage Docker environment variables cleanly |
| **Flask-CORS** | 4.0.x | CORS headers | If building separate frontend later |
| **pytest** | 7.4.x | Testing | Test duplicate detection logic, datetime parsing |
| **Black** | 23.12.x | Code formatter | Maintain code consistency |
| **Ruff** | 0.1.x | Linter | Fast linting, replaces pylint/flake8/isort |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Web Framework | **Flask** | Django | Django's batteries-included approach (ORM, admin, auth system) is unnecessary overhead. You have working CLI code - Flask wraps it with minimal changes. Django forces restructuring into apps/models/views pattern. |
| Web Framework | **Flask** | FastAPI | FastAPI is great for APIs but overkill for household-facing web GUI. Async complexity not needed - file processing already in background via Celery. Type hints nice but not critical for this use case. |
| Database | **SQLite** | PostgreSQL | PostgreSQL requires separate Docker container, connection management, backup strategy. SQLite = single file, simple volume mount, zero config. At tens of thousands of files (not millions), SQLite handles this fine. |
| Perceptual Hash | **imagehash** | photohash | Less maintained (last update 2019), imagehash more actively developed |
| Task Queue | **Celery** | RQ (Redis Queue) | RQ simpler but less powerful - no retry logic, weaker monitoring, no ETA/countdown for delayed tasks. Celery worth the complexity for long-running media processing. |
| Task Queue | **Celery** | Raw threading | No progress tracking, hard to cancel, no failure recovery. Household users need "Cancel" button that actually works. |

## Installation

### requirements.txt
```
# Web Framework
Flask==3.0.0
Flask-SocketIO==5.3.6
gunicorn==21.2.0

# Database
SQLAlchemy==2.0.23
alembic==1.13.1

# Task Queue
celery==5.3.4
redis==5.0.1

# Image Processing & Hashing
Pillow==10.2.0
imagehash==4.3.1
PyExifTool==0.5.6

# Utilities
python-dotenv==1.0.0
Flask-CORS==4.0.0

# Development
pytest==7.4.3
black==23.12.1
ruff==0.1.9
```

### Docker Setup
```dockerfile
# Dockerfile
FROM python:3.11-slim

# Install ExifTool system dependency
RUN apt-get update && apt-get install -y \
    exiftool \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "300", "app:app"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "5000:5000"
    volumes:
      - ./data:/data
      - ./output:/output
      - ./database:/database
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - DATABASE_PATH=/database/media.db
    depends_on:
      - redis

  celery:
    build: .
    command: celery -A app.celery worker --loglevel=info
    volumes:
      - ./data:/data
      - ./output:/output
      - ./database:/database
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - DATABASE_PATH=/database/media.db
    depends_on:
      - redis

  redis:
    image: redis:7.2-alpine
    ports:
      - "6379:6379"
```

## Architecture Notes

### Why This Stack Works for Your Use Case

**Brownfield-friendly:**
- Flask wraps existing `PhotoTimeFixer.py` logic without refactoring
- Keep existing PyExifTool, PIL, datetime parsing code
- Add web routes that call your existing functions

**Household-scale appropriate:**
- SQLite handles tens of thousands of files easily (millions would need PostgreSQL)
- No separate database server to manage
- Single docker-compose up command for non-technical deployment

**Real-time feedback:**
- Flask-SocketIO pushes progress updates to browser
- Celery reports task progress (e.g., "Processing file 1247 of 10523")
- Users see spinning progress bars, not frozen screens

**Duplicate detection:**
- imagehash generates perceptual hashes in ~50ms per image
- Store hashes in SQLite with file paths
- Compare new files against existing hashes with Hamming distance
- Threshold of 5-10 bits difference catches near-duplicates

### Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Generate perceptual hash | ~50ms/image | Using imagehash phash algorithm |
| Compare hash against DB | <1ms | SQLite indexed lookups |
| Process 10K images | ~8-12 minutes | Celery worker, single thread |
| Database size | ~2MB per 10K files | Hashes + metadata |

### Migration Strategy

**Phase 1: Add Database**
- Create SQLAlchemy models for files, hashes
- Alembic migration for initial schema
- Scan existing output directory, populate database

**Phase 2: Add Web UI**
- Flask routes for file upload, duplicate detection
- HTML/JS frontend with progress tracking
- SocketIO for real-time updates

**Phase 3: Add Background Processing**
- Celery tasks wrapping existing PhotoTimeFixer logic
- Redis for task queue
- Progress reporting via SocketIO

## What NOT to Use

### Avoid These Technologies

**Next.js/React frontend:**
- Overkill for household tool
- HTML templates with minimal JS sufficient
- Non-technical users don't care about SPA

**MongoDB:**
- Structured data (file paths, hashes, timestamps) = relational model
- SQLite perfect fit, no need for document store

**Kubernetes:**
- Single-household deployment = Docker Compose sufficient
- K8s adds operational complexity with zero benefit

**Apache/Nginx reverse proxy:**
- Gunicorn handles HTTP fine for household scale
- Add nginx later only if serving large media files directly

## Confidence Assessment

| Component | Confidence | Reasoning |
|-----------|------------|-----------|
| Flask vs Django | HIGH | Flask's lightweight nature perfect for brownfield additions. Django's structure would require major refactoring. |
| SQLite vs PostgreSQL | HIGH | Household scale (tens of thousands) well within SQLite capabilities. PostgreSQL operational overhead unjustified. |
| imagehash | MEDIUM | Standard library for perceptual hashing as of Jan 2025 training data. Should verify current version/alternatives via web search. |
| Celery + Redis | HIGH | Industry-standard async task queue for Python. Required for responsive web UI during long operations. |
| Python 3.11 | MEDIUM | Good balance of stability and performance. 3.12 may be preferred by Feb 2026 - verify adoption. |
| Gunicorn | HIGH | Standard WSGI server for Flask production deployments. |

## Sources

**Note:** WebSearch unavailable during research. All recommendations based on training data through January 2025. Key recommendations (Flask, SQLite, imagehash, Celery) are well-established patterns, but versions should be verified against current releases.

**Recommended verification steps:**
1. Check imagehash current version and alternatives (2025/2026 landscape may have shifted)
2. Verify Python 3.11 vs 3.12 adoption for production use
3. Confirm Flask 3.x stability (was in active development in late 2024)
4. Check for newer perceptual hashing libraries (e.g., AI-based approaches)

**Training data confidence:**
- Flask/Django comparison: HIGH (stable ecosystem)
- SQLite capabilities: HIGH (well-documented performance characteristics)
- imagehash API: MEDIUM (may have updates)
- Docker best practices: HIGH (slow-moving ecosystem)
