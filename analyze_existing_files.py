#!/usr/bin/env python3
"""
Analyze existing preserved transcription files
This script will analyze the files you've already preserved to understand the audio content issues
"""

import json
import os
import sys
from pathlib import Path
import av
import numpy as np

# Default preserved files directory
PRESERVED_FILES_DIR = os.path.expanduser("~/Documents/Friday_Transcription_Files")

def analyze_audio_file(file_path):
    """Analyze a single audio file for content"""
    analysis = {
        "has_audio": False,
        "duration": 0,
        "sample_rate": 0,
        "channels": 0,
        "max_amplitude": 0,
        "rms_level": 0,
        "silence_percentage": 100,
        "audio_format": "unknown",
        "error": None,
        "file_size": 0
    }
    
    try:
        analysis["file_size"] = os.path.getsize(file_path)
        
        container = av.open(str(file_path))
        audio_streams = [s for s in container.streams if s.type == 'audio']
        
        if not audio_streams:
            analysis["error"] = "No audio streams found"
            container.close()
            return analysis
        
        audio_stream = audio_streams[0]
        analysis["has_audio"] = True
        analysis["duration"] = float(audio_stream.duration * audio_stream.time_base) if audio_stream.duration else 0
        analysis["sample_rate"] = audio_stream.sample_rate
        analysis["channels"] = audio_stream.channels
        analysis["audio_format"] = audio_stream.codec.name
        
        # Analyze audio content by reading samples
        frames_analyzed = 0
        total_samples = 0
        sum_squares = 0
        max_amplitude = 0
        silent_samples = 0
        
        # Read up to 5 seconds of audio for analysis
        max_frames = int(5 * audio_stream.sample_rate) if audio_stream.sample_rate else 80000
        
        for frame in container.decode(audio_stream):
            if frames_analyzed >= max_frames:
                break
                
            # Convert frame to numpy array for analysis
            audio_array = frame.to_ndarray()
            if len(audio_array.shape) > 1:
                # Multi-channel: take mean across channels
                audio_array = audio_array.mean(axis=0)
            
            # Calculate statistics
            frame_samples = len(audio_array)
            total_samples += frame_samples
            frames_analyzed += frame_samples
            
            # Calculate RMS and max amplitude
            abs_samples = abs(audio_array)
            max_amplitude = max(max_amplitude, abs_samples.max() if len(abs_samples) > 0 else 0)
            sum_squares += (audio_array ** 2).sum()
            
            # Count silent samples (below threshold)
            silence_threshold = 0.01  # 1% of max amplitude
            silent_samples += (abs_samples < silence_threshold).sum()
        
        container.close()
        
        if total_samples > 0:
            analysis["max_amplitude"] = float(max_amplitude)
            analysis["rms_level"] = float((sum_squares / total_samples) ** 0.5)
            analysis["silence_percentage"] = float((silent_samples / total_samples) * 100)
        
    except Exception as e:
        analysis["error"] = str(e)
    
    return analysis

def categorize_audio_quality(analysis):
    """Categorize audio quality based on analysis"""
    if analysis.get("error"):
        return "ERROR"
    
    if not analysis.get("has_audio"):
        return "NO_AUDIO"
    
    if analysis.get("duration", 0) < 0.1:
        return "TOO_SHORT"
    
    silence_pct = analysis.get("silence_percentage", 100)
    max_amp = analysis.get("max_amplitude", 0)
    rms = analysis.get("rms_level", 0)
    
    if silence_pct > 95 or max_amp < 0.001 or rms < 0.0001:
        return "MOSTLY_SILENT"
    elif silence_pct > 80 or max_amp < 0.01 or rms < 0.001:
        return "VERY_QUIET"
    elif silence_pct > 50 or max_amp < 0.1 or rms < 0.01:
        return "QUIET"
    else:
        return "GOOD_AUDIO"

def analyze_existing_files():
    """Analyze all existing preserved files"""
    if not os.path.exists(PRESERVED_FILES_DIR):
        print(f"❌ Directory not found: {PRESERVED_FILES_DIR}")
        return
    
    print(f"🔍 Analyzing existing preserved files in: {PRESERVED_FILES_DIR}")
    print("=" * 80)
    
    # Find all WAV files
    wav_files = list(Path(PRESERVED_FILES_DIR).glob("*.wav"))
    
    if not wav_files:
        print("No WAV files found to analyze")
        return
    
    results = []
    categories = {
        "GOOD_AUDIO": [],
        "QUIET": [],
        "VERY_QUIET": [],
        "MOSTLY_SILENT": [],
        "TOO_SHORT": [],
        "NO_AUDIO": [],
        "ERROR": []
    }
    
    print(f"Found {len(wav_files)} files to analyze...")
    print()
    
    for i, file_path in enumerate(wav_files):
        print(f"Analyzing ({i+1}/{len(wav_files)}): {file_path.name}")
        
        analysis = analyze_audio_file(file_path)
        category = categorize_audio_quality(analysis)
        
        result = {
            "filename": file_path.name,
            "category": category,
            "analysis": analysis
        }
        results.append(result)
        categories[category].append(result)
        
        # Show key stats
        if analysis.get("error"):
            print(f"   ❌ ERROR: {analysis['error']}")
        else:
            print(f"   📊 Duration: {analysis.get('duration', 0):.2f}s, "
                  f"Max Amp: {analysis.get('max_amplitude', 0):.4f}, "
                  f"RMS: {analysis.get('rms_level', 0):.4f}, "
                  f"Silence: {analysis.get('silence_percentage', 100):.1f}%")
            print(f"   🏷️  Category: {category}")
        print()
    
    # Summary
    print("=" * 80)
    print("📊 ANALYSIS SUMMARY")
    print("=" * 80)
    
    for category, files in categories.items():
        if files:
            print(f"{category}: {len(files)} files")
            for result in files[:3]:  # Show first 3 examples
                print(f"  • {result['filename']}")
            if len(files) > 3:
                print(f"  ... and {len(files) - 3} more")
            print()
    
    # Show examples of each category with details
    print("=" * 80)
    print("🔍 DETAILED EXAMPLES")
    print("=" * 80)
    
    for category in ["GOOD_AUDIO", "MOSTLY_SILENT", "ERROR"]:
        if categories[category]:
            print(f"\n{category} Example:")
            example = categories[category][0]
            print(f"File: {example['filename']}")
            analysis = example['analysis']
            print(f"  Size: {analysis.get('file_size', 0)} bytes")
            print(f"  Duration: {analysis.get('duration', 0):.2f}s")
            print(f"  Sample Rate: {analysis.get('sample_rate', 0)}Hz")
            print(f"  Channels: {analysis.get('channels', 0)}")
            print(f"  Max Amplitude: {analysis.get('max_amplitude', 0):.6f}")
            print(f"  RMS Level: {analysis.get('rms_level', 0):.6f}")
            print(f"  Silence: {analysis.get('silence_percentage', 100):.1f}%")
            if analysis.get('error'):
                print(f"  Error: {analysis['error']}")

def main():
    if len(sys.argv) > 1:
        preserved_dir = sys.argv[1]
        global PRESERVED_FILES_DIR
        PRESERVED_FILES_DIR = preserved_dir
    
    analyze_existing_files()

if __name__ == "__main__":
    main() 