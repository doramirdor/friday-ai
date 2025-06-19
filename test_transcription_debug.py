#!/usr/bin/env python3
import socket
import json
import time

def test_transcription():
    # Wait for transcription service to be ready
    time.sleep(3)
    
    try:
        # Connect to transcription service
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect(('localhost', 9001))
        
        # Send a system audio chunk for transcription
        request = {
            'type': 'dual_stream_chunk',
            'audio_path': '/tmp/friday-test2/system_audio_chunk_1750183957.2808518.wav',
            'stream_type': 'system'
        }
        
        print(f"Sending request: {request}")
        sock.send(json.dumps(request).encode() + b'\n')
        
        # Receive response
        data = sock.recv(8192)
        response = json.loads(data.decode().strip())
        
        print(f"Response: {response}")
        sock.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_transcription() 