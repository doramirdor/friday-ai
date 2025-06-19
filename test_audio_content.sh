#!/bin/bash

echo "🧪 Testing Audio Content Quality"
echo "================================"

# Create test recording
echo "🎙️ Recording 5 seconds of audio - PLEASE SPEAK INTO YOUR MICROPHONE!"
echo "📢 Say something like 'Hello this is a test recording' during the next 5 seconds..."
sleep 2

# Record using the same FFmpeg command as the app
echo "🔴 Recording started..."
/opt/homebrew/bin/ffmpeg -y -f avfoundation -i ":1" -nostdin -acodec pcm_s16le -ar 44100 -ac 1 -t 5 ~/Friday\ Recordings/audio-content-test.wav 2>/dev/null

if [ -f ~/Friday\ Recordings/audio-content-test.wav ]; then
    echo "✅ Test recording created"
    
    # Get basic file info
    size=$(stat -f%z ~/Friday\ Recordings/audio-content-test.wav)
    echo "📁 File size: $size bytes"
    
    # Analyze audio content using FFmpeg's volumedetect filter
    echo "📊 Analyzing audio levels..."
    volume_analysis=$(ffmpeg -i ~/Friday\ Recordings/audio-content-test.wav -af volumedetect -f null - 2>&1 | grep -E "(mean_volume|max_volume)")
    
    echo "🔊 Volume Analysis:"
    echo "$volume_analysis"
    
    # Extract max volume value for comparison
    max_volume=$(echo "$volume_analysis" | grep "max_volume" | sed 's/.*max_volume: //' | sed 's/ dB//')
    
    if [ ! -z "$max_volume" ]; then
        # Convert to number for comparison (remove negative sign)
        max_volume_abs=$(echo "$max_volume" | sed 's/-//')
        
        echo "📈 Maximum volume detected: $max_volume dB"
        
        # Check if audio has sufficient content (not silence)
        # Silence would be around -60 dB or lower, good audio should be above -40 dB
        if (( $(echo "$max_volume_abs < 40" | bc -l) )); then
            echo "✅ GOOD: Audio contains actual sound content!"
            echo "🎵 Audio level is strong enough for recording"
        elif (( $(echo "$max_volume_abs < 60" | bc -l) )); then
            echo "⚠️  MEDIUM: Audio detected but quite quiet"
            echo "🎵 You might want to speak louder or move closer to microphone"
        else
            echo "❌ POOR: Audio is too quiet or mostly silent"
            echo "🔇 Check if microphone is working and not muted"
        fi
    else
        echo "❌ Could not analyze volume levels"
    fi
    
    # Additional spectral analysis to detect frequency content
    echo ""
    echo "📡 Analyzing frequency content..."
    
    # Use FFmpeg to get audio statistics
    audio_stats=$(ffmpeg -i ~/Friday\ Recordings/audio-content-test.wav -af astats -f null - 2>&1 | grep -E "(RMS level|Peak level|Dynamic range)")
    
    if [ ! -z "$audio_stats" ]; then
        echo "📊 Audio Statistics:"
        echo "$audio_stats"
    fi
    
    # Final file verification
    echo ""
    echo "📋 File Properties:"
    /opt/homebrew/bin/ffprobe -v quiet -print_format json -show_format -show_streams ~/Friday\ Recordings/audio-content-test.wav | jq '{
        duration: .format.duration,
        size: .format.size,
        codec: .streams[0].codec_name,
        sample_rate: .streams[0].sample_rate,
        channels: .streams[0].channels
    }'
    
    # Test playback capability
    echo ""
    echo "🔊 Testing playback capability..."
    echo "   (This will play the recorded audio - make sure your speakers are on)"
    read -p "Press Enter to play the recording, or Ctrl+C to skip..."
    
    # Play the audio file using afplay (macOS built-in)
    afplay ~/Friday\ Recordings/audio-content-test.wav
    echo "✅ Playback test completed"
    
    echo ""
    echo "🧹 Cleaning up test file..."
    rm ~/Friday\ Recordings/audio-content-test.wav
    echo "✅ Test completed successfully!"
    
else
    echo "❌ Test recording was not created"
    echo "🔍 Check if FFmpeg is working and microphone permissions are granted"
fi 