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
    Get files associated with a job.

    Args:
        job_id: ID of the job

    Query params:
        - confidence: Filter by confidence level (high|medium|low|none)
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
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(200, max(1, int(request.args.get('per_page', 50))))
    group_by = request.args.get('group_by', '')

    # Build query
    query = db.session.query(File).join(
        Job.files
    ).filter(
        Job.id == job_id
    )

    # Apply confidence filter
    if confidence_filter:
        try:
            confidence_level = ConfidenceLevel(confidence_filter)
            query = query.filter(File.confidence == confidence_level)
        except ValueError:
            return jsonify({
                'error': f'Invalid confidence level: {confidence_filter}',
                'allowed_values': ['high', 'medium', 'low', 'none']
            }), 400

    # Group by confidence if requested
    if group_by == 'confidence':
        results = {}
        for level in ConfidenceLevel:
            level_files = query.filter(File.confidence == level).all()
            results[level.value] = [
                {
                    'id': f.id,
                    'original_filename': f.original_filename,
                    'detected_timestamp': f.detected_timestamp.isoformat() if f.detected_timestamp else None,
                    'timestamp_source': f.timestamp_source,
                    'confidence': f.confidence.value,
                    'file_hash_sha256': f.file_hash_sha256,
                    'thumbnail_path': f.thumbnail_path
                }
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

    files_data = [
        {
            'id': f.id,
            'original_filename': f.original_filename,
            'detected_timestamp': f.detected_timestamp.isoformat() if f.detected_timestamp else None,
            'timestamp_source': f.timestamp_source,
            'confidence': f.confidence.value,
            'file_hash_sha256': f.file_hash_sha256,
            'thumbnail_path': f.thumbnail_path
        }
        for f in paginated.items
    ]

    return jsonify({
        'job_id': job_id,
        'files': files_data,
        'page': page,
        'per_page': per_page,
        'total': paginated.total,
        'pages': paginated.pages
    }), 200


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
