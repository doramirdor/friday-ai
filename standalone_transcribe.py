#!/usr/bin/env python3
"""
Standalone transcription tool for Friday app
Transcribes any audio file using the same Whisper model
"""

import sys
import os
import json
import argparse
from pathlib import Path
from faster_whisper import WhisperModel

def transcribe_audio_file(audio_path, output_format='text', model_size='small'):
    """
    Transcribe an audio file to text
    
    Args:
        audio_path: Path to the audio file
        output_format: 'text', 'json', or 'srt'
        model_size: Whisper model size ('tiny', 'base', 'small', 'medium', 'large')
    """
    
    if not os.path.exists(audio_path):
        print(f"❌ Audio file not found: {audio_path}")
        return None
    
    print(f"🎤 Loading Whisper model ({model_size})...")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    
    print(f"🔄 Transcribing: {audio_path}")
    
    # Transcribe with same settings as main app
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,  # Higher quality for batch processing
        language="en",
        condition_on_previous_text=True,
        temperature=0.0,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500)
    )
    
    print(f"📊 Detected language: {info.language} (probability: {info.language_probability:.2f})")
    print(f"⏱️ Duration: {info.duration:.2f} seconds")
    
    # Collect segments
    transcript_segments = []
    full_text = ""
    
    for segment in segments:
        transcript_segments.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip()
        })
        full_text += segment.text + " "
    
    result = {
        "file": audio_path,
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
        "segments": transcript_segments,
        "full_text": full_text.strip()
    }
    
    return result

def format_output(result, output_format):
    """Format the transcription result"""
    
    if output_format == 'json':
        return json.dumps(result, indent=2)
    
    elif output_format == 'srt':
        srt_content = ""
        for i, segment in enumerate(result['segments'], 1):
            start_time = format_timestamp(segment['start'])
            end_time = format_timestamp(segment['end'])
            srt_content += f"{i}\n{start_time} --> {end_time}\n{segment['text']}\n\n"
        return srt_content
    
    else:  # text format
        output = f"File: {result['file']}\n"
        output += f"Language: {result['language']} ({result['language_probability']:.2f})\n"
        output += f"Duration: {result['duration']:.2f}s\n"
        output += f"\nTranscript:\n{'-' * 50}\n"
        output += result['full_text']
        output += f"\n{'-' * 50}\n"
        
        if len(result['segments']) > 1:
            output += "\nTimestamped Segments:\n"
            for segment in result['segments']:
                start_min = int(segment['start'] // 60)
                start_sec = int(segment['start'] % 60)
                output += f"[{start_min:02d}:{start_sec:02d}] {segment['text']}\n"
        
        return output

def format_timestamp(seconds):
    """Convert seconds to SRT timestamp format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio files using Friday's Whisper model")
    parser.add_argument("audio_file", help="Path to the audio file to transcribe")
    parser.add_argument("-o", "--output", help="Output file path (default: stdout)")
    parser.add_argument("-f", "--format", choices=['text', 'json', 'srt'], default='text',
                       help="Output format (default: text)")
    parser.add_argument("-m", "--model", choices=['tiny', 'base', 'small', 'medium', 'large'], 
                       default='small', help="Whisper model size (default: small)")
    
    args = parser.parse_args()
    
    # Transcribe the audio file
    result = transcribe_audio_file(args.audio_file, args.format, args.model)
    
    if result is None:
        sys.exit(1)
    
    # Format the output
    formatted_output = format_output(result, args.format)
    
    # Write to file or stdout
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(formatted_output)
        print(f"✅ Transcript saved to: {args.output}")
    else:
        print("\n" + formatted_output)

if __name__ == "__main__":
    main() 