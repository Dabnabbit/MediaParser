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

from app import db
from app.models import File, Tag, UserDecision, file_tags

logger = logging.getLogger(__name__)

review_bp = Blueprint('review', __name__)


@review_bp.route('/api/files/<int:file_id>', methods=['GET'])
def get_file_detail(file_id):
    """
    Get single file with full details including timestamp candidates.

    Args:
        file_id: ID of the file

    Returns:
        JSON with complete file details
    """
    file = db.session.get(File, file_id)

    if file is None:
        return jsonify({'error': f'File {file_id} not found'}), 404

    # Parse timestamp_candidates JSON
    timestamp_candidates = None
    if file.timestamp_candidates:
        try:
            timestamp_candidates = json.loads(file.timestamp_candidates)
        except json.JSONDecodeError:
            timestamp_candidates = None

    return jsonify({
        'id': file.id,
        'original_filename': file.original_filename,
        'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
        'final_timestamp': file.final_timestamp.isoformat() if file.final_timestamp else None,
        'timestamp_source': file.timestamp_source,
        'confidence': file.confidence.value,
        'reviewed_at': file.reviewed_at.isoformat() if file.reviewed_at else None,
        'timestamp_candidates': timestamp_candidates,
        'tags': [{'id': t.id, 'name': t.name} for t in file.tags],
        'file_size_bytes': file.file_size_bytes,
        'mime_type': file.mime_type,
        'thumbnail_path': file.thumbnail_path,
        'file_hash': file.file_hash_sha256,
        'discarded': file.discarded,
        'duplicate_group_id': file.duplicate_group_id
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
        'duplicate_group_id': file.duplicate_group_id
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
        'duplicate_group_id': file.duplicate_group_id
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

        # Find or create tag
        tag = Tag.query.filter_by(name=normalized_name).first()
        if tag is None:
            tag = Tag(name=normalized_name, usage_count=0)
            db.session.add(tag)
            db.session.flush()  # Get the ID

        # Add to file if not already present
        if tag not in file.tags:
            file.tags.append(tag)
            tag.usage_count += 1
            tags_added.append(normalized_name)

    db.session.commit()

    if tags_added:
        logger.info(f"Added tags {tags_added} to file {file_id}")

    return jsonify({
        'file_id': file.id,
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
        'file_id': file.id,
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

    # Get or create tags first
    tags_to_add = []
    for tag_name in data['tags']:
        if not isinstance(tag_name, str) or not tag_name.strip():
            continue
        normalized_name = tag_name.strip().lower()
        tag = Tag.query.filter_by(name=normalized_name).first()
        if tag is None:
            tag = Tag(name=normalized_name, usage_count=0)
            db.session.add(tag)
        tags_to_add.append(tag)

    db.session.flush()

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


@review_bp.route('/api/files/bulk/discard', methods=['POST'])
def bulk_discard():
    """
    Bulk discard files (exclude from output).

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

    for file_id in data['file_ids']:
        file = db.session.get(File, file_id)
        if file is None:
            continue

        file.discarded = True
        success_count += 1

    db.session.commit()

    logger.info(f"Bulk discarded {success_count} files")

    return jsonify({
        'success': True,
        'files_discarded': success_count
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

    for file_id in data['file_ids']:
        file = db.session.get(File, file_id)
        if file is None:
            continue

        if file.duplicate_group_id is not None:
            file.duplicate_group_id = None
            success_count += 1

    db.session.commit()

    logger.info(f"Removed {success_count} files from duplicate groups")

    return jsonify({
        'success': True,
        'files_updated': success_count
    }), 200
