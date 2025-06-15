import Foundation

/// Handles JSON response formatting and process communication
enum ResponseHandler {
    
    /// Send a JSON response to stdout and optionally exit the process
    static func send(_ data: [String: Any], exitProcess: Bool = true) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
                fflush(stdout)
            }
        } catch {
            print("{\"code\": \"ERROR\", \"error\": \"Failed to serialize JSON response\"}")
            fflush(stdout)
        }
        
        if exitProcess {
            exit(0)
        }
    }
    
    /// Send a success response with optional data
    static func sendSuccess(_ message: String = "Success", data: [String: Any]? = nil, exitProcess: Bool = true) {
        var response: [String: Any] = [
            "code": "SUCCESS",
            "message": message
        ]
        
        if let additionalData = data {
            for (key, value) in additionalData {
                response[key] = value
            }
        }
        
        send(response, exitProcess: exitProcess)
    }
    
    /// Send an error response
    static func sendError(_ error: String, code: String = "ERROR", exitProcess: Bool = true) {
        send([
            "code": code,
            "error": error
        ], exitProcess: exitProcess)
    }
    
    /// Send a status update without exiting
    static func sendStatus(_ status: String, data: [String: Any]? = nil) {
        var response: [String: Any] = [
            "code": "STATUS",
            "status": status
        ]
        
        if let additionalData = data {
            for (key, value) in additionalData {
                response[key] = value
            }
        }
        
        send(response, exitProcess: false)
    }
    
    /// Send recording started confirmation
    static func sendRecordingStarted(path: String? = nil) {
        var data: [String: Any] = ["code": "RECORDING_STARTED"]
        if let recordingPath = path {
            data["path"] = recordingPath
        }
        send(data, exitProcess: false)
    }
    
    /// Send recording stopped confirmation with file path
    static func sendRecordingStopped(path: String) {
        send([
            "code": "RECORDING_STOPPED",
            "path": path
        ], exitProcess: true)
    }
    
    /// Send microphone error
    static func sendMicrophoneError(_ error: String) {
        send([
            "code": "MIC_ERROR",
            "error": error
        ], exitProcess: false)
    }
    
    /// Send system audio error
    static func sendSystemAudioError(_ error: String) {
        send([
            "code": "SYSTEM_ERROR",
            "error": error
        ], exitProcess: false)
    }
    
    /// Send permission error
    static func sendPermissionError(_ error: String) {
        send([
            "code": "PERMISSION_ERROR",
            "error": error
        ], exitProcess: false)
    }
} 