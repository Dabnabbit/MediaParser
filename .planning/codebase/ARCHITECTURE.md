# Architecture

**Analysis Date:** 2026-02-02

## Pattern Overview

**Overall:** Monolithic batch processor with single-entry procedural flow

**Key Characteristics:**
- Single-file application (`PhotoTimeFixer.py`) with no module separation
- Linear procedural execution triggered from `__main__` block
- Configuration values defined as global module-level constants
- Direct file I/O and exiftool integration in main processing loop
- Synchronous sequential processing of media files

## Layers

**Configuration & Setup Layer:**
- Purpose: Define processing parameters, validation rules, and constants
- Location: `PhotoTimeFixer.py` lines 1-46 (module-level constants and globals)
- Contains: Regex patterns, file extension lists, metadata tag definitions, global state
- Depends on: None (configuration is hardcoded)
- Used by: Main processing loop, helper functions

**Entry Point / Orchestration Layer:**
- Purpose: Coordinate overall program flow, file discovery, and result reporting
- Location: `PhotoTimeFixer.py` lines 48-220 (`Main()` function)
- Contains: Directory traversal, exiftool context management, error collection, output routing
- Depends on: Configuration layer, helper functions, exiftool library
- Used by: `__main__` block (line 277-279)

**Metadata Extraction & Parsing Layer:**
- Purpose: Extract and interpret temporal data from filenames and file metadata
- Location: `PhotoTimeFixer.py` lines 223-276 (`get_datetime_from_name()`, `convert_str_to_datetime()`)
- Contains: Regex-based date/time parsing, timezone handling, validation
- Depends on: Configuration layer (regex patterns, year bounds)
- Used by: Main processing loop

**File Operations Layer:**
- Purpose: Copy files to output directory, detect duplicates, handle conflicts
- Location: `PhotoTimeFixer.py` lines 168-206 (within `Main()` function)
- Contains: File copying with `shutil.copy2()`, collision detection via file existence checking
- Depends on: File system, configuration layer
- Used by: Main processing loop

**Metadata Writing Layer:**
- Purpose: Update EXIF/file metadata with determined timestamps and tags
- Location: `PhotoTimeFixer.py` lines 175-206 (metadata update section within `Main()`)
- Contains: Metadata filtering, tag mapping, exiftool calls with error handling
- Depends on: exiftool, configuration layer
- Used by: Main processing loop

## Data Flow

**Primary Processing Flow:**

1. **Initialization** (lines 48-60)
   - Clear output directory if configured
   - Build list of subdirectories to process
   - Create exiftool context manager

2. **File Discovery** (lines 64-70)
   - Iterate through source directories
   - Filter by valid extensions
   - Extract tags from directory names and filename metadata syntax

3. **Datetime Resolution** (lines 82-146)
   - Extract datetime from filename via regex (`get_datetime_from_name()`)
   - Query file metadata via exiftool
   - Collect all found datetimes in two priority lists:
     - `meta_datetimes1`: High-priority metadata (EXIF fields, primary sources)
     - `meta_datetimes2`: Secondary sources (filename, extracted from other metadata)
   - Select minimum timestamp as authoritative

4. **Output Path Determination** (lines 147-166)
   - Check extension mismatch between file extension and metadata
   - Assign to output subdirectory based on:
     - "CHECK" folder if low confidence (no secondary datetimes)
     - Year-based folder if `output_dir_years` enabled
     - "ERROR" folder if metadata write fails
   - Generate filename from selected datetime
   - Handle collisions by incrementing second value

5. **File Copy & Metadata Update** (lines 174-206)
   - Copy file to output location
   - Build metadata update dictionary by:
     - Finding all date-containing metadata fields
     - Adding ensured tags if missing
     - Adding comment tags from filename/directory
   - Execute exiftool metadata write
   - Catch and handle ExifToolExecuteError

6. **Results Reporting** (lines 208-220)
   - Print list of files requiring manual review
   - Print list of metadata processing errors
   - Output formatted diagnostic information

**State Management:**
- Global variables: `startTime` (performance tracking)
- Local lists within `Main()`: `check_these_files`, `meta_error_files` (problem tracking)
- No persistent state between runs (no caching or database)
- File system used as implicit state store (output directories)

## Key Abstractions

**DateTime Resolver:**
- Purpose: Reconcile multiple datetime sources into single authoritative timestamp
- Examples: Lines 82-146 in `Main()`
- Pattern: Collect multiple candidates, rank by source priority, select minimum (earliest)

**Metadata Tag Categorizer:**
- Purpose: Classify and filter metadata fields for different purposes
- Examples: `meta_filetype_tags`, `meta_datetime_tags`, `meta_ignored_tags`, `meta_ensured_tags`, `meta_comment_tags` (lines 25-30)
- Pattern: Tuple-based whitelist/blacklist constants used in loop conditions

**Output Directory Router:**
- Purpose: Determine destination folder based on processing result
- Examples: Lines 156-165
- Pattern: If-elif chain checking confidence level, year availability, error status

**Filename Collision Resolver:**
- Purpose: Generate unique output filename when target path exists
- Examples: Lines 168-172
- Pattern: Loop incrementing datetime by one second until unique filename found

## Entry Points

**Main Entry:**
- Location: `PhotoTimeFixer.py` lines 277-279
- Triggers: Direct script execution (`python PhotoTimeFixer.py`)
- Responsibilities: Initialize timer, call `Main()` function

**Main Processing Function:**
- Location: `PhotoTimeFixer.py` line 48 (`def Main():`)
- Triggers: Called from `__main__` block
- Responsibilities: Orchestrate entire processing pipeline, manage exiftool lifecycle, collect results

## Error Handling

**Strategy:** Try-catch around exiftool operations; fallback routing to ERROR folder; error collection and reporting

**Patterns:**
- Exception catching: Lines 195-205 (ExifToolExecuteError specific handling)
- Fallback behavior: Move files to "ERROR" subdirectory on metadata write failure
- Error accumulation: Two lists track problematic files (`check_these_files`, `meta_error_files`)
- Error reporting: End-of-run diagnostic output (lines 208-220)
- Silent failures: Invalid regex matches, missing metadata fields return `None` or skip processing

## Cross-Cutting Concerns

**Logging:** Console output with ANSI color codes via `bcolors` class (lines 34-43). Progress printed to stdout showing elapsed time, filename, file size, and status. No structured logging framework.

**Validation:**
- File extension checking (line 68)
- Year bounds validation in `convert_str_to_datetime()` (lines 260-261)
- Regex-based date/time format validation (lines 21-23, 241-276)
- Metadata field type checking (line 124)

**Authentication:** None. Direct file system access and exiftool binary execution.

**Timezone Handling:** Fixed timezone applied if not found in metadata (lines 244-253). Timezone offset parsed from metadata string if present. Timezone converted to Python `timezone` object.

---

*Architecture analysis: 2026-02-02*
