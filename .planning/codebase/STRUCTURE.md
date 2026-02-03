# Codebase Structure

**Analysis Date:** 2026-02-02
**Updated:** 2026-02-02 (WSL migration, Flask app structure)

> **Note:** Structure significantly expanded with Flask web application (Phases 1-3).
> Original CLI script preserved as `PhotoTimeFixer.py` for reference.

## Directory Layout

```
/home/dab/Projects/MediaParser/
├── .git/                      # Git repository metadata
├── .planning/                 # GSD planning and analysis documents
├── .venv/                     # Python virtual environment
├── app/                       # Flask application package
│   ├── __init__.py           # App factory (create_app)
│   ├── models.py             # SQLAlchemy models (File, Job, Duplicate, etc.)
│   ├── lib/                  # Library modules
│   │   ├── confidence.py     # Timestamp confidence scoring
│   │   ├── hashing.py        # SHA256 and perceptual hashing
│   │   ├── metadata.py       # EXIF extraction
│   │   ├── processing.py     # Single file processing pipeline
│   │   ├── thumbnail.py      # Thumbnail generation
│   │   └── timestamp.py      # Datetime parsing from filenames
│   ├── routes/               # Flask blueprints
│   │   ├── api.py            # Progress and current-job endpoints
│   │   ├── jobs.py           # Job management endpoints
│   │   ├── settings.py       # Settings API
│   │   └── upload.py         # File upload endpoints
│   ├── static/               # Frontend assets
│   │   ├── css/main.css      # Styles
│   │   ├── js/               # JavaScript modules
│   │   │   ├── upload.js     # Upload handling
│   │   │   ├── progress.js   # Progress polling
│   │   │   ├── results.js    # Results display
│   │   │   └── settings.js   # Settings panel
│   │   └── img/              # Static images
│   ├── templates/            # Jinja2 templates
│   └── tasks.py              # Huey background tasks
├── instance/                  # Instance-specific data (not committed)
│   ├── mediaparser.db        # SQLite database
│   └── huey_queue.db         # Huey task queue
├── storage/                   # File storage directories
│   ├── uploads/              # Uploaded files (job subdirectories)
│   ├── processing/           # Files being processed
│   └── output/               # Processed output
├── config.py                  # Configuration classes
├── huey_config.py            # Huey task queue configuration
├── run.py                    # Flask application entry point
├── PhotoTimeFixer.py         # Original CLI script (reference)
├── old/                      # Archived code
└── tests/                    # Test suite
```

## Directory Purposes

**Root Directory:**
- Purpose: Project root with Flask app configuration
- Key files: `run.py` (entry), `config.py` (configuration), `huey_config.py` (task queue)

**app/:**
- Purpose: Flask application package
- Key patterns: App factory (`create_app()`), blueprints for routes
- Models: SQLAlchemy 2.x with Mapped[] type hints

**app/lib/:**
- Purpose: Reusable library modules extracted from original CLI
- Contains: timestamp, metadata, hashing, confidence, processing, thumbnail
- Pattern: Functions accept `default_tz` parameter, return UTC datetimes

**app/routes/:**
- Purpose: Flask blueprints organized by feature
- Contains: api.py, jobs.py, settings.py, upload.py
- Pattern: JSON API responses, state validation

**storage/:**
- Purpose: File storage with job-based organization
- Contains: uploads/job_{id}/, processing/, output/
- Created: Automatically on app startup

**instance/:**
- Purpose: Instance-specific data (databases)
- Contains: mediaparser.db (SQLite), huey_queue.db (task queue)
- Committed: No (gitignored)

---

## Legacy Reference (Original CLI)

The following documents the original `PhotoTimeFixer.py` structure for reference:

**exiftool_files/:**
- Purpose: Bundled Perl libraries and modules for exiftool binary
- Contains: Archive, compression, image processing, and system Perl libraries
- Generated: Yes (bundled distribution)
- Committed: Yes (part of repository for portability)
- Note: Large directory (~500+ subdirectories) providing exiftool runtime dependencies

**old/:**
- Purpose: Archive of previous implementations and experimental versions
- Contains: Earlier `PhotoTimeFixer.py` and test script (`minimal_test.py`)
- Generated: No (manual archive)
- Committed: Yes (version history)

**TestImages/:**
- Purpose: Test media files for validation and development
- Contains: Sample JPG, PNG, MP4 files (various sources)
- Generated: No (manually added)
- Committed: No (ignored in .gitignore)
- Note: Contains 106 test files (~50MB) for validating processing logic

**.planning/codebase/:**
- Purpose: Architecture and design documentation (GSD output)
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md
- Generated: Yes (via GSD mapping)
- Committed: Yes

## Key File Locations

**Entry Points:**
- `PhotoTimeFixer.py` (lines 277-279): Primary script entry point with `__main__` guard and timer initialization

**Configuration:**
- `PhotoTimeFixer.py` (lines 1-46): Module-level constants defining:
  - Input directory: `documents_dir`
  - Output directory: `output_dir`
  - Processing options: `output_dir_years`, `output_dir_clear`
  - Validation patterns: `valid_extensions`, `valid_date_regex`, `valid_time_regex`, `valid_timezone_regex`
  - Metadata field mappings: `meta_filetype_tags`, `meta_datetime_tags`, `meta_ignored_tags`, `meta_ensured_tags`, `meta_comment_tags`

**Core Logic:**
- `PhotoTimeFixer.py` (lines 48-220): `Main()` function containing:
  - Directory traversal and file discovery
  - Metadata extraction and datetime resolution
  - Output routing and filename generation
  - File copying and metadata writing
  - Error handling and result reporting

**Utilities:**
- `PhotoTimeFixer.py` (lines 223-233): `get_datetime_from_name(document_name: str)` - Extract datetime from filename
- `PhotoTimeFixer.py` (lines 236-276): `convert_str_to_datetime(input_string: str)` - Parse datetime strings with timezone handling

**Console Formatting:**
- `PhotoTimeFixer.py` (lines 34-43): `bcolors` class with ANSI escape codes for colored terminal output

## Naming Conventions

**Files:**
- Python source: `PascalCase.py` (e.g., `PhotoTimeFixer.py`)
- Test/utility: `snake_case.py` (e.g., `minimal_test.py`)
- Bundled binary: Lowercase (e.g., `exiftool.exe`)
- Output: Timestamp-based (YYYYMMDD_HHMMSS.{extension})

**Functions:**
- Main entry: `Main()` (PascalCase, matches Python convention for type names, used here for main function)
- Helper functions: `snake_case()` (e.g., `get_datetime_from_name()`, `convert_str_to_datetime()`)

**Variables:**
- Global constants: `UPPER_CASE` or `snake_case` (mixed convention, e.g., `documents_dir`, `valid_extensions`, `valid_date_regex`)
- Local variables: `snake_case` (e.g., `document_name`, `output_datetime`, `meta_datetimes1`)
- Collections: `descriptive_plural_snake_case` (e.g., `check_these_files`, `meta_error_files`, `directory_list`)

**Types/Classes:**
- Color code class: `PascalCase` (e.g., `bcolors`)
- Function parameter types: Use `typing` module annotations where present (e.g., `Optional[datetime.datetime]`)

**Constants:**
- Regex patterns: `snake_case_regex` (e.g., `valid_date_regex`, `valid_time_regex`)
- Collections of metadata tags: `meta_{purpose}_tags` (e.g., `meta_filetype_tags`, `meta_datetime_tags`)
- Configuration options: `output_{setting}` (e.g., `output_dir`, `output_dir_years`)

## Where to Add New Code

**New Feature (Data Processing):**
- Primary code: `PhotoTimeFixer.py` within or extending `Main()` function (lines 48-220)
- Helper logic: Add new function in `PhotoTimeFixer.py` after line 276 (after existing helpers)
- Pattern: Create function with type hints, call from appropriate point in `Main()`

**New Validation/Parsing Rule:**
- Add regex constant: Module-level constants section (lines 1-46)
- Add usage: In `Main()` processing loop (lines 64-206) or in helper functions (lines 223-276)
- Pattern: Define as `valid_{purpose}_regex` tuple or string constant

**New Metadata Field:**
- Add to appropriate collection: Lines 25-30 (meta_*_tags constants)
- Update processing logic: In `Main()` function where those tags are used (lines 109-206)
- Pattern: Tag values use `'Namespace:FieldName'` format consistent with exiftool output

**Output Subdirectory:**
- Update routing logic: Lines 156-165 in `Main()` function
- Add folder creation: Use `os.makedirs()` pattern as shown in lines 160-161, 163-165
- Pattern: Directory assignment based on file confidence level or status

**New Error Type:**
- Create tracking list: Add to `Main()` function local scope, similar to `check_these_files`, `meta_error_files` (lines 62-63)
- Add categorization: In exception handling (lines 195-205) or processing logic
- Add reporting: Append to output reporting section (lines 208-220)

**Utilities/Shared Code:**
- Location: Add as module-level function in `PhotoTimeFixer.py`
- Pattern: All code currently in single file; no module imports from project

## Special Directories

**exiftool_files/:**
- Purpose: Runtime dependencies for exiftool binary
- Generated: Yes (bundled from exiftool Perl distribution)
- Committed: Yes
- Modification: Do not modify; regenerate by updating exiftool binary version

**TestImages/:**
- Purpose: Test data for development and validation
- Generated: No
- Committed: No (in .gitignore)
- Modification: Can add/modify test files as needed; excluded from version control

**__pycache__/:**
- Purpose: Python compiled bytecode cache
- Generated: Yes (automatic by Python interpreter)
- Committed: No (should be in .gitignore, currently appears in output)
- Modification: Safe to delete; regenerates on next run

**.git/:**
- Purpose: Git version control metadata
- Generated: Yes (by `git init` or clone)
- Committed: No (special directory)
- Modification: Do not modify directly; use git commands

**.planning/**
- Purpose: GSD (Get-Stuff-Done) orchestrator planning and analysis documents
- Generated: Yes (via `/gsd:map-codebase` and `/gsd:plan-phase` commands)
- Committed: Yes (tracked for planning continuity)
- Modification: Generated by orchestrator; read by planning/execution phases

## Code Organization Principles

**Current State (Flask App):**
- **Modular structure**: Flask app factory pattern with blueprints
- **Library extraction**: Core logic in `app/lib/` modules
- **Background processing**: Huey task queue with ThreadPoolExecutor
- **Type safety**: SQLAlchemy 2.x with Mapped[] annotations

**Implications for New Code:**
- Routes: Add blueprints in `app/routes/`, register in `app/__init__.py`
- Library logic: Add modules in `app/lib/`, import where needed
- Models: Add to `app/models.py` with Mapped[] type hints
- Frontend: JS modules in `app/static/js/`, follow handler class pattern
- Tasks: Add to `app/tasks.py` with `get_app()` pattern for Flask context

**Key Patterns:**
- Use `pathlib.Path` for all file paths
- Return dicts from worker threads (main thread commits to DB)
- All datetime handling uses UTC internally with configurable display timezone
- Config via environment variables (see `config.py`)

---

*Structure analysis: 2026-02-02*
*Updated for Flask app: 2026-02-02*
