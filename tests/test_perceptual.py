"""Tests for Phase 6 perceptual duplicate detection."""
import pytest
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

from app.lib.perceptual import (
    hamming_distance,
    cluster_by_timestamp,
    detect_sequence_type,
    distance_to_exact_confidence,
    distance_to_similar_confidence,
    analyze_cluster,
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


class TestClusterByTimestamp:
    """Tests for cluster_by_timestamp()."""

    def test_two_close_files(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        files = [
            make_file('a.jpg', detected_timestamp=t),
            make_file('b.jpg', detected_timestamp=t + timedelta(seconds=2)),
        ]
        clusters = cluster_by_timestamp(files)
        assert len(clusters) == 1
        assert len(clusters[0]) == 2

    def test_two_far_files(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        files = [
            make_file('a.jpg', detected_timestamp=t),
            make_file('b.jpg', detected_timestamp=t + timedelta(minutes=10)),
        ]
        clusters = cluster_by_timestamp(files)
        assert len(clusters) == 0

    def test_multiple_clusters(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        files = [
            make_file('a.jpg', detected_timestamp=t),
            make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1)),
            make_file('c.jpg', detected_timestamp=t + timedelta(seconds=2)),
            make_file('d.jpg', detected_timestamp=t + timedelta(seconds=60)),
            make_file('e.jpg', detected_timestamp=t + timedelta(seconds=61)),
        ]
        clusters = cluster_by_timestamp(files)
        assert len(clusters) == 2
        assert len(clusters[0]) == 3
        assert len(clusters[1]) == 2

    def test_no_timestamps(self):
        files = [make_file('a.jpg'), make_file('b.jpg')]
        clusters = cluster_by_timestamp(files)
        assert len(clusters) == 0

    def test_single_file(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        files = [make_file('a.jpg', detected_timestamp=t)]
        clusters = cluster_by_timestamp(files)
        assert len(clusters) == 0

    def test_mixed_timestamp_and_none(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        files = [
            make_file('a.jpg', detected_timestamp=t),
            make_file('b.jpg'),  # No timestamp
            make_file('c.jpg', detected_timestamp=t + timedelta(seconds=1)),
        ]
        clusters = cluster_by_timestamp(files)
        assert len(clusters) == 1
        assert len(clusters[0]) == 2  # Only timestamped files

    def test_unsorted_input(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        files = [
            make_file('c.jpg', detected_timestamp=t + timedelta(seconds=2)),
            make_file('a.jpg', detected_timestamp=t),
            make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1)),
        ]
        clusters = cluster_by_timestamp(files)
        assert len(clusters) == 1
        assert len(clusters[0]) == 3


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


class TestConfidenceMappings:
    """Tests for confidence level mapping functions."""

    def test_exact_always_high(self):
        for d in range(0, 6):
            assert distance_to_exact_confidence(d) == 'high'

    def test_similar_high(self):
        for d in range(6, 11):
            assert distance_to_similar_confidence(d) == 'high'

    def test_similar_medium(self):
        for d in range(11, 16):
            assert distance_to_similar_confidence(d) == 'medium'

    def test_similar_low(self):
        for d in range(16, 21):
            assert distance_to_similar_confidence(d) == 'low'


class TestAnalyzeCluster:
    """Tests for analyze_cluster()."""

    def test_exact_match_grouped(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        # Identical perceptual hashes = distance 0
        a = make_file('a.jpg', detected_timestamp=t, perceptual_hash='abcdef0000000000')
        b = make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1), perceptual_hash='abcdef0000000000')
        analyze_cluster([a, b])
        assert a.exact_group_id is not None
        assert a.exact_group_id == b.exact_group_id

    def test_similar_match_grouped(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        # Hashes with distance in 6-20 range
        # 0xff = 8 bits set → distance = 8
        a = make_file('a.jpg', detected_timestamp=t, perceptual_hash='0000000000000000')
        b = make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1), perceptual_hash='00000000000000ff')
        analyze_cluster([a, b])
        assert a.similar_group_id is not None
        assert a.similar_group_id == b.similar_group_id
        assert a.exact_group_id is None

    def test_unrelated_not_grouped(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        # Very different hashes → distance > 20
        a = make_file('a.jpg', detected_timestamp=t, perceptual_hash='ffffffffffffffff')
        b = make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1), perceptual_hash='0000000000000000')
        analyze_cluster([a, b])
        assert a.exact_group_id is None
        assert a.similar_group_id is None
        assert b.exact_group_id is None
        assert b.similar_group_id is None

    def test_missing_hash_skipped(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        a = make_file('a.jpg', detected_timestamp=t, perceptual_hash='abcdef0000000000')
        b = make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1), perceptual_hash=None)
        analyze_cluster([a, b])
        assert a.exact_group_id is None
        assert a.similar_group_id is None

    def test_transitive_grouping(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        # Three files, A≈B and B≈C → all in same group
        a = make_file('a.jpg', detected_timestamp=t, perceptual_hash='0000000000000000')
        b = make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1), perceptual_hash='0000000000000001')
        c = make_file('c.jpg', detected_timestamp=t + timedelta(seconds=2), perceptual_hash='0000000000000003')
        analyze_cluster([a, b, c])
        # All should share the same exact group (distances 1, 3, 2 — all ≤5)
        assert a.exact_group_id == b.exact_group_id == c.exact_group_id


class TestDetectPerceptualDuplicates:
    """Tests for the main detect_perceptual_duplicates() entry point."""

    def test_groups_exact_duplicates(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        files = [
            make_file('a.jpg', detected_timestamp=t, perceptual_hash='abcdef0000000000'),
            make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1), perceptual_hash='abcdef0000000000'),
            make_file('c.jpg', detected_timestamp=t + timedelta(minutes=10), perceptual_hash='1111111111111111'),
        ]
        detect_perceptual_duplicates(files)
        assert files[0].exact_group_id is not None
        assert files[0].exact_group_id == files[1].exact_group_id
        assert files[2].exact_group_id is None

    def test_groups_similar_files(self):
        t = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        # 0xff = 8 bits → distance 8 (in similar range 6-20)
        files = [
            make_file('a.jpg', detected_timestamp=t, perceptual_hash='0000000000000000'),
            make_file('b.jpg', detected_timestamp=t + timedelta(seconds=1), perceptual_hash='00000000000000ff'),
        ]
        detect_perceptual_duplicates(files)
        assert files[0].similar_group_id is not None
        assert files[0].similar_group_id == files[1].similar_group_id

    def test_no_files_no_crash(self):
        detect_perceptual_duplicates([])

    def test_no_timestamps_no_groups(self):
        files = [
            make_file('a.jpg', perceptual_hash='abcdef0000000000'),
            make_file('b.jpg', perceptual_hash='abcdef0000000000'),
        ]
        detect_perceptual_duplicates(files)
        assert files[0].exact_group_id is None
        assert files[1].exact_group_id is None
