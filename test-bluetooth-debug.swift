#!/usr/bin/env swift

import Foundation
import CoreAudio
import AVFoundation

// Import our existing code by including the classes
class AudioDeviceManager {
    // ... existing code from AudioDeviceManager.swift
    
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
    
    /// Gets the UID for a given audio device ID
    static func getDeviceUID(_ deviceID: AudioDeviceID) -> String? {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var uidRef: Unmanaged<CFString>?
        var propertySize = UInt32(MemoryLayout<Unmanaged<CFString>>.size)
        
        let result = AudioObjectGetPropertyData(
            deviceID,
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &uidRef
        )
        
        if result == noErr, let uid = uidRef?.takeUnretainedValue() {
            return uid as String
        }
        
        return nil
    }
    
    /// Test aggregate device creation with proper error handling
    static func testAggregateDeviceCreation() -> Bool {
        print("🧪 Testing aggregate device creation capabilities...")
        
        guard let currentDevice = getCurrentDefaultOutputDevice() else {
            print("❌ Cannot get current output device")
            return false
        }
        
        guard let builtInDevice = builtInOutputID() else {
            print("❌ Cannot find built-in speakers")
            return false
        }
        
        guard let currentUID = getDeviceUID(currentDevice),
              let builtInUID = getDeviceUID(builtInDevice) else {
            print("❌ Cannot get device UIDs")
            return false
        }
        
        print("✅ Device UIDs obtained:")
        print("   Current: \(currentUID)")
        print("   Built-in: \(builtInUID)")
        
        // Test HAL plugin availability
        let bundleID = "com.apple.audio.CoreAudio"
        let cfBundleID = bundleID as CFString
        var pluginPropertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyPlugInForBundleID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var pluginID: AudioObjectID = 0
        var propertySize = UInt32(MemoryLayout<AudioObjectID>.size)
        
        let pluginStatus = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &pluginPropertyAddress,
            UInt32(MemoryLayout<CFString>.size),
            UnsafeMutableRawPointer(mutating: Unmanaged.passUnretained(cfBundleID).toOpaque()),
            &propertySize,
            &pluginID
        )
        
        if pluginStatus == noErr && pluginID != 0 {
            print("✅ HAL plugin found (ID: \(pluginID))")
            return true
        } else {
            print("❌ HAL plugin not found (status: \(pluginStatus))")
            return false
        }
    }
    
    /// Test microphone input device detection
    static func testMicrophoneInput() -> Bool {
        print("🧪 Testing microphone input detection...")
        
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        
        var deviceID: AudioDeviceID = 0
        var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
        
        let result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceID)
        
        if result == noErr && deviceID != 0 {
            if let deviceName = getDeviceName(deviceID) {
                print("✅ Default input device: '\(deviceName)' (ID: \(deviceID))")
                return true
            }
        }
        
        print("❌ No default input device found")
        return false
    }
}

// Test script
print("🔍 Bluetooth Audio Workaround Debug Test")
print("========================================")

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

// Test 3: Device UID Retrieval
print("\n3️⃣ Testing device UID retrieval...")
if let currentDevice = AudioDeviceManager.getCurrentDefaultOutputDevice(),
   let currentUID = AudioDeviceManager.getDeviceUID(currentDevice) {
    print("✅ Current device UID: \(currentUID)")
} else {
    print("❌ Cannot get current device UID")
}

// Test 4: HAL Plugin Test
print("\n4️⃣ Testing HAL plugin availability...")
let halPluginAvailable = AudioDeviceManager.testAggregateDeviceCreation()
print("🔧 HAL Plugin Available: \(halPluginAvailable)")

// Test 5: System Permissions
print("\n5️⃣ Testing system capabilities...")
let hasScreenCapture = CGPreflightScreenCaptureAccess()
print("📺 Screen capture permission: \(hasScreenCapture)")

// Test 6: Microphone Input Test
print("\n6️⃣ Testing microphone input detection...")
let microphoneAvailable = AudioDeviceManager.testMicrophoneInput()
print("🎤 Microphone Available: \(microphoneAvailable)")

print("\n========================================")
print("🏁 Debug test completed") 