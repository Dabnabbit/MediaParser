"""Tests for Phase 7 tag auto-generation functionality."""
import pytest
from types import SimpleNamespace

from app.lib.tagging import extract_filename_tags, extract_folder_tags, auto_generate_tags


class TestFilenameTagExtraction:
    """Tests for extract_filename_tags()."""

    def test_single_tag(self):
        result = extract_filename_tags('{Korea}20240115.jpg')
        assert result == ['korea']

    def test_multiple_tags(self):
        result = extract_filename_tags('{Korea,Seoul}20240115.jpg')
        assert result == ['korea', 'seoul']

    def test_no_tags(self):
        result = extract_filename_tags('photo.jpg')
        assert result == []

    def test_empty_braces(self):
        result = extract_filename_tags('{}photo.jpg')
        assert result == []

    def test_whitespace_handling(self):
        result = extract_filename_tags('{ Korea , Seoul }photo.jpg')
        assert result == ['korea', 'seoul']

    def test_tags_in_middle(self):
        result = extract_filename_tags('vacation_{family,beach}_2024.jpg')
        assert result == ['family', 'beach']

    def test_multiple_brace_groups(self):
        result = extract_filename_tags('{Korea}{family}photo.jpg')
        assert result == ['korea', 'family']

    def test_case_normalization(self):
        result = extract_filename_tags('{KOREA,Seoul,tokyo}photo.jpg')
        assert result == ['korea', 'seoul', 'tokyo']


class TestFolderTagExtraction:
    """Tests for extract_folder_tags()."""

    def test_single_subfolder(self):
        result = extract_folder_tags('/photos/Korea/photo.jpg', '/photos')
        assert result == ['korea']

    def test_nested_subfolders(self):
        result = extract_folder_tags('/photos/Korea/Seoul/photo.jpg', '/photos')
        assert result == ['korea', 'seoul']

    def test_no_subfolders(self):
        result = extract_folder_tags('/photos/photo.jpg', '/photos')
        assert result == []

    def test_path_not_under_root(self):
        result = extract_folder_tags('/other/photo.jpg', '/photos')
        assert result == []

    def test_filters_generic_dirs(self):
        result = extract_folder_tags('/photos/DCIM/Camera/photo.jpg', '/photos')
        assert result == []

    def test_filters_numeric_dirs(self):
        result = extract_folder_tags('/photos/2024/photo.jpg', '/photos')
        assert result == []

    def test_filters_single_letter_dirs(self):
        result = extract_folder_tags('/photos/A/photo.jpg', '/photos')
        assert result == []

    def test_mixed_generic_and_meaningful(self):
        result = extract_folder_tags('/photos/Vacation/DCIM/photo.jpg', '/photos')
        assert result == ['vacation']

    def test_none_import_root(self):
        # extract_folder_tags expects a string, None should cause an error path
        # that returns empty list
        result = extract_folder_tags('/photos/Korea/photo.jpg', None)
        assert result == []


class TestAutoGenerateTags:
    """Tests for auto_generate_tags() combining filename + folder extraction."""

    def test_filename_only(self):
        f = SimpleNamespace(
            original_filename='{beach,sunset}photo.jpg',
            original_path='/photos/photo.jpg',
        )
        result = auto_generate_tags(f, import_root='/photos')
        assert 'beach' in result
        assert 'sunset' in result

    def test_folder_only(self):
        f = SimpleNamespace(
            original_filename='photo.jpg',
            original_path='/photos/Korea/Seoul/photo.jpg',
        )
        result = auto_generate_tags(f, import_root='/photos')
        assert result == ['korea', 'seoul']

    def test_combined_deduplication(self):
        f = SimpleNamespace(
            original_filename='{korea}photo.jpg',
            original_path='/photos/Korea/photo.jpg',
        )
        result = auto_generate_tags(f, import_root='/photos')
        # 'korea' appears in both filename and folder, should appear once
        assert result.count('korea') == 1

    def test_no_import_root(self):
        f = SimpleNamespace(
            original_filename='{beach}photo.jpg',
            original_path='/photos/Korea/photo.jpg',
        )
        result = auto_generate_tags(f, import_root=None)
        # Only filename tags, no folder tags
        assert result == ['beach']

    def test_no_tags_anywhere(self):
        f = SimpleNamespace(
            original_filename='photo.jpg',
            original_path='/photos/photo.jpg',
        )
        result = auto_generate_tags(f, import_root='/photos')
        assert result == []
