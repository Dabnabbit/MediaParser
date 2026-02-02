"""
Library modules for MediaParser.

Extracted and refactored logic from PhotoTimeFixer.py for reusability.
"""
from app.lib.timestamp import get_datetime_from_name, convert_str_to_datetime
from app.lib.metadata import extract_metadata, get_best_datetime, get_file_type, get_image_dimensions
from app.lib.hashing import calculate_sha256, calculate_perceptual_hash
from app.lib.processing import process_single_file, detect_file_type_mismatch
from app.lib.confidence import calculate_confidence, SOURCE_WEIGHTS

__all__ = [
    # Timestamp extraction
    'get_datetime_from_name',
    'convert_str_to_datetime',
    # Metadata extraction
    'extract_metadata',
    'get_best_datetime',
    'get_file_type',
    'get_image_dimensions',
    # Hashing
    'calculate_sha256',
    'calculate_perceptual_hash',
    # Processing pipeline
    'process_single_file',
    'detect_file_type_mismatch',
    # Confidence scoring
    'calculate_confidence',
    'SOURCE_WEIGHTS',
]
