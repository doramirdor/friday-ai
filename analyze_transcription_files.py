#!/usr/bin/env python3
"""
Analyze preserved transcription files
Utility to help analyze the files that were sent for transcription
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Default preserved files directory
PRESERVED_FILES_DIR = os.path.expanduser("~/Documents/Friday_Transcription_Files")

def analyze_log_file(log_file_path):
    """Analyze the transcription log file"""
    if not os.path.exists(log_file_path):
        print(f"❌ Log file not found: {log_file_path}")
        return
    
    print(f"📊 Analyzing transcription log: {log_file_path}")
    print("=" * 80)
    
    total_entries = 0
    system_entries = 0
    microphone_entries = 0
    error_entries = 0
    short_duration_entries = 0
    no_audio_stream_entries = 0
    mostly_silent_entries = 0
    successful_transcriptions = 0
    
    total_file_size = 0
    stream_type_sizes = {"system": 0, "microphone": 0}
    
    # Audio quality statistics
    audio_quality_stats = {
        "total_with_analysis": 0,
        "good_audio": 0,
        "mostly_silent": 0,
        "very_quiet": 0,
        "short_duration": 0,
        "analysis_errors": 0
    }
    
    try:
        with open(log_file_path, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                    
                try:
                    entry = json.loads(line)
                    total_entries += 1
                    
                    # Count by stream type
                    stream_type = entry.get('stream_type', 'unknown')
                    if stream_type == 'system':
                        system_entries += 1
                    elif stream_type == 'microphone':
                        microphone_entries += 1
                    
                    # Count by result type
                    transcript = entry.get('transcript', '')
                    if transcript.startswith('ERROR:'):
                        error_entries += 1
                    elif transcript.startswith('SHORT_DURATION'):
                        short_duration_entries += 1
                    elif transcript == 'NO_AUDIO_STREAMS':
                        no_audio_stream_entries += 1
                    elif transcript.startswith('MOSTLY_SILENT'):
                        mostly_silent_entries += 1
                    elif transcript and not transcript.startswith('ERROR:'):
                        successful_transcriptions += 1
                    
                    # Analyze audio analysis data if present
                    audio_analysis = entry.get('audio_analysis')
                    if audio_analysis:
                        audio_quality_stats["total_with_analysis"] += 1
                        
                        silence_pct = audio_analysis.get('silence_percentage', 100)
                        max_amp = audio_analysis.get('max_amplitude', 0)
                        rms = audio_analysis.get('rms_level', 0)
                        duration = audio_analysis.get('duration', 0)
                        
                        if duration < 0.1:
                            audio_quality_stats["short_duration"] += 1
                        elif silence_pct > 95 or max_amp < 0.001 or rms < 0.0001:
                            audio_quality_stats["mostly_silent"] += 1
                        elif silence_pct > 80 or max_amp < 0.01 or rms < 0.001:
                            audio_quality_stats["very_quiet"] += 1
                        else:
                            audio_quality_stats["good_audio"] += 1
                    
                    # Sum file sizes
                    file_size = entry.get('file_size', 0)
                    total_file_size += file_size
                    if stream_type in stream_type_sizes:
                        stream_type_sizes[stream_type] += file_size
                    
                except json.JSONDecodeError as e:
                    print(f"⚠️ Error parsing line: {e}")
                    continue
    
    except Exception as e:
        print(f"❌ Error reading log file: {e}")
        return
    
    print(f"📈 SUMMARY:")
    print(f"  Total entries: {total_entries}")
    print(f"  System audio files: {system_entries}")
    print(f"  Microphone files: {microphone_entries}")
    print(f"  Successful transcriptions: {successful_transcriptions}")
    print(f"  Error entries: {error_entries}")
    print(f"  Short duration entries: {short_duration_entries}")
    print(f"  No audio stream entries: {no_audio_stream_entries}")
    print(f"  Mostly silent entries: {mostly_silent_entries}")
    print(f"  Total file size: {total_file_size / (1024*1024):.2f} MB")
    print(f"  System audio size: {stream_type_sizes['system'] / (1024*1024):.2f} MB")
    print(f"  Microphone size: {stream_type_sizes['microphone'] / (1024*1024):.2f} MB")
    
    if total_entries > 0:
        print(f"  Success rate: {(successful_transcriptions / total_entries * 100):.1f}%")
    
    # Show audio quality analysis if available
    if audio_quality_stats["total_with_analysis"] > 0:
        print(f"\n🎵 AUDIO QUALITY ANALYSIS:")
        print(f"  Files with analysis: {audio_quality_stats['total_with_analysis']}")
        print(f"  Good audio quality: {audio_quality_stats['good_audio']}")
        print(f"  Very quiet audio: {audio_quality_stats['very_quiet']}")
        print(f"  Mostly silent: {audio_quality_stats['mostly_silent']}")
        print(f"  Too short: {audio_quality_stats['short_duration']}")
        
        good_pct = (audio_quality_stats['good_audio'] / audio_quality_stats['total_with_analysis']) * 100
        print(f"  Good audio percentage: {good_pct:.1f}%")

def list_preserved_files(directory):
    """List all preserved files in the directory"""
    if not os.path.exists(directory):
        print(f"❌ Directory not found: {directory}")
        return
    
    print(f"📂 Preserved files in: {directory}")
    print("=" * 80)
    
    files = list(Path(directory).glob("*.wav"))
    files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    
    if not files:
        print("  No preserved audio files found")
        return
    
    total_size = 0
    system_files = 0
    microphone_files = 0
    
    for file in files[:20]:  # Show last 20 files
        stat = file.stat()
        size_mb = stat.st_size / (1024 * 1024)
        mtime = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        
        # Determine stream type from filename
        stream_type = "system" if "_system_" in file.name else "microphone"
        if stream_type == "system":
            system_files += 1
        else:
            microphone_files += 1
        
        total_size += stat.st_size
        
        print(f"  {file.name} ({size_mb:.2f} MB) - {mtime} - {stream_type}")
    
    if len(files) > 20:
        print(f"  ... and {len(files) - 20} more files")
    
    print(f"\n📊 File summary:")
    print(f"  Total files: {len(files)}")
    print(f"  System files: {system_files}")
    print(f"  Microphone files: {microphone_files}")
    print(f"  Total size: {total_size / (1024*1024):.2f} MB")

def find_recent_errors(log_file_path, limit=10):
    """Find recent transcription errors"""
    if not os.path.exists(log_file_path):
        print(f"❌ Log file not found: {log_file_path}")
        return
    
    print(f"🔍 Recent transcription errors (last {limit}):")
    print("=" * 80)
    
    errors = []
    try:
        with open(log_file_path, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                    
                try:
                    entry = json.loads(line)
                    transcript = entry.get('transcript', '')
                    if transcript.startswith('ERROR:'):
                        errors.append(entry)
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        print(f"❌ Error reading log file: {e}")
        return
    
    # Show recent errors
    for error in errors[-limit:]:
        timestamp = error.get('timestamp', '')
        stream_type = error.get('stream_type', 'unknown')
        original_path = error.get('original_path', '')
        transcript = error.get('transcript', '')
        
        print(f"  {timestamp} - {stream_type} - {os.path.basename(original_path)}")
        print(f"    Error: {transcript}")
        print()

def main():
    if len(sys.argv) > 1:
        preserved_dir = sys.argv[1]
    else:
        preserved_dir = PRESERVED_FILES_DIR
    
    log_file = os.path.join(preserved_dir, 'transcription_log.txt')
    
    print(f"🔍 Friday Transcription File Analysis")
    print(f"📂 Directory: {preserved_dir}")
    print()
    
    # Analyze log file
    analyze_log_file(log_file)
    print()
    
    # List preserved files
    list_preserved_files(preserved_dir)
    print()
    
    # Show recent errors
    find_recent_errors(log_file)

if __name__ == "__main__":
    main() 