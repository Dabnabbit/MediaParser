---
phase: 04
plan: 01
subsystem: review-api
tags: [models, api, flask, sqlalchemy, tags, review]
dependency-graph:
  requires: [03-07]
  provides: [review-endpoints, tag-model, file-review-fields]
  affects: [04-02, 04-03]
tech-stack:
  added: []
  patterns: [file-tags-many-to-many, bulk-api-endpoints]
key-files:
  created:
    - app/routes/review.py
  modified:
    - app/models.py
    - app/routes/__init__.py
    - app/__init__.py
    - app/routes/jobs.py
decisions:
  - id: tag-normalization
    choice: "Normalize tags to lowercase in application code"
    rationale: "SQLite func.lower() in unique constraint causes issues; enforce at app level"
  - id: duplicate-group-field
    choice: "Use duplicate_group_id field on File model"
    rationale: "Simpler than separate association table; allows clearing to 'un-duplicate'"
  - id: usage-count-caching
    choice: "Cache tag usage_count for autocomplete sorting"
    rationale: "Avoid expensive COUNT queries on every autocomplete request"
metrics:
  duration: 4m
  completed: 2026-02-03
---

# Phase 4 Plan 1: Review API Models and Endpoints Summary

**One-liner:** Extended File model with review/duplicate tracking fields, added Tag model with many-to-many relationship, created 10 review/tagging API endpoints, extended jobs endpoint with filters/sorts/summary.

## What Was Built

### Database Model Extensions

**File model additions:**
- `reviewed_at: Optional[datetime]` - When user confirmed timestamp decision
- `final_timestamp: Optional[datetime]` - User-confirmed timestamp (may differ from detected)
- `discarded: bool` - Whether file is excluded from output (default False)
- `duplicate_group_id: Optional[str]` - Set to file_hash when part of duplicate group
- `tags: List[Tag]` - Many-to-many relationship to Tag model

**New Tag model:**
- `id: int` - Primary key
- `name: str` - Unique, case-insensitive (stored lowercase)
- `usage_count: int` - Cached count for autocomplete sorting
- `created_at: datetime` - When tag was created
- `files: List[File]` - Back-reference to tagged files

**New file_tags association table:**
- Links files to tags via file_id and tag_id

### Review API Endpoints (app/routes/review.py)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files/<id>` | GET | Get file detail with timestamp_candidates |
| `/api/files/<id>/review` | POST | Submit review decision |
| `/api/files/<id>/review` | DELETE | Unreview a file |
| `/api/tags` | GET | Get all tags sorted by usage_count |
| `/api/tags/recent` | GET | Get recently used tags |
| `/api/files/<id>/tags` | POST | Add tags to file |
| `/api/files/<id>/tags/<name>` | DELETE | Remove tag from file |
| `/api/files/bulk/tags` | POST | Bulk add tags to files |
| `/api/files/bulk/discard` | POST | Bulk discard files |
| `/api/files/bulk/not-duplicate` | POST | Remove files from duplicate groups |

### Extended Jobs Endpoint (app/routes/jobs.py)

**New query parameters for `/api/jobs/<id>/files`:**
- `reviewed`: Filter by review status (true/false/any)
- `has_duplicates`: Filter files in duplicate groups (true/false)
- `discarded`: Filter by discarded status (true/false, default false)
- `sort`: Sort field (detected_timestamp, original_timestamp, filename, file_size)
- `order`: Sort order (asc, desc)
- `confidence`: Now supports comma-separated values (e.g., high,medium)

**Extended response fields:**
- `file_size_bytes`, `mime_type`, `reviewed_at`, `final_timestamp`
- `is_duplicate`, `file_hash`, `discarded`

**New endpoint `/api/jobs/<id>/summary`:**
- Returns counts for filter chips: high, medium, low, none, reviewed, duplicates, failed, total

## Decisions Made

1. **Tag normalization in app code** - Store all tags lowercase, enforce uniqueness at application level rather than using SQLite `func.lower()` in constraints.

2. **Duplicate group as field** - Use `duplicate_group_id` on File rather than separate association table. Simpler model, allows "un-duplicating" by clearing the field.

3. **Usage count caching** - Cache tag usage_count to avoid expensive COUNT queries on autocomplete. Increment/decrement on tag add/remove.

## Commit History

| Commit | Description |
|--------|-------------|
| 671099a | feat(04-01): extend File model and add Tag model |
| 6271923 | feat(04-01): add review, tagging, and duplicate handling API endpoints |
| 9b19f68 | feat(04-01): extend jobs files endpoint with filters and sorts |
| c4e0093 | feat(04-01): add summary counts endpoint for filter chips |

## Verification Results

- [x] Models import without errors
- [x] Database tables created successfully (tags, file_tags, new File columns)
- [x] All 10 review API endpoints respond appropriately
- [x] Review workflow: POST sets reviewed_at, DELETE clears it
- [x] Tag operations: create, add, remove all work correctly
- [x] Summary endpoint returns correct counts
- [x] Duplicate handling: bulk discard and not-duplicate endpoints functional
- [x] Files endpoint supports all new filters and sort options

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for 04-02:** Grid UI implementation can now use:
- `/api/jobs/<id>/files` with filters for unified grid
- `/api/jobs/<id>/summary` for filter chip counts
- `/api/files/<id>` for examination view detail
- `/api/files/<id>/review` for timestamp confirmation
- Tag endpoints for tagging workflow

**Database note:** Existing databases will need migration to add new columns. In development, the database was reset. For production, Alembic migrations would be needed.
