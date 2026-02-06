---
phase: 07-output-generation-tagging
plan: 03
subsystem: tagging
tags: [tags, auto-generation, filename-parsing, folder-structure]
requires:
  - phase: 01
    rationale: Tag and file_tags models from database schema
provides:
  - Tag extraction from {tag1,tag2} filename syntax
  - Tag extraction from folder structure relative to import root
  - Import root path storage for server-path imports
  - Tag normalization and deduplication
affects:
  - 07-04: Export process will use these tags for organization
  - 07-05: Manual tagging UI builds on auto-generated tags
tech-stack:
  added: []
  patterns:
    - Regex parsing for {tag1,tag2} syntax
    - pathlib for folder structure traversal
    - Setting model as generic key-value store
decisions:
  - decision: Store import root as Setting record
    rationale: No migration needed, clean separation, job-scoped key
    alternatives: [Add column to Job model, Store in job.error_message field]
  - decision: Filter out generic folder names
    rationale: Avoids noise tags like "dcim", "camera", numeric years
    alternatives: [Include all folders, Add user configuration]
  - decision: Browser uploads skip import root storage
    rationale: Folder structure lost via secure_filename during upload
    alternatives: [Try to preserve structure, Store flat list of filenames]
key-files:
  created:
    - app/lib/tagging.py
  modified:
    - app/routes/upload.py
completed: 2026-02-06
duration: 117s
---

# Phase 07 Plan 03: Tag Auto-Generation Summary

**One-liner:** Tag extraction from {tag1,tag2} filename syntax and folder structure relative to import root, stored via Setting model

## What Was Built

### Tag Extraction Library (app/lib/tagging.py)

**extract_filename_tags(filename: str) -> list[str]**
- Parses `{tag1,tag2}` syntax from original filenames
- Regex pattern: `r'\{([^}]+)\}'` finds content between braces
- Splits by comma, strips whitespace, normalizes to lowercase
- Handles edge cases: empty braces `{}`, single tag `{korea}`, whitespace `{ korea , seoul }`
- Example: `{Korea,Seoul}20240115.jpg` → `["korea", "seoul"]`

**extract_folder_tags(file_path: str, import_root: str) -> list[str]**
- Derives tags from folder hierarchy between import root and file
- Each subdirectory level becomes a tag (normalized lowercase)
- Filters out generic/unhelpful names:
  - Single-letter directories
  - Numeric-only directories (years)
  - Common camera folders: dcim, camera, thumbnails, temp, cache
- Example: import_root=`/photos`, file=`/photos/Korea/Seoul/photo.jpg` → `["korea", "seoul"]`

**auto_generate_tags(file_obj, import_root: Optional[str]) -> list[str]**
- Combines filename and folder tag extraction
- Deduplicates tags (preserves order, lowercase comparison)
- Returns unified list of unique tag names

**apply_auto_tags(db, files: list, import_root: Optional[str]) -> dict**
- Batch processes files to apply auto-generated tags
- Creates Tag records using get-or-create pattern from review.py
- Associates tags with files via `file.tags.append(tag)`
- Updates Tag.usage_count for each association
- Batches commits every 50 files for memory efficiency
- Returns stats: files_tagged, tags_created, tags_applied

### Import Root Storage (app/routes/upload.py)

**Modified import_server_path() route**
- Stores import root path after job creation: `Setting(key=f'job_{job.id}_import_root', value=str(import_path))`
- Uses existing Setting model as key-value store (no migration needed)
- Browser uploads skip this (folder structure lost via secure_filename)

**Added get_import_root(job_id: int) helper**
- Retrieves stored import root for tag auto-generation: `Setting.query.filter_by(key=f'job_{job_id}_import_root').first()`
- Returns None for browser uploads (no import root available)

## Task Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create tagging library with parsers | a38886e | app/lib/tagging.py |
| 2 | Store import root during server import | 8292a62 | app/routes/upload.py |

## Decisions Made

### 1. Setting Model for Import Root Storage
**Decision:** Store import root path as Setting record keyed by `job_{job_id}_import_root`

**Rationale:**
- No database migration required
- Clean separation from Job model (which tracks status/progress)
- Job-scoped key prevents conflicts
- Easy to query and optional (None for browser uploads)

**Alternatives Considered:**
- Add `import_root` column to Job model → requires migration
- Store in `job.error_message` field → hacky misuse of error field

**Impact:** Clean implementation, no schema changes, ready for tag auto-generation during export

### 2. Generic Folder Name Filtering
**Decision:** Filter out common generic folder names (dcim, camera, numeric years, single-letter)

**Rationale:**
- Prevents noise tags that don't provide meaningful organization
- Camera folders like "DCIM", "100ANDRO" are not useful as tags
- Numeric years will be handled separately in output structure
- Single-letter folders are likely drive letters or temporary

**Filtered Names:**
- Single-letter directories
- Numeric-only directories
- Generic: camera, dcim, thumbnails, thumb, thumbs, misc, temp, tmp, cache, backup
- Camera-specific: 100andro, 100apple

**Impact:** Cleaner auto-generated tags, users can still manually add filtered names if desired

### 3. Browser Upload Handling
**Decision:** Skip import root storage for browser uploads

**Rationale:**
- Folder structure is lost during browser file upload (secure_filename flattens)
- Only server-path imports preserve folder hierarchy
- Filename tags still work for browser uploads

**Impact:** Tag auto-generation uses only filename tags for browser uploads, full functionality for server imports

## Integration Points

### With Existing Code
- **Tag model (app/models.py):** Uses Tag.query.filter_by pattern from review.py for get-or-create
- **file_tags association:** Uses file.tags.append(tag) relationship for many-to-many
- **Setting model:** Reuses existing key-value store (no new tables)

### For Future Plans
- **07-04 (Export logic):** Will call `apply_auto_tags(db, files, get_import_root(job.id))` during export
- **07-05 (Tagging UI):** Auto-generated tags appear in file.tags, users can add/remove manually

## Verification Results

All verification criteria met:

✓ `extract_filename_tags('{Korea,Seoul}20240115.jpg')` → `['korea', 'seoul']`
✓ `extract_folder_tags('/photos/Korea/Seoul/photo.jpg', '/photos')` → `['korea', 'seoul']`
✓ Empty braces `{}` → `[]`
✓ Single tag `{korea}` → `['korea']`
✓ Whitespace `{ korea , seoul }` → `['korea', 'seoul']`
✓ Server-path imports store import root in Setting model
✓ Browser uploads skip import root storage
✓ Tag names normalized to lowercase with deduplication

## Next Phase Readiness

**Blockers:** None

**Dependencies Met:**
- Tag model exists with name, usage_count fields ✓
- file_tags association table exists ✓
- Setting model available as key-value store ✓

**Ready For:**
- **07-04:** Export logic can now call apply_auto_tags() with import root
- **07-05:** Tagging UI can display and edit auto-generated tags

**Concerns:** None - implementation is clean, tested, and integrated

## Self-Check: PASSED

All key files verified:
- ✓ app/lib/tagging.py exists
- ✓ app/routes/upload.py modified

All commits verified:
- ✓ a38886e exists
- ✓ 8292a62 exists
