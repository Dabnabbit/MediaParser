# Duplicate Detection System Design

**Created:** 2026-02-04
**Status:** Draft - Phase 6 Planning

## Overview

Two-tier duplicate detection system that separates exact duplicates from similar/related images, enforcing a sequential resolution workflow before timestamp review.

## Terminology

| Term | Definition | Examples |
|------|------------|----------|
| **Duplicate** | Exact same image in different file | Copies, resizes, format conversions (JPG↔PNG) |
| **Similar** | Related but distinct images | Burst shots, panorama fragments, near-matches |

## Workflow Stages

```
Upload → Process → DUPLICATES → SIMILAR → UNREVIEWED → REVIEWED → Export
                       ↓            ↓
                 (exact matches) (sequences/
                  must resolve   near-matches)
                     first       must resolve
                                   second
```

### Stage: DUPLICATES (Exact Matches)

**What it catches:**
- SHA256 identical files (same bytes)
- Perceptual distance 0-4 (same image, different format/resolution/compression)

**User action:** Pick ONE file to keep per group (clear winner based on quality)

**Confidence levels:**
- HIGH: SHA256 match OR perceptual distance 0-2
- MEDIUM: Perceptual distance 3-4

**Quick actions:**
- "Auto-keep highest resolution in all groups"
- "Auto-keep largest file in all groups"

**UI:** Radio selection (mutually exclusive - keep exactly one)

---

### Stage: SIMILAR (Sequences & Near-Matches)

**What it catches:**
- Burst sequences (perceptual distance 5-15, timestamps within seconds)
- Panorama fragments (perceptual distance varies, timestamps clustered)
- General similar images (perceptual distance 5-20)

**User action:** Pick MULTIPLE files to keep (user decides how many)

**Confidence levels:**
- HIGH: Perceptual distance 5-8 with timestamp clustering
- MEDIUM: Perceptual distance 9-15
- LOW: Perceptual distance 16-20

**Sub-types (for UI hints):**
- `burst` - Rapid sequence detected (timestamps < 2 seconds apart)
- `panorama` - Overlapping shots detected (timestamps clustered, specific patterns)
- `similar` - General perceptual similarity

**Quick actions:**
- "Keep first and last of burst"
- "Keep all (not similar)" - removes from group, keeps all
- "Keep sharpest" (future: blur detection)

**UI:** Checkbox selection (keep multiple), temporal layout for bursts

---

### Stage: UNREVIEWED (Timestamp Review)

Only reached after DUPLICATES and SIMILAR are resolved (0 groups remaining).

Files here have:
- No exact duplicates (or duplicates resolved)
- No pending similar groups (or similar resolved)
- Timestamp needs review (or auto-confirmed if HIGH confidence)

---

## Data Model Changes

### File Model Additions

```python
class File:
    # Existing
    file_hash_sha256: str              # Exact byte hash
    file_hash_perceptual: str          # dHash for similarity
    duplicate_group_id: str            # Current - will rename

    # New/Renamed
    exact_group_id: Optional[str]      # Group ID for exact duplicates
    exact_group_confidence: Optional[ConfidenceLevel]

    similar_group_id: Optional[str]    # Group ID for similar/sequence matches
    similar_group_confidence: Optional[ConfidenceLevel]
    similar_group_type: Optional[str]  # 'burst', 'panorama', 'similar'
```

### Migration Path

1. Rename `duplicate_group_id` → `exact_group_id`
2. Add `exact_group_confidence` (default HIGH for existing SHA256 groups)
3. Add `similar_group_id`, `similar_group_confidence`, `similar_group_type`

---

## Detection Algorithm

### Design Principle: Timestamp-Constrained Perceptual Matching

**Key insight:** Full O(n²) perceptual comparison is too expensive. Instead, we use timestamp clustering as a constraint - only compare files that are temporally close.

**Why this works:**
- Format conversions preserve EXIF timestamps → same cluster
- Resizes preserve EXIF timestamps → same cluster
- Burst shots have timestamps milliseconds apart → same cluster
- Panoramas have timestamps seconds apart → same cluster

**What we skip (acceptable edge cases):**
- Edits made days/weeks later (different timestamp)
- Format conversions with stripped EXIF (rare)

These edge cases can be handled manually or via optional "deep scan" later.

### Complexity Analysis

| Approach | Complexity | 10,000 files |
|----------|------------|--------------|
| Full pairwise | O(n²) | 50,000,000 comparisons |
| Timestamp-constrained | O(n log n) + O(k²) | ~20,000 comparisons |

**~2,500x improvement** by using timestamp clustering as a constraint.

### Pass 1: SHA256 Exact Match

```python
def detect_sha256_duplicates(files):
    """Group files with identical SHA256 hashes. O(n) with hash table."""
    groups = defaultdict(list)
    for f in files:
        if f.file_hash_sha256:
            groups[f.file_hash_sha256].append(f)

    for hash_val, group_files in groups.items():
        if len(group_files) >= 2:
            for f in group_files:
                f.exact_group_id = hash_val
                f.exact_group_confidence = ConfidenceLevel.HIGH
```

### Pass 2: Timestamp Clustering

```python
def cluster_by_timestamp(files, threshold_seconds=5):
    """Group files with timestamps within threshold. O(n log n) sort + O(n) scan."""
    # Sort by timestamp
    sorted_files = sorted(
        [f for f in files if f.detected_timestamp],
        key=lambda f: f.detected_timestamp
    )

    clusters = []
    current_cluster = []

    for f in sorted_files:
        if not current_cluster:
            current_cluster = [f]
        elif (f.detected_timestamp - current_cluster[-1].detected_timestamp).total_seconds() <= threshold_seconds:
            current_cluster.append(f)
        else:
            if len(current_cluster) >= 2:
                clusters.append(current_cluster)
            current_cluster = [f]

    # Don't forget last cluster
    if len(current_cluster) >= 2:
        clusters.append(current_cluster)

    return clusters
```

### Pass 3: Within-Cluster Perceptual Analysis

```python
def analyze_cluster(cluster):
    """Analyze perceptual relationships within a timestamp cluster. O(k²) for small k."""

    for i, file_a in enumerate(cluster):
        for file_b in cluster[i+1:]:
            if not (file_a.file_hash_perceptual and file_b.file_hash_perceptual):
                continue

            distance = hamming_distance(file_a.file_hash_perceptual, file_b.file_hash_perceptual)

            if distance <= 5:
                # DUPLICATE: Same image (format conversion, resize, light edit)
                merge_into_exact_group(file_a, file_b, distance)
            elif distance <= 20:
                # SIMILAR: Related images (burst, panorama)
                merge_into_similar_group(file_a, file_b, distance)
            # else: distance > 20, not related (coincidental timing)

def merge_into_exact_group(file_a, file_b, distance):
    """Merge two files into an exact duplicate group."""
    # If either already in a group, use that group_id
    group_id = file_a.exact_group_id or file_b.exact_group_id or generate_group_id()
    confidence = distance_to_confidence(distance)  # 0-2: HIGH, 3-5: HIGH

    file_a.exact_group_id = group_id
    file_a.exact_group_confidence = confidence
    file_b.exact_group_id = group_id
    file_b.exact_group_confidence = confidence

def merge_into_similar_group(file_a, file_b, distance):
    """Merge two files into a similar/sequence group."""
    group_id = file_a.similar_group_id or file_b.similar_group_id or generate_group_id()
    confidence = distance_to_similar_confidence(distance)  # 6-10: HIGH, 11-15: MEDIUM, 16-20: LOW
    group_type = detect_sequence_type(file_a, file_b)

    file_a.similar_group_id = group_id
    file_a.similar_group_confidence = confidence
    file_a.similar_group_type = group_type
    file_b.similar_group_id = group_id
    file_b.similar_group_confidence = confidence
    file_b.similar_group_type = group_type
```

### Sequence Type Detection

```python
def detect_sequence_type(file_a, file_b):
    """Determine relationship type based on timestamp gap."""
    if not (file_a.detected_timestamp and file_b.detected_timestamp):
        return 'similar'

    gap = abs((file_a.detected_timestamp - file_b.detected_timestamp).total_seconds())

    if gap < 2:
        return 'burst'      # Rapid fire shots
    elif gap < 30:
        return 'panorama'   # Panorama or slow sequence
    else:
        return 'similar'    # General similarity
```

### Full Detection Pipeline

```python
def detect_all_duplicates(job):
    """Run complete duplicate detection pipeline."""
    files = job.files

    # Pass 1: SHA256 exact matches (O(n))
    detect_sha256_duplicates(files)

    # Pass 2: Timestamp clustering (O(n log n))
    clusters = cluster_by_timestamp(files, threshold_seconds=5)

    # Pass 3: Within-cluster perceptual analysis (O(k²) per cluster, k is small)
    for cluster in clusters:
        analyze_cluster(cluster)

    db.session.commit()
```

---

## Confidence Calculation

### Exact Duplicates (distance 0-5)

| Condition | Confidence | Rationale |
|-----------|------------|-----------|
| SHA256 match | HIGH | Byte-identical, no question |
| Perceptual distance 0-2 | HIGH | Format conversion, lossless resize |
| Perceptual distance 3-5 | HIGH | Lossy compression, light edits |

All exact duplicates are HIGH confidence because they're constrained by timestamp clustering - temporal proximity provides corroborating evidence.

### Similar/Sequences (distance 6-20)

| Condition | Confidence | Rationale |
|-----------|------------|-----------|
| Distance 6-10, burst type | HIGH | Clear burst sequence |
| Distance 6-10, panorama type | HIGH | Clear panorama sequence |
| Distance 11-15 | MEDIUM | Related but more variation |
| Distance 16-20 | LOW | Edge of similarity, user verify |

### Confidence Mapping Functions

```python
def distance_to_exact_confidence(distance):
    """Map perceptual distance to exact duplicate confidence."""
    # All exact duplicates (0-5) are HIGH because timestamp clustering
    # provides corroborating evidence
    return ConfidenceLevel.HIGH

def distance_to_similar_confidence(distance, sequence_type):
    """Map perceptual distance to similar group confidence."""
    if distance <= 10:
        return ConfidenceLevel.HIGH
    elif distance <= 15:
        return ConfidenceLevel.MEDIUM
    else:
        return ConfidenceLevel.LOW
```

---

## API Changes

### New Endpoints

```
GET /api/jobs/:id/exact-duplicates
    Returns exact duplicate groups with quality metrics

GET /api/jobs/:id/similar-groups
    Returns similar/sequence groups with type and timestamps

POST /api/exact-groups/:id/resolve
    Body: { keep_file_id: int }
    Keeps one file, discards others, clears exact_group_id

POST /api/similar-groups/:id/resolve
    Body: { keep_file_ids: [int, ...] }
    Keeps selected files, discards others, clears similar_group_id
```

### Summary Endpoint Update

```
GET /api/jobs/:id/summary
    Returns:
    {
        exact_duplicate_groups: 23,
        exact_duplicate_files: 67,
        similar_groups: 8,
        similar_files: 34,
        unreviewed: 145,
        reviewed: 0,
        discarded: 0,
        failed: 2
    }
```

---

## UI Modes

### Mode Progression (Left to Right)

```
[Duplicates (23)] → [Similar (8)] → [Unreviewed (145)] → [Reviewed] → [Discarded] → [Failed]
     ↑                    ↑
   Must resolve      Must resolve
     first             second
```

### Mode Availability

| Mode | Available When |
|------|----------------|
| Duplicates | Always (if groups exist) |
| Similar | Duplicates = 0 (or skipped) |
| Unreviewed | Duplicates = 0 AND Similar = 0 |
| Reviewed | Always |
| Discarded | Always |
| Failed | Always |

### Skip Option

User can choose to "Skip duplicate review" or "Skip similar review" if they want to keep all files. This clears all group IDs without discarding.

---

## Resolution Behavior

### When Exact Duplicate is Resolved

1. Kept file: `exact_group_id = NULL`, stays in workflow
2. Discarded files: `exact_group_id = NULL`, `discarded = True`
3. If kept file is in a similar group, it remains there

### When Similar Group is Resolved

1. Kept files: `similar_group_id = NULL`, move to Unreviewed
2. Discarded files: `similar_group_id = NULL`, `discarded = True`

### Undiscard Behavior

1. Check SHA256 against non-discarded files → restore exact_group_id if match
2. Check perceptual hash against non-discarded files → restore similar_group_id if within threshold
3. Both are re-evaluated independently

---

## Phase 6 Implementation Plan

### 6.1: Data Model Migration
- Rename `duplicate_group_id` → `exact_group_id`
- Add `exact_group_confidence` field
- Add `similar_group_id`, `similar_group_confidence`, `similar_group_type` fields
- Database migration script (Alembic)

### 6.2: Detection Algorithm
- Implement timestamp clustering function
- Implement within-cluster perceptual analysis
- Implement Hamming distance calculation for perceptual hashes
- Add sequence type detection (burst vs panorama vs similar)
- Integrate into post-processing pipeline (after file processing completes)

### 6.3: API Updates
- Rename `/api/jobs/:id/duplicates` → `/api/jobs/:id/exact-duplicates`
- Add `/api/jobs/:id/similar-groups` endpoint
- Update summary endpoint with both group counts
- Update resolve/discard logic for both group types
- Update undiscard to re-evaluate both group types

### 6.4: UI - Duplicates Mode (Enhanced)
- Rename mode chip to "Duplicates" (exact matches)
- Update quality comparison cards
- Radio selection (pick one)
- Bulk "Auto-keep best quality" action

### 6.5: UI - Similar Mode (New)
- Add "Similar" mode chip
- Sequence visualization (timeline for bursts)
- Checkbox multi-select (pick favorites)
- Smart actions: "Keep first+last", "Keep all"
- Sequence type indicator (burst/panorama/similar)

### 6.6: Workflow Enforcement
- Mode availability: Duplicates → Similar → Unreviewed
- Warning if trying to skip ahead
- "Skip" option to mark all as non-duplicates
- Progress indicators per phase

### 6.7: Human Verification
- Test exact duplicate detection and resolution
- Test similar/burst detection and resolution
- Test workflow enforcement
- Test undiscard re-evaluation

---

## Open Questions

1. **Perceptual hash algorithm:** Currently using dHash only. Multi-algorithm consensus (pHash/aHash) deferred - add if false positive rate is too high.

2. **Threshold configuration:** Hardcoded for v1. User-adjustable thresholds deferred to future iteration.

3. **Cross-job duplicates:** Currently scoped to single job. Cross-job detection deferred - would require global hash index.

4. **Video handling:** Currently skipped for perceptual hashing. Could generate thumbnail and hash in future.

5. ~~**Performance:** Perceptual clustering is O(n²).~~ **RESOLVED:** Timestamp-constrained approach reduces to O(n log n) + O(k²) for small k.

## Deferred Edge Cases

These scenarios are not handled in v1 but could be added later:

1. **Edits made days/weeks later** - Different timestamps, won't cluster. User handles manually in review.

2. **Format conversion with stripped EXIF** - No timestamp, won't cluster. Rare in practice.

3. **Cross-cluster duplicates** - Same image appearing in unrelated time ranges. Would require O(n²) or LSH bucketing.

**Mitigation:** Add optional "Deep Scan" mode later that does fuller comparison for users who want thoroughness over speed.

---

## References

- Phase 5: Exact duplicate detection (SHA256 only)
- Roadmap Phase 6: Perceptual duplicate detection
- imagehash library: dHash, pHash, aHash algorithms
- Hamming distance for hash comparison
