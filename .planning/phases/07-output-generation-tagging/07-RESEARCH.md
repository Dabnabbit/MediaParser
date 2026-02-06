# Phase 7 Research: Output Generation + Tagging

**Date:** 2026-02-06
**Requirements:** TAG-01, TAG-02, TAG-03, TAG-04, PROC-02, PROC-03, PROC-04, PROC-05

## What Already Exists

### Complete and Reusable
| Component | Status | Location |
|-----------|--------|----------|
| Tag model + API (CRUD, bulk) | Complete | `models.py:308-341`, `routes/review.py:191-386` |
| Tag UI (autocomplete, pills) | Complete | `static/js/tags.js` |
| Output directory settings | Complete | `routes/settings.py`, config `OUTPUT_FOLDER` |
| `File.output_path` field | In schema, unused | `models.py:107` |
| Job model (`type='export'`) | Ready | `models.py:158-205` (already has 'export' comment) |
| Progress polling API | Generic, works for any job | `routes/api.py:11-97` |
| Pause/cancel pattern | Reusable from import job | `tasks.py:340-358` |
| Batch commit pattern | Reusable | `tasks.py _commit_pending_updates()` |
| Error threshold halting | Reusable | `tasks.py _should_halt_job()` |
| ExifTool read path | Extend for writes | `lib/metadata.py` |
| PyExifTool 0.5.6 + ExifTool 12.76 | Installed | `requirements.txt` |

### Must Be Built
| Component | Notes |
|-----------|-------|
| Export task function | `process_export_job()` in `tasks.py` |
| Output filename generator | `YYYYMMDD_HHMMSS.ext` with collision suffix |
| EXIF write-back function | Extend `lib/metadata.py` with `write_metadata()` |
| Tag auto-generation | Parse folder names + `{tag1,tag2}` filename syntax |
| Export API route | `POST /api/jobs/<id>/export` |
| Source file cleanup | `POST /api/jobs/<id>/cleanup-sources` |
| Export UI (button, progress) | Trigger export, show progress, summary |
| Tag filter UI | TAG-04: filter thumbnail grid by tag |

---

## EXIF Writing: Use PyExifTool (Already Installed)

**Recommendation: PyExifTool** -- zero new dependencies, symmetric with existing read path.

### Why PyExifTool Wins
- Already installed and used for reading
- Full format coverage: JPEG, PNG, HEIC all supported
- Full metadata types: EXIF timestamps + IPTC/XMP keywords
- Metadata-only modification (no image decode/re-encode, no quality loss)
- Best batch performance via stay-open mode
- Docker-ready: `apt install libimage-exiftool-perl`

### Disqualified Alternatives
- **piexif**: No HEIC, no IPTC/XMP, unmaintained, security vulnerability
- **Pillow**: Re-encodes images (lossy, slow, memory-heavy) -- wrong tool for metadata
- **exif (TNThieding)**: JPEG-only, no IPTC/XMP

### Write Pattern
```python
with exiftool.ExifToolHelper(executable=EXIFTOOL_PATH) as et:
    # Timestamps
    et.set_tags(file_path, {
        "EXIF:DateTimeOriginal": "2024:01:15 12:00:00",
        "EXIF:CreateDate": "2024:01:15 12:00:00",
    }, params=["-overwrite_original"])

    # Tags/keywords
    et.set_tags(file_path, {
        "IPTC:Keywords": ["vacation", "2024"],
        "XMP:Subject": ["vacation", "2024"],
    }, params=["-overwrite_original"])
```

### PNG Caveat
PNG doesn't natively support EXIF. ExifTool writes as XMP in iTXt chunks (industry standard). ExifTool 12.76 places chunks before IDAT for compatibility.

---

## Output Filename Collision Handling

### Legacy Problem
The old `PhotoTimeFixer.py` increments by 1 second on collision. This fails with burst photos (5-10/second) and creates incorrect timestamps.

### Recommended: Counter Suffix
```
20240115_120000.jpg       # first
20240115_120000_001.jpg   # second same-timestamp
20240115_120000_002.jpg   # third
```

Sort by original filename or file hash for deterministic ordering within same-timestamp groups.

---

## File Organization

### Year-Based Folders (PROC-02)
```
output/
  2023/
    20230615_143022.jpg
    20230615_143022_001.jpg
  2024/
    20240115_120000.jpg
```

### Timestamp Priority for Naming (PROC-03)
1. `final_timestamp` (user-confirmed during review)
2. `detected_timestamp` (auto-detected fallback)
3. Files with neither: use original filename, placed in `unknown/` subfolder

---

## Tag Auto-Generation (TAG-01)

### Two Sources (from legacy PhotoTimeFixer.py)

1. **Folder structure**: Subdirectory names become tags
   - `Korea/photo.jpg` -> tag "Korea"
   - Only applies to server-path imports (browser uploads lose folder info via `secure_filename()`)

2. **Filename syntax**: `{tag1,tag2}` parsed from filename
   - `{Korea,Seoul}20240115.jpg` -> tags ["Korea", "Seoul"]
   - Regex: `r'\{.*\}'`

### Gap: Import Root Path Not Stored
Server-path imports store the full path in `original_path`, but the import root isn't persisted on the Job. Need to either:
- Store import root on Job model, OR
- Derive folder tags relative to the common prefix of all files in the job

### Where Tags Go in EXIF
Legacy writes to `EXIF:XPKeywords` (semicolon-separated). Phase 7 should write to both `IPTC:Keywords` and `XMP:Subject` for broader compatibility.

---

## Export Job Architecture

### Reuse Import Job Pattern
The export job mirrors the import job structure almost exactly:

```
@huey.task()
def process_export_job(job_id):
    app = get_app()
    with app.app_context():
        job = Job.query.get(job_id)
        # ... same lifecycle pattern as process_import_job
```

### Memory: Windowed Queries for 50k+ Files
Instead of loading all files at once:
```python
query = File.query.join(File.jobs).filter(
    Job.id == job_id,
    File.discarded == False,
    File.output_path.is_(None)  # Not yet exported
).order_by(File.final_timestamp)

for file in query.yield_per(100):
    # process file, copy, write metadata
```

### Resume Support
Check `File.output_path is not None` to skip already-exported files (same pattern as import checking `file_hash_sha256`).

### Source File Cleanup (PROC-04)
User chooses keep or delete AFTER export completes. Separate action, not part of export job. Prevents data loss if export fails midway.

---

## Proposed Plan Breakdown

### Plan 07-01: Export Task + File Copy Engine
- New `process_export_job()` Huey task
- Output filename generation (`YYYYMMDD_HHMMSS.ext` with counter suffix)
- Year-based directory creation
- `shutil.copy2()` preserving metadata
- Progress tracking, pause/cancel, error threshold
- Windowed queries for memory efficiency
- Sets `File.output_path` on success

### Plan 07-02: EXIF Metadata Write-Back
- `write_metadata()` function in `lib/metadata.py`
- Write corrected timestamps (DateTimeOriginal, CreateDate)
- Write tags to IPTC:Keywords + XMP:Subject
- `-overwrite_original` to avoid backup files
- Integrated into export pipeline (write after copy)

### Plan 07-03: Tag Auto-Generation
- Parse `{tag1,tag2}` from original filenames
- Extract folder-based tags from import paths
- Auto-create Tag records and file_tags associations
- Run during export (or as pre-export step)

### Plan 07-04: Export UI + Source Cleanup
- Export button (appears when review complete)
- Export progress visualization (reuses progress handler)
- Export summary (files written, errors, output path)
- Source file cleanup option (keep/delete after export)
- Tag filter for thumbnail grid (TAG-04)

### Plan 07-05: Integration Testing
- End-to-end export with real files
- EXIF verification (timestamps written correctly)
- Collision handling verification
- Regression testing (upload, review, duplicates still work)
