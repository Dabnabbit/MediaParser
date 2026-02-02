"""
Timestamp extraction from filenames and strings.

Extracted from PhotoTimeFixer.py with the following improvements:
- Configurable timezone via parameter (was hardcoded -4)
- Uses zoneinfo.ZoneInfo instead of manual offset calculation
- Type hints for all functions
- Returns timezone-aware datetimes (UTC internally)
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional
import re

# Regex patterns from PhotoTimeFixer.py
VALID_DATE_REGEX = r'(19|20)\d{2}[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2][0-9]|3[0-1])'
VALID_TIME_REGEX = r'([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]'
VALID_TIMEZONE_REGEX = r'[-+]([01][0-9]|2[0-3]):?[0-5][0-9]'
VALID_DATE_YEAR_MIN = 2000
VALID_DATE_YEAR_MAX = 2100


def get_datetime_from_name(
    filename: str,
    default_tz: str = 'UTC'
) -> Optional[datetime]:
    """
    Extract datetime from filename.

    Looks for patterns like:
    - 20240115_120000.jpg
    - 2024-01-15_12-00-00.jpg
    - IMG_20240115.jpg

    Args:
        filename: The filename (not full path) to parse
        default_tz: IANA timezone name for dates without explicit timezone
                   (e.g., 'America/New_York', 'UTC')

    Returns:
        Timezone-aware datetime in UTC, or None if no valid date found
    """
    date_check = re.search(VALID_DATE_REGEX, filename)
    if date_check is None:
        return None

    found_date = date_check.group(0)
    found_time = '235900'  # Default to end of day if no time found

    # Look for time after the date
    time_check = re.search(VALID_TIME_REGEX, filename[date_check.span()[1]:])
    if time_check:
        found_time = time_check.group(0)

    return convert_str_to_datetime(found_date + ' ' + found_time, default_tz)


def convert_str_to_datetime(
    input_string: str,
    default_tz: str = 'UTC'
) -> Optional[datetime]:
    """
    Parse datetime string with timezone handling.

    Handles formats like:
    - "2024:01:15 12:00:00" (EXIF format)
    - "20240115 120000"
    - "2024-01-15T12:00:00-05:00"
    - "20240115_120000"

    Args:
        input_string: String containing date/time (and optionally timezone)
        default_tz: IANA timezone name to use if string has no timezone

    Returns:
        Timezone-aware datetime converted to UTC, or None if parsing fails
    """
    if not isinstance(input_string, str):
        return None

    # First pass: normalize separators except spaces (for date/time separator)
    stripped = input_string.replace(':', '').replace('-', '').replace('.', '').replace('_', '')

    # Find date portion
    datetime_check = re.search(VALID_DATE_REGEX.replace('[-_.]?', ''), stripped)
    if not datetime_check:
        return None

    datetime_string = stripped[datetime_check.span()[0]:]

    # Parse timezone from string if present, otherwise use default
    tz_offset = None
    tz_match = re.search(VALID_TIMEZONE_REGEX.replace(':?', ''), input_string)
    if tz_match:
        # Has explicit timezone offset in string
        tz_str = tz_match.group(0)
        sign = -1 if tz_str[0] == '-' else 1
        hours = int(tz_str[1:3]) * sign
        minutes = int(tz_str[3:5]) * sign if len(tz_str) >= 5 else 0
        tz_offset = timezone(timedelta(hours=hours, minutes=minutes))

    # Further normalize: remove remaining separators and ensure space at position 8
    stripped = datetime_string.replace('-', '').replace('.', '').replace('_', '')

    # Extract year for validation
    year = int(stripped[:4])
    if year < VALID_DATE_YEAR_MIN or year > VALID_DATE_YEAR_MAX:
        return None

    # Ensure we have proper spacing between date and time
    if len(stripped) < 9:
        stripped += ' 23'  # No time, default to 23:XX:XX
    elif stripped[8:9] != ' ':
        stripped = stripped[:8] + ' ' + stripped[8:]  # Insert space between date and time

    # Pad time if needed
    while len(stripped) < 15:
        stripped += '0'

    # Now extract all components with space-aware indexing
    month = int(stripped[4:6])
    day = int(stripped[6:8])
    hour = int(stripped[9:11])  # After the space at position 8
    minute = int(stripped[11:13])
    second = int(stripped[13:15])

    # Determine timezone
    if tz_offset:
        tz = tz_offset
    else:
        tz = ZoneInfo(default_tz)

    try:
        dt = datetime(year, month, day, hour, minute, second, tzinfo=tz)
        # Convert to UTC for storage
        return dt.astimezone(timezone.utc)
    except (ValueError, OverflowError):
        return None


def extract_datetime_from_filename_sources(
    filename: str,
    default_tz: str = 'UTC'
) -> tuple[Optional[datetime], str]:
    """
    Extract datetime and report source.

    Returns:
        Tuple of (datetime or None, source string)
        source is one of: 'filename_datetime', 'filename_date', 'none'
    """
    dt = get_datetime_from_name(filename, default_tz)
    if dt is None:
        return None, 'none'

    # Check if we found time or just date
    date_check = re.search(VALID_DATE_REGEX, filename)
    if date_check:
        time_check = re.search(VALID_TIME_REGEX, filename[date_check.span()[1]:])
        if time_check:
            return dt, 'filename_datetime'
    return dt, 'filename_date'
