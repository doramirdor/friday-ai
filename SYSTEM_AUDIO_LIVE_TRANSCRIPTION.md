# System Audio Live Transcription Implementation

## Overview

This implementation adds live transcription capabilities for system audio recording, similar to the existing microphone recording live transcription. The system now supports dual-stream live transcription, processing both microphone and system audio in real-time.

## Architecture

### 1. Swift Recorder Enhancement (`src/main/recorder/main.swift`)

**New Features:**
- **Live transcription flag**: `--live-transcription` enables real-time audio chunk processing
- **Audio buffering**: Collects system audio in 3-second chunks for transcription
- **Chunk processing**: Saves audio chunks as WAV files and sends paths to the main process
- **Stream identification**: Tags chunks as `system` audio type

**Key Changes:**
```swift
// New properties
var enableLiveTranscription = false
var transcriptionChunkDuration: TimeInterval = 3.0
var audioBufferQueue: [AVAudioPCMBuffer] = []
let audioBufferQueueLock = NSLock()

// Audio buffering in stream callback
func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
    // ... existing recording code ...
    
    // Also buffer for live transcription if enabled
    if enableLiveTranscription {
        audioBufferQueueLock.lock()
        audioBufferQueue.append(audioBuffer)
        audioBufferQueueLock.unlock()
    }
}
```

### 2. Main Process Integration (`src/main/index.ts`)

**Enhanced Output Handling:**
- **Live transcription flag**: Automatically passes `--live-transcription` to Swift recorder
- **Chunk processing**: Handles `TRANSCRIPTION_CHUNK` events from Swift recorder
- **Dual stream routing**: Sends system audio chunks to transcription service with `stream_type: 'system'`

**Key Changes:**
```typescript
// Enable live transcription in combined recording
const args = [
  '--record', resolvedPath,
  '--filename', baseFilename,
  '--live-transcription'  // Enable live transcription chunks
]

// Handle live transcription chunks
else if (response.code === 'TRANSCRIPTION_CHUNK') {
  const request = {
    type: 'dual_stream_chunk',
    audio_path: response.path,
    stream_type: response.stream_type || 'system'
  }
  transcriptionSocket.write(JSON.stringify(request) + '\n')
}
```

### 3. Recording Service Enhancement (`src/renderer/src/components/RecordingService.tsx`)

**Dual Stream Transcript Management:**
- **Stream-specific transcripts**: Separate handling for microphone and system audio
- **Live text streams**: Individual live text for each audio source
- **Combined compatibility**: Maintains backward compatibility with existing transcript format

**Key Changes:**
```typescript
// Enhanced transcription result handling
const handleTranscriptionResult = useCallback((result: TranscriptionResult & { stream_type?: string }): void => {
  const streamType = result.stream_type || 'microphone'
  
  if (streamType === 'system') {
    // Add to system audio live text and transcript
    liveTextSystemAudioRef.current = liveTextSystemAudioRef.current + ' ' + result.text
    systemAudioTranscriptRef.current = [...systemAudioTranscriptRef.current, newLine]
  } else {
    // Add to microphone live text and transcript
    liveTextMicrophoneRef.current = liveTextMicrophoneRef.current + ' ' + result.text
    microphoneTranscriptRef.current = [...microphoneTranscriptRef.current, newLine]
  }
}, [])
```

### 4. Python Transcription Service (`transcribe.py`)

**Dual Stream Support** (already implemented):
- **Stream identification**: Accepts `stream_type` parameter for chunk processing
- **JSON protocol**: Handles both legacy file paths and new dual stream requests
- **Result tagging**: Returns transcription results with `stream_type` identification

```python
# Dual stream chunk handling
elif request.get('type') == 'dual_stream_chunk':
    audio_path = request.get('audio_path', '')
    stream_type = request.get('stream_type', 'microphone')
    
    result = self.transcribe_chunk(audio_path, stream_type)
    response = json.dumps(result) + "\n"
    conn.send(response.encode())
```

## Data Flow

```
System Audio (ScreenCaptureKit)
    ↓ (3-second chunks)
Swift Recorder
    ↓ (TRANSCRIPTION_CHUNK events)
Main Process
    ↓ (dual_stream_chunk requests)
Python Transcription Service
    ↓ (transcription results with stream_type)
Recording Service
    ↓ (stream-specific transcript handling)
UI Components
```

## Usage

### Starting Combined Recording with Live Transcription

```typescript
const recordingService = useRecordingService({...})

// Start combined recording (automatically enables live transcription)
await recordingService.startRecording('combined')

// Access stream-specific transcripts
const state = recordingService.getState()
console.log('Microphone transcript:', state.microphoneTranscript)
console.log('System audio transcript:', state.systemAudioTranscript)
console.log('Live microphone text:', state.liveTextMicrophone)
console.log('Live system audio text:', state.liveTextSystemAudio)
```

### State Structure

The recording service now provides separate transcript streams:

```typescript
interface RecordingServiceState {
  // Stream-specific transcripts
  microphoneTranscript: TranscriptLine[]
  systemAudioTranscript: TranscriptLine[]
  
  // Stream-specific live text
  liveTextMicrophone: string
  liveTextSystemAudio: string
  
  // Combined (backward compatibility)
  transcript: TranscriptLine[]
  liveText: string
  
  // ... other properties
}
```

## Benefits

1. **Real-time Feedback**: Users see live transcription for both microphone and system audio
2. **Stream Separation**: Distinguish between user speech and system audio content
3. **Enhanced UX**: Better understanding of what's being recorded and transcribed
4. **Backward Compatibility**: Existing functionality remains unchanged
5. **Efficient Processing**: 3-second chunks balance latency with accuracy

## Technical Considerations

### Performance
- **Chunk Size**: 3-second chunks provide good balance between latency and transcription accuracy
- **Memory Management**: Audio buffers are cleared after each chunk to prevent memory buildup
- **Concurrent Processing**: Both microphone and system audio transcription run in parallel

### File Management
- **Temporary Files**: System audio chunks are saved as temporary WAV files
- **Cleanup**: Transcription service automatically cleans up processed chunk files
- **Format Optimization**: 16kHz mono WAV format optimized for speech recognition

### Error Handling
- **Graceful Degradation**: If live transcription fails, recording continues normally
- **Service Recovery**: Automatic reconnection to transcription service if connection is lost
- **Buffer Management**: Thread-safe audio buffer handling prevents data corruption

## Testing

To test the implementation:

1. **Start the app**: `npm run dev`
2. **Enable combined recording**: Use the recording widget to start system + microphone recording
3. **Verify dual streams**: Check that both microphone and system audio appear in separate transcript views
4. **Monitor console**: Look for log messages indicating successful chunk processing:
   - `🎵 Received system audio transcription chunk`
   - `📤 Sent system audio chunk for transcription`
   - `🎤 Added microphone transcript line`
   - `🎵 Added system audio transcript line`

## Future Enhancements

1. **UI Improvements**: Visual indicators to distinguish between microphone and system audio transcripts
2. **Stream Filtering**: Option to enable/disable individual streams
3. **Latency Optimization**: Adjustable chunk duration based on user preferences
4. **Advanced Processing**: Speaker identification, audio level visualization
5. **Export Options**: Separate export formats for different audio streams 