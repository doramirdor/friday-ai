#!/usr/bin/env python3
"""
Test Whisper transcription directly on preserved files
This will help us understand why good audio files aren't being transcribed
"""

import sys
import os
from pathlib import Path
from faster_whisper import WhisperModel

PRESERVED_FILES_DIR = os.path.expanduser("~/Documents/Friday_Transcription_Files")

def test_whisper_on_file(file_path, model):
    """Test Whisper transcription on a specific file"""
    print(f"\n🎯 Testing Whisper on: {file_path.name}")
    print("=" * 60)
    
    try:
        # Test with the exact same settings as the transcription service
        print("🎤 Transcribing with current settings (fast):")
        segments, info = model.transcribe(
            str(file_path),
            beam_size=1,  # Current fast setting
            language="en",
            condition_on_previous_text=False,
            temperature=0.0,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=300)
        )
        
        print(f"📊 Info - Duration: {info.duration:.2f}s, Language: {info.language} ({info.language_probability:.2f})")
        
        # Collect segments
        transcription = ""
        segment_count = 0
        for segment in segments:
            transcription += segment.text + " "
            segment_count += 1
            print(f"🗣️ Segment {segment_count}: '{segment.text}' (start: {segment.start:.2f}s, end: {segment.end:.2f}s)")
        
        final_text = transcription.strip()
        print(f"✅ Final transcription: '{final_text}' (length: {len(final_text)})")
        
        # Test with more accurate settings
        print("\n🎯 Transcribing with accurate settings:")
        segments2, info2 = model.transcribe(
            str(file_path),
            beam_size=5,  # More accurate
            language="en",
            condition_on_previous_text=True,
            temperature=0.0,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=1000)  # Less aggressive VAD
        )
        
        print(f"📊 Info - Duration: {info2.duration:.2f}s, Language: {info2.language} ({info2.language_probability:.2f})")
        
        # Collect segments
        transcription2 = ""
        segment_count2 = 0
        for segment in segments2:
            transcription2 += segment.text + " "
            segment_count2 += 1
            print(f"🗣️ Segment {segment_count2}: '{segment.text}' (start: {segment.start:.2f}s, end: {segment.end:.2f}s)")
        
        final_text2 = transcription2.strip()
        print(f"✅ Final transcription: '{final_text2}' (length: {len(final_text2)})")
        
        # Test with no VAD
        print("\n🎯 Transcribing with NO VAD:")
        segments3, info3 = model.transcribe(
            str(file_path),
            beam_size=3,
            language="en",
            condition_on_previous_text=False,
            temperature=0.0,
            vad_filter=False  # Disable VAD completely
        )
        
        print(f"📊 Info - Duration: {info3.duration:.2f}s, Language: {info3.language} ({info3.language_probability:.2f})")
        
        # Collect segments
        transcription3 = ""
        segment_count3 = 0
        for segment in segments3:
            transcription3 += segment.text + " "
            segment_count3 += 1
            print(f"🗣️ Segment {segment_count3}: '{segment.text}' (start: {segment.start:.2f}s, end: {segment.end:.2f}s)")
        
        final_text3 = transcription3.strip()
        print(f"✅ Final transcription: '{final_text3}' (length: {len(final_text3)})")
        
        return {
            "fast_settings": final_text,
            "accurate_settings": final_text2,
            "no_vad": final_text3
        }
        
    except Exception as e:
        print(f"❌ Error transcribing {file_path.name}: {e}")
        return None

def main():
    if len(sys.argv) > 1:
        preserved_dir = sys.argv[1]
    else:
        preserved_dir = PRESERVED_FILES_DIR
    
    print(f"🔍 Testing Whisper Transcription")
    print(f"📂 Directory: {preserved_dir}")
    
    # Find WAV files
    wav_files = list(Path(preserved_dir).glob("*.wav"))
    
    if not wav_files:
        print("❌ No WAV files found to test")
        return
    
    # Initialize Whisper model (same as transcription service)
    print("🎤 Initializing Whisper model...")
    model = WhisperModel("small", device="cpu", compute_type="int8")
    print("✅ Model initialized")
    
    # Test a few files of each type
    system_files = [f for f in wav_files if "_system_" in f.name]
    microphone_files = [f for f in wav_files if "_microphone_" in f.name]
    
    print(f"\nFound {len(system_files)} system files, {len(microphone_files)} microphone files")
    
    # Test 2 system files
    if system_files:
        print("\n" + "="*80)
        print("🖥️ TESTING SYSTEM AUDIO FILES")
        print("="*80)
        
        for i, file_path in enumerate(system_files[:2]):
            result = test_whisper_on_file(file_path, model)
            if i < len(system_files) - 1:
                print("\n" + "-"*60)
    
    # Test 2 microphone files
    if microphone_files:
        print("\n" + "="*80)
        print("🎤 TESTING MICROPHONE AUDIO FILES")
        print("="*80)
        
        for i, file_path in enumerate(microphone_files[:2]):
            result = test_whisper_on_file(file_path, model)
            if i < len(microphone_files) - 1:
                print("\n" + "-"*60)
    
    print("\n" + "="*80)
    print("🎯 CONCLUSION")
    print("="*80)
    print("Compare the transcription results above:")
    print("1. Fast settings (current transcription service)")
    print("2. Accurate settings (higher beam size, different VAD)")
    print("3. No VAD (processes all audio)")
    print("\nThis will show us if the issue is:")
    print("- VAD being too aggressive (removing speech)")
    print("- Fast settings missing content")
    print("- Audio format/quality issues")

if __name__ == "__main__":
    main() 