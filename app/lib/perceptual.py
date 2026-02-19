"""
Perceptual duplicate detection using Hamming distance on perceptual hashes.

Compares all files with perceptual hashes via O(n²) pairwise comparison.
For household-scale collections (<10K files) this completes in seconds
since each comparison is just integer XOR + bit_count.
"""
from datetime import timezone
from typing import List
import uuid
import logging

logger = logging.getLogger(__name__)

# Sentinel value for incomparable hashes (None/empty/invalid inputs)
INCOMPARABLE_DISTANCE = 999

# Detection thresholds
EXACT_THRESHOLD = 5         # Hamming distance 0-5 = exact duplicate
SIMILAR_THRESHOLD = 16      # Hamming distance 6-16 = similar
BURST_THRESHOLD = 2         # Seconds gap for burst detection
PANORAMA_THRESHOLD = 30     # Seconds gap for panorama detection


def hamming_distance(hash1: str, hash2: str) -> int:
    """
    Calculate Hamming distance between two perceptual hash hex strings.

    Uses hardware-accelerated int.bit_count() (Python 3.10+) for fast
    computation of bit differences between hashes.

    Args:
        hash1: First perceptual hash (hex string)
        hash2: Second perceptual hash (hex string)

    Returns:
        Number of differing bits (0-64 for 64-bit hashes)
        Returns 999 for None/empty inputs (indicates incomparable)

    Example:
        >>> hamming_distance('0000000000000000', '0000000000000001')
        1
        >>> hamming_distance('ffffffffffffffff', '0000000000000000')
        64
    """
    # Handle None/empty inputs
    if not hash1 or not hash2:
        return INCOMPARABLE_DISTANCE

    try:
        # Convert hex strings to integers and XOR
        int1 = int(hash1, 16)
        int2 = int(hash2, 16)
        xor_result = int1 ^ int2

        # Count differing bits (hardware-accelerated in Python 3.10+)
        return xor_result.bit_count()
    except (ValueError, AttributeError) as e:
        logger.warning(f"Invalid hash format: {hash1}, {hash2}: {e}")
        return INCOMPARABLE_DISTANCE


def detect_sequence_type(file_a, file_b) -> str:
    """
    Determine relationship type based on timestamp gap.

    Args:
        file_a: First file object with detected_timestamp
        file_b: Second file object with detected_timestamp

    Returns:
        'burst' if gap < 2 seconds (rapid fire shots)
        'panorama' if gap < 30 seconds (panorama or slow sequence)
        'similar' otherwise (general similarity or missing timestamps)
    """
    if not (file_a.detected_timestamp and file_b.detected_timestamp):
        return 'similar'

    # Normalize to naive UTC to avoid mixed tz-aware/naive subtraction errors
    ts_a = file_a.detected_timestamp
    ts_b = file_b.detected_timestamp
    if ts_a.tzinfo is not None:
        ts_a = ts_a.astimezone(timezone.utc).replace(tzinfo=None)
    if ts_b.tzinfo is not None:
        ts_b = ts_b.astimezone(timezone.utc).replace(tzinfo=None)

    gap = abs((ts_a - ts_b).total_seconds())

    if gap < BURST_THRESHOLD:
        return 'burst'
    elif gap < PANORAMA_THRESHOLD:
        return 'panorama'
    else:
        return 'similar'


# Thresholds for average pairwise distance → confidence
EXACT_CONF_HIGH = 1         # avg ≤ 1 → high (byte-identical or near-identical)
EXACT_CONF_MEDIUM = 3       # avg ≤ 3 → medium, else low
SIMILAR_CONF_HIGH = 8       # avg ≤ 8 → high
SIMILAR_CONF_MEDIUM = 13    # avg ≤ 13 → medium, else low


def _compute_similar_group_confidence(members: list) -> str:
    """
    Compute a single confidence level for a similar group.

    Uses plain average of pairwise Hamming distances. Since similar
    pairs have distances 6-20, this naturally spreads across all
    three confidence levels without any weighting.

    Args:
        members: List of file objects in the group

    Returns:
        'high', 'medium', or 'low'
    """
    if len(members) < 2:
        return 'low'

    distances = []
    for i, a in enumerate(members):
        for b in members[i + 1:]:
            if not (a.file_hash_perceptual and b.file_hash_perceptual):
                continue
            distances.append(hamming_distance(a.file_hash_perceptual, b.file_hash_perceptual))

    if not distances:
        return 'low'

    avg = sum(distances) / len(distances)

    if avg <= SIMILAR_CONF_HIGH:
        return 'high'
    elif avg <= SIMILAR_CONF_MEDIUM:
        return 'medium'
    else:
        return 'low'


def _finalize_similar_groups(files: list):
    """
    Post-process files to compute group-level confidence and type.

    Called after all pairwise merges. Computes a single confidence and
    dominant sequence type shared by all members of each similar group.

    Args:
        files: List of file objects (some may have similar_group_id set)
    """
    from collections import defaultdict

    groups = defaultdict(list)
    for f in files:
        if f.similar_group_id:
            groups[f.similar_group_id].append(f)

    for group_id, members in groups.items():
        # Compute group confidence from all pairwise distances
        confidence = _compute_similar_group_confidence(members)

        # Determine dominant sequence type from pairwise time gaps
        type_counts = defaultdict(int)
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                type_counts[detect_sequence_type(a, b)] += 1
        group_type = max(type_counts, key=type_counts.get) if type_counts else 'similar'

        # Apply to all members
        for f in members:
            f.similar_group_confidence = confidence
            f.similar_group_type = group_type


def _finalize_exact_groups(files: list):
    """
    Post-process files to compute group-level confidence for exact groups.

    Called after all pairwise merges. Groups with no computable perceptual
    distances (e.g. SHA256-only matches without perceptual hashes) default
    to 'high' since byte-identical files are always high confidence.

    Args:
        files: List of file objects (some may have exact_group_id set)
    """
    from collections import defaultdict

    groups = defaultdict(list)
    for f in files:
        if f.exact_group_id:
            groups[f.exact_group_id].append(f)

    for group_id, members in groups.items():
        distances = []
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if a.file_hash_perceptual and b.file_hash_perceptual:
                    distances.append(hamming_distance(a.file_hash_perceptual, b.file_hash_perceptual))

        if not distances:
            # No perceptual hashes (SHA256-only groups) → always high
            confidence = 'high'
        else:
            avg = sum(distances) / len(distances)
            if avg <= EXACT_CONF_HIGH:
                confidence = 'high'
            elif avg <= EXACT_CONF_MEDIUM:
                confidence = 'medium'
            else:
                confidence = 'low'

        for f in members:
            f.exact_group_confidence = confidence


def _generate_group_id() -> str:
    """
    Generate a unique group ID for duplicate/similar groups.

    Returns:
        16-character hex string (short but unique enough for household scale)
    """
    return uuid.uuid4().hex[:16]


def _merge_into_exact_group(file_a, file_b):
    """
    Merge two files into an exact duplicate group.

    If either file is already in a group, reuse that group_id.
    Otherwise, generate a new group_id. Confidence is computed
    later by _finalize_exact_groups().

    Args:
        file_a: First file object
        file_b: Second file object

    Side effects:
        Sets exact_group_id on both files
    """
    # Reuse existing group or create new
    group_id = file_a.exact_group_id or file_b.exact_group_id or _generate_group_id()

    file_a.exact_group_id = group_id
    file_b.exact_group_id = group_id


def _merge_into_similar_group(file_a, file_b):
    """
    Merge two files into a similar/sequence group.

    Only assigns group membership. Confidence and type are computed
    as group-level aggregates by _finalize_similar_groups() after
    all pairwise comparisons are complete.

    Args:
        file_a: First file object
        file_b: Second file object

    Side effects:
        Sets similar_group_id on both files
    """
    group_id = file_a.similar_group_id or file_b.similar_group_id or _generate_group_id()
    file_a.similar_group_id = group_id
    file_b.similar_group_id = group_id


def _compare_all_pairs(files: List):
    """
    Pairwise comparison of all files with perceptual hashes.

    O(n²) but each comparison is just integer XOR + bit_count,
    so this handles thousands of files in seconds.

    Files with distance 0-5 are merged into exact duplicate groups.
    Files with distance 6-20 are merged into similar groups.
    Files with distance >20 are unrelated.

    Args:
        files: List of file objects with file_hash_perceptual

    Side effects:
        Updates exact_group_id/similar_group_id on file objects as matches found
    """
    # Filter to files that have perceptual hashes
    hashable = [f for f in files if f.file_hash_perceptual]

    for i, file_a in enumerate(hashable):
        for file_b in hashable[i+1:]:
            distance = hamming_distance(file_a.file_hash_perceptual, file_b.file_hash_perceptual)

            if distance <= EXACT_THRESHOLD:
                _merge_into_exact_group(file_a, file_b)
            elif distance <= SIMILAR_THRESHOLD:
                _merge_into_similar_group(file_a, file_b)

    # Compute group-level confidence for exact and similar groups
    _finalize_exact_groups(files)
    _finalize_similar_groups(files)


def detect_perceptual_duplicates(files):
    """
    Main entry point for perceptual duplicate detection.

    Compares all files with perceptual hashes via O(n²) pairwise
    comparison. No timestamp gating — images are grouped purely
    by visual similarity. Timestamps are only used to label
    relationship type (burst/panorama/similar) after grouping.

    Args:
        files: List of File objects from a job

    Side effects:
        Sets exact_group_id, similar_group_id, and related fields on file objects
        Does NOT commit to database - caller must commit
    """
    hashable = [f for f in files if f.file_hash_perceptual]
    logger.info(f"Starting perceptual duplicate detection: {len(hashable)} of {len(files)} files have hashes")

    if len(hashable) < 2:
        logger.info("Fewer than 2 files with perceptual hashes, nothing to compare")
        return

    _compare_all_pairs(files)

    # Count unique groups for summary logging
    exact_groups = {f.exact_group_id for f in files if f.exact_group_id}
    similar_groups = {f.similar_group_id for f in files if f.similar_group_id}

    logger.info(
        f"Perceptual detection complete: {len(exact_groups)} exact groups, "
        f"{len(similar_groups)} similar groups from {len(hashable)} hashable files"
    )
