#!/usr/bin/env python3
"""
Audio File Analysis Script
Helps analyze separate system audio and microphone files to debug transcription issues.
"""

import os
import sys
import librosa
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

def analyze_audio_file(filepath):
    """Analyze an audio file and return basic statistics"""
    try:
        # Load audio file
        y, sr = librosa.load(filepath, sr=None)
        
        # Basic statistics
        duration = len(y) / sr
        max_amplitude = np.max(np.abs(y))
        rms = np.sqrt(np.mean(y**2))
        zero_crossings = librosa.zero_crossings(y).sum()
        
        # Silence detection
        silence_threshold = 0.01
        silent_samples = np.sum(np.abs(y) < silence_threshold)
        silence_percentage = (silent_samples / len(y)) * 100
        
        # Spectral analysis
        stft = librosa.stft(y)
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        
        return {
            'filename': os.path.basename(filepath),
            'duration': duration,
            'sample_rate': sr,
            'max_amplitude': max_amplitude,
            'rms': rms,
            'zero_crossings': zero_crossings,
            'silence_percentage': silence_percentage,
            'mean_spectral_centroid': np.mean(spectral_centroids),
            'has_meaningful_audio': max_amplitude > 0.01 and silence_percentage < 90
        }
    except Exception as e:
        return {
            'filename': os.path.basename(filepath),
            'error': str(e)
        }

def compare_files(recording_dir):
    """Compare system audio and combined recording files"""
    recording_path = Path(recording_dir)
    
    # Find files
    combined_files = list(recording_path.glob("combined-recording-*.wav")) + list(recording_path.glob("combined-recording-*.flac"))
    system_files = list(recording_path.glob("system_only_*.wav")) + list(recording_path.glob("system_only_*.flac"))
    chunk_files = list(recording_path.glob("system_audio_chunk_*.wav"))
    
    print("🔍 AUDIO FILE ANALYSIS")
    print("=" * 50)
    
    # Analyze combined files
    print("\n📁 COMBINED RECORDINGS (System + Microphone):")
    for file_path in sorted(combined_files, key=lambda x: x.stat().st_mtime, reverse=True)[:3]:
        analysis = analyze_audio_file(str(file_path))
        print_analysis(analysis)
    
    # Analyze system-only files
    print("\n🎵 SYSTEM-ONLY RECORDINGS:")
    for file_path in sorted(system_files, key=lambda x: x.stat().st_mtime, reverse=True)[:3]:
        analysis = analyze_audio_file(str(file_path))
        print_analysis(analysis)
    
    # Analyze transcription chunks
    print("\n🔄 TRANSCRIPTION CHUNKS:")
    for file_path in sorted(chunk_files, key=lambda x: x.stat().st_mtime, reverse=True)[:5]:
        analysis = analyze_audio_file(str(file_path))
        print_analysis(analysis, compact=True)

def print_analysis(analysis, compact=False):
    """Print analysis results"""
    if 'error' in analysis:
        print(f"❌ {analysis['filename']}: ERROR - {analysis['error']}")
        return
    
    if compact:
        status = "✅ Valid" if analysis['has_meaningful_audio'] else "⚠️ Silent/Invalid"
        print(f"  {status} {analysis['filename']}: {analysis['duration']:.2f}s, "
              f"Max: {analysis['max_amplitude']:.3f}, "
              f"Silent: {analysis['silence_percentage']:.1f}%")
    else:
        status = "✅ VALID AUDIO" if analysis['has_meaningful_audio'] else "⚠️ SILENT/INVALID AUDIO"
        print(f"  {status}")
        print(f"    File: {analysis['filename']}")
        print(f"    Duration: {analysis['duration']:.2f} seconds")
        print(f"    Sample Rate: {analysis['sample_rate']} Hz")
        print(f"    Max Amplitude: {analysis['max_amplitude']:.3f}")
        print(f"    RMS Level: {analysis['rms']:.3f}")
        print(f"    Silence: {analysis['silence_percentage']:.1f}%")
        print(f"    Spectral Centroid: {analysis['mean_spectral_centroid']:.1f} Hz")
        print()

def main():
    recording_dir = "/Users/amirdor/Documents/Friday Recordings"
    
    if len(sys.argv) > 1:
        recording_dir = sys.argv[1]
    
    if not os.path.exists(recording_dir):
        print(f"❌ Recording directory not found: {recording_dir}")
        sys.exit(1)
    
    print(f"📂 Analyzing audio files in: {recording_dir}")
    compare_files(recording_dir)
    
    print("\n💡 INTERPRETATION GUIDE:")
    print("  - Max Amplitude > 0.01: Good audio signal")
    print("  - Silence < 90%: Meaningful content")
    print("  - System chunks should have similar properties to system-only file")
    print("  - If system chunks are silent but system-only has audio, there's a chunk generation issue")

if __name__ == "__main__":
    main() 