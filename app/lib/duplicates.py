"""
Duplicate file quality metrics and recommendation logic.

Provides functions for:
- Extracting quality metrics (resolution, file size, format)
- Recommending which duplicate to keep based on quality
- Accumulating metadata from discarded duplicates into kept file
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Format quality multipliers — influences score without overriding large resolution differences
FORMAT_MULTIPLIERS = {
    # RAW formats: highest fidelity, unprocessed sensor data
    'x-canon-cr2': 1.3, 'x-nikon-nef': 1.3, 'x-sony-arw': 1.3,
    'x-adobe-dng': 1.3, 'x-olympus-orf': 1.3, 'x-panasonic-rw2': 1.3,
    'x-fuji-raf': 1.3, 'x-dcraw': 1.3,
    # Shorter aliases used by some mime databases
    'cr2': 1.3, 'nef': 1.3, 'arw': 1.3, 'dng': 1.3,
    'orf': 1.3, 'rw2': 1.3, 'raf': 1.3,
    # Lossless formats
    'png': 1.1, 'tiff': 1.1, 'bmp': 1.1,
    # Standard lossy
    'jpeg': 1.0, 'jpg': 1.0,
    # Modern compressed
    'webp': 0.9, 'heic': 0.9, 'heif': 0.9, 'avif': 0.9,
}


def get_quality_metrics(file) -> dict:
    """
    Extract quality metrics for a file.

    Reads dimensions from the database (populated during import) to avoid
    redundant ExifTool calls on every request.

    Args:
        file: File model instance with image_width, image_height, mime_type

    Returns:
        Dictionary with quality metrics:
        - width: Image width in pixels (or None)
        - height: Image height in pixels (or None)
        - resolution_mp: Resolution in megapixels (or None)
        - file_size_bytes: File size in bytes
        - format: File format from mime_type (e.g. 'jpg', 'png')
    """
    width = getattr(file, 'image_width', None)
    height = getattr(file, 'image_height', None)

    resolution_mp = None
    if width is not None and height is not None:
        resolution_mp = round((width * height) / 1_000_000, 2)

    fmt = None
    if file.mime_type:
        mime_parts = file.mime_type.split('/')
        if len(mime_parts) == 2:
            fmt = mime_parts[1].lower()

    return {
        'width': width,
        'height': height,
        'resolution_mp': resolution_mp,
        'file_size_bytes': file.file_size_bytes,
        'format': fmt
    }


def recommend_best_duplicate(files: list[dict]) -> Optional[int]:
    """
    Recommend which file to keep from a duplicate group.

    Scoring prioritizes resolution first, then file size.
    Higher resolution indicates better quality source.
    Larger file size (at same resolution) indicates less compression.

    Args:
        files: List of file dicts with quality metrics already populated
               Each dict must have: id, resolution_mp, file_size_bytes

    Returns:
        file_id of recommended file, or None if files list is empty
    """
    if not files:
        return None

    best_file = None
    best_score = -1

    for file_dict in files:
        file_id = file_dict.get('id')
        resolution_mp = file_dict.get('resolution_mp')
        file_size_bytes = file_dict.get('file_size_bytes', 0)
        fmt = (file_dict.get('format') or '').lower()
        format_mult = FORMAT_MULTIPLIERS.get(fmt, 1.0)

        # Calculate score: resolution dominates, file size is tiebreaker,
        # format multiplier weights the combined score
        if resolution_mp is not None:
            score = (resolution_mp * 1_000_000 + file_size_bytes) * format_mult
        else:
            score = file_size_bytes * format_mult

        if score > best_score:
            best_score = score
            best_file = file_id

    return best_file


def accumulate_metadata(kept_file, discarded_files):
    """
    Merge timestamp_candidates from discarded files into the kept file.

    Deduplicates by (timestamp, source) tuple. Does not change
    detected_timestamp or final_timestamp — those are left for user review.

    Args:
        kept_file: File model instance to accumulate into
        discarded_files: List of File model instances being discarded
    """
    # Parse existing candidates from the kept file
    existing = []
    if kept_file.timestamp_candidates:
        try:
            existing = json.loads(kept_file.timestamp_candidates)
        except (json.JSONDecodeError, TypeError):
            existing = []

    # Build a set of (timestamp, source) for deduplication
    seen = set()
    for c in existing:
        ts = c.get('timestamp') or c.get('value') or ''
        src = c.get('source', '')
        seen.add((ts, src))

    added = 0
    for discarded in discarded_files:
        if not discarded.timestamp_candidates:
            continue
        try:
            candidates = json.loads(discarded.timestamp_candidates)
        except (json.JSONDecodeError, TypeError):
            continue

        for c in candidates:
            ts = c.get('timestamp') or c.get('value') or ''
            src = c.get('source', '')
            key = (ts, src)
            if key not in seen:
                seen.add(key)
                existing.append(c)
                added += 1

    if added > 0:
        kept_file.timestamp_candidates = json.dumps(existing)
        logger.info(
            f"Accumulated {added} timestamp candidates into file {kept_file.id} "
            f"from {len(discarded_files)} discarded file(s)"
        )
