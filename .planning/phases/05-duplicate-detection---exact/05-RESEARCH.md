# Phase 5: Duplicate Detection - Exact - Research

**Researched:** 2026-02-03
**Domain:** Duplicate file detection and comparison UI/UX
**Confidence:** HIGH

## Summary

Phase 5 focuses on building a review workflow for exact duplicates (detected via SHA256 hash) where users compare files side-by-side and explicitly choose which to keep before any deletion occurs. The core challenge is presenting duplicate groups clearly with quality metrics (resolution, file size) to enable informed decisions while preventing accidental data loss.

The standard approach uses **card-based layouts for visual comparison**, showing duplicate groups with thumbnails and metadata side-by-side. Industry best practice emphasizes **multi-stage confirmation workflows** to prevent accidental deletions, especially for irreplaceable family photos. Quality selection logic typically prioritizes files by resolution first, then file size, then timestamp.

The existing codebase already has the foundation: SHA256 hashing during import, duplicate_group_id field on File model, and a "Duplicates" mode in the unified grid. Phase 5 extends this with **dedicated comparison UI, quality metrics display, and explicit keep/discard selection** per group.

**Primary recommendation:** Build a card-based duplicate group view with side-by-side file comparison, quality badges (resolution, file size), radio button selection for "keep" choice, and multi-step confirmation before discarding. Reuse existing examination modal patterns and selection toolbar infrastructure from Phase 4.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Pillow (PIL) | 10.x+ | Image dimensions/metadata | Python standard for image processing, already in use for thumbnails |
| SQLAlchemy | 2.x | Grouping queries | Already in stack, supports GROUP BY for duplicate detection |
| Flask | 3.x | REST API endpoints | Already in stack for /api/jobs/:id/duplicates endpoint |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ExifTool (PyExifTool) | current | Full EXIF metadata extraction | Already in use via app.lib.metadata.get_image_dimensions() |
| Native HTML `<dialog>` | - | Modal confirmation dialogs | Already used in Phase 4 examination modal, browser-native accessibility |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Card layout | List view | Cards better for heterogeneous visual comparison; lists better for strict ordering |
| Radio buttons | Checkboxes | Radio enforces single "keep" choice per group (clearer intent); checkboxes allow multi-keep |
| Pillow | OpenCV | Pillow sufficient for dimensions/resolution; OpenCV overkill for metadata-only needs |

**Installation:**
No new dependencies required - all libraries already in project.

## Architecture Patterns

### Recommended Project Structure
```
app/
├── routes/
│   ├── review.py         # Existing: /api/files/:id/confirm, /api/files/bulk/*
│   └── jobs.py           # Existing: /api/jobs/:id/duplicates endpoint
├── static/js/
│   ├── duplicates.js     # NEW: DuplicatesHandler for group comparison UI
│   ├── selection.js      # EXISTS: Modify for duplicate group actions
│   └── examination.js    # EXISTS: Reuse modal pattern for quality comparison
└── templates/
    └── index.html        # EXISTS: Add duplicate comparison section
```

### Pattern 1: Card-Based Duplicate Group Layout
**What:** Display duplicate groups as expandable cards, each showing all files in the group side-by-side with thumbnails and quality metrics.

**When to use:** When users need to visually compare multiple versions of the same file to make informed keep/discard decisions.

**Example:**
```html
<!-- Each duplicate group as a card -->
<div class="duplicate-group-card" data-group-hash="abc123...">
  <div class="group-header">
    <h3>Duplicate Group (3 files)</h3>
    <span class="recommended-badge">Best: DSC_1234.jpg</span>
  </div>
  <div class="files-comparison">
    <div class="file-option" data-file-id="101">
      <img src="/thumbnails/101_thumb.jpg" />
      <div class="quality-metrics">
        <span class="resolution">3024×4032</span>
        <span class="file-size">2.4 MB</span>
        <span class="timestamp">Dec 25, 2023</span>
      </div>
      <label>
        <input type="radio" name="keep-abc123" value="101" />
        Keep this file
      </label>
    </div>
    <!-- Repeat for other files in group -->
  </div>
  <div class="group-actions">
    <button class="confirm-selection">Confirm Selection</button>
    <button class="keep-all">Keep All (Not Duplicates)</button>
  </div>
</div>
```

**Why this pattern:**
- Cards work well with responsive design and heterogeneous content (different filenames, sizes, etc.)
- Side-by-side comparison within cards enables visual quality assessment
- Radio buttons enforce single "keep" choice per group (mutually exclusive)
- Source: [Cards: UI-Component Definition](https://www.nngroup.com/articles/cards-component/)

### Pattern 2: Quality-Based Auto-Recommendation
**What:** Automatically highlight the "recommended" file in each duplicate group based on quality metrics.

**When to use:** Guide user decisions by marking the highest-quality file, but allow override.

**Selection criteria (in priority order):**
1. **Highest resolution** (width × height in pixels)
2. **Largest file size** (indicates less compression)
3. **Earliest timestamp** (original capture, not later edit)
4. **EXIF presence** (files with EXIF preferred over those without)

**Example:**
```python
def recommend_best_duplicate(files: list[File]) -> int:
    """
    Recommend which file to keep from duplicate group.
    Returns file_id of recommended file.
    """
    scored_files = []

    for file in files:
        width, height = get_image_dimensions(file.storage_path) or (0, 0)
        resolution = width * height

        score = (
            resolution * 1000000 +          # Resolution is primary factor
            (file.file_size_bytes or 0) +  # File size secondary
            0  # Could add EXIF presence bonus
        )
        scored_files.append((score, file.id))

    # Return file_id with highest score
    return max(scored_files, key=lambda x: x[0])[1]
```

**Why this pattern:**
- Reduces cognitive load for users with clear recommendations
- Resolution is most objective quality metric for photos
- File size correlates with compression quality
- Source: [Best Duplicate Photo Finders](https://tonfotos.com/articles/best-apps-to-find-and-remove-duplicate-photos/)

### Pattern 3: Multi-Stage Confirmation Workflow
**What:** Prevent accidental deletions through progressive disclosure and explicit confirmation.

**When to use:** Any destructive action involving irreplaceable files (family photos).

**Stages:**
1. **Selection:** User picks which file(s) to keep via radio buttons (reversible)
2. **Review:** Confirm button shows summary modal: "Keep 5 files, discard 12 files from 7 groups"
3. **Confirmation:** Type-to-confirm or explicit checkbox: "I understand discarded files will not be in output"
4. **Execution:** Mark files as discarded (soft delete - no actual file deletion)

**Example:**
```javascript
async confirmDuplicateResolution() {
    const groups = this.getResolvedGroups(); // Groups with radio selection

    // Stage 1: Validate all groups resolved
    if (groups.unresolved.length > 0) {
        alert(`Please resolve ${groups.unresolved.length} remaining duplicate groups`);
        return;
    }

    // Stage 2: Show summary modal
    const modal = document.getElementById('duplicate-confirm-modal');
    modal.querySelector('.keep-count').textContent = groups.keepCount;
    modal.querySelector('.discard-count').textContent = groups.discardCount;
    modal.showModal();

    // Stage 3: User confirms via checkbox + button
    // (handled in modal's confirm button click)
}
```

**Why this pattern:**
- Progressive friction matches severity of action (permanent data loss)
- Summary review catches mistakes before execution
- Type-to-confirm forces conscious decision (GitHub pattern)
- Sources:
  - [Delete with Additional Confirmation](https://cloudscape.design/patterns/resource-management/delete/delete-with-additional-confirmation/)
  - [How to Make Sure Users Don't Accidentally Delete](https://uxmovement.com/buttons/how-to-make-sure-users-dont-accidentally-delete/)

### Anti-Patterns to Avoid
- **One-click discard from grid view:** Too easy to accidentally delete without comparison - require explicit group-by-group review
- **Checkboxes for keep/discard:** Allows conflicting selections (keep multiple from "duplicate" group) - use radio buttons for clarity
- **Auto-deletion after selection:** Never delete files, only mark as discarded - originals remain in storage
- **No undo option:** Provide "unresolve group" to reset decisions before final confirmation
- **Hidden quality metrics:** Users need resolution/size visible to make informed choices - don't hide in tooltips

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image dimensions extraction | Custom image header parsing | Pillow's `Image.open(path).size` or existing `get_image_dimensions()` | Handles all formats (JPEG, PNG, HEIC, etc.), EXIF orientation, corrupted headers |
| File hash grouping query | Python dictionary grouping | SQLAlchemy's `GROUP BY file_hash_sha256` | Database-optimized, handles large result sets, supports filtering |
| Confirmation modals | Custom overlay div | Native HTML `<dialog>` element | Built-in accessibility (focus trap, Esc key), no library needed, already used in Phase 4 |
| Quality comparison scoring | Ad-hoc comparisons | Weighted scoring function with configurable priorities | Maintainable, testable, allows future tuning (e.g., prefer RAW over JPEG) |
| Duplicate group colors | Random color generation | Hash-based deterministic colors (existing in results.js) | Consistent colors across sessions, already implemented |

**Key insight:** The existing codebase already has most primitives needed (SHA256 hashing, duplicate_group_id field, get_image_dimensions(), dialog modals). Phase 5 is primarily **orchestration and UX**, not new algorithms.

## Common Pitfalls

### Pitfall 1: Assuming Hash Guarantees No Collisions
**What goes wrong:** Treating SHA256 hash match as 100% certainty files are identical without considering hash collision possibility (extremely rare but theoretically possible).

**Why it happens:** SHA256 collision probability is astronomically low (2^-256), leading developers to skip byte-verification.

**How to avoid:** For exact duplicates, SHA256 is sufficient for family photo use case (not cryptographic security). Document assumption that hash collision risk is acceptable. If paranoid, add byte-by-byte verification as optional safety check.

**Warning signs:** None expected in practice for household photo sets (<100k files).

**Sources:**
- [SHA256 for Duplicate Detection](https://www.clonefileschecker.com/blog/hashing-algorithms-to-find-duplicates/)
- [Hash-Based File Comparison](https://third-bit.com/sdxpy/dup/)

### Pitfall 2: Performance Degradation with Large Groups
**What goes wrong:** Duplicate groups with dozens of files (e.g., burst photos) cause UI slowdown when rendering all thumbnails at once.

**Why it happens:** Loading 50+ thumbnails simultaneously blocks rendering and exhausts browser memory.

**How to avoid:**
- Limit initial render to first 10 files per group, add "Show all" expander
- Use IntersectionObserver lazy loading (already implemented in Phase 4 grid)
- Backend pagination for groups with >20 files

**Warning signs:** Browser lag when expanding large duplicate groups, memory warnings in console.

### Pitfall 3: Incomplete Quality Metrics
**What goes wrong:** Using only file size to recommend "best" file misses cases where smaller file has higher resolution (better compression).

**Why it happens:** Assuming file size always correlates with quality.

**How to avoid:** Multi-factor scoring with resolution as primary factor. Extract actual dimensions via `get_image_dimensions()`, not from filename or metadata that could be wrong.

**Warning signs:** Users reporting "recommended" file is visibly lower quality than alternatives.

**Example:**
```
File A: 2.1 MB, 3024×4032 (12.2 MP)  ← Recommended (higher resolution)
File B: 2.8 MB, 2048×1536 (3.1 MP)   ← Larger but lower quality
```

### Pitfall 4: Radio Button State Management Bugs
**What goes wrong:** Radio buttons across multiple groups interfere with each other if `name` attribute isn't unique per group.

**Why it happens:** HTML radio buttons with same `name` are mutually exclusive globally, not scoped to container.

**How to avoid:** Use unique `name` per group: `name="keep-{group_hash}"`. Verify in testing that selecting radio in one group doesn't deselect another group's choice.

**Warning signs:** User selects file in Group A, then Group B selection clears Group A.

**Example:**
```html
<!-- WRONG: same name across groups -->
<input type="radio" name="keep-file" value="101" />
<input type="radio" name="keep-file" value="205" />

<!-- CORRECT: unique name per group -->
<input type="radio" name="keep-abc123" value="101" />
<input type="radio" name="keep-def456" value="205" />
```

### Pitfall 5: Discarding Without Review Record
**What goes wrong:** Marking files as discarded without recording which group they belonged to makes undo/audit impossible.

**Why it happens:** Using simple boolean `discarded` flag without context.

**How to avoid:** When discarding files from duplicate resolution:
- Keep `duplicate_group_id` field populated (don't clear it)
- Record user decision in `UserDecision` table with `decision_type: 'duplicate_resolution'`
- Store JSON payload: `{"kept_file_id": 101, "discarded_file_ids": [102, 103]}`

**Warning signs:** User reports "I accidentally discarded wrong file" but can't identify which group.

## Code Examples

Verified patterns from official sources:

### Extract Image Dimensions with Pillow
```python
# Source: https://www.tutorialspoint.com/python_pillow/python_pillow_extracting_image_metadata.htm
from PIL import Image
from pathlib import Path
from typing import Optional

def get_image_dimensions(file_path: Path | str) -> tuple[Optional[int], Optional[int]]:
    """
    Extract image width and height using Pillow.
    Handles EXIF orientation automatically.

    Returns:
        (width, height) or (None, None) if extraction fails
    """
    try:
        with Image.open(file_path) as img:
            # ImageOps.exif_transpose() already applied during thumbnail generation
            # so we can trust img.size directly
            return img.size  # Returns (width, height)
    except Exception as e:
        # Not an image or corrupted file
        return (None, None)
```

**Note:** Project already has `app.lib.metadata.get_image_dimensions()` using ExifTool. Consider whether to use existing implementation or add Pillow-based fallback for performance (Pillow faster for dimensions-only queries).

### Query Duplicate Groups with SQLAlchemy
```python
# Source: Existing app/routes/jobs.py get_job_duplicates() endpoint
from sqlalchemy import func
from app.models import File, Job

def get_duplicate_groups(job_id: int, min_group_size: int = 2) -> list[dict]:
    """
    Get duplicate groups for a job with quality metrics.

    Returns:
        List of duplicate groups with file details
    """
    job = db.session.get(Job, job_id)

    # Group files by SHA256 hash
    duplicate_groups = {}

    for file in job.files:
        if not file.file_hash_sha256 or file.discarded:
            continue  # Skip files without hash or already discarded

        hash_key = file.file_hash_sha256
        if hash_key not in duplicate_groups:
            duplicate_groups[hash_key] = []

        # Get dimensions for quality comparison
        width, height = get_image_dimensions(file.storage_path) or (None, None)

        duplicate_groups[hash_key].append({
            'id': file.id,
            'original_filename': file.original_filename,
            'file_size_bytes': file.file_size_bytes,
            'width': width,
            'height': height,
            'resolution_mp': (width * height / 1_000_000) if (width and height) else None,
            'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
            'thumbnail_path': file.thumbnail_path,
            'duplicate_group_id': file.duplicate_group_id
        })

    # Filter to groups with 2+ files
    groups_array = [
        {
            'hash': hash_key,
            'match_type': 'exact',
            'file_count': len(files),
            'files': files,
            'recommended_id': recommend_best_duplicate(files)  # Add recommendation
        }
        for hash_key, files in duplicate_groups.items()
        if len(files) >= min_group_size
    ]

    return groups_array
```

### Radio Button Selection State Management
```javascript
// Source: https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/
class DuplicatesHandler {
    constructor() {
        this.groupSelections = new Map(); // group_hash -> selected_file_id
    }

    handleRadioChange(event) {
        const radio = event.target;
        const groupHash = radio.name.replace('keep-', ''); // Extract hash from name="keep-abc123"
        const fileId = parseInt(radio.value);

        // Store selection
        this.groupSelections.set(groupHash, fileId);

        // Update UI to show which files will be discarded
        this.updateGroupPreview(groupHash);
    }

    updateGroupPreview(groupHash) {
        const selectedFileId = this.groupSelections.get(groupHash);
        const groupCard = document.querySelector(`[data-group-hash="${groupHash}"]`);

        groupCard.querySelectorAll('.file-option').forEach(option => {
            const fileId = parseInt(option.dataset.fileId);
            const badge = option.querySelector('.status-badge');

            if (fileId === selectedFileId) {
                badge.textContent = 'KEEP';
                badge.className = 'status-badge keep';
            } else {
                badge.textContent = 'DISCARD';
                badge.className = 'status-badge discard';
            }
        });
    }

    getUnresolvedGroups() {
        // Find groups without radio selection
        const allGroups = document.querySelectorAll('.duplicate-group-card');
        const unresolved = [];

        allGroups.forEach(card => {
            const groupHash = card.dataset.groupHash;
            if (!this.groupSelections.has(groupHash)) {
                unresolved.push(groupHash);
            }
        });

        return unresolved;
    }
}
```

### Multi-Stage Confirmation Modal
```javascript
// Source: https://cloudscape.design/patterns/resource-management/delete/delete-with-additional-confirmation/
async confirmAllGroups() {
    const unresolved = this.getUnresolvedGroups();

    // Stage 1: Validation
    if (unresolved.length > 0) {
        alert(`Please resolve ${unresolved.length} remaining duplicate group(s) before confirming.`);
        return;
    }

    // Calculate summary
    const keepFiles = [];
    const discardFiles = [];

    document.querySelectorAll('.duplicate-group-card').forEach(card => {
        const groupHash = card.dataset.groupHash;
        const selectedId = this.groupSelections.get(groupHash);

        card.querySelectorAll('.file-option').forEach(option => {
            const fileId = parseInt(option.dataset.fileId);
            if (fileId === selectedId) {
                keepFiles.push(fileId);
            } else {
                discardFiles.push(fileId);
            }
        });
    });

    // Stage 2: Show summary modal
    const modal = document.getElementById('duplicate-confirm-modal');
    modal.querySelector('.keep-count').textContent = keepFiles.length;
    modal.querySelector('.discard-count').textContent = discardFiles.length;
    modal.querySelector('.group-count').textContent = this.groupSelections.size;

    // Store for actual submission
    this.pendingDecision = { keepFiles, discardFiles };

    modal.showModal();
}

async executeDuplicateResolution() {
    // Stage 3: User confirmed via modal
    const { keepFiles, discardFiles } = this.pendingDecision;

    try {
        // Bulk discard API call
        const response = await fetch('/api/files/bulk/discard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_ids: discardFiles,
                reason: 'duplicate_resolution'  // Track in UserDecision
            })
        });

        if (response.ok) {
            // Success: reload to show updated state
            alert(`${discardFiles.length} files marked as discarded. Kept ${keepFiles.length} files.`);
            window.location.reload(); // Or reload duplicates view
        } else {
            alert('Failed to discard files. Please try again.');
        }
    } catch (error) {
        console.error('Duplicate resolution failed:', error);
        alert('Error processing duplicate resolution.');
    }
}
```

### Quality Metrics Display Component
```html
<!-- Source: Industry standard photo comparison interfaces -->
<div class="quality-metrics">
    <div class="metric resolution">
        <span class="label">Resolution:</span>
        <span class="value">3024×4032</span>
        <span class="detail">(12.2 MP)</span>
    </div>
    <div class="metric file-size">
        <span class="label">File Size:</span>
        <span class="value">2.4 MB</span>
    </div>
    <div class="metric timestamp">
        <span class="label">Captured:</span>
        <span class="value">Dec 25, 2023 14:32</span>
    </div>
    <div class="metric format">
        <span class="label">Format:</span>
        <span class="value">JPEG</span>
    </div>
</div>

<style>
.quality-metrics {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 4px;
    font-size: 0.875rem;
}

.metric {
    display: flex;
    gap: 0.5rem;
}

.metric .label {
    font-weight: 500;
    color: var(--text-secondary);
    min-width: 80px;
}

.metric .value {
    font-weight: 600;
    color: var(--text-primary);
}

.metric .detail {
    color: var(--text-tertiary);
    font-size: 0.8125rem;
}
</style>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hash-only duplicate detection | Multi-factor quality scoring (resolution + file size + timestamp) | 2024-2025 | Users get better recommendations, fewer manual comparisons needed |
| Checkbox multi-select for duplicates | Radio button single-choice per group | Ongoing UX trend | Clearer intent, prevents ambiguous "keep all" selections |
| Auto-delete duplicates | Soft-delete with review queue | Industry standard (safety-first) | Prevents accidental data loss of irreplaceable photos |
| List view for comparisons | Card-based side-by-side layout | 2025+ UX trends | Better visual comparison, responsive design friendly |
| MD5/SHA1 hashing | SHA256 minimum | 2020+ | Better collision resistance, SHA1 cryptographically broken |

**Deprecated/outdated:**
- **MD5 for duplicates:** Cryptographically broken, SHA256 is modern standard
- **Perceptual hash for exact duplicates:** Overkill, SHA256 sufficient and faster
- **One-click delete buttons:** Modern UX requires confirmation for destructive actions
- **Auto-selection without user review:** Safety-critical applications (photos) require explicit confirmation

## Open Questions

Things that couldn't be fully resolved:

1. **Duplicate resolution persistence across sessions**
   - What we know: Current implementation stores `duplicate_group_id` field, selection state is UI-only
   - What's unclear: Should partial group resolutions be saved (user selects 3 of 10 groups, closes browser)?
   - Recommendation: Phase 5 keeps selections in JavaScript state only (ephemeral). If user wants persistence, they must confirm all groups before leaving. Phase 6+ could add draft persistence via localStorage or database.

2. **Handling very large duplicate groups (50+ files)**
   - What we know: Burst photos or time-lapse sequences can create large groups
   - What's unclear: Should these be split into sub-groups or handled differently?
   - Recommendation: Start with limit of 20 files rendered per group, add "Show all" expander. If groups routinely exceed 50 files, consider adding "sub-group by timestamp proximity" feature in future.

3. **Cross-job duplicate detection**
   - What we know: Current `/api/jobs/:id/duplicates` endpoint only detects duplicates within a job
   - What's unclear: Should duplicates be detected across all jobs in database?
   - Recommendation: Phase 5 keeps job-scoped duplicates (simpler UX, matches current implementation). Phase 7+ could add global duplicate detection as separate feature.

4. **Video duplicate handling**
   - What we know: SHA256 hash works for exact video duplicates, but no thumbnail preview or quality metrics
   - What's unclear: How to show video quality differences (resolution, bitrate, codec)?
   - Recommendation: Phase 5 focuses on image duplicates. For videos, show filename and file size only, defer quality comparison to Phase 6 (video support expansion).

## Sources

### Primary (HIGH confidence)
- Pillow Documentation - Image metadata extraction: https://www.tutorialspoint.com/python_pillow/python_pillow_extracting_image_metadata.htm
- ExifRead PyPI - EXIF data extraction: https://pypi.org/project/ExifRead/
- Flask-SQLAlchemy Pagination: https://blog.miguelgrinberg.com/post/the-flask-mega-tutorial-part-ix-pagination
- Existing codebase patterns:
  - `app/lib/metadata.py` - get_image_dimensions() implementation
  - `app/routes/jobs.py` - get_job_duplicates() endpoint
  - `app/models.py` - File.duplicate_group_id field
  - `app/static/js/selection.js` - Multi-select patterns
  - `app/static/js/examination.js` - Modal dialog patterns

### Secondary (MEDIUM confidence)
- Nielsen Norman Group - Cards Component: https://www.nngroup.com/articles/cards-component/
- Nielsen Norman Group - Card View vs List View: https://www.nngroup.com/videos/card-view-vs-list-view/
- Nielsen Norman Group - Checkboxes vs Radio Buttons: https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/
- Cloudscape Design - Delete with Confirmation: https://cloudscape.design/patterns/resource-management/delete/delete-with-additional-confirmation/
- UX Movement - Preventing Accidental Deletion: https://uxmovement.com/buttons/how-to-make-sure-users-dont-accidentally-delete/
- Justinmind - Checkbox vs Radio Button: https://www.justinmind.com/ui-design/radio-button-vs-checkbox
- Hash-based duplicate detection best practices: https://www.clonefileschecker.com/blog/hashing-algorithms-to-find-duplicates/
- Software Design by Example - Finding Duplicate Files: https://third-bit.com/sdxpy/dup/

### Tertiary (LOW confidence - WebSearch only, needs validation)
- 2026 duplicate photo finder reviews: https://tonfotos.com/articles/best-apps-to-find-and-remove-duplicate-photos/
- UI Design Trends 2026: https://landdding.com/blog/ui-design-trends-2026
- Top duplicate photo finders 2025: https://www.mindgems.com/article/top-15-best-photo-duplicate-finder-to-delete-duplicate-photos/
- Peakto AI deduplication: https://cyme.io/en/blog/peakto-introduces-powerful-ai-driven-culling-and-deduplication/
- Bulk action UX guidelines: https://www.eleken.co/blog-posts/bulk-actions-ux

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, patterns proven in Phase 4
- Architecture: HIGH - Card-based comparison is industry standard, existing modal/selection patterns reusable
- Pitfalls: MEDIUM - Common issues documented in community discussions, but project-specific edge cases may exist
- Code examples: HIGH - Based on existing codebase and official library documentation

**Research date:** 2026-02-03
**Valid until:** ~60 days (stable domain, established UX patterns unlikely to change rapidly)

**Key assumptions:**
- Users are comfortable with visual comparison (not color-blind or accessibility-impaired)
- Duplicate groups typically <20 files (burst photos, not time-lapse sequences)
- SHA256 collision risk acceptable for household photo sets (<100k files)
- Soft-delete sufficient (no immediate file deletion needed)

**Validation needed during planning:**
- Confirm `get_image_dimensions()` performance acceptable for batch operations (10-100+ files)
- Verify radio button scoping works with dynamic group rendering
- Test modal confirmation flow with actual duplicate groups
