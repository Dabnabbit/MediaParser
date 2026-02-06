"""Tests for Phase 7 export pipeline functionality."""
import pytest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from app.lib.export import generate_output_filename, resolve_collision, copy_file_to_output


def make_file(original_filename='photo.jpg', final_timestamp=None, detected_timestamp=None):
    """Create a mock file object for testing."""
    return SimpleNamespace(
        original_filename=original_filename,
        final_timestamp=final_timestamp,
        detected_timestamp=detected_timestamp,
    )


class TestOutputFilenameGeneration:
    """Tests for generate_output_filename()."""

    def test_filename_from_final_timestamp(self, tmp_path):
        f = make_file(
            original_filename='photo.jpg',
            final_timestamp=datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
        )
        result = generate_output_filename(f, tmp_path)
        assert result == tmp_path / '2024' / '20240115_120000.jpg'

    def test_filename_from_detected_timestamp_fallback(self, tmp_path):
        f = make_file(
            original_filename='photo.jpg',
            detected_timestamp=datetime(2023, 6, 15, 14, 30, 22, tzinfo=timezone.utc),
        )
        result = generate_output_filename(f, tmp_path)
        assert result == tmp_path / '2023' / '20230615_143022.jpg'

    def test_final_timestamp_takes_precedence(self, tmp_path):
        f = make_file(
            original_filename='photo.jpg',
            final_timestamp=datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            detected_timestamp=datetime(2023, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
        )
        result = generate_output_filename(f, tmp_path)
        assert '2024' in str(result)
        assert '2023' not in str(result)

    def test_filename_no_timestamp(self, tmp_path):
        f = make_file(original_filename='photo.jpg')
        result = generate_output_filename(f, tmp_path)
        assert result == tmp_path / 'unknown' / 'photo.jpg'

    def test_year_subfolder_creation(self, tmp_path):
        f1 = make_file(
            original_filename='a.jpg',
            final_timestamp=datetime(2022, 3, 1, 10, 0, 0, tzinfo=timezone.utc),
        )
        f2 = make_file(
            original_filename='b.jpg',
            final_timestamp=datetime(2024, 7, 20, 15, 0, 0, tzinfo=timezone.utc),
        )
        r1 = generate_output_filename(f1, tmp_path)
        r2 = generate_output_filename(f2, tmp_path)
        assert r1.parent.name == '2022'
        assert r2.parent.name == '2024'

    def test_extension_preserved_lowercase(self, tmp_path):
        f = make_file(
            original_filename='PHOTO.JPG',
            final_timestamp=datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
        )
        result = generate_output_filename(f, tmp_path)
        assert result.suffix == '.jpg'

    def test_extension_heic(self, tmp_path):
        f = make_file(
            original_filename='IMG_0001.HEIC',
            final_timestamp=datetime(2024, 5, 10, 8, 30, 0, tzinfo=timezone.utc),
        )
        result = generate_output_filename(f, tmp_path)
        assert result.suffix == '.heic'


class TestCollisionHandling:
    """Tests for resolve_collision()."""

    def test_no_collision(self, tmp_path):
        target = tmp_path / '2024' / '20240115_120000.jpg'
        result = resolve_collision(target)
        assert result == target

    def test_single_collision(self, tmp_path):
        target = tmp_path / '20240115_120000.jpg'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('existing')
        result = resolve_collision(target)
        assert result == tmp_path / '20240115_120000_001.jpg'

    def test_multiple_collisions(self, tmp_path):
        base = tmp_path / '20240115_120000.jpg'
        base.parent.mkdir(parents=True, exist_ok=True)
        base.write_text('existing')
        (tmp_path / '20240115_120000_001.jpg').write_text('existing')
        (tmp_path / '20240115_120000_002.jpg').write_text('existing')
        result = resolve_collision(base)
        assert result == tmp_path / '20240115_120000_003.jpg'

    def test_collision_preserves_extension(self, tmp_path):
        target = tmp_path / '20240115_120000.png'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('existing')
        result = resolve_collision(target)
        assert result.suffix == '.png'
        assert result.stem == '20240115_120000_001'

    def test_unknown_folder_collision(self, tmp_path):
        target = tmp_path / 'unknown' / 'photo.jpg'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('existing')
        result = resolve_collision(target)
        assert result == tmp_path / 'unknown' / 'photo_001.jpg'


class TestFileCopy:
    """Tests for copy_file_to_output()."""

    def test_copy_file_basic(self, tmp_path):
        source = tmp_path / 'source' / 'photo.jpg'
        source.parent.mkdir()
        source.write_bytes(b'\xff\xd8\xff\xe0' + b'\x00' * 100)
        output = tmp_path / 'output' / '2024' / '20240115_120000.jpg'
        result = copy_file_to_output(source, output)
        assert result.exists()
        assert result.stat().st_size == source.stat().st_size

    def test_copy_creates_parent_dirs(self, tmp_path):
        source = tmp_path / 'source.txt'
        source.write_text('content')
        output = tmp_path / 'deeply' / 'nested' / 'dir' / 'output.txt'
        result = copy_file_to_output(source, output)
        assert result.exists()
        assert result.read_text() == 'content'

    def test_copy_with_collision(self, tmp_path):
        source = tmp_path / 'source.txt'
        source.write_text('new content')
        output = tmp_path / 'output.txt'
        output.write_text('existing content')
        result = copy_file_to_output(source, output)
        # Should get _001 suffix
        assert result.name == 'output_001.txt'
        assert result.read_text() == 'new content'
        # Original still exists
        assert output.read_text() == 'existing content'

    def test_copy_source_not_found(self, tmp_path):
        source = tmp_path / 'nonexistent.jpg'
        output = tmp_path / 'output.jpg'
        with pytest.raises(FileNotFoundError):
            copy_file_to_output(source, output)

    def test_copy_accepts_string_path(self, tmp_path):
        source = tmp_path / 'source.txt'
        source.write_text('content')
        output = tmp_path / 'output.txt'
        result = copy_file_to_output(str(source), output)
        assert result.exists()
