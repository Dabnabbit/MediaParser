import os
import re
import datetime
import time
import shutil
import json
import hashlib
import threading
import queue
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Callable, Any
from dataclasses import dataclass, asdict, field
from enum import Enum
from concurrent.futures import ThreadPoolExecutor
import sqlite3
from contextlib import contextmanager

import exiftool
from PIL import Image
import imagehash

class ConfidenceLevel(Enum):
    HIGH = "high"
    MEDIUM = "medium" 
    LOW = "low"
    ERROR = "error"

class ActionType(Enum):
    PROCESS = "process"
    CHECK = "check"
    ERROR = "error"
    DUPLICATE = "duplicate"
    PENDING = "pending"
    PROCESSING = "processing"

class ProcessingStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"
    USER_ACTION_NEEDED = "user_action_needed"

@dataclass
class PhotoMetadata:
    """Structured container for photo metadata"""
    file_path: str
    file_name: str
    file_extension: str
    file_size: int
    directory_tags: List[str] = field(default_factory=list)
    filename_tags: List[str] = field(default_factory=list)
    filename_datetime: Optional[datetime.datetime] = None
    exif_datetimes: List[datetime.datetime] = field(default_factory=list)
    other_datetimes: List[datetime.datetime] = field(default_factory=list)
    final_datetime: Optional[datetime.datetime] = None
    confidence: ConfidenceLevel = ConfidenceLevel.LOW
    action: ActionType = ActionType.PENDING
    status: ProcessingStatus = ProcessingStatus.QUEUED
    error_message: Optional[str] = None
    duplicate_group: Optional[str] = None
    perceptual_hash: Optional[str] = None
    file_hash: Optional[str] = None
    megapixels: float = 0.0
    processed_time: Optional[datetime.datetime] = None
    user_verified: bool = False

@dataclass
class ProcessingConfig:
    """Configuration settings for photo processing"""
    documents_dir: str = 'D:/Work/Scripts/PhotoTimeFixer/Test/'
    output_dir: str = 'Output/'
    output_dir_years: bool = True
    output_dir_clear: bool = True
    
    # Processing settings
    batch_size: int = 100  # Files per batch
    max_workers: int = min(32, (os.cpu_count() or 1) + 4)
    max_concurrent_exif: int = 4  # Limit ExifTool instances
    enable_database: bool = True
    database_file: str = 'photo_processing.db'
    
    valid_extensions: Tuple[str, ...] = ('jpg', 'jpeg', 'png', 'gif', 'mp4', 'mpeg', 'mov', 'avi', 'mkv')
    valid_date_year_min: int = 2000
    valid_date_year_max: int = 2100
    
    # Regex patterns
    valid_date_regex: str = r'(19|20)\d{2}[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2][0-9]|3[0-1])'
    valid_time_regex: str = r'([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]'
    valid_timezone_regex: str = r'[-+]([01][0-9]|2[0-3]):?[0-5][0-9]'
    valid_metatag_regex: str = r'\{.*\}'
    
    # Metadata field mappings
    meta_filetype_tags: Tuple[str, ...] = ('File:FileType', 'File:FileTypeExtension', 'File:MIMEType')
    meta_datetime_tags: Tuple[str, ...] = ('File:FileModifyDate', 'File:FileCreateDate', 'EXIF:DateTimeOriginal', 'EXIF:ModifyDate')
    meta_ignored_tags: Tuple[str, ...] = ('SourceFile', 'File:FileName', 'File:FileAccessDate', 'ICC_Profile:ProfileDateTime', 'IPTC:SpecialInstructions', 'Photoshop:*')
    meta_ensured_tags: Tuple[str, ...] = ('DateTimeOriginal', 'FileCreateDate')
    meta_comment_tags: Optional[List[str]] = None
    
    # Duplicate detection
    duplicate_similarity_threshold: int = 5
    enable_duplicate_detection: bool = True
    
    def __post_init__(self):
        if self.meta_comment_tags is None:
            self.meta_comment_tags = ['EXIF:XPKeywords']

class DatabaseManager:
    """Handles SQLite database operations for persistence"""
    
    def __init__(self, db_file: str):
        self.db_file = db_file
        self.init_database()
    
    @contextmanager
    def get_connection(self):
        """Context manager for database connections"""
        conn = sqlite3.connect(self.db_file, timeout=30.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
    
    def init_database(self):
        """Initialize database schema"""
        with self.get_connection() as conn:
            # Create photo_metadata table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS photo_metadata (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT UNIQUE,
                    file_name TEXT,
                    file_extension TEXT,
                    file_size INTEGER,
                    directory_tags TEXT,
                    filename_tags TEXT,
                    filename_datetime TEXT,
                    final_datetime TEXT,
                    confidence TEXT,
                    action TEXT,
                    status TEXT,
                    error_message TEXT,
                    duplicate_group TEXT,
                    perceptual_hash TEXT,
                    file_hash TEXT,
                    megapixels REAL,
                    processed_time TEXT,
                    user_verified BOOLEAN,
                    metadata_json TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create processing_sessions table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS processing_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT UNIQUE,
                    config_json TEXT,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    total_files INTEGER,
                    processed_files INTEGER,
                    status TEXT
                )
            ''')
            
            # Create indexes separately
            conn.execute('CREATE INDEX IF NOT EXISTS idx_status ON photo_metadata(status)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_action ON photo_metadata(action)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_hash ON photo_metadata(perceptual_hash)')
            
            conn.commit()
    
    def save_metadata(self, metadata: PhotoMetadata):
        """Save or update photo metadata"""
        with self.get_connection() as conn:
            # Convert metadata to dict and handle enum serialization
            metadata_dict = asdict(metadata)
            
            # Convert datetime objects to ISO strings
            for key, value in metadata_dict.items():
                if isinstance(value, datetime.datetime):
                    metadata_dict[key] = value.isoformat()
                elif hasattr(value, 'value'):  # Handle enum objects
                    metadata_dict[key] = value.value
            
            conn.execute('''
                INSERT OR REPLACE INTO photo_metadata 
                (file_path, file_name, file_extension, file_size, directory_tags, 
                 filename_tags, filename_datetime, final_datetime, confidence, action, 
                 status, error_message, duplicate_group, perceptual_hash, file_hash,
                 megapixels, processed_time, user_verified, metadata_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ''', (
                metadata.file_path, 
                metadata.file_name, 
                metadata.file_extension,
                metadata.file_size, 
                json.dumps(metadata.directory_tags),
                json.dumps(metadata.filename_tags), 
                metadata.filename_datetime.isoformat() if metadata.filename_datetime else None,
                metadata.final_datetime.isoformat() if metadata.final_datetime else None,
                metadata.confidence.value,  # Convert enum to string
                metadata.action.value,      # Convert enum to string
                metadata.status.value,      # Convert enum to string
                metadata.error_message, 
                metadata.duplicate_group, 
                metadata.perceptual_hash,
                metadata.file_hash, 
                metadata.megapixels,
                metadata.processed_time.isoformat() if metadata.processed_time else None,
                metadata.user_verified, 
                json.dumps(metadata_dict, default=str)  # Handle any remaining serialization issues
            ))
            conn.commit()
    
    def get_files_by_status(self, status: ProcessingStatus, limit: Optional[int] = None) -> List[Dict]:
        """Get files by processing status"""
        with self.get_connection() as conn:
            query = "SELECT * FROM photo_metadata WHERE status = ?"
            params: List[Any] = [status.value]
            if limit:
                query += " LIMIT ?"
                params.append(limit)
            
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
    
    def get_processing_stats(self) -> Dict[str, int]:
        """Get current processing statistics"""
        with self.get_connection() as conn:
            stats = {}
            for status in ProcessingStatus:
                cursor = conn.execute(
                    "SELECT COUNT(*) as count FROM photo_metadata WHERE status = ?", 
                    (status.value,)
                )
                stats[status.value] = cursor.fetchone()['count']
            return stats

class BulkPhotoProcessor:
    """Main bulk processing class with queue management"""
    
    def __init__(self, config: ProcessingConfig):
        self.config = config
        self.start_time = time.time()
        self.db = DatabaseManager(config.database_file) if config.enable_database else None
        
        # Threading components
        self.file_queue = queue.Queue()
        self.result_queue = queue.Queue()
        self.progress_callbacks: List[Callable] = []
        self.processing_active = False
        self.stats_lock = threading.Lock()
        
        # Processing stats
        self.stats = {
            'total_files': 0,
            'queued': 0,
            'processing': 0,
            'completed': 0,
            'errors': 0,
            'user_action_needed': 0
        }
        
        # ExifTool pool management
        self.exif_semaphore = threading.Semaphore(config.max_concurrent_exif)
        self.duplicate_detector = DuplicateDetector(config.duplicate_similarity_threshold)
    
    def add_progress_callback(self, callback: Callable[[Dict], None]):
        """Add callback function for progress updates"""
        self.progress_callbacks.append(callback)
    
    def notify_progress(self, update_data: Dict):
        """Notify all progress callbacks"""
        for callback in self.progress_callbacks:
            try:
                callback(update_data)
            except Exception as e:
                self.log_message(f"Progress callback error: {e}", "WARNING")
    
    def log_message(self, message: str, level: str = "INFO"):
        """Thread-safe logging"""
        timestamp = f"{(time.time() - self.start_time):.2f}s"
        print(f"[{timestamp}] {level}: {message}")
        
        # Notify GUI of log message
        self.notify_progress({
            'type': 'log',
            'message': message,
            'level': level,
            'timestamp': timestamp
        })
    
    def update_stats(self, status_change: Dict):
        """Thread-safe stats update"""
        with self.stats_lock:
            old_status = status_change.get('old_status')
            new_status = status_change.get('new_status')
            
            if old_status:
                self.stats[old_status] = max(0, self.stats[old_status] - 1)
            if new_status:
                self.stats[new_status] += 1
        
        # Notify progress
        self.notify_progress({
            'type': 'stats_update',
            'stats': self.stats.copy()
        })
    
    def scan_directories(self) -> List[str]:
        """Scan for all media files in directory tree - memory efficient"""
        media_files = []
        skipped_files = 0
        
        for root, dirs, files in os.walk(self.config.documents_dir):
            # Skip output directory
            if self.config.output_dir in root:
                continue
            
            # Skip hidden directories and common non-media directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and 
                      d.lower() not in ['thumbnails', 'cache', '@eadir', 'system volume information']]
                
            for file_name in files:
                # Skip hidden files and system files
                if file_name.startswith('.') or file_name.startswith('@'):
                    skipped_files += 1
                    continue
                    
                if file_name.lower().endswith(self.config.valid_extensions):
                    file_path = os.path.join(root, file_name)
                    
                    # Skip if already processed (check database)
                    if self.db and self.is_file_already_processed(file_path):
                        continue
                        
                    media_files.append(file_path)
        
        self.log_message(f"Found {len(media_files)} new media files to process (skipped {skipped_files} system files)")
        return media_files
    
    def is_file_already_processed(self, file_path: str) -> bool:
        """Check if file was already processed in a previous session"""
        if not self.db:
            return False
            
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT status FROM photo_metadata WHERE file_path = ? AND status IN ('completed', 'user_action_needed')",
                (file_path,)
            )
            return cursor.fetchone() is not None
    
    def process_file_batch(self, file_paths: List[str]) -> List[PhotoMetadata]:
        """Process a batch of files (runs in separate thread/process)"""
        results = []
        
        # Use semaphore to limit concurrent ExifTool instances
        with self.exif_semaphore:
            with exiftool.ExifToolHelper() as et:
                for file_path in file_paths:
                    try:
                        # Update status to processing
                        self.update_stats({'new_status': 'processing'})
                        
                        metadata = self.analyze_single_file(file_path, et)
                        metadata.status = ProcessingStatus.COMPLETED
                        metadata.processed_time = datetime.datetime.now()
                        
                        # ** NEW: Actually organize the file **
                        success = self.organize_file(metadata, et)
                        if not success:
                            metadata.status = ProcessingStatus.ERROR
                            metadata.error_message = "Failed to organize file"
                        
                        # Save to database if enabled
                        if self.db:
                            self.db.save_metadata(metadata)
                        
                        results.append(metadata)
                        
                        # Update stats
                        final_status = 'completed' if metadata.action == ActionType.PROCESS else 'user_action_needed'
                        if metadata.status == ProcessingStatus.ERROR:
                            final_status = 'errors'
                            
                        self.update_stats({
                            'old_status': 'processing',
                            'new_status': final_status
                        })
                        
                        # Notify individual file completion
                        self.notify_progress({
                            'type': 'file_completed',
                            'metadata': {
                                'file_name': metadata.file_name,
                                'confidence': metadata.confidence.value,
                                'action': metadata.action.value,
                                'final_datetime': metadata.final_datetime.isoformat() if metadata.final_datetime else None
                            }
                        })
                        
                    except Exception as e:
                        error_metadata = PhotoMetadata(
                            file_path=file_path,
                            file_name=os.path.basename(file_path),
                            file_extension=file_path.split('.')[-1],
                            file_size=0,
                            directory_tags=[],
                            filename_tags=[],
                            filename_datetime=None,
                            exif_datetimes=[],
                            other_datetimes=[],
                            final_datetime=None,
                            confidence=ConfidenceLevel.ERROR,
                            action=ActionType.ERROR,
                            status=ProcessingStatus.ERROR,
                            error_message=str(e)
                        )
                        
                        if self.db:
                            self.db.save_metadata(error_metadata)
                        
                        results.append(error_metadata)
                        self.update_stats({'old_status': 'processing', 'new_status': 'errors'})
                        
                        self.log_message(f"Error processing {file_path}: {e}", "ERROR")
        
        return results
    
    def analyze_single_file(self, file_path: str, et: exiftool.ExifToolHelper) -> PhotoMetadata:
        """Analyze a single file (extracted for clarity)"""
        # This contains the core analysis logic from your original script
        # (Similar to the analyze_file method from the previous version, but streamlined)
        
        file_name = os.path.basename(file_path)
        relative_dir = os.path.relpath(os.path.dirname(file_path), self.config.documents_dir)
        directory_tags = [relative_dir] if relative_dir != '.' else []
        
        # Create base metadata
        metadata = PhotoMetadata(
            file_path=file_path,
            file_name=file_name,
            file_extension=file_path.lower().split('.')[-1],
            file_size=os.path.getsize(file_path),
            directory_tags=directory_tags,
            filename_tags=[],
            filename_datetime=None,
            exif_datetimes=[],
            other_datetimes=[],
            final_datetime=None,
            confidence=ConfidenceLevel.LOW,
            action=ActionType.CHECK
        )
        
        # Extract filename tags and datetime
        self.extract_filename_data(metadata)
        
        # Extract EXIF data
        self.extract_exif_data(metadata, et)
        
        # Generate hashes
        self.generate_hashes(metadata)
        
        # Determine final datetime and confidence
        self.determine_confidence(metadata)
        
        # Add to duplicate detection
        if metadata.perceptual_hash:
            duplicate_group = self.duplicate_detector.add_file(metadata)
            if duplicate_group:
                metadata.duplicate_group = duplicate_group
                metadata.action = ActionType.DUPLICATE
        
        return metadata
    
    def extract_filename_data(self, metadata: PhotoMetadata):
        """Extract tags and datetime from filename"""
        # Tag extraction logic
        if '{' in metadata.file_name:
            tag_match = re.search(self.config.valid_metatag_regex, metadata.file_name)
            if tag_match:
                tag_list = tag_match.group(0)[1:-1].split(',')
                metadata.filename_tags = [tag.strip() for tag in tag_list]
        
        # Datetime extraction
        date_match = re.search(self.config.valid_date_regex, metadata.file_name)
        if date_match:
            found_date = date_match.group(0)
            found_time = '235900'
            
            remaining = metadata.file_name[date_match.span()[1]:]
            time_match = re.search(self.config.valid_time_regex, remaining)
            if time_match:
                found_time = time_match.group(0)
            
            metadata.filename_datetime = self.convert_str_to_datetime(f"{found_date} {found_time}")
    
    def extract_exif_data(self, metadata: PhotoMetadata, et: exiftool.ExifToolHelper):
        """Extract EXIF metadata"""
        try:
            exif_data = et.get_metadata(metadata.file_path)[0]
            
            # Get megapixels
            if 'Composite:Megapixels' in exif_data:
                try:
                    metadata.megapixels = float(exif_data['Composite:Megapixels'])
                except (ValueError, TypeError):
                    pass
            
            # Extract datetime fields
            for key, value in exif_data.items():
                if not isinstance(value, str):
                    continue
                    
                if key in self.config.meta_datetime_tags:
                    parsed_dt = self.convert_str_to_datetime(value)
                    if parsed_dt:
                        metadata.exif_datetimes.append(parsed_dt)
                elif (key not in self.config.meta_ignored_tags and 
                      metadata.file_name.lower() not in value.lower() and
                      re.search(self.config.valid_date_regex, value.replace(':', ''))):
                    parsed_dt = self.convert_str_to_datetime(value.replace(':', ''))
                    if parsed_dt:
                        metadata.other_datetimes.append(parsed_dt)
                        
        except Exception as e:
            metadata.error_message = f"EXIF extraction failed: {str(e)}"
    
    def generate_hashes(self, metadata: PhotoMetadata):
        """Generate file and perceptual hashes"""
        try:
            # File hash
            with open(metadata.file_path, 'rb') as f:
                metadata.file_hash = hashlib.md5(f.read()).hexdigest()
            
            # Perceptual hash for images
            if (self.config.enable_duplicate_detection and 
                metadata.file_extension in ['jpg', 'jpeg', 'png', 'gif']):
                with Image.open(metadata.file_path) as img:
                    metadata.perceptual_hash = str(imagehash.phash(img))
                    
        except Exception as e:
            self.log_message(f"Hash generation failed for {metadata.file_name}: {e}", "WARNING")
    
    def organize_file(self, metadata: PhotoMetadata, et: exiftool.ExifToolHelper) -> bool:
        """Actually organize/copy the file with proper naming and metadata updates"""
        try:
            # Setup output paths
            output_path_base = os.path.join(self.config.documents_dir, self.config.output_dir)
            
            # Create base output directory if it doesn't exist
            if not os.path.exists(output_path_base):
                os.makedirs(output_path_base)
            
            # Determine output file extension (correct if metadata mismatch)
            output_extension = metadata.file_extension
            
            # Generate output filename based on datetime
            if metadata.final_datetime:
                # Format: YYYYMMDD_HHMMSS.ext
                datetime_str = metadata.final_datetime.strftime("%Y%m%d_%H%M%S")
                output_filename = f"{datetime_str}.{output_extension}"
            else:
                # Fallback to original filename
                output_filename = metadata.file_name
            
            # Determine output directory
            output_path = output_path_base
            
            if metadata.action == ActionType.CHECK:
                # Low confidence files go to CHECK folder
                output_path = os.path.join(output_path_base, 'CHECK')
            elif metadata.action == ActionType.DUPLICATE:
                # Duplicate files go to DUPLICATES folder
                output_path = os.path.join(output_path_base, 'DUPLICATES')
            elif self.config.output_dir_years and metadata.final_datetime:
                # Organize by year
                output_path = os.path.join(output_path_base, str(metadata.final_datetime.year))
            
            # Create output directory if needed
            if not os.path.exists(output_path):
                os.makedirs(output_path)
            
            # Full output file path
            output_file_path = os.path.join(output_path, output_filename)
            
            # Handle filename conflicts by incrementing seconds
            original_datetime = metadata.final_datetime
            while os.path.exists(output_file_path):
                self.log_message(f"Filename conflict: {output_filename}, incrementing...", "WARNING")
                
                if metadata.final_datetime:
                    # Increment by 1 second
                    metadata.final_datetime = metadata.final_datetime + datetime.timedelta(seconds=1)
                    datetime_str = metadata.final_datetime.strftime("%Y%m%d_%H%M%S")
                    output_filename = f"{datetime_str}.{output_extension}"
                else:
                    # Add counter to filename
                    base_name, ext = os.path.splitext(output_filename)
                    counter = 1
                    output_filename = f"{base_name}_{counter:02d}{ext}"
                    counter += 1
                
                output_file_path = os.path.join(output_path, output_filename)
            
            # Copy the file
            shutil.copy2(metadata.file_path, output_file_path)
            self.log_message(f"Copied: {metadata.file_name} -> {output_filename}", "OKGREEN")
            
            # Update metadata in the copied file (if high confidence and not CHECK)
            if (metadata.confidence in [ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM] and 
                metadata.action != ActionType.CHECK and 
                metadata.final_datetime):
                
                try:
                    # Prepare metadata updates
                    datetime_meta_format = metadata.final_datetime.strftime("%Y:%m:%d %H:%M:%S")
                    
                    metadata_updates = {
                        'DateTimeOriginal': datetime_meta_format,
                        'FileCreateDate': datetime_meta_format,
                        'ModifyDate': datetime_meta_format
                    }
                    
                    # Add tags if available
                    all_tags = metadata.directory_tags + metadata.filename_tags
                    if all_tags:
                        tags_string = ';'.join(all_tags)
                        metadata_updates['XPKeywords'] = tags_string
                        metadata_updates['Subject'] = tags_string  # XMP subject tags as string
                    
                    # Update file metadata
                    et.set_tags(output_file_path, tags=metadata_updates, params=['-overwrite_original'])
                    self.log_message(f"Updated metadata for: {output_filename}", "OKGREEN")
                    
                except Exception as e:
                    self.log_message(f"Metadata update failed for {output_filename}: {e}", "WARNING")
                    # Don't fail the whole operation for metadata update issues
            
            return True
            
        except Exception as e:
            self.log_message(f"File organization failed for {metadata.file_name}: {e}", "ERROR")
            metadata.error_message = f"Organization failed: {str(e)}"
            return False
    
    def determine_confidence(self, metadata: PhotoMetadata):
        """Determine final datetime and confidence level"""
        """Determine final datetime and confidence level"""
        all_datetimes = []
        
        if '[FORCE]' in metadata.file_name and metadata.filename_datetime:
            metadata.final_datetime = metadata.filename_datetime
            metadata.confidence = ConfidenceLevel.HIGH
            metadata.action = ActionType.PROCESS
            return
        
        # Collect all datetimes
        if metadata.filename_datetime:
            all_datetimes.append(metadata.filename_datetime)
        all_datetimes.extend(metadata.exif_datetimes)
        all_datetimes.extend(metadata.other_datetimes)
        
        if not all_datetimes:
            metadata.confidence = ConfidenceLevel.LOW
            metadata.action = ActionType.CHECK
            return
        
        metadata.final_datetime = min(all_datetimes)
        
        # Confidence logic
        exif_count = len(metadata.exif_datetimes)
        has_filename_dt = metadata.filename_datetime is not None
        
        if exif_count >= 2 and has_filename_dt:
            metadata.confidence = ConfidenceLevel.HIGH
            metadata.action = ActionType.PROCESS
        elif exif_count >= 1 or has_filename_dt:
            metadata.confidence = ConfidenceLevel.MEDIUM  
            metadata.action = ActionType.PROCESS
        else:
            metadata.confidence = ConfidenceLevel.LOW
            metadata.action = ActionType.CHECK
    
    def convert_str_to_datetime(self, input_string: str) -> Optional[datetime.datetime]:
        """Convert string to datetime (simplified version)"""
        # Implementation similar to your original, but streamlined
        if not isinstance(input_string, str):
            return None
            
        stripped = input_string.replace(':', '')
        datetime_match = re.search(self.config.valid_date_regex, stripped)
        
        if not datetime_match:
            return None
            
        # Basic parsing (can be expanded)
        try:
            datetime_string = stripped[datetime_match.span()[0]:]
            cleaned = datetime_string.replace('-', '').replace('.', '').replace('_', '')
            
            if len(cleaned) < 8:
                return None
                
            year = int(cleaned[:4])
            if year < self.config.valid_date_year_min or year > self.config.valid_date_year_max:
                return None
            
            month = int(cleaned[4:6])
            day = int(cleaned[6:8])
            hour = int(cleaned[8:10]) if len(cleaned) > 8 else 23
            minute = int(cleaned[10:12]) if len(cleaned) > 10 else 59
            second = int(cleaned[12:14]) if len(cleaned) > 12 else 0
            
            return datetime.datetime(year, month, day, hour, minute, second)
            
        except (ValueError, IndexError):
            return None
    
    def start_bulk_processing(self, callback_progress=None) -> str:
        """Start bulk processing in background threads"""
        session_id = f"session_{int(time.time())}"
        self.processing_active = True
        
        # Scan all files
        all_files = self.scan_directories()
        self.stats['total_files'] = len(all_files)
        self.stats['queued'] = len(all_files)
        
        # Create batches
        batches = [all_files[i:i + self.config.batch_size] 
                  for i in range(0, len(all_files), self.config.batch_size)]
        
        self.log_message(f"Starting processing of {len(all_files)} files in {len(batches)} batches")
        
        # Process batches in parallel
        def process_all_batches():
            with ThreadPoolExecutor(max_workers=self.config.max_workers) as executor:
                futures = []
                
                for batch in batches:
                    if not self.processing_active:
                        break
                    future = executor.submit(self.process_file_batch, batch)
                    futures.append(future)
                
                # Wait for completion
                for future in futures:
                    if not self.processing_active:
                        future.cancel()
                    else:
                        try:
                            batch_results = future.result()
                            # Results are already handled in process_file_batch
                        except Exception as e:
                            self.log_message(f"Batch processing error: {e}", "ERROR")
            
            self.log_message("Bulk processing completed!")
            self.notify_progress({
                'type': 'processing_complete',
                'session_id': session_id,
                'stats': self.stats.copy()
            })
        
        # Start processing in background thread
        processing_thread = threading.Thread(target=process_all_batches)
        processing_thread.daemon = True
        processing_thread.start()
        
        return session_id
    
    def stop_processing(self):
        """Stop the bulk processing"""
        self.processing_active = False
        self.log_message("Processing stop requested")
    
    def get_files_for_review(self, action_type: ActionType, limit: Optional[int] = 50) -> List[Dict]:
        """Get files that need user review"""
        if self.db:
            # Get from database
            files = self.db.get_files_by_status(ProcessingStatus.USER_ACTION_NEEDED, limit)
            return files
        else:
            # Return empty if no database
            return []
    
    def get_processing_summary(self) -> Dict:
        """Get comprehensive processing summary for GUI display"""
        if not self.db:
            return {'error': 'Database not available'}
            
        with self.db.get_connection() as conn:
            # Get overall stats
            stats = {}
            for status in ProcessingStatus:
                cursor = conn.execute(
                    "SELECT COUNT(*) as count FROM photo_metadata WHERE status = ?", 
                    (status.value,)
                )
                stats[status.value] = cursor.fetchone()['count']
            
            # Get confidence distribution
            confidence_stats = {}
            for confidence in ConfidenceLevel:
                cursor = conn.execute(
                    "SELECT COUNT(*) as count FROM photo_metadata WHERE confidence = ?",
                    (confidence.value,)
                )
                confidence_stats[confidence.value] = cursor.fetchone()['count']
            
            # Get duplicate groups summary
            cursor = conn.execute(
                "SELECT duplicate_group, COUNT(*) as count FROM photo_metadata WHERE duplicate_group IS NOT NULL GROUP BY duplicate_group"
            )
            duplicate_groups = {row['duplicate_group']: row['count'] for row in cursor.fetchall()}
            
            # Get recent activity (last 100 processed files)
            cursor = conn.execute(
                "SELECT file_name, confidence, action, processed_time FROM photo_metadata WHERE processed_time IS NOT NULL ORDER BY processed_time DESC LIMIT 100"
            )
            recent_files = [dict(row) for row in cursor.fetchall()]
            
            return {
                'processing_stats': stats,
                'confidence_distribution': confidence_stats,
                'duplicate_groups': duplicate_groups,
                'recent_activity': recent_files,
                'total_groups_with_duplicates': len(duplicate_groups)
            }
    
    def get_duplicate_groups_for_resolution(self) -> List[Dict]:
        """Get duplicate groups formatted for GUI resolution"""
        if not self.duplicate_detector:
            return []
        
        return self.duplicate_detector.get_duplicate_resolution_data()
    
    def apply_duplicate_resolution(self, group_id: str, keep_file_path: str, delete_file_paths: List[str]) -> bool:
        """Apply user's duplicate resolution decision"""
        try:
            if not self.db:
                return False
            
            with self.db.get_connection() as conn:
                # Mark the kept file as user-verified and approved
                conn.execute('''
                    UPDATE photo_metadata 
                    SET action = ?, user_verified = ?, duplicate_group = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE file_path = ?
                ''', (ActionType.PROCESS.value, True, keep_file_path))
                
                # Mark deleted files as user-deleted
                for delete_path in delete_file_paths:
                    conn.execute('''
                        UPDATE photo_metadata 
                        SET action = ?, user_verified = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE file_path = ?
                    ''', (ActionType.ERROR.value, True, ProcessingStatus.USER_ACTION_NEEDED.value, delete_path))
                
                conn.commit()
                
            self.log_message(f"Duplicate resolution applied for group {group_id}: kept {keep_file_path}", "OKGREEN")
            return True
            
        except Exception as e:
            self.log_message(f"Failed to apply duplicate resolution: {e}", "ERROR")
            return False
    
    def get_files_for_gui_review(self, filter_type: str, page: int = 0, page_size: int = 20) -> Dict:
        """Get paginated files for GUI review with thumbnails and metadata"""
        if not self.db:
            return {'files': [], 'total': 0, 'page': page}
            
        offset = page * page_size
        
        # Define filter queries
        filter_queries = {
            'check': "status = 'user_action_needed' AND action = 'check'",
            'duplicates': "action = 'duplicate'",
            'errors': "status = 'error'", 
            'low_confidence': "confidence = 'low'",
            'completed': "status = 'completed'",
            'all': "1=1"
        }
        
        where_clause = filter_queries.get(filter_type, "1=1")
        
        with self.db.get_connection() as conn:
            # Get total count
            cursor = conn.execute(f"SELECT COUNT(*) as count FROM photo_metadata WHERE {where_clause}")
            total = cursor.fetchone()['count']
            
            # Get paginated results
            cursor = conn.execute(f"""
                SELECT file_path, file_name, file_size, confidence, action, final_datetime, 
                       duplicate_group, error_message, megapixels, directory_tags, filename_tags
                FROM photo_metadata 
                WHERE {where_clause} 
                ORDER BY processed_time DESC, file_name
                LIMIT ? OFFSET ?
            """, (page_size, offset))
            
            files = []
            for row in cursor.fetchall():
                file_data = dict(row)
                
                # Parse JSON fields
                try:
                    file_data['directory_tags'] = json.loads(file_data['directory_tags'] or '[]')
                    file_data['filename_tags'] = json.loads(file_data['filename_tags'] or '[]') 
                except json.JSONDecodeError:
                    file_data['directory_tags'] = []
                    file_data['filename_tags'] = []
                
                # Add file exists check
                file_data['file_exists'] = os.path.exists(file_data['file_path'])
                
                files.append(file_data)
            
            return {
                'files': files,
                'total': total,
                'page': page,
                'page_size': page_size,
                'total_pages': (total + page_size - 1) // page_size
            }
    
    def apply_user_decision(self, file_path: str, decision_data: Dict) -> bool:
        """Apply user's decision to a file (timestamp correction, tag addition, etc.)"""
        if not self.db:
            return False
            
        try:
            with self.db.get_connection() as conn:
                updates = []
                params = []
                
                # Handle timestamp correction
                if 'corrected_datetime' in decision_data:
                    updates.append("final_datetime = ?")
                    params.append(decision_data['corrected_datetime'])
                    updates.append("confidence = ?")
                    params.append(ConfidenceLevel.HIGH.value)
                
                # Handle additional tags
                if 'additional_tags' in decision_data:
                    # Get current tags
                    cursor = conn.execute("SELECT filename_tags FROM photo_metadata WHERE file_path = ?", (file_path,))
                    row = cursor.fetchone()
                    if row:
                        current_tags = json.loads(row['filename_tags'] or '[]')
                        new_tags = current_tags + decision_data['additional_tags']
                        updates.append("filename_tags = ?")
                        params.append(json.dumps(new_tags))
                
                # Handle action change (approve for processing, mark as skip, etc.)
                if 'new_action' in decision_data:
                    updates.append("action = ?")
                    params.append(decision_data['new_action'])
                    
                    if decision_data['new_action'] == ActionType.PROCESS.value:
                        updates.append("status = ?")
                        params.append(ProcessingStatus.COMPLETED.value)
                
                # Mark as user verified
                updates.append("user_verified = ?")
                params.append(True)
                updates.append("updated_at = ?")
                params.append(datetime.datetime.now().isoformat())
                
                if updates:
                    query = f"UPDATE photo_metadata SET {', '.join(updates)} WHERE file_path = ?"
                    params.append(file_path)
                    conn.execute(query, params)
                    conn.commit()
                    return True
                    
        except Exception as e:
            self.log_message(f"Error applying user decision for {file_path}: {e}", "ERROR")
            return False
        
        return False

class DuplicateDetector:
    """Handles perceptual duplicate detection with user resolution support"""
    
    def __init__(self, similarity_threshold: int = 5):
        self.threshold = similarity_threshold
        self.duplicate_groups: Dict[str, List[PhotoMetadata]] = {}
        self.processed_hashes: List[Tuple[str, str]] = []  # (hash, group_id)
    
    def add_file(self, metadata: PhotoMetadata) -> Optional[str]:
        """Add file to duplicate detection, return group ID if duplicate found"""
        if not metadata.perceptual_hash:
            return None
        
        # Find similar hashes
        for existing_hash, existing_group_id in self.processed_hashes:
            try:
                hash_diff = (imagehash.hex_to_hash(metadata.perceptual_hash) - 
                           imagehash.hex_to_hash(existing_hash))
                
                if hash_diff <= self.threshold:
                    # Found similar image - add to existing group
                    if existing_group_id not in self.duplicate_groups:
                        self.duplicate_groups[existing_group_id] = []
                    
                    self.duplicate_groups[existing_group_id].append(metadata)
                    return existing_group_id
                    
            except Exception:
                continue
        
        # No duplicates found - this could be start of new group
        group_id = f"group_{metadata.perceptual_hash[:8]}"
        self.processed_hashes.append((metadata.perceptual_hash, group_id))
        
        # Don't create group until we find a duplicate
        return None
    
    def finalize_groups(self) -> Dict[str, List[PhotoMetadata]]:
        """Finalize duplicate groups and add quality rankings"""
        
        # Only keep groups with 2+ files
        final_groups = {}
        
        for group_id, files in self.duplicate_groups.items():
            if len(files) >= 2:
                # Sort files by quality metrics for user choice
                sorted_files = self.rank_duplicates_by_quality(files)
                final_groups[group_id] = sorted_files
        
        return final_groups
    
    def rank_duplicates_by_quality(self, files: List[PhotoMetadata]) -> List[PhotoMetadata]:
        """Rank duplicate files by quality for user selection"""
        
        def quality_score(metadata: PhotoMetadata) -> tuple:
            """Return tuple for sorting - higher values = better quality"""
            
            # File size (larger usually better)
            size_score = metadata.file_size
            
            # Megapixels (higher resolution better)
            mp_score = metadata.megapixels
            
            # Confidence level (high confidence better)
            confidence_score = {
                ConfidenceLevel.HIGH: 3,
                ConfidenceLevel.MEDIUM: 2,
                ConfidenceLevel.LOW: 1,
                ConfidenceLevel.ERROR: 0
            }.get(metadata.confidence, 0)
            
            # File extension preference (original > copy indicators)
            ext_score = 0
            if 'copy' not in metadata.file_name.lower():
                ext_score += 10
            if 'original' in metadata.file_name.lower():
                ext_score += 5
            
            # EXIF data richness (more EXIF data = better)
            exif_score = len(metadata.exif_datetimes)
            
            return (confidence_score, mp_score, size_score, ext_score, exif_score)
        
        # Sort by quality score (best first)
        return sorted(files, key=quality_score, reverse=True)
    
    def get_duplicate_resolution_data(self) -> List[Dict]:
        """Get structured data for GUI duplicate resolution"""
        resolution_data = []
        
        for group_id, files in self.finalize_groups().items():
            group_info = {
                'group_id': group_id,
                'total_files': len(files),
                'recommended_keep': files[0] if files else None,  # Highest quality
                'files': []
            }
            
            for i, file_metadata in enumerate(files):
                file_info = {
                    'file_path': file_metadata.file_path,
                    'file_name': file_metadata.file_name,
                    'file_size': file_metadata.file_size,
                    'megapixels': file_metadata.megapixels,
                    'confidence': file_metadata.confidence.value,
                    'final_datetime': file_metadata.final_datetime.isoformat() if file_metadata.final_datetime else None,
                    'is_recommended': i == 0,  # First file is recommended (highest quality)
                    'quality_notes': self.get_quality_notes(file_metadata, files)
                }
                group_info['files'].append(file_info)
            
            resolution_data.append(group_info)
        
        return resolution_data
    
    def get_quality_notes(self, metadata: PhotoMetadata, all_files: List[PhotoMetadata]) -> List[str]:
        """Generate quality assessment notes for GUI display"""
        notes = []
        
        # Size comparison
        max_size = max(f.file_size for f in all_files)
        if metadata.file_size == max_size:
            notes.append("Largest file")
        
        # Megapixels comparison  
        max_mp = max(f.megapixels for f in all_files)
        if metadata.megapixels == max_mp and max_mp > 0:
            notes.append("Highest resolution")
        
        # Confidence level
        if metadata.confidence == ConfidenceLevel.HIGH:
            notes.append("High confidence metadata")
        elif metadata.confidence == ConfidenceLevel.LOW:
            notes.append("Low confidence metadata")
        
        # Filename indicators
        name_lower = metadata.file_name.lower()
        if 'copy' in name_lower:
            notes.append("Appears to be a copy")
        if 'original' in name_lower:
            notes.append("Marked as original")
        if 'edit' in name_lower or 'modified' in name_lower:
            notes.append("May be edited version")
        
        return notes

def main():
    """Main function for bulk processing"""
    config = ProcessingConfig()
    
    # For command-line usage, run without GUI
    processor = BulkPhotoProcessor(config)
    
    def progress_callback(update):
        """Simple console progress callback"""
        if update['type'] == 'stats_update':
            stats = update['stats']
            print(f"Progress: {stats['completed']}/{stats['total_files']} completed, "
                  f"{stats['user_action_needed']} need review, {stats['errors']} errors")
    
    processor.add_progress_callback(progress_callback)
    
    # Start processing
    session_id = processor.start_bulk_processing()
    
    # Keep alive until processing is done
    try:
        while processor.processing_active:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping processing...")
        processor.stop_processing()

if __name__ == '__main__':
    main()