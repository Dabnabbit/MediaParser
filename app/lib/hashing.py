"""
File hashing utilities for duplicate detection.

Provides SHA256 hashing for exact duplicate detection and perceptual hashing
for near-duplicate detection (images and video).
"""
from pathlib import Path
from typing import Optional
import hashlib
import logging
import tempfile

logger = logging.getLogger(__name__)

try:
    from PIL import Image
    import imagehash
    IMAGEHASH_AVAILABLE = True
except ImportError:
    IMAGEHASH_AVAILABLE = False
    logger.warning("imagehash not available - perceptual hashing disabled")


def calculate_sha256(file_path: Path | str, chunk_size: int = 65536) -> str:
    """
    Calculate SHA256 hash of file using chunked reading.

    Reads file in chunks to avoid memory issues with large video files.
    Uses hashlib.sha256() with HACL*-backed implementation.

    Args:
        file_path: Path to the file (Path object or string)
        chunk_size: Size of chunks to read (default 64KB)

    Returns:
        Hex digest string (64 characters)

    Raises:
        IOError: If file cannot be read
    """
    path = Path(file_path) if isinstance(file_path, str) else file_path

    sha256 = hashlib.sha256()

    with open(path, 'rb') as f:
        while chunk := f.read(chunk_size):
            sha256.update(chunk)

    return sha256.hexdigest()


VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv'}


def calculate_perceptual_hash(file_path: Path | str) -> Optional[str]:
    """
    Calculate perceptual hash for near-duplicate detection.

    Uses imagehash.phash() (DCT-based) for better accuracy than dHash.
    Works on image files directly and video files via ffmpeg frame extraction.

    Args:
        file_path: Path to the image or video file (Path object or string)

    Returns:
        Hex string representation of hash, or None if unsupported format or error
    """
    if not IMAGEHASH_AVAILABLE:
        return None

    path = Path(file_path) if isinstance(file_path, str) else file_path

    is_video = path.suffix.lower() in VIDEO_EXTENSIONS
    temp_frame = None

    try:
        if is_video:
            from app.lib.thumbnail import extract_video_frame
            temp_frame = Path(tempfile.mktemp(suffix='.jpg'))
            if not extract_video_frame(path, temp_frame):
                return None
            img_source = temp_frame
        else:
            img_source = path

        with Image.open(img_source) as img:
            phash = imagehash.phash(img)
            return str(phash)
    except Exception as e:
        logger.debug(f"Could not calculate perceptual hash for {path.name}: {e}")
        return None
    finally:
        if temp_frame and temp_frame.exists():
            temp_frame.unlink()
