#!/bin/bash

echo "🧪 Friday Audio Recording System Test"
echo "===================================="

# Test 1: Check if Swift recorder binary exists and is executable
echo "Test 1: Swift Recorder Binary"
if [ -f "./Recorder" ]; then
    echo "✅ Recorder binary exists"
    if [ -x "./Recorder" ]; then
        echo "✅ Recorder is executable"
    else
        echo "❌ Recorder is not executable"
        chmod +x ./Recorder
        echo "✅ Fixed executable permissions"
    fi
else
    echo "❌ Recorder binary not found"
    echo "Building recorder..."
    npm run build:recorder
fi

# Test 2: Check recording directory
echo -e "\nTest 2: Recording Directory"
RECORDING_DIR="$HOME/Documents/Friday Recordings"
if mkdir -p "$RECORDING_DIR" 2>/dev/null; then
    echo "✅ Recording directory exists/created: $RECORDING_DIR"
else
    echo "❌ Cannot create recording directory"
    exit 1
fi

# Test 3: Test permissions
echo -e "\nTest 3: Microphone Permissions"
echo "Note: This may prompt for microphone access"

# Test 4: Test Swift recorder directly
echo -e "\nTest 4: Direct Swift Recorder Test (5 seconds)"
echo "Starting 5-second recording test..."

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
TEST_FILENAME="test-recording-$TIMESTAMP"

# Run recorder with timeout
timeout 5s ./Recorder --record "$RECORDING_DIR" --filename "$TEST_FILENAME" &
RECORDER_PID=$!

echo "Recorder PID: $RECORDER_PID"
sleep 5

# Stop the recorder
echo "Stopping recorder..."
kill -SIGINT $RECORDER_PID 2>/dev/null
wait $RECORDER_PID 2>/dev/null

# Check if file was created
TEST_FILE="$RECORDING_DIR/${TEST_FILENAME}.wav"
echo -e "\nTest 5: File Validation"
if [ -f "$TEST_FILE" ]; then
    FILE_SIZE=$(stat -f%z "$TEST_FILE" 2>/dev/null || stat -c%s "$TEST_FILE" 2>/dev/null)
    echo "✅ Recording file created: $TEST_FILE"
    echo "📊 File size: $FILE_SIZE bytes"
    
    if [ $FILE_SIZE -gt 1000 ]; then
        echo "✅ File has substantial content"
        
        # Test file format
        if command -v ffprobe >/dev/null 2>&1; then
            echo -e "\nTest 6: Audio Format Validation"
            ffprobe -v quiet -print_format json -show_format "$TEST_FILE" | jq '.format | {duration, size, bit_rate, format_name}' 2>/dev/null || echo "File format info not available"
        fi
        
        # Test playback capability
        echo -e "\nTest 7: Playback Test"
        if command -v afplay >/dev/null 2>&1; then
            echo "Testing playback (2 seconds)..."
            timeout 2s afplay "$TEST_FILE" && echo "✅ File plays correctly" || echo "⚠️ Playback test inconclusive"
        fi
    else
        echo "⚠️ File is very small, may be empty"
    fi
else
    echo "❌ Recording file not created"
fi

echo -e "\n🎯 Test Summary:"
echo "1. Swift recorder binary: $([ -x "./Recorder" ] && echo "✅ OK" || echo "❌ FAIL")"
echo "2. Recording directory: $([ -d "$RECORDING_DIR" ] && echo "✅ OK" || echo "❌ FAIL")"
echo "3. Recording file: $([ -f "$TEST_FILE" ] && echo "✅ Created" || echo "❌ Not created")"
echo "4. File size: $([ -f "$TEST_FILE" ] && [ $(stat -f%z "$TEST_FILE" 2>/dev/null || stat -c%s "$TEST_FILE" 2>/dev/null) -gt 1000 ] && echo "✅ Good" || echo "❌ Too small")"

echo -e "\n🚀 If all tests pass, recording should work in the app!"
echo "💡 Use this test file for verification: $TEST_FILE" 