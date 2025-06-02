import Foundation

// Main entry point for the Swift Recorder
print("🎙️ Starting Friday Audio Recorder...")

if #available(macOS 13.0, *) {
    let recorder = RecorderCLI()
    recorder.executeRecordingProcess()
} else {
    print("❌ This recorder requires macOS 13.0 or later")
    exit(1)
} 