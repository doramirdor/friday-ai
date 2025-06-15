import Foundation
import AVFoundation

/// Convenience wrapper for microphone permissions on macOS & iOS.
enum AudioPermissions {

    /// Ask the user for mic access (or return the cached decision).
    /// - Parameter completion: `true` when the app is authorized to use the mic.
    static func requestMicrophoneAccess(_ completion: @escaping (Bool) -> Void) {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)

        switch status {
        case .authorized:
            completion(true)

        case .denied, .restricted:
            completion(false)

        case .notDetermined:
            // This shows the system alert.
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                DispatchQueue.main.async { completion(granted) }
            }

        @unknown default:
            completion(false)
        }
    }

    /// Synchronous check (no UI). Useful for gating UI elements.
    static func hasMicrophonePermission() -> Bool {
        return AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
    }
    
    /// Check microphone permission status without requesting
    static func checkMicrophonePermission() -> Bool {
        return hasMicrophonePermission()
    }
    
    /// Get the current authorization status as a string
    static func getMicrophonePermissionStatus() -> String {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        switch status {
        case .authorized:
            return "authorized"
        case .denied:
            return "denied"
        case .restricted:
            return "restricted"
        case .notDetermined:
            return "notDetermined"
        @unknown default:
            return "unknown"
        }
    }
}

/// Legacy compatibility wrapper to maintain existing API
enum PermissionsRequester {
    
    /// Request microphone access using the new AudioPermissions API
    static func requestMicrophoneAccess(_ completion: @escaping (Bool) -> Void) {
        AudioPermissions.requestMicrophoneAccess(completion)
    }
    
    /// Check microphone permission status
    static func checkMicrophonePermission() -> Bool {
        return AudioPermissions.checkMicrophonePermission()
    }
    
    /// Audio-only access request (same as microphone access)
    static func requestAudioOnlyAccess(_ completion: @escaping (Bool) -> Void) {
        AudioPermissions.requestMicrophoneAccess(completion)
    }
    
    /// Check audio-only permissions and return status
    static func checkAllPermissions() -> [String: Bool] {
        return [
            "microphone": AudioPermissions.checkMicrophonePermission(),
            "microphone_status": AudioPermissions.getMicrophonePermissionStatus() == "authorized"
        ]
    }
    
    /// Request audio-only permissions
    static func requestAllPermissions(completion: @escaping ([String: Bool]) -> Void) {
        AudioPermissions.requestMicrophoneAccess { micGranted in
            completion([
                "microphone": micGranted,
                "microphone_status": micGranted
            ])
        }
    }
} 