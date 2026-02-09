"""Tests for perceptual duplicate detection."""
import pytest
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

from app.lib.perceptual import (
    hamming_distance,
    detect_sequence_type,
    _compare_all_pairs,
    detect_perceptual_duplicates,
    EXACT_THRESHOLD,
    SIMILAR_THRESHOLD,
)


def make_file(
    filename='photo.jpg',
    detected_timestamp=None,
    perceptual_hash=None,
    exact_group_id=None,
    exact_group_confidence=None,
    similar_group_id=None,
    similar_group_confidence=None,
    similar_group_type=None,
):
    """Create a mock file object for perceptual detection tests."""
    return SimpleNamespace(
        original_filename=filename,
        detected_timestamp=detected_timestamp,
        file_hash_perceptual=perceptual_hash,
        exact_group_id=exact_group_id,
        exact_group_confidence=exact_group_confidence,
        similar_group_id=similar_group_id,
        similar_group_confidence=similar_group_confidence,
        similar_group_type=similar_group_type,
    )


class TestHammingDistance:
    """Tests for hamming_distance()."""

    def test_identical_hashes(self):
        assert hamming_distance('0000000000000000', '0000000000000000') == 0

    def test_single_bit_difference(self):
        assert hamming_distance('0000000000000000', '0000000000000001') == 1

    def test_all_bits_different(self):
        assert hamming_distance('ffffffffffffffff', '0000000000000000') == 64

    def test_known_distance(self):
        # 0x03 = 0b11 = 2 bits set
        assert hamming_distance('0000000000000000', '0000000000000003') == 2

    def test_none_input(self):
        assert hamming_distance(None, '0000000000000000') == 999

    def test_both_none(self):
        assert hamming_distance(None, None) == 999

    def test_empty_string(self):
        assert hamming_distance('', '0000000000000000') == 999

    def test_symmetric(self):
        h1 = 'abcdef0123456789'
        h2 = '0000000000000000'
        assert hamming_distance(h1, h2) == hamming_distance(h2, h1)


class TestDetectSequenceType:
    """Tests for detect_sequence_type()."""

    def test_burst(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        a = make_file(detected_timestamp=t)
        b = make_file(detected_timestamp=t + timedelta(seconds=1))
        assert detect_sequence_type(a, b) == 'burst'

    def test_panorama(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        a = make_file(detected_timestamp=t)
        b = make_file(detected_timestamp=t + timedelta(seconds=10))
        assert detect_sequence_type(a, b) == 'panorama'

    def test_similar(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        a = make_file(detected_timestamp=t)
        b = make_file(detected_timestamp=t + timedelta(seconds=60))
        assert detect_sequence_type(a, b) == 'similar'

    def test_missing_timestamp(self):
        a = make_file(detected_timestamp=datetime(2024, 1, 15, tzinfo=timezone.utc))
        b = make_file()
        assert detect_sequence_type(a, b) == 'similar'


class TestCompareAllPairs:
    """Tests for _compare_all_pairs()."""

    def test_exact_match_grouped(self):
        a = make_file('a.jpg', perceptual_hash='abcdef0000000000')
        b = make_file('b.jpg', perceptual_hash='abcdef0000000000')
        _compare_all_pairs([a, b])
        assert a.exact_group_id is not None
        assert a.exact_group_id == b.exact_group_id
        assert a.exact_group_confidence == 'high'

    def test_similar_match_grouped(self):
        # 0xff = 8 bits set → distance = 8
        a = make_file('a.jpg', perceptual_hash='0000000000000000')
        b = make_file('b.jpg', perceptual_hash='00000000000000ff')
        _compare_all_pairs([a, b])
        assert a.similar_group_id is not None
        assert a.similar_group_id == b.similar_group_id
        assert a.exact_group_id is None
        # Group confidence should be shared
        assert a.similar_group_confidence == b.similar_group_confidence

    def test_unrelated_not_grouped(self):
        a = make_file('a.jpg', perceptual_hash='ffffffffffffffff')
        b = make_file('b.jpg', perceptual_hash='0000000000000000')
        _compare_all_pairs([a, b])
        assert a.exact_group_id is None
        assert a.similar_group_id is None
        assert b.exact_group_id is None
        assert b.similar_group_id is None

    def test_missing_hash_skipped(self):
        a = make_file('a.jpg', perceptual_hash='abcdef0000000000')
        b = make_file('b.jpg', perceptual_hash=None)
        _compare_all_pairs([a, b])
        assert a.exact_group_id is None
        assert a.similar_group_id is None

    def test_transitive_grouping(self):
        a = make_file('a.jpg', perceptual_hash='0000000000000000')
        b = make_file('b.jpg', perceptual_hash='0000000000000001')
        c = make_file('c.jpg', perceptual_hash='0000000000000003')
        _compare_all_pairs([a, b, c])
        assert a.exact_group_id == b.exact_group_id == c.exact_group_id

    def test_no_timestamps_still_groups(self):
        """Files without timestamps are grouped by visual similarity."""
        a = make_file('a.jpg', perceptual_hash='abcdef0000000000')
        b = make_file('b.jpg', perceptual_hash='abcdef0000000000')
        _compare_all_pairs([a, b])
        assert a.exact_group_id is not None
        assert a.exact_group_id == b.exact_group_id

    def test_similar_group_confidence_levels(self):
        """Similar groups get confidence based on average distance."""
        # Distance 7 (0x7f = 7 bits) → high confidence (≤8)
        a = make_file('a.jpg', perceptual_hash='0000000000000000')
        b = make_file('b.jpg', perceptual_hash='000000000000007f')
        _compare_all_pairs([a, b])
        assert a.similar_group_confidence == 'high'

        # Distance 12 (0xfff = 12 bits) → medium confidence (≤13)
        c = make_file('c.jpg', perceptual_hash='0000000000000000')
        d = make_file('d.jpg', perceptual_hash='0000000000000fff')
        _compare_all_pairs([c, d])
        assert c.similar_group_confidence == 'medium'

        # Distance 15 (0x7fff = 15 bits) → low confidence (>13)
        e = make_file('e.jpg', perceptual_hash='0000000000000000')
        f = make_file('f.jpg', perceptual_hash='0000000000007fff')
        _compare_all_pairs([e, f])
        assert e.similar_group_confidence == 'low'

    def test_exact_group_confidence_levels(self):
        """Exact groups get confidence based on average pairwise distance."""
        # Distance 0 (identical) → high (≤1)
        a = make_file('a.jpg', perceptual_hash='abcdef0000000000')
        b = make_file('b.jpg', perceptual_hash='abcdef0000000000')
        _compare_all_pairs([a, b])
        assert a.exact_group_confidence == 'high'

        # Distance 3 (0x07 = 3 bits) → medium (≤3)
        c = make_file('c.jpg', perceptual_hash='0000000000000000')
        d = make_file('d.jpg', perceptual_hash='0000000000000007')
        _compare_all_pairs([c, d])
        assert c.exact_group_confidence == 'medium'

        # Distance 5 (0x1f = 5 bits) → low (>3)
        e = make_file('e.jpg', perceptual_hash='0000000000000000')
        f = make_file('f.jpg', perceptual_hash='000000000000001f')
        _compare_all_pairs([e, f])
        assert e.exact_group_confidence == 'low'

    def test_beyond_threshold_not_grouped(self):
        """Distance beyond SIMILAR_THRESHOLD (12) is not grouped."""
        # Distance 18 — well beyond threshold
        a = make_file('a.jpg', perceptual_hash='0000000000000000')
        b = make_file('b.jpg', perceptual_hash='000000000003ffff')
        _compare_all_pairs([a, b])
        assert a.similar_group_id is None
        assert b.similar_group_id is None


class TestDetectPerceptualDuplicates:
    """Tests for the main detect_perceptual_duplicates() entry point."""

    def test_groups_exact_duplicates(self):
        files = [
            make_file('a.jpg', perceptual_hash='abcdef0000000000'),
            make_file('b.jpg', perceptual_hash='abcdef0000000000'),
            make_file('c.jpg', perceptual_hash='1111111111111111'),
        ]
        detect_perceptual_duplicates(files)
        assert files[0].exact_group_id is not None
        assert files[0].exact_group_id == files[1].exact_group_id
        assert files[2].exact_group_id is None

    def test_groups_similar_files(self):
        # 0xff = 8 bits → distance 8 (in similar range 6-20)
        files = [
            make_file('a.jpg', perceptual_hash='0000000000000000'),
            make_file('b.jpg', perceptual_hash='00000000000000ff'),
        ]
        detect_perceptual_duplicates(files)
        assert files[0].similar_group_id is not None
        assert files[0].similar_group_id == files[1].similar_group_id

    def test_no_files_no_crash(self):
        detect_perceptual_duplicates([])

    def test_no_hashes_no_groups(self):
        """Files without perceptual hashes can't be compared."""
        files = [
            make_file('a.jpg'),
            make_file('b.jpg'),
        ]
        detect_perceptual_duplicates(files)
        assert files[0].exact_group_id is None
        assert files[1].exact_group_id is None

    def test_groups_without_timestamps(self):
        """Files without timestamps are still grouped by visual similarity."""
        files = [
            make_file('a.jpg', perceptual_hash='abcdef0000000000'),
            make_file('b.jpg', perceptual_hash='abcdef0000000000'),
        ]
        detect_perceptual_duplicates(files)
        assert files[0].exact_group_id is not None
        assert files[0].exact_group_id == files[1].exact_group_id
