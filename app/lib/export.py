"""Export library for copying files to organized output directories.

Handles:
- Timestamp-based filename generation (YYYYMMDD_HHMMSS.ext)
- Year-based folder organization
- Unknown subfolder for files without timestamps
- Collision resolution with counter suffix (_001, _002, etc.)
- File copy with metadata preservation
"""
from pathlib import Path
from typing import Union
import shutil
import logging
from werkzeug.utils import secure_filename

logger = logging.getLogger(__name__)


def generate_output_filename(file_obj, output_base: Path) -> Path:
    """
    Generate output path for a file based on timestamp.

    Args:
        file_obj: File model object with timestamp and filename info
        output_base: Base output directory (Path object)

    Returns:
        Path: Full output path (directory + filename)

    Logic:
        - If file has final_timestamp or detected_timestamp:
          - Format as YYYYMMDD_HHMMSS.ext
          - Place in year subfolder: output_base/YYYY/YYYYMMDD_HHMMSS.ext
        - If no timestamp:
          - Place in unknown subfolder with sanitized original filename
          - Path: output_base/unknown/original_filename.ext
    """
    # Determine timestamp: final_timestamp takes precedence
    timestamp = file_obj.final_timestamp or file_obj.detected_timestamp

    if timestamp:
        # Format timestamp as YYYYMMDD_HHMMSS
        year = timestamp.year
        formatted_name = timestamp.strftime('%Y%m%d_%H%M%S')

        # Get extension from original filename (lowercase)
        original_ext = Path(file_obj.original_filename).suffix.lower()

        # Build path: output_base/year/YYYYMMDD_HHMMSS.ext
        year_folder = output_base / str(year)
        output_path = year_folder / f"{formatted_name}{original_ext}"

        return output_path
    else:
        # No timestamp - use unknown subfolder with original filename
        unknown_folder = output_base / 'unknown'

        # Sanitize original filename to prevent path traversal
        safe_filename = secure_filename(file_obj.original_filename)

        output_path = unknown_folder / safe_filename

        return output_path


def resolve_collision(output_path: Path) -> Path:
    """
    Resolve filename collision by adding counter suffix.

    Args:
        output_path: Desired output path

    Returns:
        Path: Unique output path (may be same as input if no collision)

    Logic:
        - If output_path doesn't exist, return as-is
        - Otherwise, add counter: YYYYMMDD_HHMMSS_001.ext, _002, etc.
        - Max 999 collisions (raises ValueError if exceeded)
    """
    if not output_path.exists():
        return output_path

    # Extract parts for counter suffix
    stem = output_path.stem  # Filename without extension
    suffix = output_path.suffix  # Extension with dot
    parent = output_path.parent

    # Try counter from 001 to 999
    for counter in range(1, 1000):
        candidate = parent / f"{stem}_{counter:03d}{suffix}"
        if not candidate.exists():
            return candidate

    # Max collisions exceeded - this indicates a data issue
    raise ValueError(
        f"Collision resolution failed: more than 999 files with same timestamp "
        f"at {output_path}"
    )


def copy_file_to_output(source_path: Union[str, Path], output_path: Path) -> Path:
    """
    Copy file to output location with collision resolution.

    Args:
        source_path: Source file path (str or Path)
        output_path: Desired output path (before collision resolution)

    Returns:
        Path: Final output path (after collision resolution)

    Raises:
        FileNotFoundError: If source file doesn't exist
        ValueError: If collision resolution fails or file verification fails

    Logic:
        1. Create parent directory if needed
        2. Resolve collision (add counter suffix if needed)
        3. Copy file with shutil.copy2 (preserves metadata)
        4. Verify copy (file exists and size matches)
        5. Return final path
    """
    source_path = Path(source_path)

    # Verify source exists
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    # Create parent directory
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Resolve collision
    final_path = resolve_collision(output_path)

    # Copy file with metadata preservation
    shutil.copy2(source_path, final_path)

    # Verify copy
    if not final_path.exists():
        raise ValueError(f"Copy verification failed: output file not created at {final_path}")

    source_size = source_path.stat().st_size
    output_size = final_path.stat().st_size

    if source_size != output_size:
        raise ValueError(
            f"Copy verification failed: size mismatch (source: {source_size}, "
            f"output: {output_size}) for {final_path}"
        )

    logger.info(f"Copied file to {final_path}")

    return final_path
