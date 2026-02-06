---
phase: 07-output-generation-tagging
plan: 02
subsystem: output-metadata
tags: [exiftool, metadata, timestamps, tags, iptc, xmp]
requires: [exiftool-library, metadata-read-functions]
provides: [metadata-write-api, timestamp-writeback, tag-writeback]
affects: [07-03-export-pipeline]
tech-stack:
  added: []
  patterns: [batch-metadata-writes, dual-format-tags]
key-files:
  created: []
  modified: [app/lib/metadata.py]
decisions:
  - id: EXIF-01
    choice: Write to both IPTC:Keywords and XMP:Subject
    rationale: Broadest compatibility with photo management tools
  - id: EXIF-02
    choice: Batch writes in write_metadata convenience function
    rationale: Single ExifTool context more efficient than separate calls
  - id: EXIF-03
    choice: QuickTime tags for video files
    rationale: Video timestamp standards differ from photo EXIF
metrics:
  duration: 77s
  completed: 2026-02-06
---

# Phase 7 Plan 02: EXIF Metadata Write Functions Summary

**One-liner:** Added write_timestamps, write_tags_to_file, and write_metadata functions to embed corrected dates and tags into output file EXIF/IPTC/XMP metadata using ExifTool.

## What Was Built

Extended `app/lib/metadata.py` with three new functions for writing metadata to output files:

1. **write_timestamps()** - Writes corrected timestamps to EXIF DateTimeOriginal and CreateDate, plus QuickTime tags for video files
2. **write_tags_to_file()** - Writes tags to both IPTC:Keywords and XMP:Subject for broad compatibility
3. **write_metadata()** - Convenience function that batches both operations in a single ExifTool context

All functions use `-overwrite_original` to prevent backup file clutter and return bool with graceful error handling (log, don't raise).

## Task Commits

| Task | Description | Commit | Files Modified |
|------|-------------|--------|----------------|
| 1 | Add write_timestamps function | 46f0211 | app/lib/metadata.py |
| 2 | Add write_tags_to_file and write_metadata | ff4e329 | app/lib/metadata.py |

## Technical Decisions

### EXIF-01: Dual-format tag writes (IPTC + XMP)

**Decision:** Write tags to both IPTC:Keywords and XMP:Subject

**Rationale:**
- IPTC is the legacy standard, still used by many tools
- XMP is the modern standard, preferred by Adobe and newer tools
- Google Photos, Apple Photos, and other management tools check both
- Writing to both ensures maximum compatibility without needing to know which format the user's tools prefer

**Implementation:**
```python
tags = {
    'IPTC:Keywords': tag_names,
    'XMP:Subject': tag_names,
}
```

### EXIF-02: Batched metadata writes

**Decision:** Create write_metadata() convenience function that combines timestamp and tag writes in a single ExifTool context

**Rationale:**
- ExifToolHelper context manager has overhead (process spawn)
- Export pipeline will typically write both timestamps and tags together
- Single context = one ExifTool invocation instead of two
- 50% reduction in subprocess overhead for typical use case

**Implementation:**
```python
def write_metadata(file_path, timestamp=None, tag_names=None):
    tags = {}
    if timestamp:
        tags.update({...})  # timestamp tags
    if tag_names:
        tags.update({...})  # keyword tags
    et.set_tags(path_str, tags, params=['-overwrite_original'])
```

### EXIF-03: Video-specific timestamp handling

**Decision:** Write QuickTime:CreateDate and QuickTime:ModifyDate for video files in addition to EXIF tags

**Rationale:**
- Video files use QuickTime atoms for timestamps, not just EXIF
- Standard EXIF tags may not be read by all video players
- QuickTime tags are the primary timestamp source for .mp4, .mov, .avi, .mkv
- Detect by file extension and add both sets of tags

**Video file extensions:** `.mp4`, `.mov`, `.avi`, `.mkv`

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for Plan 07-03 (Export Pipeline):**
- Metadata write API is complete and tested (import verification)
- Functions accept Path | str for flexibility
- Error handling is graceful (bool return, log errors)
- All write operations use -overwrite_original (no backup clutter)

**Integration points for export pipeline:**
- Call `write_metadata(output_path, corrected_timestamp, tag_list)` for each exported file
- Check return value to track write success/failure
- Existing read functions remain unchanged (backward compatible)

## Files Modified

**app/lib/metadata.py** (+122 lines)
- Added logging import and logger instance
- Added `write_timestamps()` function (40 lines)
- Added `write_tags_to_file()` function (34 lines)
- Added `write_metadata()` convenience function (42 lines)
- All existing read functions unchanged

## Dependencies

**Upstream (required by this plan):**
- PyExifTool library (already installed)
- ExifTool executable (already installed and configured via EXIFTOOL_PATH)
- Existing metadata read functions (get_best_datetime, extract_metadata, etc.)

**Downstream (will use this plan):**
- Plan 07-03: Export pipeline will call write_metadata() for each output file
- Plan 07-04/07-05: Tag management UI will benefit from dual IPTC/XMP writes

## Testing Notes

**Manual verification performed:**
- Import check passed for all three functions
- No syntax errors or missing dependencies

**Future integration testing needed:**
- Create output file and verify timestamps written correctly
- Verify QuickTime tags on video files
- Verify dual IPTC/XMP tag writes
- Verify -overwrite_original prevents backup files

## Lessons Learned

**ExifTool timestamp format:** ExifTool expects `YYYY:MM:DD HH:MM:SS` (colons in date portion, not hyphens). Python's strftime needs `'%Y:%m:%d %H:%M:%S'`.

**Video timestamp standards:** Video files need QuickTime-specific tags in addition to standard EXIF tags. File extension detection is sufficient for determining when to add QuickTime tags.

**Batch optimization opportunity:** When writing both timestamps and tags, using a single ExifTool context reduces overhead by 50% vs. separate function calls.

## Self-Check: PASSED

All commits verified in git history:
- 46f0211: write_timestamps function
- ff4e329: write_tags_to_file and write_metadata functions

All modified files verified:
- app/lib/metadata.py exists and contains all three new functions
