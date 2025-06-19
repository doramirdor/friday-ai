#!/bin/bash

echo "🔬 Comprehensive Microphone Diagnostic"
echo "======================================"

# First, let's check available audio devices
echo "🎙️ Available Audio Input Devices:"
/opt/homebrew/bin/ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -A 20 "AVFoundation input devices:"

echo ""
echo "🔍 Testing different microphone sources..."

# Test different input devices
echo ""
echo "📱 Test 1: Device 0 (Built-in Microphone) - 3 seconds"
echo "Please speak LOUDLY now..."
/opt/homebrew/bin/ffmpeg -y -f avfoundation -i ":0" -nostdin -acodec pcm_s16le -ar 44100 -ac 1 -t 3 ~/Friday\ Recordings/test-device-0.wav 2>/dev/null

echo ""
echo "📱 Test 2: Device 1 (MacBook Pro Microphone) - 3 seconds"
echo "Please speak LOUDLY now..."
/opt/homebrew/bin/ffmpeg -y -f avfoundation -i ":1" -nostdin -acodec pcm_s16le -ar 44100 -ac 1 -t 3 ~/Friday\ Recordings/test-device-1.wav 2>/dev/null

echo ""
echo "📱 Test 3: Default microphone with higher gain - 3 seconds"
echo "Please speak LOUDLY now..."
/opt/homebrew/bin/ffmpeg -y -f avfoundation -i ":default" -nostdin -af "volume=3.0" -acodec pcm_s16le -ar 44100 -ac 1 -t 3 ~/Friday\ Recordings/test-default-boosted.wav 2>/dev/null

echo ""
echo "📊 Analyzing all test recordings..."

for file in ~/Friday\ Recordings/test-device-*.wav ~/Friday\ Recordings/test-default-*.wav; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo ""
        echo "🔍 Analysis of $filename:"
        
        # Get file size
        size=$(stat -f%z "$file")
        echo "   📁 Size: $size bytes"
        
        # Volume analysis
        volume_analysis=$(ffmpeg -i "$file" -af volumedetect -f null - 2>&1 | grep -E "(mean_volume|max_volume)")
        if [ ! -z "$volume_analysis" ]; then
            echo "   🔊 Volume Analysis:"
            echo "$volume_analysis" | sed 's/^/      /'
            
            # Extract max volume
            max_volume=$(echo "$volume_analysis" | grep "max_volume" | sed 's/.*max_volume: //' | sed 's/ dB//')
            if [ ! -z "$max_volume" ]; then
                max_volume_abs=$(echo "$max_volume" | sed 's/-//')
                echo "   📈 Max Volume: $max_volume dB"
                
                # More sensitive thresholds for microphone issues
                if (( $(echo "$max_volume_abs < 20" | bc -l) )); then
                    echo "   ✅ EXCELLENT: Strong audio signal detected!"
                elif (( $(echo "$max_volume_abs < 35" | bc -l) )); then
                    echo "   ✅ GOOD: Decent audio signal"
                elif (( $(echo "$max_volume_abs < 50" | bc -l) )); then
                    echo "   ⚠️  WEAK: Audio present but quiet"
                elif (( $(echo "$max_volume_abs < 70" | bc -l) )); then
                    echo "   ❌ POOR: Very weak signal (likely just noise)"
                else
                    echo "   ❌ SILENT: No meaningful audio detected"
                fi
            fi
        fi
        
        # Quick spectral analysis
        echo "   🎵 Testing playback (2 seconds)..."
        timeout 2 afplay "$file" 2>/dev/null || echo "      (playback timed out)"
    fi
done

echo ""
echo "🔧 System Audio Checks:"

# Check system audio preferences
echo "📱 Current macOS audio input device:"
system_profiler SPAudioDataType | grep -A 5 "Input Source"

echo ""
echo "🔊 System volume and mute status:"
osascript -e "get volume settings"

echo ""
echo "🛠️  Troubleshooting Recommendations:"
echo "   1. Check System Preferences > Security & Privacy > Microphone"
echo "   2. Check System Preferences > Sound > Input tab"
echo "   3. Ensure microphone input level is not at zero"
echo "   4. Try speaking very close to the microphone"
echo "   5. Check if any other apps are using the microphone"

# Cleanup test files
echo ""
echo "🧹 Cleaning up test files..."
rm -f ~/Friday\ Recordings/test-device-*.wav ~/Friday\ Recordings/test-default-*.wav

echo "✅ Diagnostic complete!" 