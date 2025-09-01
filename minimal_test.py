#!/usr/bin/env python3
"""
Complete test that actually processes AND organizes photos
This will create output files, not just analyze metadata
"""

import os
import sys
import json
import time
import shutil
from pathlib import Path

def complete_processing_test():
    """Run a complete test that actually organizes photos"""
    print("🚀 Complete Photo Processing Test")
    print("="*50)
    
    # Get test directory from user
    test_images_dir = input("📁 Enter path to directory with test images: ").strip()
    
    if not test_images_dir or not os.path.exists(test_images_dir):
        print("❌ Directory not found!")
        return
    
    # Quick scan for images
    image_files = []
    for ext in ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov']:
        image_files.extend(Path(test_images_dir).glob(f'*{ext}'))
        image_files.extend(Path(test_images_dir).glob(f'*{ext.upper()}'))
    
    if not image_files:
        print(f"❌ No image files found in {test_images_dir}")
        return
    
    print(f"✅ Found {len(image_files)} image files")
    
    # Ask user how many files to process
    try:
        max_files = int(input(f"🔢 How many files to process? (1-{len(image_files)}, default 10): ") or "10")
        max_files = min(max_files, len(image_files))
    except ValueError:
        max_files = 10
    
    print(f"📝 Will process {max_files} files")
    
    # Import the enhanced processor
    try:
        print("\n🔧 Importing enhanced processor...")
        from enhanced_photo_fixer import BulkPhotoProcessor, ProcessingConfig
        print("✅ Import successful!")
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        return
    except Exception as e:
        print(f"❌ Error importing: {e}")
        return
    
    # Create processing config that will actually organize files
    print("\n⚙️ Creating processing configuration...")
    try:
        config = ProcessingConfig(
            documents_dir=test_images_dir,
            output_dir='ORGANIZED_PHOTOS/',  # This will create organized output
            output_dir_clear=True,           # Clear any existing output
            output_dir_years=True,           # Organize by year folders
            
            # Small batch settings for testing
            batch_size=5,
            max_workers=2,
            max_concurrent_exif=1,
            
            # Enable features
            enable_duplicate_detection=True,
            enable_database=True,
            database_file='complete_test.db'
        )
        print("✅ Configuration created!")
        print(f"📁 Output will be created in: {os.path.join(test_images_dir, 'ORGANIZED_PHOTOS')}")
    except Exception as e:
        print(f"❌ Config creation failed: {e}")
        return
    
    # Create processor
    print("\n🏭 Creating processor...")
    try:
        processor = BulkPhotoProcessor(config)
        print("✅ Processor created!")
    except Exception as e:
        print(f"❌ Processor creation failed: {e}")
        return
    
    # Add detailed progress callback
    files_processed = 0
    def detailed_progress(update):
        nonlocal files_processed
        
        if update['type'] == 'file_completed':
            files_processed += 1
            metadata = update['metadata']
            print(f"  ✅ [{files_processed:2d}] {metadata['file_name']} -> {metadata['confidence']} confidence")
            
            if metadata['final_datetime']:
                print(f"      📅 {metadata['final_datetime']}")
                
        elif update['type'] == 'stats_update':
            stats = update['stats']
            print(f"📊 Progress: {stats.get('completed', 0)}/{stats.get('total_files', 0)}")
            
        elif update['type'] == 'log':
            message = update['message']
            # Only show important messages
            if any(keyword in message for keyword in ['Found', 'Starting', 'completed']):
                print(f"🔍 {message}")
                
        elif update['type'] == 'processing_complete':
            print(f"\n🎉 Processing completed! {files_processed} files processed")
    
    processor.add_progress_callback(detailed_progress)
    
    # Limit the files to process (create a temporary subset)
    print(f"\n📂 Creating temporary subset of {max_files} files...")
    temp_dir = Path(test_images_dir) / "TEMP_TEST_SUBSET"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir()
    
    # Copy subset of files to temporary directory
    selected_files = image_files[:max_files]
    for i, source_file in enumerate(selected_files):
        dest_file = temp_dir / source_file.name
        shutil.copy2(source_file, dest_file)
        print(f"  📄 {source_file.name}")
    
    # Update config to process the temporary directory
    config.documents_dir = str(temp_dir)
    processor = BulkPhotoProcessor(config)
    processor.add_progress_callback(detailed_progress)
    
    # Start processing
    print(f"\n🚀 Starting processing of {max_files} files...")
    print("⏳ This will actually organize and copy your photos...")
    
    try:
        session_id = processor.start_bulk_processing()
        print(f"📝 Session ID: {session_id}")
        
        # Wait for completion (longer timeout for actual file processing)
        timeout = 120  # 2 minutes
        start_time = time.time()
        
        while processor.processing_active and (time.time() - start_time) < timeout:
            time.sleep(1)
        
        if processor.processing_active:
            print("⏰ Timeout reached, stopping...")
            processor.stop_processing()
        
        print("✅ Processing phase completed!")
        
    except Exception as e:
        print(f"❌ Processing failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Show results and check output
    print("\n" + "="*60)
    print("📋 PROCESSING RESULTS")
    print("="*60)
    
    if processor.db:
        summary = processor.get_processing_summary()
        
        print("📊 Processing Statistics:")
        stats = summary.get('processing_stats', {})
        for status, count in stats.items():
            if count > 0:
                print(f"  {status.replace('_', ' ').title()}: {count}")
        
        print("\n🎯 Confidence Distribution:")
        confidence_stats = summary.get('confidence_distribution', {})
        for confidence, count in confidence_stats.items():
            if count > 0:
                print(f"  {confidence.upper()}: {count} files")
        
        duplicate_groups = summary.get('duplicate_groups', {})
        if duplicate_groups:
            print(f"\n👥 Duplicate Groups Found: {len(duplicate_groups)}")
            for group_id, count in list(duplicate_groups.items())[:3]:
                print(f"  {group_id}: {count} similar files")
    
    # Check output directory
    output_path = temp_dir / 'ORGANIZED_PHOTOS'
    print(f"\n📁 Checking output directory: {output_path}")
    
    if output_path.exists():
        # List all output files
        output_files = []
        for root, dirs, files in os.walk(output_path):
            for file in files:
                if not file.endswith('.db'):
                    rel_path = os.path.relpath(os.path.join(root, file), output_path)
                    output_files.append(rel_path)
        
        print(f"✅ Created {len(output_files)} organized files:")
        
        # Group by directory
        dirs_found = {}
        for file_path in output_files:
            dir_name = os.path.dirname(file_path) or "root"
            if dir_name not in dirs_found:
                dirs_found[dir_name] = []
            dirs_found[dir_name].append(os.path.basename(file_path))
        
        for dir_name, files in dirs_found.items():
            print(f"\n📂 {dir_name}/:")
            for file in files[:5]:  # Show first 5 files per directory
                print(f"  📄 {file}")
            if len(files) > 5:
                print(f"  ... and {len(files) - 5} more files")
    else:
        print("❌ No output directory found!")
    
    # Check for files that needed review
    if processor.db:
        check_files = processor.get_files_for_gui_review('check', page=0, page_size=5)
        if check_files['total'] > 0:
            print(f"\n⚠️  Files needing manual review ({check_files['total']} total):")
            for file_info in check_files['files']:
                print(f"  📄 {file_info['file_name']} - {file_info['confidence']} confidence")
    
    # Show database location
    db_path = temp_dir / 'complete_test.db'
    if db_path.exists():
        print(f"\n💾 Database created: {db_path} ({db_path.stat().st_size} bytes)")
    
    print("\n" + "="*60)
    print("🎉 COMPLETE TEST FINISHED!")
    print("="*60)
    print(f"📁 Organized photos: {output_path}")
    print(f"💾 Database: {db_path}")
    print(f"🗂️  Original files: {temp_dir} (temporary)")
    
    # Cleanup options
    print("\n🗑️ Cleanup options:")
    print("1. Keep everything (recommended for review)")
    print("2. Keep organized photos, remove temp files")
    print("3. Remove everything")
    
    choice = input("Choose (1-3, default 1): ").strip()
    
    if choice == "3":
        shutil.rmtree(temp_dir)
        print("✅ All test files removed")
    elif choice == "2":
        # Move organized photos to main directory
        main_output = Path(test_images_dir) / "ORGANIZED_PHOTOS_TEST"
        if main_output.exists():
            shutil.rmtree(main_output)
        shutil.move(output_path, main_output)
        shutil.rmtree(temp_dir)
        print(f"✅ Organized photos moved to: {main_output}")
        print("✅ Temporary files cleaned up")
    else:
        print(f"✅ All files preserved in: {temp_dir}")
        print("💡 You can manually review the organized photos and database")

def check_dependencies():
    """Check if required dependencies are installed"""
    print("🔧 Checking dependencies...")
    
    required_packages = [
        ('PIL', 'pillow'),
        ('exiftool', 'pyexiftool'), 
        ('imagehash', 'imagehash')
    ]
    
    missing = []
    for import_name, package_name in required_packages:
        try:
            __import__(import_name)
            print(f"✅ {package_name}")
        except ImportError:
            print(f"❌ {package_name} - MISSING")
            missing.append(package_name)
    
    if missing:
        print(f"\n💡 Install missing packages:")
        print(f"pip install {' '.join(missing)}")
        return False
    
    print("✅ All dependencies found!")
    return True

if __name__ == "__main__":
    print("🚀 PhotoTimeFixer Enhanced - Complete Test")
    print("="*50)
    print("This test will actually organize your photos!")
    print("="*50)
    
    if not check_dependencies():
        sys.exit(1)
    
    complete_processing_test()