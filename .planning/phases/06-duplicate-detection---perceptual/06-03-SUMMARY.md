---
phase: 06-duplicate-detection---perceptual
plan: 03
subsystem: api
tags: [api, endpoints, two-tier-detection, similar-groups, resolution]
requires: [06-01]
provides:
  - two-tier-duplicate-api
  - similar-groups-endpoint
  - similar-resolution-endpoint
  - updated-summary-counts
  - similar-mode-filtering
affects: [06-04, 06-05]
tech-stack:
  added: []
  patterns: [two-tier-api-design, multi-select-resolution, mode-based-filtering]
key-files:
  created: []
  modified:
    - app/routes/jobs.py
    - app/routes/review.py
decisions:
  - title: "Similar groups allow keeping multiple files"
    rationale: "Unlike exact duplicates (pick one), similar groups (burst/panorama) may have multiple keepers"
    impact: "Resolution endpoint accepts array of keep_file_ids instead of single ID"
  - title: "Discard operations clear both group types"
    rationale: "Discarded files should be completely removed from duplicate workflow"
    impact: "Consistent behavior across exact and similar groups"
  - title: "Separate endpoints for exact and similar groups"
    rationale: "Different semantics (pick-one vs pick-many) warrant different endpoints"
    impact: "Clear API contract, easier frontend implementation"
metrics:
  duration: "2 minutes"
  completed: "2026-02-05"
---

# Phase 6 Plan 03: Two-Tier Duplicate Detection API Summary

**One-liner:** API endpoints for two-tier duplicate detection with separate exact/similar group queries, multi-select resolution, and updated mode filtering

## Accomplishments

### New Endpoints
- **GET /api/jobs/:id/similar-groups** - Query similar/sequence groups with type (burst/panorama/similar) and confidence
- **POST /api/similar-groups/:id/resolve** - Resolve similar group by keeping multiple selected files
- **POST /api/similar-groups/:id/keep-all** - Mark all files in group as not similar
- **POST /api/files/bulk/not-similar** - Bulk remove files from similar groups

### Updated Endpoints
- **GET /api/jobs/:id/duplicates** - Now returns both SHA256 and perceptual exact groups with match_type field
- **GET /api/jobs/:id/summary** - Added exact_duplicate_groups and similar_groups counts
- **GET /api/jobs/:id/files** - Added 'similar' mode support, updated 'unreviewed' to exclude similar_group_id
- **POST /api/files/:id/discard** - Now clears similar_group_id, confidence, and type
- **POST /api/files/bulk/discard** - Updated to clear similar group fields

### API Enhancements
- **match_type field** - Distinguishes 'sha256' from 'perceptual' exact groups
- **confidence field** - All exact groups return 'high' confidence
- **mode_totals** - Added 'similar' count to mode selector display
- **is_similar field** - Added to file serialization for frontend filtering

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `624a96c` | Add two-tier duplicate detection API endpoints |
| 2 | `0b97dab` | Add similar group resolution and update discard logic |

## Files Modified

### app/routes/jobs.py
**Changes:** 165 insertions, 13 deletions

**Key updates:**
- Updated `get_job_duplicates()` to include perceptual-only exact groups
- Added match_type ('sha256' | 'perceptual') to duplicate group response
- Added confidence field to all duplicate groups
- New `get_similar_groups()` endpoint with group_type, confidence, files, and recommendations
- Updated `get_job_summary()` with exact_duplicate_groups and similar_groups counts
- Added 'similar' mode to `get_job_files()` filter logic
- Updated 'unreviewed' mode to exclude similar_group_id files
- Added similar count to mode_totals
- Updated `_serialize_file_extended()` with is_similar field

### app/routes/review.py
**Changes:** 123 insertions

**Key updates:**
- New `resolve_similar_group()` endpoint - accepts keep_file_ids array (multi-select)
- New `keep_all_similar()` endpoint - clears similar group for all files
- New `bulk_not_similar()` endpoint - bulk clear similar groups
- Updated `discard_file()` to clear similar_group_id, confidence, and type
- Updated `bulk_discard()` to clear similar group fields
- Updated `get_file_detail()` to include similar_group_id, confidence, and type

## Decisions Made

### 1. Multi-select resolution for similar groups
**Decision:** Similar group resolution accepts an array of keep_file_ids instead of single ID

**Rationale:**
- Exact duplicates: pick ONE (radio button UX) - same image, different format
- Similar groups: pick MULTIPLE (checkbox UX) - burst sequence, panorama, related shots
- User may want to keep first+last of burst, or all sharp images in sequence

**Impact:** Frontend can implement checkbox-based selection for similar groups

### 2. Discard clears both group types
**Decision:** When discarding a file, clear both exact_group_id and similar_group_id fields

**Rationale:**
- Discarded files are completely out of duplicate workflow
- No orphaned group references in database
- Consistent semantics across both detection tiers

**Impact:** Cleaner state management, simpler queries

### 3. Separate endpoints for exact vs similar
**Decision:** Use /api/jobs/:id/duplicates for exact, /api/jobs/:id/similar-groups for similar

**Rationale:**
- Different resolution semantics (pick-one vs pick-many)
- Different UI components (radio vs checkbox)
- Clear API contract for frontend developers

**Impact:** More endpoints, but clearer responsibilities

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for 06-04 (UI - Duplicates Mode Enhanced):**
- ✅ GET /api/jobs/:id/duplicates returns match_type and confidence
- ✅ Summary endpoint provides exact_duplicate_groups count
- ✅ Mode filtering supports 'duplicates' mode
- ✅ File serialization includes is_duplicate field

**Ready for 06-05 (UI - Similar Mode):**
- ✅ GET /api/jobs/:id/similar-groups returns groups with type and confidence
- ✅ POST /api/similar-groups/:id/resolve accepts keep_file_ids array
- ✅ POST /api/similar-groups/:id/keep-all available
- ✅ Summary endpoint provides similar_groups count
- ✅ Mode filtering supports 'similar' mode
- ✅ File serialization includes is_similar field

**Blockers:** None

**Considerations:**
- Frontend will need to implement checkbox-based selection for similar groups
- UI should show group_type (burst/panorama/similar) with appropriate icons
- Timeline visualization may be useful for burst sequences

## API Contract Summary

### Exact Duplicate Groups (GET /api/jobs/:id/duplicates)
```json
{
  "duplicate_groups": [
    {
      "hash": "abc123...",
      "match_type": "sha256" | "perceptual",
      "confidence": "high",
      "file_count": 3,
      "files": [...],
      "recommended_id": 123,
      "total_size_bytes": 15728640,
      "best_resolution_mp": 12.0
    }
  ]
}
```

### Similar Groups (GET /api/jobs/:id/similar-groups)
```json
{
  "similar_groups": [
    {
      "group_id": "xyz789...",
      "group_type": "burst" | "panorama" | "similar",
      "confidence": "high" | "medium" | "low",
      "files": [...],
      "recommended_id": 456
    }
  ]
}
```

### Summary (GET /api/jobs/:id/summary)
```json
{
  "duplicates": 67,              // File count in exact groups
  "exact_duplicate_groups": 23,  // Number of exact groups
  "similar_groups": 8,           // Number of similar groups
  "unreviewed": 145,             // Excludes both duplicate types
  "reviewed": 0,
  "discards": 0,
  "failed": 2
}
```

### Similar Resolution (POST /api/similar-groups/:id/resolve)
```json
Request:  { "keep_file_ids": [123, 456, 789] }
Response: { "kept": 3, "discarded": 5 }
```

## Performance Data

**Execution time:** 2 minutes

**Task breakdown:**
- Task 1 (API endpoints): ~1 minute
- Task 2 (Resolution logic): ~1 minute

**Code changes:**
- 288 insertions across 2 files
- 13 deletions (refactored duplicate endpoint)
- 0 bugs encountered

## Lessons Learned

1. **Two-tier API design:** Separating exact/similar into different endpoints with different resolution semantics makes the API easier to reason about and implement.

2. **Multi-select resolution:** Allowing multiple keepers for similar groups is essential for burst/panorama scenarios where user wants several images from the sequence.

3. **Mode filtering consistency:** Updating 'unreviewed' mode to exclude both exact_group_id and similar_group_id ensures clean workflow progression.

4. **Field clearing on discard:** Clearing all group-related fields (id, confidence, type) when discarding ensures no orphaned references.

## Code Quality

- ✅ Flask app starts without errors
- ✅ All endpoints follow consistent error handling patterns
- ✅ File serialization includes both is_duplicate and is_similar flags
- ✅ Summary counts updated for both group types
- ✅ Mode filtering supports all planned modes (duplicates, similar, unreviewed)
- ✅ Resolution endpoints use appropriate HTTP methods (POST for state changes)
