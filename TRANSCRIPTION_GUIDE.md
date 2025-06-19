# Audio Recording Transcript Generation Guide

This guide explains how to generate transcripts from audio recordings using the Friday app's transcription system.

## Overview

Friday uses OpenAI's Whisper model for high-quality speech-to-text transcription. The system supports:
- Real-time transcription during recording
- Batch processing of existing audio files
- Multiple output formats (text, JSON, SRT)
- Various Whisper model sizes for different quality/speed tradeoffs

## Method 1: Real-time Transcription (Built-in)

The Friday app automatically transcribes audio during recording:

1. **Start the application:**
   ```bash
   npm run dev
   ```

2. **Start recording:**
   - Click the microphone button in the UI
   - Or use the global shortcut (configured in settings)

3. **Transcription happens automatically:**
   - Live text appears in real-time during recording
   - Complete transcript is saved when recording stops
   - Transcript is stored in the database with timestamps

## Method 2: Standalone File Transcription

Use the `standalone_transcribe.py` script to transcribe individual audio files:

### Basic Usage
```bash
python3 standalone_transcribe.py "path/to/audio/file.mp3"
```

### Advanced Options
```bash
# Specify output file
python3 standalone_transcribe.py "audio.mp3" -o "transcript.txt"

# JSON format with detailed metadata
python3 standalone_transcribe.py "audio.mp3" -f json -o "transcript.json"

# SRT format for video subtitles
python3 standalone_transcribe.py "audio.mp3" -f srt -o "subtitles.srt"

# Use larger model for higher accuracy
python3 standalone_transcribe.py "audio.mp3" -m large
```

### Supported Formats
- **Input:** MP3, WAV, FLAC, M4A, MP4, WebM, OGG
- **Output:** Text (.txt), JSON (.json), SRT (.srt)

### Model Options
| Model | Size | Speed | Accuracy | Use Case |
|-------|------|-------|----------|----------|
| tiny  | 39MB | Fastest | Lower | Quick drafts |
| base  | 74MB | Fast | Good | General use |
| small | 244MB | Medium | Better | **Default, balanced** |
| medium| 769MB | Slow | High | Important recordings |
| large | 1550MB | Slowest | Highest | Critical accuracy |

## Method 3: Batch Processing

Use `batch_transcribe.py` to process multiple files at once:

### Basic Batch Processing
```bash
# Process all audio files in a directory
python3 batch_transcribe.py "/Users/amirdor/Documents/Friday Recordings/"

# Process with custom output directory
python3 batch_transcribe.py "/path/to/audio/" -o "/path/to/transcripts/"
```

### Advanced Batch Options
```bash
# Parallel processing with 4 jobs
python3 batch_transcribe.py "/path/to/audio/" -j 4

# Recursive search in subdirectories
python3 batch_transcribe.py "/path/to/audio/" --recursive

# JSON output format
python3 batch_transcribe.py "/path/to/audio/" -f json

# Use medium model for higher accuracy
python3 batch_transcribe.py "/path/to/audio/" -m medium
```

## Example: Transcribing Your Recent Recording

Based on your recent recording:

```bash
# Basic transcription
python3 standalone_transcribe.py "/Users/amirdor/Documents/Friday Recordings/combined-recording-2025-06-16T20-28-07-644Z.mp3"

# Save to file with timestamps
python3 standalone_transcribe.py "/Users/amirdor/Documents/Friday Recordings/combined-recording-2025-06-16T20-28-07-644Z.mp3" -o "transcript.txt"

# High-quality JSON output
python3 standalone_transcribe.py "/Users/amirdor/Documents/Friday Recordings/combined-recording-2025-06-16T20-28-07-644Z.mp3" -f json -m medium -o "detailed_transcript.json"
```

## Output Examples

### Text Format
```
File: combined-recording-2025-06-16T20-28-07-644Z.mp3
Language: en (1.00)
Duration: 13.12s

Transcript:
--------------------------------------------------
L.A. or Mayberry? A cop's a cop. Oh, no. He's from a sweet home, not Mayberry...
--------------------------------------------------

Timestamped Segments:
[00:00] L.A. or Mayberry?
[00:01] A cop's a cop.
[00:02] Oh, no.
...
```

### JSON Format
```json
{
  "file": "/path/to/audio.mp3",
  "language": "en",
  "language_probability": 1.0,
  "duration": 13.12,
  "segments": [
    {
      "start": 0.0,
      "end": 1.2,
      "text": "L.A. or Mayberry?"
    }
  ],
  "full_text": "Complete transcript text..."
}
```

### SRT Format
```
1
00:00:00,000 --> 00:00:01,200
L.A. or Mayberry?

2
00:00:01,200 --> 00:00:02,400
A cop's a cop.
```

## Integration with Friday App

### Database Storage
Transcripts are automatically stored in the SQLite database with:
- Meeting metadata (title, date, duration)
- Complete transcript with timestamps
- Audio file paths
- Context and tags

### API Access
You can access transcripts programmatically through the app's IPC handlers:
```javascript
// In renderer process
const transcript = await window.api.meetings.getTranscript(meetingId)
```

## Performance Tips

1. **Model Selection:**
   - Use `small` model for most cases (good balance)
   - Use `tiny` for quick previews
   - Use `large` only for critical transcriptions

2. **Parallel Processing:**
   - Use 2-4 parallel jobs for batch processing
   - More jobs may cause memory issues

3. **File Formats:**
   - WAV files process fastest
   - MP3/FLAC are automatically converted
   - Avoid very long files (>1 hour) for memory reasons

## Troubleshooting

### Common Issues

1. **Model Loading Errors:**
   - Ensure internet connection for first download
   - Check available disk space (models are large)

2. **Audio Format Issues:**
   - Install required dependencies: `pip install av faster-whisper`
   - Some formats may need conversion

3. **Memory Issues:**
   - Use smaller models (`tiny` or `base`)
   - Reduce parallel jobs in batch processing
   - Split very long audio files

### Dependencies
```bash
# Install required packages
pip install faster-whisper sentence-transformers av

# For M1/M2 Macs, you might need:
conda install pytorch torchvision torchaudio -c pytorch
```

## Advanced Features

### Custom Alert Keywords
The transcription system includes semantic keyword matching for alerts:
```python
# Example: Check for specific topics in transcript
keywords = [
    {"keyword": "action items", "threshold": 0.7, "enabled": True},
    {"keyword": "deadlines", "threshold": 0.8, "enabled": True}
]
```

### Real-time Processing
The main app processes audio in 5-second chunks for near real-time transcription while recording.

## API Integration

For developers wanting to integrate transcription:

```javascript
// Start transcription service
await window.api.transcription.start()

// Process audio chunk
const result = await window.api.transcription.processChunk(audioBuffer)

// Get transcript
if (result.success) {
    console.log('Transcript:', result.transcript)
}
```

---

This system provides flexible, high-quality transcription capabilities for all your audio recording needs! 