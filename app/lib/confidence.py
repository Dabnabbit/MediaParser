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

    # Check for agreement (timestamps within 30 seconds = same)
    # Increased from 1 second to handle camera clock drift and rounding
    tolerance = timedelta(seconds=30)
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


def build_timestamp_options(
    timestamp_candidates: List[Tuple[datetime, str]],
    min_year: int = 2000,
    deviant_threshold: int = 3
) -> List[dict]:
    """
    Build grouped timestamp options for frontend display.

    Groups candidates by timestamp value, calculates composite scores,
    and returns a curated list of options:
    1. Earliest date (system's pick)
    2. Highest-scored date (if different from earliest)
    3. 1-2 deviants meeting threshold (if any)

    Args:
        timestamp_candidates: List of (datetime, source) tuples
        min_year: Minimum valid year for timestamps
        deviant_threshold: Minimum score for deviant options to be included

    Returns:
        List of option dicts:
        [
            {
                'timestamp': ISO string,
                'confidence': 'high'|'medium'|'low',
                'score': int (sum of weights),
                'source_count': int,
                'is_earliest': bool,
                'is_highest_scored': bool,
                'selected': bool (true for the earliest)
            },
            ...
        ]
    """
    if not timestamp_candidates:
        return []

    # Filter by minimum year
    valid_candidates = [
        (dt, source) for dt, source in timestamp_candidates
        if dt.year >= min_year
    ]

    if not valid_candidates:
        return []

    # Group by timestamp (30-second tolerance for clock drift)
    tolerance = timedelta(seconds=30)
    groups = []  # List of {'timestamp': dt, 'sources': [(dt, source), ...]}

    for dt, source in valid_candidates:
        # Find existing group within tolerance
        found_group = None
        for group in groups:
            if abs(group['timestamp'] - dt) <= tolerance:
                found_group = group
                break

        if found_group:
            found_group['sources'].append((dt, source))
        else:
            groups.append({
                'timestamp': dt,
                'sources': [(dt, source)]
            })

    # Calculate score and confidence for each group
    for group in groups:
        sources = group['sources']
        # Sum weights for composite score
        score = sum(SOURCE_WEIGHTS.get(source, 0) for _, source in sources)
        group['score'] = score
        group['source_count'] = len(sources)

        # Determine confidence level for this group
        max_weight = max(SOURCE_WEIGHTS.get(source, 0) for _, source in sources)
        if max_weight >= 8 and len(sources) > 1:
            group['confidence'] = ConfidenceLevel.HIGH.value
        elif max_weight >= 5 or len(sources) > 1:
            group['confidence'] = ConfidenceLevel.MEDIUM.value
        else:
            group['confidence'] = ConfidenceLevel.LOW.value

    # Sort to find earliest and highest-scored
    by_time = sorted(groups, key=lambda g: g['timestamp'])
    by_score = sorted(groups, key=lambda g: g['score'], reverse=True)

    earliest = by_time[0] if by_time else None
    highest_scored = by_score[0] if by_score else None

    # Build result list
    result = []
    included_timestamps = set()

    # Always include earliest (this is the selected one)
    if earliest:
        result.append({
            'timestamp': earliest['timestamp'].isoformat(),
            'confidence': earliest['confidence'],
            'score': earliest['score'],
            'source_count': earliest['source_count'],
            'is_earliest': True,
            'is_highest_scored': (earliest == highest_scored),
            'selected': True
        })
        included_timestamps.add(earliest['timestamp'])

    # Include highest-scored if different from earliest
    if highest_scored and highest_scored['timestamp'] not in included_timestamps:
        result.append({
            'timestamp': highest_scored['timestamp'].isoformat(),
            'confidence': highest_scored['confidence'],
            'score': highest_scored['score'],
            'source_count': highest_scored['source_count'],
            'is_earliest': False,
            'is_highest_scored': True,
            'selected': False
        })
        included_timestamps.add(highest_scored['timestamp'])

    # Include up to 2 deviants meeting threshold
    deviants_added = 0
    for group in by_score:
        if deviants_added >= 2:
            break
        if group['timestamp'] in included_timestamps:
            continue
        if group['score'] >= deviant_threshold:
            result.append({
                'timestamp': group['timestamp'].isoformat(),
                'confidence': group['confidence'],
                'score': group['score'],
                'source_count': group['source_count'],
                'is_earliest': False,
                'is_highest_scored': False,
                'selected': False
            })
            included_timestamps.add(group['timestamp'])
            deviants_added += 1

    return result
