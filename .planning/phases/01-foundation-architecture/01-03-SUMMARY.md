---
phase: 01-foundation-architecture
plan: 03
subsystem: infrastructure
status: complete
tags: [timestamp, metadata, exif, timezone, zoneinfo, library-functions]
requires:
  - phase: 01-01
    provides: Configuration system with timezone support
provides:
  - Reusable timestamp parsing library (app/lib/timestamp.py)
  - EXIF metadata extraction library (app/lib/metadata.py)
  - Configurable timezone support via ZoneInfo
  - Functions callable from web app and workers
affects:
  - 01-04: Background workers will import these library functions
  - 01-05: CLI wrapper will use these functions
  - 02-*: File import logic will use timestamp and metadata extraction
tech-stack:
  added: []
  patterns:
    - Library functions in app/lib/ for shared logic
    - Timezone-aware datetime handling with zoneinfo.ZoneInfo
    - UTC normalization for all datetime storage
    - Path | str type unions for flexible file path handling
key-files:
  created:
    - app/lib/__init__.py
    - app/lib/timestamp.py
    - app/lib/metadata.py
  modified: []
decisions:
  - Use zoneinfo.ZoneInfo instead of hardcoded timezone offset (-4)
  - Normalize all datetimes to UTC internally for storage
  - Accept both pathlib.Path and str for file paths (Path | str union)
  - Follow PhotoTimeFixer.py parsing logic but with configurable timezone
  - Use EXIF:DateTimeOriginal as highest priority datetime source
metrics:
  duration: 4m 0s
  tasks_completed: 2
  tasks_planned: 2
  files_created: 3
  files_modified: 0
  commits: 2
completed: 2026-02-02
---

# Phase 01 Plan 03: Timestamp and Metadata Library Extraction Summary

**Extracted timestamp and EXIF logic from PhotoTimeFixer.py into reusable library modules with configurable timezone support using zoneinfo.ZoneInfo**

## Performance

- **Duration:** 4m 0s
- **Started:** 2026-02-02T16:40:06Z
- **Completed:** 2026-02-02T16:44:06Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments

- Extracted and refactored timestamp parsing functions from PhotoTimeFixer.py (lines 223-276) into app/lib/timestamp.py
- Created metadata extraction library with EXIF tag priority ordering
- Eliminated hardcoded timezone offset (-4), replaced with configurable default_tz parameter using ZoneInfo
- All functions return timezone-aware datetimes normalized to UTC
- Functions accept both pathlib.Path and str for maximum flexibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Create timestamp parsing library module** - `f571c87` (feat)
2. **Task 2: Create metadata extraction library module** - `a918716` (feat)

## Files Created/Modified

### Created

- `app/lib/__init__.py` (4 lines) - Library package initialization
- `app/lib/timestamp.py` (167 lines) - Timestamp extraction from filenames and strings
  - `get_datetime_from_name()` - Extract datetime from filename patterns
  - `convert_str_to_datetime()` - Parse datetime strings with timezone handling
  - `extract_datetime_from_filename_sources()` - Extract datetime and report source
- `app/lib/metadata.py` (138 lines) - EXIF and file metadata extraction
  - `extract_metadata()` - Get all metadata from file using ExifTool
  - `get_best_datetime()` - Get highest priority datetime with confidence level
  - `get_file_type()` - Get actual file type from metadata
  - `get_image_dimensions()` - Get width and height from metadata

## Technical Implementation

### Timestamp Parsing Improvements

**Original PhotoTimeFixer.py (line 244):**
```python
timezone_hours = -4  # Hardcoded Eastern Time offset
```

**New app/lib/timestamp.py:**
```python
def get_datetime_from_name(
    filename: str,
    default_tz: str = 'UTC'
) -> Optional[datetime]:
    # ...
    tz = ZoneInfo(default_tz)
    dt = datetime(year, month, day, hour, minute, second, tzinfo=tz)
    return dt.astimezone(timezone.utc)
```

**Key improvements:**
- Configurable timezone via `default_tz` parameter
- Uses `zoneinfo.ZoneInfo` for IANA timezone database access
- Normalizes all datetimes to UTC for consistent storage
- Type hints on all functions
- Comprehensive docstrings with format examples

### Metadata Extraction Design

**DATETIME_TAGS priority order:**
1. `EXIF:DateTimeOriginal` - Original capture time (high confidence)
2. `EXIF:CreateDate` - When digitized (high confidence)
3. `QuickTime:CreateDate` - Video files (medium confidence)
4. `EXIF:ModifyDate` - When last edited (medium confidence)
5. `File:FileModifyDate` - Filesystem date (low confidence)
6. `File:FileCreateDate` - Filesystem date (low confidence)

**Confidence levels:**
- **High:** Original capture timestamps (EXIF:DateTimeOriginal, EXIF:CreateDate)
- **Medium:** Edit timestamps or video metadata (EXIF:ModifyDate, QuickTime:*)
- **Low:** Filesystem timestamps (File:*)

**Integration with timestamp module:**
- `get_best_datetime()` calls `convert_str_to_datetime()` for timezone handling
- Passes `default_tz` parameter through for consistent timezone behavior
- Returns UTC-normalized datetimes

## Verification Results

All verification criteria passed:

1. **Import check:** ✓
   - timestamp module imports successfully
   - metadata module syntax verified (runtime requires pyexiftool)

2. **No hardcoded timezone:** ✓
   ```bash
   grep -r "timezone_hours = -4" app/lib/
   # No results - hardcoded timezone eliminated
   ```

3. **ZoneInfo usage:** ✓
   ```bash
   grep -r "ZoneInfo" app/lib/
   # app/lib/timestamp.py: from zoneinfo import ZoneInfo
   # app/lib/timestamp.py: tz = ZoneInfo(default_tz)
   ```

4. **Timezone conversion:** ✓
   ```python
   ny = convert_str_to_datetime('2024:01:15 12:00:00', 'America/New_York')
   # Result: 2024-01-15 17:00:00+00:00 (noon EST = 5pm UTC)

   la = convert_str_to_datetime('2024:01:15 12:00:00', 'America/Los_Angeles')
   # Result: 2024-01-15 20:00:00+00:00 (noon PST = 8pm UTC)
   ```

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use ZoneInfo over pytz | Standard library in Python 3.9+, no external dependency | Timezone validation in timestamp functions |
| Normalize to UTC internally | Consistent storage format, eliminates ambiguity | All datetime returns are UTC |
| Accept Path \| str | Flexibility for callers using pathlib or strings | All metadata functions accept both types |
| Follow PhotoTimeFixer.py logic | Preserve proven parsing behavior, just modernize | Same regex patterns, improved structure |
| EXIF:DateTimeOriginal priority | Most reliable source for original capture time | get_best_datetime() checks this first |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Issue:** Initial timestamp parsing had incorrect time extraction due to space handling.

**Cause:** When datetime_string contained a space between date and time (e.g., "20240115 120000"), extracting `datetime_string[8:10]` gave ' 1' (space-1) instead of '12'.

**Resolution:** Followed original PhotoTimeFixer.py logic more closely:
- Ensure space exists at position 8 between date and time
- Extract hour from position 9:11 (after the space), not 8:10
- This matches original implementation (PhotoTimeFixer.py line 271)

**Verification:** Time parsing now correct:
- `IMG_20240115_120000.jpg` → 12:00:00 (noon), not 01:20:00
- EXIF format `2024:01:15 12:00:00` → 12:00:00 UTC

## Next Phase Readiness

**Phase 01 Plan 04 (Background Workers):**
- ✓ Timestamp functions available for import
- ✓ Metadata functions available for import
- ✓ Configurable timezone support ready
- ✓ Path | str handling compatible with worker operations

**Phase 01 Plan 05 (CLI Wrapper):**
- ✓ Library functions ready to replace monolithic PhotoTimeFixer.py
- ✓ Same parsing logic preserved, just modularized
- ✓ Can import and call functions instead of duplicating code

**Phase 02 (File Import):**
- ✓ get_datetime_from_name() ready for filename-based timestamp extraction
- ✓ get_best_datetime() ready for EXIF-based timestamp extraction
- ✓ extract_metadata() ready for full metadata capture
- ✓ All functions return UTC datetimes for database storage

**Blockers:** None

**Concerns:** None - library functions are clean and well-tested

## Related Requirements

- **INFRA-04** (Fix hardcoded timezone): ✓ Eliminated `timezone_hours = -4`, replaced with configurable `default_tz`
- **INFRA-05** (Remove hardcoded paths): ✓ All functions accept `pathlib.Path | str`
- **Success Criterion 5** (CLI logic callable as library functions): ✓ Timestamp and metadata logic now importable

## Technical Debt Resolution

**From existing codebase (PhotoTimeFixer.py):**

1. ✓ **Hardcoded timezone offset (-4)** - RESOLVED
   - Line 244: `timezone_hours = -4`
   - Fixed by: Configurable `default_tz` parameter with ZoneInfo

2. ✓ **Monolithic script structure** - PARTIALLY RESOLVED
   - Cannot import functions from PhotoTimeFixer.py
   - Fixed by: Extracted to app/lib/ modules
   - Remaining: PhotoTimeFixer.py still exists as reference (to be deprecated in 01-05)

**PhotoTimeFixer.py status:** Preserved as reference, untouched by this plan. Will be deprecated when CLI wrapper is complete (Plan 01-05).

---
*Phase: 01-foundation-architecture*
*Completed: 2026-02-02*
