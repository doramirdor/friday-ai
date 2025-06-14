import CoreGraphics
import Foundation
import AVFoundation

enum PermissionsRequester {
    static func requestScreenCaptureAccess(_ completion: @escaping (Bool) -> Void) {
        if CGPreflightScreenCaptureAccess() {
            completion(true)
            return
        }
        DispatchQueue.global().async {
            let granted = CGRequestScreenCaptureAccess()
            // Give the user a second to hit "Open System Settings" etc.
            DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
                completion(granted || CGPreflightScreenCaptureAccess())
            }
        }
    }
    
    // MARK: - Audio-Only Permissions (macOS) - Prevents Bluetooth disconnection
    static func requestMicrophoneAccess(_ completion: @escaping (Bool) -> Void) {
        // On macOS, microphone permission is handled automatically when accessing audio
        // We can test by trying to create an AVAudioRecorder
        let tempURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("test.wav")
        
        do {
            let testRecorder = try AVAudioRecorder(url: tempURL, settings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 1
            ])
            
            // If we can create and prepare the recorder, permission is granted
            if testRecorder.prepareToRecord() {
                completion(true)
            } else {
                completion(false)
            }
        } catch {
            // If creation fails, permission is likely denied
            completion(false)
        }
        
        // Clean up test file
        try? FileManager.default.removeItem(at: tempURL)
    }
    
    static func checkMicrophonePermission() -> Bool {
        // Test microphone access by attempting to create a recorder
        let tempURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("test.wav")
        
        do {
            let testRecorder = try AVAudioRecorder(url: tempURL, settings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 1
            ])
            let hasPermission = testRecorder.prepareToRecord()
            try? FileManager.default.removeItem(at: tempURL)
            return hasPermission
        } catch {
            return false
        }
    }
    
    // Check if we can access system audio without screen recording (limited capability)
    static func checkSystemAudioAccess() -> Bool {
        // System audio access through existing screen permissions
        return CGPreflightScreenCaptureAccess()
    }
    
    // Combined audio permissions check (microphone + optional system audio)
    static func requestAudioOnlyAccess(_ completion: @escaping (Bool) -> Void) {
        requestMicrophoneAccess { micGranted in
            if micGranted {
                // Microphone permission is sufficient for audio-only mode
                completion(true)
            } else {
                completion(false)
            }
        }
    }
}
