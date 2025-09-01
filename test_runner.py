#!/usr/bin/env python3
"""
Test runner for the enhanced PhotoTimeFixer
Use this to validate the script with your real test images
"""

import os
import sys
import json
import time
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

# Import the classes
from enhanced_photo_fixer import BulkPhotoProcessor, ProcessingConfig

if TYPE_CHECKING:
    from enhanced_photo_fixer import ProcessingConfig

def create_test_config(test_dir: str) -> ProcessingConfig:
    """Create a safe test configuration"""
    
    config = ProcessingConfig(
        documents_dir=test_dir,
        output_dir='TEST_OUTPUT/',
        output_dir_clear=True,
        
        # Conservative settings for testing
        batch_size=5,  # Small batches for testing
        max_workers=2,  # Limit workers during testing
        max_concurrent_exif=1,  # Single ExifTool instance
        
        # Enable all features
        enable_duplicate_detection=True,
        enable_database=True,
        database_file='test_processing.db',
        
        # Lower similarity threshold for testing
        duplicate_similarity_threshold=3
    )
    return config

def setup_test_environment(source_images_dir: str, test_count: int = 20):
    """Set up a controlled test environment"""
    
    # Create test directory
    test_dir = Path("photo_test_env")
    if test_dir.exists():
        shutil.rmtree(test_dir)
    test_dir.mkdir()
    
    # Copy a subset of your images for testing
    source_path = Path(source_images_dir)
    if not source_path.exists():
        print(f"❌ Source directory not found: {source_images_dir}")
        return None
        
    # Get list of images
    image_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov')
    source_images = [f for f in source_path.rglob('*') 
                    if f.is_file() and f.suffix.lower() in image_extensions]
    
    if not source_images:
        print(f"❌ No images found in {source_images_dir}")
        return None
    
    # Copy test images with different scenarios
    test_images_copied = 0
    
    # Create subdirectories for testing
    (test_dir / "family_photos").mkdir()
    (test_dir / "vacation_2023").mkdir()
    (test_dir / "misc").mkdir()
    (test_dir / "duplicates_test").mkdir()
    
    print(f"📁 Setting up test environment with {min(test_count, len(source_images))} images...")
    
    for i, source_file in enumerate(source_images[:test_count]):
        if test_images_copied >= test_count:
            break
            
        # Distribute images across test directories
        if i % 4 == 0:
            dest_dir = test_dir / "family_photos"
        elif i % 4 == 1:
            dest_dir = test_dir / "vacation_2023"
        elif i % 4 == 2:
            dest_dir = test_dir / "misc"
        else:
            dest_dir = test_dir / "duplicates_test"
        
        dest_file = dest_dir / source_file.name
        
        try:
            shutil.copy2(source_file, dest_file)
            test_images_copied += 1
            
            # Create a duplicate of every 5th image for testing
            if i % 5 == 0:
                duplicate_name = f"dup_{source_file.name}"
                shutil.copy2(source_file, test_dir / "duplicates_test" / duplicate_name)
                
        except Exception as e:
            print(f"⚠️ Could not copy {source_file}: {e}")
    
    print(f"✅ Test environment ready: {test_images_copied} images copied")
    print(f"📍 Test directory: {test_dir.absolute()}")
    
    return str(test_dir.absolute())

def run_basic_functionality_test(test_dir: str):
    """Test basic processing functionality"""
    print("\n" + "="*60)
    print("🧪 BASIC FUNCTIONALITY TEST")
    print("="*60)
    
    from enhanced_photo_fixer import BulkPhotoProcessor
    
    config = create_test_config(test_dir)
    processor = BulkPhotoProcessor(config)
    
    # Add a simple progress callback
    def test_progress_callback(update):
        if update['type'] == 'stats_update':
            stats = update['stats']
            print(f"📊 Progress: {stats.get('completed', 0)}/{stats.get('total_files', 0)} completed")
        elif update['type'] == 'file_completed':
            metadata = update['metadata']
            print(f"✅ Processed: {metadata['file_name']} ({metadata['confidence']})")
        elif update['type'] == 'log':
            print(f"🔍 {update['message']}")
    
    processor.add_progress_callback(test_progress_callback)
    
    print("▶️ Starting bulk processing test...")
    session_id = processor.start_bulk_processing()
    
    # Wait for processing to complete (with timeout)
    timeout = 120  # 2 minutes max for test
    start_time = time.time()
    
    while processor.processing_active and (time.time() - start_time) < timeout:
        time.sleep(1)
    
    if processor.processing_active:
        print("⏰ Test timeout reached, stopping processing...")
        processor.stop_processing()
    
    # Get final results
    summary = processor.get_processing_summary()
    print("\n📋 PROCESSING SUMMARY:")
    print(json.dumps(summary, indent=2, default=str))
    
    return processor, summary

def run_database_test(processor):
    """Test database functionality"""
    print("\n" + "="*60)
    print("💾 DATABASE TEST")
    print("="*60)
    
    if not processor.db:
        print("❌ Database not enabled")
        return
    
    # Test various queries
    stats = processor.db.get_processing_stats()
    print("📊 Database stats:", stats)
    
    # Test file retrieval
    check_files = processor.get_files_for_gui_review('check', page=0, page_size=5)
    print(f"🔍 Files needing check: {check_files['total']} total")
    
    duplicate_files = processor.get_files_for_gui_review('duplicates', page=0, page_size=5)
    print(f"👥 Duplicate files: {duplicate_files['total']} total")
    
    error_files = processor.get_files_for_gui_review('errors', page=0, page_size=5)
    print(f"❌ Error files: {error_files['total']} total")

def run_duplicate_detection_test(processor):
    """Test duplicate detection"""
    print("\n" + "="*60)
    print("👥 DUPLICATE DETECTION TEST")
    print("="*60)
    
    summary = processor.get_processing_summary()
    duplicate_groups = summary.get('duplicate_groups', {})
    
    print(f"🔍 Found {len(duplicate_groups)} duplicate groups")
    
    for group_id, count in duplicate_groups.items():
        print(f"  📁 Group {group_id}: {count} similar files")
        
        # Get files in this group
        if processor.db:
            with processor.db.get_connection() as conn:
                cursor = conn.execute(
                    "SELECT file_name, file_path FROM photo_metadata WHERE duplicate_group = ?",
                    (group_id,)
                )
                files = cursor.fetchall()
                for file_info in files:
                    print(f"    📄 {file_info['file_name']}")

def run_confidence_analysis_test(processor):
    """Test confidence scoring analysis"""
    print("\n" + "="*60)
    print("🎯 CONFIDENCE ANALYSIS TEST")
    print("="*60)
    
    summary = processor.get_processing_summary()
    confidence_dist = summary.get('confidence_distribution', {})
    
    print("📊 Confidence Distribution:")
    for confidence, count in confidence_dist.items():
        print(f"  {confidence.upper()}: {count} files")
    
    # Show sample files from each confidence level
    for confidence in ['low', 'medium', 'high']:
        if processor.db:
            with processor.db.get_connection() as conn:
                cursor = conn.execute(
                    "SELECT file_name, final_datetime, error_message FROM photo_metadata WHERE confidence = ? LIMIT 3",
                    (confidence,)
                )
                files = cursor.fetchall()
                
                if files:
                    print(f"\n🔍 Sample {confidence.upper()} confidence files:")
                    for file_info in files:
                        print(f"  📄 {file_info['file_name']} -> {file_info['final_datetime']}")
                        if file_info['error_message']:
                            print(f"      ⚠️ {file_info['error_message']}")

def main():
    """Main test runner"""
    print("🚀 PhotoTimeFixer Enhanced - Test Runner")
    print("="*60)
    
    # Get source directory from user
    source_dir = input("📁 Enter path to your test images directory: ").strip()
    if not source_dir:
        print("❌ No directory provided")
        return
    
    # Get number of test images
    try:
        test_count = int(input("🔢 Number of test images to use (default 20): ") or "20")
    except ValueError:
        test_count = 20
    
    # Set up test environment
    test_dir = setup_test_environment(source_dir, test_count)
    if not test_dir:
        return
    
    try:
        # Run tests
        processor, summary = run_basic_functionality_test(test_dir)
        run_database_test(processor)
        run_duplicate_detection_test(processor)
        run_confidence_analysis_test(processor)
        
        print("\n" + "="*60)
        print("✅ ALL TESTS COMPLETED!")
        print("="*60)
        print(f"📁 Test results saved in: {test_dir}")
        print(f"💾 Database file: {os.path.join(test_dir, 'test_processing.db')}")
        print(f"📊 Processing results: {os.path.join(test_dir, 'processing_results.json')}")
        
        # Ask if user wants to clean up
        cleanup = input("\n🗑️ Clean up test directory? (y/n): ").strip().lower()
        if cleanup == 'y':
            shutil.rmtree(test_dir)
            print("✅ Test directory cleaned up")
        else:
            print(f"📁 Test directory preserved: {test_dir}")
            
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()