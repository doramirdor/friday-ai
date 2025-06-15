#!/usr/bin/env swift

import Foundation
import CoreAudio

// Quick fix script for Bluetooth audio restoration
// Run this if your audio got stuck on built-in speakers after recording

class AudioRestorer {
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
    
    /// Checks if device is Bluetooth
    static func isBluetoothDevice(_ deviceID: AudioDeviceID) -> Bool {
        var transport: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        var tProp = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyTransportType,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        
        let result = AudioObjectGetPropertyData(deviceID, &tProp, 0, nil, &size, &transport)
        return result == noErr && (transport == kAudioDeviceTransportTypeBluetooth || transport == kAudioDeviceTransportTypeBluetoothLE)
    }
    
    /// Sets the default output device
    static func setDefaultOutputDevice(_ deviceID: AudioDeviceID) -> Bool {
        var defAddr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        
        var mutableDeviceID = deviceID
        let result = AudioObjectSetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &defAddr, 0, nil,
            UInt32(MemoryLayout<AudioDeviceID>.size), &mutableDeviceID)
        
        return result == noErr
    }
    
    /// Lists all available output devices
    static func listAllOutputDevices() -> [AudioDeviceID] {
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

        // Filter to only output devices
        return ids.filter { deviceID in
            var outputChannelsAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyStreamConfiguration,
                mScope: kAudioDevicePropertyScopeOutput,
                mElement: kAudioObjectPropertyElementMain
            )
            
            var propsize = UInt32(MemoryLayout<AudioBufferList>.size)
            var bufferList = AudioBufferList()
            
            let result = AudioObjectGetPropertyData(
                deviceID,
                &outputChannelsAddress,
                0,
                nil,
                &propsize,
                &bufferList
            )
            
            return result == noErr && bufferList.mNumberBuffers > 0
        }
    }
}

// Main script logic
print("🔧 Bluetooth Audio Restoration Tool")
print("===================================")

if let currentDevice = AudioRestorer.getCurrentDefaultOutputDevice() {
    let currentDeviceName = AudioRestorer.getDeviceName(currentDevice) ?? "Unknown"
    let isCurrentBluetooth = AudioRestorer.isBluetoothDevice(currentDevice)
    
    print("📱 Current audio device: '\(currentDeviceName)'")
    print("🔗 Is Bluetooth: \(isCurrentBluetooth)")
    
    if isCurrentBluetooth {
        print("✅ You're already using a Bluetooth device - no fix needed!")
        exit(0)
    } else {
        print("🔍 Searching for Bluetooth devices to restore...")
        
        let allDevices = AudioRestorer.listAllOutputDevices()
        let bluetoothDevices = allDevices.filter { AudioRestorer.isBluetoothDevice($0) }
        
        if bluetoothDevices.isEmpty {
            print("❌ No Bluetooth audio devices found")
            print("💡 Make sure your Bluetooth device is connected and try again")
            exit(1)
        } else {
            print("🎧 Found \(bluetoothDevices.count) Bluetooth device(s):")
            
            for (index, deviceID) in bluetoothDevices.enumerated() {
                let name = AudioRestorer.getDeviceName(deviceID) ?? "Unknown Device"
                print("  \(index + 1). '\(name)' (ID: \(deviceID))")
            }
            
            // Auto-select first Bluetooth device if only one, otherwise ask user
            let selectedDevice: AudioDeviceID
            if bluetoothDevices.count == 1 {
                selectedDevice = bluetoothDevices[0]
                let deviceName = AudioRestorer.getDeviceName(selectedDevice) ?? "Unknown"
                print("🔄 Automatically switching to: '\(deviceName)'")
            } else {
                print("\nWhich device would you like to switch to? (1-\(bluetoothDevices.count)): ", terminator: "")
                
                if let input = readLine(), let choice = Int(input), choice >= 1 && choice <= bluetoothDevices.count {
                    selectedDevice = bluetoothDevices[choice - 1]
                    let deviceName = AudioRestorer.getDeviceName(selectedDevice) ?? "Unknown"
                    print("🔄 Switching to: '\(deviceName)'")
                } else {
                    print("❌ Invalid choice. Exiting.")
                    exit(1)
                }
            }
            
            // Attempt to switch
            if AudioRestorer.setDefaultOutputDevice(selectedDevice) {
                let deviceName = AudioRestorer.getDeviceName(selectedDevice) ?? "Unknown"
                print("✅ Successfully switched audio to: '\(deviceName)'")
                print("🎧 You should now hear audio through your Bluetooth device!")
            } else {
                print("❌ Failed to switch audio device")
                print("💡 Try switching manually in System Settings > Sound")
            }
        }
    }
} else {
    print("❌ Unable to detect current audio device")
    print("💡 Try restarting your Mac if audio issues persist")
}

print("\n===================================")
print("🏁 Audio restoration complete!") 