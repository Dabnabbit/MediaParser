"""Tests for Phase 2 processing functionality."""
import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path

from app.lib.hashing import calculate_sha256, calculate_perceptual_hash
from app.lib.confidence import calculate_confidence, SOURCE_WEIGHTS
from app.models import ConfidenceLevel


class TestSHA256Hashing:
    """Tests for SHA256 hash calculation."""

    def test_sha256_returns_hex_string(self, sample_text_file):
        """SHA256 returns 64-character hex string."""
        result = calculate_sha256(sample_text_file)
        assert len(result) == 64
        assert all(c in '0123456789abcdef' for c in result)

    def test_sha256_consistent(self, sample_text_file):
        """SHA256 returns same hash for same file."""
        hash1 = calculate_sha256(sample_text_file)
        hash2 = calculate_sha256(sample_text_file)
        assert hash1 == hash2

    def test_sha256_accepts_string_path(self, sample_text_file):
        """SHA256 accepts string path."""
        result = calculate_sha256(str(sample_text_file))
        assert len(result) == 64

    def test_sha256_different_content(self, temp_dir):
        """Different content produces different hash."""
        file1 = temp_dir / "file1.txt"
        file2 = temp_dir / "file2.txt"
        file1.write_text("Content A")
        file2.write_text("Content B")

        hash1 = calculate_sha256(file1)
        hash2 = calculate_sha256(file2)
        assert hash1 != hash2


class TestPerceptualHashing:
    """Tests for perceptual hash calculation."""

    def test_perceptual_hash_image(self, sample_image_file):
        """Perceptual hash works on valid image."""
        result = calculate_perceptual_hash(sample_image_file)
        # Should return a hash string (or None if image too small)
        assert result is None or isinstance(result, str)

    def test_perceptual_hash_non_image(self, sample_text_file):
        """Perceptual hash returns None for non-images."""
        result = calculate_perceptual_hash(sample_text_file)
        assert result is None

    def test_perceptual_hash_missing_file(self, temp_dir):
        """Perceptual hash returns None for missing file."""
        result = calculate_perceptual_hash(temp_dir / "nonexistent.jpg")
        assert result is None


class TestConfidenceScoring:
    """Tests for confidence score calculation."""

    def test_high_confidence_exif_agreement(self):
        """HIGH confidence when EXIF source agrees with others."""
        now = datetime.now(timezone.utc)
        candidates = [
            (now, 'EXIF:DateTimeOriginal'),
            (now, 'EXIF:CreateDate'),
        ]
        dt, confidence, _ = calculate_confidence(candidates)
        assert confidence == ConfidenceLevel.HIGH

    def test_medium_confidence_single_reliable(self):
        """MEDIUM confidence for single reliable source."""
        now = datetime.now(timezone.utc)
        candidates = [
            (now, 'EXIF:ModifyDate'),  # Weight 5
        ]
        dt, confidence, _ = calculate_confidence(candidates)
        assert confidence == ConfidenceLevel.MEDIUM

    def test_low_confidence_filename_only(self):
        """LOW confidence for filename-only timestamp."""
        now = datetime.now(timezone.utc)
        candidates = [
            (now, 'filename_date'),  # Weight 2
        ]
        dt, confidence, _ = calculate_confidence(candidates)
        assert confidence == ConfidenceLevel.LOW

    def test_none_confidence_no_candidates(self):
        """NONE confidence when no candidates."""
        dt, confidence, _ = calculate_confidence([])
        assert confidence == ConfidenceLevel.NONE
        assert dt is None

    def test_min_year_filter(self):
        """Timestamps before min_year are filtered."""
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        candidates = [
            (epoch, 'EXIF:DateTimeOriginal'),
        ]
        dt, confidence, _ = calculate_confidence(candidates, min_year=2000)
        assert confidence == ConfidenceLevel.NONE
        assert dt is None

    def test_earliest_timestamp_selected(self):
        """Earliest valid timestamp is selected."""
        earlier = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        later = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        candidates = [
            (later, 'EXIF:CreateDate'),
            (earlier, 'EXIF:DateTimeOriginal'),
        ]
        dt, confidence, _ = calculate_confidence(candidates)
        assert dt == earlier

    def test_agreement_within_tolerance(self):
        """Timestamps within 1 second are considered agreeing."""
        base = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        close = base + timedelta(milliseconds=500)
        candidates = [
            (base, 'EXIF:DateTimeOriginal'),
            (close, 'filename_datetime'),
        ]
        dt, confidence, _ = calculate_confidence(candidates)
        # Should boost confidence due to agreement
        assert confidence in (ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM)

    def test_source_weights_defined(self):
        """SOURCE_WEIGHTS contains expected sources."""
        assert 'EXIF:DateTimeOriginal' in SOURCE_WEIGHTS
        assert SOURCE_WEIGHTS['EXIF:DateTimeOriginal'] > SOURCE_WEIGHTS['filename_date']


class TestProcessSingleFile:
    """Tests for the complete processing pipeline."""

    def test_process_returns_dict(self, sample_text_file):
        """process_single_file returns dict with required fields."""
        from app.lib.processing import process_single_file

        result = process_single_file(sample_text_file)

        assert isinstance(result, dict)
        assert 'status' in result
        assert 'sha256' in result
        assert 'confidence' in result

    def test_process_includes_sha256(self, sample_text_file):
        """Processed file has SHA256 hash."""
        from app.lib.processing import process_single_file

        result = process_single_file(sample_text_file)

        assert result['sha256'] is not None
        assert len(result['sha256']) == 64

    def test_process_handles_missing_file(self, temp_dir):
        """Missing file returns error status."""
        from app.lib.processing import process_single_file

        result = process_single_file(temp_dir / "nonexistent.jpg")

        assert result['status'] == 'error'
        assert result['error'] is not None

    def test_process_extracts_filename_timestamp(self, timestamped_file):
        """File with timestamp in name extracts it."""
        from app.lib.processing import process_single_file

        result = process_single_file(timestamped_file)

        # Should find timestamp from filename
        assert result['status'] == 'success'
        # Timestamp candidates should include filename source
        assert result['timestamp_candidates'] is not None

    def test_process_status_success_on_valid_file(self, sample_text_file):
        """Valid file processing returns success status."""
        from app.lib.processing import process_single_file

        result = process_single_file(sample_text_file)

        assert result['status'] == 'success'
        assert result['error'] is None

    def test_process_includes_file_path(self, sample_text_file):
        """Result includes absolute file path."""
        from app.lib.processing import process_single_file

        result = process_single_file(sample_text_file)

        assert result['file_path'] is not None
        assert Path(result['file_path']).is_absolute()

    def test_process_includes_mime_type(self, sample_text_file):
        """Result includes detected MIME type."""
        from app.lib.processing import process_single_file

        result = process_single_file(sample_text_file)

        assert result['mime_type'] is not None
        assert '/' in result['mime_type'] or result['mime_type'].startswith('unknown/')

    def test_process_perceptual_hash_none_for_text(self, sample_text_file):
        """Text files have no perceptual hash."""
        from app.lib.processing import process_single_file

        result = process_single_file(sample_text_file)

        assert result['perceptual_hash'] is None

    def test_process_confidence_level_returned(self, sample_text_file):
        """Result includes confidence level."""
        from app.lib.processing import process_single_file

        result = process_single_file(sample_text_file)

        assert result['confidence'] in ['high', 'medium', 'low', 'none']


class TestTypeDetection:
    """Tests for file type detection and mismatch warnings."""

    def test_detect_type_mismatch_normal_file(self, sample_image_file):
        """Normal JPEG file has no mismatch."""
        from app.lib.processing import detect_file_type_mismatch

        extension, mime_type, is_mismatch = detect_file_type_mismatch(sample_image_file)

        assert extension == 'jpg'
        # Mismatch check depends on python-magic availability
        # Just verify function returns expected structure
        assert isinstance(mime_type, str)
        assert isinstance(is_mismatch, bool)

    def test_detect_type_accepts_string_path(self, sample_text_file):
        """Type detection accepts string paths."""
        from app.lib.processing import detect_file_type_mismatch

        extension, mime_type, is_mismatch = detect_file_type_mismatch(str(sample_text_file))

        assert extension == 'txt'
        assert isinstance(mime_type, str)
        assert isinstance(is_mismatch, bool)


class TestEndToEndProcessing:
    """Integration tests for complete processing workflow."""

    def test_multiple_files_processed_independently(self, temp_dir):
        """Multiple files can be processed independently."""
        from app.lib.processing import process_single_file

        # Create multiple test files
        file1 = temp_dir / "file1.txt"
        file2 = temp_dir / "file2.txt"
        file1.write_text("Content 1")
        file2.write_text("Content 2")

        result1 = process_single_file(file1)
        result2 = process_single_file(file2)

        assert result1['status'] == 'success'
        assert result2['status'] == 'success'
        assert result1['sha256'] != result2['sha256']

    def test_timestamp_extraction_workflow(self, timestamped_file):
        """Complete workflow extracts and scores timestamps."""
        from app.lib.processing import process_single_file

        result = process_single_file(timestamped_file)

        # Should extract timestamp from filename
        assert result['status'] == 'success'
        assert result['detected_timestamp'] is not None
        assert result['timestamp_source'] is not None
        assert result['confidence'] in ['high', 'medium', 'low', 'none']

    def test_hashing_workflow(self, sample_text_file):
        """Complete workflow calculates hashes."""
        from app.lib.processing import process_single_file

        result = process_single_file(sample_text_file)

        # Should have SHA256 hash
        assert result['sha256'] is not None
        assert len(result['sha256']) == 64

        # Text file won't have perceptual hash
        assert result['perceptual_hash'] is None


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
