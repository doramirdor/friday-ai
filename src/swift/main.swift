import Foundation

print("DEBUG: Swift recorder starting")
print("DEBUG: CLI args  →", CommandLine.arguments)

// Global recorder instance for signal handling
var globalRecorder: RecorderCLI?

// Set up signal handling for clean shutdown
func setupSignalHandlers() {
    let signalQueue = DispatchQueue(label: "signal.queue")
    
    let source = DispatchSource.makeSignalSource(signal: SIGINT, queue: signalQueue)
    source.setEventHandler {
        print("🛑 Received SIGINT - stopping recording gracefully...")
        globalRecorder?.stopRecording()
    }
    source.resume()
    
    let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: signalQueue)
    termSource.setEventHandler {
        print("🛑 Received SIGTERM - stopping recording gracefully...")
        globalRecorder?.stopRecording()
    }
    termSource.resume()
    
    // Block default signal handling
    signal(SIGINT, SIG_IGN)
    signal(SIGTERM, SIG_IGN)
}

// Check for permission check flag
func handlePermissionCheck() {
    let args = CommandLine.arguments
    if args.contains("--check-permissions") {
        print("🔍 Checking audio permissions...")
        
        let permissions = PermissionsRequester.checkAllPermissions()
        var response: [String: Any] = ["code": "PERMISSIONS_STATUS"]
        
        for (key, value) in permissions {
            response[key] = value ? "GRANTED" : "DENIED"
        }
        
        // Add detailed permission status
        response["microphone_permission_status"] = AudioPermissions.getMicrophonePermissionStatus()
        
        // Check microphone volume level
        if let micLevel = AudioDeviceManager.getMicrophoneInputLevel() {
            response["microphone_level"] = String(format: "%.0f%%", micLevel)
            print("Microphone input volume: \(String(format: "%.0f", micLevel))%")
        }
        
        // Log audio diagnostics
        AudioDeviceManager.logAudioDiagnostics()
        
        ResponseHandler.send(response, exitProcess: true)
        return
    }
}

// Setup signal handling
setupSignalHandlers()

// Handle permission checks
handlePermissionCheck()

// Check for help flag
if CommandLine.arguments.contains("--help") || CommandLine.arguments.contains("-h") {
    print("""
    Friday Audio Recorder - macOS Native Recording
    
    Usage:
        Recorder [options]
    
    Options:
        --record <directory>    Directory to save recordings (default: current directory)
        --filename <name>       Base filename for recordings (default: timestamp)
        --source <source>       Audio source: mic, system, or both (default: system)
        --check-permissions     Check microphone and screen recording permissions
        --help, -h             Show this help message
    
    Examples:
        Recorder --record ~/Documents/Recordings --source both --filename meeting
        Recorder --source mic --filename interview
        Recorder --check-permissions
    
    Sources:
        mic     - Microphone only (requires microphone permission)
        system  - System audio only (requires screen recording permission - may not work in audio-only mode)
        both    - Microphone + system audio (requires microphone permission - system audio may be limited)
    
    Output:
        The recorder outputs JSON status messages to stdout:
        - RECORDING_STARTED: Recording has begun
        - RECORDING_STOPPED: Recording finished with file path
        - ERROR: Recording failed with error message
        - PERMISSIONS_STATUS: Permission check results
    """)
    exit(0)
}

// Kick off the recorder
if #available(macOS 13.0, *) {
    let recorder = RecorderCLI()
    globalRecorder = recorder
    recorder.executeRecordingProcess()
    
    // Keep the main thread alive for recording
    // The recorder will exit via ResponseHandler.send() when recording is complete
    RunLoop.main.run()
} else {
    ResponseHandler.sendError("macOS 13.0 or later is required for audio recording", code: "UNSUPPORTED_OS")
} 