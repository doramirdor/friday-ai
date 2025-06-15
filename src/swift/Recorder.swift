import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreAudio

@available(macOS 13.0, *)
final class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput, AVAudioRecorderDelegate {
    // PUBLIC CONFIG
    var audioSource: String = "system" // mic | system | both
    
    // PRIVATE STATE
    private var recordingDir: String = FileManager.default.currentDirectoryPath
    private var baseFilename: String = Date().toFileName()
    private var screenStream: SCStream?
    private var systemAudioFile: AVAudioFile?
    private var micRecorder: AVAudioRecorder?
    private var systemRecordingActive = false
    private var micRecordingActive = false
    private var restartAttempts = 0
    private var maxRestartAttempts = 3
    private var isRecordingStopped = false
    
    // Core Audio for Bluetooth recording
    private var audioUnit: AudioUnit?
    private var bluetoothRecordingActive = false
    private var bluetoothAudioFile: AVAudioFile?
    
    // Audio engine for fallback recording
    private var audioEngine = AVAudioEngine()
    private var audioFile: AVAudioFile?
    private var originalOutputDeviceID: AudioDeviceID?
    private var hasBluetoothSwitching = false
    
    override init() {
        super.init()
        parseCLI()
    }
    
    func executeRecordingProcess() {
        Task {
            await startRecording()
        }
    }
    
    // MARK: – Main recording logic
    private func startRecording() async {
        do {
            print("🎤 Starting recording with source: \(audioSource)")
            
            switch audioSource {
            case "mic":
                startMicOnly()
            case "system":
                try await startSystemOnly()
            case "both":
                try await startBoth()
            default:
                ResponseHandler.sendError("Invalid audio source: \(audioSource)")
                return
            }
        } catch {
            print("❌ Recording failed: \(error.localizedDescription)")
            ResponseHandler.sendError(error.localizedDescription)
        }
    }
    
    // MARK: – System audio recording
    private func startSystemOnly() async throws {
        let displays = try await SCShareableContent.current.displays
        guard let display = displays.first else {
            throw NSError(domain: "rec", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "No displays found for system audio capture"
            ])
        }
        
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        try await beginCapture(filter: filter)
    }
    
    private func startBoth() async throws {
        // Start microphone first
        startMicOnly()
        
        // Then start system audio
        let displays = try await SCShareableContent.current.displays
        guard let display = displays.first else {
            throw NSError(domain: "rec", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "No displays found for system audio capture"
            ])
        }
        
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        try await beginCapture(filter: filter)
    }
    
    private func beginCapture(filter: SCContentFilter) async throws {
        let cfg = SCStreamConfiguration()
        cfg.width = 2
        cfg.height = 2
        cfg.capturesAudio = true
        cfg.sampleRate = 44100
        cfg.channelCount = 2
        
        screenStream = SCStream(filter: filter, configuration: cfg, delegate: self)
        try screenStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
        
        let systemPath = urlInDir("_system.wav")
        systemAudioFile = try AVAudioFile(forWriting: systemPath, settings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 2
        ])
        
        try await screenStream?.startCapture()
        systemRecordingActive = true
        print("✅ System audio recording started")
        
        // Send recording started confirmation
        if audioSource == "both" && micRecordingActive && systemRecordingActive {
            ResponseHandler.sendRecordingStarted()
        } else if audioSource == "system" && systemRecordingActive {
            ResponseHandler.sendRecordingStarted()
        }
    }
    
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sb) else { return }
        
        let audioFormat = AVAudioFormat(cmAudioFormatDescription: formatDescription)
        
        let frameCount = CMSampleBufferGetNumSamples(sb)
        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: AVAudioFrameCount(frameCount)) else { return }
        
        pcmBuffer.frameLength = AVAudioFrameCount(frameCount)
        
        // Get the audio buffer list
        var audioBufferList = AudioBufferList()
        var blockBuffer: CMBlockBuffer?
        
        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sb,
            bufferListSizeNeededOut: nil,
            bufferListOut: &audioBufferList,
            bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            blockBufferOut: &blockBuffer
        )
        
        guard status == noErr else { return }
        
        // Copy audio data to PCM buffer
        let channelCount = Int(audioFormat.channelCount)
        for channel in 0..<channelCount {
            if let channelData = pcmBuffer.floatChannelData?[channel],
               let bufferData = audioBufferList.mBuffers.mData {
                let bytesPerFrame = Int(audioFormat.streamDescription.pointee.mBytesPerFrame)
                let bytesToCopy = Int(frameCount) * bytesPerFrame
                memcpy(channelData, bufferData, bytesToCopy)
            }
        }
        
        try? systemAudioFile?.write(from: pcmBuffer)
    }
    
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("System stream stopped: \(error.localizedDescription)")
        
        let errorDescription = error.localizedDescription.lowercased()
        let isUserStopped = errorDescription.contains("user") && errorDescription.contains("stop")
        
        if !isUserStopped && systemRecordingActive && !isRecordingStopped && restartAttempts < maxRestartAttempts {
            restartAttempts += 1
            print("⚠️ System stream stopped unexpectedly - attempting restart #\(restartAttempts)/\(maxRestartAttempts)")
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                if self.systemRecordingActive && !self.isRecordingStopped && (self.audioSource == "system" || self.audioSource == "both") {
                    print("🔄 Restarting system audio capture...")
                    self.restartSystemAudio()
                }
            }
        } else {
            systemRecordingActive = false
            finishIfPossible()
        }
    }
    
    private func restartSystemAudio() {
        Task {
            do {
                let displays = try await SCShareableContent.current.displays
                guard let display = displays.first else { return }
                
                let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
                try await beginCapture(filter: filter)
                print("✅ System audio restarted successfully")
            } catch {
                print("❌ Failed to restart system audio: \(error.localizedDescription)")
                systemRecordingActive = false
                finishIfPossible()
            }
        }
    }
    
    // MARK: – Microphone recording
    private func startMicOnly() {
        AudioDeviceManager.logAudioDiagnostics()
        
        // Check for Bluetooth input device
        if AudioDeviceManager.isCurrentInputDeviceBluetooth() {
            print("🎧 Bluetooth microphone detected - using optimized recording approach...")
            let currentLevel = AudioDeviceManager.getMicrophoneInputLevel() ?? 0
            if currentLevel < 50 {
                print("🔊 Increasing microphone level from \(currentLevel)% to 75%")
                _ = AudioDeviceManager.setMicrophoneInputLevel(75)
            }
            
            startBluetoothRecording()
            return
        }
        
        // Use standard AVAudioRecorder for non-Bluetooth devices
        let micPath = urlInDir("_mic.wav")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false
        ]
        
        do {
            micRecorder = try AVAudioRecorder(url: micPath, settings: settings)
            micRecorder?.delegate = self
            micRecorder?.isMeteringEnabled = true
            
            guard micRecorder?.record() == true else {
                throw NSError(domain: "rec", code: -1, userInfo: [
                    NSLocalizedDescriptionKey: "Failed to start recording - check microphone permissions"
                ])
            }
            
            micRecordingActive = true
            print("✅ Microphone recording started")
            
            if audioSource == "mic" {
                ResponseHandler.sendRecordingStarted()
            } else if audioSource == "both" && systemRecordingActive {
                ResponseHandler.sendRecordingStarted()
            }
        } catch {
            print("❌ Standard microphone recording failed: \(error.localizedDescription)")
            ResponseHandler.sendMicrophoneError("Microphone recording failed: \(error.localizedDescription). Check microphone permissions in System Settings.")
        }
    }
    
    // MARK: – Bluetooth Recording with AVAudioEngine
    private func startBluetoothRecording() {
        print("🎧 Starting Bluetooth microphone recording with AVAudioEngine...")
        
        let micPath = urlInDir("_mic.wav")
        
        do {
            // Use AVAudioEngine for better Bluetooth compatibility
            let engine = AVAudioEngine()
            let inputNode = engine.inputNode
            
            // Use lower sample rate for Bluetooth compatibility
            let recordingFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, 
                                              sampleRate: 16000, 
                                              channels: 1, 
                                              interleaved: false)!
            
            let audioFile = try AVAudioFile(forWriting: micPath, settings: recordingFormat.settings)
            self.bluetoothAudioFile = audioFile
            
            // Install tap on input node
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputNode.outputFormat(forBus: 0)) { buffer, time in
                do {
                    try audioFile.write(from: buffer)
                } catch {
                    print("❌ Error writing audio buffer: \(error)")
                }
            }
            
            try engine.start()
            self.audioEngine = engine
            bluetoothRecordingActive = true
            print("✅ Bluetooth microphone recording started with AVAudioEngine")
            
            if audioSource == "mic" {
                ResponseHandler.sendRecordingStarted()
            } else if audioSource == "both" && systemRecordingActive {
                ResponseHandler.sendRecordingStarted()
            }
            
        } catch {
            print("❌ Bluetooth recording failed: \(error.localizedDescription)")
            
            // Fallback to standard recording
            print("🔄 Falling back to standard microphone recording...")
            startStandardMicRecording()
        }
    }
    
    private func startStandardMicRecording() {
        let micPath = urlInDir("_mic.wav")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false
        ]
        
        do {
            micRecorder = try AVAudioRecorder(url: micPath, settings: settings)
            micRecorder?.delegate = self
            micRecorder?.isMeteringEnabled = true
            
            guard micRecorder?.record() == true else {
                throw NSError(domain: "rec", code: -1, userInfo: [
                    NSLocalizedDescriptionKey: "Failed to start standard recording"
                ])
            }
            
            micRecordingActive = true
            print("✅ Standard microphone recording started")
            
            if audioSource == "mic" {
                ResponseHandler.sendRecordingStarted()
            } else if audioSource == "both" && systemRecordingActive {
                ResponseHandler.sendRecordingStarted()
            }
        } catch {
            print("❌ Standard microphone recording failed: \(error.localizedDescription)")
            ResponseHandler.sendMicrophoneError("All microphone recording methods failed: \(error.localizedDescription)")
        }
    }
    
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        micRecordingActive = false
        print("🎤 Microphone recording finished successfully: \(flag)")
        finishIfPossible()
    }
    
    // MARK: – Combine & finish
    private func finishIfPossible() {
        guard (audioSource == "mic" && !micRecordingActive && !bluetoothRecordingActive) ||
              (audioSource == "system" && !systemRecordingActive) ||
              (audioSource == "both" && !micRecordingActive && !bluetoothRecordingActive && !systemRecordingActive) else { 
            return 
        }
        
        print("🔄 All recording sources stopped, beginning audio processing...")
        
        // Restore original audio device if needed
        restoreOriginalAudioDevice()
        
        // Process audio files based on source
        if audioSource == "both" {
            combineSystemAndMic()
        } else if audioSource == "system" {
            convertWavToMp3(wav: urlInDir("_system.wav"))
        } else {
            convertWavToMp3(wav: urlInDir("_mic.wav"))
        }
    }
    
    private func restoreOriginalAudioDevice() {
        if hasBluetoothSwitching, let originalDevice = originalOutputDeviceID {
            print("🔄 Restoring original audio device...")
            let _ = AudioDeviceManager.setDefaultOutputDevice(originalDevice)
            hasBluetoothSwitching = false
        }
    }
    
    private func combineSystemAndMic() {
        let systemWav = urlInDir("_system.wav")
        let micWav = urlInDir("_mic.wav")
        let combinedWav = urlInDir("_combined.wav")
        
        print("🔀 Combining system and microphone audio...")
        
        // Check if both files exist
        let fileManager = FileManager.default
        let systemExists = fileManager.fileExists(atPath: systemWav.path)
        let micExists = fileManager.fileExists(atPath: micWav.path)
        
        print("📁 System audio file exists: \(systemExists), size: \(getFileSize(systemWav)) bytes")
        print("📁 Microphone file exists: \(micExists), size: \(getFileSize(micWav)) bytes")
        
        if !systemExists && !micExists {
            ResponseHandler.sendError("No audio files were created during recording")
            return
        }
        
        // If only one file exists, just convert that one
        if !systemExists && micExists {
            print("🎤 Only microphone audio available, converting...")
            convertWavToMp3(wav: micWav)
            return
        }
        
        if systemExists && !micExists {
            print("🔊 Only system audio available, converting...")
            convertWavToMp3(wav: systemWav)
            return
        }
        
        // Both files exist, combine them
        let ffmpeg = findFFmpegPath()
        guard let ffmpegPath = ffmpeg else {
            print("⚠️ FFmpeg not found, using system audio only")
            convertWavToMp3(wav: systemWav)
            return
        }
        
        let task = Process()
        task.executableURL = URL(fileURLWithPath: ffmpegPath)
        task.arguments = [
            "-y", "-i", systemWav.path, "-i", micWav.path,
            "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2",
            combinedWav.path
        ]
        
        do {
            try task.run()
            task.waitUntilExit()
            
            if task.terminationStatus == 0 {
                print("✅ Audio files combined successfully")
                convertWavToMp3(wav: combinedWav)
            } else {
                print("❌ FFmpeg failed with status: \(task.terminationStatus)")
                print("🔄 Falling back to system audio only")
                convertWavToMp3(wav: systemWav)
            }
        } catch {
            print("❌ Failed to run FFmpeg: \(error.localizedDescription)")
            print("🔄 Falling back to system audio only")
            convertWavToMp3(wav: systemWav)
        }
    }
    
    private func convertWavToMp3(wav: URL) {
        print("🎵 Converting audio to MP3 format...")
        
        let mp3 = wav.deletingPathExtension().appendingPathExtension("mp3")
        
        guard let ffmpegPath = findFFmpegPath() else {
            print("⚠️ FFmpeg not found, returning WAV file")
            ResponseHandler.sendRecordingStopped(path: wav.path)
            return
        }
        
        let task = Process()
        task.executableURL = URL(fileURLWithPath: ffmpegPath)
        task.arguments = ["-y", "-i", wav.path, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3.path]
        
        do {
            try task.run()
            task.waitUntilExit()
            
            if task.terminationStatus == 0 {
                print("✅ MP3 conversion successful: \(mp3.path)")
                ResponseHandler.sendRecordingStopped(path: mp3.path)
            } else {
                print("❌ MP3 conversion failed with status: \(task.terminationStatus)")
                print("🔄 Returning original WAV file")
                ResponseHandler.sendRecordingStopped(path: wav.path)
            }
        } catch {
            print("❌ MP3 conversion failed: \(error.localizedDescription)")
            print("🔄 Returning original WAV file")
            ResponseHandler.sendRecordingStopped(path: wav.path)
        }
    }
    
    private func findFFmpegPath() -> String? {
        let possiblePaths = [
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg"
        ]
        
        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }
        
        return nil
    }
    
    private func getFileSize(_ url: URL) -> Int64 {
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            return attributes[.size] as? Int64 ?? 0
        } catch {
            return 0
        }
    }
    
    // MARK: – CLI parsing
    private func parseCLI() {
        let args = CommandLine.arguments
        if let idx = args.firstIndex(of: "--record"), idx + 1 < args.count {
            recordingDir = (args[idx + 1] as NSString).expandingTildeInPath
        }
        if let idx = args.firstIndex(of: "--filename"), idx + 1 < args.count {
            baseFilename = args[idx + 1]
        }
        if let idx = args.firstIndex(of: "--source"), idx + 1 < args.count {
            let src = args[idx + 1].lowercased()
            if ["mic", "system", "both"].contains(src) {
                audioSource = src
            }
        }
    }
    
    private func urlInDir(_ suffix: String) -> URL {
        URL(fileURLWithPath: recordingDir).appendingPathComponent(baseFilename + suffix)
    }
    
    // MARK: – Stop recording
    func stopRecording() {
        print("🛑 Stopping recording...")
        isRecordingStopped = true
        
        // Stop microphone recording
        if micRecordingActive {
            micRecorder?.stop()
            micRecordingActive = false
        }
        
        // Stop Bluetooth recording if active
        if bluetoothRecordingActive {
            bluetoothRecordingActive = false
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        
        // Stop system audio recording
        if systemRecordingActive {
            Task {
                try? await screenStream?.stopCapture()
                systemRecordingActive = false
                print("🔄 Processing final recording...")
                finishIfPossible()
            }
        } else {
            print("🔄 Processing final recording...")
            finishIfPossible()
        }
    }
    
    deinit {
        // Emergency cleanup
        if hasBluetoothSwitching, let originalDevice = originalOutputDeviceID {
            print("🚨 Emergency audio device restoration...")
            let _ = AudioDeviceManager.setDefaultOutputDevice(originalDevice)
        }
        
        // Clean up audio engine
        if bluetoothRecordingActive {
            audioEngine.stop()
        }
    }
}

// MARK: – Date extension
extension Date {
    func toFileName() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        return formatter.string(from: self)
    }
} 