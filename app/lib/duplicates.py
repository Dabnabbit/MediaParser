"""
Duplicate file quality metrics and recommendation logic.

Provides functions for:
- Extracting quality metrics (resolution, file size, format)
- Recommending which duplicate to keep based on quality
"""
from pathlib import Path
from typing import Optional

from app.lib.metadata import get_image_dimensions


def get_quality_metrics(file) -> dict:
    """
    Extract quality metrics for a file.

    Args:
        file: File model instance with storage_path and mime_type

    Returns:
        Dictionary with quality metrics:
        - width: Image width in pixels (or None)
        - height: Image height in pixels (or None)
        - resolution_mp: Resolution in megapixels (or None)
        - file_size_bytes: File size in bytes
        - format: File format from mime_type (e.g. 'jpg', 'png')
    """
    metrics = {
        'width': None,
        'height': None,
        'resolution_mp': None,
        'file_size_bytes': file.file_size_bytes,
        'format': None
    }

    # Extract format from mime_type (e.g. 'image/jpeg' -> 'jpeg')
    if file.mime_type:
        mime_parts = file.mime_type.split('/')
        if len(mime_parts) == 2:
            metrics['format'] = mime_parts[1].lower()

    # Get image dimensions if available
    if file.storage_path:
        width, height = get_image_dimensions(file.storage_path)
        metrics['width'] = width
        metrics['height'] = height

        # Calculate resolution in megapixels
        if width is not None and height is not None:
            metrics['resolution_mp'] = round((width * height) / 1_000_000, 2)

    return metrics


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

        # Calculate score: resolution dominates, file size is tiebreaker
        if resolution_mp is not None:
            # Resolution is primary factor (in megapixels)
            # File size is secondary (normalized to avoid overflow)
            score = resolution_mp * 1_000_000 + file_size_bytes
        else:
            # No resolution available, fall back to file size only
            score = file_size_bytes

        if score > best_score:
            best_score = score
            best_file = file_id

    return best_file
