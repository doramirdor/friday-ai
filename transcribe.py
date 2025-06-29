#!/usr/bin/env python3
import sys
import os
import json
import tempfile
import threading
import queue
import socket
import time
import av
import numpy as np
import fcntl  # For file locking
import atexit  # For cleanup on exit
import shutil  # For file operations
from datetime import datetime
from faster_whisper import WhisperModel
from sentence_transformers import SentenceTransformer, util
from typing import List, Dict, Optional, Tuple
import io
import wave
import struct
from collections import deque

# Configuration for file preservation
PRESERVE_TRANSCRIPTION_FILES = True  # Set to False to revert to old behavior
PRESERVED_FILES_DIR = os.path.expanduser("~/Documents/Friday_Transcription_Files")

# Audio streaming configuration
CHUNK_DURATION_MS = 30000  # 30 seconds per chunk for better sentence processing  
WHISPER_SAMPLE_RATE = 16000  # Whisper's required sample rate
MIN_CHUNK_DURATION_MS = 2000  # Minimum duration before sending chunk
SENTENCE_TIMEOUT_MS = 1000  # Emit incomplete sentence after 1 second of silence
BUFFER_OVERLAP_MS = 1000  # 1 second overlap between chunks for continuity

class TranscriptSegment:
    """Represents a transcript segment with timing information"""
    def __init__(self, text: str, start_time: float, end_time: float):
        self.text = text
        self.start_time = start_time
        self.end_time = end_time

class TranscriptAccumulator:
    """Accumulates transcript segments and manages sentence boundaries"""
    def __init__(self):
        self.current_sentence = ""
        self.sentence_start_time = 0.0
        self.last_update_time = time.time()
        self.last_segment_hash = 0
        self.segments_buffer = deque(maxlen=50)  # Keep recent segments for context
    
    def add_segment(self, segment: TranscriptSegment, stream_type: str) -> Optional[Dict]:
        """Add a segment and return a transcript update if a sentence is complete"""
        print(f"🔍 Processing new transcript segment ({stream_type}): {segment.text}", file=sys.stderr, flush=True)
        
        # Update the last update time
        self.last_update_time = time.time()
        
        # Clean up the text (remove [BLANK_AUDIO], [AUDIO OUT] and trim)
        clean_text = segment.text.replace("[BLANK_AUDIO]", "").replace("[AUDIO OUT]", "").strip()
        
        if not clean_text or (segment.end_time - segment.start_time) < 1.0:
            return None
        
        # Calculate hash to detect duplicates
        segment_hash = hash((clean_text, segment.start_time, segment.end_time))
        if segment_hash == self.last_segment_hash:
            return None
        self.last_segment_hash = segment_hash
        
        # Add to buffer for context
        self.segments_buffer.append(segment)
        
        # If this is the start of a new sentence, store the start time
        if not self.current_sentence:
            self.sentence_start_time = segment.start_time
        
        # Add the new text with proper spacing
        if self.current_sentence and not self.current_sentence.endswith(' '):
            self.current_sentence += ' '
        self.current_sentence += clean_text
        
        # Check if we have a complete sentence
        if clean_text.endswith('.') or clean_text.endswith('?') or clean_text.endswith('!'):
            sentence = self.current_sentence.strip()
            self.current_sentence = ""
            
            update = {
                "text": sentence,
                "timestamp": f"{self.sentence_start_time:.1f} - {segment.end_time:.1f}",
                "source": stream_type,
                "stream_type": stream_type
            }
            print(f"✅ Generated transcript update ({stream_type}): {update}", file=sys.stderr, flush=True)
            return update
        
        return None
    
    def check_timeout(self, stream_type: str) -> Optional[Dict]:
        """Check if current sentence should be emitted due to timeout"""
        if (self.current_sentence and 
            time.time() - self.last_update_time > SENTENCE_TIMEOUT_MS / 1000.0):
            
            sentence = self.current_sentence.strip()
            self.current_sentence = ""
            current_time = self.sentence_start_time + (SENTENCE_TIMEOUT_MS / 1000.0)
            
            update = {
                "text": sentence,
                "timestamp": f"{self.sentence_start_time:.1f} - {current_time:.1f}",
                "source": stream_type,
                "stream_type": stream_type
            }
            return update
        return None

class AudioStreamBuffer:
    """Manages audio streaming buffer for continuous transcription"""
    def __init__(self, stream_type: str, sample_rate: int = WHISPER_SAMPLE_RATE):
        self.stream_type = stream_type
        self.sample_rate = sample_rate
        self.audio_buffer = deque()
        self.buffer_lock = threading.Lock()
        self.total_samples = 0
        self.last_chunk_time = time.time()
        self.accumulator = TranscriptAccumulator()
        
        # Chunk configuration
        self.chunk_samples = int(sample_rate * (CHUNK_DURATION_MS / 1000.0))
        self.min_samples = int(sample_rate * (MIN_CHUNK_DURATION_MS / 1000.0))
        self.overlap_samples = int(sample_rate * (BUFFER_OVERLAP_MS / 1000.0))
        
        print(f"🎵 Initialized audio buffer for {stream_type}: chunk_samples={self.chunk_samples}, min_samples={self.min_samples}", file=sys.stderr, flush=True)
    
    def add_audio_data(self, audio_data: bytes) -> None:
        """Add raw audio data to the buffer"""
        with self.buffer_lock:
            # Convert bytes to float32 samples (assuming 32-bit float input)
            samples = np.frombuffer(audio_data, dtype=np.float32)
            self.audio_buffer.extend(samples)
            self.total_samples += len(samples)
            
            print(f"🔊 Added {len(samples)} samples to {self.stream_type} buffer (total: {self.total_samples})", file=sys.stderr, flush=True)
    
    def get_chunk_if_ready(self) -> Optional[np.ndarray]:
        """Get audio chunk if ready for processing"""
        with self.buffer_lock:
            current_buffer_size = len(self.audio_buffer)
            
            # Check if we should process based on size or time
            time_since_last = time.time() - self.last_chunk_time
            should_process = (
                current_buffer_size >= self.chunk_samples or
                (current_buffer_size >= self.min_samples and time_since_last >= CHUNK_DURATION_MS / 1000.0)
            )
            
            if should_process and current_buffer_size > 0:
                # Extract chunk (up to chunk_samples)
                chunk_size = min(current_buffer_size, self.chunk_samples)
                chunk = np.array([self.audio_buffer.popleft() for _ in range(chunk_size)])
                
                # Keep overlap samples for continuity
                overlap_size = min(self.overlap_samples, chunk_size)
                if overlap_size > 0:
                    overlap_data = chunk[-overlap_size:]
                    # Put overlap back at the beginning
                    self.audio_buffer.extendleft(reversed(overlap_data))
                
                self.last_chunk_time = time.time()
                print(f"📦 Extracted chunk from {self.stream_type}: {len(chunk)} samples (overlap: {overlap_size})", file=sys.stderr, flush=True)
                return chunk
        
        return None
    
    def clear_buffer(self) -> None:
        """Clear the audio buffer"""
        with self.buffer_lock:
            self.audio_buffer.clear()
            self.total_samples = 0
            print(f"🧹 Cleared {self.stream_type} audio buffer", file=sys.stderr, flush=True)

class StreamingTranscriptionServer:
    """Enhanced transcription server with streaming capabilities"""
    def __init__(self):
        self.audio_buffers: Dict[str, AudioStreamBuffer] = {}
        self.active_streams = set()
        self.processing_thread = None
        self.running = True
        
    def start_stream(self, stream_id: str, stream_type: str) -> Dict:
        """Start a new audio stream"""
        if stream_id in self.audio_buffers:
            return {"success": False, "error": "Stream already exists"}
        
        self.audio_buffers[stream_id] = AudioStreamBuffer(stream_type)
        self.active_streams.add(stream_id)
        
        print(f"🎬 Started audio stream: {stream_id} ({stream_type})", file=sys.stderr, flush=True)
        return {"success": True, "stream_id": stream_id}
    
    def stop_stream(self, stream_id: str) -> Dict:
        """Stop an audio stream"""
        if stream_id not in self.audio_buffers:
            return {"success": False, "error": "Stream not found"}
        
        # Process any remaining audio in buffer
        buffer = self.audio_buffers[stream_id]
        with buffer.buffer_lock:
            if len(buffer.audio_buffer) > 0:
                remaining_chunk = np.array(list(buffer.audio_buffer))
                # Process remaining chunk...
                print(f"🔄 Processing final chunk for stream {stream_id}: {len(remaining_chunk)} samples", file=sys.stderr, flush=True)
        
        del self.audio_buffers[stream_id]
        self.active_streams.discard(stream_id)
        
        print(f"🛑 Stopped audio stream: {stream_id}", file=sys.stderr, flush=True)
        return {"success": True}
    
    def add_audio_chunk(self, stream_id: str, audio_data: bytes) -> Dict:
        """Add audio data to a stream"""
        if stream_id not in self.audio_buffers:
            return {"success": False, "error": "Stream not found"}
        
        self.audio_buffers[stream_id].add_audio_data(audio_data)
        return {"success": True}

class AlertMatcher:
    def __init__(self):
        print("🤖 Initializing semantic alert matcher...", file=sys.stderr, flush=True)
        self.model = SentenceTransformer("all-MiniLM-L6-v2")  # 384-dim, fast
        print("✅ Alert matcher initialized successfully", file=sys.stderr, flush=True)
    
    def check_keywords(self, transcript_text, keywords):
        """
        Check for keyword matches using semantic similarity
        """
        try:
            if not transcript_text.strip() or not keywords:
                return []
            
            # Extract enabled keywords with their metadata
            enabled_keywords = [kw for kw in keywords if kw.get('enabled', True)]
            if not enabled_keywords:
                return []
            
            keyword_texts = [kw['keyword'] for kw in enabled_keywords]
            keyword_thresholds = {kw['keyword']: kw['threshold'] for kw in enabled_keywords}
            
            # Pre-encode keywords if not already done
            kw_vecs = self.model.encode(keyword_texts, normalize_embeddings=True)
            
            # Process transcript in chunks with sliding window
            window_size = 30  # words
            overlap = 15  # 50% overlap
            
            tokens = transcript_text.lower().split()
            matches = []
            
            for i in range(0, len(tokens), overlap):
                chunk = " ".join(tokens[i:i+window_size])
                if not chunk.strip():
                    continue
                
                # Encode the chunk
                chunk_vec = self.model.encode(chunk, normalize_embeddings=True)
                
                # Calculate similarities with all keywords
                similarities = util.cos_sim(chunk_vec, kw_vecs)[0]
                
                # Check for matches above threshold
                for j, (keyword, sim_score) in enumerate(zip(keyword_texts, similarities)):
                    threshold = keyword_thresholds[keyword]
                    if sim_score >= threshold:
                        matches.append({
                            'keyword': keyword,
                            'text': chunk,
                            'similarity': float(sim_score),
                            'time': '00:00'  # You can implement time tracking if needed
                        })
                        break  # One alert per chunk to avoid spam
            
            return matches
            
        except Exception as e:
            print(f"❌ Alert matching error: {e}", file=sys.stderr, flush=True)
            return []

class TranscriptionSocketServer:
    def __init__(self, port=9001):
        # Create a lock file to prevent multiple instances
        self.lock_file_path = os.path.join(tempfile.gettempdir(), 'friday_transcription.lock')
        self.lock_file = None
        
        # Create directory for preserved files
        if PRESERVE_TRANSCRIPTION_FILES:
            os.makedirs(PRESERVED_FILES_DIR, exist_ok=True)
            self.log_file_path = os.path.join(PRESERVED_FILES_DIR, 'transcription_log.txt')
            print(f"📂 Transcription files will be preserved in: {PRESERVED_FILES_DIR}", file=sys.stderr, flush=True)
        
        try:
            self.lock_file = open(self.lock_file_path, 'w')
            fcntl.lockf(self.lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.lock_file.write(str(os.getpid()))
            self.lock_file.flush()
            print(f"🔒 Acquired process lock: {self.lock_file_path}", file=sys.stderr, flush=True)
            
            # Register cleanup function
            atexit.register(self.cleanup_lock)
        except (IOError, OSError) as e:
            print(f"❌ Another transcription service is already running (lock file: {self.lock_file_path})", file=sys.stderr, flush=True)
            sys.exit(1)
        
        print("🎤 Initializing Whisper model...", file=sys.stderr, flush=True)
        
        # Initialize Whisper model - using base model for balance of speed and accuracy
        self.model = WhisperModel("small", device="cpu", compute_type="int8")
        
        # Initialize alert matcher
        self.alert_matcher = AlertMatcher()
        
        # Initialize streaming server
        self.streaming_server = StreamingTranscriptionServer()
        
        self.temp_dir = tempfile.mkdtemp()
        self.chunk_counter = 0
        self.port = port
        
        print("✅ Whisper model initialized successfully", file=sys.stderr, flush=True)
        print("🔌 Starting socket server...", file=sys.stderr, flush=True)
        
        # Create socket server with better error handling
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.server.bind(('localhost', self.port))
            self.server.listen(5)
            print(f"Socket server listening on port {self.port}", file=sys.stderr, flush=True)
            print("READY", flush=True)  # Signal to main process that we're ready
        except OSError as e:
            if e.errno == 48:  # Address already in use
                print(f"❌ Port {self.port} is already in use", file=sys.stderr, flush=True)
                sys.exit(1)
            else:
                raise e
        
        # Start processing thread for streaming audio
        self.start_processing_thread()
    
    def start_processing_thread(self):
        """Start background thread for processing streaming audio"""
        def process_streams():
            while self.streaming_server.running:
                for stream_id in list(self.streaming_server.active_streams):
                    if stream_id in self.streaming_server.audio_buffers:
                        buffer = self.streaming_server.audio_buffers[stream_id]
                        chunk = buffer.get_chunk_if_ready()
                        
                        if chunk is not None:
                            # Process chunk for transcription
                            try:
                                segments = self.transcribe_audio_chunk(chunk, buffer.stream_type, buffer.sample_rate)
                                
                                # Process segments through accumulator
                                for segment in segments:
                                    update = buffer.accumulator.add_segment(segment, buffer.stream_type)
                                    if update:
                                        # Broadcast update to clients
                                        self.broadcast_transcript_update(update)
                                
                                # Check for timeout updates
                                timeout_update = buffer.accumulator.check_timeout(buffer.stream_type)
                                if timeout_update:
                                    self.broadcast_transcript_update(timeout_update)
                                    
                            except Exception as e:
                                print(f"❌ Error processing stream chunk: {e}", file=sys.stderr, flush=True)
                
                time.sleep(0.1)  # Small delay to prevent excessive CPU usage
        
        self.processing_thread = threading.Thread(target=process_streams, daemon=True)
        self.processing_thread.start()
        print("🚀 Started streaming processing thread", file=sys.stderr, flush=True)
    
    def transcribe_audio_chunk(self, audio_chunk: np.ndarray, stream_type: str, sample_rate: int) -> List[TranscriptSegment]:
        """Transcribe an audio chunk and return segments"""
        try:
            # Convert numpy array to WAV bytes for Whisper
            wav_buffer = io.BytesIO()
            
            # Create WAV file in memory
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(sample_rate)
                
                # Convert float32 to int16
                audio_int16 = (audio_chunk * 32767).astype(np.int16)
                wav_file.writeframes(audio_int16.tobytes())
            
            # Save to temporary file for Whisper
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_file.write(wav_buffer.getvalue())
                temp_path = temp_file.name
            
            # Transcribe with appropriate settings
            if stream_type == "system":
                segments, info = self.model.transcribe(
                    temp_path,
                    beam_size=1,
                    language="en",
                    condition_on_previous_text=False,
                    temperature=0.0,
                    vad_filter=False
                )
            else:
                segments, info = self.model.transcribe(
                    temp_path,
                    beam_size=1,
                    language="en", 
                    condition_on_previous_text=False,
                    temperature=0.0,
                    vad_filter=True,
                    vad_parameters=dict(
                        min_silence_duration_ms=1000,
                        speech_pad_ms=400,
                        max_speech_duration_s=30
                    )
                )
            
            # Convert to TranscriptSegment objects
            result_segments = []
            for segment in segments:
                if segment.text.strip():
                    result_segments.append(TranscriptSegment(
                        text=segment.text.strip(),
                        start_time=segment.start,
                        end_time=segment.end
                    ))
            
            # Cleanup temp file
            try:
                os.unlink(temp_path)
            except:
                pass
            
            print(f"🗣️ Transcribed {len(result_segments)} segments from {stream_type} chunk", file=sys.stderr, flush=True)
            return result_segments
            
        except Exception as e:
            print(f"❌ Error transcribing audio chunk: {e}", file=sys.stderr, flush=True)
            return []
    
    def broadcast_transcript_update(self, update: Dict):
        """Broadcast transcript update to all connected clients"""
        # This would be implemented to send updates to connected clients
        # For now, just log the update
        print(f"📡 Broadcasting transcript update: {update}", file=sys.stderr, flush=True)
        
        # TODO: Implement client connection management to broadcast to all clients
        # This would require storing client connections and broadcasting updates
    
    def run(self):
        """Main server loop"""
        try:
            while True:
                # Accept client connections
                conn, addr = self.server.accept()
                
                # Handle each client in a separate thread for concurrent processing
                client_thread = threading.Thread(
                    target=self.handle_client,
                    args=(conn, addr)
                )
                client_thread.daemon = True
                client_thread.start()
                
        except KeyboardInterrupt:
            print("\n🛑 Server shutting down...", file=sys.stderr, flush=True)
        finally:
            # Stop streaming server
            if hasattr(self, 'streaming_server'):
                self.streaming_server.running = False
                if self.processing_thread:
                    self.processing_thread.join(timeout=2)
            
            self.server.close()
            self.cleanup_lock()
    
    def cleanup_lock(self):
        """Clean up the lock file on exit"""
        try:
            if self.lock_file:
                self.lock_file.close()
                os.unlink(self.lock_file_path)
                print(f"🧹 Cleaned up lock file: {self.lock_file_path}", file=sys.stderr, flush=True)
        except:
            pass
    
    def check_alerts(self, transcript_text, keywords):
        """
        Check for alert keywords in transcript text
        """
        try:
            matches = self.alert_matcher.check_keywords(transcript_text, keywords)
            return {
                "success": True,
                "matches": matches
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def convert_audio_to_wav(self, input_path):
        """Convert any audio format to WAV using PyAV"""
        try:
            # Create output path
            output_path = input_path.rsplit('.', 1)[0] + '_converted.wav'
            
            # Open input file
            input_container = av.open(input_path)
            
            # Check if we have audio streams
            audio_streams = [s for s in input_container.streams if s.type == 'audio']
            if not audio_streams:
                print(f"No audio stream found in {input_path}", file=sys.stderr, flush=True)
                input_container.close()
                return input_path
            
            audio_stream = audio_streams[0]
            
            # Open output file
            output_container = av.open(output_path, 'w')
            
            # Add output stream
            output_stream = output_container.add_stream('pcm_s16le', rate=16000)
            output_stream.layout = 'mono'
            
            # Create resampler
            resampler = av.AudioResampler(
                format='s16',
                layout='mono',
                rate=16000
            )
            
            # Process frames
            for frame in input_container.decode(audio_stream):
                # Resample frame
                resampled_frames = resampler.resample(frame)
                
                for resampled_frame in resampled_frames:
                    for packet in output_stream.encode(resampled_frame):
                        output_container.mux(packet)
            
            # Flush encoder
            for packet in output_stream.encode():
                output_container.mux(packet)
            
            input_container.close()
            output_container.close()
            
            return output_path
            
        except Exception as e:
            print(f"❌ Audio conversion error: {e}", file=sys.stderr, flush=True)
            # If conversion fails, try to use the original file
            return input_path
    
    def analyze_audio_content(self, audio_path: str, stream_type: str) -> dict:
        """Analyze audio content to understand what's in the file"""
        analysis = {
            "has_audio": False,
            "duration": 0,
            "sample_rate": 0,
            "channels": 0,
            "max_amplitude": 0,
            "rms_level": 0,
            "silence_percentage": 100,
            "audio_format": "unknown",
            "error": None
        }
        
        try:
            import av
            container = av.open(audio_path)
            audio_streams = [s for s in container.streams if s.type == 'audio']
            
            if not audio_streams:
                analysis["error"] = "No audio streams found"
                container.close()
                return analysis
            
            audio_stream = audio_streams[0]
            analysis["has_audio"] = True
            analysis["duration"] = float(audio_stream.duration * audio_stream.time_base) if audio_stream.duration else 0
            analysis["sample_rate"] = audio_stream.sample_rate
            analysis["channels"] = audio_stream.channels
            analysis["audio_format"] = audio_stream.codec.name
            
            # Analyze audio content by reading samples
            frames_analyzed = 0
            total_samples = 0
            sum_squares = 0
            max_amplitude = 0
            silent_samples = 0
            
            # Read up to 5 seconds of audio for analysis
            max_frames = int(5 * audio_stream.sample_rate) if audio_stream.sample_rate else 80000
            
            for frame in container.decode(audio_stream):
                if frames_analyzed >= max_frames:
                    break
                    
                # Convert frame to numpy array for analysis
                audio_array = frame.to_ndarray()
                if len(audio_array.shape) > 1:
                    # Multi-channel: take mean across channels
                    audio_array = audio_array.mean(axis=0)
                
                # Calculate statistics
                frame_samples = len(audio_array)
                total_samples += frame_samples
                frames_analyzed += frame_samples
                
                # Calculate RMS and max amplitude
                abs_samples = abs(audio_array)
                max_amplitude = max(max_amplitude, abs_samples.max() if len(abs_samples) > 0 else 0)
                sum_squares += (audio_array ** 2).sum()
                
                # Count silent samples (below threshold)
                silence_threshold = 0.001  # 0.1% of max amplitude for better sensitivity
                silent_samples += (abs_samples < silence_threshold).sum()
            
            container.close()
            
            if total_samples > 0:
                analysis["max_amplitude"] = float(max_amplitude)
                analysis["rms_level"] = float((sum_squares / total_samples) ** 0.5)
                analysis["silence_percentage"] = float((silent_samples / total_samples) * 100)
            
            print(f"🔍 AUDIO ANALYSIS ({stream_type}): {os.path.basename(audio_path)}", file=sys.stderr, flush=True)
            print(f"   Duration: {analysis['duration']:.2f}s, Sample Rate: {analysis['sample_rate']}Hz, Channels: {analysis['channels']}", file=sys.stderr, flush=True)
            print(f"   Format: {analysis['audio_format']}, Max Amplitude: {analysis['max_amplitude']:.4f}", file=sys.stderr, flush=True)
            print(f"   RMS Level: {analysis['rms_level']:.4f}, Silence: {analysis['silence_percentage']:.1f}%", file=sys.stderr, flush=True)
            
        except Exception as e:
            analysis["error"] = str(e)
            print(f"❌ AUDIO ANALYSIS ERROR ({stream_type}): {e}", file=sys.stderr, flush=True)
        
        return analysis
    
    def transcribe_chunk(self, audio_path, stream_type="microphone", conn=None):
        """Transcribe a single audio chunk quickly with stream identification"""
        try:
            if stream_type == 'system':
                print(f"🔍 SYSTEM_AUDIO_DEBUG: Processing system audio chunk: {audio_path}", file=sys.stderr, flush=True)
            else:
                print(f"🔍 DEBUG: Processing {stream_type} chunk: {audio_path}", file=sys.stderr, flush=True)
            
            # Check if file exists and get size with retry for timing issues
            file_exists = False
            file_size = 0
            max_retries = 3
            retry_delay = 0.1  # 100ms delay
            
            for attempt in range(max_retries):
                if os.path.exists(audio_path):
                    try:
                        file_size = os.path.getsize(audio_path)
                        if file_size > 0:  # Make sure file is not empty
                            file_exists = True
                            break
                    except (OSError, IOError) as e:
                        print(f"⚠️ DEBUG: File access attempt {attempt + 1} failed: {e}", file=sys.stderr, flush=True)
                
                if attempt < max_retries - 1:  # Don't sleep on last attempt
                    print(f"⏳ DEBUG: File not ready, waiting {retry_delay}s (attempt {attempt + 1}/{max_retries})", file=sys.stderr, flush=True)
                    import time
                    time.sleep(retry_delay)
            
            if not file_exists:
                print(f"❌ DEBUG: Audio file does not exist after {max_retries} attempts: {audio_path}", file=sys.stderr, flush=True)
                return {
                    "type": "error",
                    "message": f"Audio file does not exist: {audio_path}",
                    "stream_type": stream_type,
                    "chunk_id": self.chunk_counter
                }
            
            print(f"📏 DEBUG: File size: {file_size} bytes (ready after retry)", file=sys.stderr, flush=True)
            
            # Convert audio to WAV format if needed
            original_path = audio_path
            converted_file_created = False
            if not audio_path.endswith('.wav'):
                print(f"🔄 DEBUG: Converting {stream_type} audio to WAV format", file=sys.stderr, flush=True)
                audio_path = self.convert_audio_to_wav(audio_path)
                converted_file_created = (audio_path != original_path)
                converted_size = os.path.getsize(audio_path) if os.path.exists(audio_path) else 0
                print(f"📏 DEBUG: Converted file size: {converted_size} bytes", file=sys.stderr, flush=True)
            
            # Perform detailed audio analysis
            audio_analysis = self.analyze_audio_content(audio_path, stream_type)
            
            # Check for basic audio validity
            if audio_analysis.get("error"):
                print(f"❌ DEBUG: Audio analysis failed: {audio_analysis['error']}", file=sys.stderr, flush=True)
                
                # Preserve files with analysis errors for debugging
                if PRESERVE_TRANSCRIPTION_FILES:
                    preserved_path = self.preserve_transcription_file(audio_path, stream_type)
                    self.log_transcription_file(audio_path, stream_type, f"ANALYSIS_ERROR: {audio_analysis['error']}", preserved_path, audio_analysis)
                
                return {
                    "type": "transcript",
                    "text": "",
                    "stream_type": stream_type,
                    "language": "en",
                    "language_probability": 1.0,
                    "duration": 0,
                    "chunk_id": self.chunk_counter
                }
            
            # Check if audio has sufficient duration
            duration = audio_analysis.get("duration", 0)
            if duration < 0.05:  # Less than 50ms
                print(f"⚠️ DEBUG: Audio duration too short: {duration:.2f}s", file=sys.stderr, flush=True)
                
                # Preserve short duration files for debugging
                if PRESERVE_TRANSCRIPTION_FILES:
                    preserved_path = self.preserve_transcription_file(audio_path, stream_type)
                    self.log_transcription_file(audio_path, stream_type, f"SHORT_DURATION: {duration:.2f}s", preserved_path, audio_analysis)
                
                return {
                    "type": "transcript",
                    "text": "",
                    "stream_type": stream_type,
                    "language": "en",
                    "language_probability": 1.0,
                    "duration": duration,
                    "chunk_id": self.chunk_counter
                }
            
            # Check if audio is mostly silence
            silence_percentage = audio_analysis.get("silence_percentage", 100)
            max_amplitude = audio_analysis.get("max_amplitude", 0)
            rms_level = audio_analysis.get("rms_level", 0)
            
            # Skip transcription if audio is too quiet or mostly silent
            # Relaxed thresholds for better live transcription sensitivity
            if silence_percentage > 99.5 or max_amplitude < 0.5 or rms_level < 0.05:
                print(f"⚠️ DEBUG: Audio too quiet/silent - Silence: {silence_percentage:.1f}%, Max: {max_amplitude:.4f}, RMS: {rms_level:.4f}", file=sys.stderr, flush=True)
                
                # Preserve silent files for debugging
                if PRESERVE_TRANSCRIPTION_FILES:
                    preserved_path = self.preserve_transcription_file(audio_path, stream_type)
                    self.log_transcription_file(audio_path, stream_type, f"MOSTLY_SILENT: {silence_percentage:.1f}%_silence", preserved_path, audio_analysis)
                
                return {
                    "type": "transcript",
                    "text": "",
                    "stream_type": stream_type,
                    "language": "en",
                    "language_probability": 1.0,
                    "duration": duration,
                    "chunk_id": self.chunk_counter
                }
            
            print(f"🎤 DEBUG: Starting Whisper transcription for {stream_type} audio", file=sys.stderr, flush=True)
            
            # Log which VAD settings are being used
            if stream_type == "system":
                print(f"⚙️ DEBUG: Using NO VAD for system audio (based on diagnostic findings)", file=sys.stderr, flush=True)
            else:
                print(f"⚙️ DEBUG: Using LESS AGGRESSIVE VAD for microphone audio (1000ms silence threshold)", file=sys.stderr, flush=True)
            
            # Fast transcription settings for near-live processing
            # Based on diagnostic testing, VAD is too aggressive and filters out valid speech
            # Different settings for system vs microphone audio
            if stream_type == "system":
                print(f"🎵 SYSTEM_AUDIO_DEBUG: Starting Whisper transcription for system audio (NO VAD)", file=sys.stderr, flush=True)
                # System audio often has different characteristics, disable VAD
                segments, info = self.model.transcribe(
                    audio_path,
                    beam_size=1,  # Faster beam search
                    language="en",
                    condition_on_previous_text=False,
                    temperature=0.0,
                    vad_filter=False  # Disable VAD for system audio
                )
            else:
                # For microphone audio, use less aggressive VAD
                segments, info = self.model.transcribe(
                    audio_path,
                    beam_size=1,  # Faster beam search
                    language="en",
                    condition_on_previous_text=False,
                    temperature=0.0,
                    vad_filter=True,
                    vad_parameters=dict(
                        min_silence_duration_ms=1000,  # Less aggressive (was 300ms)
                        speech_pad_ms=400,             # More padding around speech
                        max_speech_duration_s=30       # Allow longer speech segments
                    )
                )
            
            if stream_type == "system":
                print(f"📊 SYSTEM_AUDIO_DEBUG: Whisper info - Duration: {info.duration:.2f}s, Language: {info.language} ({info.language_probability:.2f})", file=sys.stderr, flush=True)
            else:
                print(f"📊 DEBUG: Whisper info - Duration: {info.duration:.2f}s, Language: {info.language} ({info.language_probability:.2f})", file=sys.stderr, flush=True)
            
            # Collect all segments quickly
            transcription = ""
            segment_count = 0
            for segment in segments:
                transcription += segment.text + " "
                segment_count += 1
                if stream_type == "system":
                    print(f"🗣️ SYSTEM_AUDIO_DEBUG: Segment {segment_count}: '{segment.text}' (start: {segment.start:.2f}s, end: {segment.end:.2f}s)", file=sys.stderr, flush=True)
                else:
                    print(f"🗣️ DEBUG: Segment {segment_count}: '{segment.text}' (start: {segment.start:.2f}s, end: {segment.end:.2f}s)", file=sys.stderr, flush=True)
                
                # Send live text updates via socket connection if available
                live_update = {
                    "type": "live_text",
                    "text": transcription.strip(),
                    "stream_type": stream_type,
                    "chunk_id": self.chunk_counter
                }
                
                if conn:
                    try:
                        response = json.dumps(live_update) + "\n"
                        conn.send(response.encode())
                        print(f"📡 TRANSCRIPTION: LIVE SENT: {live_update}", file=sys.stderr, flush=True)
                    except Exception as e:
                        print(f"❌ TRANSCRIPTION: Failed to send live update: {e}", file=sys.stderr, flush=True)
                else:
                    # Log live update if no connection (for debugging)
                    print(f"📡 TRANSCRIPTION: Live text update (no conn): {live_update}", file=sys.stderr, flush=True)
            
            final_text = transcription.strip()
            if stream_type == "system":
                print(f"✅ TRANSCRIPTION: Final system audio transcription: '{final_text}' (length: {len(final_text)})", file=sys.stderr, flush=True)
            else:
                print(f"✅ TRANSCRIPTION: Final {stream_type} transcription: '{final_text}' (length: {len(final_text)})", file=sys.stderr, flush=True)
            
            # Preserve and log the transcription file before cleanup
            # Use the converted file if it was created, otherwise use the original
            file_to_preserve = audio_path if converted_file_created else original_path
            preserved_path = self.preserve_transcription_file(file_to_preserve, stream_type)
            self.log_transcription_file(file_to_preserve, stream_type, final_text, preserved_path, audio_analysis)
            
            return {
                "type": "transcript",
                "text": final_text,
                "stream_type": stream_type,  # Added stream identification
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "chunk_id": self.chunk_counter
            }
            
        except Exception as e:
            print(f"❌ DEBUG: Transcription error for {stream_type}: {e}", file=sys.stderr, flush=True)
            
            # Still preserve the file even if transcription failed for debugging
            if PRESERVE_TRANSCRIPTION_FILES:
                # Try to preserve the converted file if it exists, otherwise the original
                file_to_preserve = audio_path if os.path.exists(audio_path) else original_path
                if os.path.exists(file_to_preserve):
                    # Try to get some basic audio analysis even on error
                    try:
                        error_analysis = self.analyze_audio_content(file_to_preserve, stream_type)
                    except:
                        error_analysis = None
                    preserved_path = self.preserve_transcription_file(file_to_preserve, stream_type)
                    self.log_transcription_file(file_to_preserve, stream_type, f"ERROR: {str(e)}", preserved_path, error_analysis)
            
            return {
                "type": "error",
                "message": str(e),
                "stream_type": stream_type,  # Added stream identification
                "chunk_id": self.chunk_counter
            }
        finally:
            # Clean up files - but only if preservation is disabled
            if not PRESERVE_TRANSCRIPTION_FILES:
                try:
                    # Clean up both original and converted files
                    if os.path.exists(original_path):
                        os.remove(original_path)
                        print(f"🗑️ Cleaned up original file: {os.path.basename(original_path)}", file=sys.stderr, flush=True)
                    if converted_file_created and os.path.exists(audio_path):
                        os.remove(audio_path)
                        print(f"🗑️ Cleaned up converted file: {os.path.basename(audio_path)}", file=sys.stderr, flush=True)
                except Exception as cleanup_error:
                    print(f"⚠️ Error during file cleanup: {cleanup_error}", file=sys.stderr, flush=True)
            else:
                # When preserving, clean up the file we didn't preserve
                try:
                    if converted_file_created:
                        # We preserved the converted file, so clean up the original
                        if os.path.exists(original_path):
                            os.remove(original_path)
                            print(f"🗑️ Cleaned up original file (preserved converted): {os.path.basename(original_path)}", file=sys.stderr, flush=True)
                    else:
                        # We preserved the original file, check if there's a converted file to clean up
                        converted_path = original_path.rsplit('.', 1)[0] + '_converted.wav'
                        if os.path.exists(converted_path):
                            os.remove(converted_path)
                            print(f"🗑️ Cleaned up converted file (preserved original): {os.path.basename(converted_path)}", file=sys.stderr, flush=True)
                except Exception as cleanup_error:
                    print(f"⚠️ Error during selective file cleanup: {cleanup_error}", file=sys.stderr, flush=True)
    
    def log_transcription_file(self, audio_path: str, stream_type: str, transcript: str, preserved_path: str = None, audio_analysis: dict = None):
        """Log transcription file details to a log file"""
        if not PRESERVE_TRANSCRIPTION_FILES:
            return
            
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = {
            "timestamp": timestamp,
            "original_path": audio_path,
            "preserved_path": preserved_path,
            "stream_type": stream_type,
            "transcript": transcript,
            "file_size": os.path.getsize(audio_path) if os.path.exists(audio_path) else 0,
            "chunk_id": self.chunk_counter
        }
        
        # Add audio analysis data if available
        if audio_analysis:
            log_entry["audio_analysis"] = {
                "duration": audio_analysis.get("duration", 0),
                "sample_rate": audio_analysis.get("sample_rate", 0),
                "channels": audio_analysis.get("channels", 0),
                "max_amplitude": audio_analysis.get("max_amplitude", 0),
                "rms_level": audio_analysis.get("rms_level", 0),
                "silence_percentage": audio_analysis.get("silence_percentage", 100),
                "audio_format": audio_analysis.get("audio_format", "unknown"),
                "has_audio": audio_analysis.get("has_audio", False)
            }
        
        try:
            with open(self.log_file_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
            print(f"📝 Logged transcription file: {os.path.basename(audio_path)}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"❌ Error logging transcription file: {e}", file=sys.stderr, flush=True)
    
    def preserve_transcription_file(self, audio_path: str, stream_type: str) -> str:
        """Copy transcription file to preserved directory"""
        if not PRESERVE_TRANSCRIPTION_FILES or not os.path.exists(audio_path):
            return None
            
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = os.path.basename(audio_path)
            name, ext = os.path.splitext(filename)
            
            # Create a more descriptive filename
            preserved_filename = f"{timestamp}_{stream_type}_{name}_{self.chunk_counter}{ext}"
            preserved_path = os.path.join(PRESERVED_FILES_DIR, preserved_filename)
            
            # Copy the file
            shutil.copy2(audio_path, preserved_path)
            print(f"💾 Preserved transcription file: {preserved_filename}", file=sys.stderr, flush=True)
            
            return preserved_path
        except Exception as e:
            print(f"❌ Error preserving transcription file: {e}", file=sys.stderr, flush=True)
            return None
    
    def handle_client(self, conn, addr):
        """Handle client connection for audio processing and alert checking"""
        print(f"📞 TRANSCRIPTION: Client connected from {addr}", file=sys.stderr, flush=True)
        
        # Store client connection for broadcasting updates
        client_streams = set()  # Track streams for this client
        
        try:
            while True:
                # Receive data
                data = conn.recv(8192)  # Increased buffer size for dual stream data
                if not data:
                    break
                
                try:
                    # Try to parse as JSON for alert requests or dual stream processing
                    request = json.loads(data.decode().strip())
                    
                    if request.get('type') == 'check_alerts':
                        # Handle alert checking request
                        transcript_text = request.get('transcript', '')
                        keywords = request.get('keywords', [])
                        
                        result = self.check_alerts(transcript_text, keywords)
                        response = json.dumps(result) + "\n"
                        conn.send(response.encode())
                        continue
                    
                    elif request.get('type') == 'start_stream':
                        # Start a new streaming audio session
                        stream_id = request.get('stream_id', f"stream_{time.time()}")
                        stream_type = request.get('stream_type', 'microphone')
                        
                        result = self.streaming_server.start_stream(stream_id, stream_type)
                        client_streams.add(stream_id)
                        
                        response = json.dumps(result) + "\n"
                        conn.send(response.encode())
                        print(f"🎬 Started stream {stream_id} for client {addr}", file=sys.stderr, flush=True)
                        continue
                    
                    elif request.get('type') == 'stop_stream':
                        # Stop a streaming audio session
                        stream_id = request.get('stream_id')
                        
                        if stream_id:
                            result = self.streaming_server.stop_stream(stream_id)
                            client_streams.discard(stream_id)
                            
                            response = json.dumps(result) + "\n"
                            conn.send(response.encode())
                            print(f"🛑 Stopped stream {stream_id} for client {addr}", file=sys.stderr, flush=True)
                        continue
                    
                    elif request.get('type') == 'stream_chunk':
                        # Handle streaming audio chunk (raw audio data)
                        stream_id = request.get('stream_id')
                        audio_data = request.get('audio_data')  # Base64 encoded audio
                        
                        if stream_id and audio_data:
                            import base64
                            try:
                                # Decode base64 audio data
                                decoded_audio = base64.b64decode(audio_data)
                                result = self.streaming_server.add_audio_chunk(stream_id, decoded_audio)
                                
                                response = json.dumps(result) + "\n"
                                conn.send(response.encode())
                            except Exception as e:
                                error_response = json.dumps({"success": False, "error": str(e)}) + "\n"
                                conn.send(error_response.encode())
                        continue
                    
                    elif request.get('type') == 'dual_stream_chunk':
                        # Handle dual stream audio chunk with metadata (legacy file-based)
                        audio_path = request.get('audio_path', '')
                        stream_type = request.get('stream_type', 'microphone')  # 'microphone' or 'system'
                        
                        if not audio_path:
                            continue
                        
                        if stream_type == 'system':
                            print(f"🔄 SYSTEM_AUDIO_DEBUG: Processing system audio: {os.path.basename(audio_path)}", file=sys.stderr, flush=True)
                            print(f"🔄 SYSTEM_AUDIO_DEBUG: File exists: {os.path.exists(audio_path)}, Size: {os.path.getsize(audio_path) if os.path.exists(audio_path) else 0} bytes", file=sys.stderr, flush=True)
                        else:
                            print(f"🔄 Processing {stream_type} audio: {os.path.basename(audio_path)}", file=sys.stderr, flush=True)
                        
                        self.chunk_counter += 1
                        
                        # Process the audio chunk with stream identification
                        result = self.transcribe_chunk(audio_path, stream_type, conn)
                        
                        if stream_type == 'system':
                            print(f"🎵 SYSTEM_AUDIO_DEBUG: Transcription result for system audio:", file=sys.stderr, flush=True)
                            print(f"   Type: {result.get('type', 'unknown')}", file=sys.stderr, flush=True)
                            print(f"   Text length: {len(result.get('text', ''))}", file=sys.stderr, flush=True)
                            print(f"   Text preview: {result.get('text', '')[:100]}...", file=sys.stderr, flush=True)
                            print(f"   Stream type: {result.get('stream_type', 'unknown')}", file=sys.stderr, flush=True)
                        
                        # Send result back to client
                        response = json.dumps(result) + "\n"
                        conn.send(response.encode())
                        
                        if stream_type == 'system':
                            print(f"📤 SYSTEM_AUDIO_DEBUG: Sent system audio result: {result.get('type', 'unknown')}", file=sys.stderr, flush=True)
                        else:
                            print(f"📤 Sent {stream_type}: {result.get('type', 'unknown')}", file=sys.stderr, flush=True)
                        continue
                        
                except json.JSONDecodeError:
                    # Not JSON, treat as audio file path (legacy behavior)
                    audio_path = data.decode().strip()
                    if not audio_path:
                        continue
                    
                    # Detect stream type from filename if possible
                    stream_type = "microphone"  # default
                    if "_system" in audio_path.lower() or "system_audio" in audio_path.lower():
                        stream_type = "system"
                    elif "_mic" in audio_path.lower() or "microphone" in audio_path.lower():
                        stream_type = "microphone"
                    
                    print(f"🔄 Processing {stream_type}: {os.path.basename(audio_path)}", file=sys.stderr, flush=True)
                    
                    self.chunk_counter += 1
                    
                    # Process the audio chunk
                    result = self.transcribe_chunk(audio_path, stream_type, conn)
                    
                    # Send result back to client
                    response = json.dumps(result) + "\n"
                    conn.send(response.encode())
                    
                    print(f"📤 Sent {stream_type}: {result.get('type', 'unknown')}", file=sys.stderr, flush=True)
                
        except Exception as e:
            print(f"❌ Client error: {e}", file=sys.stderr, flush=True)
        finally:
            # Clean up client streams when connection closes
            for stream_id in client_streams:
                try:
                    self.streaming_server.stop_stream(stream_id)
                    print(f"🧹 Cleaned up stream {stream_id} for disconnected client {addr}", file=sys.stderr, flush=True)
                except:
                    pass
            
            conn.close()
            print(f"📞 Client {addr} disconnected", file=sys.stderr, flush=True)
    
if __name__ == "__main__":
    # Use port 9001 to avoid conflicts
    server = TranscriptionSocketServer(port=9001)
    server.run() 