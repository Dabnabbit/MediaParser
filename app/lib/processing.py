"""
Single file processing pipeline for thread pool workers.

This module implements the complete file processing pipeline that runs in
ThreadPoolExecutor workers. Functions here MUST NOT access the database directly.
All results are returned as dicts for the main thread to commit.
"""
from pathlib import Path
from typing import Optional
import json
import logging
import os

from app.lib.hashing import calculate_sha256, calculate_perceptual_hash
from app.lib.confidence import calculate_confidence
from app.lib.metadata import get_all_datetime_candidates
from app.lib.timestamp import get_datetime_from_name
from app.models import ConfidenceLevel

logger = logging.getLogger(__name__)

# Try to import python-magic, but handle gracefully if not available
try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
    logger.warning("python-magic not available - file type detection limited to extensions")


def detect_file_type_mismatch(file_path: Path | str) -> tuple[str, str, bool]:
    """
    Detect if file extension matches actual file type via magic bytes.

    Uses python-magic to inspect file contents and compare with extension.
    If python-magic is not available, falls back to extension-based detection
    (logs warning on first call).

    Args:
        file_path: Path to the file to check

    Returns:
        Tuple of (extension, detected_type, is_mismatch)
        - extension: File extension from filename (e.g., 'jpg')
        - detected_type: MIME type from magic bytes (e.g., 'image/jpeg')
        - is_mismatch: True if extension doesn't match detected type

    Example:
        >>> detect_file_type_mismatch('photo.jpg')
        ('jpg', 'image/jpeg', False)
        >>> detect_file_type_mismatch('virus.jpg')  # Actually a .exe
        ('jpg', 'application/x-executable', True)
    """
    path = Path(file_path) if isinstance(file_path, str) else file_path

    # Get extension from filename (normalize)
    extension = path.suffix.lower().lstrip('.')
    if extension == 'jpeg':
        extension = 'jpg'

    # Detect actual type via magic bytes
    if MAGIC_AVAILABLE:
        try:
            mime_type = magic.from_file(str(path), mime=True)
        except Exception as e:
            logger.warning(f"Magic detection failed for {path.name}: {e}")
            mime_type = f"unknown/{extension}"
    else:
        # Fallback: guess from extension
        mime_type = f"unknown/{extension}"

    # Normalize detected type for comparison
    detected_base = mime_type.split('/')[1] if '/' in mime_type else mime_type
    if detected_base == 'jpeg':
        detected_base = 'jpg'

    # Check for mismatch
    is_mismatch = (extension != detected_base and detected_base != extension)

    return extension, mime_type, is_mismatch


def process_single_file(
    file_path: Path | str,
    min_year: int = 2000,
    default_tz: str = 'UTC'
) -> dict:
    """
    Process a single file through the complete extraction pipeline.

    This function is designed to run in ThreadPoolExecutor workers.
    It does NOT access the database - all results are returned as a dict
    for the main thread to commit to the database.

    Pipeline steps:
    1. File validation (exists, size, type mismatch check)
    2. Calculate hashes (SHA256 always, perceptual for images)
    3. Extract timestamp candidates (EXIF metadata, filename parsing)
    4. Calculate confidence score and select best timestamp
    5. Return complete result dict

    Args:
        file_path: Path to the file to process (Path object or string)
        min_year: Minimum valid year for timestamps (filters out epoch dates)
        default_tz: IANA timezone name for dates without explicit timezone

    Returns:
        Dict with processing results:
        {
            'status': 'success' or 'error',
            'file_path': str(absolute_path),
            'file_size_bytes': int,
            'sha256': str(hex_digest),
            'perceptual_hash': str or None,
            'detected_timestamp': str(ISO format) or None,
            'timestamp_source': str,
            'confidence': str(ConfidenceLevel.value),
            'timestamp_candidates': str(JSON),
            'mime_type': str,
            'error': str or None
        }

    Thread Safety:
        This function is thread-safe. It does NOT:
        - Access the database (no SQLAlchemy session)
        - Modify shared state
        - Write to shared files

    Error Handling:
        Errors are caught and returned in the dict (status='error').
        This allows the main thread to decide how to handle failures
        (log, retry, mark job as failed, etc.)
    """
    path = Path(file_path) if isinstance(file_path, str) else file_path

    try:
        # Step 1: File validation
        if not path.exists():
            return {
                'status': 'error',
                'file_path': str(path.absolute()),
                'error': 'File does not exist'
            }

        file_size = os.path.getsize(path)

        # Check for type mismatch (log warning if detected)
        extension, mime_type, is_mismatch = detect_file_type_mismatch(path)
        if is_mismatch:
            logger.warning(
                f"File type mismatch detected: {path.name} "
                f"has extension .{extension} but detected as {mime_type}"
            )

        # Step 2: Calculate hashes
        logger.debug(f"Calculating hashes for {path.name}")
        sha256_hash = calculate_sha256(path)

        # Perceptual hash - may return None for non-images (expected behavior)
        perceptual_hash = calculate_perceptual_hash(path)
        if perceptual_hash is None:
            logger.debug(f"No perceptual hash for {path.name} (not an image or error)")

        # Step 3: Extract timestamp candidates
        timestamp_candidates = []

        # 3a: All metadata timestamps (EXIF, QuickTime, filesystem)
        metadata_candidates = get_all_datetime_candidates(path, default_tz)
        for dt, source in metadata_candidates:
            timestamp_candidates.append((dt, source))
            logger.debug(f"Metadata timestamp: {dt} from {source}")

        # 3b: Filename parsing
        filename_dt = get_datetime_from_name(path.name, default_tz)
        if filename_dt:
            # Determine if filename had time component
            import re
            from app.lib.timestamp import VALID_DATE_REGEX, VALID_TIME_REGEX
            date_match = re.search(VALID_DATE_REGEX, path.name)
            if date_match:
                time_match = re.search(VALID_TIME_REGEX, path.name[date_match.span()[1]:])
                filename_source = 'filename_datetime' if time_match else 'filename_date'
            else:
                filename_source = 'filename_date'

            timestamp_candidates.append((filename_dt, filename_source))
            logger.debug(f"Filename timestamp: {filename_dt} from {filename_source}")

        # Step 4: Calculate confidence and select best timestamp
        selected_dt, confidence_level, all_candidates = calculate_confidence(
            timestamp_candidates,
            min_year=min_year
        )

        # Serialize candidates for JSON storage
        candidates_json = json.dumps([
            {
                'timestamp': dt.isoformat(),
                'source': source
            }
            for dt, source in all_candidates
        ])

        # Determine timestamp source for selected timestamp
        if selected_dt:
            timestamp_source = next(
                (source for dt, source in timestamp_candidates if dt == selected_dt),
                'unknown'
            )
        else:
            timestamp_source = 'none'

        # Step 5: Return result dict
        return {
            'status': 'success',
            'file_path': str(path.absolute()),
            'file_size_bytes': file_size,
            'sha256': sha256_hash,
            'perceptual_hash': perceptual_hash,
            'detected_timestamp': selected_dt.isoformat() if selected_dt else None,
            'timestamp_source': timestamp_source,
            'confidence': confidence_level.value,
            'timestamp_candidates': candidates_json,
            'mime_type': mime_type,
            'error': None
        }

    except Exception as e:
        # Catch all errors and return in dict format
        # Main thread decides how to handle (log, retry, fail job, etc.)
        logger.error(f"Error processing {path}: {e}", exc_info=True)
        return {
            'status': 'error',
            'file_path': str(path.absolute()) if path else str(file_path),
            'error': str(e)
        }
