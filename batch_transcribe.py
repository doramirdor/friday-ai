#!/usr/bin/env python3
"""
Batch transcription tool for Friday app
Process multiple audio files in a directory
"""

import sys
import os
import json
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from faster_whisper import WhisperModel
import time

# Audio file extensions supported by Whisper
SUPPORTED_EXTENSIONS = {'.mp3', '.wav', '.flac', '.m4a', '.mp4', '.webm', '.ogg'}

def transcribe_file(model, file_path, output_dir, output_format):
    """Transcribe a single file"""
    try:
        print(f"🔄 Transcribing: {file_path.name}")
        
        # Transcribe with optimized settings
        segments, info = model.transcribe(
            str(file_path),
            beam_size=3,  # Balanced speed vs quality for batch
            language="en",
            condition_on_previous_text=True,
            temperature=0.0,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
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
            "file": str(file_path),
            "filename": file_path.name,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "segments": transcript_segments,
            "full_text": full_text.strip()
        }
        
        # Save output
        output_file = output_dir / f"{file_path.stem}_transcript"
        
        if output_format == 'json':
            output_file = output_file.with_suffix('.json')
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
        
        elif output_format == 'srt':
            output_file = output_file.with_suffix('.srt')
            with open(output_file, 'w', encoding='utf-8') as f:
                for i, segment in enumerate(result['segments'], 1):
                    start_time = format_timestamp(segment['start'])
                    end_time = format_timestamp(segment['end'])
                    f.write(f"{i}\n{start_time} --> {end_time}\n{segment['text']}\n\n")
        
        else:  # text format
            output_file = output_file.with_suffix('.txt')
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(f"File: {result['filename']}\n")
                f.write(f"Language: {result['language']} ({result['language_probability']:.2f})\n")
                f.write(f"Duration: {result['duration']:.2f}s\n")
                f.write(f"\nTranscript:\n{'-' * 50}\n")
                f.write(result['full_text'])
                f.write(f"\n{'-' * 50}\n")
                
                if len(result['segments']) > 1:
                    f.write("\nTimestamped Segments:\n")
                    for segment in result['segments']:
                        start_min = int(segment['start'] // 60)
                        start_sec = int(segment['start'] % 60)
                        f.write(f"[{start_min:02d}:{start_sec:02d}] {segment['text']}\n")
        
        print(f"✅ Completed: {file_path.name} -> {output_file.name}")
        return {
            'success': True,
            'file': str(file_path),
            'output': str(output_file),
            'duration': info.duration,
            'text_length': len(full_text)
        }
        
    except Exception as e:
        print(f"❌ Error processing {file_path.name}: {e}")
        return {
            'success': False,
            'file': str(file_path),
            'error': str(e)
        }

def format_timestamp(seconds):
    """Convert seconds to SRT timestamp format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def find_audio_files(directory):
    """Find all audio files in directory"""
    audio_files = []
    directory = Path(directory)
    
    for file_path in directory.rglob('*'):
        if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
            audio_files.append(file_path)
    
    return sorted(audio_files)

def main():
    parser = argparse.ArgumentParser(description="Batch transcribe audio files using Friday's Whisper model")
    parser.add_argument("input_dir", help="Directory containing audio files")
    parser.add_argument("-o", "--output-dir", help="Output directory (default: same as input)")
    parser.add_argument("-f", "--format", choices=['text', 'json', 'srt'], default='text',
                       help="Output format (default: text)")
    parser.add_argument("-m", "--model", choices=['tiny', 'base', 'small', 'medium', 'large'], 
                       default='small', help="Whisper model size (default: small)")
    parser.add_argument("-j", "--jobs", type=int, default=2,
                       help="Number of parallel jobs (default: 2)")
    parser.add_argument("--recursive", action='store_true',
                       help="Search subdirectories recursively")
    
    args = parser.parse_args()
    
    # Setup paths
    input_dir = Path(args.input_dir)
    if not input_dir.exists():
        print(f"❌ Input directory not found: {input_dir}")
        sys.exit(1)
    
    output_dir = Path(args.output_dir) if args.output_dir else input_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Find audio files
    print(f"🔍 Searching for audio files in: {input_dir}")
    if args.recursive:
        audio_files = find_audio_files(input_dir)
    else:
        audio_files = [f for f in input_dir.iterdir() 
                      if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS]
        audio_files.sort()
    
    if not audio_files:
        print("❌ No audio files found")
        sys.exit(1)
    
    print(f"📁 Found {len(audio_files)} audio files")
    
    # Load model once for all files
    print(f"🎤 Loading Whisper model ({args.model})...")
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    
    # Process files
    start_time = time.time()
    results = []
    
    if args.jobs == 1:
        # Sequential processing
        for file_path in audio_files:
            result = transcribe_file(model, file_path, output_dir, args.format)
            results.append(result)
    else:
        # Parallel processing (limited to avoid memory issues)
        with ThreadPoolExecutor(max_workers=min(args.jobs, len(audio_files))) as executor:
            # Submit jobs
            future_to_file = {
                executor.submit(transcribe_file, model, file_path, output_dir, args.format): file_path
                for file_path in audio_files
            }
            
            # Collect results
            for future in as_completed(future_to_file):
                result = future.result()
                results.append(result)
    
    # Summary
    end_time = time.time()
    successful = sum(1 for r in results if r['success'])
    failed = len(results) - successful
    total_duration = sum(r.get('duration', 0) for r in results if r['success'])
    total_text = sum(r.get('text_length', 0) for r in results if r['success'])
    
    print(f"\n📊 Batch Transcription Summary")
    print(f"{'=' * 50}")
    print(f"Total files processed: {len(results)}")
    print(f"Successful: {successful}")
    print(f"Failed: {failed}")
    print(f"Total audio duration: {total_duration:.1f} seconds ({total_duration/60:.1f} minutes)")
    print(f"Total text generated: {total_text:,} characters")
    print(f"Processing time: {end_time - start_time:.1f} seconds")
    print(f"Output directory: {output_dir}")
    
    if failed > 0:
        print(f"\n❌ Failed files:")
        for result in results:
            if not result['success']:
                print(f"  - {Path(result['file']).name}: {result['error']}")

if __name__ == "__main__":
    main() 