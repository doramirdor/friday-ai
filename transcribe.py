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
from faster_whisper import WhisperModel

class TranscriptionSocketServer:
    def __init__(self, port=9001):
        # Create a lock file to prevent multiple instances
        self.lock_file_path = os.path.join(tempfile.gettempdir(), 'friday_transcription.lock')
        self.lock_file = None
        
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
        self.model = WhisperModel("base", device="cpu", compute_type="int8")
        
        self.temp_dir = tempfile.mkdtemp()
        self.chunk_counter = 0
        self.port = port
        
        print("✅ Whisper model initialized successfully", file=sys.stderr, flush=True)
        print("🔌 Starting socket server...", file=sys.stderr, flush=True)
        
        # Create socket server with better error handling
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.server.bind(("localhost", port))
            self.server.listen(1)
            print(f"🎧 Socket server listening on port {port}", file=sys.stderr, flush=True)
            print("READY", flush=True)  # Signal to Electron that we're ready
        except OSError as e:
            if e.errno == 48:  # Address already in use
                print(f"❌ Port {port} is already in use. Trying to find an available port...", file=sys.stderr, flush=True)
                # Try to find an available port
                for attempt_port in range(port + 1, port + 10):
                    try:
                        self.server.bind(("localhost", attempt_port))
                        self.server.listen(1)
                        self.port = attempt_port
                        print(f"🎧 Socket server listening on port {attempt_port}", file=sys.stderr, flush=True)
                        print("READY", flush=True)
                        return
                    except OSError:
                        continue
                
                # If we can't find any port, raise the original error
                raise OSError(f"Could not bind to any port from {port} to {port + 9}")
            else:
                raise e
    
    def cleanup_lock(self):
        """Clean up the lock file"""
        try:
            if self.lock_file:
                self.lock_file.close()
            if os.path.exists(self.lock_file_path):
                os.remove(self.lock_file_path)
                print(f"🔓 Released process lock: {self.lock_file_path}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"⚠️ Warning: Could not cleanup lock file: {e}", file=sys.stderr, flush=True)
    
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
    
    def transcribe_chunk(self, audio_path):
        """Transcribe a single audio chunk quickly"""
        try:
            # Convert audio to WAV format if needed
            if not audio_path.endswith('.wav'):
                audio_path = self.convert_audio_to_wav(audio_path)
            
            # Fast transcription settings for near-live processing
            segments, info = self.model.transcribe(
                audio_path,
                beam_size=1,  # Faster beam search
                language="en",
                condition_on_previous_text=False,
                temperature=0.0,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=300)
            )
            
            # Collect all segments quickly
            transcription = ""
            for segment in segments:
                transcription += segment.text + " "
            
            return {
                "type": "transcript",
                "text": transcription.strip(),
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "chunk_id": self.chunk_counter
            }
            
        except Exception as e:
            return {
                "type": "error",
                "message": str(e),
                "chunk_id": self.chunk_counter
            }
        finally:
            # Clean up files
            try:
                if os.path.exists(audio_path):
                    os.remove(audio_path)
                converted_path = audio_path.rsplit('.', 1)[0] + '_converted.wav'
                if os.path.exists(converted_path):
                    os.remove(converted_path)
            except:
                pass
    
    def handle_client(self, conn, addr):
        """Handle client connection for audio processing"""
        print(f"📞 Client connected from {addr}", file=sys.stderr, flush=True)
        
        try:
            while True:
                # Receive audio file path
                data = conn.recv(1024)
                if not data:
                    break
                
                audio_path = data.decode().strip()
                if not audio_path:
                    continue
                
                print(f"🔄 Processing: {os.path.basename(audio_path)}", file=sys.stderr, flush=True)
                
                self.chunk_counter += 1
                
                # Process the audio chunk
                result = self.transcribe_chunk(audio_path)
                
                # Send result back to client
                response = json.dumps(result) + "\n"
                conn.send(response.encode())
                
                print(f"📤 Sent: {result.get('type', 'unknown')}", file=sys.stderr, flush=True)
                
        except Exception as e:
            print(f"❌ Client error: {e}", file=sys.stderr, flush=True)
        finally:
            conn.close()
            print(f"📞 Client {addr} disconnected", file=sys.stderr, flush=True)
    
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
            self.server.close()
            self.cleanup_lock()

if __name__ == "__main__":
    # Use port 9001 to avoid conflicts
    server = TranscriptionSocketServer(port=9001)
    server.run() 