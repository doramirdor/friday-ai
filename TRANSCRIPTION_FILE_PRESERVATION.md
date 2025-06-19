# Transcription File Preservation

This document describes the file preservation feature for Friday's transcription system.

## Overview

The transcription service now preserves all audio files that are sent for transcription instead of automatically deleting them. This helps with debugging and understanding what audio data is being processed.

## Configuration

The preservation feature is controlled by the `PRESERVE_TRANSCRIPTION_FILES` variable in `transcribe.py`:

```python
PRESERVE_TRANSCRIPTION_FILES = True  # Set to False to revert to old behavior
```

## Preserved Files Location

Files are preserved in: `~/Documents/Friday_Transcription_Files/`

The directory structure includes:
- `transcription_log.txt` - Detailed log of all transcription attempts
- `*.wav` files - Preserved audio files with descriptive names

## File Naming Convention

Preserved files follow this pattern:
```
YYYYMMDD_HHMMSS_{stream_type}_{original_name}_{chunk_id}.wav
```

Example: `20241215_143022_system_system_audio_chunk_1734275822.123_45.wav`

## Log File Format

The `transcription_log.txt` contains JSON entries with the following structure:

```json
{
  "timestamp": "2024-12-15 14:30:22",
  "original_path": "/path/to/original/file.wav",
  "preserved_path": "/path/to/preserved/file.wav", 
  "stream_type": "system",
  "transcript": "Hello world",
  "file_size": 12345,
  "chunk_id": 123
}
```

## Analysis Tool

Use `analyze_transcription_files.py` to analyze preserved files:

```bash
python3 analyze_transcription_files.py [directory]
```

This tool provides:
- Statistics on transcription success rates
- File size summaries by stream type
- Recent error analysis
- List of preserved files

## What Gets Preserved

The system preserves:
- ✅ Successfully transcribed files
- ✅ Files with transcription errors 
- ✅ Files with short duration (< 100ms)
- ✅ Files with no audio streams
- ✅ **Converted files** (the ones with actual audio data that Whisper processes)

**Important**: The system preserves the converted WAV files (16kHz, mono, PCM format) rather than the original files because:
- Original files may be in formats that don't contain usable audio data
- The conversion process extracts and properly formats the audio for transcription
- Converted files are what Whisper actually processes and contain the real audio content

## Storage Management

Since files are now preserved, you may want to periodically clean up the preserved files directory to manage disk space. Consider:

1. Setting up a cron job to delete files older than X days
2. Monitoring disk usage in the preserved files directory
3. Archiving files to external storage if needed

## Debugging Benefits

This feature helps with:
- Understanding why certain audio chunks fail transcription
- Analyzing audio quality issues
- Debugging system vs microphone audio streams
- Performance analysis of transcription accuracy

## Reverting to Old Behavior

To revert to automatically deleting files after transcription:

1. Edit `transcribe.py`
2. Set `PRESERVE_TRANSCRIPTION_FILES = False`
3. Restart the transcription service 