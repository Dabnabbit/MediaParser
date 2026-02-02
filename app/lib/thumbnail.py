"""Thumbnail generation utility for MediaParser.

Generates thumbnails with EXIF orientation correction using Pillow.
"""
from pathlib import Path
from typing import Optional, Tuple
import logging

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# Default thumbnail sizes
SIZES = {
    'compact': (100, 100),
    'medium': (150, 150),
    'large': (200, 200),
}


def generate_thumbnail(
    source_path: Path | str,
    thumb_dir: Path | str,
    size: str | Tuple[int, int] = 'medium',
    file_id: Optional[int] = None
) -> Optional[Path]:
    """Generate thumbnail with EXIF orientation correction.

    Args:
        source_path: Path to source image file
        thumb_dir: Directory to save thumbnails
        size: Size preset ('compact', 'medium', 'large') or (width, height) tuple
        file_id: Optional file ID to use in thumbnail filename

    Returns:
        Path to generated thumbnail, or None on error
    """
    source_path = Path(source_path)
    thumb_dir = Path(thumb_dir)

    # Resolve size
    if isinstance(size, str):
        dimensions = SIZES.get(size, SIZES['medium'])
    else:
        dimensions = size

    try:
        # Ensure thumbnail directory exists
        thumb_dir.mkdir(parents=True, exist_ok=True)

        # Generate thumbnail filename
        if file_id:
            thumb_filename = f"{file_id}_thumb.jpg"
        else:
            thumb_filename = f"{source_path.stem}_thumb.jpg"
        thumb_path = thumb_dir / thumb_filename

        with Image.open(source_path) as img:
            # CRITICAL: Apply EXIF orientation before any processing
            img = ImageOps.exif_transpose(img)

            # Convert to RGB if needed (handles RGBA, P mode images)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')

            # Create thumbnail (maintains aspect ratio)
            img.thumbnail(dimensions, Image.Resampling.LANCZOS)

            # Save with optimization
            img.save(thumb_path, 'JPEG', quality=85, optimize=True)

        return thumb_path

    except Exception as e:
        logger.error(f"Thumbnail generation failed for {source_path}: {e}")
        return None


def get_thumbnail_path(thumb_dir: Path | str, file_id: int) -> Optional[Path]:
    """Get path to existing thumbnail for a file.

    Args:
        thumb_dir: Thumbnail directory
        file_id: File database ID

    Returns:
        Path if thumbnail exists, None otherwise
    """
    thumb_path = Path(thumb_dir) / f"{file_id}_thumb.jpg"
    return thumb_path if thumb_path.exists() else None
