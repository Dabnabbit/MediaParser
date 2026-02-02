---
phase: 01-foundation-architecture
plan: 01
subsystem: infrastructure
status: complete
tags: [flask, configuration, pathlib, timezone, application-factory]
requires: []
provides:
  - Application factory pattern (create_app)
  - Pathlib-based configuration system
  - Configurable timezone handling
  - Storage directory structure
  - SQLAlchemy integration setup
affects:
  - 01-02: Database models will use db instance from app/__init__.py
  - 01-03: Background workers will import app configuration
  - 02-*: All import/processing logic will use pathlib paths from config
tech-stack:
  added:
    - flask>=3.1.0
    - flask-sqlalchemy>=3.1.0
    - sqlalchemy>=2.0.0
    - huey>=2.6.0
    - python-dotenv>=1.0.0
  patterns:
    - Application factory pattern
    - Environment-based configuration
    - Pathlib for filesystem operations
key-files:
  created:
    - config.py
    - app/__init__.py
    - requirements.txt
    - .env.example
    - storage/uploads/.gitkeep
    - storage/processing/.gitkeep
    - storage/output/.gitkeep
    - instance/.gitkeep
  modified:
    - .gitignore
decisions:
  - Use Flask application factory pattern for testability and multi-environment support
  - Store configuration at project root (config.py) not in app/ for import simplicity
  - Use zoneinfo (standard library) over pytz for timezone validation
  - Auto-create directories on startup rather than require manual setup
  - Use .gitkeep to preserve empty directory structure in git
metrics:
  duration: "2m 7s"
  tasks_completed: 2
  tasks_planned: 2
  files_created: 9
  files_modified: 1
  commits: 2
completed: 2026-02-02
---

# Phase 01 Plan 01: Flask Application Scaffold Summary

**One-liner:** Flask application factory with pathlib-based paths and configurable timezone using environment variables

## What Was Built

### Configuration System (config.py)

Created a layered configuration system with base Config class and environment-specific subclasses (DevelopmentConfig, ProductionConfig). All file paths use pathlib.Path instead of string concatenation, addressing INFRA-05 (hardcoded Windows paths).

**Key features:**
- BASE_DIR, INSTANCE_DIR, STORAGE_DIR calculated from `Path(__file__).parent.absolute()`
- UPLOAD_FOLDER, PROCESSING_FOLDER, OUTPUT_FOLDER are Path objects
- TIMEZONE configurable via environment variable (default: America/New_York), addressing INFRA-04
- Timezone validation using zoneinfo.ZoneInfo
- SQLAlchemy configuration with SQLite database in instance directory
- Environment-specific settings (DEBUG, SQLALCHEMY_ECHO)

### Application Factory (app/__init__.py)

Implemented Flask application factory pattern following best practices:
- `create_app(config_name)` function returns configured Flask instance
- SQLAlchemy integration with custom DeclarativeBase
- `ensure_directories()` function creates storage directories on startup
- Validates timezone configuration on app creation
- Sets up database with app context

### Storage Structure

Created four-tier storage system:
- **storage/uploads/**: User-uploaded original files
- **storage/processing/**: Temporary workspace for processing operations
- **storage/output/**: Processed files organized by year
- **instance/**: Instance-specific files (database, local config overrides)

All directories tracked in git with .gitkeep files, contents ignored.

### Dependencies (requirements.txt)

Listed core Phase 1 dependencies:
- Flask web framework and SQLAlchemy ORM
- Huey for background job queue (Phase 1 Plan 3)
- python-dotenv for environment variable management
- tzdata for timezone support
- pyexiftool and pillow (existing dependencies from PhotoTimeFixer.py)

### Configuration Documentation (.env.example)

Documented all environment variables with usage instructions:
- FLASK_APP, FLASK_ENV
- SECRET_KEY with security warning
- TIMEZONE with IANA identifier examples and explanation of replacing hardcoded offset

## Technical Implementation

### Timezone Handling

Replaced hardcoded `timezone_hours = -4` with configurable TIMEZONE environment variable:

**Before (PhotoTimeFixer.py line 244):**
```python
timezone_hours = -4  # Hardcoded Eastern Time offset
```

**After (config.py):**
```python
TIMEZONE = os.environ.get('TIMEZONE', 'America/New_York')

@classmethod
def validate_timezone(cls):
    try:
        ZoneInfo(cls.TIMEZONE)
        return True
    except Exception as e:
        raise ValueError(f"Invalid TIMEZONE '{cls.TIMEZONE}': {e}")
```

Uses Python 3.9+ zoneinfo (standard library) for validation, avoiding external pytz dependency.

### Path Handling

All paths use pathlib.Path with proper composition:

```python
BASE_DIR = Path(__file__).parent.absolute()
STORAGE_DIR = BASE_DIR / 'storage'
UPLOAD_FOLDER = STORAGE_DIR / 'uploads'
```

**Benefits:**
- Platform-independent (works on Windows, Linux, macOS)
- Type-safe (Path objects, not strings)
- Cleaner syntax (/ operator for joining)
- Better path manipulation (parent, stem, suffix, etc.)

### Directory Auto-creation

Application startup ensures storage directories exist:

```python
def ensure_directories(app):
    for folder_key in ['UPLOAD_FOLDER', 'PROCESSING_FOLDER', 'OUTPUT_FOLDER']:
        path = app.config[folder_key]
        path.mkdir(parents=True, exist_ok=True)
```

Called in `create_app()` after config loading, before returning app instance.

## Verification Results

All verification criteria passed:

1. **Config import and timezone:** ✓
   ```
   python -c "from config import DevelopmentConfig; print(DevelopmentConfig.TIMEZONE)"
   Output: America/New_York
   ```

2. **Storage directories:** ✓
   ```
   ls storage/*/.gitkeep
   Output: output/.gitkeep processing/.gitkeep uploads/.gitkeep
   ```

3. **No hardcoded Windows paths in new code:** ✓
   ```
   grep -r "D:/Work" . --include="*.py" (excluding PhotoTimeFixer.py)
   Output: (none)
   ```

4. **Hardcoded timezone only in original code:** ✓
   ```
   grep -r "timezone_hours = -4" . --include="*.py"
   Output: PhotoTimeFixer.py:244 (expected, not yet refactored)
   ```

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Met

- [x] Flask application factory pattern implemented
- [x] Configuration uses pathlib.Path for all file paths
- [x] Timezone configurable via TIMEZONE environment variable (default America/New_York)
- [x] Storage directories created automatically on app startup
- [x] requirements.txt lists all dependencies for Phase 1
- [x] No hardcoded Windows paths in new code

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use zoneinfo over pytz | Standard library in Python 3.9+, one less dependency | Config validation method |
| Config at root not in app/ | Simpler imports, Flask convention for single-app projects | Import paths throughout |
| Auto-create directories | Better developer experience, prevents "directory not found" errors | Startup behavior |
| .gitkeep pattern | Preserves directory structure in git without committing contents | Repository structure |

## Files Created/Modified

### Created
- `config.py` (67 lines) - Configuration classes with pathlib and timezone
- `app/__init__.py` (69 lines) - Application factory with database setup
- `requirements.txt` (17 lines) - Python dependencies
- `.env.example` (15 lines) - Environment variable documentation
- `storage/uploads/.gitkeep` - Preserve uploads directory
- `storage/processing/.gitkeep` - Preserve processing directory
- `storage/output/.gitkeep` - Preserve output directory
- `instance/.gitkeep` - Preserve instance directory

### Modified
- `.gitignore` (29 lines) - Ignore storage contents, databases, cache, environments

## Git Commits

1. **3db0ec0** - feat(01-01): create Flask application scaffold with configuration system
   - config.py, app/__init__.py, requirements.txt, .env.example

2. **f0cf8c1** - feat(01-01): create storage directory structure
   - .gitignore, storage/.gitkeep files, instance/.gitkeep

## Next Phase Readiness

**Phase 01 Plan 02 (Database Models):**
- ✓ SQLAlchemy db instance available at `app.db`
- ✓ Base declarative class defined
- ✓ Database URI configured (instance/mediaparser.db)
- ✓ Can import and extend Base for model definitions

**Phase 01 Plan 03 (Background Workers):**
- ✓ Huey dependency listed in requirements.txt
- ✓ Configuration system ready for Huey config
- ✓ Storage directories available for file operations

**Phase 02 (File Import):**
- ✓ UPLOAD_FOLDER, PROCESSING_FOLDER, OUTPUT_FOLDER configured
- ✓ Pathlib patterns established for file operations
- ✓ Timezone configuration ready for timestamp handling

**Blockers:** None

**Concerns:** None - foundation is clean and extensible

## Performance Notes

- Execution time: 2 minutes 7 seconds
- Fast iteration due to no external dependencies required for verification
- Configuration validation is instant (zoneinfo lookup)
- Directory creation is idempotent and fast

## Testing Notes

**Manual verification performed:**
- Config imports successfully
- Timezone validation works
- Pathlib paths are correct type
- Directory auto-creation works
- No syntax errors in Python files

**Future testing:**
- Unit tests for Config.validate_timezone()
- Unit tests for ensure_directories()
- Integration tests for create_app()
- Test with invalid TIMEZONE values
- Test with missing storage directories

## Documentation Impact

**Updated:**
- .gitignore documented with comments explaining each section
- .env.example provides full configuration guide

**For project README (future):**
- Configuration section: Environment variables and their defaults
- Setup section: Mention .env file creation from .env.example
- Development section: Document Flask application factory pattern

## Architectural Notes

This plan establishes foundational patterns that will be used throughout:

1. **Pathlib everywhere:** All file operations use Path objects, not strings
2. **Environment-based config:** All environment-specific values come from os.environ
3. **Application factory:** Testable, allows multiple app instances with different configs
4. **Auto-setup:** Application handles its own directory structure, no manual setup

These patterns prevent common issues:
- Platform-specific path separators
- Hardcoded deployment-specific values
- Difficult testing due to global state
- Fragile deployment requiring manual directory creation

## Related Requirements

- **INFRA-04** (Fix hardcoded timezone): ✓ Addressed with TIMEZONE environment variable
- **INFRA-05** (Remove hardcoded paths): ✓ Addressed with pathlib.Path throughout configuration

Original PhotoTimeFixer.py still has these issues (lines 13-14, 244) - will be refactored in Phase 02 when migrating timestamp detection logic.
