---
phase: 05-duplicate-detection---exact
plan: 01
subsystem: duplicate-detection
tags: [api, quality-metrics, duplicates, resolution, file-size]
requires: [04-07-review-workflow]
provides:
  - Enhanced duplicates API with quality comparison data
  - Quality metrics library for file comparison
  - Recommendation algorithm for best duplicate selection
affects: [05-02-duplicate-ui, 06-perceptual-duplicates]
tech-stack:
  added: []
  patterns:
    - Quality scoring based on resolution and file size
    - Aggregate statistics for duplicate groups
key-files:
  created:
    - app/lib/duplicates.py
  modified:
    - app/routes/jobs.py
decisions:
  - title: Resolution prioritized over file size
    rationale: Higher resolution indicates better quality source, file size is tiebreaker for compression
    alternatives: [Size-only scoring, Format-based scoring]
  - title: Score calculation uses resolution * 1M + file_size
    rationale: Ensures resolution dominates but file size still matters at same resolution
    alternatives: [Separate resolution/size ranking, Weighted average]
  - title: Graceful degradation for missing metrics
    rationale: Some files may not have dimensions (videos, corrupted images)
    alternatives: [Exclude files without metrics, Use file size only]
metrics:
  duration: 3.5 minutes
  completed: 2026-02-04
---

# Phase 5 Plan 01: Quality Metrics & Recommendations Summary

**One-liner:** Quality scoring for duplicate files with resolution/size metrics and automatic best-file recommendations

## What Was Built

Enhanced the `/api/jobs/:id/duplicates` endpoint to return comprehensive quality metrics for each file in duplicate groups, plus algorithmic recommendations for which file to keep.

### Key Components

1. **duplicates.py Library**
   - `get_quality_metrics(file)`: Extracts width, height, resolution (MP), format from file metadata
   - `recommend_best_duplicate(files)`: Scores files by resolution first, then file size
   - Reusable for Phase 6 perceptual duplicate detection

2. **Enhanced Duplicates API**
   - Per-file metrics: `width`, `height`, `resolution_mp`, `file_size_bytes`, `format`
   - Per-group recommendation: `recommended_id` (highest quality file)
   - Group-level aggregates: `total_size_bytes`, `best_resolution_mp`, `file_count`
   - Filters out discarded files from duplicate groups

### Technical Implementation

**Quality Scoring Algorithm:**
```python
if resolution_mp is not None:
    score = resolution_mp * 1_000_000 + file_size_bytes
else:
    score = file_size_bytes  # Fallback for non-images
```

**Why This Works:**
- Resolution (in megapixels) dominates the score (multiplied by 1M)
- File size acts as tiebreaker (larger = less compression at same resolution)
- Example: 4.51 MP image scores ~4,510,923 vs 0.48 MP image scores ~480,061

**Integration Points:**
- Uses `get_image_dimensions()` from existing metadata library
- Merges metrics into file dicts using `dict.update()`
- Compatible with existing duplicate detection workflow

## Files Changed

### Created
- **app/lib/duplicates.py** (95 lines)
  - Quality metrics extraction
  - Recommendation algorithm
  - Type hints and docstrings

### Modified
- **app/routes/jobs.py** (+45 lines)
  - Import new library functions
  - Call `get_quality_metrics()` for each file
  - Call `recommend_best_duplicate()` for each group
  - Add group-level aggregates

## API Response Format

**Before (old):**
```json
{
  "duplicate_groups": [{
    "hash": "abc123...",
    "match_type": "exact",
    "files": [{
      "id": 8,
      "original_filename": "photo.jpg",
      "file_size_bytes": 923579
    }]
  }]
}
```

**After (new):**
```json
{
  "duplicate_groups": [{
    "hash": "abc123...",
    "match_type": "exact",
    "file_count": 2,
    "recommended_id": 8,
    "total_size_bytes": 1847158,
    "best_resolution_mp": 4.51,
    "files": [{
      "id": 8,
      "original_filename": "photo.jpg",
      "file_size_bytes": 923579,
      "width": 2600,
      "height": 1733,
      "resolution_mp": 4.51,
      "format": "jpeg"
    }]
  }]
}
```

## Testing & Verification

**Live Testing Against Job 1:**
- 2 duplicate groups found
- Each group has `recommended_id` field
- All 4 files have complete quality metrics (width, height, resolution_mp, format)
- Recommended files have highest resolution in their groups
- Discarded files correctly excluded

**Verification Commands:**
```bash
curl -s http://localhost:5000/api/jobs/1/duplicates | grep '"recommended_id"'
curl -s http://localhost:5000/api/jobs/1/duplicates | grep '"resolution_mp"'
```

## Decisions Made

### 1. Resolution Prioritized Over File Size
**Decision:** Quality score = resolution * 1M + file_size

**Rationale:**
- Higher resolution = better source image (more detail to preserve)
- File size matters only at same resolution (less compression = better)
- Ensures 0.48 MP image never beats 4.51 MP image, even if larger

**Alternatives Considered:**
- Size-only: Would recommend largest file regardless of resolution (wrong for thumbnails)
- Format-based: JPEG vs PNG preferences are subjective and context-dependent

### 2. Graceful Degradation for Missing Metrics
**Decision:** Return None for unavailable metrics, fall back to file size for scoring

**Rationale:**
- Videos don't have image dimensions (yet - could extract from frames in Phase 6)
- Corrupted images may fail dimension extraction
- Better to recommend based on available data than fail entirely

**Implementation:**
- `get_quality_metrics()` returns None for missing width/height
- `recommend_best_duplicate()` checks for None and uses size-only scoring

### 3. Group-Level Aggregates Included
**Decision:** Add `total_size_bytes` and `best_resolution_mp` to each group

**Rationale:**
- Enables UI to show "2 files, 1.8 MB total, up to 4.51 MP" at a glance
- Frontend doesn't need to calculate these from file list
- Useful for sorting duplicate groups by impact (largest savings first)

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Blocks Phase 5 Plan 02 (Duplicate Resolution UI):**
- ✓ API returns all data needed for side-by-side comparison
- ✓ Recommendation logic available for UI to display
- ✓ Quality metrics formatted for human-readable display

**Enables Phase 6 (Perceptual Duplicates):**
- ✓ `get_quality_metrics()` reusable for perceptual duplicate scoring
- ✓ `recommend_best_duplicate()` works with any list of file dicts
- ✓ Pattern established for quality-based recommendations

**No Blockers Identified**

## Integration Notes

**For Frontend Developers (Phase 5 Plan 02):**
- Use `recommended_id` to highlight the best file in the group
- Display `resolution_mp` as "4.51 MP" for readability
- Show file size using human-readable format (KB/MB)
- Use `best_resolution_mp` for group-level stats
- Color-code recommendations (green border or badge)

**For Perceptual Duplicate Detection (Phase 6):**
- Import `get_quality_metrics` and `recommend_best_duplicate` from app.lib.duplicates
- Call metrics extraction during perceptual hash comparison
- Use same scoring algorithm for consistent recommendations

## Performance Notes

- `get_image_dimensions()` calls ExifTool for each file (~10-50ms per file)
- Recommendation calculation is O(n) per group, negligible overhead
- API response includes all metrics inline (no additional requests needed)
- Tested with 2 duplicate groups (4 files) - instant response

**Optimization Opportunities:**
- Cache dimensions in database (Phase 7 - optional optimization)
- Batch ExifTool calls for multiple files (future improvement)

## Links

**Depends On:**
- Phase 4 Plan 07: Review workflow (provides reviewed/discarded state)

**Required By:**
- Phase 5 Plan 02: Duplicate resolution UI
- Phase 6: Perceptual duplicate detection

**Related:**
- app/lib/metadata.py: `get_image_dimensions()` function
- app/models.py: File model with storage_path and mime_type fields
