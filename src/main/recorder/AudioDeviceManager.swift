import Foundation
import CoreAudio
import AVFoundation

/**
 * A utility class for managing and identifying audio devices on macOS
 */
class AudioDeviceManager {
    /**
     * Lists audio input devices detected on the system
     */
    static func listAudioDevices() -> [String] {
        var deviceList = [String]()
        
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var propertySize: UInt32 = 0
        var result = AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize
        )
        
        guard result == noErr else {
            print("Error getting audio devices size: \(result)")
            return deviceList
        }
        
        let deviceCount = Int(propertySize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        
        result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceIDs
        )
        
        guard result == noErr else {
            print("Error getting audio devices: \(result)")
            return deviceList
        }
        
        for deviceID in deviceIDs {
            var deviceNameProperty = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            
            var deviceNameSize = UInt32(256)
            var deviceNameBuffer = [UInt8](repeating: 0, count: 256)
            
            result = AudioObjectGetPropertyData(
                deviceID,
                &deviceNameProperty,
                0,
                nil,
                &deviceNameSize,
                &deviceNameBuffer
            )
            
            if result == noErr {
                let deviceName = String(bytes: deviceNameBuffer.prefix(Int(deviceNameSize)), encoding: .utf8) ?? "Unknown Device"
                
                // Check if device has input capability
                var inputChannelsAddress = AudioObjectPropertyAddress(
                    mSelector: kAudioDevicePropertyStreamConfiguration,
                    mScope: kAudioDevicePropertyScopeInput,
                    mElement: kAudioObjectPropertyElementMain
                )
                
                var propsize = UInt32(MemoryLayout<AudioBufferList>.size)
                var bufferList = AudioBufferList()
                
                result = AudioObjectGetPropertyData(
                    deviceID,
                    &inputChannelsAddress,
                    0,
                    nil,
                    &propsize,
                    &bufferList
                )
                
                if result == noErr && bufferList.mNumberBuffers > 0 {
                    deviceList.append(deviceName)
                }
            }
        }
        
        return deviceList
    }
    
    /**
     * Lists audio input devices (alias for listAudioDevices for compatibility)
     */
    static func listAudioInputDevices() -> [String] {
        return listAudioDevices()
    }
    
    /**
     * Gets the default audio input device
     */
    static func getDefaultInputDevice() -> String? {
        let devices = listAudioDevices()
        return devices.first
    }
    
    /**
     * Checks if a microphone is currently available
     */
    static func isMicrophoneAvailable() -> Bool {
        return !listAudioDevices().isEmpty
    }
    
    /**
     * Gets the current microphone input level (volume)
     * Returns a value between 0-100 or nil if not available
     */
    static func getMicrophoneInputLevel() -> Float? {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var deviceID: AudioDeviceID = 0
        var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
        
        var result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceID
        )
        
        guard result == noErr else { return nil }
        
        // Get the volume
        propertyAddress.mSelector = kAudioDevicePropertyVolumeScalar
        propertyAddress.mScope = kAudioDevicePropertyScopeInput
        
        var volume: Float32 = 0.0
        propertySize = UInt32(MemoryLayout<Float32>.size)
        
        result = AudioObjectGetPropertyData(
            deviceID,
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &volume
        )
        
        if result == noErr {
            return volume * 100.0
        }
        
        return nil
    }
    
    /**
     * Logs diagnostic information about audio devices
     */
    static func logAudioDiagnostics() {
        print("🎤 Audio Device Diagnostics:")
        print("-----------------------------")
        
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var propertySize: UInt32 = 0
        var result = AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize
        )
        
        guard result == noErr else {
            print("Error getting audio devices size: \(result)")
            return
        }
        
        let deviceCount = Int(propertySize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        
        result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceIDs
        )
        
        guard result == noErr else {
            print("Error getting audio devices: \(result)")
            return
        }
        
        var inputDeviceCount = 0
        
        for deviceID in deviceIDs {
            // Get device name
            var deviceNameProperty = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            
            var deviceNameSize = UInt32(256)
            var deviceNameBuffer = [UInt8](repeating: 0, count: 256)
            
            result = AudioObjectGetPropertyData(
                deviceID,
                &deviceNameProperty,
                0,
                nil,
                &deviceNameSize,
                &deviceNameBuffer
            )
            
            if result == noErr {
                let deviceName = String(bytes: deviceNameBuffer.prefix(Int(deviceNameSize)), encoding: .utf8) ?? "Unknown Device"
                
                // Check if device has input capability
                var inputChannelsAddress = AudioObjectPropertyAddress(
                    mSelector: kAudioDevicePropertyStreamConfiguration,
                    mScope: kAudioDevicePropertyScopeInput,
                    mElement: kAudioObjectPropertyElementMain
                )
                
                var propsize = UInt32(MemoryLayout<AudioBufferList>.size)
                var bufferList = AudioBufferList()
                
                result = AudioObjectGetPropertyData(
                    deviceID,
                    &inputChannelsAddress,
                    0,
                    nil,
                    &propsize,
                    &bufferList
                )
                
                if result == noErr && bufferList.mNumberBuffers > 0 {
                    inputDeviceCount += 1
                    print("Found input device: \(deviceName)")
                }
            }
        }
        
        print("Input devices detected: \(inputDeviceCount)")
        
        // Get microphone volume
        if let volume = getMicrophoneInputLevel() {
            print("Microphone input level: \(volume)%")
        } else {
            print("Could not get microphone input level")
        }
        
        print("-----------------------------")
    }
    
    static func checkMicrophonePermission() -> Bool {
        // macOS doesn't have the same permission model as iOS
        // Instead, when the app tries to use the microphone, the system will prompt for permission
        return true
    }
    
    static func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        // On macOS, we can't explicitly request permission ahead of time
        // The system will prompt when the app first tries to access the microphone
        completion(true)
    }
    
    static func setMicrophoneInputLevel(_ volume: Float) -> Bool {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var deviceID: AudioDeviceID = 0
        var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
        
        var result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceID
        )
        
        guard result == noErr else { return false }
        
        // Set the volume
        propertyAddress.mSelector = kAudioDevicePropertyVolumeScalar
        propertyAddress.mScope = kAudioDevicePropertyScopeInput
        
        var newVolume = volume / 100.0
        propertySize = UInt32(MemoryLayout<Float32>.size)
        
        result = AudioObjectGetPropertyData(
            deviceID,
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &newVolume
        )
        
        return result == noErr
    }
    
    // MARK: - Multi-Output Device Management for Bluetooth Audio
    
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
            var transport: UInt32 = 0
            var size = UInt32(MemoryLayout<UInt32>.size)
            var tProp = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyTransportType,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain)
            if AudioObjectGetPropertyData(id, &tProp, 0, nil, &size, &transport) == noErr,
               transport == kAudioDeviceTransportTypeBuiltIn {
                return id
            }
        }
        return nil
    }
    
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
    
    /// Creates a multi-output device that includes both Bluetooth and built-in speakers
    /// This allows users to hear through Bluetooth while ScreenCaptureKit captures from built-in speakers
    static func createMultiOutputDevice(bluetoothDeviceID: AudioDeviceID, builtInDeviceID: AudioDeviceID) -> AudioDeviceID? {
        print("🔧 Creating multi-output device for Bluetooth workaround...")
        
        // Get UIDs for both devices
        guard let bluetoothUID = getDeviceUID(bluetoothDeviceID),
              let builtInUID = getDeviceUID(builtInDeviceID) else {
            print("❌ Could not get device UIDs")
            return nil
        }
        
        print("   📱 Bluetooth UID: \(bluetoothUID)")
        print("   🔊 Built-in UID: \(builtInUID)")
        
        // Create aggregate device description
        var description: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Friday Multi-Output",
            kAudioAggregateDeviceUIDKey: "com.friday.multi-output-\(Date().timeIntervalSince1970)",
            kAudioAggregateDeviceIsPrivateKey: NSNumber(value: 1),
            kAudioAggregateDeviceIsStackedKey: NSNumber(value: 0),
            kAudioAggregateDeviceSubDeviceListKey: [
                [kAudioSubDeviceUIDKey: bluetoothUID],
                [kAudioSubDeviceUIDKey: builtInUID]
            ]
        ]
        
        // Create the aggregate device using Audio Hardware Services
        var aggregateDeviceID: AudioDeviceID = 0
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioPlugInCreateAggregateDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        // Convert dictionary to CFDictionary
        var cfDescription = description as CFDictionary
        var propertySize = UInt32(MemoryLayout<CFDictionary>.size)
        
        let result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            UInt32(MemoryLayout<CFDictionary>.size),
            &cfDescription,
            &propertySize,
            &aggregateDeviceID
        )
        
        if result == noErr && aggregateDeviceID != 0 {
            print("✅ Multi-output device created successfully (ID: \(aggregateDeviceID))")
            
            // Small delay to let the device initialize
            usleep(500000) // 0.5 seconds
            
            return aggregateDeviceID
        } else {
            print("❌ Failed to create multi-output device (error: \(result))")
            return nil
        }
    }
    
    /// Gets the UID for a given audio device ID
    static func getDeviceUID(_ deviceID: AudioDeviceID) -> String? {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var uidRef: CFString?
        var propertySize = UInt32(MemoryLayout<CFString>.size)
        
        let result = AudioObjectGetPropertyData(
            deviceID,
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &uidRef
        )
        
        if result == noErr, let uid = uidRef {
            return uid as String
        }
        
        return nil
    }
    
    /// Destroys an aggregate device
    static func destroyAggregateDevice(_ deviceID: AudioDeviceID) -> Bool {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioPlugInDestroyAggregateDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var deviceIDToDestroy = deviceID
        let result = AudioObjectSetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            UInt32(MemoryLayout<AudioDeviceID>.size),
            &deviceIDToDestroy
        )
        
        if result == noErr {
            print("✅ Multi-output device destroyed successfully")
            return true
        } else {
            print("❌ Failed to destroy multi-output device (error: \(result))")
            return false
        }
    }
    
    // MARK: - Bluetooth Workaround Management
    
    private static var originalDefaultDevice: AudioDeviceID?
    private static var multiOutputDevice: AudioDeviceID?
    
    /// Enables multi-output device for Bluetooth audio recording
    /// This allows users to hear through Bluetooth while system audio is captured from built-in speakers
    static func enableBluetoothWorkaround() -> Bool {
        guard isCurrentOutputDeviceBluetooth() else {
            print("Current device is not Bluetooth, no workaround needed")
            return false
        }
        
        guard let bluetoothDevice = getCurrentDefaultOutputDevice(),
              let builtInDevice = builtInOutputID() else {
            print("❌ Could not get required audio devices for Bluetooth workaround")
            return false
        }
        
        // Store original device for restoration
        originalDefaultDevice = bluetoothDevice
        
        print("🔧 Setting up Bluetooth audio workaround...")
        print("   📱 Bluetooth device ID: \(bluetoothDevice)")
        print("   🔊 Built-in device ID: \(builtInDevice)")
        
        // Create multi-output device
        guard let multiDevice = createMultiOutputDevice(
            bluetoothDeviceID: bluetoothDevice,
            builtInDeviceID: builtInDevice
        ) else {
            print("❌ Failed to create multi-output device")
            return false
        }
        
        multiOutputDevice = multiDevice
        
        // Set multi-output device as default
        if setDefaultOutputDevice(multiDevice) {
            print("✅ Bluetooth workaround enabled - users will hear through Bluetooth, system audio captured from built-in speakers")
            return true
        } else {
            print("❌ Failed to set multi-output device as default")
            // Clean up the device we created
            _ = destroyAggregateDevice(multiDevice)
            multiOutputDevice = nil
            return false
        }
    }
    
    /// Disables the Bluetooth workaround and restores original audio device
    static func disableBluetoothWorkaround() -> Bool {
        var success = true
        
        // Restore original default device
        if let originalDevice = originalDefaultDevice {
            if setDefaultOutputDevice(originalDevice) {
                print("✅ Restored original default audio device")
            } else {
                print("❌ Failed to restore original default audio device")
                success = false
            }
            originalDefaultDevice = nil
        }
        
        // Destroy multi-output device
        if let multiDevice = multiOutputDevice {
            if destroyAggregateDevice(multiDevice) {
                print("✅ Cleaned up multi-output device")
            } else {
                print("❌ Failed to clean up multi-output device")
                success = false
            }
            multiOutputDevice = nil
        }
        
        return success
    }
} 