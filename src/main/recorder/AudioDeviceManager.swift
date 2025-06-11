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
    
    /// Creates a multi-output device that includes both Bluetooth and built-in speakers
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
        
        // Generate a unique UID for this aggregate device
        let uniqueUID = "com.friday.multi-output-\(Date().timeIntervalSince1970)"
        
        // Create aggregate device description
        let subDevices: [[String: Any]] = [
            [
                kAudioSubDeviceUIDKey as String: bluetoothUID,
                kAudioSubDeviceDriftCompensationKey as String: 1
            ],
            [
                kAudioSubDeviceUIDKey as String: builtInUID,
                kAudioSubDeviceDriftCompensationKey as String: 0
            ]
        ]
        
        let description: [String: Any] = [
            kAudioAggregateDeviceNameKey as String: "Friday Multi-Output Device",
            kAudioAggregateDeviceUIDKey as String: uniqueUID,
            kAudioAggregateDeviceSubDeviceListKey as String: subDevices,
            kAudioAggregateDeviceMasterSubDeviceKey as String: builtInUID,
            kAudioAggregateDeviceIsPrivateKey as String: 1
        ]
        
        print("🔧 Creating aggregate device with UID: \(uniqueUID)")
        
        var aggregateDeviceID: AudioDeviceID = 0
        
        // Try to create aggregate device
        if let deviceID = createAggregateDeviceViaPlugin(description: description) {
            aggregateDeviceID = deviceID
        } else {
            print("❌ Aggregate device creation failed")
            return nil
        }
        
        print("✅ Multi-output device created successfully (ID: \(aggregateDeviceID))")
        
        // Give the system time to initialize the device
        print("🔄 Waiting for device to initialize...")
        usleep(2000000) // 2 seconds for system to stabilize
        
        // Verify the device is accessible
        if let deviceName = getDeviceName(aggregateDeviceID) {
            print("✅ Device verification successful: '\(deviceName)'")
            return aggregateDeviceID
        } else {
            print("❌ Device created but not accessible, cleaning up...")
            _ = destroyAggregateDevice(aggregateDeviceID)
            return nil
        }
    }
    
    /// Creates aggregate device via HAL plugin
    private static func createAggregateDeviceViaPlugin(description: [String: Any]) -> AudioDeviceID? {
        print("🔧 Attempting aggregate device creation via HAL plugin...")
        
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioPlugInCreateAggregateDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        // Find the HAL plugin
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
        
        guard pluginStatus == noErr && pluginID != 0 else {
            print("❌ Could not find HAL plugin")
            return nil
        }
        
        print("✅ Found HAL plugin ID: \(pluginID)")
        
        // Create the aggregate device using the plugin
        let cfDesc = description as CFDictionary
        propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
        var aggregateDeviceID: AudioDeviceID = 0
        
        let result = AudioObjectGetPropertyData(
            pluginID,
            &propertyAddress,
            UInt32(MemoryLayout<CFDictionary>.size),
            UnsafeMutableRawPointer(mutating: Unmanaged.passUnretained(cfDesc).toOpaque()),
            &propertySize,
            &aggregateDeviceID
        )
        
        if result == noErr && aggregateDeviceID != 0 {
            print("✅ HAL plugin method succeeded")
            return aggregateDeviceID
        } else {
            print("❌ HAL plugin method failed (error: \(result))")
            return nil
        }
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
    static func enableBluetoothWorkaround() -> Bool {
        print("🔧 Starting Bluetooth workaround setup...")
        
        guard isCurrentOutputDeviceBluetooth() else {
            print("❌ Current device is not Bluetooth, no workaround needed")
            return false
        }
        
        guard let bluetoothDevice = getCurrentDefaultOutputDevice() else {
            print("❌ Could not get current Bluetooth device")
            return false
        }
        
        guard let builtInDevice = builtInOutputID() else {
            print("❌ Could not find built-in speakers for workaround")
            return false
        }
        
        // Store original device for restoration
        originalDefaultDevice = bluetoothDevice
        
        print("🔧 Setting up Bluetooth audio workaround...")
        print("   📱 Bluetooth device ID: \(bluetoothDevice)")
        print("   🔊 Built-in device ID: \(builtInDevice)")
        
        // Try to create multi-output device
        if let multiDevice = createMultiOutputDevice(
            bluetoothDeviceID: bluetoothDevice,
            builtInDeviceID: builtInDevice
        ) {
            multiOutputDevice = multiDevice
            
            // Set multi-output device as default
            if setDefaultOutputDevice(multiDevice) {
                print("🔄 Waiting for audio system to stabilize...")
                usleep(1000000) // 1 second delay
                
                if let currentDevice = getCurrentDefaultOutputDevice(), currentDevice == multiDevice {
                    print("✅ Bluetooth workaround enabled successfully!")
                    return true
                } else {
                    print("❌ Multi-output device was not set as default properly")
                }
            } else {
                print("❌ Failed to set multi-output device as default")
            }
            
                    // Clean up on failure
        _ = destroyAggregateDevice(multiDevice)
        multiOutputDevice = nil
        } else {
            print("❌ Failed to create multi-output device")
        }
        
        // No fallback strategy - preserve user's Bluetooth experience
        print("ℹ️ Multi-output device creation failed")
        print("   Bluetooth audio will remain active for user")
        print("   System audio capture may be limited, but microphone recording will work")
        print("   User experience is preserved - they keep hearing through Bluetooth")
        
        originalDefaultDevice = nil
        return false
    }
    
    /// Disables the Bluetooth workaround and restores original audio device
    static func disableBluetoothWorkaround() -> Bool {
        print("🔧 Disabling Bluetooth workaround...")
        var success = true
        
        // Destroy multi-output device if it was created
        if let multiDevice = multiOutputDevice {
            print("🗑️ Cleaning up multi-output device...")
            if destroyAggregateDevice(multiDevice) {
                print("✅ Multi-output device destroyed successfully")
            } else {
                print("❌ Failed to destroy multi-output device")
                success = false
            }
            multiOutputDevice = nil
        }
        
        // Restore original default device
        if let originalDevice = originalDefaultDevice {
            print("🔄 Restoring original audio device...")
            if setDefaultOutputDevice(originalDevice) {
                print("✅ Original audio device restored successfully")
                
                // Give system time to process the change
                usleep(500000) // 0.5 seconds
                
                // Verify restoration
                if let currentDevice = getCurrentDefaultOutputDevice() {
                    if let deviceName = getDeviceName(currentDevice) {
                        print("✅ Current audio device: '\(deviceName)'")
                    }
                }
            } else {
                print("❌ Failed to restore original audio device")
                success = false
            }
            originalDefaultDevice = nil
        } else {
            print("ℹ️ No original device to restore (no device switching occurred)")
        }
        
        if success {
            print("✅ Bluetooth workaround disabled successfully")
        } else {
            print("⚠️ Bluetooth workaround disabled with some issues")
            print("   You may need to manually check your audio device settings")
        }
        
        return success
    }
    
    /// Logs detailed audio device information for debugging
    static func logDetailedAudioDeviceInfo() {
        print("🎵 Detailed Audio Device Information:")
        print("=====================================")
        
        // Get current default output device
        if let defaultOutputID = getCurrentDefaultOutputDevice() {
            print("\n🔊 Default Output Device:")
            if let deviceName = getDeviceName(defaultOutputID) {
                print("   Name: \(deviceName)")
                print("   ID: \(defaultOutputID)")
                if let uid = getDeviceUID(defaultOutputID) {
                    print("   UID: \(uid)")
                }
                
                // Check transport type
                var transport: UInt32 = 0
                var size = UInt32(MemoryLayout<UInt32>.size)
                var tProp = AudioObjectPropertyAddress(
                    mSelector: kAudioDevicePropertyTransportType,
                    mScope: kAudioObjectPropertyScopeGlobal,
                    mElement: kAudioObjectPropertyElementMain
                )
                
                if AudioObjectGetPropertyData(defaultOutputID, &tProp, 0, nil, &size, &transport) == noErr {
                    let transportTypeString: String
                    switch transport {
                    case kAudioDeviceTransportTypeBuiltIn:
                        transportTypeString = "Built-in"
                    case kAudioDeviceTransportTypeBluetooth:
                        transportTypeString = "Bluetooth"
                    case kAudioDeviceTransportTypeBluetoothLE:
                        transportTypeString = "Bluetooth LE"
                    case kAudioDeviceTransportTypeUSB:
                        transportTypeString = "USB"
                    default:
                        transportTypeString = "Unknown (\(transport))"
                    }
                    print("   Transport: \(transportTypeString)")
                }
            }
        }
        
        // Check if built-in speakers are available
        if let builtInID = builtInOutputID() {
            print("\n🔊 Built-in Output Device:")
            if let deviceName = getDeviceName(builtInID) {
                print("   Name: \(deviceName)")
                print("   ID: \(builtInID)")
            }
        }
        
        print("=====================================")
    }
} 