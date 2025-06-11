# Bluetooth Audio Recording Solution

## Problem
When users connect Bluetooth headphones, ScreenCaptureKit can't capture system audio because:
1. Audio is routed through Bluetooth, not built-in speakers
2. ScreenCaptureKit can only capture from physical audio interfaces
3. Bluetooth audio uses different codecs and routing

## Solution: Multi-Output Aggregate Device

Create an aggregate device that simultaneously outputs to:
- **Bluetooth headphones** → User hears everything normally
- **Built-in speakers** → ScreenCaptureKit captures system audio

## Implementation Steps

### 1. Detect Bluetooth Audio Situation
```swift
func isBluetoothWorkaroundNeeded() -> Bool {
    guard let deviceID = getCurrentDefaultOutputDevice() else { return false }
    
    var transport: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    var tProp = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyTransportType,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    
    let result = AudioObjectGetPropertyData(deviceID, &tProp, 0, nil, &size, &transport)
    return result == noErr && (transport == kAudioDeviceTransportTypeBluetooth || 
                              transport == kAudioDeviceTransportTypeBluetoothLE)
}
```

### 2. Create Multi-Output Device
```swift
func createMultiOutputDevice(bluetoothDeviceID: AudioDeviceID, builtInDeviceID: AudioDeviceID) -> AudioDeviceID? {
    // Get device UIDs
    guard let bluetoothUID = getDeviceUID(bluetoothDeviceID),
          let builtInUID = getDeviceUID(builtInDeviceID) else {
        return nil
    }
    
    // Create aggregate device configuration
    let subDevices: [[String: Any]] = [
        [
            kAudioSubDeviceUIDKey as String: bluetoothUID,
            kAudioSubDeviceDriftCompensationKey as String: 1  // Bluetooth is secondary
        ],
        [
            kAudioSubDeviceUIDKey as String: builtInUID,
            kAudioSubDeviceDriftCompensationKey as String: 0  // Built-in is master
        ]
    ]
    
    let description: [String: Any] = [
        kAudioAggregateDeviceNameKey as String: "Multi-Output Device",
        kAudioAggregateDeviceUIDKey as String: "com.yourapp.multi-output-\(Date().timeIntervalSince1970)",
        kAudioAggregateDeviceSubDeviceListKey as String: subDevices,
        kAudioAggregateDeviceMasterSubDeviceKey as String: builtInUID,  // Built-in is master for capture
        kAudioAggregateDeviceIsPrivateKey as String: 1
    ]
    
    // Create the device using Core Audio HAL
    return createAggregateDeviceViaPlugin(description: description)
}
```

### 3. Enable Bluetooth Workaround
```swift
func enableBluetoothWorkaround() -> Bool {
    // Store original device for later restoration
    guard let bluetoothDevice = getCurrentDefaultOutputDevice(),
          let builtInDevice = findBuiltInSpeakers() else {
        return false
    }
    
    originalDefaultDevice = bluetoothDevice
    
    // Create multi-output device
    guard let multiDevice = createMultiOutputDevice(
        bluetoothDeviceID: bluetoothDevice,
        builtInDeviceID: builtInDevice
    ) else {
        return false
    }
    
    multiOutputDevice = multiDevice
    
    // Set as default output
    if setDefaultOutputDevice(multiDevice) {
        // Wait for system to stabilize
        usleep(1000000) // 1 second
        return true
    }
    
    return false
}
```

### 4. Recording Setup
```swift
func setupRecordingWithBluetoothSupport() {
    if isBluetoothWorkaroundNeeded() {
        if enableBluetoothWorkaround() {
            print("✅ Bluetooth workaround enabled")
            print("   Users hear through Bluetooth, system audio captured from built-in")
        } else {
            print("❌ Bluetooth workaround failed, falling back to microphone-only")
            audioSource = "mic"
        }
    }
    
    // Continue with normal recording setup
    startRecordingProcess()
}
```

### 5. Cleanup on Recording End
```swift
func disableBluetoothWorkaround() -> Bool {
    var success = true
    
    // Restore original Bluetooth device
    if let originalDevice = originalDefaultDevice {
        success = setDefaultOutputDevice(originalDevice)
        originalDefaultDevice = nil
    }
    
    // Destroy aggregate device
    if let multiDevice = multiOutputDevice {
        success = destroyAggregateDevice(multiDevice) && success
        multiOutputDevice = nil
    }
    
    return success
}
```

## Key Benefits

1. **Seamless User Experience**: Users keep hearing through Bluetooth headphones
2. **Full System Audio Capture**: ScreenCaptureKit captures from built-in speakers
3. **Automatic Fallback**: If workaround fails, gracefully falls back to mic-only
4. **Clean Restoration**: Original audio setup restored after recording

## Error Handling

```swift
func createAggregateDeviceWithRetry(description: [String: Any]) -> AudioDeviceID? {
    // Try HAL plugin method first
    if let deviceID = createAggregateDeviceViaPlugin(description: description) {
        return deviceID
    }
    
    // Try direct system object method
    if let deviceID = createAggregateDeviceDirectly(description: description) {
        return deviceID
    }
    
    // Both methods failed
    print("❌ All aggregate device creation methods failed")
    print("   This may indicate:")
    print("   1. Insufficient permissions")
    print("   2. Core Audio HAL issues")
    print("   3. Device compatibility problems")
    
    return nil
}
```

## User Communication

When Bluetooth workaround is active, inform users:

```swift
let warningMessage = """
Bluetooth audio detected. Using enhanced recording mode:
• You'll continue hearing through your Bluetooth headphones
• System audio will be captured for recording
• This ensures high-quality audio capture
"""

// Send to UI
ResponseHandler.returnResponse([
    "code": "RECORDING_STARTED",
    "path": outputPath,
    "warning": warningMessage,
    "bluetooth_workaround": true
])
```

## Testing Checklist

- [ ] Works with AirPods Pro/Max
- [ ] Works with third-party Bluetooth headphones
- [ ] Graceful fallback when workaround fails
- [ ] Proper cleanup on app termination
- [ ] No audio glitches during device switching
- [ ] System audio levels match expectations

This solution provides the same robust Bluetooth handling as shown in the AudioDeviceManager, ensuring users can record system audio even while using Bluetooth headphones. 