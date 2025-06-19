# Enhanced Live Transcription with Chunking Support

## Overview

This enhancement adds sophisticated chunking and streaming capabilities to the Friday transcription service, similar to the Rust reference implementation. The system now supports:

- **Continuous audio streaming** with intelligent buffering
- **Automatic chunking** with configurable overlap for better transcription accuracy
- **Sentence-aware transcript accumulation** with timeout handling
- **Multi-stream support** for simultaneous microphone and system audio processing
- **Both file-based and streaming protocols** for maximum compatibility

## Key Features

### 1. Audio Stream Buffering (`AudioStreamBuffer`)

**Smart Buffering:**
- Maintains rolling audio buffers for each stream
- Configurable chunk sizes (default: 30 seconds)
- Overlap handling for transcription continuity
- Thread-safe operations with proper locking

**Configuration Constants:**
```python
CHUNK_DURATION_MS = 30000      # 30 seconds per chunk
MIN_CHUNK_DURATION_MS = 2000   # Minimum 2 seconds before processing  
SENTENCE_TIMEOUT_MS = 1000     # 1 second timeout for incomplete sentences
BUFFER_OVERLAP_MS = 1000       # 1 second overlap between chunks
```

### 2. Transcript Accumulation (`TranscriptAccumulator`)

**Intelligent Text Processing:**
- Accumulates transcript segments into complete sentences
- Detects sentence boundaries (., ?, !)
- Handles timeouts for incomplete sentences
- Deduplication to prevent repeated segments
- Context-aware processing with segment history

**Features:**
- Real-time sentence completion detection
- Automatic timeout handling for speech pauses
- Stream-specific processing (microphone vs system audio)
- Enhanced timestamp tracking

### 3. Streaming Transcription Server (`StreamingTranscriptionServer`)

**Multi-Stream Management:**
- Support for multiple concurrent audio streams
- Stream lifecycle management (start/stop/cleanup)
- Background processing thread for continuous transcription
- Stream-specific audio buffers and accumulators

**Stream Operations:**
```python
# Start a new audio stream
start_stream(stream_id, stream_type)

# Add audio data to stream
add_audio_chunk(stream_id, audio_data)

# Stop and cleanup stream
stop_stream(stream_id)
```

## Protocol Enhancements

### New Streaming Protocol

#### Start Stream
```json
{
    "type": "start_stream",
    "stream_id": "mic_stream_1",
    "stream_type": "microphone"  // or "system"
}
```

#### Send Audio Chunk
```json
{
    "type": "stream_chunk", 
    "stream_id": "mic_stream_1",
    "audio_data": "<base64_encoded_audio>"
}
```

#### Stop Stream
```json
{
    "type": "stop_stream",
    "stream_id": "mic_stream_1"
}
```

### Legacy Protocol Support

The system maintains full backward compatibility with the existing file-based protocol:

```json
{
    "type": "dual_stream_chunk",
    "audio_path": "/path/to/audio.wav",
    "stream_type": "microphone"
}
```

## Architecture Improvements

### 1. Background Processing Thread

**Continuous Processing:**
- Dedicated thread monitors all active streams
- Automatic chunk extraction when ready
- Real-time transcription processing
- Broadcast of transcript updates

**Processing Flow:**
```
Audio Data → Buffer → Chunk Detection → Whisper Transcription → 
Segment Accumulation → Sentence Detection → Broadcast Update
```

### 2. Enhanced Error Handling

**Robust Operations:**
- Stream cleanup on client disconnection
- Graceful handling of processing errors
- Automatic resource management
- Comprehensive logging

### 3. Memory Management

**Efficient Resource Usage:**
- Circular buffers with size limits
- Automatic cleanup of old segments
- Memory-efficient audio processing
- Proper thread synchronization

## Integration with Friday App

### Current File-Based Integration

The enhanced service maintains compatibility with the existing Friday app integration:

```typescript
// Existing dual stream chunk processing
const request = {
    type: 'dual_stream_chunk',
    audio_path: audioPath,
    stream_type: streamType
}
transcriptionSocket.write(JSON.stringify(request) + '\n')
```

### Future Streaming Integration

To fully utilize the new capabilities, the Friday app could be enhanced to use streaming:

```typescript
// Future streaming integration
const streamId = `friday_stream_${Date.now()}`

// Start stream
await transcriptionAPI.startStream(streamId, 'microphone')

// Send audio chunks continuously
const audioChunk = await captureAudio()
await transcriptionAPI.sendAudioChunk(streamId, audioChunk)

// Receive real-time updates
transcriptionAPI.onTranscriptUpdate((update) => {
    console.log('Live transcript:', update.text)
})
```

## Performance Benefits

### 1. Reduced Latency

**Streaming Processing:**
- No file I/O overhead for temporary files
- Continuous processing eliminates batch delays
- Overlapping chunks ensure no audio loss
- Real-time sentence detection

### 2. Better Accuracy

**Context Preservation:**
- Chunk overlap maintains speech continuity
- Sentence-aware processing improves coherence
- Stream-specific optimization (mic vs system audio)
- Reduced VAD false positives

### 3. Resource Efficiency

**Optimized Processing:**
- Memory-efficient circular buffers
- Automatic cleanup of processed data
- Thread-safe concurrent processing
- Configurable resource limits

## Testing

### Unit Testing

Use the provided test script to verify functionality:

```bash
python test_streaming_transcription.py
```

**Test Coverage:**
- Stream lifecycle management
- Audio chunk processing
- Error handling
- Legacy protocol compatibility

### Integration Testing

**With Friday App:**
1. Start the enhanced transcription service
2. Begin recording in Friday app
3. Verify real-time transcript updates
4. Test both microphone and system audio streams

## Configuration

### Audio Settings

```python
# Adjust these constants in transcribe.py for different requirements

# For lower latency (trades accuracy)
CHUNK_DURATION_MS = 15000      # 15 seconds
MIN_CHUNK_DURATION_MS = 1000   # 1 second minimum

# For higher accuracy (higher latency)  
CHUNK_DURATION_MS = 45000      # 45 seconds
MIN_CHUNK_DURATION_MS = 3000   # 3 second minimum
```

### Stream Management

```python
# Maximum concurrent streams per client
MAX_STREAMS_PER_CLIENT = 4

# Buffer size limits
MAX_BUFFER_SAMPLES = 480000    # 30 seconds at 16kHz
MAX_SEGMENT_HISTORY = 50       # Recent segments to keep
```

## Future Enhancements

### 1. WebSocket Support

Replace TCP sockets with WebSockets for better web integration:
- Real-time bidirectional communication
- Better error handling and reconnection
- Native browser support

### 2. Multiple Model Support

Add support for different transcription models:
- Fast models for real-time processing
- Accurate models for final transcription
- Language-specific optimizations

### 3. Advanced Stream Management

Enhanced stream features:
- Stream prioritization
- Quality-based processing
- Adaptive chunk sizing
- Real-time audio level monitoring

### 4. Client SDK

Develop client libraries for easy integration:
- JavaScript/TypeScript SDK for web clients
- Python SDK for other applications
- Error handling and reconnection logic

## Troubleshooting

### Common Issues

**High Memory Usage:**
- Reduce `MAX_BUFFER_SAMPLES`
- Increase cleanup frequency
- Monitor stream count

**High Latency:**
- Reduce `CHUNK_DURATION_MS`
- Reduce `MIN_CHUNK_DURATION_MS` 
- Optimize Whisper model settings

**Transcription Accuracy:**
- Increase chunk overlap
- Adjust VAD parameters
- Use higher quality audio input

### Debug Logging

Enable detailed logging by modifying log levels:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Performance Monitoring

Monitor key metrics:
- Buffer fill rates
- Processing latency
- Memory usage per stream
- Transcription accuracy rates

---

This enhanced live transcription system provides a robust foundation for real-time audio processing while maintaining compatibility with existing Friday app functionality. The streaming capabilities enable more responsive user experiences and better resource utilization. 