"""
Confidence scoring for timestamp detection.

Calculates confidence levels based on timestamp source reliability and
inter-source agreement. Higher confidence indicates more reliable timestamps.
"""
from datetime import datetime, timedelta
from typing import Optional, List, Tuple
import logging

from app.models import ConfidenceLevel

logger = logging.getLogger(__name__)


# Weight values for timestamp sources (higher = more reliable)
# Based on Phase 2 research and user decisions
SOURCE_WEIGHTS = {
    'EXIF:DateTimeOriginal': 10,  # Original capture time (most reliable)
    'EXIF:CreateDate': 8,           # When digitized
    'QuickTime:CreateDate': 7,      # Video creation date
    'EXIF:ModifyDate': 5,           # Last modification
    'filename_datetime': 3,         # Filename with date+time
    'filename_date': 2,             # Filename with date only
    'File:FileModifyDate': 1,       # Filesystem timestamp (least reliable)
}


def calculate_confidence(
    timestamp_candidates: List[Tuple[datetime, str]],
    min_year: int = 2000
) -> Tuple[Optional[datetime], ConfidenceLevel, List[Tuple[datetime, str]]]:
    """
    Calculate confidence score for timestamp detection.

    Algorithm:
    1. Filter candidates by minimum year (sanity check for epoch timestamps)
    2. Select earliest valid timestamp (user decision from CONTEXT.md)
    3. Check for agreement among sources (within 1 second tolerance)
    4. Score based on source weight and agreement count:
       - HIGH: EXIF source (weight >= 8) AND multiple sources agree
       - MEDIUM: Reliable source (weight >= 5) OR multiple sources agree
       - LOW: Filename only or low-weight source alone
       - NONE: No valid candidates after filtering

    Args:
        timestamp_candidates: List of (datetime, source) tuples
        min_year: Minimum valid year for timestamps (default 2000)
                 Filters out 1970 epoch dates and other invalid timestamps

    Returns:
        Tuple of:
        - selected_datetime: The chosen timestamp (earliest valid), or None
        - confidence_level: ConfidenceLevel enum value
        - all_candidates: All original candidates (for storage/review UI)

    Example:
        >>> candidates = [
        ...     (datetime(2024, 1, 15, 12, 0, 0), 'EXIF:DateTimeOriginal'),
        ...     (datetime(2024, 1, 15, 12, 0, 1), 'filename_datetime')
        ... ]
        >>> dt, conf, all_cand = calculate_confidence(candidates)
        >>> conf
        <ConfidenceLevel.HIGH: 'high'>
    """
    if not timestamp_candidates:
        logger.debug("No timestamp candidates provided")
        return None, ConfidenceLevel.NONE, []

    # Filter by minimum year (sanity check for epoch dates, corrupted metadata)
    valid_candidates = [
        (dt, source) for dt, source in timestamp_candidates
        if dt.year >= min_year
    ]

    if not valid_candidates:
        logger.debug(f"All timestamps before min_year {min_year}")
        return None, ConfidenceLevel.NONE, timestamp_candidates

    # Sort by timestamp (earliest first - user decision)
    valid_candidates.sort(key=lambda x: x[0])

    # Select earliest timestamp
    selected_dt, selected_source = valid_candidates[0]
    selected_weight = SOURCE_WEIGHTS.get(selected_source, 0)

    # Check for agreement (timestamps within 1 second = same)
    tolerance = timedelta(seconds=1)
    agreements = [
        (dt, source) for dt, source in valid_candidates
        if abs(dt - selected_dt) <= tolerance
    ]

    logger.debug(
        f"Selected: {selected_dt} from {selected_source} "
        f"(weight={selected_weight}, agreements={len(agreements)})"
    )

    # Calculate confidence level
    if selected_weight >= 8 and len(agreements) > 1:
        # HIGH: EXIF DateTimeOriginal/CreateDate + agreement from other sources
        confidence = ConfidenceLevel.HIGH
    elif selected_weight >= 5 or len(agreements) > 1:
        # MEDIUM: Reliable source (ModifyDate+) OR multiple sources agree
        confidence = ConfidenceLevel.MEDIUM
    else:
        # LOW: Filename only, low-weight source, or single source with no agreement
        confidence = ConfidenceLevel.LOW

    logger.info(
        f"Confidence {confidence.value} for {selected_dt} "
        f"({len(valid_candidates)} candidates, {len(agreements)} agree)"
    )

    return selected_dt, confidence, timestamp_candidates
