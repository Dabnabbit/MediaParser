"""
File hashing utilities for duplicate detection.

Provides SHA256 hashing for exact duplicate detection and perceptual hashing
for near-duplicate detection (images only).
"""
from pathlib import Path
from typing import Optional
import hashlib
import logging

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


def calculate_perceptual_hash(file_path: Path | str) -> Optional[str]:
    """
    Calculate perceptual hash for near-duplicate detection.

    Uses imagehash.dhash() algorithm (fast, good for duplicates).
    Only works on image files - returns None for non-images or corrupt files.

    Args:
        file_path: Path to the image file (Path object or string)

    Returns:
        Hex string representation of hash, or None if not an image or error

    Note:
        This is expected to return None for video files, PDFs, etc.
        Phase 6 can implement video thumbnail hashing if needed.
    """
    if not IMAGEHASH_AVAILABLE:
        return None

    path = Path(file_path) if isinstance(file_path, str) else file_path

    try:
        with Image.open(path) as img:
            # dHash is faster than pHash and good for duplicate detection
            phash = imagehash.dhash(img)
            return str(phash)
    except Exception as e:
        # Expected behavior for non-images (videos, documents, etc.)
        logger.debug(f"Could not calculate perceptual hash for {path.name}: {e}")
        return None
