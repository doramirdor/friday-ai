#!/bin/bash

echo "🧪 Testing Friday App Audio Recording Content"
echo "============================================="
echo ""

echo "📋 Test Plan:"
echo "1. Play loud system audio in background"
echo "2. Record using Friday app method (via main.ts)"
echo "3. Analyze recorded file for actual audio content"
echo "4. Verify playback contains audible sound"
echo ""

echo "🎵 Step 1: Playing loud system audio..."
echo "🔊 Starting continuous audio playback..."

# Play loud test audio in background
(while true; do say "Friday system audio recording test. This audio should be captured by the recording system. Testing one two three four five." && sleep 1; done &) &
AUDIO_PID=$!

echo "Audio PID: $AUDIO_PID"
sleep 3

echo ""
echo "🎙️ Step 2: Testing Friday's actual recording method..."
echo "⏱️ Recording for 10 seconds using the same method as Friday app..."

# Use the exact same method as Friday app (FFmpeg with current settings)
# Since we reverted to microphone recording, let's test both approaches

echo "Testing current Friday app method (microphone):"
/opt/homebrew/bin/ffmpeg -y -f avfoundation -i ":1" -nostdin -acodec pcm_s16le -ar 44100 -ac 1 -t 10 ~/Friday\ Recordings/friday-app-mic-test.wav 2>/dev/null &
RECORDING_PID=$!

echo "Recording PID: $RECORDING_PID"
echo "⏰ Recording for 10 seconds..."
sleep 11

# Stop audio playback
kill $AUDIO_PID 2>/dev/null
wait $RECORDING_PID 2>/dev/null

echo "✅ Recording completed!"
echo ""

echo "📊 Step 3: Analyzing recording content..."
if [ -f ~/Friday\ Recordings/friday-app-mic-test.wav ]; then
    echo "✅ Recording file created successfully"
    
    # File size check
    size=$(stat -f%z ~/Friday\ Recordings/friday-app-mic-test.wav)
    echo "📁 File size: $size bytes"
    
    # Duration check
    duration=$(ffprobe -v quiet -print_format json -show_format ~/Friday\ Recordings/friday-app-mic-test.wav | jq -r '.format.duration')
    echo "⏱️ Duration: ${duration} seconds"
    
    # Audio content analysis
    echo ""
    echo "🔊 Audio content analysis:"
    ffmpeg -i ~/Friday\ Recordings/friday-app-mic-test.wav -af volumedetect -f null - 2>&1 | grep -E "(mean_volume|max_volume)"
    
    echo ""
    echo "🎵 Step 4: Testing playback..."
    echo "🔊 Playing back the recorded audio (you should hear the test speech)..."
    afplay ~/Friday\ Recordings/friday-app-mic-test.wav
    
    echo ""
    echo "❓ Did you hear the speech in the playback? (The recording should contain the spoken text)"
    
else
    echo "❌ Recording failed - file not created"
fi

echo ""
echo "🧹 Cleaning up..."
# Kill any remaining audio processes
pkill -f "say Friday" 2>/dev/null || true

echo "✅ Test completed!"
echo ""
echo "📋 Summary:"
echo "- Check if file size is reasonable (should be > 800KB for 10 seconds)"
echo "- Check if max volume is > -40 dB (indicates actual audio content)"
echo "- Check if playback contains audible speech" 