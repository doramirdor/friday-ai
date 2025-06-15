import Foundation
import CoreAudio
import AVFoundation

/// Utility class for managing and identifying audio devices on macOS.
final class AudioDeviceManager {
    // MARK: – Device enumeration
    static func listAudioInputDevices() -> [String] {
        var deviceNames: [String] = []

        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)

        var dataSize: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &dataSize) == noErr else { return [] }

        let deviceCount = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &dataSize, &deviceIDs) == noErr else { return [] }

        for id in deviceIDs {
            if hasInput(id) {
                deviceNames.append(name(of: id))
            }
        }
        return deviceNames
    }

    static func getDefaultInputDeviceName() -> String? { 
        listAudioInputDevices().first 
    }
    
    static func isMicrophoneAvailable() -> Bool { 
        !listAudioInputDevices().isEmpty 
    }

    // MARK: – Bluetooth detection
    /// Returns true if the current input device transport is Bluetooth.
    static func isCurrentInputDeviceBluetooth() -> Bool {
        guard let deviceID = defaultInputID() else { return false }
        return isBluetoothDevice(deviceID)
    }
    
    /// Returns true if the current output device transport is Bluetooth.
    static func isCurrentOutputDeviceBluetooth() -> Bool {
        guard let deviceID = getCurrentDefaultOutputDevice() else { return false }
        return isBluetoothDevice(deviceID)
    }
    
    private static func isBluetoothDevice(_ deviceID: AudioDeviceID) -> Bool {
        var transport: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyTransportType,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        
        guard AudioObjectGetPropertyData(deviceID, &addr, 0, nil, &size, &transport) == noErr else {
            return false
        }
        
        return transport == kAudioDeviceTransportTypeBluetooth
    }

    // MARK: – Volume control
    static func getMicrophoneInputLevel() -> Float? {
        guard let devID = defaultInputID() else { return nil }
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain)
        var vol: Float32 = 0
        var size = UInt32(MemoryLayout<Float32>.size)
        guard AudioObjectGetPropertyData(devID, &addr, 0, nil, &size, &vol) == noErr else { return nil }
        return vol * 100
    }

    static func setMicrophoneInputLevel(_ level0to100: Float) -> Bool {
        guard let devID = defaultInputID() else { return false }
        var value = Float32(max(0, min(level0to100, 100)) / 100)
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain)
        var size = UInt32(MemoryLayout<Float32>.size)
        return AudioObjectSetPropertyData(devID, &addr, 0, nil, size, &value) == noErr
    }

    // MARK: – Diagnostics
    static func logAudioDiagnostics() {
        print("🎤 Audio diagnostics:")
        for name in listAudioInputDevices() { 
            print("  • \(name)") 
        }
        if let vol = getMicrophoneInputLevel() { 
            print("  Mic level: \(String(format: "%.0f", vol))%") 
        }
        print("  Input over Bluetooth: \(isCurrentInputDeviceBluetooth())")
        print("  Output over Bluetooth: \(isCurrentOutputDeviceBluetooth())")
    }

    // MARK: – Device management
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
            
            // Check if device has OUTPUT streams
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
            
            if result == noErr && bufferList.mNumberBuffers > 0 {
                let deviceName = name(of: id)
                if deviceName.lowercased().contains("microphone") || 
                   deviceName.lowercased().contains("mic") {
                    continue
                }
                print("✅ Found built-in output device: '\(deviceName)' (ID: \(id))")
                return id
            }
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
            usleep(500000) // 0.5 second delay
            return true
        } else {
            print("❌ Failed to set default output device (error: \(result))")
            return false
        }
    }

    // MARK: – Private helpers
    private static func defaultInputID() -> AudioDeviceID? {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var devID: AudioDeviceID = 0
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        return AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &devID) == noErr ? devID : nil
    }

    private static func name(of id: AudioDeviceID) -> String {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceNameCFString,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var cfName: CFString = "" as CFString
        var size = UInt32(MemoryLayout<CFString>.size)
        return AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &cfName) == noErr ? (cfName as String) : "Unknown"
    }

    private static func hasInput(_ id: AudioDeviceID) -> Bool {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr else { return false }
        let bufferList = UnsafeMutablePointer<AudioBufferList>.allocate(capacity: 1)
        defer { bufferList.deallocate() }
        return AudioObjectGetPropertyData(id, &addr, 0, nil, &size, bufferList) == noErr && bufferList.pointee.mNumberBuffers > 0
    }
} 