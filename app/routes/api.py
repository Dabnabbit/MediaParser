"""API routes for progress tracking and general utilities."""
import os
from flask import Blueprint, jsonify, current_app
from datetime import datetime, timezone

from app import db
from app.models import Job, JobStatus, File, ConfidenceLevel

api_bp = Blueprint('api', __name__, url_prefix='/api')


@api_bp.route('/progress/<int:job_id>', methods=['GET'])
def get_progress(job_id):
    """Get job progress for polling.

    Returns minimal payload optimized for frequent polling (1-2 second intervals).
    """
    # Force fresh read from database (bypass SQLAlchemy cache)
    db.session.expire_all()

    job = db.session.get(Job, job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    # Calculate progress percentage
    progress_percent = 0
    if job.progress_total > 0:
        progress_percent = round(job.progress_current / job.progress_total * 100, 1)

    # Calculate elapsed time and ETA
    elapsed_seconds = None
    eta_seconds = None
    if job.started_at:
        # Ensure timezone-aware comparison (SQLite stores naive datetimes as UTC)
        started_at = job.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        elapsed = datetime.now(timezone.utc) - started_at
        elapsed_seconds = int(elapsed.total_seconds())

        # Estimate remaining time based on progress
        if job.progress_current > 0 and job.status == JobStatus.RUNNING:
            seconds_per_file = elapsed_seconds / job.progress_current
            remaining_files = job.progress_total - job.progress_current
            eta_seconds = int(seconds_per_file * remaining_files)

    response = {
        'job_id': job.id,
        'status': job.status.value,
        'progress_current': job.progress_current,
        'progress_total': job.progress_total,
        'progress_percent': progress_percent,
        'current_filename': job.current_filename,
        'error_count': job.error_count,
        'elapsed_seconds': elapsed_seconds,
        'eta_seconds': eta_seconds,
    }

    # Include summary data when job completes
    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.HALTED, JobStatus.CANCELLED]:
        # Get file counts by confidence
        confidence_counts = {}
        for level in ConfidenceLevel:
            count = File.query.join(File.jobs).filter(
                Job.id == job_id,
                File.confidence == level
            ).count()
            confidence_counts[level.value] = count

        # Get duplicate count
        duplicate_count = db.session.execute(
            db.select(db.func.count(db.distinct(File.file_hash_sha256)))
            .join(File.jobs)
            .where(Job.id == job_id)
            .where(File.file_hash_sha256.isnot(None))
            .group_by(File.file_hash_sha256)
            .having(db.func.count(File.id) > 1)
        ).scalar() or 0

        # Get failed file count
        failed_count = File.query.join(File.jobs).filter(
            Job.id == job_id,
            File.processing_error.isnot(None)
        ).count()

        response['summary'] = {
            'confidence_counts': confidence_counts,
            'duplicate_groups': duplicate_count,
            'failed_count': failed_count,
            'success_count': job.progress_current - failed_count,
            'error_count': failed_count,
        }

        if job.completed_at and job.started_at:
            duration = job.completed_at - job.started_at
            response['summary']['duration_seconds'] = int(duration.total_seconds())

    return jsonify(response)


@api_bp.route('/current-job', methods=['GET'])
def get_current_job():
    """Get the most recent incomplete job for session resume.

    Returns the most recent job that is not completed/failed/cancelled.
    """
    job = Job.query.filter(
        Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING, JobStatus.PAUSED])
    ).order_by(Job.created_at.desc()).first()

    if not job:
        return jsonify({'job_id': None})

    return jsonify({'job_id': job.id, 'status': job.status.value})


@api_bp.route('/worker-health', methods=['GET'])
def check_worker_health():
    """Check if Huey worker process is running.

    In standalone mode, checks embedded consumer thread liveness.
    Otherwise, uses process detection via pgrep.
    """
    # Standalone mode: check embedded consumer threads
    consumer = current_app.config.get('STANDALONE_CONSUMER')
    if consumer is not None:
        alive_workers = sum(
            1 for _, t in consumer.worker_threads if t.is_alive()
        )
        scheduler_alive = consumer.scheduler.is_alive()
        if alive_workers > 0 and scheduler_alive:
            return jsonify({
                'worker_alive': True,
                'mode': 'standalone',
                'workers': alive_workers,
            })
        return jsonify({
            'worker_alive': False,
            'error': f'Embedded consumer unhealthy (workers={alive_workers}, scheduler={scheduler_alive})',
        }), 503

    # PID-based check: launcher.py sets MEDIAPARSER_WORKER_PID env var
    worker_pid_str = os.environ.get('MEDIAPARSER_WORKER_PID')
    if worker_pid_str:
        try:
            pid = int(worker_pid_str)
            os.kill(pid, 0)  # Signal 0 = existence check only (works on Windows too)
            return jsonify({'worker_alive': True, 'mode': 'pid', 'pid': pid})
        except (OSError, ProcessLookupError):
            return jsonify({
                'worker_alive': False,
                'error': f'Worker PID {pid} not found'
            }), 503
        except (ValueError, TypeError):
            pass  # Invalid PID string, fall through to pgrep

    # Try pgrep first (works for two-process mode on same host)
    import subprocess
    try:
        for pattern in ['run_worker', 'huey_consumer', 'huey.consumer']:
            result = subprocess.run(
                ['pgrep', '-f', pattern],
                capture_output=True,
                timeout=1
            )
            if result.returncode == 0:
                pids = [p for p in result.stdout.decode().strip().split('\n') if p]
                if pids:
                    return jsonify({'worker_alive': True, 'pids': pids})
    except Exception:
        pass

    # Fallback: enqueue a health_check task via Huey (works across Docker containers)
    try:
        from app.tasks import health_check
        task_result = health_check()
        resp = task_result.get(blocking=True, timeout=3)
        if resp and resp.get('status') == 'ok':
            return jsonify({'worker_alive': True, 'mode': 'queue'})
    except Exception:
        pass

    return jsonify({
        'worker_alive': False,
        'error': 'No Huey worker process found'
    }), 503
