# Codebase Structure

**Analysis Date:** 2026-02-02

## Directory Layout

```
/mnt/d/Work/Scripts/MediaParser/
├── .git/                      # Git repository metadata
├── .planning/                 # GSD planning and analysis documents
│   └── codebase/             # This documentation directory
├── PhotoTimeFixer.py         # Main application entry point
├── exiftool.exe              # Bundled exiftool binary for Windows
├── exiftool_files/           # Bundled Perl/exiftool support libraries
├── TestImages/               # Test image samples (ignored in .gitignore)
├── old/                      # Previous versions and experimental code
│   ├── PhotoTimeFixer.py     # Earlier version (archived)
│   └── minimal_test.py       # Test harness for batch processing
├── .gitignore                # Git ignore rules
├── .gitattributes            # Git LFS or attribute rules
└── __pycache__/              # Python bytecode cache (ignored)
```

## Directory Purposes

**Root Directory:**
- Purpose: Project root containing main application and configuration
- Contains: Primary application file, bundled tools, test data
- Key files: `PhotoTimeFixer.py`

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

**Current State:**
- **Monolithic structure**: All code in single file `PhotoTimeFixer.py`
- **Linear execution**: Sequential processing within `Main()` function
- **Global configuration**: Module-level constants define behavior
- **No modules/classes**: Functional programming style with helper functions

**Implications for New Code:**
- New features should be added as functions in `PhotoTimeFixer.py`
- Avoid creating new Python files unless modularization becomes necessary
- Keep new code at module level or within `Main()` function as appropriate
- Follow existing naming conventions for consistency

---

*Structure analysis: 2026-02-02*
