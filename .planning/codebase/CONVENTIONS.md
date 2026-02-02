# Coding Conventions

**Analysis Date:** 2026-02-02

## Naming Patterns

**Files:**
- Snake_case for all Python files: `PhotoTimeFixer.py`, `minimal_test.py`
- Descriptive, purpose-driven names matching functionality

**Functions:**
- PascalCase for main entry points: `Main()` (line 48 in `PhotoTimeFixer.py`)
- snake_case for utility functions: `get_datetime_from_name()`, `convert_str_to_datetime()`
- Descriptive names that clearly indicate purpose

**Variables:**
- snake_case for all variables: `documents_dir`, `output_dir`, `document_path`, `meta_datetimes1`
- Prefixes for related variables: `output_dir`, `output_path`, `output_datetime`, `output_document_name`
- Descriptive compound names: `meta_filetype_tags`, `check_these_files`, `meta_error_files`
- Loop variables use underscore prefix: `for directory_name in directory_list` (explicit, not abbreviated)

**Types:**
- Classes use PascalCase: `class bcolors` (line 34 in `PhotoTimeFixer.py`)
- Type hints used in function signatures: `def get_datetime_from_name(document_name: str) -> Optional[datetime.datetime]` (line 223)
- Return types consistently annotated with `Optional[]` for nullable returns

**Constants:**
- UPPER_CASE with underscores: `valid_extensions`, `valid_date_year_min`, `valid_date_year_max`, `valid_date_regex`, `valid_time_regex`
- Module-level constants defined at top of file (lines 13-30 in `PhotoTimeFixer.py`)

## Code Style

**Formatting:**
- No explicit formatter detected (no .prettier, black, or autopep8 config)
- Lines are up to ~120 characters long
- String concatenation used for long print statements with color codes
- F-strings for formatted output: `f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s:...{bcolors.ENDC}'`
- Spacing: 4-space indentation (Python standard)

**Linting:**
- No linting configuration files detected (.flake8, .pylintrc, pyproject.toml)
- Code follows general Python conventions but not strictly enforced
- Some style inconsistencies present (e.g., multiple imports on single line at line 1: `import os, re, datetime, time, shutil`)

## Import Organization

**Order:**
1. Standard library: `os, re, datetime, time, shutil`
2. Type hints: `from typing import Optional`
3. External packages: `import exiftool`, `from PIL import Image`
4. Commented/alternative imports for experimental code

**Path Aliases:**
- Not used; direct imports from packages

**Import Style:**
```python
import os, re, datetime, time, shutil  # Multiple imports on one line
from typing import Optional
import exiftool  # PyExifTool
from PIL import Image  #  pillow
```

## Error Handling

**Patterns:**
- Try/except for external library operations (line 195-205 in `PhotoTimeFixer.py`):
```python
try:
    et.set_tags(output_document_path, tags=metadata_to_update, params=['-overwrite_original'])
except Exception as e:
    exception_type = type(e).__name__
    if exception_type == "ExifToolExecuteError":
        # Handle specific error type
        meta_error_files.append(...)
```
- Generic `Exception` catching with type inspection for error categorization
- No custom exception classes used
- Error messages collected and displayed at end of processing (lines 213-220)

**Return values for errors:**
- `None` or `False` used to indicate failed operations (lines 233, 238, 261, 276)
- Functions return `Optional[datetime.datetime]` when parsing may fail

## Logging

**Framework:**
- No logging module used
- Pure `print()` statements for all output (commented logging config at lines 9-10)

**Patterns:**
- Colored output using `bcolors` class (lines 34-43) with ANSI codes
- Status tracking with elapsed time: `f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s:...'`
- Multiple print levels for different message types:
  - INFO: `print(f'{bcolors.OKBLUE}...')` - standard messages
  - WARNING: `print(f'{bcolors.WARNING}...')` - attention needed
  - SUCCESS: `print(f'{bcolors.OKGREEN}...')` - operation completed
  - ERROR: `print(f'{bcolors.FAIL}...')` - failed operations

**Output examples from `PhotoTimeFixer.py`:**
```python
print(f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s:\tScanning {bcolors.OKCYAN}{directory_name + '/' + document_name}{bcolors.ENDC}')
print(f'{bcolors.WARNING}Low confidence found, check the following:{bcolors.ENDC}')
print(f'{bcolors.FAIL}MetaData Errors found, check the following:{bcolors.ENDC}')
```

## Comments

**When to Comment:**
- Used for disabled/experimental code (lines 5-10, 45, 59, etc.)
- Special algorithm markers: `#//-` prefix for significant function descriptions
  - Line 222: `#//-Try to scan the document for dates...`
  - Line 235: `#//-Parse and convert date-time strings...`
- Debug comments marked with "hmm" prefix (lines 131, 240, 246, 254, 258, 268, 270, 271)
- Inline comments for clarification of metadata tags (line 3: `# PyExifTool`, line 6: `#  pillow`)

**JSDoc/TSDoc:**
- Not used; Python docstrings not present in main code
- Test file uses docstrings for function documentation (line 15, 270 in `minimal_test.py`)

## Function Design

**Size:**
- Main function (`Main()`) is monolithic at ~230 lines (lines 48-220)
- Utility functions are focused: `get_datetime_from_name()` ~11 lines, `convert_str_to_datetime()` ~40 lines
- Nested loops and conditionals within main function without extraction

**Parameters:**
- Functions take single parameters: `document_name: str`, `input_string: str`
- Main function uses module-level globals for configuration

**Return Values:**
- Utility functions return typed values: `Optional[datetime.datetime]`
- None used for failed parsing/missing data
- Functions return early on validation failures

## Module Design

**Exports:**
- Single entry point via `if __name__ == '__main__'` pattern (lines 277-279)
- Main module function called from entry point: `Main()`
- Helper functions available for import if needed

**Barrel Files:**
- Not used; single-file application structure

**Global State:**
- Configuration as module-level constants (lines 13-30): `documents_dir`, `output_dir`, `output_dir_years`, `output_dir_clear`
- Runtime state as module-level variable: `startTime` (line 46)
- Lists for error tracking declared at function level (lines 62-63)

---

*Convention analysis: 2026-02-02*
