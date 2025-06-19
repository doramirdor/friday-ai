#!/usr/bin/env python3
"""
Test the VAD fix on preserved files
This will verify that the new VAD settings improve transcription success
"""

import sys
import os
from pathlib import Path
from faster_whisper import WhisperModel

PRESERVED_FILES_DIR = os.path.expanduser("~/Documents/Friday_Transcription_Files")

def test_with_new_settings(file_path, model, stream_type):
    """Test with the new VAD settings"""
    print(f"\n🎯 Testing NEW SETTINGS on: {file_path.name}")
    print(f"Stream type: {stream_type}")
    print("=" * 60)
    
    try:
        if stream_type == "system":
            # System audio: No VAD (new setting)
            print("⚙️ Using NO VAD for system audio")
            segments, info = model.transcribe(
                str(file_path),
                beam_size=1,
                language="en",
                condition_on_previous_text=False,
                temperature=0.0,
                vad_filter=False  # Disable VAD for system audio
            )
        else:
            # Microphone audio: Less aggressive VAD (new setting)
            print("⚙️ Using LESS AGGRESSIVE VAD for microphone audio")
            segments, info = model.transcribe(
                str(file_path),
                beam_size=1,
                language="en",
                condition_on_previous_text=False,
                temperature=0.0,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=1000,  # Less aggressive
                    speech_pad_ms=400,             # More padding
                    max_speech_duration_s=30       # Allow longer speech
                )
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
        
        return final_text
        
    except Exception as e:
        print(f"❌ Error transcribing {file_path.name}: {e}")
        return None

def main():
    print(f"🔧 Testing VAD Fix")
    print(f"📂 Directory: {PRESERVED_FILES_DIR}")
    
    # Find WAV files
    wav_files = list(Path(PRESERVED_FILES_DIR).glob("*.wav"))
    
    if not wav_files:
        print("❌ No WAV files found to test")
        return
    
    # Initialize Whisper model
    print("🎤 Initializing Whisper model...")
    model = WhisperModel("small", device="cpu", compute_type="int8")
    print("✅ Model initialized")
    
    # Test files with new settings
    system_files = [f for f in wav_files if "_system_" in f.name]
    microphone_files = [f for f in wav_files if "_microphone_" in f.name]
    
    successful_transcriptions = 0
    total_tests = 0
    
    # Test system files
    if system_files:
        print("\n" + "="*80)
        print("🖥️ TESTING SYSTEM AUDIO FILES (NO VAD)")
        print("="*80)
        
        for file_path in system_files[:3]:  # Test first 3
            result = test_with_new_settings(file_path, model, "system")
            total_tests += 1
            if result and len(result) > 0:
                successful_transcriptions += 1
                print("✅ SUCCESS!")
            else:
                print("❌ No transcription")
            print("-" * 60)
    
    # Test microphone files
    if microphone_files:
        print("\n" + "="*80)
        print("🎤 TESTING MICROPHONE AUDIO FILES (LESS AGGRESSIVE VAD)")
        print("="*80)
        
        for file_path in microphone_files[:3]:  # Test first 3
            result = test_with_new_settings(file_path, model, "microphone")
            total_tests += 1
            if result and len(result) > 0:
                successful_transcriptions += 1
                print("✅ SUCCESS!")
            else:
                print("❌ No transcription")
            print("-" * 60)
    
    # Summary
    print("\n" + "="*80)
    print("📊 VAD FIX RESULTS")
    print("="*80)
    print(f"Total files tested: {total_tests}")
    print(f"Successful transcriptions: {successful_transcriptions}")
    if total_tests > 0:
        success_rate = (successful_transcriptions / total_tests) * 100
        print(f"Success rate: {success_rate:.1f}%")
        
        if success_rate > 50:
            print("🎉 SIGNIFICANT IMPROVEMENT! VAD fix is working!")
        elif success_rate > 25:
            print("📈 Good improvement! VAD fix helps but may need more tuning.")
        else:
            print("⚠️ Limited improvement. May need to investigate other factors.")
    
    print(f"\nCompare with previous success rate of 10%")

if __name__ == "__main__":
    main() 