"""Tests for Phase 6 duplicate quality metrics and recommendations."""
import json
import pytest
from types import SimpleNamespace

from app.lib.duplicates import (
    get_quality_metrics,
    recommend_best_duplicate,
    accumulate_metadata,
    FORMAT_MULTIPLIERS,
)


def make_file(
    mime_type='image/jpeg',
    file_size_bytes=1_000_000,
    image_width=4000,
    image_height=3000,
    timestamp_candidates=None,
    id=1,
):
    """Create a mock file object for quality metric tests."""
    return SimpleNamespace(
        id=id,
        mime_type=mime_type,
        file_size_bytes=file_size_bytes,
        image_width=image_width,
        image_height=image_height,
        timestamp_candidates=timestamp_candidates,
    )


class TestQualityMetrics:
    """Tests for get_quality_metrics()."""

    def test_basic_metrics(self):
        f = make_file()
        m = get_quality_metrics(f)
        assert m['width'] == 4000
        assert m['height'] == 3000
        assert m['resolution_mp'] == 12.0
        assert m['file_size_bytes'] == 1_000_000
        assert m['format'] == 'jpeg'

    def test_no_dimensions(self):
        f = make_file(image_width=None, image_height=None)
        m = get_quality_metrics(f)
        assert m['resolution_mp'] is None
        assert m['width'] is None

    def test_format_extraction(self):
        f = make_file(mime_type='image/png')
        m = get_quality_metrics(f)
        assert m['format'] == 'png'

    def test_no_mime_type(self):
        f = make_file(mime_type=None)
        m = get_quality_metrics(f)
        assert m['format'] is None


class TestRecommendBestDuplicate:
    """Tests for recommend_best_duplicate()."""

    def test_higher_resolution_wins(self):
        files = [
            {'id': 1, 'resolution_mp': 8.0, 'file_size_bytes': 2_000_000, 'format': 'jpeg'},
            {'id': 2, 'resolution_mp': 12.0, 'file_size_bytes': 1_000_000, 'format': 'jpeg'},
        ]
        assert recommend_best_duplicate(files) == 2

    def test_larger_size_tiebreaker(self):
        files = [
            {'id': 1, 'resolution_mp': 12.0, 'file_size_bytes': 2_000_000, 'format': 'jpeg'},
            {'id': 2, 'resolution_mp': 12.0, 'file_size_bytes': 3_000_000, 'format': 'jpeg'},
        ]
        assert recommend_best_duplicate(files) == 2

    def test_format_multiplier_applies(self):
        # PNG (1.1x) at same resolution beats JPEG (1.0x)
        files = [
            {'id': 1, 'resolution_mp': 12.0, 'file_size_bytes': 1_000_000, 'format': 'jpeg'},
            {'id': 2, 'resolution_mp': 12.0, 'file_size_bytes': 1_000_000, 'format': 'png'},
        ]
        assert recommend_best_duplicate(files) == 2

    def test_empty_list(self):
        assert recommend_best_duplicate([]) is None

    def test_single_file(self):
        files = [{'id': 42, 'resolution_mp': 12.0, 'file_size_bytes': 1_000_000, 'format': 'jpeg'}]
        assert recommend_best_duplicate(files) == 42

    def test_no_resolution(self):
        # Falls back to file_size_bytes when resolution is None
        files = [
            {'id': 1, 'resolution_mp': None, 'file_size_bytes': 1_000_000, 'format': 'jpeg'},
            {'id': 2, 'resolution_mp': None, 'file_size_bytes': 2_000_000, 'format': 'jpeg'},
        ]
        assert recommend_best_duplicate(files) == 2

    def test_raw_format_bonus(self):
        # RAW (1.3x) should beat JPEG (1.0x) at similar resolution
        files = [
            {'id': 1, 'resolution_mp': 12.0, 'file_size_bytes': 5_000_000, 'format': 'jpeg'},
            {'id': 2, 'resolution_mp': 12.0, 'file_size_bytes': 5_000_000, 'format': 'cr2'},
        ]
        assert recommend_best_duplicate(files) == 2


class TestAccumulateMetadata:
    """Tests for accumulate_metadata()."""

    def test_merge_candidates(self):
        kept = make_file(timestamp_candidates=json.dumps([
            {'timestamp': '2024-01-15T12:00:00', 'source': 'exif'}
        ]))
        discarded = [make_file(timestamp_candidates=json.dumps([
            {'timestamp': '2024-01-15T12:00:01', 'source': 'filename'}
        ]))]
        accumulate_metadata(kept, discarded)
        result = json.loads(kept.timestamp_candidates)
        assert len(result) == 2

    def test_deduplication(self):
        kept = make_file(timestamp_candidates=json.dumps([
            {'timestamp': '2024-01-15T12:00:00', 'source': 'exif'}
        ]))
        discarded = [make_file(timestamp_candidates=json.dumps([
            {'timestamp': '2024-01-15T12:00:00', 'source': 'exif'}  # Same
        ]))]
        accumulate_metadata(kept, discarded)
        result = json.loads(kept.timestamp_candidates)
        assert len(result) == 1

    def test_no_candidates_on_discarded(self):
        kept = make_file(timestamp_candidates=json.dumps([
            {'timestamp': '2024-01-15T12:00:00', 'source': 'exif'}
        ]))
        discarded = [make_file(timestamp_candidates=None)]
        accumulate_metadata(kept, discarded)
        result = json.loads(kept.timestamp_candidates)
        assert len(result) == 1

    def test_no_candidates_on_kept(self):
        kept = make_file(timestamp_candidates=None)
        discarded = [make_file(timestamp_candidates=json.dumps([
            {'timestamp': '2024-01-15T12:00:00', 'source': 'exif'}
        ]))]
        accumulate_metadata(kept, discarded)
        result = json.loads(kept.timestamp_candidates)
        assert len(result) == 1

    def test_multiple_discarded_files(self):
        kept = make_file(timestamp_candidates=json.dumps([]))
        discarded = [
            make_file(timestamp_candidates=json.dumps([
                {'timestamp': '2024-01-15T12:00:00', 'source': 'exif'}
            ])),
            make_file(timestamp_candidates=json.dumps([
                {'timestamp': '2024-01-15T12:00:01', 'source': 'filename'}
            ])),
        ]
        accumulate_metadata(kept, discarded)
        result = json.loads(kept.timestamp_candidates)
        assert len(result) == 2
