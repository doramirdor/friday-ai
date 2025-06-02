import AVFoundation
import ScreenCaptureKit
import Foundation
import CoreAudio

// Global signal handler
var recorderInstance: RecorderCLI?
func handleInterruptSignal(signal: Int32) {
    print("DEBUG: Received interrupt signal: \(signal)")
    if signal == SIGINT {
        print("Initiating graceful shutdown...")
        if let recorder = recorderInstance {
            if recorder.audioSource == "both" {
                // For combined recording, we need to ensure both components are stopped
                // and then combine the recordings
                recorder.stopAndCombineRecordings()
            } else {
                RecorderCLI.terminateRecording()
                recorder.convertAndFinish()
            }
        }
    }
}

@available(macOS 13.0, *)
class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput, AVAudioRecorderDelegate, AVAudioPlayerDelegate {
    static var screenCaptureStream: SCStream?
    static var audioFileForRecording: AVAudioFile?
    var contentEligibleForSharing: SCShareableContent?
    let semaphoreRecordingStopped = DispatchSemaphore(value: 0)
    var recordingPath: String?
    var recordingFilename: String?
    var streamFunctionCalled = false
    var streamFunctionTimeout: TimeInterval = 2.0
    var tempWavPath: String?
    var finalMp3Path: String?
    var audioSource: String = "system"
    var microphoneRecorder: AVAudioRecorder?
    
    // For combined recording
    var audioEngine: AVAudioEngine?
    var systemAudioFormat: AVAudioFormat?
    var micRecordingActive = false
    var systemRecordingActive = false
    var systemTempWavPath: String?
    var micTempWavPath: String?
    var combinedTempWavPath: String?
    var recordingStartTime: Date?
    var isInitialized = false
    
    // Add state tracking for pause/resume
    private var isPaused = false
    private var systemAudioPauseTime: Date?
    private var microphonePauseTime: Date?
    private var totalPausedDuration: TimeInterval = 0
    
    // Add properties for speaker detection
    private var enableSpeakerDiarization = false
    private var minSpeakerCount = 1
    private var maxSpeakerCount = 10
    
    // Function to check if recording is active
    var isRecordingActive: Bool {
        if audioSource == "both" {
            return micRecordingActive && systemRecordingActive
        } else if audioSource == "mic" {
            return micRecordingActive
        } else {
            return systemRecordingActive
        }
    }
    
    override init() {
        super.init()
        recorderInstance = self
        processCommandLineArguments()
    }

    func processCommandLineArguments() {
        print("DEBUG: Processing command line arguments")
        let arguments = CommandLine.arguments
        
        print("DEBUG: Arguments count: \(arguments.count)")
        for (index, arg) in arguments.enumerated() {
            print("DEBUG: Arg[\(index)]: \(arg)")
        }
        
        // Add speaker diarization arguments
        if arguments.contains("--enable-speaker-diarization") {
            enableSpeakerDiarization = true
            print("Speaker diarization enabled")
            
            // Get min speakers if specified
            if let minIndex = arguments.firstIndex(of: "--min-speakers"),
               minIndex + 1 < arguments.count,
               let minCount = Int(arguments[minIndex + 1]) {
                minSpeakerCount = minCount
                print("Minimum speaker count set to: \(minCount)")
            }
            
            // Get max speakers if specified
            if let maxIndex = arguments.firstIndex(of: "--max-speakers"),
               maxIndex + 1 < arguments.count,
               let maxCount = Int(arguments[maxIndex + 1]) {
                maxSpeakerCount = maxCount
                print("Maximum speaker count set to: \(maxCount)")
            }
        }
        
        // Handle pause/resume commands first
        if arguments.contains("--pause") {
            pauseRecording()
            return
        }
        
        if arguments.contains("--resume") {
            resumeRecording()
            return
        }
        
        guard arguments.contains("--record") else {
            print("DEBUG: No --record argument found")
            if arguments.contains("--check-permissions") {
                print("DEBUG: Checking permissions")
                PermissionsRequester.requestScreenCaptureAccess { granted in
                    if granted {
                        print("DEBUG: Permission granted")
                        ResponseHandler.returnResponse(["code": "PERMISSION_GRANTED"])
                    } else {
                        print("DEBUG: Permission denied")
                        ResponseHandler.returnResponse(["code": "PERMISSION_DENIED"])
                    }
                }
            } else {
                print("DEBUG: Invalid arguments")
                ResponseHandler.returnResponse(["code": "INVALID_ARGUMENTS"])
            }
            return
        }

        if let recordIndex = arguments.firstIndex(of: "--record"), recordIndex + 1 < arguments.count {
            recordingPath = arguments[recordIndex + 1]
            
            // Verify recording directory exists and is writable
            guard let path = recordingPath, FileManager.default.fileExists(atPath: path) else {
                ResponseHandler.returnResponse(["code": "INVALID_PATH", "error": "Recording directory does not exist"])
                return
            }
            
            var isDirectory: ObjCBool = false
            if !FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) || !isDirectory.boolValue {
                ResponseHandler.returnResponse(["code": "INVALID_PATH", "error": "Recording path is not a directory"])
                return
            }
            
            // Test if we can write to the directory
            let testFile = "\(path)/test_write_permission.tmp"
            do {
                try "test".write(toFile: testFile, atomically: true, encoding: .utf8)
                try FileManager.default.removeItem(atPath: testFile)
            } catch {
                ResponseHandler.returnResponse([
                    "code": "DIRECTORY_NOT_WRITABLE", 
                    "error": "Cannot write to recording directory: \(error.localizedDescription)"
                ])
                return
            }
        } else {
            ResponseHandler.returnResponse(["code": "NO_PATH_SPECIFIED"])
        }

        if let filenameIndex = arguments.firstIndex(of: "--filename"), filenameIndex + 1 < arguments.count {
            recordingFilename = arguments[filenameIndex + 1]
            // Remove any extension from the filename if present
            if let dotIndex = recordingFilename?.lastIndex(of: ".") {
                recordingFilename = String(recordingFilename![..<dotIndex])
            }
            
            // For combined recording, create unique filenames for each component
            if audioSource == "both" {
                let baseFilename = recordingFilename ?? Date().toFormattedFileName()
                systemTempWavPath = "\(recordingPath!)/\(baseFilename)_system.wav"
                micTempWavPath = "\(recordingPath!)/\(baseFilename)_mic.wav"
                combinedTempWavPath = "\(recordingPath!)/\(baseFilename).wav"
                finalMp3Path = "\(recordingPath!)/\(baseFilename).mp3"
                
                print("Combined recording paths:")
                print("- System: \(systemTempWavPath ?? "nil")")
                print("- Mic: \(micTempWavPath ?? "nil")")
                print("- Combined: \(combinedTempWavPath ?? "nil")")
                print("- Final MP3: \(finalMp3Path ?? "nil")")
            }
        }
        
        // Check if audio source is specified
        if let sourceIndex = arguments.firstIndex(of: "--source"), sourceIndex + 1 < arguments.count {
            let source = arguments[sourceIndex + 1].lowercased()
            if source == "mic" || source == "system" || source == "both" {
                audioSource = source
                print("Using audio source: \(audioSource)")
            } else {
                print("Invalid audio source: \(source). Using default: system")
            }
        }
    }

    // ... existing code ...
    
    func setupMicrophoneForCombinedRecording() throws {
        print("Setting up microphone for combined recording...")
        
        // Log audio device info
        print("Checking audio input devices on macOS:")
        AudioDeviceManager.logAudioDiagnostics()
        
        // Check and adjust microphone volume if needed
        if let micVolume = AudioDeviceManager.getMicrophoneInputLevel() {
            print("Microphone input volume: \(micVolume)%")
            if micVolume < 50 {
                print("⚠️ Warning: Microphone volume is low, attempting to adjust...")
                if AudioDeviceManager.setMicrophoneInputLevel(80.0) {
                    print("✅ Adjusted microphone volume to 80%")
                }
            }
        }
        
        // Configure recording settings with higher quality
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 48000.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.max.rawValue,
            AVLinearPCMBitDepthKey: 24,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false
        ]
        
        guard let micPath = micTempWavPath else {
            print("❌ Mic temp path not set")
            throw NSError(domain: "RecorderCLI", code: 101, userInfo: [NSLocalizedDescriptionKey: "Mic temp path not set"])
        }
        
        // First check if the file already exists and remove it if it does
        if FileManager.default.fileExists(atPath: micPath) {
            try FileManager.default.removeItem(atPath: micPath)
            print("Removed existing microphone recording file at \(micPath)")
        }
        
        // Create recorder with retry mechanism
        var retryCount = 0
        var lastError: Error?
        var recorderInitialized = false
        
        while retryCount < 3 && !recorderInitialized {
            do {
                let recorder = try AVAudioRecorder(url: URL(fileURLWithPath: micPath), settings: settings)
                recorder.delegate = self
                recorder.isMeteringEnabled = true
                
                if recorder.prepareToRecord() {
                    if recorder.record() {
                        microphoneRecorder = recorder
                        print("✅ Microphone recording started successfully (attempt \(retryCount + 1))")
                        micRecordingActive = true
                        recorderInitialized = true
                        
                        // Start monitoring audio levels
                        startAudioLevelMonitoring()
                        break
                    } else {
                        print("❌ Failed to start recording on attempt \(retryCount + 1)")
                    }
                } else {
                    print("❌ Failed to prepare recording on attempt \(retryCount + 1)")
                }
                
                retryCount += 1
                if !recorderInitialized {
                    print("Waiting before retry...")
                    Thread.sleep(forTimeInterval: 1.0)
                }
            } catch {
                lastError = error
                print("❌ Error initializing recorder on attempt \(retryCount + 1): \(error.localizedDescription)")
                retryCount += 1
                Thread.sleep(forTimeInterval: 1.0)
            }
        }
        
        if !recorderInitialized {
            let error = lastError ?? NSError(domain: "RecorderCLI", code: 102, userInfo: [NSLocalizedDescriptionKey: "Failed to initialize microphone after multiple attempts"])
            print("❌ All recording attempts failed: \(error.localizedDescription)")
            throw error
        }
    }
    
    private func startAudioLevelMonitoring() {
        DispatchQueue.global(qos: .background).async { [weak self] in
            guard let self = self else { return }
            
            var consecutiveLowLevels = 0
            let maxLowLevels = 5 // Number of consecutive low levels before warning
            
            while self.micRecordingActive && self.microphoneRecorder?.isRecording == true {
                self.microphoneRecorder?.updateMeters()
                let avgPower = self.microphoneRecorder?.averagePower(forChannel: 0) ?? -160.0
                let peakPower = self.microphoneRecorder?.peakPower(forChannel: 0) ?? -160.0
                
                // Check if mic is picking up sound
                if avgPower > -50.0 {
                    print("✅ Microphone is detecting sound (Avg: \(String(format: "%.1f", avgPower)) dB, Peak: \(String(format: "%.1f", peakPower)) dB)")
                    consecutiveLowLevels = 0
                } else {
                    consecutiveLowLevels += 1
                    if consecutiveLowLevels >= maxLowLevels {
                        print("⚠️ Warning: Low microphone levels detected for \(consecutiveLowLevels) consecutive checks")
                        print("⚠️ Current levels - Avg: \(String(format: "%.1f", avgPower)) dB, Peak: \(String(format: "%.1f", peakPower)) dB)")
                        print("⚠️ Please check your microphone settings or speak louder")
                        
                        // Try to adjust microphone volume
                        if let currentVolume = AudioDeviceManager.getMicrophoneInputLevel(), currentVolume < 90 {
                            if AudioDeviceManager.setMicrophoneInputLevel(90.0) {
                                print("✅ Automatically increased microphone volume to 90%")
                            }
                        }
                        
                        consecutiveLowLevels = 0 // Reset counter after warning
                    }
                }
                
                Thread.sleep(forTimeInterval: 1.0)
            }
        }
    }
    
    func combineAndConvertRecordings() {
        // Combine system audio and microphone recordings
        print("\n🔄 Combining system audio and microphone recordings...")
        
        guard let systemPath = systemTempWavPath,
              let micPath = micTempWavPath,
              let combinedPath = combinedTempWavPath,
              let mp3Path = finalMp3Path else {
            print("❌ Error: Missing file paths for combined recording")
            ResponseHandler.returnResponse([
                "code": "RECORDING_ERROR",
                "error": "Missing file paths for combined recording"
            ])
            return
        }
        
        // Get the directory containing the files
        let fileManager = FileManager.default
        let recordingDir = (systemPath as NSString).deletingLastPathComponent
        
        // Wait a short moment to ensure files are fully written
        Thread.sleep(forTimeInterval: 1.0)
        
        // Check if ffmpeg is available
        let ffmpegPath = "/opt/homebrew/bin/ffmpeg"
        guard FileManager.default.fileExists(atPath: ffmpegPath) else {
            print("❌ ffmpeg not found at \(ffmpegPath)")
            ResponseHandler.returnResponse([
                "code": "RECORDING_ERROR",
                "error": "ffmpeg not found at \(ffmpegPath)"
            ])
            return
        }
        
        // Log file existence and sizes
        print("\n📊 Checking recording files:")
        var systemSize: UInt64 = 0
        var micSize: UInt64 = 0
        
        if fileManager.fileExists(atPath: systemPath) {
            if let attrs = try? fileManager.attributesOfItem(atPath: systemPath),
               let size = attrs[.size] as? UInt64 {
                systemSize = size
                print("✅ System audio file exists: \(size / 1024) KB")
            }
        } else {
            print("❌ System audio file missing: \(systemPath)")
        }
        
        if fileManager.fileExists(atPath: micPath) {
            if let attrs = try? fileManager.attributesOfItem(atPath: micPath),
               let size = attrs[.size] as? UInt64 {
                micSize = size
                print("✅ Microphone file exists: \(size / 1024) KB")
            }
        } else {
            print("❌ Microphone file missing: \(micPath)")
        }
        
        // Verify we have valid files to combine
        guard systemSize > 0 && micSize > 0 else {
            print("❌ One or both recording files are empty or missing")
            ResponseHandler.returnResponse([
                "code": "RECORDING_ERROR",
                "error": "One or both recording files are empty or missing"
            ])
            return
        }
        
        do {
            // Combine WAV files
            print("\n🔄 Combining WAV files...")
            let combineTask = Process()
            combineTask.executableURL = URL(fileURLWithPath: ffmpegPath)
            combineTask.currentDirectoryURL = URL(fileURLWithPath: recordingDir)
            combineTask.arguments = [
                "-y",
                "-i", systemPath,
                "-i", micPath,
                "-filter_complex", "[0:a]volume=1.0[a];[1:a]volume=1.0[b];[a][b]amix=inputs=2:duration=longest:normalize=1",
                "-ar", "44100",
                "-ac", "2",
                combinedPath
            ]
            
            let combineOutputPipe = Pipe()
            let combineErrorPipe = Pipe()
            combineTask.standardOutput = combineOutputPipe
            combineTask.standardError = combineErrorPipe
            
            print("🔧 Running ffmpeg combine command:")
            print("\(ffmpegPath) \(combineTask.arguments?.joined(separator: " ") ?? "")")
            
            try combineTask.run()
            combineTask.waitUntilExit()
            
            // Check if the combined file was created and has content
            guard fileManager.fileExists(atPath: combinedPath),
                  let attrs = try? fileManager.attributesOfItem(atPath: combinedPath),
                  let size = attrs[.size] as? UInt64,
                  size > 0 else {
                print("\n❌ Combined WAV file not created or empty")
                ResponseHandler.returnResponse([
                    "code": "RECORDING_ERROR",
                    "error": "Failed to create combined WAV file"
                ])
                return
            }
            
            print("\n✅ Combined WAV file created: \(size / 1024) KB")
            
            // Convert to MP3
            print("\n🔄 Converting to MP3...")
            let mp3Task = Process()
            mp3Task.executableURL = URL(fileURLWithPath: ffmpegPath)
            mp3Task.currentDirectoryURL = URL(fileURLWithPath: recordingDir)
            mp3Task.arguments = [
                "-y",
                "-i", combinedPath,
                "-codec:a", "libmp3lame",
                "-qscale:a", "2",
                "-ar", "44100",
                mp3Path
            ]
            
            let mp3OutputPipe = Pipe()
            let mp3ErrorPipe = Pipe()
            mp3Task.standardOutput = mp3OutputPipe
            mp3Task.standardError = mp3ErrorPipe
            
            print("🔧 Running ffmpeg MP3 conversion command:")
            print("\(ffmpegPath) \(mp3Task.arguments?.joined(separator: " ") ?? "")")
            
            try mp3Task.run()
            mp3Task.waitUntilExit()
            
            // Verify the MP3 file was created
            if fileManager.fileExists(atPath: mp3Path),
               let attrs = try? fileManager.attributesOfItem(atPath: mp3Path),
               let size = attrs[.size] as? UInt64,
               size > 0 {
                print("\n✅ MP3 file created: \(size / 1024) KB")
                
                // Return success response
                ResponseHandler.returnResponse([
                    "code": "RECORDING_STOPPED",
                    "path": mp3Path,
                    "timestamp": ISO8601DateFormatter().string(from: Date()),
                    "combined": true
                ])
                
                // Clean up temporary files
                try? fileManager.removeItem(atPath: systemPath)
                try? fileManager.removeItem(atPath: micPath)
                try? fileManager.removeItem(atPath: combinedPath)
            } else {
                print("\n❌ MP3 file not created or empty")
                ResponseHandler.returnResponse([
                    "code": "RECORDING_ERROR",
                    "error": "Failed to create MP3 file"
                ])
            }
        } catch {
            print("\n❌ Error processing audio: \(error.localizedDescription)")
            ResponseHandler.returnResponse([
                "code": "RECORDING_ERROR",
                "error": "Error processing audio: \(error.localizedDescription)"
            ])
        }
    }
    
    // ... existing pause/resume functions ...
    
    func pauseRecording() {
        guard isRecordingActive && !isPaused else { return }
        
        print("Pausing recording...")
        isPaused = true
        let pauseTime = Date()
        
        // Pause system audio if active
        if systemRecordingActive {
            systemAudioPauseTime = pauseTime
            RecorderCLI.screenCaptureStream?.stopCapture()
        }
        
        // Pause microphone if active
        if micRecordingActive && microphoneRecorder?.isRecording == true {
            microphonePauseTime = pauseTime
            microphoneRecorder?.pause()
        }
        
        ResponseHandler.returnResponse([
            "code": "RECORDING_PAUSED",
            "timestamp": ISO8601DateFormatter().string(from: pauseTime)
        ], shouldExitProcess: false)
    }
    
    func resumeRecording() {
        guard isRecordingActive && isPaused else { return }
        
        print("Resuming recording...")
        let resumeTime = Date()
        
        // Calculate paused duration
        if let pauseTime = systemAudioPauseTime ?? microphonePauseTime {
            totalPausedDuration += resumeTime.timeIntervalSince(pauseTime)
        }
        
        // Resume system audio if it was active
        if systemRecordingActive {
            Task {
                do {
                    if let filter = contentEligibleForSharing?.displays.first.map({
                        SCContentFilter(display: $0, excludingApplications: [], exceptingWindows: [])
                    }) {
                        try await initiateRecording(with: filter)
                        print("System audio recording resumed")
                    }
                } catch {
                    print("Failed to resume system audio: \(error.localizedDescription)")
                    ResponseHandler.returnResponse([
                        "code": "RESUME_FAILED",
                        "error": "Failed to resume system audio: \(error.localizedDescription)"
                    ], shouldExitProcess: false)
                    return
                }
            }
        }
        
        // Resume microphone if it was active
        if micRecordingActive {
            microphoneRecorder?.record()
            print("Microphone recording resumed")
        }
        
        isPaused = false
        systemAudioPauseTime = nil
        microphonePauseTime = nil
        
        ResponseHandler.returnResponse([
            "code": "RECORDING_RESUMED",
            "timestamp": ISO8601DateFormatter().string(from: resumeTime)
        ], shouldExitProcess: false)
    }
    
    // Function to start the recording process
    func startRecordingProcess() {
        if !isInitialized {
            isInitialized = true
            
            if audioSource == "both" {
                do {
                    // First set up microphone recording
                    try setupMicrophoneForCombinedRecording()
                    print("✅ Microphone recording initialized")
                    
                    // Send initial success response
                    recordingStartTime = Date()
                    ResponseHandler.returnResponse([
                        "code": "RECORDING_STARTED",
                        "path": finalMp3Path!,
                        "timestamp": ISO8601DateFormatter().string(from: recordingStartTime!)
                    ], shouldExitProcess: false)
                    
                    // Initialize system audio recording
                    initializeSystemAudioRecording()
                    
                } catch {
                    print("❌ Failed to setup combined recording: \(error.localizedDescription)")
                    ResponseHandler.returnResponse([
                        "code": "CAPTURE_FAILED",
                        "error": "Failed to initialize combined recording: \(error.localizedDescription)"
                    ])
                    return
                }
            } else if audioSource == "system" {
                initializeSystemAudioRecording()
            } else {
                setupMicrophoneRecording()
            }
        }
    }
    
    // Function to initialize system audio recording
    func initializeSystemAudioRecording() {
        print("Initializing system audio recording...")
        
        // For combined recording, prepare the system audio file
        if audioSource == "both" {
            guard let systemPath = systemTempWavPath else {
                print("❌ System audio path not set")
                ResponseHandler.returnResponse([
                    "code": "SYSTEM_AUDIO_PATH_ERROR",
                    "error": "System audio path not set for combined recording"
                ])
                return
            }
            
            // Prepare the audio file for system audio
            prepareAudioFile(at: systemPath)
            systemRecordingActive = true
            print("✅ System audio file prepared at: \(systemPath)")
        }
        
        // Start the screen capture for system audio
        updateAvailableContent()
    }
    
    // Override the existing executeRecordingProcess
    func executeRecordingProcess() {
        print("Starting recording process with source: \(audioSource)")
        
        // For combined recording or system audio, check permissions first
        if audioSource == "both" || audioSource == "system" {
            PermissionsRequester.requestScreenCaptureAccess { [weak self] granted in
                guard let self = self else { return }
                
                if granted {
                    print("✅ Screen recording permission granted")
                    
                    // Create timestamp and filename
                    let timestamp = Date()
                    let baseFilename = self.recordingFilename ?? timestamp.toFormattedFileName()
                    
                    // Set up paths
                    if self.audioSource == "both" {
                        self.systemTempWavPath = "\(self.recordingPath!)/\(baseFilename)_system.wav"
                        self.micTempWavPath = "\(self.recordingPath!)/\(baseFilename)_mic.wav"
                        self.combinedTempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
                        self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
                        
                        print("Combined recording paths:")
                        print("- System: \(self.systemTempWavPath ?? "nil")")
                        print("- Mic: \(self.micTempWavPath ?? "nil")")
                        print("- Combined: \(self.combinedTempWavPath ?? "nil")")
                        print("- Final MP3: \(self.finalMp3Path ?? "nil")")
                    } else {
                        self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
                        self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
                    }
                    
                    self.setupInterruptSignalHandler()
                    self.startRecordingProcess()
                    
                    // Wait for recording to complete
                    self.semaphoreRecordingStopped.wait()
                } else {
                    print("❌ Screen recording permission denied")
                    ResponseHandler.returnResponse([
                        "code": "PERMISSION_DENIED",
                        "error": "Screen recording permission is required for system audio"
                    ])
                }
            }
        } else {
            // Microphone only
            setupMicrophoneRecording()
        }
    }
    
    func setupMicrophoneRecording() {
        print("Setting up microphone recording...")
        
        // Create timestamp and filename
        let timestamp = Date()
        let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
        
        // Generate unique timestamp-based filename if none provided
        let baseFilename: String
        if let providedFilename = self.recordingFilename, !providedFilename.isEmpty {
            baseFilename = providedFilename
        } else {
            baseFilename = timestamp.toFormattedFileName()
        }
        
        // Set up temporary WAV path and final MP3 path
        self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
        self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
        
        print("Will save recording to: \(tempWavPath!)")
        
        // Log audio device info
        print("Checking audio input devices on macOS:")
        AudioDeviceManager.logAudioDiagnostics()
            
        // Configure recording settings
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        do {
            // Create recorder
            microphoneRecorder = try AVAudioRecorder(url: URL(fileURLWithPath: tempWavPath!), settings: settings)
            microphoneRecorder?.delegate = self
            microphoneRecorder?.isMeteringEnabled = true
            
            if microphoneRecorder?.prepareToRecord() == true {
                // Start recording
                let success = microphoneRecorder?.record() ?? false
                
                if success {
                    print("Microphone recording started successfully")
                    micRecordingActive = true
                    
                    // Start a timer to monitor microphone audio levels
                    DispatchQueue.global(qos: .background).async { [weak self] in
                        guard let self = self else { return }
                        
                        while self.microphoneRecorder?.isRecording == true {
                            self.microphoneRecorder?.updateMeters()
                            let avgPower = self.microphoneRecorder?.averagePower(forChannel: 0) ?? -160.0
                            let peakPower = self.microphoneRecorder?.peakPower(forChannel: 0) ?? -160.0
                            print("Mic levels - Avg: \(avgPower) dB, Peak: \(peakPower) dB")
                            
                            // Check if mic is picking up sound
                            if avgPower > -50.0 {
                                print("✅ Microphone is detecting sound")
                            } else {
                                print("⚠️ Microphone level is low")
                            }
                            
                            Thread.sleep(forTimeInterval: 1.0)
                        }
                    }
                    
                    // Notify recording started
                    ResponseHandler.returnResponse([
                        "code": "RECORDING_STARTED", 
                        "path": self.finalMp3Path!, 
                        "timestamp": formattedTimestamp
                    ], shouldExitProcess: false)
                } else {
                    print("Failed to start microphone recording")
                    ResponseHandler.returnResponse([
                        "code": "CAPTURE_FAILED", 
                        "error": "Failed to start microphone recording"
                    ])
                }
            } else {
                print("Failed to prepare microphone recording")
                ResponseHandler.returnResponse([
                    "code": "CAPTURE_FAILED", 
                    "error": "Failed to prepare microphone recording"
                ])
            }
        } catch {
            print("Microphone recording setup error: \(error.localizedDescription)")
            ResponseHandler.returnResponse([
                "code": "CAPTURE_FAILED", 
                "error": "Microphone setup error: \(error.localizedDescription)"
            ])
        }
    }
    
    // AVAudioRecorderDelegate methods
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        print("Microphone recording finished, success: \(flag)")
        
        if audioSource == "both" {
            micRecordingActive = false
            
            // For combined recording, we need both recordings to finish
            if !systemRecordingActive {
                // Both recordings are done, combine them
                combineAndConvertRecordings()
            }
        } else if flag {
            // Standard mic-only recording
            convertAndFinish()
        } else {
            ResponseHandler.returnResponse([
                "code": "RECORDING_STOPPED", 
                "error": "Recording failed to complete properly"
            ])
        }
    }
    
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        print("Microphone recording encode error: \(error?.localizedDescription ?? "unknown")")
        ResponseHandler.returnResponse([
            "code": "RECORDING_ERROR", 
            "error": "Encoding error: \(error?.localizedDescription ?? "unknown")"
        ])
    }

    func setupInterruptSignalHandler() {
        // Use the global function as signal handler
        signal(SIGINT, handleInterruptSignal)
    }
    
    func stopAndCombineRecordings() {
        print("Stopping all recording components...")
        
        // Stop the microphone recording if active
        if microphoneRecorder?.isRecording == true {
            microphoneRecorder?.stop()
            micRecordingActive = false
        }
        
        // Stop the system audio recording if active
        if RecorderCLI.screenCaptureStream != nil {
            RecorderCLI.screenCaptureStream?.stopCapture()
            RecorderCLI.screenCaptureStream = nil
            systemRecordingActive = false
        }
        
        // Wait a moment for files to be written
        Thread.sleep(forTimeInterval: 2.0)
        
        // Now combine the recordings
        combineAndConvertRecordings()
    }
    
    func convertAndFinish() {
        let timestamp = Date()
        let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
        
        // Stop all recordings first
        if audioSource == "both" {
            // Stop the microphone component if it's still recording
            if microphoneRecorder?.isRecording == true {
                microphoneRecorder?.stop()
                micRecordingActive = false
            }
            
            // Stop the system audio component if it's still active
            if RecorderCLI.screenCaptureStream != nil {
                RecorderCLI.terminateRecording()
                systemRecordingActive = false
            }
        } else if audioSource == "mic" && microphoneRecorder?.isRecording == true {
            microphoneRecorder?.stop()
        }
        
        // Store the path for response
        let outputPath = finalMp3Path ?? tempWavPath ?? ""
        
        // If we have a WAV file, convert it to MP3
        if let wavPath = tempWavPath, FileManager.default.fileExists(atPath: wavPath) {
            let mp3Path = wavPath.replacingOccurrences(of: ".wav", with: ".mp3")
            
            // Verify the MP3 path doesn't already exist (avoid overwriting)
            if FileManager.default.fileExists(atPath: mp3Path) {
                do {
                    try FileManager.default.removeItem(atPath: mp3Path)
                    print("Removed existing MP3 file at path: \(mp3Path)")
                } catch {
                    print("Failed to remove existing MP3 file: \(error.localizedDescription)")
                }
            }
            
            // Use shell for conversion with improved parameters
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/sh")
            task.arguments = [
                "-c",
                "ffmpeg -i \"\(wavPath)\" -codec:a libmp3lame -qscale:a 2 -ar 44100 \"\(mp3Path)\" -y"
            ]
            
            do {
                try task.run()
                task.waitUntilExit()
                
                // Verify the conversion succeeded
                if task.terminationStatus == 0 && FileManager.default.fileExists(atPath: mp3Path) {
                    // Get file sizes for logging
                    if let wavAttrs = try? FileManager.default.attributesOfItem(atPath: wavPath),
                       let mp3Attrs = try? FileManager.default.attributesOfItem(atPath: mp3Path),
                       let wavSize = wavAttrs[.size] as? UInt64,
                       let mp3Size = mp3Attrs[.size] as? UInt64 {
                        print("WAV: \(wavSize / 1024) KB, MP3: \(mp3Size / 1024) KB")
                    }
                    
                    // Successfully converted
                    ResponseHandler.returnResponse([
                        "code": "RECORDING_STOPPED", 
                        "timestamp": formattedTimestamp,
                        "path": mp3Path,
                        "combined": audioSource == "both"
                    ])
                    
                    // Clean up temporary WAV file
                    do {
                        try FileManager.default.removeItem(atPath: wavPath)
                        print("Removed temporary WAV file: \(wavPath)")
                    } catch {
                        print("Failed to remove temporary WAV file: \(error.localizedDescription)")
                    }
                } else {
                    // Conversion failed - return the WAV file
                    ResponseHandler.returnResponse([
                        "code": "RECORDING_STOPPED", 
                        "timestamp": formattedTimestamp,
                        "path": wavPath,
                        "error": "MP3 conversion failed",
                        "combined": audioSource == "both"
                    ])
                }
            } catch {
                print("Initial conversion failed: \(error.localizedDescription)")
                // Shell execution failed
                ResponseHandler.returnResponse([
                    "code": "RECORDING_STOPPED", 
                    "timestamp": formattedTimestamp,
                    "path": wavPath,
                    "error": "MP3 conversion error: \(error.localizedDescription)",
                    "combined": audioSource == "both"
                ])
            }
        } else {
            // No WAV file found
            ResponseHandler.returnResponse([
                "code": "RECORDING_STOPPED", 
                "timestamp": formattedTimestamp,
                "path": outputPath,
                "error": "No recording file created",
                "combined": audioSource == "both"
            ])
        }
    }

    func updateAvailableContent() {
        print("Getting available displays for capture...")
        
        // Double check screen recording permission
        guard CGPreflightScreenCaptureAccess() else {
            print("❌ Screen recording permission not available")
            ResponseHandler.returnResponse([
                "code": "PERMISSION_DENIED",
                "error": "Screen recording permission is required for system audio"
            ])
            return
        }
        
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self = self else { return }
            
            if let error = error {
                print("❌ Error getting sharable content: \(error.localizedDescription)")
                ResponseHandler.returnResponse([
                    "code": "CONTENT_ERROR", 
                    "error": "Could not get sharable content: \(error.localizedDescription)"
                ])
                return
            }
            
            guard let content = content else {
                print("❌ No content available for sharing")
                ResponseHandler.returnResponse([
                    "code": "NO_CONTENT",
                    "error": "No content available for screen capture"
                ])
                return
            }
            
            self.contentEligibleForSharing = content
            
            if content.displays.isEmpty {
                print("❌ No displays found for recording")
                ResponseHandler.returnResponse([
                    "code": "NO_DISPLAY_FOUND",
                    "error": "No displays available for screen capture"
                ])
                return
            }
            
            print("✅ Found \(content.displays.count) display(s) for recording")
            
            // Log display information for debugging
            for (index, display) in content.displays.enumerated() {
                print("Display [\(index)]: width=\(display.width), height=\(display.height), frame=\(display.frame)")
            }
            
            // For combined recording, we need to prepare the audio file differently
            if self.audioSource == "both" {
                // Prepare the audio file for system audio
                if let systemPath = self.systemTempWavPath {
                    self.prepareAudioFile(at: systemPath)
                    self.systemRecordingActive = true
                    print("✅ System audio file prepared at: \(systemPath)")
                } else {
                    print("❌ System audio path not set")
                    ResponseHandler.returnResponse([
                        "code": "SYSTEM_AUDIO_PATH_ERROR",
                        "error": "System audio path not set for combined recording"
                    ])
                    return
                }
            } else {
                // Standard system-only recording setup
                let timestamp = Date()
                let baseFilename = self.recordingFilename ?? timestamp.toFormattedFileName()
                
                self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
                self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
                
                print("Saving recording to temporary WAV: \(self.tempWavPath!)")
                self.prepareAudioFile(at: self.tempWavPath!)
            }
            
            self.setupRecordingEnvironment()
        }
    }

    func setupRecordingEnvironment() {
        print("🔧 Setting up recording environment...")
        
        // First, check current audio routing
        checkSystemAudioRouting()
        
        guard let firstDisplay = contentEligibleForSharing?.displays.first else {
            print("❌ No display found for recording")
            ResponseHandler.returnResponse([
                "code": "NO_DISPLAY_FOUND",
                "error": "No display available for screen capture"
            ])
            return
        }

        print("✅ Using display: width=\(firstDisplay.width), height=\(firstDisplay.height)")
        
        // Create a more comprehensive content filter for better system audio capture
        let screenContentFilter: SCContentFilter
        
        if audioSource == "system" || audioSource == "both" {
            // For system audio capture, we need to include more content
            // Try to capture all available displays and applications for better audio routing
            let allDisplays = contentEligibleForSharing?.displays ?? [firstDisplay]
            let runningApps = contentEligibleForSharing?.applications ?? []
            
            // Create filter that includes all displays and excludes fewer apps for better audio capture
            screenContentFilter = SCContentFilter(
                display: firstDisplay,
                excludingApplications: [],
                exceptingWindows: []
            )
            
            print("✅ Configured comprehensive screen content filter for system audio")
            print("   - Displays: \(allDisplays.count)")
            print("   - Applications available: \(runningApps.count)")
        } else {
            // For microphone-only recording, minimal filter is fine
            screenContentFilter = SCContentFilter(display: firstDisplay, excludingApplications: [], exceptingWindows: [])
            print("✅ Configured minimal screen content filter for microphone-only")
        }

        Task { 
            do {
                try await initiateRecording(with: screenContentFilter)
            } catch {
                print("❌ Failed to initiate recording: \(error.localizedDescription)")
                ResponseHandler.returnResponse([
                    "code": "RECORDING_FAILED",
                    "error": "Failed to initiate recording: \(error.localizedDescription)"
                ])
            }
        }
    }

    private func checkSystemAudioRouting() {
        print("🔍 Checking system audio routing...")
        
        // Get current audio output device
        var defaultOutputDeviceID: AudioDeviceID = 0
        var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        let result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &defaultOutputDeviceID
        )
        
        if result == noErr {
            // Get device name
            var deviceNameProperty = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            
            var deviceNameSize = UInt32(256)
            var deviceNameBuffer = [UInt8](repeating: 0, count: 256)
            
            let nameResult = AudioObjectGetPropertyData(
                defaultOutputDeviceID,
                &deviceNameProperty,
                0,
                nil,
                &deviceNameSize,
                &deviceNameBuffer
            )
            
            if nameResult == noErr {
                let deviceName = String(bytes: deviceNameBuffer.prefix(Int(deviceNameSize)), encoding: .utf8) ?? "Unknown"
                print("🔊 Current audio output device: \(deviceName)")
                
                // Check if it's a Bluetooth device
                if deviceName.contains("AirPods") || deviceName.contains("Bluetooth") {
                    print("⚠️ Warning: Bluetooth audio device detected")
                    print("   System audio capture may be limited with Bluetooth devices")
                    print("   For best results, consider switching to built-in speakers")
                }
                
                // Check if device supports volume control (indicator of proper routing)
                var volumeProperty = AudioObjectPropertyAddress(
                    mSelector: kAudioDevicePropertyVolumeScalar,
                    mScope: kAudioDevicePropertyScopeOutput,
                    mElement: kAudioObjectPropertyElementMain
                )
                
                let hasVolume = AudioObjectHasProperty(defaultOutputDeviceID, &volumeProperty)
                print("🎚️ Device supports volume control: \(hasVolume)")
            }
        } else {
            print("❌ Could not get default audio output device")
        }
    }

    func prepareAudioFile(at path: String) {
        do {
            // Use WAV format for capture (more reliable)
            RecorderCLI.audioFileForRecording = try AVAudioFile(
                forWriting: URL(fileURLWithPath: path),
                settings: [
                    AVSampleRateKey: 44100, // Changed to 44.1kHz for better MP3 conversion
                    AVNumberOfChannelsKey: 2,
                    AVFormatIDKey: kAudioFormatLinearPCM
                ],
                commonFormat: .pcmFormatFloat32,
                interleaved: false
            )
            print("Successfully prepared audio file at \(path)")
        } catch {
            print("Failed to create audio file: \(error.localizedDescription)")
            ResponseHandler.returnResponse(["code": "AUDIO_FILE_CREATION_FAILED", "error": error.localizedDescription])
        }
    }

    func initiateRecording(with filter: SCContentFilter) async throws {
        print("Initiating recording...")
        let streamConfiguration = SCStreamConfiguration()
        configureStream(streamConfiguration)

        do {
            RecorderCLI.screenCaptureStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)

            try RecorderCLI.screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
            print("Added audio stream output")
            
            print("Starting capture...")
            try await RecorderCLI.screenCaptureStream?.startCapture()
            print("Capture started successfully")
            
            if audioSource == "both" {
                systemRecordingActive = true
            }
        } catch {
            print("Failed to start capture: \(error.localizedDescription)")
            throw error
        }
    }

    func configureStream(_ configuration: SCStreamConfiguration) {
        print("🔧 Configuring stream for system audio capture...")
        
        // Use minimal video capture settings
        configuration.width = 1
        configuration.height = 1
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1) // Minimal video frame rate
        configuration.showsCursor = false
        
        // Configure audio capture settings
        configuration.capturesAudio = true
        configuration.sampleRate = 44100 // Standard sample rate for better compatibility
        configuration.channelCount = 2   // Stereo capture
        
        // Set audio capture to exclude app audio to focus on system audio
        configuration.excludesCurrentProcessAudio = true
        
        // Note: We handle microphone separately for combined recording
        // configuration.microphoneCaptureEnabled is not available in this API version
        
        print("   ✅ Audio capture enabled: \(configuration.capturesAudio)")
        print("   ✅ Sample rate: \(configuration.sampleRate) Hz")
        print("   ✅ Channels: \(configuration.channelCount)")
        print("   ✅ Excludes current process: \(configuration.excludesCurrentProcessAudio)")
        print("   ✅ Video resolution: \(configuration.width)x\(configuration.height)")
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        // Enhanced logging for the first few audio buffers
        if !self.streamFunctionCalled {
            print("✅ First audio buffer received from system")
            self.streamFunctionCalled = true
            
            // Log audio buffer information
            if let formatDesc = sampleBuffer.formatDescription {
                let audioStreamBasicDesc = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)
                if let asbd = audioStreamBasicDesc {
                    print("   📊 Audio format: \(asbd.pointee.mSampleRate) Hz, \(asbd.pointee.mChannelsPerFrame) channels")
                    print("   📊 Format ID: \(asbd.pointee.mFormatID)")
                    print("   📊 Bits per channel: \(asbd.pointee.mBitsPerChannel)")
                }
            }
            
            // For combined recording, we need both components to be active
            if audioSource == "both" && !systemRecordingActive {
                systemRecordingActive = true
                print("✅ System audio recording active")
            }
        }
        
        guard let audioBuffer = sampleBuffer.asPCMBuffer, sampleBuffer.isValid else { 
            print("⚠️ Invalid audio buffer received")
            return
        }
        
        // Check if we're actually getting audio data
        let frameLength = audioBuffer.frameLength
        if frameLength > 0 {
            // Log occasional buffer information to monitor capture
            if arc4random_uniform(1000) == 0 { // Log roughly every 1000 buffers
                print("📊 System audio buffer: \(frameLength) frames")
                
                // Check audio levels in the buffer
                if let channelData = audioBuffer.floatChannelData?[0] {
                    var maxLevel: Float = 0.0
                    for i in 0..<Int(frameLength) {
                        maxLevel = max(maxLevel, abs(channelData[i]))
                    }
                    let dbLevel = maxLevel > 0 ? 20 * log10(maxLevel) : -160.0
                    print("   🔊 System audio level: \(String(format: "%.1f", dbLevel)) dB")
                }
            }
        }

        do {
            try RecorderCLI.audioFileForRecording?.write(from: audioBuffer)
        } catch {
            print("❌ Failed to write system audio buffer: \(error.localizedDescription)")
            ResponseHandler.returnResponse([
                "code": "AUDIO_BUFFER_WRITE_FAILED", 
                "error": "Failed to write audio buffer: \(error.localizedDescription)"
            ], shouldExitProcess: false)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("Stream stopped with error: \(error.localizedDescription)")
        
        if audioSource == "both" {
            systemRecordingActive = false
            
            // If microphone is also done, finalize the recording
            if !micRecordingActive {
                print("Both recordings completed, combining files...")
                combineAndConvertRecordings()
            } else {
                print("System audio stopped but microphone still recording")
            }
        } else {
            ResponseHandler.returnResponse([
                "code": "STREAM_ERROR", 
                "error": error.localizedDescription
            ], shouldExitProcess: false)
            
            RecorderCLI.terminateRecording()
            semaphoreRecordingStopped.signal()
        }
    }

    static func terminateRecording() {
        print("Terminating recording...")
        
        // Stop screen capture stream if active
        screenCaptureStream?.stopCapture()
        screenCaptureStream = nil
        audioFileForRecording = nil
        
        // Stop microphone recording if active
        if let recorder = recorderInstance?.microphoneRecorder, recorder.isRecording {
            recorder.stop()
        }
    }
    
    // Update recordingDuration calculation to account for paused time
    var recordingDuration: TimeInterval {
        guard let startTime = recordingStartTime else { return 0 }
        let currentTime = Date()
        let totalDuration = currentTime.timeIntervalSince(startTime)
        return totalDuration - totalPausedDuration
    }
}

extension Date {
    func toFormattedFileName() -> String {
        let fileNameFormatter = DateFormatter()
        fileNameFormatter.dateFormat = "y-MM-dd HH.mm.ss"
        return fileNameFormatter.string(from: self)
    }
}

class PermissionsRequester {
    static func requestScreenCaptureAccess(completion: @escaping (Bool) -> Void) {
        // First check if we already have permission
        let hasPermission = CGPreflightScreenCaptureAccess()
        if !hasPermission {
            print("Screen capture permission not granted, requesting...")
            
            // Request permission and wait for it to be granted
            DispatchQueue.global(qos: .userInitiated).async {
                // Request permission
                let result = CGRequestScreenCaptureAccess()
                print("Initial permission request result: \(result)")
                
                if result {
                    // Permission granted immediately
                    completion(true)
                } else {
                    // Wait for a short time and check again (user might need time to approve)
                    DispatchQueue.global().asyncAfter(deadline: .now() + 5.0) {
                        let finalResult = CGPreflightScreenCaptureAccess()
                        print("Final permission check result: \(finalResult)")
                        completion(finalResult)
                    }
                }
            }
        } else {
            print("Screen capture permission already granted")
            completion(true)
        }
    }
}

class ResponseHandler {
    static func returnResponse(_ response: [String: Any], shouldExitProcess: Bool = true) {
        if let jsonData = try? JSONSerialization.data(withJSONObject: response),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
            fflush(stdout)
        } else {
            print("{\"code\": \"JSON_SERIALIZATION_FAILED\"}")
            fflush(stdout)
        }

        if shouldExitProcess {
            exit(0)
        }
    }
}

// https://developer.apple.com/documentation/screencapturekit/capturing_screen_content_in_macos
// For Sonoma updated to https://developer.apple.com/forums/thread/727709
extension CMSampleBuffer {
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { audioBufferList, _ -> AVAudioPCMBuffer? in
            guard let absd = self.formatDescription?.audioStreamBasicDescription else { return nil }
            guard let format = AVAudioFormat(standardFormatWithSampleRate: absd.mSampleRate, channels: absd.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: audioBufferList.unsafePointer)
        }
    }
}

// Based on https://gist.github.com/aibo-cora/c57d1a4125e145e586ecb61ebecff47c
extension AVAudioPCMBuffer {
    var asSampleBuffer: CMSampleBuffer? {
        let asbd = self.format.streamDescription
        var sampleBuffer: CMSampleBuffer? = nil
        var format: CMFormatDescription? = nil

        guard CMAudioFormatDescriptionCreate(
            allocator: kCFAllocatorDefault,
            asbd: asbd,
            layoutSize: 0,
            layout: nil,
            magicCookieSize: 0,
            magicCookie: nil,
            extensions: nil,
            formatDescriptionOut: &format
        ) == noErr else { return nil }

        var timing = CMSampleTimingInfo(
            duration: CMTime(value: 1, timescale: Int32(asbd.pointee.mSampleRate)),
            presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
            decodeTimeStamp: .invalid
        )

        guard CMSampleBufferCreate(
            allocator: kCFAllocatorDefault,
            dataBuffer: nil,
            dataReady: false,
            makeDataReadyCallback: nil,
            refcon: nil,
            formatDescription: format,
            sampleCount: CMItemCount(self.frameLength),
            sampleTimingEntryCount: 1,
            sampleTimingArray: &timing,
            sampleSizeEntryCount: 0,
            sampleSizeArray: nil,
            sampleBufferOut: &sampleBuffer
        ) == noErr else { return nil }

        guard CMSampleBufferSetDataBufferFromAudioBufferList(
            sampleBuffer!,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: 0,
            bufferList: self.mutableAudioBufferList
        ) == noErr else { return nil }

        return sampleBuffer
    }
}

@_cdecl("recorderMain")
func recorderMain() -> Int32 {
    // This function is just a placeholder to satisfy the linker
    // The actual functionality is called through other entry points
    return 0
} 