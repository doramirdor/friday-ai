#!/usr/bin/env swift

import Foundation
import CoreAudio
import CoreGraphics

// Minimal AudioDeviceManager implementation for testing
class AudioDeviceManager {
    /// Gets the current default output device ID
    static func getCurrentDefaultOutputDevice() -> AudioDeviceID? {
        var defAddr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var deviceID: AudioDeviceID = 0
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &defAddr, 0, nil, &size, &deviceID)
        
        return result == noErr ? deviceID : nil
    }
    
    /// Checks if the current default output device is Bluetooth
    static func isCurrentOutputDeviceBluetooth() -> Bool {
        guard let deviceID = getCurrentDefaultOutputDevice() else { return false }
        
        var transport: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        var tProp = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyTransportType,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        
        let result = AudioObjectGetPropertyData(deviceID, &tProp, 0, nil, &size, &transport)
        return result == noErr && (transport == kAudioDeviceTransportTypeBluetooth || transport == kAudioDeviceTransportTypeBluetoothLE)
    }
    
    /// Returns the AudioDeviceID for the built-in speakers.
    static func builtInOutputID() -> AudioDeviceID? {
        var propAddr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var dataSize: UInt32 = 0
        AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &propAddr, 0, nil, &dataSize)

        let count = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
        var ids = [AudioDeviceID](repeating: 0, count: count)
        AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propAddr, 0, nil, &dataSize, &ids)

        for id in ids {
            // Check if it's a built-in device
            var transport: UInt32 = 0
            var size = UInt32(MemoryLayout<UInt32>.size)
            var tProp = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyTransportType,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain)
            
            guard AudioObjectGetPropertyData(id, &tProp, 0, nil, &size, &transport) == noErr,
                  transport == kAudioDeviceTransportTypeBuiltIn else {
                continue
            }
            
            // Check if device has OUTPUT streams (not input)
            var outputChannelsAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyStreamConfiguration,
                mScope: kAudioDevicePropertyScopeOutput,
                mElement: kAudioObjectPropertyElementMain
            )
            
            var propsize = UInt32(MemoryLayout<AudioBufferList>.size)
            var bufferList = AudioBufferList()
            
            let result = AudioObjectGetPropertyData(
                id,
                &outputChannelsAddress,
                0,
                nil,
                &propsize,
                &bufferList
            )
            
            // Only return devices that have output capability
            if result == noErr && bufferList.mNumberBuffers > 0 {
                // Additional check: make sure it's not a microphone by checking the name
                if let deviceName = getDeviceName(id) {
                    print("   🔍 Found built-in output device: '\(deviceName)' (ID: \(id))")
                    
                    // Skip microphone devices
                    if deviceName.lowercased().contains("microphone") || 
                       deviceName.lowercased().contains("mic") {
                        print("   ⏭️ Skipping microphone device")
                        continue
                    }
                    
                    print("   ✅ Selected built-in output device: '\(deviceName)'")
                    return id
                }
            }
        }
        
        print("   ❌ No built-in output speakers found")
        return nil
    }
    
    /// Gets the name of an audio device by ID
    static func getDeviceName(_ deviceID: AudioDeviceID) -> String? {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var deviceNameSize = UInt32(256)
        var deviceNameBuffer = [UInt8](repeating: 0, count: 256)
        
        let result = AudioObjectGetPropertyData(
            deviceID,
            &propertyAddress,
            0,
            nil,
            &deviceNameSize,
            &deviceNameBuffer
        )
        
        if result == noErr {
            return String(bytes: deviceNameBuffer.prefix(Int(deviceNameSize)), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        
        return nil
    }
    
    /// Sets the default output device
    static func setDefaultOutputDevice(_ deviceID: AudioDeviceID) -> Bool {
        print("🔧 Setting default output device to ID: \(deviceID)")
        
        var defAddr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        
        var mutableDeviceID = deviceID
        let result = AudioObjectSetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &defAddr, 0, nil,
            UInt32(MemoryLayout<AudioDeviceID>.size), &mutableDeviceID)
        
        if result == noErr {
            print("✅ Default output device set successfully")
            
            // Verify the change took effect
            usleep(500000) // 0.5 second delay for system to process
            
            if let currentDevice = getCurrentDefaultOutputDevice(), currentDevice == deviceID {
                if let deviceName = getDeviceName(deviceID) {
                    print("✅ Verified: Default output is now '\(deviceName)' (ID: \(deviceID))")
                }
                return true
            } else {
                print("❌ Warning: Default output device may not have changed properly")
                return false
            }
        } else {
            print("❌ Failed to set default output device (error: \(result))")
            return false
        }
    }
    
    /// Test the fallback Bluetooth workaround strategy
    static func testBluetoothWorkaroundFallback() -> Bool {
        print("🧪 Testing Bluetooth workaround fallback strategy...")
        
        guard let currentDevice = getCurrentDefaultOutputDevice() else {
            print("❌ Cannot get current output device")
            return false
        }
        
        guard let builtInDevice = builtInOutputID() else {
            print("❌ Cannot find built-in speakers for fallback")
            return false
        }
        
        let originalDeviceName = getDeviceName(currentDevice) ?? "Unknown"
        let builtInDeviceName = getDeviceName(builtInDevice) ?? "Unknown"
        
        print("📱 Current device: '\(originalDeviceName)' (ID: \(currentDevice))")
        print("🔊 Built-in device: '\(builtInDeviceName)' (ID: \(builtInDevice))")
        
        // Only test if we're not already on built-in speakers
        if currentDevice == builtInDevice {
            print("ℹ️ Already using built-in speakers - fallback test not needed")
            return true
        }
        
        // Test switching to built-in speakers
        print("🔄 Testing switch to built-in speakers...")
        
        let switchSuccess = setDefaultOutputDevice(builtInDevice)
        if switchSuccess {
            print("✅ Successfully switched to built-in speakers")
            
            // Test switching back to original device
            print("🔄 Testing restoration to original device...")
            usleep(1000000) // 1 second delay
            
            let restoreSuccess = setDefaultOutputDevice(currentDevice)
            if restoreSuccess {
                print("✅ Successfully restored original audio device")
                return true
            } else {
                print("❌ Failed to restore original audio device")
                return false
            }
        } else {
            print("❌ Failed to switch to built-in speakers")
            return false
        }
    }
}

// Test script
print("🔍 Fixed Bluetooth Audio Workaround Test")
print("=======================================")

// Test 1: Current Device Detection
print("\n1️⃣ Testing current device detection...")
if let currentDevice = AudioDeviceManager.getCurrentDefaultOutputDevice() {
    if let deviceName = AudioDeviceManager.getDeviceName(currentDevice) {
        print("✅ Current output device: '\(deviceName)' (ID: \(currentDevice))")
    }
    
    let isBluetooth = AudioDeviceManager.isCurrentOutputDeviceBluetooth()
    print("📱 Is Bluetooth: \(isBluetooth)")
} else {
    print("❌ Cannot detect current output device")
}

// Test 2: Built-in Device Detection
print("\n2️⃣ Testing built-in device detection...")
if let builtInDevice = AudioDeviceManager.builtInOutputID() {
    if let deviceName = AudioDeviceManager.getDeviceName(builtInDevice) {
        print("✅ Built-in device: '\(deviceName)' (ID: \(builtInDevice))")
    }
} else {
    print("❌ Cannot find built-in speakers")
}

// Test 3: Fallback Strategy Test
print("\n3️⃣ Testing Bluetooth workaround fallback strategy...")
let fallbackSuccess = AudioDeviceManager.testBluetoothWorkaroundFallback()
print("🔧 Fallback Strategy Works: \(fallbackSuccess)")

// Test 4: System Permissions
print("\n4️⃣ Testing system capabilities...")
let hasScreenCapture = CGPreflightScreenCaptureAccess()
print("📺 Screen capture permission: \(hasScreenCapture)")

print("\n=======================================")
if fallbackSuccess {
    print("🎉 Fixed Bluetooth workaround test PASSED!")
    print("✅ The fallback strategy works correctly")
    print("✅ Audio device switching is functional")
    print("✅ Original device restoration works")
} else {
    print("❌ Fixed Bluetooth workaround test FAILED!")
    print("❌ Audio device switching may have issues")
}
print("=======================================") 