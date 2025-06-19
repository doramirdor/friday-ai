#!/usr/bin/env python3
"""
Test script for the enhanced streaming transcription service.
Demonstrates how to use the new chunking and streaming capabilities.
"""

import socket
import json
import time
import base64
import numpy as np
import threading
import wave
import io

class StreamingTranscriptionClient:
    """Client for testing streaming transcription capabilities"""
    
    def __init__(self, host='localhost', port=9001):
        self.host = host
        self.port = port
        self.socket = None
        self.connected = False
        
    def connect(self):
        """Connect to the transcription server"""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((self.host, self.port))
            self.connected = True
            print(f"✅ Connected to transcription server at {self.host}:{self.port}")
            return True
        except Exception as e:
            print(f"❌ Failed to connect: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from the server"""
        if self.socket:
            self.socket.close()
            self.connected = False
            print("🔌 Disconnected from server")
    
    def start_stream(self, stream_id: str, stream_type: str = 'microphone'):
        """Start a new audio stream"""
        if not self.connected:
            return False
            
        request = {
            'type': 'start_stream',
            'stream_id': stream_id,
            'stream_type': stream_type
        }
        
        try:
            self.socket.send(json.dumps(request).encode() + b'\n')
            response = self.socket.recv(4096).decode().strip()
            result = json.loads(response)
            
            if result.get('success'):
                print(f"🎬 Started stream: {stream_id} ({stream_type})")
                return True
            else:
                print(f"❌ Failed to start stream: {result.get('error')}")
                return False
                
        except Exception as e:
            print(f"❌ Error starting stream: {e}")
            return False
    
    def stop_stream(self, stream_id: str):
        """Stop an audio stream"""
        if not self.connected:
            return False
            
        request = {
            'type': 'stop_stream',
            'stream_id': stream_id
        }
        
        try:
            self.socket.send(json.dumps(request).encode() + b'\n')
            response = self.socket.recv(4096).decode().strip()
            result = json.loads(response)
            
            if result.get('success'):
                print(f"🛑 Stopped stream: {stream_id}")
                return True
            else:
                print(f"❌ Failed to stop stream: {result.get('error')}")
                return False
                
        except Exception as e:
            print(f"❌ Error stopping stream: {e}")
            return False
    
    def send_audio_chunk(self, stream_id: str, audio_data: bytes):
        """Send audio data to a stream"""
        if not self.connected:
            return False
            
        # Encode audio data as base64
        audio_b64 = base64.b64encode(audio_data).decode('utf-8')
        
        request = {
            'type': 'stream_chunk',
            'stream_id': stream_id,
            'audio_data': audio_b64
        }
        
        try:
            self.socket.send(json.dumps(request).encode() + b'\n')
            response = self.socket.recv(4096).decode().strip()
            result = json.loads(response)
            
            if result.get('success'):
                print(f"📤 Sent audio chunk to stream: {stream_id}")
                return True
            else:
                print(f"❌ Failed to send audio chunk: {result.get('error')}")
                return False
                
        except Exception as e:
            print(f"❌ Error sending audio chunk: {e}")
            return False

def generate_test_audio(duration_seconds: float, sample_rate: int = 16000, frequency: float = 440.0):
    """Generate test audio (sine wave) for testing"""
    num_samples = int(duration_seconds * sample_rate)
    t = np.linspace(0, duration_seconds, num_samples, False)
    
    # Generate sine wave
    audio = np.sin(2 * np.pi * frequency * t).astype(np.float32)
    
    # Add some noise to make it more realistic
    noise = np.random.normal(0, 0.1, audio.shape).astype(np.float32)
    audio = audio + noise
    
    # Normalize
    audio = audio / np.max(np.abs(audio))
    
    return audio.tobytes()

def test_streaming_transcription():
    """Test the streaming transcription functionality"""
    print("🚀 Testing Streaming Transcription Service")
    print("=" * 50)
    
    # Create client
    client = StreamingTranscriptionClient()
    
    # Connect to server
    if not client.connect():
        print("❌ Cannot connect to server. Make sure transcribe.py is running.")
        return
    
    try:
        # Test 1: Start a microphone stream
        stream_id = "test_mic_stream"
        if client.start_stream(stream_id, "microphone"):
            
            # Send some test audio chunks
            print("📤 Sending test audio chunks...")
            for i in range(5):
                # Generate 2 seconds of test audio
                audio_data = generate_test_audio(2.0, frequency=440.0 + i*100)
                
                if client.send_audio_chunk(stream_id, audio_data):
                    print(f"   Chunk {i+1}/5 sent successfully")
                    time.sleep(1)  # Wait between chunks
                else:
                    print(f"   Failed to send chunk {i+1}")
                    break
            
            # Stop the stream
            client.stop_stream(stream_id)
        
        # Test 2: Start a system audio stream
        print("\n🎵 Testing system audio stream...")
        system_stream_id = "test_system_stream"
        if client.start_stream(system_stream_id, "system"):
            
            # Send some test audio chunks
            for i in range(3):
                # Generate 3 seconds of test audio
                audio_data = generate_test_audio(3.0, frequency=220.0 + i*50)
                
                if client.send_audio_chunk(system_stream_id, audio_data):
                    print(f"   System chunk {i+1}/3 sent successfully")
                    time.sleep(1.5)
                else:
                    print(f"   Failed to send system chunk {i+1}")
                    break
            
            # Stop the stream
            client.stop_stream(system_stream_id)
        
        print("\n✅ Streaming test completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
    
    finally:
        # Disconnect
        client.disconnect()

def test_legacy_dual_stream():
    """Test the legacy dual stream functionality"""
    print("\n🔄 Testing Legacy Dual Stream Functionality")
    print("=" * 50)
    
    # This would test the existing dual_stream_chunk functionality
    # that works with file paths (as currently implemented)
    
    client = StreamingTranscriptionClient()
    
    if client.connect():
        try:
            # Test legacy dual stream chunk
            request = {
                'type': 'dual_stream_chunk',
                'audio_path': '/tmp/test_audio.wav',  # This would be a real file
                'stream_type': 'microphone'
            }
            
            print("📤 Testing legacy dual stream format...")
            client.socket.send(json.dumps(request).encode() + b'\n')
            
            # Note: This won't work without a real audio file
            print("⚠️  Legacy test requires actual audio file")
            
        except Exception as e:
            print(f"❌ Legacy test error: {e}")
        
        finally:
            client.disconnect()

if __name__ == "__main__":
    print("🎤 Friday Transcription Service - Streaming Test")
    print("================================================")
    print()
    
    # Test streaming functionality
    test_streaming_transcription()
    
    # Test legacy functionality
    test_legacy_dual_stream()
    
    print("\n🏁 All tests completed!") 