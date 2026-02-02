# External Integrations

**Analysis Date:** 2026-02-02

## APIs & External Services

**ExifTool Command-Line Utility:**
- ExifTool command-line application for metadata extraction and modification
  - SDK/Client: PyExifTool wrapper (`exiftool` Python package)
  - Invocation: Context manager pattern in `PhotoTimeFixer.py` lines 60, 176
  - Primary methods: `et.get_metadata()` and `et.set_tags()`
  - Auth: None (local binary execution)

## Data Storage

**Databases:**
- Not used - File-based processing only

**File Storage:**
- Local filesystem only
- Input source: Hardcoded directory `D:/Work/Scripts/PhotoTimeFixer/Test/` (line 13)
- Output directory: `Output/` subdirectory (line 14)
- Subdirectories created:
  - Year-based organization: `Output/[YYYY]/` when `output_dir_years=True` (line 15)
  - `Output/CHECK/` - Files with low confidence metadata matches (line 159)
  - `Output/ERROR/` - Files with ExifTool execution errors (line 202)

**Caching:**
- None detected

## Metadata Formats

**EXIF/XMP/IPTC Tags Handled:**
- Read tags (meta_filetype_tags):
  - `File:FileType`, `File:FileTypeExtension`, `File:MIMEType`
- Read tags (meta_datetime_tags):
  - `File:FileModifyDate`, `File:FileCreateDate`, `EXIF:DateTimeOriginal`, `EXIF:ModifyDate`
- Ignored tags (meta_ignored_tags):
  - `SourceFile`, `File:FileName`, `File:FileAccessDate`, `ICC_Profile:ProfileDateTime`, `IPTC:SpecialInstructions`, `Photoshop:*`
- Tags to ensure exist (meta_ensured_tags):
  - `DateTimeOriginal`, `FileCreateDate`
- Comment tags (meta_comment_tags):
  - `EXIF:XPKeywords`
- Video tags (commented): `QuickTime:CreateDate`

## Authentication & Identity

**Auth Provider:**
- Not applicable - Command-line tool execution, no authentication required
- Runs with file system permissions of executing user

## Monitoring & Observability

**Error Tracking:**
- Not detected (no external error tracking service)

**Logs:**
- Console output with colored terminal output using ANSI color codes (class `bcolors` in lines 34-43)
- Logging levels implemented:
  - Info: Scanning progress with timestamp: `f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s: ...`
  - Warning: File extension mismatches, duplicate filenames
  - Error: Metadata extraction errors, ExifTool execution failures
- No file-based logging detected
- Unused logging module (commented out at lines 9-10)

## CI/CD & Deployment

**Hosting:**
- Not applicable - Desktop/local utility

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
- None detected

**Secrets location:**
- Not applicable

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## File Processing Pipeline

**Input:**
- Scans directory: `D:/Work/Scripts/PhotoTimeFixer/Test/`
- Recursively processes subdirectories (line 53-56)
- Filters files by extension (line 68)

**Processing:**
1. Extract metadata using ExifTool (line 84)
2. Extract datetime from filename using regex patterns (line 82)
3. Merge datetime evidence from multiple sources
4. Validate dates are within range 2000-2100
5. Copy file to output directory (line 174)
6. Update metadata tags (line 196)

**Output:**
- Files organized by:
  - Year subdirectories (if `output_dir_years=True`)
  - Special subdirectories for errors and low-confidence matches
- Output filename format: `YYYYMMDDHHmmss.ext` (line 153)
- Original file attributes preserved via `shutil.copy2()` (line 174)

## Error Handling

**ExifTool Integration:**
- Exception catching at line 197-205
- Specific handling for `ExifToolExecuteError` exceptions
- Failed files moved to `Output/ERROR/` directory with error reason logged

## Media Metadata Validation

**Date Extraction Patterns:**
- Filename date regex: `(19|20)\d{2}[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2][0-9]|3[0-1])` (line 21)
- Time regex: `([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]` (line 22)
- Timezone regex: `[-+]([01][0-9]|2[0-3]):?[0-5][0-9]` (line 23)

**Metadata Tags:**
- Extraction and conversion from multiple EXIF/XMP sources
- Fallback hierarchy: EXIF standard tags → EXIF alternative tags → filename patterns
- Default timezone offset hardcoded: -4 hours (EDT) at line 244

---

*Integration audit: 2026-02-02*
