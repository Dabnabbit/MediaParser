# Coding Conventions

**Analysis Date:** 2026-02-11

## Naming Patterns

**Files:**
- Python: snake_case for all files (`processing.py`, `confidence.py`, `huey_config.py`)
- JavaScript: kebab-case for multi-word files (`tile-manager.js`, `viewport-core.js`, `selection-actions.js`)
- CSS: kebab-case (`main.css`, `viewport.css`)
- Templates: snake_case (`index.html`, `base.html`)

**Functions:**
- Python: snake_case throughout (`process_single_file()`, `calculate_confidence()`, `get_datetime_from_name()`)
- JavaScript: camelCase (`morphToModes()`, `loadFilesForMode()`, `generateThumbnail()`)

**Variables:**
- Python: snake_case (`file_hash_sha256`, `timestamp_candidates`, `pending_updates`)
- JavaScript: camelCase (`currentMode`, `fileCount`, `selectedIds`)
- Constants: UPPER_SNAKE_CASE in both languages (`BATCH_COMMIT_SIZE`, `EXACT_THRESHOLD`, `ALLOWED_EXTENSIONS`)

**Classes/Models:**
- Python: PascalCase (`File`, `Job`, `JobStatus`, `ConfidenceLevel`)
- Enums: PascalCase with UPPER_CASE values (`JobStatus.RUNNING`, `ConfidenceLevel.HIGH`)

**Blueprints/Routes:**
- Blueprint names: lowercase (`'upload'`, `'jobs'`, `'api'`, `'settings'`, `'review'`)
- URL prefixes: some use `/api` prefix, some define it per-route
- Route functions: snake_case matching the endpoint action (`upload_files`, `get_job_status`, `submit_review`)

## Code Style

**Formatting:**
- Python: 4-space indentation, ~120 char line limit
- JavaScript: 4-space indentation (some files use 2-space)
- CSS: 4-space indentation with CSS custom properties (variables)
- No configured formatter (no black, prettier, or autopep8 config)

**String Formatting:**
- Python: f-strings throughout (`f"Job {job_id} completed"`)
- JavaScript: Template literals (`` `File ${file.id} reviewed` ``)

**Linting:**
- No explicit linting configuration (.flake8, .pylintrc, pyproject.toml)
- `# noqa` comments used sparingly for intentional patterns

## Import Organization

**Python:**
1. Standard library (`datetime`, `pathlib`, `json`, `os`, `logging`, `re`)
2. Third-party (`flask`, `sqlalchemy`, `huey`, `PIL`, `imagehash`, `exiftool`)
3. Local application (`from app import db`, `from app.models import ...`, `from app.lib.* import ...`)

**JavaScript:**
- No import/export system (vanilla JS loaded via `<script>` tags)
- Module pattern: Each file defines functions on global or namespaced objects
- Vendor scripts loaded first (`chrono.min.js`)

## Error Handling

**Python:**
- Per-file error capture in processing pipeline (errors returned in result dicts, not raised)
- Route-level try/except with JSON error responses and appropriate HTTP status codes
- Database rollback on route errors (`db.session.rollback()`)
- Task-level exception handling with Huey retries (2 retries, 30s delay)
- Error threshold: Jobs halt if >10% error rate after minimum sample

**JavaScript:**
- try/catch around fetch calls with user-facing error messages
- Graceful degradation (features disabled if dependent data unavailable)

## Logging

**Framework:** Python `logging` module

**Configuration:**
- `run_worker.py`: `logging.basicConfig()` with timestamped format to stdout
- `huey_config.py`: SQLAlchemy engine logger set to WARNING (reduce noise)
- Debug file: `/tmp/job_debug.log` for pause/resume state tracking

**Patterns:**
- Module-level loggers: `logger = logging.getLogger(__name__)`
- Levels used: `logger.debug()` for processing details, `logger.info()` for completions, `logger.warning()` for non-critical issues, `logger.error()` for failures
- All routes log significant actions (create, review, discard, export)

## Module Design

**Python Backend:**
- Application factory pattern with blueprint registration
- Processing library modules return plain dicts (no ORM access in worker threads)
- Task functions create own Flask app context for database access
- Models in single file (`models.py`) — all 7 models + 2 association tables

**JavaScript Frontend:**
- 28 modules loaded via script tags (no bundler)
- Modules communicate through global function calls and DOM events
- CSS uses custom properties for theming (`--bg-primary`, `--accent`, etc.)

## Function Design

**Processing functions (`app/lib/`):**
- Pure functions where possible (no database access)
- Return typed dicts for thread-safe results
- Type hints on all function signatures
- Docstrings with Args/Returns sections

**Route handlers:**
- JSON request/response pattern
- Input validation with descriptive error messages
- Consistent response shapes per endpoint

**Database queries:**
- SQLAlchemy 2.x query style (`db.session.get()`, `Model.query.filter()`)
- Pagination support (both offset/limit and page/per_page)
- Explicit eager/lazy loading awareness

## Comments

**When to Comment:**
- Module-level docstrings describing purpose and public API
- Function docstrings with Args/Returns/Example sections
- Inline comments for non-obvious logic (threshold values, algorithm choices)
- Section headers using `# ====` separators in longer files

**Not Commented:**
- Self-evident code (standard CRUD, simple conditionals)
- Each line in straightforward sequences

---

*Convention analysis: 2026-02-11*
