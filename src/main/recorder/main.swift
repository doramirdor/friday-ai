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

// Setup signal handling
setupSignalHandlers()

// Kick off the recorder
let recorder = RecorderCLI()
globalRecorder = recorder
recorder.executeRecordingProcess()

// Keep the main thread alive for recording
// The recorder will exit via ResponseHandler.send() when recording is complete
RunLoop.main.run()
