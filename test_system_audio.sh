#!/bin/bash

echo "🧪 System Audio Recording Test"
echo "=============================="
echo ""

echo "📋 Test Plan:"
echo "1. Play system audio (440Hz tone + speech)"
echo "2. Record system audio using Friday's method"
echo "3. Analyze the recording for actual content"
echo "4. Verify playback quality"
echo ""

echo "🎵 Step 1: Playing system audio in background..."
echo "🔊 You should hear a tone and speech now..."

# Play test audio in background
(afplay ~/Friday\ Recordings/test-system-audio.wav &)
(say "This is a system audio recording test for Friday app. The system is now capturing speaker output." &)

# Wait a moment for audio to start
sleep 2

echo "🎙️ Step 2: Recording system audio using Friday's method..."
echo "⏱️ Recording for 8 seconds..."

# Record using the same method as Friday app
/opt/homebrew/bin/ffmpeg -y -f avfoundation -i "1:0" -nostdin -vn -acodec pcm_s16le -ar 44100 -ac 2 -t 8 ~/Friday\ Recordings/friday-system-audio-test.wav 2>/dev/null

echo "✅ Recording completed!"
echo ""

echo "📊 Step 3: Analyzing recording quality..."
if [ -f ~/Friday\ Recordings/friday-system-audio-test.wav ]; then
    echo "✅ Recording file created successfully"
    
    # File size check
    size=$(stat -f%z ~/Friday\ Recordings/friday-system-audio-test.wav)
    echo "📁 File size: $size bytes"
    
    # Audio analysis
    echo ""
    echo "🔊 Audio content analysis:"
    /opt/homebrew/bin/ffmpeg -i ~/Friday\ Recordings/friday-system-audio-test.wav -af volumedetect -f null - 2>&1 | grep -E "(mean_volume|max_volume)"
    
    echo ""
    echo "📊 Audio properties:"
    /opt/homebrew/bin/ffprobe -v quiet -print_format json -show_format -show_streams ~/Friday\ Recordings/friday-system-audio-test.wav | jq '.streams[0] | {codec_name, sample_rate, channels, duration}'
    
    echo ""
    echo "🎵 Step 4: Testing playback..."
    echo "🔊 Playing back the recorded system audio..."
    afplay ~/Friday\ Recordings/friday-system-audio-test.wav
    
    echo ""
    echo "✅ Test completed! Check if you heard the recorded system audio."
else
    echo "❌ Recording failed - file not created"
fi

echo ""
echo "🧹 Cleaning up test files..."
rm ~/Friday\ Recordings/test-system-audio.wav 2>/dev/null || true 