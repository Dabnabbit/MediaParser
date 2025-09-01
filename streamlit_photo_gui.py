#!/usr/bin/env python3
"""
Streamlit GUI for PhotoTimeFixer Enhanced
Provides web interface for photo review, duplicate resolution, and batch tagging
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

# Import your enhanced processor
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
    if 'current_page' not in st.session_state:
        st.session_state.current_page = 'setup'
    if 'processing_stats' not in st.session_state:
        st.session_state.processing_stats = {}

def load_image_as_base64(image_path: str, max_size: tuple = (300, 300)) -> str:
    """Load and resize image, return as base64 for display"""
    try:
        with Image.open(image_path) as img:
            # Convert to RGB if needed
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize to thumbnail
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Save to bytes
            import io
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85)
            
            # Convert to base64
            img_data = base64.b64encode(buffer.getvalue()).decode()
            return f"data:image/jpeg;base64,{img_data}"
    except Exception as e:
        st.error(f"Error loading image {image_path}: {e}")
        return ""

def setup_page():
    """Configuration and setup page"""
    st.title("📸 PhotoTimeFixer Pro")
    st.markdown("### Setup & Configuration")
    
    if not PROCESSOR_AVAILABLE:
        st.error("❌ Enhanced photo processor not available")
        return
    
    # Configuration form
    with st.form("config_form"):
        st.subheader("📁 Directory Settings")
        
        col1, col2 = st.columns(2)
        with col1:
            input_dir = st.text_input(
                "Photos Directory", 
                value=st.session_state.get('input_dir', ''),
                help="Directory containing photos to organize"
            )
            
        with col2:
            output_dir = st.text_input(
                "Output Directory Name",
                value="ORGANIZED_PHOTOS",
                help="Name of output directory (will be created in input directory)"
            )
        
        st.subheader("⚙️ Processing Settings")
        
        col3, col4, col5 = st.columns(3)
        with col3:
            batch_size = st.number_input("Batch Size", value=25, min_value=1, max_value=100)
            max_workers = st.number_input("Max Workers", value=4, min_value=1, max_value=16)
            
        with col4:
            output_by_year = st.checkbox("Organize by Year", value=True)
            enable_duplicates = st.checkbox("Detect Duplicates", value=True)
            
        with col5:
            clear_output = st.checkbox("Clear Output Directory", value=False)
            similarity_threshold = st.slider("Duplicate Similarity", 1, 10, 5)
        
        submitted = st.form_submit_button("🚀 Initialize Processor")
        
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
                    st.success("✅ Processor initialized successfully!")
                    st.info("👆 Use the sidebar to navigate to Processing")
                    
                except Exception as e:
                    st.error(f"❌ Failed to initialize processor: {e}")

def processing_page():
    """Processing control page"""
    st.title("🔄 Photo Processing")
    
    if not st.session_state.processor:
        st.warning("⚠️ Please complete setup first")
        return
    
    processor = st.session_state.processor
    
    # Processing controls
    col1, col2, col3 = st.columns([2, 1, 1])
    
    with col1:
        if not st.session_state.processing_active:
            if st.button("▶️ Start Processing", type="primary"):
                st.session_state.processing_active = True
                
                # Add progress callback
                def update_progress(update):
                    if update['type'] == 'stats_update':
                        st.session_state.processing_stats = update['stats']
                    elif update['type'] == 'processing_complete':
                        st.session_state.processing_active = False
                
                processor.add_progress_callback(update_progress)
                
                # Start processing
                session_id = processor.start_bulk_processing()
                st.success(f"✅ Processing started! Session: {session_id}")
                st.rerun()
        else:
            if st.button("⏹️ Stop Processing", type="secondary"):
                processor.stop_processing()
                st.session_state.processing_active = False
                st.warning("⚠️ Processing stopped")
                st.rerun()
    
    with col2:
        if st.button("🔄 Refresh Stats"):
            st.rerun()
    
    with col3:
        if st.button("📊 View Summary"):
            st.session_state.current_page = 'summary'
            st.rerun()
    
    # Progress display
    if st.session_state.processing_active:
        st.info("🔄 Processing in progress...")
        
        # Auto-refresh every 2 seconds
        time.sleep(2)
        st.rerun()
    
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

def review_page():
    """Photo review page"""
    st.title("🔍 Photo Review")
    
    if not st.session_state.processor:
        st.warning("⚠️ Please complete setup first")
        return
    
    processor = st.session_state.processor
    
    # Filter options
    col1, col2, col3 = st.columns(3)
    with col1:
        filter_type = st.selectbox(
            "Filter by",
            ['check', 'duplicates', 'errors', 'low_confidence', 'completed', 'all'],
            format_func=lambda x: {
                'check': '⚠️ Need Review',
                'duplicates': '👥 Duplicates', 
                'errors': '❌ Errors',
                'low_confidence': '📉 Low Confidence',
                'completed': '✅ Completed',
                'all': '📋 All Files'
            }.get(x, x)
        )
    
    with col2:
        page_size = st.selectbox("Items per page", [10, 20, 50], index=1)
    
    with col3:
        page_num = st.number_input("Page", min_value=0, value=0)
    
    # Get files
    try:
        file_data = processor.get_files_for_gui_review(filter_type, page_num, page_size)
        files = file_data.get('files', [])
        total = file_data.get('total', 0)
        total_pages = file_data.get('total_pages', 1)
        
        st.info(f"📄 Showing {len(files)} of {total} files (Page {page_num + 1} of {total_pages})")
        
        if not files:
            st.warning("No files found with current filter")
            return
            
        # Display files
        for i, file_info in enumerate(files):
            with st.expander(f"📄 {file_info['file_name']} ({file_info['confidence']} confidence)", expanded=i < 3):
                
                col1, col2 = st.columns([1, 2])
                
                with col1:
                    # Try to show thumbnail
                    if file_info.get('file_exists', False):
                        try:
                            img_b64 = load_image_as_base64(file_info['file_path'])
                            if img_b64:
                                st.markdown(f'<img src="{img_b64}" style="max-width: 100%;">', unsafe_allow_html=True)
                        except Exception as e:
                            st.error(f"Could not load image: {e}")
                    else:
                        st.warning("File not found")
                
                with col2:
                    # File details
                    st.write(f"**Path:** {file_info['file_path']}")
                    st.write(f"**Size:** {file_info['file_size']:,} bytes ({file_info['file_size'] / 1024 / 1024:.1f} MB)")
                    st.write(f"**Confidence:** {file_info['confidence']}")
                    
                    if file_info.get('final_datetime'):
                        st.write(f"**Timestamp:** {file_info['final_datetime']}")
                    
                    if file_info.get('error_message'):
                        st.error(f"**Error:** {file_info['error_message']}")
                    
                    # Tags
                    dir_tags = file_info.get('directory_tags', [])
                    filename_tags = file_info.get('filename_tags', [])
                    if dir_tags or filename_tags:
                        all_tags = dir_tags + filename_tags
                        st.write(f"**Tags:** {', '.join(all_tags)}")
                    
                    # Action buttons
                    col_a, col_b, col_c = st.columns(3)
                    with col_a:
                        if st.button(f"✅ Approve", key=f"approve_{i}"):
                            success = processor.apply_user_decision(
                                file_info['file_path'],
                                {'new_action': ActionType.PROCESS.value}
                            )
                            if success:
                                st.success("✅ Approved for processing")
                                st.rerun()
                    
                    with col_b:
                        if st.button(f"⏭️ Skip", key=f"skip_{i}"):
                            success = processor.apply_user_decision(
                                file_info['file_path'],
                                {'new_action': ActionType.ERROR.value}
                            )
                            if success:
                                st.warning("⏭️ File skipped")
                                st.rerun()
                    
                    with col_c:
                        if st.button(f"🏷️ Edit Tags", key=f"edit_{i}"):
                            st.session_state[f'edit_mode_{i}'] = True
                    
                    # Tag editing
                    if st.session_state.get(f'edit_mode_{i}', False):
                        with st.form(f"tag_form_{i}"):
                            new_tags = st.text_input("Add tags (comma-separated)", "")
                            corrected_time = st.text_input("Correct timestamp (YYYY-MM-DD HH:MM:SS)", "")
                            
                            col_save, col_cancel = st.columns(2)
                            with col_save:
                                if st.form_submit_button("💾 Save"):
                                    updates = {}
                                    if new_tags.strip():
                                        tag_list = [t.strip() for t in new_tags.split(',')]
                                        updates['additional_tags'] = tag_list
                                    if corrected_time.strip():
                                        try:
                                            dt = datetime.datetime.strptime(corrected_time.strip(), "%Y-%m-%d %H:%M:%S")
                                            updates['corrected_datetime'] = dt.isoformat()
                                        except ValueError:
                                            st.error("Invalid timestamp format")
                                    
                                    if updates:
                                        success = processor.apply_user_decision(file_info['file_path'], updates)
                                        if success:
                                            st.success("✅ Updates saved")
                                            st.session_state[f'edit_mode_{i}'] = False
                                            st.rerun()
                            
                            with col_cancel:
                                if st.form_submit_button("❌ Cancel"):
                                    st.session_state[f'edit_mode_{i}'] = False
                                    st.rerun()
        
        # Pagination
        if total_pages > 1:
            st.markdown("---")
            col1, col2, col3, col4, col5 = st.columns(5)
            
            with col1:
                if page_num > 0 and st.button("⏪ First"):
                    st.query_params.page = "0"
                    st.rerun()
            
            with col2:
                if page_num > 0 and st.button("◀️ Previous"):
                    st.query_params.page = str(page_num - 1)
                    st.rerun()
            
            with col3:
                st.write(f"Page {page_num + 1} of {total_pages}")
            
            with col4:
                if page_num < total_pages - 1 and st.button("▶️ Next"):
                    st.query_params.page = str(page_num + 1)
                    st.rerun()
            
            with col5:
                if page_num < total_pages - 1 and st.button("⏩ Last"):
                    st.query_params.page = str(total_pages - 1)
                    st.rerun()
        
    except Exception as e:
        st.error(f"Error loading files: {e}")

def duplicates_page():
    """Duplicate resolution page"""
    st.title("👥 Duplicate Resolution")
    
    if not st.session_state.processor:
        st.warning("⚠️ Please complete setup first")
        return
    
    processor = st.session_state.processor
    
    try:
        duplicate_groups = processor.get_duplicate_groups_for_resolution()
        
        if not duplicate_groups:
            st.info("🎉 No duplicate groups found!")
            return
        
        st.info(f"📊 Found {len(duplicate_groups)} duplicate groups")
        
        for group_idx, group in enumerate(duplicate_groups):
            with st.expander(f"👥 Group {group['group_id']} - {group['total_files']} similar files", expanded=group_idx < 2):
                
                st.write(f"**Recommended to keep:** {group['recommended_keep']['file_name'] if group['recommended_keep'] else 'None'}")
                
                # Display files in grid
                cols = st.columns(min(3, len(group['files'])))
                
                selected_keep = None
                selected_delete = []
                
                for file_idx, file_info in enumerate(group['files']):
                    col_idx = file_idx % len(cols)
                    
                    with cols[col_idx]:
                        st.markdown(f"**{file_info['file_name']}**")
                        
                        # Show thumbnail
                        try:
                            if os.path.exists(file_info['file_path']):
                                img_b64 = load_image_as_base64(file_info['file_path'], (200, 200))
                                if img_b64:
                                    st.markdown(f'<img src="{img_b64}" style="max-width: 100%;">', unsafe_allow_html=True)
                        except Exception:
                            st.error("Could not load image")
                        
                        # File details
                        st.write(f"Size: {file_info['file_size'] / 1024 / 1024:.1f} MB")
                        st.write(f"Resolution: {file_info['megapixels']:.1f} MP")
                        st.write(f"Confidence: {file_info['confidence']}")
                        
                        # Quality notes
                        if file_info.get('quality_notes'):
                            for note in file_info['quality_notes']:
                                if 'Largest' in note or 'Highest' in note:
                                    st.success(f"✅ {note}")
                                elif 'copy' in note.lower():
                                    st.warning(f"⚠️ {note}")
                                else:
                                    st.info(f"ℹ️ {note}")
                        
                        # Selection buttons
                        is_recommended = file_info.get('is_recommended', False)
                        if st.button(
                            f"✅ Keep This One" + (" (Recommended)" if is_recommended else ""), 
                            key=f"keep_{group_idx}_{file_idx}",
                            type="primary" if is_recommended else "secondary"
                        ):
                            selected_keep = file_info['file_path']
                            selected_delete = [f['file_path'] for f in group['files'] if f['file_path'] != selected_keep]
                        
                        if st.button(f"🗑️ Delete", key=f"delete_{group_idx}_{file_idx}"):
                            if file_info['file_path'] not in selected_delete:
                                selected_delete.append(file_info['file_path'])
                
                # Resolution actions
                if selected_keep:
                    st.success(f"Selected to keep: {Path(selected_keep).name}")
                    if st.button(f"💾 Apply Resolution", key=f"apply_{group_idx}", type="primary"):
                        success = processor.apply_duplicate_resolution(
                            group['group_id'],
                            selected_keep,
                            selected_delete
                        )
                        if success:
                            st.success("✅ Duplicate resolution applied!")
                            st.rerun()
                        else:
                            st.error("❌ Failed to apply resolution")
    
    except Exception as e:
        st.error(f"Error loading duplicates: {e}")

def summary_page():
    """Processing summary page"""
    st.title("📊 Processing Summary")
    
    if not st.session_state.processor:
        st.warning("⚠️ Please complete setup first")
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
            st.metric("Completed", processing_stats.get('completed', 0))
        with col3:
            st.metric("Need Review", processing_stats.get('user_action_needed', 0))
        with col4:
            st.metric("Errors", processing_stats.get('error', 0))
        
        # Confidence distribution
        st.subheader("🎯 Confidence Distribution")
        confidence_dist = summary.get('confidence_distribution', {})
        if confidence_dist:
            df_confidence = pd.DataFrame(list(confidence_dist.items()), columns=['Confidence', 'Count'])
            st.bar_chart(df_confidence.set_index('Confidence'))
        
        # Duplicate groups
        duplicate_groups = summary.get('duplicate_groups', {})
        if duplicate_groups:
            st.subheader("👥 Duplicate Groups")
            st.write(f"Found {len(duplicate_groups)} groups with duplicates")
            
            for group_id, count in list(duplicate_groups.items())[:5]:
                st.write(f"• {group_id}: {count} similar files")
        
        # Recent activity
        recent_files = summary.get('recent_activity', [])
        if recent_files:
            st.subheader("🕐 Recent Activity")
            df_recent = pd.DataFrame(recent_files[:10])  # Show last 10
            st.dataframe(df_recent, use_container_width=True)
        
        # Export options
        st.subheader("📤 Export Options")
        col1, col2 = st.columns(2)
        
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
                # Create CSV report
                report_data = []
                for status, count in processing_stats.items():
                    report_data.append({"Category": status, "Count": count})
                
                df_report = pd.DataFrame(report_data)
                csv = df_report.to_csv(index=False)
                st.download_button(
                    "Download CSV",
                    csv,
                    "photo_processing_report.csv",
                    "text/csv"
                )
    
    except Exception as e:
        st.error(f"Error loading summary: {e}")

def main():
    """Main Streamlit application"""
    
    # Initialize session state
    init_session_state()
    
    # Sidebar navigation
    st.sidebar.title("📸 PhotoTimeFixer Pro")
    
    page_options = {
        "Setup": "setup",
        "Processing": "processing", 
        "Review Photos": "review",
        "Resolve Duplicates": "duplicates",
        "Summary": "summary"
    }
    
    selected_page = st.sidebar.selectbox(
        "Navigate to:",
        list(page_options.keys()),
        index=list(page_options.values()).index(st.session_state.current_page)
    )
    
    st.session_state.current_page = page_options[selected_page]
    
    # Display current page
    if st.session_state.current_page == "setup":
        setup_page()
    elif st.session_state.current_page == "processing":
        processing_page()
    elif st.session_state.current_page == "review":
        review_page()
    elif st.session_state.current_page == "duplicates":
        duplicates_page()
    elif st.session_state.current_page == "summary":
        summary_page()
    
    # Sidebar status
    st.sidebar.markdown("---")
    if st.session_state.processor:
        st.sidebar.success("✅ Processor Ready")
        if st.session_state.get('input_dir'):
            st.sidebar.write(f"📁 {st.session_state.input_dir}")
        
        if st.session_state.processing_active:
            st.sidebar.warning("🔄 Processing Active")
        
        # Quick stats in sidebar
        stats = st.session_state.processing_stats
        if stats:
            st.sidebar.metric("Files Processed", stats.get('completed', 0))
            st.sidebar.metric("Need Review", stats.get('user_action_needed', 0))
    else:
        st.sidebar.warning("⚠️ Setup Required")
    
    # Footer
    st.sidebar.markdown("---")
    st.sidebar.markdown("*PhotoTimeFixer Pro v2.0*")

if __name__ == "__main__":
    main()