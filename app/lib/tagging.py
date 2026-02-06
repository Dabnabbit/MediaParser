"""Tag auto-generation from filenames and folder structure.

Extracts tags from:
- {tag1,tag2} syntax in filenames
- Folder hierarchy relative to import root

Tags are normalized to lowercase and deduplicated.
"""
import re
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def extract_filename_tags(filename: str) -> list[str]:
    """
    Extract tags from {tag1,tag2} syntax in filename.

    Args:
        filename: Original filename (may contain {tags})

    Returns:
        List of normalized tag names (lowercase, stripped)

    Examples:
        >>> extract_filename_tags("{Korea,Seoul}20240115.jpg")
        ['korea', 'seoul']
        >>> extract_filename_tags("vacation_{family,beach}.jpg")
        ['family', 'beach']
        >>> extract_filename_tags("{korea}photo.jpg")
        ['korea']
        >>> extract_filename_tags("{}photo.jpg")
        []
        >>> extract_filename_tags("{ korea , seoul }.jpg")
        ['korea', 'seoul']
    """
    tags = []

    # Find all content between braces
    pattern = r'\{([^}]+)\}'
    matches = re.findall(pattern, filename)

    for match in matches:
        # Split by comma and normalize each tag
        for tag in match.split(','):
            tag_stripped = tag.strip().lower()
            if tag_stripped:  # Skip empty strings
                tags.append(tag_stripped)

    return tags


def extract_folder_tags(file_path: str, import_root: str) -> list[str]:
    """
    Extract tags from folder structure relative to import root.

    Each subdirectory level between import_root and the file becomes a tag.
    Filters out generic/unhelpful folder names.

    Args:
        file_path: Absolute path to the file
        import_root: Absolute path to the import root directory

    Returns:
        List of normalized tag names (lowercase)

    Examples:
        >>> extract_folder_tags("/photos/Korea/Seoul/photo.jpg", "/photos")
        ['korea', 'seoul']
        >>> extract_folder_tags("/photos/photo.jpg", "/photos")
        []
        >>> extract_folder_tags("/photos/Vacation/2024/photo.jpg", "/photos")
        ['vacation']
    """
    tags = []

    try:
        file_path_obj = Path(file_path)
        import_root_obj = Path(import_root)

        # Ensure paths are absolute for reliable comparison
        if not file_path_obj.is_absolute() or not import_root_obj.is_absolute():
            logger.warning(f"Non-absolute path provided: file={file_path}, root={import_root}")
            return []

        # Check if file is within import root
        try:
            relative_path = file_path_obj.relative_to(import_root_obj)
        except ValueError:
            # File is not within import root
            logger.debug(f"File {file_path} not within import root {import_root}")
            return []

        # Extract parent directories (exclude the filename itself)
        parts = relative_path.parts[:-1]  # Exclude the filename

        # Filter out generic/unhelpful names
        generic_names = {
            'camera', 'dcim', 'thumbnails', 'thumb', 'thumbs',
            'misc', 'temp', 'tmp', 'cache', 'backup',
            '100andro', '100apple'  # Common camera folder names
        }

        for part in parts:
            part_lower = part.lower()

            # Skip single-letter directories
            if len(part) == 1:
                continue

            # Skip numeric-only directories (years handled separately)
            if part.isdigit():
                continue

            # Skip generic names
            if part_lower in generic_names:
                continue

            tags.append(part_lower)

        return tags

    except Exception as e:
        logger.error(f"Error extracting folder tags from {file_path}: {e}")
        return []


def auto_generate_tags(file_obj, import_root: Optional[str] = None) -> list[str]:
    """
    Combine filename and folder tag extraction for a file.

    Args:
        file_obj: File model instance (has original_filename, original_path)
        import_root: Optional import root path for folder tag derivation

    Returns:
        Deduplicated list of tag names (order preserved, lowercase)
    """
    tags = []
    seen = set()

    # Extract from filename
    filename_tags = extract_filename_tags(file_obj.original_filename)
    for tag in filename_tags:
        if tag not in seen:
            tags.append(tag)
            seen.add(tag)

    # Extract from folder structure if import root provided
    if import_root:
        folder_tags = extract_folder_tags(file_obj.original_path, import_root)
        for tag in folder_tags:
            if tag not in seen:
                tags.append(tag)
                seen.add(tag)

    return tags


def apply_auto_tags(db, files: list, import_root: Optional[str] = None) -> dict:
    """
    Apply auto-generated tags to a list of files.

    For each file:
    - Extracts tags from filename and folder structure
    - Creates Tag records if needed
    - Associates tags with files
    - Updates tag usage counts

    Args:
        db: Flask-SQLAlchemy database session
        files: List of File model instances
        import_root: Optional import root path for folder tag derivation

    Returns:
        Summary dict with:
        - files_tagged: Number of files that got new tags
        - tags_created: Number of new Tag records created
        - tags_applied: Total number of tag-file associations created
    """
    from app.models import Tag

    stats = {
        'files_tagged': 0,
        'tags_created': 0,
        'tags_applied': 0
    }

    # Track tags created this session
    created_tags = set()

    for i, file in enumerate(files):
        # Generate tags for this file
        tag_names = auto_generate_tags(file, import_root)

        if not tag_names:
            continue

        file_had_changes = False

        # Process each tag
        for tag_name in tag_names:
            # Get or create Tag record
            tag = Tag.query.filter_by(name=tag_name).first()
            if tag is None:
                tag = Tag(name=tag_name, usage_count=0)
                db.session.add(tag)
                db.session.flush()  # Get the ID
                created_tags.add(tag_name)
                stats['tags_created'] += 1
                logger.debug(f"Created tag: {tag_name}")

            # Associate with file if not already present
            if tag not in file.tags:
                file.tags.append(tag)
                tag.usage_count += 1
                stats['tags_applied'] += 1
                file_had_changes = True

        if file_had_changes:
            stats['files_tagged'] += 1

        # Batch commit every 50 files for memory efficiency
        if (i + 1) % 50 == 0:
            db.session.flush()
            logger.debug(f"Processed {i + 1}/{len(files)} files")

    # Final commit
    db.session.commit()

    logger.info(
        f"Auto-tagging complete: {stats['files_tagged']} files tagged, "
        f"{stats['tags_created']} tags created, "
        f"{stats['tags_applied']} associations made"
    )

    return stats
