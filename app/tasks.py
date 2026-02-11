"""
Huey background tasks for media processing.

Tasks run in worker processes/threads, separate from the Flask web server.
Each task that needs database access must create its own Flask application context.
"""
from datetime import datetime, timezone
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import os
import logging

from huey_config import huey
from app.lib.processing import process_single_file
from app.lib.thumbnail import generate_thumbnail
from app.lib.perceptual import detect_perceptual_duplicates
from app.models import Job, File, JobStatus, ConfidenceLevel

logger = logging.getLogger(__name__)

# Debug file for pause/resume tracking
DEBUG_FILE = '/tmp/job_debug.log'

def debug_log(msg):
    """Write debug message to dedicated file for easy tracking."""
    with open(DEBUG_FILE, 'a') as f:
        f.write(f"{datetime.now().isoformat()} | {msg}\n")

# Processing configuration
BATCH_COMMIT_SIZE = 10  # Commit every N files for database performance
ERROR_THRESHOLD = 0.10  # Halt job if >10% failures (user decision from CONTEXT.md)
MIN_SAMPLE_SIZE = 10    # Need minimum files before checking threshold


def get_app():
    """
    Create Flask application for use in worker context.

    Must be called inside task to avoid import-time side effects.
    """
    from app import create_app
    return create_app()


def _should_halt_job(processed: int, errors: int, threshold: float, min_sample: int) -> bool:
    """
    Check if error rate exceeds threshold.

    Args:
        processed: Number of files processed so far
        errors: Number of errors encountered
        threshold: Maximum acceptable error rate (0.0-1.0)
        min_sample: Minimum files to process before checking threshold

    Returns:
        True if job should halt due to error rate
    """
    if processed < min_sample:
        return False
    return (errors / processed) > threshold


def _commit_pending_updates(db, pending_updates: list):
    """
    Apply pending file updates to database.

    Updates File records with processing results (hashes, metadata, timestamps, thumbnails).
    Uses flush() to write changes without committing transaction.

    Args:
        db: SQLAlchemy database instance
        pending_updates: List of dicts with 'file_id', 'result', and 'thumbnail_path' keys
    """
    for update in pending_updates:
        file_obj = db.session.get(File, update['file_id'])
        result = update['result']

        file_obj.file_hash_sha256 = result['sha256']
        file_obj.file_hash_perceptual = result['perceptual_hash']
        file_obj.file_size_bytes = result['file_size_bytes']
        file_obj.mime_type = result['mime_type']

        # Parse timestamp if present
        if result['detected_timestamp']:
            file_obj.detected_timestamp = datetime.fromisoformat(result['detected_timestamp'])

        file_obj.timestamp_source = result['timestamp_source']
        file_obj.confidence = ConfidenceLevel(result['confidence'])
        file_obj.timestamp_candidates = result['timestamp_candidates']
        file_obj.image_width = result.get('image_width')
        file_obj.image_height = result.get('image_height')

        # Set thumbnail path if generated
        if update.get('thumbnail_path'):
            file_obj.thumbnail_path = update['thumbnail_path']

    db.session.flush()  # Flush but don't commit yet


def _mark_duplicate_groups(db, job):
    """
    Detect and mark duplicate groups based on SHA256 hash.

    Files with identical SHA256 hashes are duplicates. Sets exact_group_id
    to the hash value for all files in groups of 2+ identical files.

    Args:
        db: SQLAlchemy database instance
        job: Job object with files to check
    """
    from collections import defaultdict

    # Group files by SHA256 hash
    hash_groups = defaultdict(list)
    for file in job.files:
        if file.file_hash_sha256:
            hash_groups[file.file_hash_sha256].append(file)

    # Mark files that have duplicates (2+ files with same hash)
    duplicate_count = 0
    for hash_value, files in hash_groups.items():
        if len(files) > 1:
            for file in files:
                file.exact_group_id = hash_value
                file.exact_group_confidence = 'high'  # SHA256 matches are always high confidence
                duplicate_count += 1

    if duplicate_count > 0:
        logger.info(f"Job {job.id}: marked {duplicate_count} files in duplicate groups")

    db.session.flush()


@huey.task(retries=2, retry_delay=30)
def process_import_job(job_id: int) -> dict:
    """
    Process an import job with multi-threaded file processing.

    Implements complete file processing pipeline:
    1. Fetch job and associated files from database
    2. Update job status to RUNNING
    3. Process files in parallel using ThreadPoolExecutor
    4. Update File records with extracted metadata
    5. Track progress and handle errors with threshold
    6. Support pause/cancel during processing
    7. Update job status to COMPLETED or FAILED

    Args:
        job_id: ID of the Job record to process

    Returns:
        Dictionary with result info:
        {
            'job_id': int,
            'status': str,
            'processed': int,
            'errors': int (if any)
        }
    """
    app = get_app()

    with app.app_context():
        from app import db

        # Fetch job
        job = db.session.get(Job, job_id)
        if job is None:
            logger.error(f"Job {job_id} not found")
            return {'error': f'Job {job_id} not found'}

        # Check if this is a resume (job already has started_at)
        is_resume = job.started_at is not None

        debug_log(f"Job {job_id} TASK START: is_resume={is_resume}, current progress_current={job.progress_current}, progress_total={job.progress_total}")

        # Update to RUNNING
        job.status = JobStatus.RUNNING
        if not is_resume:
            job.started_at = datetime.now(timezone.utc)
            job.error_count = 0
        db.session.commit()
        debug_log(f"Job {job_id} status set to RUNNING, committed")

        try:
            # Get all files sorted alphabetically (user decision from CONTEXT.md)
            all_files = sorted(job.files, key=lambda f: f.original_filename)
            job.progress_total = len(all_files)

            # Filter to only unprocessed files (no sha256 hash yet)
            files = [f for f in all_files if f.file_hash_sha256 is None]

            # Track how many were already processed (for resume)
            already_processed = len(all_files) - len(files)
            debug_log(f"Job {job_id} FILE CHECK: all_files={len(all_files)}, files_without_hash={len(files)}, already_processed={already_processed}")
            if already_processed > 0:
                msg = f"Job {job_id} RESUME: {already_processed}/{len(all_files)} have sha256, {len(files)} remaining"
                logger.info(msg)
                debug_log(msg)
                debug_log(f"Job {job_id} SETTING progress_current from {job.progress_current} to {already_processed}")
                job.progress_current = already_processed
            else:
                msg = f"Job {job_id} START: {len(all_files)} files to process"
                logger.info(msg)
                debug_log(msg)
                debug_log(f"Job {job_id} NOT SETTING progress_current (already_processed=0), keeping current value={job.progress_current}")

            db.session.commit()
            debug_log(f"Job {job_id} AFTER COMMIT: progress_current={job.progress_current}, progress_total={job.progress_total}")

            if len(files) == 0:
                logger.warning(f"Job {job_id} has no files to process")
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                return {
                    'job_id': job_id,
                    'status': 'completed',
                    'processed': 0
                }

            # Get processing configuration
            max_workers = app.config.get('WORKER_THREADS') or os.cpu_count() or 1
            min_year = app.config.get('MIN_VALID_YEAR', 2000)
            default_tz = app.config.get('TIMEZONE', 'America/New_York')

            # Get thumbnails directory
            thumbnails_dir = app.config.get('THUMBNAILS_FOLDER')
            if not thumbnails_dir:
                thumbnails_dir = Path(app.config['UPLOAD_FOLDER']).parent / 'thumbnails'
                thumbnails_dir.mkdir(parents=True, exist_ok=True)

            import time
            task_start = time.time()
            logger.info(f"Processing {len(files)} files with {max_workers} workers")

            # Track processing state (offset by already processed for resume)
            processed_count = already_processed
            error_count = job.error_count or 0
            pending_updates = []  # Batch updates for performance

            # Process files in parallel
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Collect file paths first (avoid lazy loading during submit)
                collect_start = time.time()
                file_paths = [(f, f.storage_path) for f in files]
                logger.info(f"File paths collected in {time.time() - collect_start:.3f}s")

                # Submit all files to thread pool
                submit_start = time.time()
                future_to_file = {
                    executor.submit(
                        process_single_file,
                        path,
                        min_year,
                        default_tz
                    ): file_obj
                    for file_obj, path in file_paths
                }
                logger.info(f"Tasks submitted in {time.time() - submit_start:.3f}s")

                # Process results as they complete
                first_result = True
                for future in as_completed(future_to_file):
                    if first_result:
                        logger.info(f"First result received {time.time() - task_start:.3f}s after task start")
                        first_result = False
                    file_obj = future_to_file[future]

                    # Get processing result
                    result = future.result()
                    processed_count += 1

                    # Update progress tracking
                    job.progress_current = processed_count
                    job.current_filename = file_obj.original_filename

                    # Commit progress frequently for responsive UI
                    if processed_count <= 20 or processed_count % 5 == 0:
                        db.session.commit()

                    if result['status'] == 'error':
                        # Track error on file and job
                        error_count += 1
                        job.error_count = error_count
                        file_obj.processing_error = result.get('error', 'Unknown error')
                        logger.error(
                            f"File processing error [{error_count}/{processed_count}]: "
                            f"{file_obj.original_filename} - {result['error']}"
                        )

                        # Check error threshold
                        if _should_halt_job(processed_count, error_count, ERROR_THRESHOLD, MIN_SAMPLE_SIZE):
                            error_rate = error_count / processed_count
                            job.status = JobStatus.HALTED
                            job.error_message = (
                                f"Error rate {error_count}/{processed_count} "
                                f"({error_rate:.1%}) exceeded {ERROR_THRESHOLD:.1%} threshold"
                            )
                            job.completed_at = datetime.now(timezone.utc)
                            db.session.commit()
                            logger.error(f"Job {job_id} halted due to error threshold")
                            return {
                                'job_id': job_id,
                                'status': 'halted',
                                'processed': processed_count,
                                'errors': error_count
                            }
                    else:
                        # Generate thumbnail for images
                        thumbnail_path = None
                        file_path = Path(file_obj.storage_path or file_obj.original_path)
                        if file_path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.gif', '.heic', '.mp4', '.mov', '.avi', '.mkv'}:
                            thumb_path = generate_thumbnail(
                                source_path=file_path,
                                thumb_dir=thumbnails_dir,
                                size='medium',
                                file_id=file_obj.id
                            )
                            if thumb_path:
                                thumbnail_path = str(thumb_path.relative_to(thumbnails_dir.parent))
                            else:
                                logger.warning(f"Thumbnail generation failed for {file_obj.original_filename}")

                        # Queue file update for batch commit
                        pending_updates.append({
                            'file_id': file_obj.id,
                            'result': result,
                            'thumbnail_path': thumbnail_path
                        })

                    # Batch commit for performance
                    if len(pending_updates) >= BATCH_COMMIT_SIZE:
                        _commit_pending_updates(db, pending_updates)
                        pending_updates = []
                        db.session.commit()

                    # Check for cancellation/pause AFTER processing each result
                    db.session.refresh(job)
                    if job.status in (JobStatus.CANCELLED, JobStatus.PAUSED):
                        pending_count = len(pending_updates)
                        debug_log(f"Job {job_id} PAUSE DETECTED: status={job.status.value}, processed_count={processed_count}, pending_updates={pending_count}")
                        if pending_updates:
                            _commit_pending_updates(db, pending_updates)
                            debug_log(f"Job {job_id} PAUSE: committed {pending_count} pending updates")
                        job.progress_current = processed_count
                        db.session.commit()
                        debug_log(f"Job {job_id} PAUSE FINAL: progress_current={job.progress_current}, progress_total={job.progress_total}")
                        msg = f"Job {job_id} {job.status.value} at {processed_count}/{job.progress_total} (committed {pending_count} pending)"
                        logger.info(msg)
                        debug_log(msg)
                        return {
                            'job_id': job_id,
                            'status': job.status.value,
                            'processed': processed_count
                        }

            # Commit any remaining pending updates
            if pending_updates:
                _commit_pending_updates(db, pending_updates)

            # Detect and mark duplicate groups based on SHA256 hash
            _mark_duplicate_groups(db, job)

            # Detect perceptual duplicates (near-matches via dHash comparison)
            detect_perceptual_duplicates(job.files)

            # Finalize job - ensure progress reflects actual count
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            job.current_filename = None
            job.progress_current = processed_count  # Ensure final count is saved
            db.session.commit()
            debug_log(f"Job {job_id} COMPLETED: progress_current={job.progress_current}, progress_total={job.progress_total}")
            logger.info(
                f"Job {job_id} completed successfully: "
                f"{processed_count} files processed, {error_count} errors"
            )

            return {
                'job_id': job_id,
                'status': 'completed',
                'processed': processed_count,
                'errors': error_count
            }

        except Exception as e:
            # Mark failed
            job.status = JobStatus.FAILED
            job.error_message = str(e)[:500]  # Truncate long errors
            job.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            logger.error(f"Job {job_id} failed with exception: {e}", exc_info=True)

            # Re-raise so Huey handles retry
            raise


@huey.task()
def health_check() -> dict:
    """
    Simple health check task to verify worker is running.

    Can be called from web app to confirm queue is operational.
    """
    return {
        'status': 'ok',
        'timestamp': datetime.now(timezone.utc).isoformat()
    }


def enqueue_import_job(job_id: int) -> str:
    """
    Helper function to enqueue a job from web app.

    Args:
        job_id: ID of the Job record to process

    Returns:
        Huey task ID (can be used to check status)
    """
    result = process_import_job(job_id)
    return result.id  # Huey task ID


@huey.task(retries=2, retry_delay=30)
def process_export_job(job_id: int) -> dict:
    """
    Process an export job by copying non-discarded files to organized output directories.

    Implements complete export pipeline:
    1. Fetch job and associated files from database
    2. Update job status to RUNNING
    3. Auto-generate tags for all files to be exported
    4. Query non-discarded files not yet exported
    5. For each file:
       - Generate output path (year-based or unknown/)
       - Copy to output location with collision resolution
       - Write corrected metadata (timestamp + tags) to OUTPUT file
       - Set File.output_path after successful copy
    6. Track progress with pause/cancel support
    7. Update job status to COMPLETED or FAILED

    Args:
        job_id: ID of the export Job record to process

    Returns:
        Dictionary with result info:
        {
            'job_id': int,
            'status': str,
            'processed': int,
            'errors': int (if any)
        }
    """
    from app.lib.export import generate_output_filename, copy_file_to_output
    from app.lib.tagging import apply_auto_tags
    from app.lib.metadata import write_metadata
    from app.routes.upload import get_import_root

    app = get_app()

    with app.app_context():
        from app import db

        # Fetch job
        job = db.session.get(Job, job_id)
        if job is None:
            logger.error(f"Export job {job_id} not found")
            return {'error': f'Job {job_id} not found'}

        # Check if this is a resume (job already has started_at)
        is_resume = job.started_at is not None

        debug_log(f"Export job {job_id} TASK START: is_resume={is_resume}, current progress_current={job.progress_current}, progress_total={job.progress_total}")

        # Update to RUNNING
        job.status = JobStatus.RUNNING
        if not is_resume:
            job.started_at = datetime.now(timezone.utc)
            job.error_count = 0
        db.session.commit()
        debug_log(f"Export job {job_id} status set to RUNNING, committed")

        try:
            # Get output directory from settings or config
            from app.models import Setting
            output_dir_setting = Setting.query.filter_by(key='output_directory').first()
            if output_dir_setting:
                output_base = Path(output_dir_setting.value)
            else:
                output_base = Path(app.config['OUTPUT_FOLDER'])

            logger.info(f"Export job {job_id}: output directory = {output_base}")

            # Query files to export using windowed approach for memory efficiency
            # Resume support: only process files without output_path set
            files_to_export = File.query.join(File.jobs).filter(
                Job.id == job_id,
                File.discarded == False,
                File.processing_error.is_(None),  # Skip failed files
                File.output_path.is_(None)  # Not yet exported
            ).order_by(
                File.final_timestamp.asc().nullslast(),
                File.detected_timestamp.asc().nullslast(),
                File.original_filename.asc()
            ).all()

            # Track how many were already processed (for resume)
            all_files_count = File.query.join(File.jobs).filter(
                Job.id == job_id,
                File.discarded == False,
                File.processing_error.is_(None)
            ).count()
            already_exported = all_files_count - len(files_to_export)

            # Set progress total
            job.progress_total = all_files_count

            debug_log(f"Export job {job_id} FILE CHECK: all_files={all_files_count}, files_without_output={len(files_to_export)}, already_exported={already_exported}")

            if already_exported > 0:
                msg = f"Export job {job_id} RESUME: {already_exported}/{all_files_count} already exported, {len(files_to_export)} remaining"
                logger.info(msg)
                debug_log(msg)
                job.progress_current = already_exported
            else:
                msg = f"Export job {job_id} START: {all_files_count} files to export"
                logger.info(msg)
                debug_log(msg)

            db.session.commit()
            debug_log(f"Export job {job_id} AFTER COMMIT: progress_current={job.progress_current}, progress_total={job.progress_total}")

            if len(files_to_export) == 0:
                logger.warning(f"Export job {job_id} has no files to export")
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                return {
                    'job_id': job_id,
                    'status': 'completed',
                    'processed': already_exported
                }

            # Pre-export: Auto-generate tags for all files to be exported
            # Get import root if available (None for browser uploads)
            import_root = get_import_root(job_id)
            tag_result = apply_auto_tags(db, files_to_export, import_root)
            logger.info(f"Export job {job_id}: Auto-tags applied - {tag_result}")
            db.session.commit()

            # Get batch commit size from config
            batch_size = app.config.get('BATCH_COMMIT_SIZE', 10)

            # Track processing state (offset by already exported for resume)
            processed_count = already_exported
            error_count = job.error_count or 0
            pending_updates = []  # Track files for batch commit

            # Process files sequentially (no threading needed for file copy)
            for file_obj in files_to_export:
                try:
                    # Generate output path
                    output_path = generate_output_filename(file_obj, output_base)

                    # Get source path (prefer storage_path, fall back to original_path)
                    source_path = Path(file_obj.storage_path or file_obj.original_path)

                    # Copy file with collision resolution
                    final_output_path = copy_file_to_output(source_path, output_path)

                    # Get timestamp for metadata write (prefer final, fall back to detected)
                    timestamp = file_obj.final_timestamp or file_obj.detected_timestamp

                    # Get tag names for this file
                    tag_names = [tag.name for tag in file_obj.tags]

                    # Write corrected metadata to the OUTPUT copy (not source)
                    write_metadata(final_output_path, timestamp=timestamp, tag_names=tag_names)

                    # Set output_path on file object
                    file_obj.output_path = str(final_output_path)

                    # Track for batch commit
                    pending_updates.append(file_obj.id)

                    processed_count += 1

                    # Update progress tracking
                    job.progress_current = processed_count
                    job.current_filename = file_obj.original_filename

                    # Commit progress frequently for responsive UI (first 20 or every 5)
                    if processed_count <= 20 or processed_count % 5 == 0:
                        db.session.commit()

                except Exception as e:
                    # Track error on file and job
                    error_count += 1
                    job.error_count = error_count
                    file_obj.processing_error = f"Export error: {str(e)[:500]}"
                    logger.error(
                        f"File export error [{error_count}/{processed_count}]: "
                        f"{file_obj.original_filename} - {e}"
                    )

                    processed_count += 1
                    job.progress_current = processed_count

                    # Check error threshold
                    if _should_halt_job(processed_count, error_count, ERROR_THRESHOLD, MIN_SAMPLE_SIZE):
                        error_rate = error_count / processed_count
                        job.status = JobStatus.HALTED
                        job.error_message = (
                            f"Error rate {error_count}/{processed_count} "
                            f"({error_rate:.1%}) exceeded {ERROR_THRESHOLD:.1%} threshold"
                        )
                        job.completed_at = datetime.now(timezone.utc)
                        db.session.commit()
                        logger.error(f"Export job {job_id} halted due to error threshold")
                        return {
                            'job_id': job_id,
                            'status': 'halted',
                            'processed': processed_count,
                            'errors': error_count
                        }

                # Batch commit for performance
                if len(pending_updates) >= batch_size:
                    db.session.commit()
                    pending_updates = []

                # Check for cancellation/pause AFTER processing each file
                db.session.refresh(job)
                if job.status in (JobStatus.CANCELLED, JobStatus.PAUSED):
                    pending_count = len(pending_updates)
                    debug_log(f"Export job {job_id} PAUSE DETECTED: status={job.status.value}, processed_count={processed_count}, pending_updates={pending_count}")
                    if pending_updates:
                        db.session.commit()
                        debug_log(f"Export job {job_id} PAUSE: committed {pending_count} pending updates")
                    job.progress_current = processed_count
                    db.session.commit()
                    debug_log(f"Export job {job_id} PAUSE FINAL: progress_current={job.progress_current}, progress_total={job.progress_total}")
                    msg = f"Export job {job_id} {job.status.value} at {processed_count}/{job.progress_total} (committed {pending_count} pending)"
                    logger.info(msg)
                    debug_log(msg)
                    return {
                        'job_id': job_id,
                        'status': job.status.value,
                        'processed': processed_count
                    }

            # Commit any remaining pending updates
            if pending_updates:
                db.session.commit()

            # Finalize job - ensure progress reflects actual count
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            job.current_filename = None
            job.progress_current = processed_count  # Ensure final count is saved
            db.session.commit()
            debug_log(f"Export job {job_id} COMPLETED: progress_current={job.progress_current}, progress_total={job.progress_total}")
            logger.info(
                f"Export job {job_id} completed successfully: "
                f"{processed_count} files exported, {error_count} errors"
            )

            return {
                'job_id': job_id,
                'status': 'completed',
                'processed': processed_count,
                'errors': error_count
            }

        except Exception as e:
            # Mark failed
            job.status = JobStatus.FAILED
            job.error_message = str(e)[:500]  # Truncate long errors
            job.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            logger.error(f"Export job {job_id} failed with exception: {e}", exc_info=True)

            # Re-raise so Huey handles retry
            raise


def enqueue_export_job(job_id: int) -> str:
    """
    Helper function to enqueue an export job from web app.

    Args:
        job_id: ID of the export Job record to process

    Returns:
        Huey task ID (can be used to check status)
    """
    result = process_export_job(job_id)
    return result.id  # Huey task ID
