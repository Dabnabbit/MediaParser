"""Review, tagging, and duplicate handling routes.

Provides endpoints for:
- File detail retrieval with timestamp candidates
- Review decisions (confirm/unreview timestamps)
- Tag management (create, add, remove tags)
- Bulk operations for tags and discard/duplicate handling
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timezone
import json
import logging

from sqlalchemy.exc import IntegrityError

from app import db
from app.models import File, Job, Tag, UserDecision

logger = logging.getLogger(__name__)

review_bp = Blueprint('review', __name__)


def _cleanup_exact_orphans(group_ids, job_ids=None):
    """Clear exact_group_id from files left alone in their group after removals."""
    for group_id in group_ids:
        query = File.query.filter(
            File.exact_group_id == group_id,
            File.discarded == False,
        )
        if job_ids:
            query = query.join(File.jobs).filter(Job.id.in_(job_ids))
        remaining = query.all()
        if len(remaining) == 1:
            remaining[0].exact_group_id = None
            logger.info(f"Cleared orphaned exact group from file {remaining[0].id}")


def _clear_similar_fields(file):
    """Clear all similar group fields from a file."""
    file.similar_group_id = None
    file.similar_group_confidence = None
    file.similar_group_type = None


def _cleanup_similar_orphans(group_ids, job_ids=None):
    """Clear similar group fields from files left alone in their group after removals."""
    for group_id in group_ids:
        query = File.query.filter(
            File.similar_group_id == group_id,
            File.discarded == False,
        )
        if job_ids:
            query = query.join(File.jobs).filter(Job.id.in_(job_ids))
        remaining = query.all()
        if len(remaining) == 1:
            _clear_similar_fields(remaining[0])
            logger.info(f"Cleared orphaned similar group from file {remaining[0].id}")


@review_bp.route('/api/files/<int:file_id>', methods=['GET'])
def get_file_detail(file_id):
    """
    Get single file with full details including timestamp candidates.

    Args:
        file_id: ID of the file

    Returns:
        JSON with complete file details
    """
    from app.lib.confidence import build_timestamp_options

    file = db.session.get(File, file_id)

    if file is None:
        return jsonify({'error': f'File {file_id} not found'}), 404

    # Parse timestamp_candidates JSON
    timestamp_candidates = None
    timestamp_options = []
    if file.timestamp_candidates:
        try:
            timestamp_candidates = json.loads(file.timestamp_candidates)
            # Convert to tuples for build_timestamp_options
            candidates_tuples = []
            for c in timestamp_candidates:
                ts = c.get('timestamp') or c.get('value')
                if ts:
                    try:
                        # Handle ISO format with Z suffix
                        if isinstance(ts, str):
                            ts = ts.replace('Z', '+00:00')
                        dt = datetime.fromisoformat(ts)
                        candidates_tuples.append((dt, c.get('source', 'unknown')))
                    except (ValueError, TypeError):
                        pass
            timestamp_options = build_timestamp_options(candidates_tuples)
        except json.JSONDecodeError:
            timestamp_candidates = None

    return jsonify({
        'id': file.id,
        'original_filename': file.original_filename,
        'original_path': file.original_path,
        'storage_path': file.storage_path,
        'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
        'final_timestamp': file.final_timestamp.isoformat() if file.final_timestamp else None,
        'timestamp_source': file.timestamp_source,
        'confidence': file.confidence.value,
        'reviewed_at': file.reviewed_at.isoformat() if file.reviewed_at else None,
        'timestamp_candidates': timestamp_candidates,
        'timestamp_options': timestamp_options,
        'tags': [{'id': t.id, 'name': t.name} for t in file.tags],
        'file_size_bytes': file.file_size_bytes,
        'mime_type': file.mime_type,
        'thumbnail_path': file.thumbnail_path,
        'file_hash': file.file_hash_sha256,
        'discarded': file.discarded,
        'exact_group_id': file.exact_group_id,
        'exact_group_confidence': file.exact_group_confidence,
        'similar_group_id': file.similar_group_id,
        'similar_group_confidence': file.similar_group_confidence,
        'similar_group_type': file.similar_group_type,
        'processing_error': file.processing_error,
        'width': file.image_width,
        'height': file.image_height
    }), 200


@review_bp.route('/api/files/<int:file_id>/review', methods=['POST'])
def submit_review(file_id):
    """
    Submit review decision for a file.

    Args:
        file_id: ID of the file

    Request body:
        { final_timestamp: ISO string, source: string (optional) }

    Returns:
        JSON with updated file object
    """
    file = db.session.get(File, file_id)

    if file is None:
        return jsonify({'error': f'File {file_id} not found'}), 404

    data = request.get_json()
    if not data or 'final_timestamp' not in data:
        return jsonify({'error': 'final_timestamp is required'}), 400

    # Parse the timestamp
    try:
        final_ts = datetime.fromisoformat(data['final_timestamp'].replace('Z', '+00:00'))
    except (ValueError, AttributeError) as e:
        return jsonify({'error': f'Invalid timestamp format: {e}'}), 400

    # Update file
    file.final_timestamp = final_ts
    file.reviewed_at = datetime.now(timezone.utc)

    # Optionally update timestamp source if provided
    if 'source' in data:
        file.timestamp_source = data['source']

    # Create UserDecision record
    decision = UserDecision(
        file_id=file.id,
        decision_type='timestamp_override',
        decision_value=json.dumps({
            'final_timestamp': final_ts.isoformat(),
            'source': data.get('source', file.timestamp_source),
            'original_detected': file.detected_timestamp.isoformat() if file.detected_timestamp else None
        })
    )
    db.session.add(decision)
    db.session.commit()

    logger.info(f"File {file_id} reviewed with timestamp {final_ts.isoformat()}")

    return jsonify({
        'id': file.id,
        'original_filename': file.original_filename,
        'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
        'final_timestamp': file.final_timestamp.isoformat() if file.final_timestamp else None,
        'timestamp_source': file.timestamp_source,
        'confidence': file.confidence.value,
        'reviewed_at': file.reviewed_at.isoformat() if file.reviewed_at else None,
        'discarded': file.discarded,
        'exact_group_id': file.exact_group_id
    }), 200


@review_bp.route('/api/files/<int:file_id>/review', methods=['DELETE'])
def unreview_file(file_id):
    """
    Unreview a file (return to original state).

    Args:
        file_id: ID of the file

    Returns:
        JSON with updated file object
    """
    file = db.session.get(File, file_id)

    if file is None:
        return jsonify({'error': f'File {file_id} not found'}), 404

    # Clear review fields
    file.reviewed_at = None
    file.final_timestamp = None
    db.session.commit()

    logger.info(f"File {file_id} unreviewed")

    return jsonify({
        'id': file.id,
        'original_filename': file.original_filename,
        'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
        'final_timestamp': None,
        'timestamp_source': file.timestamp_source,
        'confidence': file.confidence.value,
        'reviewed_at': None,
        'discarded': file.discarded,
        'exact_group_id': file.exact_group_id
    }), 200


@review_bp.route('/api/tags', methods=['GET'])
def get_tags():
    """
    Get all tags sorted by usage_count descending.

    Query params:
        limit: Maximum number of tags to return (default 20)

    Returns:
        JSON array of tags
    """
    limit = request.args.get('limit', 20, type=int)
    limit = min(max(1, limit), 100)  # Clamp between 1 and 100

    tags = Tag.query.order_by(Tag.usage_count.desc()).limit(limit).all()

    return jsonify([
        {'id': t.id, 'name': t.name, 'usage_count': t.usage_count}
        for t in tags
    ]), 200


@review_bp.route('/api/tags/recent', methods=['GET'])
def get_recent_tags():
    """
    Get recently used tags (by creation date as proxy for recent usage).

    Returns:
        JSON array of top 10 tags by most recent creation
    """
    # Note: For true recent usage tracking, we'd need to track tag-file association timestamps
    # Using created_at as proxy since tags are created when first used
    tags = Tag.query.order_by(Tag.created_at.desc()).limit(10).all()

    return jsonify([
        {'id': t.id, 'name': t.name, 'usage_count': t.usage_count}
        for t in tags
    ]), 200


@review_bp.route('/api/files/<int:file_id>/tags', methods=['POST'])
def add_tags_to_file(file_id):
    """
    Add tag(s) to a file.

    Args:
        file_id: ID of the file

    Request body:
        { tags: ["tag1", "tag2"] }

    Returns:
        JSON with file's current tags
    """
    file = db.session.get(File, file_id)

    if file is None:
        return jsonify({'error': f'File {file_id} not found'}), 404

    data = request.get_json()
    if not data or 'tags' not in data:
        return jsonify({'error': 'tags array is required'}), 400

    if not isinstance(data['tags'], list):
        return jsonify({'error': 'tags must be an array'}), 400

    tags_added = []
    for tag_name in data['tags']:
        if not isinstance(tag_name, str) or not tag_name.strip():
            continue

        # Normalize to lowercase
        normalized_name = tag_name.strip().lower()

        # Find or create tag (handle concurrent inserts)
        tag = Tag.query.filter_by(name=normalized_name).first()
        if tag is None:
            try:
                tag = Tag(name=normalized_name, usage_count=0)
                db.session.add(tag)
                db.session.flush()
            except IntegrityError:
                db.session.rollback()
                tag = Tag.query.filter_by(name=normalized_name).first()

        # Add to file if not already present
        if tag not in file.tags:
            file.tags.append(tag)
            tag.usage_count += 1
            tags_added.append(normalized_name)

    db.session.commit()

    if tags_added:
        logger.info(f"Added tags {tags_added} to file {file_id}")

    return jsonify({
        'id': file.id,
        'tags': [{'id': t.id, 'name': t.name} for t in file.tags]
    }), 200


@review_bp.route('/api/files/<int:file_id>/tags/<tag_name>', methods=['DELETE'])
def remove_tag_from_file(file_id, tag_name):
    """
    Remove a tag from a file.

    Args:
        file_id: ID of the file
        tag_name: Name of the tag to remove

    Returns:
        JSON with file's current tags
    """
    file = db.session.get(File, file_id)

    if file is None:
        return jsonify({'error': f'File {file_id} not found'}), 404

    # Normalize tag name
    normalized_name = tag_name.strip().lower()

    # Find the tag
    tag = Tag.query.filter_by(name=normalized_name).first()

    if tag is None:
        return jsonify({'error': f'Tag "{tag_name}" not found'}), 404

    # Remove from file
    if tag in file.tags:
        file.tags.remove(tag)
        tag.usage_count = max(0, tag.usage_count - 1)
        db.session.commit()
        logger.info(f"Removed tag '{normalized_name}' from file {file_id}")

    return jsonify({
        'id': file.id,
        'tags': [{'id': t.id, 'name': t.name} for t in file.tags]
    }), 200


@review_bp.route('/api/files/bulk/tags', methods=['POST'])
def bulk_add_tags():
    """
    Bulk add tags to multiple files.

    Request body:
        { file_ids: [1, 2, 3], tags: ["tag1"] }

    Returns:
        JSON with success count
    """
    data = request.get_json()

    if not data or 'file_ids' not in data or 'tags' not in data:
        return jsonify({'error': 'file_ids and tags arrays are required'}), 400

    if not isinstance(data['file_ids'], list) or not isinstance(data['tags'], list):
        return jsonify({'error': 'file_ids and tags must be arrays'}), 400

    success_count = 0
    files_updated = []

    # Get or create tags first (handle concurrent inserts)
    tags_to_add = []
    for tag_name in data['tags']:
        if not isinstance(tag_name, str) or not tag_name.strip():
            continue
        normalized_name = tag_name.strip().lower()
        tag = Tag.query.filter_by(name=normalized_name).first()
        if tag is None:
            try:
                tag = Tag(name=normalized_name, usage_count=0)
                db.session.add(tag)
                db.session.flush()
            except IntegrityError:
                db.session.rollback()
                tag = Tag.query.filter_by(name=normalized_name).first()
        tags_to_add.append(tag)

    # Add tags to each file
    for file_id in data['file_ids']:
        file = db.session.get(File, file_id)
        if file is None:
            continue

        for tag in tags_to_add:
            if tag not in file.tags:
                file.tags.append(tag)
                tag.usage_count += 1
                success_count += 1
                if file_id not in files_updated:
                    files_updated.append(file_id)

    db.session.commit()

    logger.info(f"Bulk added tags to {len(files_updated)} files")

    return jsonify({
        'success': True,
        'tags_added': success_count,
        'files_updated': len(files_updated)
    }), 200


@review_bp.route('/api/files/<int:file_id>/discard', methods=['POST'])
def discard_file(file_id):
    """
    Discard a single file (exclude from output).

    Discarding clears any review status since they are mutually exclusive states.

    Args:
        file_id: ID of the file

    Returns:
        JSON with updated file object
    """
    file = db.session.get(File, file_id)

    if file is None:
        return jsonify({'error': f'File {file_id} not found'}), 404

    # Discard clears review and duplicate status (mutually exclusive states)
    old_group_id = file.exact_group_id
    old_similar_group_id = file.similar_group_id
    file.discarded = True
    file.reviewed_at = None
    file.final_timestamp = None
    file.exact_group_id = None
    _clear_similar_fields(file)

    file_job_ids = [j.id for j in file.jobs]

    if old_group_id:
        _cleanup_exact_orphans({old_group_id}, job_ids=file_job_ids)
    if old_similar_group_id:
        _cleanup_similar_orphans({old_similar_group_id}, job_ids=file_job_ids)

    db.session.commit()

    logger.info(f"File {file_id} discarded")

    return jsonify({
        'id': file.id,
        'original_filename': file.original_filename,
        'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
        'final_timestamp': None,
        'timestamp_source': file.timestamp_source,
        'confidence': file.confidence.value,
        'reviewed_at': None,
        'discarded': True,
        'exact_group_id': file.exact_group_id
    }), 200


@review_bp.route('/api/files/<int:file_id>/discard', methods=['DELETE'])
def undiscard_file(file_id):
    """
    Undiscard a file (return to pending review state).

    Also re-evaluates duplicate status: if other non-discarded files
    share the same SHA256 hash, restores the duplicate group relationship.

    Args:
        file_id: ID of the file

    Returns:
        JSON with updated file object
    """
    file = db.session.get(File, file_id)

    if file is None:
        return jsonify({'error': f'File {file_id} not found'}), 404

    file.discarded = False

    # Re-evaluate duplicate status based on hash (scoped to same job(s))
    if file.file_hash_sha256:
        # Get job IDs this file belongs to
        file_job_ids = [j.id for j in file.jobs]

        # Find other non-discarded files with same hash IN THE SAME JOB(S)
        # Cross-job duplicates should be detected during import, not restore
        matching_files = File.query.join(File.jobs).filter(
            File.file_hash_sha256 == file.file_hash_sha256,
            File.discarded == False,
            File.id != file.id,
            Job.id.in_(file_job_ids)
        ).all()

        if matching_files:
            # Restore duplicate group for this file and all matching files
            file.exact_group_id = file.file_hash_sha256
            for match in matching_files:
                match.exact_group_id = file.file_hash_sha256
            logger.info(f"File {file_id} restored to duplicate group with {len(matching_files)} other file(s)")
        else:
            # No other non-discarded files with same hash in same job - not a duplicate
            file.exact_group_id = None

    db.session.commit()

    logger.info(f"File {file_id} undiscarded")

    return jsonify({
        'id': file.id,
        'original_filename': file.original_filename,
        'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
        'final_timestamp': file.final_timestamp.isoformat() if file.final_timestamp else None,
        'timestamp_source': file.timestamp_source,
        'confidence': file.confidence.value,
        'reviewed_at': file.reviewed_at.isoformat() if file.reviewed_at else None,
        'discarded': False,
        'exact_group_id': file.exact_group_id
    }), 200


@review_bp.route('/api/files/bulk/discard', methods=['POST'])
def bulk_discard():
    """
    Bulk discard files (exclude from output).

    Discarding clears any review status since they are mutually exclusive states.

    Request body:
        { file_ids: [1, 2, 3] }

    Returns:
        JSON with success count
    """
    data = request.get_json()

    if not data or 'file_ids' not in data:
        return jsonify({'error': 'file_ids array is required'}), 400

    if not isinstance(data['file_ids'], list):
        return jsonify({'error': 'file_ids must be an array'}), 400

    from app.lib.duplicates import accumulate_metadata

    success_count = 0
    affected_groups = set()
    affected_similar_groups = set()
    discard_ids = set(data['file_ids'])

    # Collect group memberships before discarding (needed for metadata accumulation)
    files_by_exact_group = {}   # group_id -> [File, ...]
    files_by_similar_group = {}  # group_id -> [File, ...]
    for file_id in data['file_ids']:
        file = db.session.get(File, file_id)
        if file is None:
            continue
        if file.exact_group_id:
            files_by_exact_group.setdefault(file.exact_group_id, []).append(file)
        if file.similar_group_id:
            files_by_similar_group.setdefault(file.similar_group_id, []).append(file)

    # Accumulate metadata from discarded files into kept files
    for group_id, discarded_in_group in files_by_exact_group.items():
        # Find the file(s) that will be kept (same group, not being discarded)
        kept_files = File.query.filter(
            File.exact_group_id == group_id,
            File.discarded == False,
            ~File.id.in_(discard_ids)
        ).all()
        for kept in kept_files:
            accumulate_metadata(kept, discarded_in_group)

    for group_id, discarded_in_group in files_by_similar_group.items():
        kept_files = File.query.filter(
            File.similar_group_id == group_id,
            File.discarded == False,
            ~File.id.in_(discard_ids)
        ).all()
        for kept in kept_files:
            accumulate_metadata(kept, discarded_in_group)

    # First pass: discard files and collect affected group IDs
    for file_id in data['file_ids']:
        file = db.session.get(File, file_id)
        if file is None:
            continue

        # Track which groups are affected
        if file.exact_group_id:
            affected_groups.add(file.exact_group_id)
        if file.similar_group_id:
            affected_similar_groups.add(file.similar_group_id)

        file.discarded = True
        file.reviewed_at = None
        file.final_timestamp = None
        file.exact_group_id = None
        _clear_similar_fields(file)
        success_count += 1

    # Collect job IDs from all discarded files for job-scoped cleanup
    affected_job_ids = set()
    for file_id in data['file_ids']:
        file = db.session.get(File, file_id)
        if file:
            affected_job_ids.update(j.id for j in file.jobs)

    _cleanup_exact_orphans(affected_groups, job_ids=affected_job_ids)
    _cleanup_similar_orphans(affected_similar_groups, job_ids=affected_job_ids)

    db.session.commit()

    logger.info(f"Bulk discarded {success_count} files")

    return jsonify({
        'success': True,
        'files_discarded': success_count
    }), 200


@review_bp.route('/api/files/bulk/undiscard', methods=['POST'])
def bulk_undiscard():
    """
    Bulk undiscard files (return to pending review state).

    Also re-evaluates duplicate status for each file: if other non-discarded
    files share the same SHA256 hash, restores the duplicate group relationship.

    Request body:
        { file_ids: [1, 2, 3] }

    Returns:
        JSON with success count and duplicate groups restored
    """
    data = request.get_json()

    if not data or 'file_ids' not in data:
        return jsonify({'error': 'file_ids array is required'}), 400

    if not isinstance(data['file_ids'], list):
        return jsonify({'error': 'file_ids must be an array'}), 400

    success_count = 0
    groups_restored = 0

    # First pass: undiscard all files
    files_to_process = []
    for file_id in data['file_ids']:
        file = db.session.get(File, file_id)
        if file is None:
            continue

        file.discarded = False
        files_to_process.append(file)
        success_count += 1

    # Second pass: re-evaluate duplicate status for each undiscarded file
    # We need to do this after all are undiscarded so they can match each other
    for file in files_to_process:
        if not file.file_hash_sha256:
            continue

        # Get job IDs this file belongs to
        file_job_ids = [j.id for j in file.jobs]

        # Find other non-discarded files with same hash IN THE SAME JOB(S)
        # Cross-job duplicates should be detected during import, not restore
        matching_files = File.query.join(File.jobs).filter(
            File.file_hash_sha256 == file.file_hash_sha256,
            File.discarded == False,
            File.id != file.id,
            Job.id.in_(file_job_ids)
        ).all()

        if matching_files:
            # Only count as restored if this file wasn't already in a group
            if not file.exact_group_id:
                groups_restored += 1

            # Restore duplicate group for this file and all matching files
            file.exact_group_id = file.file_hash_sha256
            for match in matching_files:
                match.exact_group_id = file.file_hash_sha256
        else:
            # No other non-discarded files with same hash in same job - not a duplicate
            file.exact_group_id = None

    db.session.commit()

    logger.info(f"Bulk undiscarded {success_count} files, restored {groups_restored} duplicate groups")

    return jsonify({
        'success': True,
        'files_undiscarded': success_count,
        'groups_restored': groups_restored
    }), 200


@review_bp.route('/api/files/bulk/not-duplicate', methods=['POST'])
def bulk_not_duplicate():
    """
    Remove files from their duplicate groups.

    Request body:
        { file_ids: [1, 2, 3] }

    Returns:
        JSON with success count
    """
    data = request.get_json()

    if not data or 'file_ids' not in data:
        return jsonify({'error': 'file_ids array is required'}), 400

    if not isinstance(data['file_ids'], list):
        return jsonify({'error': 'file_ids must be an array'}), 400

    success_count = 0
    affected_groups = set()

    for file_id in data['file_ids']:
        file = db.session.get(File, file_id)
        if file is None:
            continue

        if file.exact_group_id is not None:
            affected_groups.add(file.exact_group_id)
            file.exact_group_id = None
            success_count += 1

    _cleanup_exact_orphans(affected_groups)

    db.session.commit()

    logger.info(f"Removed {success_count} files from duplicate groups")

    return jsonify({
        'success': True,
        'files_updated': success_count
    }), 200


@review_bp.route('/api/duplicates/groups/<group_hash>/keep-all', methods=['POST'])
def keep_all_duplicates(group_hash):
    """
    Mark all files in a duplicate group as "not duplicates" (remove from group).

    This endpoint is used when the user determines that files flagged as duplicates
    are actually unique and should all be kept.

    Args:
        group_hash: The exact_group_id hash

    Returns:
        JSON with success status and affected file count
    """
    # Query all non-discarded files in this duplicate group
    files = File.query.filter_by(
        exact_group_id=group_hash,
        discarded=False
    ).all()

    if not files:
        return jsonify({'error': 'No files found in this duplicate group'}), 404

    affected_count = len(files)

    # Clear exact_group_id from all files
    for file in files:
        file.exact_group_id = None

        # Create UserDecision record for audit trail
        decision = UserDecision(
            file_id=file.id,
            decision_type='keep_all_duplicates',
            decision_value=json.dumps({
                'group_hash': group_hash,
                'action': 'keep_all',
                'reason': 'User determined files are not duplicates'
            })
        )
        db.session.add(decision)

    db.session.commit()

    logger.info(f"Kept all {affected_count} files from duplicate group {group_hash}")

    return jsonify({
        'success': True,
        'affected_count': affected_count
    }), 200


@review_bp.route('/api/similar-groups/<group_id>/resolve', methods=['POST'])
def resolve_similar_group(group_id):
    """
    Resolve a similar group by keeping selected files and discarding the rest.

    Body: { keep_file_ids: [int, ...] }
    Unlike exact duplicates (keep one), similar groups allow keeping multiple files.

    Args:
        group_id: The similar_group_id

    Returns:
        JSON with kept and discarded counts
    """
    data = request.get_json()
    keep_ids = set(data.get('keep_file_ids', []))

    if not keep_ids:
        return jsonify({'error': 'Must specify at least one file to keep'}), 400

    # Get all files in this similar group
    group_files = File.query.filter(
        File.similar_group_id == group_id,
        File.discarded == False
    ).all()

    if not group_files:
        return jsonify({'error': 'Group not found or already resolved'}), 404

    kept = 0
    discarded = 0

    for f in group_files:
        _clear_similar_fields(f)
        if f.id in keep_ids:
            kept += 1
        else:
            f.discarded = True
            discarded += 1

    db.session.commit()

    logger.info(f"Resolved similar group {group_id}: kept {kept}, discarded {discarded}")

    return jsonify({'kept': kept, 'discarded': discarded}), 200


@review_bp.route('/api/similar-groups/<group_id>/keep-all', methods=['POST'])
def keep_all_similar(group_id):
    """
    Keep all files in a similar group (mark as not similar).

    Args:
        group_id: The similar_group_id

    Returns:
        JSON with cleared count
    """
    group_files = File.query.filter(
        File.similar_group_id == group_id,
        File.discarded == False
    ).all()

    if not group_files:
        return jsonify({'error': 'Group not found'}), 404

    for f in group_files:
        _clear_similar_fields(f)

    db.session.commit()

    logger.info(f"Kept all {len(group_files)} files from similar group {group_id}")

    return jsonify({'cleared': len(group_files)}), 200


@review_bp.route('/api/files/bulk/not-similar', methods=['POST'])
def bulk_not_similar():
    """
    Remove files from similar groups (mark as not similar).

    Request body:
        { file_ids: [1, 2, 3] }

    Returns:
        JSON with cleared count
    """
    data = request.get_json()
    file_ids = data.get('file_ids', [])

    if not file_ids:
        return jsonify({'error': 'file_ids array is required'}), 400

    files = File.query.filter(File.id.in_(file_ids)).all()
    cleared = 0
    affected_groups = set()
    for f in files:
        if f.similar_group_id:
            affected_groups.add(f.similar_group_id)
            _clear_similar_fields(f)
            cleared += 1

    _cleanup_similar_orphans(affected_groups)

    db.session.commit()

    logger.info(f"Cleared similar group from {cleared} files")

    return jsonify({'cleared': cleared}), 200
