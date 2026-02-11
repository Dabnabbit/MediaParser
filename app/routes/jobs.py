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
from app.models import Job, File, Duplicate, JobStatus, ConfidenceLevel, job_files
from app.tasks import enqueue_import_job
from app.lib.duplicates import recommend_best_duplicate, get_quality_metrics

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
    Get files associated with a job with mode-based filtering.

    Args:
        job_id: ID of the job

    Query params:
        - mode: Workflow mode (duplicates, unreviewed, reviewed, discarded, failed)
        - confidence: Filter by confidence level(s) (high,medium,low,none - comma-separated)
        - tag: Filter by tag name (exact match)
        - sort: Sort field (detected_timestamp, original_timestamp, filename, file_size)
        - order: Sort order (asc, desc) - default asc
        - offset: Start position for window (preferred over page)
        - limit: Window size (default: 50, max: 200)
        - page: Page number (legacy, use offset instead)
        - per_page: Results per page (legacy, use limit instead)
        - group_by: Group results by field (confidence)

    Returns:
        JSON with file list (offset mode returns offset/limit/total, page mode returns page/per_page/pages/total)
    """
    from app.models import Tag

    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Parse query parameters
    mode = request.args.get('mode', 'unreviewed').lower()
    confidence_filter = request.args.get('confidence', '').lower()
    tag_filter = request.args.get('tag', '').strip()
    sort_field = request.args.get('sort', 'detected_timestamp').lower()
    sort_order = request.args.get('order', 'asc').lower()
    group_by = request.args.get('group_by', '')

    # Support both offset/limit (preferred) and page/per_page (legacy)
    offset = request.args.get('offset', type=int)
    limit = request.args.get('limit', type=int)
    use_offset_mode = offset is not None

    if use_offset_mode:
        offset = max(0, offset)
        limit = max(1, limit or 50)
    else:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(200, max(1, int(request.args.get('per_page', 50))))

    # Build base query
    query = db.session.query(File).join(
        Job.files
    ).filter(
        Job.id == job_id
    )

    # Apply mode-based filtering (mutually exclusive workflow states)
    valid_modes = ['duplicates', 'similar', 'unreviewed', 'reviewed', 'discarded', 'failed']
    if mode not in valid_modes:
        return jsonify({
            'error': f'Invalid mode: {mode}',
            'valid_modes': valid_modes
        }), 400

    if mode == 'duplicates':
        # Files in duplicate groups that aren't discarded or failed
        query = query.filter(
            File.exact_group_id.isnot(None),
            File.discarded == False,
            File.processing_error.is_(None)
        )
    elif mode == 'similar':
        # Files in similar groups that aren't discarded or failed
        query = query.filter(
            File.similar_group_id.isnot(None),
            File.discarded == False,
            File.processing_error.is_(None)
        )
    elif mode == 'unreviewed':
        # Files not yet reviewed, not discarded, not failed, not in groups
        query = query.filter(
            File.reviewed_at.is_(None),
            File.discarded == False,
            File.processing_error.is_(None),
            File.exact_group_id.is_(None),
            File.similar_group_id.is_(None)
        )
    elif mode == 'reviewed':
        # Reviewed files (not discarded or failed)
        query = query.filter(
            File.reviewed_at.isnot(None),
            File.discarded == False,
            File.processing_error.is_(None)
        )
    elif mode == 'discarded':
        # Discarded files
        query = query.filter(File.discarded == True)
    elif mode == 'failed':
        # Files with processing errors
        query = query.filter(File.processing_error.isnot(None))

    # Apply tag filter
    if tag_filter:
        query = query.join(File.tags).filter(Tag.name == tag_filter)

    # Snapshot query before confidence filter — used for per-level counts
    base_mode_query_all = query

    # Apply confidence filter within the mode
    # In group modes, filter on the group confidence (string column) instead of
    # the timestamp confidence (enum column)
    if confidence_filter:
        confidence_values = [c.strip() for c in confidence_filter.split(',')]
        if mode == 'duplicates':
            valid_string_levels = [v for v in confidence_values if v in ('high', 'medium', 'low')]
            if valid_string_levels:
                query = query.filter(File.exact_group_confidence.in_(valid_string_levels))
        elif mode == 'similar':
            valid_string_levels = [v for v in confidence_values if v in ('high', 'medium', 'low')]
            if valid_string_levels:
                query = query.filter(File.similar_group_confidence.in_(valid_string_levels))
        else:
            valid_levels = []
            for conf_value in confidence_values:
                try:
                    valid_levels.append(ConfidenceLevel(conf_value))
                except ValueError:
                    return jsonify({
                        'error': f'Invalid confidence level: {conf_value}',
                        'allowed_values': ['high', 'medium', 'low', 'none']
                    }), 400
            if valid_levels:
                query = query.filter(File.confidence.in_(valid_levels))

    # Apply sorting - discarded files always sort to end
    sort_mapping = {
        'detected_timestamp': File.detected_timestamp,
        'original_timestamp': File.created_at,  # Use created_at as proxy for original timestamp
        'filename': File.original_filename,
        'file_size': File.file_size_bytes
    }
    sort_column = sort_mapping.get(sort_field, File.detected_timestamp)
    # Primary sort: discarded=False first (0), discarded=True last (1)
    # Secondary sort: user's chosen field
    if sort_order == 'desc':
        query = query.order_by(File.discarded.asc(), sort_column.desc().nullslast())
    else:
        query = query.order_by(File.discarded.asc(), sort_column.asc().nullsfirst())

    # Pre-compute recommended file IDs for duplicate/similar modes
    recommended_ids = set()
    if mode in ('duplicates', 'similar'):
        group_field = File.exact_group_id if mode == 'duplicates' else File.similar_group_id
        group_files_query = db.session.query(File).join(File.jobs).filter(
            Job.id == job_id,
            group_field.isnot(None),
            File.discarded == False
        ).all()

        # Group files by their group ID
        from collections import defaultdict
        groups_map = defaultdict(list)
        for gf in group_files_query:
            gid = gf.exact_group_id if mode == 'duplicates' else gf.similar_group_id
            groups_map[gid].append(gf)

        # Compute recommendation per group using dicts with quality metrics
        for gid, group_file_objs in groups_map.items():
            if len(group_file_objs) < 2:
                continue
            file_dicts = []
            for gf in group_file_objs:
                fd = {'id': gf.id, 'file_size_bytes': gf.file_size_bytes}
                metrics = get_quality_metrics(gf)
                fd.update(metrics)
                file_dicts.append(fd)
            rec_id = recommend_best_duplicate(file_dicts)
            if rec_id is not None:
                recommended_ids.add(rec_id)

    # Group by confidence if requested
    if group_by == 'confidence':
        results = {}
        for level in ConfidenceLevel:
            level_query = query.filter(File.confidence == level)
            level_files = level_query.all()
            results[level.value] = [
                _serialize_file_extended(f, is_recommended=(f.id in recommended_ids))
                for f in level_files
            ]

        return jsonify({
            'job_id': job_id,
            'grouped_by': 'confidence',
            'groups': results,
            'total_files': sum(len(files) for files in results.values())
        }), 200

    # Get total count for slider
    total_count = query.count()

    # Calculate counts by confidence level within current mode's result set
    # Use the mode-appropriate confidence field for counting
    if mode == 'duplicates':
        # Count on the unfiltered-by-confidence query (base mode query before confidence filter)
        base_mode_query = db.session.query(File).join(Job.files).filter(
            Job.id == job_id,
            File.exact_group_id.isnot(None),
            File.discarded == False
        )
        mode_counts = {
            'high': base_mode_query.filter(File.exact_group_confidence == 'high').count(),
            'medium': base_mode_query.filter(File.exact_group_confidence == 'medium').count(),
            'low': base_mode_query.filter(File.exact_group_confidence == 'low').count(),
            'none': 0,
        }
    elif mode == 'similar':
        base_mode_query = db.session.query(File).join(Job.files).filter(
            Job.id == job_id,
            File.similar_group_id.isnot(None),
            File.discarded == False
        )
        mode_counts = {
            'high': base_mode_query.filter(File.similar_group_confidence == 'high').count(),
            'medium': base_mode_query.filter(File.similar_group_confidence == 'medium').count(),
            'low': base_mode_query.filter(File.similar_group_confidence == 'low').count(),
            'none': 0,
        }
    else:
        mode_counts = {
            'high': base_mode_query_all.filter(File.confidence == ConfidenceLevel.HIGH).count(),
            'medium': base_mode_query_all.filter(File.confidence == ConfidenceLevel.MEDIUM).count(),
            'low': base_mode_query_all.filter(File.confidence == ConfidenceLevel.LOW).count(),
            'none': base_mode_query_all.filter(File.confidence == ConfidenceLevel.NONE).count(),
        }

    # Calculate mode counts (for mode selector display)
    base_query = File.query.join(File.jobs).filter(Job.id == job_id)
    mode_totals = {
        'duplicates': base_query.filter(
            File.exact_group_id.isnot(None),
            File.discarded == False
        ).count(),
        'similar': base_query.filter(
            File.similar_group_id.isnot(None),
            File.discarded == False
        ).count(),
        'unreviewed': base_query.filter(
            File.reviewed_at.is_(None),
            File.discarded == False,
            File.exact_group_id.is_(None),
            File.similar_group_id.is_(None)
        ).count(),
        'reviewed': base_query.filter(
            File.reviewed_at.isnot(None),
            File.discarded == False
        ).count(),
        'discards': base_query.filter(File.discarded == True).count(),
        'failed': base_query.filter(File.processing_error.isnot(None)).count(),
        'total': base_query.count()
    }

    # Apply offset/limit or pagination
    if use_offset_mode:
        files = query.offset(offset).limit(limit).all()
        files_data = [_serialize_file_extended(f, is_recommended=(f.id in recommended_ids)) for f in files]

        return jsonify({
            'job_id': job_id,
            'mode': mode,
            'files': files_data,
            'offset': offset,
            'limit': limit,
            'total': total_count,
            'mode_counts': mode_counts,
            'mode_totals': mode_totals
        }), 200
    else:
        # Legacy pagination mode
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        files_data = [_serialize_file_extended(f, is_recommended=(f.id in recommended_ids)) for f in paginated.items]

        return jsonify({
            'job_id': job_id,
            'mode': mode,
            'files': files_data,
            'page': page,
            'per_page': per_page,
            'total': paginated.total,
            'pages': paginated.pages,
            'mode_totals': mode_totals
        }), 200


def _serialize_file_extended(f, is_recommended=False):
    """Serialize a File object with extended fields for the review grid."""
    return {
        'id': f.id,
        'original_filename': f.original_filename,
        'original_path': f.original_path,  # Full resolution image path
        'detected_timestamp': f.detected_timestamp.isoformat() if f.detected_timestamp else None,
        'final_timestamp': f.final_timestamp.isoformat() if f.final_timestamp else None,
        'timestamp_source': f.timestamp_source,
        'confidence': f.confidence.value,
        'file_hash': f.file_hash_sha256,
        'thumbnail_path': f.thumbnail_path,
        'file_size_bytes': f.file_size_bytes,
        'mime_type': f.mime_type,
        'reviewed_at': f.reviewed_at.isoformat() if f.reviewed_at else None,
        'is_duplicate': f.exact_group_id is not None,
        'exact_group_id': f.exact_group_id,
        'is_similar': f.similar_group_id is not None,
        'similar_group_id': f.similar_group_id,
        'similar_group_type': f.similar_group_type,
        'discarded': f.discarded,
        'is_recommended': is_recommended,
        'exact_group_confidence': f.exact_group_confidence,
        'similar_group_confidence': f.similar_group_confidence,
        'processing_error': f.processing_error,
        'image_width': f.image_width,
        'image_height': f.image_height
    }


@jobs_bp.route('/api/jobs/<int:job_id>/duplicates', methods=['GET'])
def get_job_duplicates(job_id):
    """
    Get duplicate groups for files in a job (both SHA256 and perceptual exact matches).

    Groups by exact_group_id — the canonical group key set by both SHA256 detection
    and perceptual exact detection. Determines match_type per group by checking
    whether all members share the same SHA256 hash.

    Args:
        job_id: ID of the job

    Returns:
        JSON with array of duplicate groups with match_type and confidence
    """
    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    # Single-pass grouping by exact_group_id (covers both SHA256 and perceptual)
    group_files = {}   # group_id -> [file_dict, ...]
    group_objs = {}    # group_id -> [File, ...] (for recommend_best_duplicate)

    for file in job.files:
        if not file.exact_group_id or file.discarded:
            continue

        gid = file.exact_group_id

        # Build file dict with basic info
        file_dict = {
            'id': file.id,
            'original_filename': file.original_filename,
            'file_size_bytes': file.file_size_bytes,
            'detected_timestamp': file.detected_timestamp.isoformat() if file.detected_timestamp else None,
            'storage_path': file.storage_path,
            'thumbnail_path': file.thumbnail_path
        }

        # Get quality metrics and merge into file dict
        metrics = get_quality_metrics(file)
        file_dict.update(metrics)

        group_files.setdefault(gid, []).append(file_dict)
        group_objs.setdefault(gid, []).append(file)

    # Build groups array (only groups with 2+ files)
    groups_array = []
    for gid, files in group_files.items():
        if len(files) < 2:
            continue

        file_objs = group_objs[gid]

        # Determine match_type: sha256 if all members share the same hash, else perceptual
        sha256s = set(f.file_hash_sha256 for f in file_objs if f.file_hash_sha256)
        match_type = 'sha256' if len(sha256s) == 1 else 'perceptual'

        # Get recommendation for which file to keep (use dicts with quality metrics)
        recommended_id = recommend_best_duplicate(files)

        # Calculate group-level aggregates
        total_size_bytes = sum(f.get('file_size_bytes', 0) for f in files)
        resolutions = [f.get('resolution_mp') for f in files if f.get('resolution_mp') is not None]
        best_resolution_mp = max(resolutions) if resolutions else None

        groups_array.append({
            'hash': gid,
            'match_type': match_type,
            'confidence': 'high',
            'file_count': len(files),
            'files': files,
            'recommended_id': recommended_id,
            'total_size_bytes': total_size_bytes,
            'best_resolution_mp': best_resolution_mp
        })

    return jsonify({
        'job_id': job_id,
        'duplicate_groups': groups_array,
        'group_count': len(groups_array),
        'total_duplicates': sum(len(g['files']) for g in groups_array)
    }), 200


@jobs_bp.route('/api/jobs/<int:job_id>/similar-groups', methods=['GET'])
def get_similar_groups(job_id):
    """
    Return similar file groups (burst, panorama, perceptual matches).

    Args:
        job_id: ID of the job

    Returns:
        JSON with array of similar groups with type, confidence, and quality metrics
    """
    job = db.session.get(Job, job_id)

    if not job:
        return jsonify({'error': 'Job not found'}), 404

    # Get all non-discarded files with similar_group_id
    files = File.query.join(File.jobs).filter(
        Job.id == job_id,
        File.similar_group_id.isnot(None),
        File.discarded == False
    ).all()

    # Group by similar_group_id
    groups = {}
    for f in files:
        gid = f.similar_group_id
        if gid not in groups:
            groups[gid] = {
                'group_id': gid,
                'group_type': f.similar_group_type or 'similar',
                'confidence': f.similar_group_confidence or 'medium',
                'files': [],
                'recommended_id': None
            }

        # Build file dict with extended info
        file_dict = {
            'id': f.id,
            'original_filename': f.original_filename,
            'file_size_bytes': f.file_size_bytes,
            'detected_timestamp': f.detected_timestamp.isoformat() if f.detected_timestamp else None,
            'storage_path': f.storage_path,
            'thumbnail_path': f.thumbnail_path
        }

        # Get quality metrics and merge into file dict
        metrics = get_quality_metrics(f)
        file_dict.update(metrics)

        groups[gid]['files'].append(file_dict)

    # Filter to groups with 2+ files, add recommendations
    result = []
    for gid, group in groups.items():
        if len(group['files']) >= 2:
            # Use dicts with quality metrics for recommendation
            group['recommended_id'] = recommend_best_duplicate(group['files'])
            result.append(group)

    return jsonify({'similar_groups': result}), 200


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


@jobs_bp.route('/api/jobs/<int:job_id>/bulk-review', methods=['POST'])
def bulk_review(job_id):
    """
    Bulk review files with various scopes and actions.

    Args:
        job_id: ID of the job

    Request body:
        {
            action: 'accept_review' | 'mark_reviewed' | 'clear_review',
            scope: 'selection' | 'filtered' | 'confidence',
            file_ids: [1, 2, 3] (for scope='selection'),
            confidence_level: 'high' | 'medium' | 'low' | 'none' (for scope='confidence'),
            filter_params: {...} (for scope='filtered')
        }

    Returns:
        JSON with count of affected files
    """
    from sqlalchemy import or_

    job = db.session.get(Job, job_id)

    if job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    action = data.get('action')
    scope = data.get('scope')

    valid_actions = ['accept_review', 'mark_reviewed', 'clear_review']
    valid_scopes = ['selection', 'filtered', 'confidence']

    if action not in valid_actions:
        return jsonify({
            'error': f'Invalid action: {action}',
            'valid_actions': valid_actions
        }), 400

    if scope not in valid_scopes:
        return jsonify({
            'error': f'Invalid scope: {scope}',
            'valid_scopes': valid_scopes
        }), 400

    # Build query based on scope
    query = File.query.join(File.jobs).filter(
        Job.id == job_id,
        File.discarded == False
    )

    if scope == 'selection':
        file_ids = data.get('file_ids', [])
        if not file_ids:
            return jsonify({'error': 'file_ids required for selection scope'}), 400
        query = query.filter(File.id.in_(file_ids))

    elif scope == 'confidence':
        confidence_level = data.get('confidence_level')
        if not confidence_level:
            return jsonify({'error': 'confidence_level required for confidence scope'}), 400
        try:
            level = ConfidenceLevel(confidence_level)
        except ValueError:
            return jsonify({
                'error': f'Invalid confidence level: {confidence_level}',
                'valid_levels': ['high', 'medium', 'low', 'none']
            }), 400
        query = query.filter(File.confidence == level)

    elif scope == 'filtered':
        # Apply the same filters as the /api/jobs/:id/files endpoint
        filter_params = data.get('filter_params', {})

        # Confidence filter
        confidence_filter = filter_params.get('confidence', '')
        if confidence_filter:
            confidence_values = [c.strip() for c in confidence_filter.split(',')]
            valid_levels = []
            for conf_value in confidence_values:
                try:
                    valid_levels.append(ConfidenceLevel(conf_value))
                except ValueError:
                    pass
            if valid_levels:
                query = query.filter(File.confidence.in_(valid_levels))

        # Reviewed filter
        reviewed_filter = filter_params.get('reviewed', '')
        if reviewed_filter == 'include':
            pass  # No filter needed - include all
        elif reviewed_filter == 'exclude':
            query = query.filter(File.reviewed_at.is_(None))

        # Duplicates filter
        has_duplicates = filter_params.get('has_duplicates', '')
        if has_duplicates == 'include':
            pass
        elif has_duplicates == 'exclude':
            query = query.filter(File.exact_group_id.is_(None))

        # Failed filter
        failed_filter = filter_params.get('failed', '')
        if failed_filter == 'include':
            pass
        elif failed_filter == 'exclude':
            query = query.filter(File.processing_error.is_(None))

    # Get matching files
    files = query.all()

    if not files:
        return jsonify({
            'job_id': job_id,
            'action': action,
            'scope': scope,
            'affected_count': 0,
            'success': True
        }), 200

    now = datetime.now(timezone.utc)
    affected_count = 0

    for file in files:
        if action == 'accept_review':
            # Accept detected timestamp and mark as reviewed
            # Skip files without detected_timestamp
            if file.detected_timestamp:
                file.final_timestamp = file.detected_timestamp
                file.reviewed_at = now
                affected_count += 1

        elif action == 'mark_reviewed':
            # Just mark as reviewed without changing timestamp
            if not file.reviewed_at:
                file.reviewed_at = now
                # If no final_timestamp, use detected_timestamp
                if not file.final_timestamp and file.detected_timestamp:
                    file.final_timestamp = file.detected_timestamp
                affected_count += 1

        elif action == 'clear_review':
            # Clear review status
            if file.reviewed_at:
                file.reviewed_at = None
                file.final_timestamp = None
                affected_count += 1

    if affected_count > 0:
        db.session.commit()
        logger.info(f"Bulk {action} for job {job_id}: {affected_count} files affected")

    return jsonify({
        'job_id': job_id,
        'action': action,
        'scope': scope,
        'affected_count': affected_count,
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

    # Base query for all job files
    base_query = File.query.join(File.jobs).filter(Job.id == job_id)

    # Mode counts (for mode selector) — failed files excluded from all workflow modes
    duplicates_count = base_query.filter(
        File.exact_group_id.isnot(None),
        File.discarded == False,
        File.processing_error.is_(None)
    ).count()

    # Exact duplicate groups count
    exact_groups = db.session.query(File.exact_group_id).join(
        job_files, File.id == job_files.c.file_id
    ).filter(
        job_files.c.job_id == job_id,
        File.exact_group_id.isnot(None),
        File.discarded == False,
        File.processing_error.is_(None)
    ).distinct().count()

    # Similar files count (for mode selector) and groups count
    similar_count = base_query.filter(
        File.similar_group_id.isnot(None),
        File.discarded == False,
        File.processing_error.is_(None)
    ).count()

    similar_groups = db.session.query(File.similar_group_id).join(
        job_files, File.id == job_files.c.file_id
    ).filter(
        job_files.c.job_id == job_id,
        File.similar_group_id.isnot(None),
        File.discarded == False,
        File.processing_error.is_(None)
    ).distinct().count()

    unreviewed_count = base_query.filter(
        File.reviewed_at.is_(None),
        File.discarded == False,
        File.processing_error.is_(None),
        File.exact_group_id.is_(None),
        File.similar_group_id.is_(None)
    ).count()

    reviewed_count = base_query.filter(
        File.reviewed_at.isnot(None),
        File.discarded == False,
        File.processing_error.is_(None)
    ).count()

    discards_count = base_query.filter(File.discarded == True).count()

    failed_count = base_query.filter(File.processing_error.isnot(None)).count()

    # Confidence counts (across non-discarded, non-failed files)
    non_discarded = base_query.filter(File.discarded == False, File.processing_error.is_(None))
    high_count = non_discarded.filter(File.confidence == ConfidenceLevel.HIGH).count()
    medium_count = non_discarded.filter(File.confidence == ConfidenceLevel.MEDIUM).count()
    low_count = non_discarded.filter(File.confidence == ConfidenceLevel.LOW).count()
    none_count = non_discarded.filter(File.confidence == ConfidenceLevel.NONE).count()

    # Total count
    total_count = base_query.count()

    return jsonify({
        'job_id': job_id,
        # Mode counts
        'duplicates': duplicates_count,
        'exact_duplicate_groups': exact_groups,
        'similar': similar_count,
        'similar_groups': similar_groups,
        'unreviewed': unreviewed_count,
        'reviewed': reviewed_count,
        'discards': discards_count,
        'failed': failed_count,
        # Confidence counts
        'high': high_count,
        'medium': medium_count,
        'low': low_count,
        'none': none_count,
        # Total
        'total': total_count
    }), 200


@jobs_bp.route('/api/jobs/<int:job_id>/export', methods=['POST'])
def trigger_export(job_id):
    """
    Trigger export for a completed import job.

    Creates a new export job linked to the same files as the import job,
    then enqueues it for processing by the Huey worker.

    Validates that duplicate groups have been resolved before export.

    Args:
        job_id: ID of the completed import job

    Request body (optional):
        {
            'force': bool  # Skip duplicate validation if true
        }

    Returns:
        JSON with new export job details
    """
    from app.tasks import enqueue_export_job
    from collections import defaultdict

    # Verify source job exists and is an import job
    source_job = db.session.get(Job, job_id)

    if source_job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    if source_job.job_type != 'import':
        return jsonify({
            'error': 'Export can only be triggered from import jobs',
            'job_type': source_job.job_type
        }), 400

    if source_job.status != JobStatus.COMPLETED:
        return jsonify({
            'error': f'Cannot export from job in {source_job.status.value} state',
            'required_status': 'completed'
        }), 400

    # Check for unresolved duplicates (unless force=true)
    data = (request.get_json() if request.is_json else {}) or {}
    force = data.get('force', False)

    if not force:
        # Check for unresolved exact duplicates
        exact_groups = defaultdict(list)
        for f in source_job.files:
            if f.exact_group_id and not f.discarded:
                exact_groups[f.exact_group_id].append(f)

        unresolved_exact = sum(1 for files in exact_groups.values() if len(files) > 1)

        # Check for unresolved similar groups
        similar_groups = defaultdict(list)
        for f in source_job.files:
            if f.similar_group_id and not f.discarded:
                similar_groups[f.similar_group_id].append(f)

        unresolved_similar = sum(1 for files in similar_groups.values() if len(files) > 1)

        if unresolved_exact > 0 or unresolved_similar > 0:
            return jsonify({
                'error': 'Unresolved duplicate groups found',
                'unresolved_exact_groups': unresolved_exact,
                'unresolved_similar_groups': unresolved_similar,
                'message': 'Please resolve duplicates before export, or use force=true to override'
            }), 400

    # Create new export job
    export_job = Job(
        job_type='export',
        status=JobStatus.PENDING
    )
    db.session.add(export_job)
    db.session.flush()  # Get the ID

    # Associate the same files as the import job
    export_job.files = source_job.files

    # Count non-discarded files for reporting
    file_count = sum(1 for f in export_job.files if not f.discarded)

    db.session.commit()

    # Enqueue the export job
    task_id = enqueue_export_job(export_job.id)

    logger.info(f"Export job {export_job.id} created and enqueued for import job {job_id} ({file_count} files)")

    return jsonify({
        'job_id': export_job.id,
        'status': 'queued',
        'file_count': file_count,
        'task_id': task_id
    }), 200


@jobs_bp.route('/api/jobs/<int:job_id>/finalize', methods=['POST'])
def finalize_job(job_id):
    """
    Finalize a completed export job: delete working data, keep output.

    Deletes source files (browser uploads only), thumbnails, and all DB records
    for the job. Output files in storage/output/ are preserved.

    Args:
        job_id: ID of the export job

    Returns:
        JSON with finalize stats
    """
    import os
    from app.models import UserDecision, Tag, Setting, file_tags
    from app.routes.upload import get_import_root

    # Verify job exists and is a completed export job
    export_job = db.session.get(Job, job_id)

    if export_job is None:
        return jsonify({'error': f'Job {job_id} not found'}), 404

    if export_job.job_type != 'export':
        return jsonify({
            'error': 'Finalize only available for export jobs',
            'job_type': export_job.job_type
        }), 400

    if export_job.status != JobStatus.COMPLETED:
        return jsonify({
            'error': f'Cannot finalize job in {export_job.status.value} state',
            'required_status': 'completed'
        }), 400

    # Read cleanup options from request body (defaults match previous behavior)
    options = request.get_json(silent=True) or {}
    clean_working_files = options.get('clean_working_files', True)
    delete_sources = options.get('delete_sources', False)
    clear_database = options.get('clear_database', True)

    # Resolve output directory before cleanup (Setting table is not deleted)
    output_dir_setting = Setting.query.filter_by(key='output_directory').first()
    output_directory = output_dir_setting.value if output_dir_setting else str(current_app.config['OUTPUT_FOLDER'])

    # Collect file IDs from this export job
    file_ids = [f.id for f in export_job.files]
    if not file_ids:
        return jsonify({'error': 'No files associated with export job'}), 400

    # Find the associated import job via job_files table
    import_job_id_row = db.session.query(job_files.c.job_id).join(
        Job, Job.id == job_files.c.job_id
    ).filter(
        job_files.c.file_id.in_(file_ids),
        Job.job_type == 'import'
    ).first()

    import_job_id = import_job_id_row[0] if import_job_id_row else None

    # Determine if browser upload (we own the files) vs server-path import
    is_browser_upload = True
    if import_job_id:
        import_root = get_import_root(import_job_id)
        is_browser_upload = import_root is None

    stats = {
        'sources_deleted': 0,
        'sources_kept': 0,
        'sources_failed': 0,
        'thumbnails_deleted': 0,
        'db_records_deleted': 0,
        'options_applied': {
            'clean_working_files': clean_working_files,
            'delete_sources': delete_sources,
            'clear_database': clear_database
        }
    }

    # Collect ALL files (export + import) for full cleanup.
    # Export job only has reviewed files; import job also has discarded/failed files.
    all_files = {f.id: f for f in export_job.files}
    if import_job_id:
        import_job_for_cleanup = Job.query.get(import_job_id)
        if import_job_for_cleanup:
            for f in import_job_for_cleanup.files:
                all_files.setdefault(f.id, f)
    all_file_ids = set(all_files.keys())

    # 1. Delete source files based on options
    for file_obj in all_files.values():
        should_delete = False
        if is_browser_upload and file_obj.storage_path:
            # Browser uploads: clean_working_files deletes uploaded copies
            should_delete = clean_working_files or delete_sources
        elif not is_browser_upload and file_obj.storage_path:
            # Server-path imports: only delete originals if explicitly requested
            should_delete = delete_sources

        if should_delete:
            try:
                if os.path.exists(file_obj.storage_path):
                    os.unlink(file_obj.storage_path)
                    stats['sources_deleted'] += 1
                else:
                    stats['sources_kept'] += 1
            except Exception as e:
                stats['sources_failed'] += 1
                logger.error(f"Failed to delete source {file_obj.storage_path}: {e}")
        else:
            stats['sources_kept'] += 1

    # 2. Delete thumbnails (only if clean_working_files)
    if clean_working_files:
        for file_id in all_file_ids:
            thumb_path = os.path.join('storage', 'thumbnails', f'{file_id}_thumb.jpg')
            try:
                if os.path.exists(thumb_path):
                    os.unlink(thumb_path)
                    stats['thumbnails_deleted'] += 1
            except Exception as e:
                logger.warning(f"Failed to delete thumbnail {thumb_path}: {e}")

    # 3. Delete empty upload directory (only if clean_working_files + browser uploads)
    if clean_working_files and is_browser_upload and import_job_id:
        upload_dir = os.path.join('storage', 'uploads', f'job_{import_job_id}')
        try:
            if os.path.isdir(upload_dir) and not os.listdir(upload_dir):
                os.rmdir(upload_dir)
                logger.info(f"Removed empty upload directory: {upload_dir}")
        except Exception as e:
            logger.warning(f"Failed to remove upload directory {upload_dir}: {e}")

    # 4. Delete DB records in FK order (only if clear_database)
    #    Use all_file_ids to include discarded/failed files from import job
    if clear_database:
        all_db_file_ids = list(all_file_ids)
        try:
            # UserDecision → references File
            deleted = UserDecision.query.filter(UserDecision.file_id.in_(all_db_file_ids)).delete(synchronize_session=False)
            stats['db_records_deleted'] += deleted

            # file_tags → references File and Tag
            deleted = db.session.execute(
                file_tags.delete().where(file_tags.c.file_id.in_(all_db_file_ids))
            ).rowcount
            stats['db_records_deleted'] += deleted

            # Duplicate → references File (both columns)
            deleted = Duplicate.query.filter(
                db.or_(Duplicate.file_id.in_(all_db_file_ids), Duplicate.duplicate_of_id.in_(all_db_file_ids))
            ).delete(synchronize_session=False)
            stats['db_records_deleted'] += deleted

            # job_files → references Job and File
            job_ids_to_delete = [job_id]
            if import_job_id:
                job_ids_to_delete.append(import_job_id)
            deleted = db.session.execute(
                job_files.delete().where(job_files.c.job_id.in_(job_ids_to_delete))
            ).rowcount
            stats['db_records_deleted'] += deleted

            # Orphaned tags (usage_count == 0)
            deleted = Tag.query.filter(Tag.usage_count == 0).delete(synchronize_session=False)
            stats['db_records_deleted'] += deleted

            # File records
            deleted = File.query.filter(File.id.in_(all_db_file_ids)).delete(synchronize_session=False)
            stats['db_records_deleted'] += deleted

            # Job records (export + import)
            deleted = Job.query.filter(Job.id.in_(job_ids_to_delete)).delete(synchronize_session=False)
            stats['db_records_deleted'] += deleted

            # Setting for import root
            if import_job_id:
                Setting.query.filter(Setting.key == f'job_{import_job_id}_import_root').delete(synchronize_session=False)

            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error(f"Finalize DB cleanup failed: {e}")
            return jsonify({
                'error': f'Database cleanup failed: {str(e)}',
                'files_cleaned': stats
            }), 500

    logger.info(f"Finalized export job {job_id}: {stats}")

    return jsonify({
        'finalized': True,
        'stats': stats,
        'output_directory': output_directory
    }), 200
