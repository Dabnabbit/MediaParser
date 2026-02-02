"""
EXIF and file metadata extraction.

Wraps PyExifTool for consistent metadata extraction across media types.
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any
import exiftool

from app.lib.timestamp import convert_str_to_datetime


# Tags to check for datetime, in priority order
DATETIME_TAGS = [
    'EXIF:DateTimeOriginal',     # Best: original capture time
    'EXIF:CreateDate',           # Second best: when digitized
    'QuickTime:CreateDate',      # Video files
    'EXIF:ModifyDate',           # When last edited
    'File:FileModifyDate',       # Filesystem (least reliable)
    'File:FileCreateDate',       # Filesystem (least reliable)
]

# Tags that indicate file type
FILETYPE_TAGS = [
    'File:FileType',
    'File:FileTypeExtension',
    'File:MIMEType',
]


def extract_metadata(file_path: Path | str) -> dict[str, Any]:
    """
    Extract all metadata from a file using ExifTool.

    Args:
        file_path: Path to the file

    Returns:
        Dictionary of metadata tags and values
    """
    path_str = str(file_path) if isinstance(file_path, Path) else file_path

    with exiftool.ExifToolHelper() as et:
        metadata_list = et.get_metadata(path_str)
        if metadata_list:
            return metadata_list[0]
    return {}


def get_best_datetime(
    file_path: Path | str,
    default_tz: str = 'UTC'
) -> tuple[Optional[datetime], str, str]:
    """
    Get the best available datetime from file metadata.

    Checks EXIF tags in priority order (DateTimeOriginal first),
    then falls back to filesystem dates.

    Args:
        file_path: Path to the file
        default_tz: Timezone to assume for dates without timezone info

    Returns:
        Tuple of (datetime, source_tag, confidence)
        confidence is 'high', 'medium', or 'low'
    """
    metadata = extract_metadata(file_path)

    found_dates: list[tuple[datetime, str]] = []

    for tag in DATETIME_TAGS:
        if tag in metadata:
            value = metadata[tag]
            if isinstance(value, str):
                dt = convert_str_to_datetime(value, default_tz)
                if dt:
                    found_dates.append((dt, tag))

    if not found_dates:
        return None, 'none', 'none'

    # Priority: EXIF:DateTimeOriginal > other EXIF > filesystem
    for tag in DATETIME_TAGS:
        for dt, source in found_dates:
            if source == tag:
                # Determine confidence
                if source in ('EXIF:DateTimeOriginal', 'EXIF:CreateDate'):
                    confidence = 'high'
                elif source.startswith('QuickTime') or source == 'EXIF:ModifyDate':
                    confidence = 'medium'
                else:
                    confidence = 'low'
                return dt, source, confidence

    # Shouldn't reach here, but just in case
    dt, source = found_dates[0]
    return dt, source, 'low'


def get_file_type(file_path: Path | str) -> Optional[str]:
    """
    Get the actual file type from metadata (not just extension).

    Returns normalized extension like 'jpg', 'png', 'mp4'.
    """
    metadata = extract_metadata(file_path)

    for tag in FILETYPE_TAGS:
        if tag in metadata:
            value = str(metadata[tag]).lower()
            # Normalize common variations
            if '/' in value:
                value = value.split('/')[1]
            if value == 'jpeg':
                value = 'jpg'
            return value

    return None


def get_image_dimensions(file_path: Path | str) -> tuple[Optional[int], Optional[int]]:
    """
    Get image width and height from metadata.

    Returns:
        Tuple of (width, height) or (None, None) if not available
    """
    metadata = extract_metadata(file_path)

    width = metadata.get('EXIF:ImageWidth') or metadata.get('File:ImageWidth')
    height = metadata.get('EXIF:ImageHeight') or metadata.get('File:ImageHeight')

    return (
        int(width) if width else None,
        int(height) if height else None
    )
