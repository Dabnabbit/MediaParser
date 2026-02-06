"""File upload and server path import routes.

Provides endpoints for:
- Browser file upload (POST /api/upload)
- Server-side path import (POST /api/import-path)
"""
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
import os
import json
import logging

from app import db
from app.models import Job, File, JobStatus, Setting
from app.tasks import enqueue_import_job

logger = logging.getLogger(__name__)

upload_bp = Blueprint('upload', __name__)

# Allowed file extensions
ALLOWED_EXTENSIONS = {
    'jpg', 'jpeg', 'png', 'gif', 'heic',  # Images
    'mp4', 'mov', 'avi', 'mkv'            # Videos
}


def allowed_file(filename: str) -> bool:
    """
    Check if file extension is allowed.

    Args:
        filename: Name of the file to check

    Returns:
        True if extension is in ALLOWED_EXTENSIONS
    """
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_import_root(job_id: int) -> Optional[str]:
    """
    Get stored import root path for a job, if any.

    Args:
        job_id: Job ID

    Returns:
        Import root path string, or None if not stored (browser upload)
    """
    setting = Setting.query.filter_by(key=f'job_{job_id}_import_root').first()
    return setting.value if setting else None


@upload_bp.route('/api/upload', methods=['POST'])
def upload_files():
    """
    Handle browser file upload.

    Accepts multipart/form-data with 'files' field (multiple files).
    Creates Job and File records, saves files to UPLOAD_FOLDER.

    Returns:
        JSON: {job_id, file_count, status: 'queued'}
    """
    try:
        # Check if files were provided
        if 'files' not in request.files:
            return jsonify({'error': 'No files provided'}), 400

        files = request.files.getlist('files')

        # Filter out empty filenames and validate extensions
        valid_files = []
        invalid_files = []

        for file in files:
            if file.filename == '':
                continue

            if not allowed_file(file.filename):
                invalid_files.append(file.filename)
                continue

            valid_files.append(file)

        if not valid_files:
            error_msg = 'No valid files provided'
            if invalid_files:
                error_msg += f'. Invalid files: {", ".join(invalid_files)}'
            return jsonify({'error': error_msg}), 400

        # Parse timestamps from frontend (for preserving original modification times)
        timestamps_json = request.form.get('timestamps')
        timestamps = []
        if timestamps_json:
            try:
                timestamps = json.loads(timestamps_json)
            except json.JSONDecodeError:
                logger.warning("Failed to parse timestamps JSON, ignoring")

        # Create job
        job = Job(
            job_type='import',
            status=JobStatus.PENDING
        )
        db.session.add(job)
        db.session.flush()  # Get job.id without committing

        # Create unique subdirectory for this job
        job_upload_dir = current_app.config['UPLOAD_FOLDER'] / f'job_{job.id}'
        job_upload_dir.mkdir(parents=True, exist_ok=True)

        # Save files and create File records
        file_records = []
        for i, file in enumerate(valid_files):
            # Secure the filename
            filename = secure_filename(file.filename)

            # Save to job subdirectory
            storage_path = job_upload_dir / filename
            file.save(str(storage_path))

            # Restore original modification time if provided
            if i < len(timestamps) and timestamps[i]:
                try:
                    # timestamps[i] is milliseconds since epoch
                    mtime_sec = timestamps[i] / 1000.0
                    os.utime(str(storage_path), (mtime_sec, mtime_sec))
                except (OSError, TypeError) as e:
                    logger.warning(f"Failed to restore mtime for {filename}: {e}")

            # Create File record
            file_record = File(
                original_filename=filename,
                original_path=str(storage_path.relative_to(current_app.config['UPLOAD_FOLDER'])),
                storage_path=str(storage_path)
            )
            db.session.add(file_record)
            file_records.append(file_record)

        # Associate files with job
        job.files = file_records
        job.progress_total = len(file_records)

        db.session.commit()
        logger.info(f"Job {job.id} created with {len(file_records)} files")

        # Enqueue job for processing
        enqueue_import_job(job.id)

        return jsonify({
            'job_id': job.id,
            'file_count': len(file_records),
            'status': 'queued'
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Upload error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@upload_bp.route('/api/import-path', methods=['POST'])
def import_server_path():
    """
    Handle server-side path import.

    Accepts JSON body: {path: '/path/to/folder'}
    Scans directory recursively for media files.

    Returns:
        JSON: {job_id, file_count, status: 'queued'}
    """
    try:
        # Get path from request
        data = request.get_json()
        if not data or 'path' not in data:
            return jsonify({'error': 'No path provided'}), 400

        import_path = Path(data['path'])

        # Validate path exists and is directory
        if not import_path.exists():
            return jsonify({'error': f"Path does not exist: {import_path}"}), 400

        if not import_path.is_dir():
            return jsonify({'error': f"Path is not a directory: {import_path}"}), 400

        # Security: Check if path is within allowed directories
        # For now, allow any absolute path, but log a warning
        # TODO: In production, validate against configured allowed_paths
        if not import_path.is_absolute():
            return jsonify({'error': 'Path must be absolute'}), 400

        logger.info(f"Importing from server path: {import_path}")

        # Scan directory recursively for media files
        file_paths = []
        for ext in ALLOWED_EXTENSIONS:
            # Case-insensitive glob
            file_paths.extend(import_path.rglob(f"*.{ext}"))
            file_paths.extend(import_path.rglob(f"*.{ext.upper()}"))

        # Remove duplicates (case-insensitive matches)
        file_paths = list(set(file_paths))

        if not file_paths:
            return jsonify({
                'error': f'No media files found in {import_path}',
                'searched_extensions': list(ALLOWED_EXTENSIONS)
            }), 400

        # Create job
        job = Job(
            job_type='import',
            status=JobStatus.PENDING
        )
        db.session.add(job)
        db.session.flush()  # Get job.id without committing

        # Store import root path for tag auto-generation
        setting = Setting(key=f'job_{job.id}_import_root', value=str(import_path))
        db.session.add(setting)

        # Create File records (no copying needed - files stay in place)
        file_records = []
        for file_path in sorted(file_paths):  # Alphabetical order
            file_record = File(
                original_filename=file_path.name,
                original_path=str(file_path),  # Server path
                storage_path=str(file_path)     # Same as original for server import
            )
            db.session.add(file_record)
            file_records.append(file_record)

        # Associate files with job
        job.files = file_records
        job.progress_total = len(file_records)

        db.session.commit()
        logger.info(f"Job {job.id} created with {len(file_records)} files from {import_path}")

        # Enqueue job for processing
        enqueue_import_job(job.id)

        return jsonify({
            'job_id': job.id,
            'file_count': len(file_records),
            'status': 'queued'
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Import path error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
