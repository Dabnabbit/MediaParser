"""Job status and control routes.

Provides endpoints for:
- Job status queries (GET /api/jobs/:id)
- Job control actions (POST /api/jobs/:id/control)
- Job file listings (GET /api/jobs/:id/files)
- Duplicate group queries (GET /api/jobs/:id/duplicates)
"""
from flask import Blueprint, jsonify, request, current_app
from datetime import datetime, timezone
import logging

from app import db
from app.models import Job, File, Duplicate, JobStatus, ConfidenceLevel
from app.tasks import enqueue_import_job

logger = logging.getLogger(__name__)

jobs_bp = Blueprint('jobs', __name__)


@jobs_bp.route('/api/jobs/<int:job_id>', methods=['GET'])
def get_job_status(job_id):
    """
    Get job status and details.

    Args:
        job_id: ID of the job to query

    Returns:
        JSON with job details including progress percentage
    """
    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Calculate progress percentage
    progress_percent = 0
    if job.progress_total > 0:
        progress_percent = int((job.progress_current / job.progress_total) * 100)

    # Format response
    response = {
        'id': job.id,
        'job_type': job.job_type,
        'status': job.status.value,
        'progress_current': job.progress_current,
        'progress_total': job.progress_total,
        'progress_percent': progress_percent,
        'current_filename': job.current_filename,
        'error_count': job.error_count,
        'error_message': job.error_message,
        'created_at': job.created_at.isoformat() if job.created_at else None,
        'started_at': job.started_at.isoformat() if job.started_at else None,
        'completed_at': job.completed_at.isoformat() if job.completed_at else None
    }

    return jsonify(response), 200


@jobs_bp.route('/api/jobs/<int:job_id>/control', methods=['POST'])
def control_job(job_id):
    """
    Control job execution (pause, cancel, resume).

    Args:
        job_id: ID of the job to control

    Request body:
        {action: 'pause' | 'cancel' | 'resume'}

    Returns:
        JSON with updated job status
    """
    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Get action from request
    data = request.get_json()
    if not data or 'action' not in data:
        return jsonify({'error': 'No action provided'}), 400

    action = data['action']

    # Validate action and current status
    if action == 'pause':
        if job.status != JobStatus.RUNNING:
            return jsonify({
                'error': f'Cannot pause job in {job.status.value} state',
                'allowed_states': ['running']
            }), 400

        job.status = JobStatus.PAUSED
        logger.info(f"Job {job_id} paused by user")

    elif action == 'cancel':
        if job.status not in (JobStatus.RUNNING, JobStatus.PAUSED, JobStatus.PENDING):
            return jsonify({
                'error': f'Cannot cancel job in {job.status.value} state',
                'allowed_states': ['running', 'paused', 'pending']
            }), 400

        job.status = JobStatus.CANCELLED
        job.completed_at = datetime.now(timezone.utc)
        logger.info(f"Job {job_id} cancelled by user")

    elif action == 'resume':
        if job.status != JobStatus.PAUSED:
            return jsonify({
                'error': f'Cannot resume job in {job.status.value} state',
                'allowed_states': ['paused']
            }), 400

        job.status = JobStatus.RUNNING
        # Re-enqueue the job to continue processing
        enqueue_import_job(job.id)
        logger.info(f"Job {job_id} resumed by user")

    else:
        return jsonify({
            'error': f'Unknown action: {action}',
            'allowed_actions': ['pause', 'cancel', 'resume']
        }), 400

    db.session.commit()

    # Return updated status
    return jsonify({
        'id': job.id,
        'status': job.status.value,
        'action': action,
        'success': True
    }), 200


@jobs_bp.route('/api/jobs/<int:job_id>/files', methods=['GET'])
def get_job_files(job_id):
    """
    Get files associated with a job with extended filtering and sorting.

    Args:
        job_id: ID of the job

    Query params:
        - confidence: Filter by confidence level(s) (high,medium,low,none - comma-separated)
        - reviewed: Filter by review status (true/false/any)
        - has_duplicates: Filter files in duplicate groups (true/false)
        - discarded: Filter by discarded status (true/false, default false to hide discarded)
        - sort: Sort field (detected_timestamp, original_timestamp, filename, file_size)
        - order: Sort order (asc, desc) - default asc
        - page: Page number (default: 1)
        - per_page: Results per page (default: 50, max: 200)
        - group_by: Group results by field (confidence)

    Returns:
        JSON with paginated file list
    """
    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Parse query parameters
    confidence_filter = request.args.get('confidence', '').lower()
    reviewed_filter = request.args.get('reviewed', '').lower()
    has_duplicates_filter = request.args.get('has_duplicates', '').lower()
    discarded_filter = request.args.get('discarded', 'false').lower()
    sort_field = request.args.get('sort', 'detected_timestamp').lower()
    sort_order = request.args.get('order', 'asc').lower()
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(200, max(1, int(request.args.get('per_page', 50))))
    group_by = request.args.get('group_by', '')

    # Build query
    query = db.session.query(File).join(
        Job.files
    ).filter(
        Job.id == job_id
    )

    # Apply confidence filter (supports multiple values comma-separated)
    if confidence_filter:
        confidence_values = [c.strip() for c in confidence_filter.split(',')]
        valid_levels = []
        for conf_value in confidence_values:
            try:
                valid_levels.append(ConfidenceLevel(conf_value))
            except ValueError:
                return jsonify({
                    'error': f'Invalid confidence level: {conf_value}',
                    'allowed_values': ['high', 'medium', 'low', 'none']
                }), 400
        if len(valid_levels) == 1:
            query = query.filter(File.confidence == valid_levels[0])
        else:
            query = query.filter(File.confidence.in_(valid_levels))

    # Apply reviewed filter
    if reviewed_filter == 'true':
        query = query.filter(File.reviewed_at.isnot(None))
    elif reviewed_filter == 'false':
        query = query.filter(File.reviewed_at.is_(None))
    # 'any' or empty means no filter

    # Apply has_duplicates filter
    if has_duplicates_filter == 'true':
        query = query.filter(File.duplicate_group_id.isnot(None))
    elif has_duplicates_filter == 'false':
        query = query.filter(File.duplicate_group_id.is_(None))

    # Apply discarded filter (default: hide discarded)
    if discarded_filter == 'false':
        query = query.filter(File.discarded == False)
    elif discarded_filter == 'true':
        query = query.filter(File.discarded == True)
    # 'any' shows all

    # Apply sorting
    sort_mapping = {
        'detected_timestamp': File.detected_timestamp,
        'original_timestamp': File.created_at,  # Use created_at as proxy for original timestamp
        'filename': File.original_filename,
        'file_size': File.file_size_bytes
    }
    sort_column = sort_mapping.get(sort_field, File.detected_timestamp)
    if sort_order == 'desc':
        query = query.order_by(sort_column.desc().nullslast())
    else:
        query = query.order_by(sort_column.asc().nullsfirst())

    # Group by confidence if requested
    if group_by == 'confidence':
        results = {}
        for level in ConfidenceLevel:
            level_query = query.filter(File.confidence == level)
            level_files = level_query.all()
            results[level.value] = [
                _serialize_file_extended(f)
                for f in level_files
            ]

        return jsonify({
            'job_id': job_id,
            'grouped_by': 'confidence',
            'groups': results,
            'total_files': sum(len(files) for files in results.values())
        }), 200

    # Paginate results
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    files_data = [_serialize_file_extended(f) for f in paginated.items]

    return jsonify({
        'job_id': job_id,
        'files': files_data,
        'page': page,
        'per_page': per_page,
        'total': paginated.total,
        'pages': paginated.pages
    }), 200


def _serialize_file_extended(f):
    """Serialize a File object with extended fields for the review grid."""
    return {
        'id': f.id,
        'original_filename': f.original_filename,
        'detected_timestamp': f.detected_timestamp.isoformat() if f.detected_timestamp else None,
        'final_timestamp': f.final_timestamp.isoformat() if f.final_timestamp else None,
        'timestamp_source': f.timestamp_source,
        'confidence': f.confidence.value,
        'file_hash': f.file_hash_sha256,
        'thumbnail_path': f.thumbnail_path,
        'file_size_bytes': f.file_size_bytes,
        'mime_type': f.mime_type,
        'reviewed_at': f.reviewed_at.isoformat() if f.reviewed_at else None,
        'is_duplicate': f.duplicate_group_id is not None,
        'discarded': f.discarded
    }


@jobs_bp.route('/api/jobs/<int:job_id>/duplicates', methods=['GET'])
def get_job_duplicates(job_id):
    """
    Get duplicate groups for files in a job.

    Args:
        job_id: ID of the job

    Returns:
        JSON with array of duplicate groups
    """
    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Group files in THIS job by SHA256 hash to find exact duplicates
    # Only considers files within the current job, not across all jobs
    duplicate_groups = {}

    for file in job.files:
        if not file.file_hash_sha256:
            continue

        hash_key = file.file_hash_sha256
        if hash_key not in duplicate_groups:
            duplicate_groups[hash_key] = []

        duplicate_groups[hash_key].append({
            'id': file.id,
            'original_filename': file.original_filename,
            'file_size_bytes': file.file_size_bytes,
            'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
            'storage_path': file.storage_path,
            'thumbnail_path': file.thumbnail_path
        })

    # Convert to array format, only including groups with 2+ files (actual duplicates)
    groups_array = [
        {
            'hash': hash_key,
            'match_type': 'exact',
            'files': files
        }
        for hash_key, files in duplicate_groups.items()
        if len(files) > 1
    ]

    return jsonify({
        'job_id': job_id,
        'duplicate_groups': groups_array,
        'group_count': len(groups_array),
        'total_duplicates': sum(len(g['files']) for g in groups_array)
    }), 200


@jobs_bp.route('/api/jobs/<int:job_id>/failed', methods=['GET'])
def get_job_failed_files(job_id):
    """
    Get files that failed processing for a job.

    Args:
        job_id: ID of the job

    Returns:
        JSON with array of failed files and their errors
    """
    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Get pagination params
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    # Query failed files (those with processing_error set)
    query = File.query.join(File.jobs).filter(
        Job.id == job_id,
        File.processing_error.isnot(None)
    ).order_by(File.original_filename)

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    files = [
        {
            'id': f.id,
            'original_filename': f.original_filename,
            'processing_error': f.processing_error,
            'thumbnail_path': f.thumbnail_path
        }
        for f in pagination.items
    ]

    return jsonify({
        'job_id': job_id,
        'files': files,
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
        'per_page': per_page
    }), 200


@jobs_bp.route('/api/jobs/<int:job_id>/auto-confirm-high', methods=['POST'])
def auto_confirm_high_confidence(job_id):
    """
    Auto-confirm all HIGH confidence files that haven't been reviewed yet.
    Sets final_timestamp = detected_timestamp for these files.

    Args:
        job_id: ID of the job

    Returns:
        JSON with count of confirmed files
    """
    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Find HIGH confidence files without review
    files_to_confirm = File.query.join(File.jobs).filter(
        Job.id == job_id,
        File.confidence == ConfidenceLevel.HIGH,
        File.reviewed_at.is_(None),
        File.detected_timestamp.isnot(None)
    ).all()

    confirmed_count = 0
    now = datetime.now(timezone.utc)

    for file in files_to_confirm:
        file.final_timestamp = file.detected_timestamp
        file.reviewed_at = now
        confirmed_count += 1

    if confirmed_count > 0:
        db.session.commit()
        logger.info(f"Auto-confirmed {confirmed_count} HIGH confidence files for job {job_id}")

    return jsonify({
        'job_id': job_id,
        'confirmed_count': confirmed_count,
        'success': True
    }), 200


@jobs_bp.route('/api/jobs/<int:job_id>/summary', methods=['GET'])
def get_job_summary(job_id):
    """
    Get summary counts for a job (for filter chips).

    Args:
        job_id: ID of the job

    Returns:
        JSON with counts for each filter category
    """
    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Base query for job files (excluding discarded by default)
    base_query = File.query.join(File.jobs).filter(
        Job.id == job_id,
        File.discarded == False
    )

    # Count by confidence level
    high_count = base_query.filter(File.confidence == ConfidenceLevel.HIGH).count()
    medium_count = base_query.filter(File.confidence == ConfidenceLevel.MEDIUM).count()
    low_count = base_query.filter(File.confidence == ConfidenceLevel.LOW).count()
    none_count = base_query.filter(File.confidence == ConfidenceLevel.NONE).count()

    # Reviewed count
    reviewed_count = base_query.filter(File.reviewed_at.isnot(None)).count()

    # Duplicates count (files in duplicate groups)
    duplicates_count = base_query.filter(File.duplicate_group_id.isnot(None)).count()

    # Failed count (including discarded files since failures should be visible)
    failed_query = File.query.join(File.jobs).filter(
        Job.id == job_id,
        File.processing_error.isnot(None)
    )
    failed_count = failed_query.count()

    # Total count (non-discarded files)
    total_count = base_query.count()

    return jsonify({
        'job_id': job_id,
        'high': high_count,
        'medium': medium_count,
        'low': low_count,
        'none': none_count,
        'reviewed': reviewed_count,
        'duplicates': duplicates_count,
        'failed': failed_count,
        'total': total_count
    }), 200
