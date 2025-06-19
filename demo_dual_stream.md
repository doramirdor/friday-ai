# Dual Stream Live Transcription Demo

This demo shows how to use the new dual stream live transcription feature that separates microphone and system audio into different transcript views.

## ✨ Features

- **Real-time transcription** for both microphone and system audio
- **Separate UI panels** for mic vs system audio transcripts
- **Live text preview** showing currently processing audio
- **Visual indicators** to distinguish between audio sources
- **Stream identification** in the transcription service

## 🚀 How to Use

### 1. Start the Friday App

```bash
npm run dev
```

### 2. Enable Dual Stream Transcription

The system automatically detects and processes both audio streams when you start a combined recording:

- **Microphone stream** (blue): Captures your voice and microphone input
- **System audio stream** (green): Captures computer audio, videos, music, etc.

### 3. View Live Transcripts

Use the new `DualStreamTranscriptView` component to see real-time transcripts:

```tsx
import DualStreamTranscriptView from './components/DualStreamTranscriptView'

// In your component:
const recordingState = recordingService.getState()

return (
  <DualStreamTranscriptView
    isRecording={recordingState.isRecording}
    microphoneTranscript={recordingState.microphoneTranscript}
    systemAudioTranscript={recordingState.systemAudioTranscript}
    liveTextMicrophone={recordingState.liveTextMicrophone}
    liveTextSystemAudio={recordingState.liveTextSystemAudio}
    currentTime={recordingState.currentTime}
  />
)
```

## 🔧 Technical Implementation

### Enhanced Transcription Service

The transcription service now supports stream identification:

```python
# Python transcription service
def transcribe_chunk(self, audio_path, stream_type="microphone"):
    # ... transcription logic ...
    return {
        "type": "transcript",
        "text": transcription.strip(),
        "stream_type": stream_type,  # "microphone" or "system"
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
        "chunk_id": self.chunk_counter
    }
```

### Dual Stream Processing

```typescript
// Enhanced IPC handler for dual streams
ipcMain.handle('transcription:process-dual-stream-chunk', 
  async (_, audioBuffer: ArrayBuffer, streamType: 'microphone' | 'system') => {
    const filePath = saveAudioChunk(buffer, streamType)
    
    const request = {
      type: 'dual_stream_chunk',
      audio_path: filePath,
      stream_type: streamType
    }
    
    transcriptionSocket.write(JSON.stringify(request) + '\n')
    return { success: true }
  }
)
```

### Recording Service State

The recording service now maintains separate state for each stream:

```typescript
interface RecordingServiceState {
  // ... existing properties ...
  microphoneTranscript: TranscriptLine[]
  systemAudioTranscript: TranscriptLine[]
  liveTextMicrophone: string
  liveTextSystemAudio: string
}
```

## 📱 UI Components

### Dual Stream Transcript View

- **Side-by-side panels** for microphone and system audio
- **Color-coded borders** (blue for mic, green for system)
- **Live indicators** showing real-time status
- **Scrollable transcript history** with timestamps
- **Live text preview** for currently processing audio

### Visual Design

- **Microphone Panel**: Blue theme with mic icon
- **System Audio Panel**: Green theme with speaker icon
- **Live Indicators**: Pulsing dots when recording
- **Timestamps**: Precise timing for each transcript segment

## 🎯 Use Cases

1. **Meeting Recording**: Separate your voice from presentation audio
2. **Podcast Production**: Distinguish host speech from background music
3. **Tutorial Creation**: Separate narration from system sounds
4. **Interview Transcription**: Separate local microphone from remote audio
5. **Gaming**: Separate voice chat from game audio

## 🔧 Customization

### Stream Detection

The system automatically detects stream types from filename patterns:

```python
# Auto-detection in transcription service
stream_type = "microphone"  # default
if "_system" in audio_path.lower():
    stream_type = "system"
elif "_mic" in audio_path.lower():
    stream_type = "microphone"
```

### UI Customization

Easy to customize the dual stream view:

```tsx
<TranscriptPanel
  title="Microphone"
  icon={<MicIcon size={18} />}
  transcript={microphoneTranscript}
  liveText={liveTextMicrophone}
  color="#3b82f6"  // Customize colors
/>
```

## 🚀 Getting Started

1. **Start recording** with combined mode (system + microphone)
2. **Speak into your microphone** - see blue panel populate
3. **Play audio/video** - see green panel populate  
4. **Watch live transcription** in real-time
5. **Review separate transcripts** for each audio source

## 🔮 Future Enhancements

- **Audio source switching**: Toggle between sources
- **Export separate transcripts**: Save mic and system transcripts separately
- **Advanced filtering**: Remove background noise per stream
- **Real-time translation**: Translate each stream independently
- **Speaker identification**: Identify multiple speakers per stream

---

This dual stream feature provides powerful separation of audio sources for more accurate and useful transcriptions! 