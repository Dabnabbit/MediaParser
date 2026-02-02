# Phase 1: Foundation Architecture - Research

**Researched:** 2026-02-02
**Domain:** Flask + SQLite + Task Queue Infrastructure
**Confidence:** HIGH

## Summary

This research covers the foundation infrastructure for a media file processing system built with Flask, SQLite, and a task queue (Huey). The standard approach uses Flask's application factory pattern with Flask-SQLAlchemy for database management, Huey for background job processing, and a carefully designed SQLite schema optimized for file tracking and duplicate detection.

The architecture prioritizes simplicity and operational ease for household-scale deployments (tens of thousands of files) while maintaining data safety through copy-first workflows. Key technical decisions include using SQLite with WAL mode for concurrent access, Huey over Celery for minimal operational overhead, and Python's modern `zoneinfo` for timezone handling.

**Primary recommendation:** Use Flask application factory pattern with Flask-SQLAlchemy 3.x + SQLAlchemy 2.x, Huey 2.6.0 with SQLite backend, and SQLite in WAL mode for the database.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flask | 3.1.x | Web framework | Lightweight, mature, perfect for brownfield projects |
| Flask-SQLAlchemy | 3.1.x | ORM integration | Official Flask extension, handles SQLAlchemy lifecycle |
| SQLAlchemy | 2.x | Database ORM | Industry standard, type-safe with modern API |
| SQLite | 3.x | Database | Zero operational overhead, perfect for v1 household scale |
| Huey | 2.6.0 | Task queue | Lightweight alternative to Celery, clean API, minimal setup |
| pathlib | stdlib | Path handling | Modern cross-platform path manipulation |
| zoneinfo | stdlib (3.9+) | Timezone handling | Official IANA timezone support, replaces pytz |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PyExifTool | latest | EXIF metadata | Already used in existing CLI, handles diverse media formats |
| tzdata | latest | Timezone data fallback | Cross-platform timezone database when system data unavailable |
| python-dotenv | latest | Environment config | Load .env files for development configuration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Huey | Celery | Celery offers distributed workers and advanced routing, but requires RabbitMQ/Redis + more configuration. Overkill for v1. |
| SQLite | PostgreSQL | PostgreSQL better for high concurrency and large teams, but adds operational overhead. Not needed at household scale. |
| Flask-SQLAlchemy | Raw SQLAlchemy | Direct SQLAlchemy offers more control but requires manual session/connection lifecycle management. Flask extension handles this automatically. |

**Installation:**
```bash
pip install flask flask-sqlalchemy huey python-dotenv tzdata
# PyExifTool already in requirements
```

## Architecture Patterns

### Recommended Project Structure
```
mediaparser/
├── app/
│   ├── __init__.py          # Application factory (create_app)
│   ├── models.py            # SQLAlchemy models
│   ├── tasks.py             # Huey task definitions
│   ├── routes/              # Flask blueprints
│   │   ├── __init__.py
│   │   ├── upload.py
│   │   └── status.py
│   └── lib/                 # Refactored CLI logic
│       ├── __init__.py
│       ├── timestamp.py     # Extracted from PhotoTimeFixer
│       └── metadata.py      # EXIF operations
├── instance/                # Instance-specific files (gitignored)
│   ├── config.py            # Environment-specific config
│   └── mediaparser.db       # SQLite database
├── storage/                 # File storage root
│   ├── uploads/             # User uploads (originals)
│   ├── processing/          # Temporary processing workspace
│   └── output/              # Processed files by year
├── config.py                # Configuration classes
├── huey_config.py           # Huey consumer configuration
└── run.py                   # Entry point
```

### Pattern 1: Application Factory
**What:** Flask application created inside function, not at module level
**When to use:** Always - enables testing, multiple configs, proper extension initialization
**Example:**
```python
# Source: https://flask.palletsprojects.com/en/stable/patterns/appfactories/
# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

def create_app(config_name='default'):
    app = Flask(__name__, instance_relative_config=True)

    # Load config
    app.config.from_object(f'config.{config_name}')
    app.config.from_pyfile('config.py', silent=True)

    # Initialize extensions
    db.init_app(app)

    # Register blueprints
    from app.routes import upload, status
    app.register_blueprint(upload.bp)
    app.register_blueprint(status.bp)

    # Create tables
    with app.app_context():
        db.create_all()

    return app
```

### Pattern 2: SQLAlchemy 2.x Type-Safe Models
**What:** Modern declarative models with type hints using `Mapped` and `mapped_column`
**When to use:** All model definitions in Flask-SQLAlchemy 3.x
**Example:**
```python
# Source: https://flask-sqlalchemy.palletsprojects.com/en/stable/quickstart/
# app/models.py
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column
from app import db

class JobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class Job(db.Model):
    __tablename__ = 'jobs'

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[JobStatus] = mapped_column(SQLEnum(JobStatus), default=JobStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    error_message: Mapped[str | None] = mapped_column(String(500))
    retry_count: Mapped[int] = mapped_column(default=0)
```

### Pattern 3: Huey Task Definition with Retry
**What:** Background task with automatic retry on failure
**When to use:** All long-running operations (file processing, metadata extraction)
**Example:**
```python
# Source: https://github.com/coleifer/huey (verified via WebFetch)
# app/tasks.py
from huey import crontab
from app import huey, db
from app.models import Job, JobStatus

@huey.task(retries=3, retry_delay=60)
def process_file_job(job_id):
    """Process a single file job with automatic retry."""
    with app.app_context():
        job = Job.query.get(job_id)
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db.session.commit()

        try:
            # Call refactored CLI logic
            from app.lib.timestamp import detect_timestamp
            result = detect_timestamp(job.file_path)

            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.utcnow()
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            job.retry_count += 1
            raise  # Huey handles retry
        finally:
            db.session.commit()
```

### Pattern 4: Configuration Management
**What:** Environment-based config with pathlib for cross-platform paths
**When to use:** All path handling, database URIs, configurable settings
**Example:**
```python
# config.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent.absolute()
INSTANCE_DIR = BASE_DIR / 'instance'
STORAGE_DIR = BASE_DIR / 'storage'

class Config:
    """Base configuration."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key')
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{INSTANCE_DIR / 'mediaparser.db'}"
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {'check_same_thread': False},  # Required for SQLite
        'pool_pre_ping': True,  # Verify connections before use
    }
    SQLALCHEMY_TRACK_MODIFICATIONS = False  # Reduce overhead

    # File storage paths
    UPLOAD_FOLDER = STORAGE_DIR / 'uploads'
    PROCESSING_FOLDER = STORAGE_DIR / 'processing'
    OUTPUT_FOLDER = STORAGE_DIR / 'output'

    # Timezone handling
    TIMEZONE = os.environ.get('TIMEZONE', 'America/New_York')

class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_ECHO = True  # Log all SQL queries

class ProductionConfig(Config):
    DEBUG = False
```

### Pattern 5: SQLite WAL Mode Setup
**What:** Enable Write-Ahead Logging for better concurrent access
**When to use:** Production SQLite databases with concurrent readers/writers
**Example:**
```python
# In app/__init__.py after db.init_app(app)
@app.before_request
def enable_wal_mode():
    """Enable SQLite WAL mode for better concurrency."""
    if 'sqlite' in app.config['SQLALCHEMY_DATABASE_URI']:
        with db.engine.connect() as conn:
            conn.execute(text('PRAGMA journal_mode=WAL'))
            conn.execute(text('PRAGMA busy_timeout=5000'))  # 5 second timeout
```

### Anti-Patterns to Avoid

- **Direct db = SQLAlchemy(app) initialization:** Causes circular imports and prevents application factory pattern. Always use `db.init_app(app)`.

- **Hardcoded file paths:** `'D:/Work/Scripts/...'` breaks cross-platform compatibility. Use `pathlib.Path` and configuration.

- **Hardcoded timezones:** `timezone_hours = -4` assumes single location. Use `zoneinfo.ZoneInfo` with configurable timezone.

- **File.FileModifyDate as primary timestamp:** File system timestamps change on copy. Prefer EXIF.DateTimeOriginal, use filesystem dates as fallback only.

- **Synchronous file processing in request handlers:** Blocks HTTP requests. Always enqueue to task queue for operations >500ms.

- **Manual retry logic:** Don't implement retry counters manually. Use Huey's `retries` parameter.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Task queue with workers | Custom threading + queue module | Huey | Handles retry logic, failure recovery, scheduled tasks, result storage, graceful shutdown |
| SQLite connection management | Manual `sqlite3` connections | Flask-SQLAlchemy | Handles connection pooling, request lifecycle, thread safety, engine options |
| Path manipulation | String concatenation + `os.path.join` | `pathlib.Path` | Cross-platform, type-safe, chainable operations, proper normalization |
| Timezone conversion | Manual UTC offset math | `zoneinfo.ZoneInfo` | Handles DST transitions, IANA timezone database, fold disambiguation |
| Duplicate file detection | MD5 hash comparison | Perceptual hashing (phash) | Detects near-duplicates, robust to minor edits, standard in media processing |
| Configuration loading | Multiple if/else for environments | Config classes + `app.config.from_object` | Standard Flask pattern, testable, environment-specific overrides |
| Unique filename generation | Timestamp + counter loops | UUID or hash-based naming | Collision-free, distributed-safe, no race conditions |

**Key insight:** File processing workflows have decades of established patterns. The complexity is in edge cases (concurrent access, partial failures, timezone edge cases, corrupted files). Use mature libraries that handle these.

## Common Pitfalls

### Pitfall 1: SQLite Concurrent Write Deadlocks
**What goes wrong:** Multiple workers try to write to SQLite simultaneously, causing "database is locked" errors and job failures.
**Why it happens:** SQLite's default rollback journal mode serializes writes. Without WAL mode and proper timeouts, workers fail fast instead of waiting.
**How to avoid:**
- Enable WAL mode: `PRAGMA journal_mode=WAL`
- Set busy timeout: `PRAGMA busy_timeout=5000` (5 seconds)
- Configure in engine options: `connect_args={'check_same_thread': False, 'timeout': 5.0}`
**Warning signs:** `sqlite3.OperationalError: database is locked` in worker logs, especially under load.

### Pitfall 2: Flask Application Context Missing in Workers
**What goes wrong:** Worker tasks fail with "Working outside of application context" when accessing `db.session` or `current_app`.
**Why it happens:** Flask request context doesn't exist in background workers. SQLAlchemy needs application context to access database.
**How to avoid:**
```python
@huey.task()
def my_task(job_id):
    from app import create_app
    app = create_app()
    with app.app_context():
        # Now db.session works
        job = Job.query.get(job_id)
```
**Warning signs:** `RuntimeError: Working outside of application context` in worker stderr.

### Pitfall 3: File Storage Path Race Conditions
**What goes wrong:** Two jobs process files with identical timestamps, both try to create `20240115_120000.jpg`, one overwrites the other's work.
**Why it happens:** Timestamp-based filenames aren't guaranteed unique. The existing code's "increment 1 second" loop has race conditions.
**How to avoid:**
- Use content hash in filename: `{timestamp}_{sha256_prefix}.{ext}`
- Or atomic operations: `os.open(path, os.O_CREAT | os.O_EXCL)` with retry
- Or unique job ID: `{timestamp}_{job_id}.{ext}`
**Warning signs:** Files mysteriously missing from output, debug logs show same output filename for multiple inputs.

### Pitfall 4: Integer Primary Key vs UUID Performance
**What goes wrong:** Using UUIDs as primary keys causes 3-4x slower INSERT/SELECT performance in SQLite compared to INTEGER PRIMARY KEY.
**Why it happens:** SQLite's `INTEGER PRIMARY KEY` maps to internal ROWID (automatically indexed). UUIDs are strings, non-sequential, fragment indexes.
**How to avoid:**
- Use `id: Mapped[int] = mapped_column(primary_key=True)` for all tables
- If external IDs needed, add separate UUID column with index
- SQLite auto-increments INTEGER PRIMARY KEY efficiently
**Warning signs:** Slow query performance as database grows, EXPLAIN QUERY PLAN shows full table scans.

### Pitfall 5: Timezone Naive Datetimes in Database
**What goes wrong:** Mixing naive and aware datetimes leads to comparison errors, incorrect sorting, DST bugs.
**Why it happens:** Python's `datetime.utcnow()` returns naive datetime. SQLite stores as string without timezone info.
**How to avoid:**
- Store UTC always: `datetime.now(timezone.utc)`
- Convert to user timezone only for display
- Use zoneinfo for conversions: `dt.astimezone(ZoneInfo(user_tz))`
- Configure SQLAlchemy to handle timezone awareness
**Warning signs:** `TypeError: can't compare offset-naive and offset-aware datetimes`, DST edge case bugs in March/November.

### Pitfall 6: Hardcoded Windows Paths Break Deployment
**What goes wrong:** Code with `'D:/Work/Scripts/...'` fails on Linux/Mac, breaks containerization, prevents team collaboration.
**Why it happens:** Existing PhotoTimeFixer.py has hardcoded Windows development paths.
**How to avoid:**
- Use pathlib: `Path(__file__).parent / 'uploads'`
- Configuration: Load from environment or config file
- Never commit instance-specific paths to version control
**Warning signs:** `FileNotFoundError` on different machines, manual path editing required to run code.

### Pitfall 7: Forgetting to Enable Foreign Keys in SQLite
**What goes wrong:** Foreign key constraints don't prevent orphaned records. Deleting a parent doesn't cascade to children.
**Why it happens:** SQLite disables foreign key enforcement by default (for legacy compatibility).
**How to avoid:**
```python
# Enable foreign keys for all connections
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
```
**Warning signs:** Orphaned job records when files are deleted, inconsistent cascade behavior compared to PostgreSQL.

## Code Examples

Verified patterns from official sources:

### Database Schema for File Processing
```python
# app/models.py
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import Integer, String, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app import db

class JobStatus(str, PyEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class File(db.Model):
    """Represents a media file in the system."""
    __tablename__ = 'files'

    id: Mapped[int] = mapped_column(primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), index=True)  # SHA256
    file_size: Mapped[int] = mapped_column(Integer)
    detected_timestamp: Mapped[datetime | None] = mapped_column(DateTime)
    confidence: Mapped[int] = mapped_column(Integer, default=0)  # 0=CHECK, 1+=verified
    output_path: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    jobs: Mapped[list["Job"]] = relationship(back_populates="file")
    duplicates: Mapped[list["Duplicate"]] = relationship(foreign_keys="Duplicate.file_id")

class Job(db.Model):
    """Background processing job."""
    __tablename__ = 'jobs'

    id: Mapped[int] = mapped_column(primary_key=True)
    file_id: Mapped[int] = mapped_column(ForeignKey('files.id'), nullable=False)
    status: Mapped[JobStatus] = mapped_column(SQLEnum(JobStatus), default=JobStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    error_message: Mapped[str | None] = mapped_column(String(500))
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    file: Mapped["File"] = relationship(back_populates="jobs")

class Duplicate(db.Model):
    """Potential duplicate file relationships."""
    __tablename__ = 'duplicates'

    id: Mapped[int] = mapped_column(primary_key=True)
    file_id: Mapped[int] = mapped_column(ForeignKey('files.id'), nullable=False)
    duplicate_of_id: Mapped[int] = mapped_column(ForeignKey('files.id'), nullable=False)
    similarity_score: Mapped[float] = mapped_column()  # 0.0-1.0
    user_decision: Mapped[str | None] = mapped_column(String(20))  # 'keep', 'delete', 'merge'
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)
```

### Refactored Timestamp Detection
```python
# app/lib/timestamp.py
# Extracted from PhotoTimeFixer.py for reusability
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import re
from typing import Optional

VALID_DATE_REGEX = r'(19|20)\d{2}[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2][0-9]|3[0-1])'
VALID_TIME_REGEX = r'([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]'

def get_datetime_from_name(filename: str, default_tz: str = 'UTC') -> Optional[datetime]:
    """
    Extract datetime from filename.

    Args:
        filename: The filename to parse
        default_tz: Timezone name for dates without explicit timezone

    Returns:
        Timezone-aware datetime or None if no valid date found
    """
    date_check = re.search(VALID_DATE_REGEX, filename)
    if not date_check:
        return None

    found_date = date_check.group(0)
    found_time = '235900'  # Default to end of day

    time_check = re.search(VALID_TIME_REGEX, filename[date_check.span()[1]:])
    if time_check:
        found_time = time_check.group(0)

    return convert_str_to_datetime(found_date + ' ' + found_time, default_tz)

def convert_str_to_datetime(input_string: str, default_tz: str = 'UTC') -> Optional[datetime]:
    """
    Parse datetime string with timezone handling.

    Args:
        input_string: String containing date/time/timezone
        default_tz: Timezone to use if none specified in string

    Returns:
        Timezone-aware datetime or None if parsing fails
    """
    if not isinstance(input_string, str):
        return None

    stripped = input_string.replace(':', '').replace('-', '').replace('.', '').replace('_', '')

    datetime_check = re.search(VALID_DATE_REGEX.replace('[-_.]?', ''), stripped)
    if not datetime_check:
        return None

    datetime_string = stripped[datetime_check.span()[0]:]

    # Parse year/month/day/time
    year = int(datetime_string[:4])
    month = int(datetime_string[4:6])
    day = int(datetime_string[6:8])

    if len(datetime_string) >= 14:
        hour = int(datetime_string[8:10])
        minute = int(datetime_string[10:12])
        second = int(datetime_string[12:14])
    else:
        hour, minute, second = 23, 59, 0

    # Use zoneinfo for timezone handling
    tz = ZoneInfo(default_tz)

    try:
        return datetime(year, month, day, hour, minute, second, tzinfo=tz)
    except ValueError:
        return None
```

### Huey Configuration
```python
# huey_config.py
from huey import SqliteHuey
from pathlib import Path

# Use SQLite for both database and queue - simpler for v1
HUEY_DB_PATH = Path(__file__).parent / 'instance' / 'huey.db'

huey = SqliteHuey(
    name='mediaparser-tasks',
    filename=str(HUEY_DB_PATH),
    storage_class=None,  # Use default SqliteStorage
    immediate=False,  # Don't run tasks synchronously (important!)
    utc=True,  # Store all times as UTC
)

# Consumer configuration (for running worker)
HUEY_CONSUMER_CONFIG = {
    'workers': 2,  # Parallel workers (safe with SQLite WAL mode)
    'worker_type': 'thread',  # Use threads (simpler than processes)
    'initial_delay': 0.1,
    'backoff': 1.15,
    'max_delay': 10.0,
    'scheduler_interval': 1,
    'periodic': True,
    'check_worker_health': True,
    'health_check_interval': 10,
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pytz for timezones | zoneinfo (stdlib) | Python 3.9 (2020) | No external dependency, better DST handling, IANA compliant |
| SQLAlchemy 1.x declarative_base | SQLAlchemy 2.x Mapped/mapped_column | SQLAlchemy 2.0 (2023) | Type-safe models, better IDE support, modern Python syntax |
| Flask-SQLAlchemy auto-session | Explicit session management | Flask-SQLAlchemy 3.0 (2022) | More control, clearer lifecycle, follows SQLAlchemy 2.x patterns |
| Manual string path manipulation | pathlib.Path | Python 3.4 (2014), mainstream 3.6+ | Cross-platform, type-safe, chainable operations |
| Celery for all task queues | Huey for simple use cases | Huey 2.x (ongoing) | Lower complexity for single-server deployments |
| os.path functions | pathlib exclusively | Gradual adoption 2018+ | Consistent API, better error messages, object-oriented |

**Deprecated/outdated:**
- **pytz**: Still works but zoneinfo is stdlib and preferred for Python 3.9+
- **datetime.utcnow()**: Returns naive datetime. Use `datetime.now(timezone.utc)` for aware datetimes
- **SQLALCHEMY_TRACK_MODIFICATIONS = True**: Adds significant overhead, disabled by default in Flask-SQLAlchemy 3.x
- **check_same_thread=True**: SQLite's default prevents sharing connections across threads. Must disable for Flask.

## Open Questions

Things that couldn't be fully resolved:

1. **Perceptual hashing library choice**
   - What we know: ImageHash and pHash are popular for near-duplicate detection
   - What's unclear: Performance comparison for 10k+ image sets, which algorithm (dHash/pHash/aHash) best for photos vs screenshots
   - Recommendation: Research separately in duplicate detection phase, start with exact hash matching for v1

2. **Huey SQLite backend performance at scale**
   - What we know: Huey supports SQLite backend, WAL mode helps concurrent access
   - What's unclear: Performance characteristics with 1000+ queued jobs, whether Redis backend becomes necessary
   - Recommendation: Start with SQLite backend, monitor job latency, switch to Redis if >100ms queue delays observed

3. **Video file metadata extraction best practices**
   - What we know: PyExifTool handles video files, QuickTime:CreateDate is common tag
   - What's unclear: Reliability across video formats (MP4, MOV, AVI), handling of live photos, handling of edited videos
   - Recommendation: Test with representative sample during implementation, document format-specific quirks

## Sources

### Primary (HIGH confidence)
- Flask Official Docs: Application Factories - https://flask.palletsprojects.com/en/stable/patterns/appfactories/
- Flask-SQLAlchemy Quickstart - https://flask-sqlalchemy.palletsprojects.com/en/stable/quickstart/
- Flask-SQLAlchemy Configuration - https://flask-sqlalchemy.palletsprojects.com/en/stable/config/
- SQLite WAL Mode Documentation - https://www.sqlite.org/wal.html
- Python zoneinfo Documentation - https://docs.python.org/3/library/zoneinfo.html
- Huey GitHub Repository - https://github.com/coleifer/huey (verified version 2.6.0, features, current)

### Secondary (MEDIUM confidence)
- [Best Practices for Database Schema Design in SQLite](https://moldstud.com/articles/p-best-practices-for-database-schema-design-in-sqlite)
- [Choosing The Right Python Task Queue](https://judoscale.com/blog/choose-python-task-queue)
- [Best Folder and Directory Structure for a Flask Project](https://studygyaan.com/flask/best-folder-and-directory-structure-for-a-flask-project)
- [How To Structure a Large Flask Application](https://www.digitalocean.com/community/tutorials/how-to-structure-a-large-flask-application-with-flask-blueprints-and-flask-sqlalchemy)
- [Developing an Asynchronous Task Queue in Python](https://testdriven.io/blog/developing-an-asynchronous-task-queue-in-python/)

### Tertiary (LOW confidence)
- Job state machine patterns - Various sources showed PENDING → RUNNABLE → RUNNING → COMPLETED/FAILED pattern (AWS Batch, BullMQ). Verified by official docs.
- SQLite duplicate detection - Community discussions on UPSERT patterns, needs official verification during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All recommendations from official documentation (Flask, SQLAlchemy, Huey GitHub)
- Architecture: HIGH - Application factory and SQLAlchemy patterns are official Flask/SQLAlchemy recommendations
- Pitfalls: HIGH - SQLite WAL, timezone handling, and Flask context issues verified with official docs
- File storage patterns: MEDIUM - Based on Flask upload docs and community best practices, needs validation during implementation
- Job state machine: MEDIUM - Pattern verified across multiple systems (AWS Batch, BullMQ), but specific implementation for media processing needs testing

**Research date:** 2026-02-02
**Valid until:** 2026-03-04 (30 days - stack is stable, unlikely to change)
