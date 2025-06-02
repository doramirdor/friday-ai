# System Audio Capture Troubleshooting Guide

## Overview
Friday uses macOS ScreenCaptureKit (SCStream) to capture system audio. This technology has some limitations and requirements that can affect system audio capture quality.

## Common Issues and Solutions

### 1. System Audio Not Captured (Small File Sizes)

**Symptoms:**
- System audio file is very small (4 KB or less)
- Only microphone audio is recorded properly
- Combined recording only contains microphone audio

**Most Common Cause: Bluetooth Audio Output**

When your default audio output is set to Bluetooth devices (like AirPods), system audio capture may not work properly because:
- Bluetooth audio uses different routing paths
- Audio is streamed directly to Bluetooth without going through the system audio pipeline that ScreenCaptureKit captures

**Solution:**
1. **Switch to Built-in Audio Output:**
   ```bash
   # Check current audio devices
   system_profiler SPAudioDataType
   
   # Switch to built-in speakers for recording
   # Go to System Preferences > Sound > Output
   # Select "MacBook Pro Speakers" (or similar built-in device)
   ```

2. **Alternative: Use SoundFlower or similar virtual audio devices**
   - Install a virtual audio device that routes all system audio
   - Set it as the default output device during recording

### 2. No System Audio Playing

**Symptoms:**
- Very small system audio files even with proper output device

**Cause:**
- No applications are actually playing audio during recording
- System volume is muted or very low

**Solution:**
1. **Test with known audio source:**
   ```bash
   # Play test audio during recording
   osascript -e "say 'Testing system audio' using voice 'Alex'"
   
   # Or play music/video in another application
   ```

2. **Check system volume:**
   ```bash
   # Set volume to audible level
   osascript -e "set volume output volume 50"
   ```

### 3. Permission Issues

**Symptoms:**
- Recording fails to start
- Permission errors in logs

**Solution:**
1. **Check screen recording permissions:**
   ```bash
   ./Recorder --check-permissions
   ```

2. **Manually grant permissions:**
   - System Preferences > Security & Privacy > Privacy > Screen Recording
   - Enable permission for Friday or Terminal (if running from terminal)

### 4. Application-Specific Audio Routing

**Symptoms:**
- Some applications' audio is not captured
- Inconsistent capture across different apps

**Cause:**
- Some applications use private audio sessions
- Audio routing bypasses system mixer

**Solution:**
- Use applications that output to the main system audio mixer
- Avoid applications with exclusive audio mode

## Best Practices for System Audio Recording

### 1. Optimal Audio Setup
```bash
# Before recording:
1. Switch to built-in speakers/headphones (not Bluetooth)
2. Set system volume to 50-70%
3. Close applications with exclusive audio access
4. Test audio output with a simple sound
```

### 2. Verify Audio Routing
```bash
# Check current setup
system_profiler SPAudioDataType | grep -A 5 "Default Output Device"

# The output should show built-in speakers, not Bluetooth devices
```

### 3. Test Recording
```bash
# Quick test with known audio
./Recorder --record /tmp/test --source system --filename test &
osascript -e "say 'Testing system audio capture'"
sleep 5
pkill -f Recorder

# Check the resulting file size - should be > 100KB for 5 seconds
ls -la /tmp/test/test.mp3
```

## Debugging System Audio Issues

### 1. Enable Enhanced Logging
The improved Swift recorder now includes enhanced logging. Look for these messages:

```
🔊 Current audio output device: [Device Name]
⚠️ Warning: Bluetooth audio device detected
📊 System audio buffer: [X] frames
🔊 System audio level: [X] dB
```

### 2. Check Audio Levels
If you see:
- `System audio level: -160.0 dB` → No audio detected
- `System audio level: -40.0 dB` → Good audio levels
- `System audio level: -10.0 dB` → Very loud audio

### 3. Monitor File Sizes
During recording, check file sizes:
```bash
# In another terminal during recording
ls -la /path/to/recording/directory/

# System audio file should grow steadily if capture is working
# Target: ~100-200 KB per 10 seconds of audio
```

## Known Limitations

1. **Bluetooth Audio:** Limited or no capture with Bluetooth output devices
2. **Private Audio Sessions:** Some apps may not be captured
3. **DRM Content:** Protected audio content cannot be captured
4. **System Restrictions:** macOS may restrict capture from certain system processes

## Recommended Hardware Setup

**For Best Results:**
- Use wired headphones/speakers as output
- Use built-in microphone or quality USB microphone for input
- Avoid Bluetooth devices during system audio recording
- Ensure proper screen recording permissions

## Alternative Solutions

If system audio capture continues to fail:

1. **Use Loopback or similar software:** 
   - Professional audio routing applications
   - Can capture all system audio reliably

2. **Record from external source:**
   - Use external audio interface
   - Route system audio through external mixer

3. **Application-specific recording:**
   - Some applications have built-in recording features
   - May provide better quality than system-wide capture 