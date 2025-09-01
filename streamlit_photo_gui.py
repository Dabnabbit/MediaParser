#!/usr/bin/env python3
"""
Improved Streamlit GUI for PhotoTimeFixer Enhanced
Addresses usability issues and provides better workflow
"""

import streamlit as st
import os
import json
import datetime
import sqlite3
from pathlib import Path
from PIL import Image
import pandas as pd
from typing import Dict, List, Optional
import base64
import time
import threading

import streamlit as st
import os
import json
import datetime
import sqlite3
from pathlib import Path
from PIL import Image
import pandas as pd
import typing
import base64
import time
import threading

# Better import pattern for the enhanced processor
if typing.TYPE_CHECKING:
    from enhanced_photo_fixer import BulkPhotoProcessor, ProcessingConfig, ActionType, ConfidenceLevel, ProcessingStatus

try:
    from enhanced_photo_fixer import BulkPhotoProcessor, ProcessingConfig, ActionType, ConfidenceLevel, ProcessingStatus
    PROCESSOR_AVAILABLE = True
except ImportError:
    st.error("❌ Could not import enhanced_photo_fixer.py - make sure it's in the same directory")
    PROCESSOR_AVAILABLE = False

# Page configuration
st.set_page_config(
    page_title="PhotoTimeFixer Pro",
    page_icon="📸",
    layout="wide",
    initial_sidebar_state="expanded"
)

def init_session_state():
    """Initialize Streamlit session state"""
    if 'processor' not in st.session_state:
        st.session_state.processor = None
    if 'processing_active' not in st.session_state:
        st.session_state.processing_active = False
    if 'processing_complete' not in st.session_state:
        st.session_state.processing_complete = False
    if 'current_page' not in st.session_state:
        st.session_state.current_page = 'configuration'
    if 'processing_stats' not in st.session_state:
        st.session_state.processing_stats = {}
    if 'last_update_time' not in st.session_state:
        st.session_state.last_update_time = 0

def load_image_as_base64(image_path: str, max_size: tuple = (300, 300)) -> str:
    """Load and resize image, return as base64 for display"""
    try:
        with Image.open(image_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            import io
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85)
            
            img_data = base64.b64encode(buffer.getvalue()).decode()
            return f"data:image/jpeg;base64,{img_data}"
    except Exception:
        return ""

    
def configuration_page():
    """Configuration and setup page"""
    st.title("📸 PhotoTimeFixer Pro")
    st.markdown("### Configuration")
    
    if not PROCESSOR_AVAILABLE:
        st.error("❌ Enhanced photo processor not available")
        return
    
    # Directory selection (outside of form)
    st.subheader("📁 Directory Settings")
    
    col1, col2 = st.columns([3, 1])
    with col1:
        input_dir = st.text_input(
            "Photos Directory", 
            value=st.session_state.get('input_dir', ''),
            help="Full path to directory containing photos to organize",
            placeholder="C:\\Users\\YourName\\Photos"
        )
    with col2:
        st.write("")  # Spacing
        if st.button("📁 Browse Help"):
            st.info("💡 **How to get the directory path:**\n1. Open File Explorer\n2. Navigate to your photos folder\n3. Click in the address bar\n4. Copy the path (Ctrl+C)\n5. Paste it in the text box above")
        
    # Validate directory (outside of form)
    if input_dir:
        if os.path.exists(input_dir):
            # Count files in directory
            image_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.avi')
            image_count = sum(1 for f in Path(input_dir).rglob('*') if f.suffix.lower() in image_extensions)
            st.success(f"✅ Directory found with {image_count:,} media files")
        else:
            st.error("❌ Directory not found")
    
    # Configuration form (separate from directory selection)
    with st.form("config_form"):
        output_dir = st.text_input(
            "Output Directory Name",
            value="ORGANIZED_PHOTOS",
            help="Name of output directory (will be created in input directory)"
        )
        
        st.subheader("⚙️ Processing Settings")
        
        col3, col4 = st.columns(2)
        with col3:
            batch_size = st.number_input("Batch Size", value=25, min_value=5, max_value=100)
            max_workers = st.number_input("Max Workers", value=4, min_value=1, max_value=16)
            
        with col4:
            output_by_year = st.checkbox("Organize by Year", value=True)
            enable_duplicates = st.checkbox("Detect Duplicates", value=True)
            
        col5, col6 = st.columns(2)
        with col5:
            clear_output = st.checkbox("Clear Output Directory", value=False, 
                                     help="⚠️ This will delete existing organized photos")
        with col6:
            similarity_threshold = st.slider("Duplicate Similarity (1=strict, 10=loose)", 1, 10, 5)
        
        submitted = st.form_submit_button("🚀 Initialize Processor", type="primary")
        
        if submitted:
            if not input_dir or not os.path.exists(input_dir):
                st.error("❌ Please enter a valid photos directory")
            else:
                # Create configuration
                config = ProcessingConfig(
                    documents_dir=input_dir,
                    output_dir=output_dir,
                    output_dir_years=output_by_year,
                    output_dir_clear=clear_output,
                    batch_size=batch_size,
                    max_workers=max_workers,
                    enable_duplicate_detection=enable_duplicates,
                    duplicate_similarity_threshold=similarity_threshold,
                    enable_database=True,
                    database_file=os.path.join(input_dir, 'photo_gui.db')
                )
                
                # Create processor
                try:
                    processor = BulkPhotoProcessor(config)
                    st.session_state.processor = processor
                    st.session_state.config = config
                    st.session_state.input_dir = input_dir
                    st.session_state.processing_complete = False
                    st.success("✅ Processor initialized successfully!")
                    st.info("👆 Use the sidebar to navigate to Processing")
                    
                except Exception as e:
                    st.error(f"❌ Failed to initialize processor: {e}")

def processing_page():
    """Processing control page"""
    st.title("🔄 Photo Processing")
    
    if not st.session_state.processor:
        st.warning("⚠️ Please complete configuration first")
        return
    
    processor = st.session_state.processor
    
    # Processing controls
    col1, col2, col3 = st.columns([2, 1, 1])
    
    with col1:
        if not st.session_state.processing_active and not st.session_state.processing_complete:
            if st.button("▶️ Start Processing", type="primary"):
                st.session_state.processing_active = True
                st.session_state.processing_complete = False
                
                # Create progress callback
                def update_progress(update):
                    if update['type'] == 'stats_update':
                        st.session_state.processing_stats = update['stats']
                        st.session_state.last_update_time = time.time()
                    elif update['type'] == 'processing_complete':
                        st.session_state.processing_active = False
                        st.session_state.processing_complete = True
                        st.session_state.last_update_time = time.time()
                    elif update['type'] == 'file_completed':
                        # Update timestamp on any activity
                        st.session_state.last_update_time = time.time()
                
                processor.add_progress_callback(update_progress)
                
                # Start processing in background
                session_id = processor.start_bulk_processing()
                st.session_state.last_update_time = time.time()  # Initialize timestamp
                st.success(f"✅ Processing started! Session: {session_id}")
                time.sleep(1)  # Give it a moment to start
                st.rerun()
                
        elif st.session_state.processing_active:
            if st.button("⏹️ Stop Processing", type="secondary"):
                processor.stop_processing()
                st.session_state.processing_active = False
                st.warning("⚠️ Processing stopped")
                st.rerun()
                
        elif st.session_state.processing_complete:
            st.success("✅ Processing completed!")
            if st.button("🔄 Process New Photos", type="primary"):
                st.session_state.processing_complete = False
                st.session_state.processing_stats = {}
    
    with col2:
        if st.button("🔄 Refresh"):
            st.rerun()
    
    with col3:
        if st.button("📊 View Summary"):
            st.session_state.current_page = 'summary'
            st.rerun()
    
    # Status display
    if st.session_state.processing_active:
        # Check if processing is actually still active
        current_time = time.time()
        last_update = st.session_state.get('last_update_time', current_time)
        time_since_update = current_time - last_update
        
        if time_since_update > 15:  # No updates for 15 seconds
            st.warning(f"🤔 No updates for {time_since_update:.0f} seconds - processing may have stalled")
        else:
            st.info("🔄 Processing in progress...")
            
        # Auto-refresh every 3 seconds
        time.sleep(3)
        st.rerun()
    elif st.session_state.processing_complete:
        st.success("✅ Processing completed successfully!")
    
    # Stats display
    stats = st.session_state.processing_stats
    if stats:
        st.subheader("📊 Processing Statistics")
        
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Total Files", stats.get('total_files', 0))
        with col2:
            st.metric("Completed", stats.get('completed', 0))
        with col3:
            st.metric("Need Review", stats.get('user_action_needed', 0))
        with col4:
            st.metric("Errors", stats.get('errors', 0))
        
        # Progress bar
        total = stats.get('total_files', 1)
        completed = stats.get('completed', 0)
        progress = completed / total if total > 0 else 0
        st.progress(progress, text=f"Progress: {completed}/{total} files ({progress:.1%})")
        
        # Show what needs attention
        needs_review = stats.get('user_action_needed', 0)
        errors = stats.get('errors', 0)
        if needs_review > 0 or errors > 0:
            st.info(f"📝 Ready for review: {needs_review + errors} files need your attention")

def get_duplicate_groups_from_db(processor) -> typing.Dict[str, typing.List[typing.Dict]]:
    """Get duplicate groups with full file information"""
    if not processor.db:
        return {}
    
    try:
        with processor.db.get_connection() as conn:
            # Get all files that are part of duplicate groups
            cursor = conn.execute("""
                SELECT duplicate_group, file_path, file_name, file_size, megapixels, confidence
                FROM photo_metadata 
                WHERE duplicate_group IS NOT NULL 
                ORDER BY duplicate_group, file_size DESC
            """)
            
            duplicate_files = cursor.fetchall()
            
            # Group by duplicate_group
            groups = {}
            for row in duplicate_files:
                group_id = row['duplicate_group']
                if group_id not in groups:
                    groups[group_id] = []
                
                groups[group_id].append({
                    'file_path': row['file_path'],
                    'file_name': row['file_name'],
                    'file_size': row['file_size'],
                    'megapixels': row['megapixels'],
                    'confidence': row['confidence']
                })
            
            return groups
    except Exception:
        return {}

def review_page():
    """Photo review page with improved filtering"""
    st.title("🔍 Photo Review")
    
    if not st.session_state.processor:
        st.warning("⚠️ Please complete configuration first")
        return
    
    processor = st.session_state.processor
    
    # Simplified filter options
    st.subheader("📋 Review Categories")
    
    col1, col2 = st.columns([2, 1])
    with col1:
        # Initialize counts to zero to avoid unbound errors
        needs_review_count = 0
        duplicate_groups_count = 0
        error_count = 0
        completed_count = 0
        # Get current counts for each category
        try:
            if processor.db:
                with processor.db.get_connection() as conn:
                    # Count files needing review (all non-high confidence, non-completed)
                    cursor = conn.execute("""
                        SELECT COUNT(*) as count FROM photo_metadata 
                        WHERE confidence != 'high' OR action != 'process' OR status = 'error'
                    """)
                    needs_review_count = cursor.fetchone()['count']
                    
                    # Count duplicates
                    cursor = conn.execute("""
                        SELECT COUNT(DISTINCT duplicate_group) as count FROM photo_metadata 
                        WHERE duplicate_group IS NOT NULL
                    """)
                    duplicate_groups_count = cursor.fetchone()['count']
                    
                    # Count errors
                    cursor = conn.execute("""
                        SELECT COUNT(*) as count FROM photo_metadata WHERE status = 'error'
                    """)
                    error_count = cursor.fetchone()['count']
                    
                    # Count completed
                    cursor = conn.execute("""
                        SELECT COUNT(*) as count FROM photo_metadata 
                        WHERE confidence = 'high' AND action = 'process' AND status = 'completed'
                    """)
                    completed_count = cursor.fetchone()['count']
        except Exception:
            pass
        
        review_options = [
            f"🔍 All Needing Review ({needs_review_count} files)",
            f"👥 Duplicate Groups ({duplicate_groups_count} groups)",
            f"❌ Errors Only ({error_count} files)",
            f"✅ Successfully Processed ({completed_count} files)"
        ]
        
        review_type = st.selectbox(
            "What would you like to review?",
            review_options,
            key="review_type_select"
        )
    
    with col2:
        page_size = st.selectbox("Items per page", [10, 20, 50], index=1)
        page_num = st.number_input("Page", min_value=0, value=0)
    
    # Handle different review types
    if "All Needing Review" in review_type:
        show_files_needing_review(processor, page_num, page_size)
    elif "Duplicate Groups" in review_type:
        show_duplicate_groups(processor, page_num, page_size)
    elif "Errors Only" in review_type:
        show_error_files(processor, page_num, page_size)
    elif "Successfully Processed" in review_type:
        show_completed_files(processor, page_num, page_size)

def show_files_needing_review(processor, page_num, page_size):
    """Show all files that need some kind of review"""
    try:
        if not processor.db:
            st.error("Database not available")
            return
            
        offset = page_num * page_size
        
        with processor.db.get_connection() as conn:
            # Get files that need review
            cursor = conn.execute("""
                SELECT * FROM photo_metadata 
                WHERE confidence != 'high' OR action != 'process' OR status = 'error'
                ORDER BY 
                    CASE WHEN status = 'error' THEN 1
                         WHEN duplicate_group IS NOT NULL THEN 2
                         WHEN confidence = 'low' THEN 3
                         ELSE 4 END,
                    file_name
                LIMIT ? OFFSET ?
            """, (page_size, offset))
            
            files = [dict(row) for row in cursor.fetchall()]
            
            # Get total count
            cursor = conn.execute("""
                SELECT COUNT(*) as count FROM photo_metadata 
                WHERE confidence != 'high' OR action != 'process' OR status = 'error'
            """)
            total = cursor.fetchone()['count']
        
        if not files:
            st.info("🎉 No files need review! All photos processed successfully.")
            return
            
        st.info(f"📄 Showing {len(files)} of {total} files needing review")
        
        for i, file_info in enumerate(files):
            # Determine issue type
            issue_type = "Unknown"
            if file_info['status'] == 'error':
                issue_type = "❌ Processing Error"
            elif file_info['duplicate_group']:
                issue_type = "👥 Duplicate Detected"
            elif file_info['confidence'] == 'low':
                issue_type = "📉 Low Confidence Timestamp"
            elif file_info['confidence'] == 'medium':
                issue_type = "📊 Medium Confidence Timestamp"
            
            with st.expander(f"{issue_type}: {file_info['file_name']}", expanded=i < 2):
                col1, col2 = st.columns([1, 2])
                
                with col1:
                    # Show thumbnail
                    if os.path.exists(file_info['file_path']):
                        img_b64 = load_image_as_base64(file_info['file_path'])
                        if img_b64:
                            st.markdown(f'<img src="{img_b64}" style="max-width: 100%;">', unsafe_allow_html=True)
                
                with col2:
                    # File details
                    st.write(f"**File:** {file_info['file_name']}")
                    st.write(f"**Size:** {file_info['file_size'] / 1024 / 1024:.1f} MB")
                    st.write(f"**Confidence:** {file_info['confidence']}")
                    
                    if file_info.get('final_datetime'):
                        st.write(f"**Detected Time:** {file_info['final_datetime']}")
                    
                    if file_info.get('error_message'):
                        st.error(f"**Issue:** {file_info['error_message']}")
                    
                    # Show appropriate actions based on issue type
                    show_appropriate_actions(processor, file_info, i)
    
    except Exception as e:
        st.error(f"Error loading files: {e}")

def show_duplicate_groups(processor, page_num, page_size):
    """Show duplicate groups for resolution"""
    duplicate_groups = get_duplicate_groups_from_db(processor)
    
    if not duplicate_groups:
        st.info("🎉 No duplicate groups found!")
        return
    
    st.info(f"📊 Found {len(duplicate_groups)} duplicate groups")
    
    # Pagination for groups
    groups_list = list(duplicate_groups.items())
    start_idx = page_num * page_size
    end_idx = min(start_idx + page_size, len(groups_list))
    page_groups = groups_list[start_idx:end_idx]
    
    for group_idx, (group_id, files) in enumerate(page_groups):
        with st.expander(f"👥 Duplicate Group: {len(files)} similar files", expanded=group_idx < 2):
            
            st.write(f"**Group ID:** {group_id}")
            
            # Show all files in the group in a grid
            cols = st.columns(min(3, len(files)))
            
            for file_idx, file_info in enumerate(files):
                col_idx = file_idx % len(cols)
                
                with cols[col_idx]:
                    st.markdown(f"**{file_info['file_name']}**")
                    
                    # Show thumbnail
                    if os.path.exists(file_info['file_path']):
                        img_b64 = load_image_as_base64(file_info['file_path'], (200, 200))
                        if img_b64:
                            st.markdown(f'<img src="{img_b64}" style="max-width: 100%;">', unsafe_allow_html=True)
                    
                    # File details
                    st.write(f"Size: {file_info['file_size'] / 1024 / 1024:.1f} MB")
                    if file_info['megapixels'] > 0:
                        st.write(f"Resolution: {file_info['megapixels']:.1f} MP")
                    st.write(f"Confidence: {file_info['confidence']}")
                    
                    # Quality indicators
                    if file_idx == 0:  # Largest file (sorted by size)
                        st.success("✅ Largest file (recommended)")
                    
                    if 'copy' in file_info['file_name'].lower():
                        st.warning("⚠️ Appears to be a copy")
                    
                    # Action buttons
                    if st.button(f"✅ Keep This", key=f"keep_{group_idx}_{file_idx}"):
                        # Keep this file, mark others for deletion
                        keep_file = file_info['file_path']
                        delete_files = [f['file_path'] for f in files if f['file_path'] != keep_file]
                        
                        success = processor.apply_duplicate_resolution(group_id, keep_file, delete_files)
                        if success:
                            st.success("✅ Duplicate resolution applied!")
                            st.rerun()
                    
                    if st.button(f"🗑️ Delete", key=f"delete_{group_idx}_{file_idx}"):
                        # Mark this specific file for deletion
                        success = processor.apply_user_decision(
                            file_info['file_path'],
                            {'new_action': ActionType.ERROR.value}
                        )
                        if success:
                            st.success("✅ File marked for deletion")
                            st.rerun()

def show_error_files(processor, page_num, page_size):
    """Show files with processing errors"""
    try:
        file_data = processor.get_files_for_gui_review('errors', page_num, page_size)
        files = file_data.get('files', [])
        
        if not files:
            st.info("🎉 No error files found!")
            return
            
        st.info(f"📄 Showing {len(files)} error files")
        
        for i, file_info in enumerate(files):
            with st.expander(f"❌ {file_info['file_name']}", expanded=i < 3):
                col1, col2 = st.columns([1, 2])
                
                with col1:
                    if os.path.exists(file_info['file_path']):
                        img_b64 = load_image_as_base64(file_info['file_path'])
                        if img_b64:
                            st.markdown(f'<img src="{img_b64}" style="max-width: 100%;">', unsafe_allow_html=True)
                
                with col2:
                    st.write(f"**File:** {file_info['file_name']}")
                    st.error(f"**Error:** {file_info.get('error_message', 'Unknown error')}")
                    
                    # Provide specific actions for errors
                    col_a, col_b, col_c = st.columns(3)
                    with col_a:
                        if st.button(f"🔄 Retry", key=f"retry_{i}"):
                            # Reset error status to try processing again
                            success = processor.apply_user_decision(
                                file_info['file_path'],
                                {'new_action': ActionType.CHECK.value}
                            )
                            if success:
                                st.success("✅ File queued for retry")
                                st.rerun()
                    
                    with col_b:
                        if st.button(f"⏭️ Skip", key=f"skip_{i}"):
                            # Accept the error and skip
                            st.warning("File will be skipped")
                    
                    with col_c:
                        if st.button(f"🔧 Manual Fix", key=f"manual_{i}"):
                            st.session_state[f'manual_mode_{i}'] = True
                    
                    # Manual fix mode
                    if st.session_state.get(f'manual_mode_{i}', False):
                        with st.form(f"manual_form_{i}"):
                            st.write("**Manual correction:**")
                            manual_datetime = st.text_input("Enter correct datetime (YYYY-MM-DD HH:MM:SS)", key=f"manual_dt_{i}")
                            manual_tags = st.text_input("Add tags (comma-separated)", key=f"manual_tags_{i}")
                            
                            if st.form_submit_button("💾 Apply Fix"):
                                updates = {'new_action': ActionType.PROCESS.value}
                                if manual_datetime.strip():
                                    try:
                                        dt = datetime.datetime.strptime(manual_datetime.strip(), "%Y-%m-%d %H:%M:%S")
                                        updates['corrected_datetime'] = dt.isoformat()
                                    except ValueError:
                                        st.error("Invalid datetime format")
                                        continue
                                if manual_tags.strip():
                                    # Convert list to semicolon-separated string
                                    tag_list = [t.strip() for t in manual_tags.split(',')]
                                    updates['additional_tags'] = ';'.join(tag_list)
                                
                                success = processor.apply_user_decision(file_info['file_path'], updates)
                                if success:
                                    st.success("✅ Manual fix applied")
                                    st.session_state[f'manual_mode_{i}'] = False
                                    st.rerun()
    
    except Exception as e:
        st.error(f"Error loading error files: {e}")

def show_completed_files(processor, page_num, page_size):
    """Show successfully processed files"""
    try:
        file_data = processor.get_files_for_gui_review('completed', page_num, page_size)
        files = file_data.get('files', [])
        
        if not files:
            st.info("No completed files found - processing may not be finished")
            return
            
        st.success(f"✅ Showing {len(files)} successfully processed files")
        
        # Show in a more compact grid format
        for i in range(0, len(files), 3):
            cols = st.columns(3)
            for j, col in enumerate(cols):
                if i + j < len(files):
                    file_info = files[i + j]
                    with col:
                        st.write(f"**{file_info['file_name']}**")
                        if os.path.exists(file_info['file_path']):
                            img_b64 = load_image_as_base64(file_info['file_path'], (150, 150))
                            if img_b64:
                                st.markdown(f'<img src="{img_b64}" style="max-width: 100%;">', unsafe_allow_html=True)
                        st.write(f"✅ {file_info['confidence']} confidence")
                        if file_info.get('final_datetime'):
                            st.write(f"📅 {file_info['final_datetime'][:10]}")
    
    except Exception as e:
        st.error(f"Error loading completed files: {e}")

def show_appropriate_actions(processor, file_info, index):
    """Show context-appropriate actions based on the file's issue"""
    
    if file_info['status'] == 'error':
        # Error file actions
        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button(f"🔄 Retry", key=f"retry_{index}"):
                success = processor.apply_user_decision(
                    file_info['file_path'],
                    {'new_action': ActionType.CHECK.value}
                )
                if success:
                    st.success("✅ Queued for retry")
                    st.rerun()
        
        with col2:
            if st.button(f"🔧 Manual Fix", key=f"manual_{index}"):
                st.session_state[f'edit_mode_{index}'] = True
        
        with col3:
            if st.button(f"⏭️ Skip", key=f"skip_{index}"):
                st.warning("File will be skipped")
    
    elif file_info['duplicate_group']:
        # Duplicate file actions
        st.info("👥 This file is part of a duplicate group. Use 'Duplicate Groups' view for full resolution.")
        if st.button(f"🔍 View Duplicates", key=f"view_dups_{index}"):
            st.session_state.current_page = 'review'
            st.rerun()
    
    else:
        # Low/medium confidence actions
        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button(f"✅ Approve", key=f"approve_{index}"):
                success = processor.apply_user_decision(
                    file_info['file_path'],
                    {'new_action': ActionType.PROCESS.value}
                )
                if success:
                    st.success("✅ Approved for processing")
                    st.rerun()
        
        with col2:
            if st.button(f"🏷️ Edit", key=f"edit_{index}"):
                st.session_state[f'edit_mode_{index}'] = True
        
        with col3:
            if st.button(f"⏭️ Skip", key=f"skip2_{index}"):
                success = processor.apply_user_decision(
                    file_info['file_path'],
                    {'new_action': ActionType.ERROR.value}
                )
                if success:
                    st.warning("File skipped")
                    st.rerun()
    
    # Edit mode form
    if st.session_state.get(f'edit_mode_{index}', False):
        with st.form(f"edit_form_{index}"):
            st.write("**Edit file details:**")
            new_tags = st.text_input("Add tags (comma-separated)", key=f"tags_{index}")
            corrected_time = st.text_input("Correct timestamp (YYYY-MM-DD HH:MM:SS)", key=f"time_{index}")
            
            col_save, col_cancel = st.columns(2)
            with col_save:
                if st.form_submit_button("💾 Save Changes"):
                    updates = {'new_action': ActionType.PROCESS.value}
                    if new_tags.strip():
                        tag_list = [t.strip() for t in new_tags.split(',')]
                        updates['additional_tags'] = ';'.join(tag_list)
                    if corrected_time.strip():
                        try:
                            dt = datetime.datetime.strptime(corrected_time.strip(), "%Y-%m-%d %H:%M:%S")
                            updates['corrected_datetime'] = dt.isoformat()
                        except ValueError:
                            st.error("Invalid datetime format")
                            return
                    
                    success = processor.apply_user_decision(file_info['file_path'], updates)
                    if success:
                        st.success("✅ Changes saved")
                        st.session_state[f'edit_mode_{index}'] = False
                        st.rerun()
            
            with col_cancel:
                if st.form_submit_button("❌ Cancel"):
                    st.session_state[f'edit_mode_{index}'] = False
                    st.rerun()

def summary_page():
    """Processing summary page with better organization"""
    st.title("📊 Processing Summary")
    
    if not st.session_state.processor:
        st.warning("⚠️ Please complete configuration first")
        return
    
    processor = st.session_state.processor
    
    try:
        summary = processor.get_processing_summary()
        
        # Overview metrics
        st.subheader("📈 Overview")
        col1, col2, col3, col4 = st.columns(4)
        
        processing_stats = summary.get('processing_stats', {})
        with col1:
            st.metric("Total Files", sum(processing_stats.values()))
        with col2:
            st.metric("Successfully Processed", processing_stats.get('completed', 0))
        with col3:
            st.metric("Need Review", processing_stats.get('user_action_needed', 0))
        with col4:
            st.metric("Errors", processing_stats.get('error', 0))
        
        # Confidence distribution with proper ordering
        st.subheader("🎯 Quality Distribution")
        confidence_dist = summary.get('confidence_distribution', {})
        if confidence_dist:
            # Reorder confidence levels logically
            ordered_confidence = ['high', 'medium', 'low', 'error']
            ordered_data = []
            for conf in ordered_confidence:
                if conf in confidence_dist:
                    ordered_data.append({'Confidence': conf.title(), 'Count': confidence_dist[conf]})
            
            if ordered_data:
                df_confidence = pd.DataFrame(ordered_data)
                
                # Create color-coded chart
                col1, col2 = st.columns([2, 1])
                with col1:
                    st.bar_chart(df_confidence.set_index('Confidence'))
                with col2:
                    st.dataframe(df_confidence, use_container_width=True)
        
        # Duplicate groups summary
        duplicate_groups = summary.get('duplicate_groups', {})
        if duplicate_groups:
            st.subheader("👥 Duplicate Detection")
            
            col1, col2 = st.columns(2)
            with col1:
                st.metric("Duplicate Groups Found", len(duplicate_groups))
                total_duplicates = sum(duplicate_groups.values())
                st.metric("Total Duplicate Files", total_duplicates)
            
            with col2:
                st.write("**Top duplicate groups:**")
                sorted_groups = sorted(duplicate_groups.items(), key=lambda x: x[1], reverse=True)
                for group_id, count in sorted_groups[:5]:
                    st.write(f"• {group_id}: {count} files")
        
        # File organization summary
        if st.session_state.processing_complete:
            st.subheader("📁 Organization Results")
            
            output_path = Path(st.session_state.input_dir) / st.session_state.config.output_dir
            if output_path.exists():
                # Count organized files
                organized_count = sum(1 for f in output_path.rglob('*') if f.is_file() and not f.name.endswith('.db'))
                st.success(f"✅ {organized_count} files successfully organized")
                st.write(f"📁 **Location:** `{output_path}`")
                
                # Show directory structure
                subdirs = [d.name for d in output_path.iterdir() if d.is_dir()]
                if subdirs:
                    st.write("**Organized into folders:**")
                    for subdir in subdirs[:10]:  # Show first 10
                        file_count = sum(1 for f in (output_path / subdir).rglob('*') if f.is_file())
                        st.write(f"  📂 {subdir}/ ({file_count} files)")
        
        # Action recommendations
        st.subheader("💡 Recommended Next Steps")
        
        needs_review = processing_stats.get('user_action_needed', 0)
        errors = processing_stats.get('error', 0)
        duplicates = len(duplicate_groups)
        
        if needs_review > 0:
            st.info(f"📝 Review {needs_review} files that need your attention")
        if duplicates > 0:
            st.info(f"👥 Resolve {duplicates} duplicate groups to save space")
        if errors > 0:
            st.warning(f"❌ Fix {errors} files with processing errors")
        
        if needs_review == 0 and errors == 0 and duplicates == 0:
            st.success("🎉 All files processed successfully! No manual intervention needed.")
        
        # Export options
        st.subheader("📤 Export Options")
        col1, col2, col3 = st.columns(3)
        
        with col1:
            if st.button("💾 Export Summary JSON"):
                summary_json = json.dumps(summary, indent=2, default=str)
                st.download_button(
                    "Download Summary",
                    summary_json,
                    "photo_processing_summary.json",
                    "application/json"
                )
        
        with col2:
            if st.button("📊 Export CSV Report"):
                # Create detailed CSV report
                report_data = []
                for status, count in processing_stats.items():
                    report_data.append({"Category": status.replace('_', ' ').title(), "Count": count})
                
                for conf, count in confidence_dist.items():
                    report_data.append({"Category": f"{conf.title()} Confidence", "Count": count})
                
                df_report = pd.DataFrame(report_data)
                csv = df_report.to_csv(index=False)
                st.download_button(
                    "Download CSV",
                    csv,
                    "photo_processing_report.csv",
                    "text/csv"
                )
        
        with col3:
            if st.button("🗂️ Open Output Folder"):
                output_path = Path(st.session_state.input_dir) / st.session_state.config.output_dir
                if output_path.exists():
                    st.success(f"Output folder: {output_path}")
                    st.code(f"explorer {output_path}", language="bash")
                else:
                    st.warning("Output folder not found")
    
    except Exception as e:
        st.error(f"Error loading summary: {e}")

def main():
    """Main Streamlit application with improved navigation"""
    
    # Initialize session state
    init_session_state()
    
    # Sidebar navigation
    st.sidebar.title("📸 PhotoTimeFixer Pro")
    st.sidebar.markdown("---")
    
    # Navigation with better page names
    page_options = {
        "Configuration": "configuration",
        "Processing": "processing", 
        "Review Photos": "review",
        "Summary": "summary"
    }
    
    # Force page selection to actually work
    current_page_name = None
    for name, key in page_options.items():
        if key == st.session_state.current_page:
            current_page_name = name
            break
    
    if current_page_name is None:
        current_page_name = "Configuration"
        st.session_state.current_page = "configuration"
    
    selected_page = st.sidebar.selectbox(
        "Navigate to:",
        list(page_options.keys()),
        index=list(page_options.keys()).index(current_page_name),
        key="nav_selector"
    )
    
    # Update current page when selection changes
    new_page = page_options[selected_page]
    if new_page != st.session_state.current_page:
        st.session_state.current_page = new_page
        st.rerun()
    
    # Display current page
    if st.session_state.current_page == "configuration":
        configuration_page()
    elif st.session_state.current_page == "processing":
        processing_page()
    elif st.session_state.current_page == "review":
        review_page()
    elif st.session_state.current_page == "summary":
        summary_page()
    
    # Sidebar status with better information
    st.sidebar.markdown("---")
    st.sidebar.subheader("📊 Status")
    
    if st.session_state.processor:
        st.sidebar.success("✅ Processor Ready")
        if st.session_state.get('input_dir'):
            st.sidebar.write(f"📁 {Path(st.session_state.input_dir).name}")
        
        if st.session_state.processing_active:
            st.sidebar.warning("🔄 Processing...")
        elif st.session_state.processing_complete:
            st.sidebar.success("✅ Processing Complete")
        
        # Show key stats in sidebar
        stats = st.session_state.processing_stats
        if stats:
            total = stats.get('total_files', 0)
            completed = stats.get('completed', 0)
            need_review = stats.get('user_action_needed', 0)
            errors = stats.get('errors', 0)
            
            if total > 0:
                progress = completed / total
                st.sidebar.progress(progress, text=f"{completed}/{total}")
            
            if need_review > 0:
                st.sidebar.warning(f"⚠️ {need_review} need review")
            if errors > 0:
                st.sidebar.error(f"❌ {errors} errors")
    else:
        st.sidebar.warning("⚠️ Setup Required")
    
    # Footer
    st.sidebar.markdown("---")
    st.sidebar.markdown("*PhotoTimeFixer Pro v2.1*")
    st.sidebar.markdown("*Enhanced GUI with Smart Review*")

if __name__ == "__main__":
    main()