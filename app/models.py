"""SQLAlchemy database models for MediaParser.

Defines the database schema for files, jobs, duplicates, and user decisions.
Uses SQLAlchemy 2.x type-safe patterns with Mapped and mapped_column.
"""
from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import Optional, List
from sqlalchemy import Integer, String, DateTime, Float, Text, ForeignKey, Index
from sqlalchemy import Enum as SQLEnum, event, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.engine import Engine
from app import db


# ============================================================================
# Enums
# ============================================================================

class JobStatus(str, PyEnum):
    """Job processing status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"        # Job paused by user, can be resumed
    CANCELLED = "cancelled"  # Job cancelled by user, stopped gracefully
    HALTED = "halted"        # Job halted due to error threshold exceeded


class ConfidenceLevel(str, PyEnum):
    """Confidence level for detected timestamps."""
    HIGH = "high"        # Multiple sources agree
    MEDIUM = "medium"    # Single reliable source
    LOW = "low"          # Filename only or conflicts
    NONE = "none"        # No timestamp found


# ============================================================================
# Association Tables
# ============================================================================

job_files = db.Table('job_files',
    db.Column('job_id', Integer, ForeignKey('jobs.id'), primary_key=True),
    db.Column('file_id', Integer, ForeignKey('files.id'), primary_key=True)
)

file_tags = db.Table('file_tags',
    db.Column('file_id', Integer, ForeignKey('files.id'), primary_key=True),
    db.Column('tag_id', Integer, ForeignKey('tags.id'), primary_key=True)
)


# ============================================================================
# Models
# ============================================================================

class File(db.Model):
    """Represents a media file in the system."""
    __tablename__ = 'files'

    # Primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Original file information
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_path: Mapped[str] = mapped_column(String(500), nullable=False)  # Relative to upload folder

    # Storage location
    storage_path: Mapped[Optional[str]] = mapped_column(String(500))  # Current location in storage

    # File hashes for duplicate detection
    file_hash_sha256: Mapped[Optional[str]] = mapped_column(String(64), index=True)  # Exact duplicates
    file_hash_perceptual: Mapped[Optional[str]] = mapped_column(String(64))  # Near-duplicates (Phase 6)

    # File metadata
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    mime_type: Mapped[Optional[str]] = mapped_column(String(100))

    # Timestamp detection
    detected_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime)  # Timezone-aware
    timestamp_source: Mapped[Optional[str]] = mapped_column(String(50))  # 'exif', 'filename', 'filesystem', 'user'
    confidence: Mapped[ConfidenceLevel] = mapped_column(
        SQLEnum(ConfidenceLevel),
        default=ConfidenceLevel.LOW,
        nullable=False
    )
    timestamp_candidates: Mapped[Optional[str]] = mapped_column(Text)  # JSON array of all detected timestamps with sources

    # Review tracking
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # When user confirmed timestamp decision
    final_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime)  # User-confirmed timestamp (may differ from detected_timestamp)
    discarded: Mapped[bool] = mapped_column(default=False, nullable=False)  # True if file excluded from output
    duplicate_group_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)  # Set to file_hash when part of duplicate group

    # Output
    output_path: Mapped[Optional[str]] = mapped_column(String(500))  # Final output location

    # Thumbnail
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500))  # Relative path to thumbnail

    # Processing status
    processing_error: Mapped[Optional[str]] = mapped_column(Text)  # Error message if processing failed

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    jobs: Mapped[List["Job"]] = relationship(
        secondary=job_files,
        back_populates="files"
    )
    duplicate_records: Mapped[List["Duplicate"]] = relationship(
        foreign_keys="Duplicate.file_id",
        back_populates="file"
    )
    is_duplicate_of: Mapped[List["Duplicate"]] = relationship(
        foreign_keys="Duplicate.duplicate_of_id",
        back_populates="duplicate_of"
    )
    user_decisions: Mapped[List["UserDecision"]] = relationship(
        back_populates="file"
    )
    tags: Mapped[List["Tag"]] = relationship(
        secondary=file_tags,
        back_populates="files"
    )

    # Indexes
    __table_args__ = (
        Index('ix_files_detected_timestamp', 'detected_timestamp'),
    )

    def __repr__(self):
        return f"<File {self.id}: {self.original_filename}>"


class Job(db.Model):
    """Background processing job."""
    __tablename__ = 'jobs'

    # Primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Job information
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'import', 'process', 'export'
    status: Mapped[JobStatus] = mapped_column(
        SQLEnum(JobStatus),
        default=JobStatus.PENDING,
        nullable=False
    )

    # Progress tracking
    progress_current: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_filename: Mapped[Optional[str]] = mapped_column(String(255))  # Currently processing file
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # Track errors for threshold

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Error handling
    error_message: Mapped[Optional[str]] = mapped_column(Text)  # Full error for debugging
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    files: Mapped[List["File"]] = relationship(
        secondary=job_files,
        back_populates="jobs"
    )

    # Indexes
    __table_args__ = (
        Index('ix_jobs_status', 'status'),
    )

    def __repr__(self):
        return f"<Job {self.id}: {self.job_type} - {self.status.value}>"


class Duplicate(db.Model):
    """Potential duplicate file relationships."""
    __tablename__ = 'duplicates'

    # Primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Duplicate relationship
    file_id: Mapped[int] = mapped_column(ForeignKey('files.id'), nullable=False)
    duplicate_of_id: Mapped[int] = mapped_column(ForeignKey('files.id'), nullable=False)

    # Match information
    match_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'exact' or 'perceptual'
    similarity_score: Mapped[float] = mapped_column(Float, nullable=False)  # 1.0 for exact, 0.0-1.0 for perceptual

    # Detection timestamp
    detected_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    file: Mapped["File"] = relationship(
        foreign_keys=[file_id],
        back_populates="duplicate_records"
    )
    duplicate_of: Mapped["File"] = relationship(
        foreign_keys=[duplicate_of_id],
        back_populates="is_duplicate_of"
    )

    # Indexes
    __table_args__ = (
        Index('ix_duplicates_file_id_duplicate_of_id', 'file_id', 'duplicate_of_id'),
    )

    def __repr__(self):
        return f"<Duplicate {self.id}: {self.file_id} -> {self.duplicate_of_id} ({self.similarity_score:.2f})>"


class UserDecision(db.Model):
    """User decisions for file processing."""
    __tablename__ = 'user_decisions'

    # Primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Associated file
    file_id: Mapped[int] = mapped_column(ForeignKey('files.id'), nullable=False)

    # Decision information
    decision_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )  # 'timestamp_override', 'keep_duplicate', 'discard_duplicate', 'tag_assignment'
    decision_value: Mapped[str] = mapped_column(Text, nullable=False)  # JSON or simple value

    # Decision timestamp
    decided_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationship
    file: Mapped["File"] = relationship(back_populates="user_decisions")

    def __repr__(self):
        return f"<UserDecision {self.id}: {self.decision_type} for file {self.file_id}>"


class Setting(db.Model):
    """Application settings (key-value store)."""
    __tablename__ = 'settings'

    # Primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Setting key (unique)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    # Setting value (stored as text, can be JSON)
    value: Mapped[str] = mapped_column(Text, nullable=False)

    # Timestamp
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    def touch_updated(self):
        """Manually update the updated_at timestamp."""
        self.updated_at = datetime.now(timezone.utc)

    def __repr__(self):
        return f"<Setting {self.key}: {self.value}>"


class Tag(db.Model):
    """Tags for organizing files."""
    __tablename__ = 'tags'

    # Primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Tag name (normalized to lowercase, unique)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    # Cached count for autocomplete sorting
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    files: Mapped[List["File"]] = relationship(
        secondary=file_tags,
        back_populates="tags"
    )

    # Indexes
    __table_args__ = (
        Index('ix_tags_name', 'name'),
    )

    def __repr__(self):
        return f"<Tag {self.id}: {self.name}>"


# ============================================================================
# SQLite Foreign Key Enforcement
# ============================================================================

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """Enable foreign key constraints for SQLite connections."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
