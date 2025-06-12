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
    var audioSource: String = "both"  // Default to combined recording
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
    
    // Add properties for speaker diarization
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
                print("Invalid audio source: \(source). Using default: both (combined)")
            }
        } else {
            print("Using default audio source: both (combined)")
        }
    }
    
    func setupMicrophoneForCombinedRecording() throws {
        print("Setting up microphone for combined recording...")
        
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
            throw NSError(domain: "RecorderCLI", code: 101, userInfo: [NSLocalizedDescriptionKey: "Mic temp path not set"])
        }
        
        if FileManager.default.fileExists(atPath: micPath) {
            try FileManager.default.removeItem(atPath: micPath)
        }
        
        let recorder = try AVAudioRecorder(url: URL(fileURLWithPath: micPath), settings: settings)
        recorder.delegate = self
        recorder.isMeteringEnabled = true
        
        if recorder.prepareToRecord() && recorder.record() {
            microphoneRecorder = recorder
            micRecordingActive = true
        } else {
            throw NSError(domain: "RecorderCLI", code: 102, userInfo: [NSLocalizedDescriptionKey: "Failed to start microphone recording"])
        }
    }
    
    func combineAndConvertRecordings() {
        print("Combining system and microphone audio...")
        
        guard let systemPath = systemTempWavPath,
              let micPath = micTempWavPath,
              let combinedPath = combinedTempWavPath,
              let mp3Path = finalMp3Path,
              FileManager.default.fileExists(atPath: systemPath),
              FileManager.default.fileExists(atPath: micPath) else {
            ResponseHandler.returnResponse(["code": "RECORDING_ERROR", "error": "Missing audio files for combining"])
            return
        }

        let ffmpegPath = "/opt/homebrew/bin/ffmpeg"
        guard FileManager.default.fileExists(atPath: ffmpegPath) else {
            ResponseHandler.returnResponse(["code": "RECORDING_ERROR", "error": "ffmpeg not found at \(ffmpegPath)"])
            return
        }

        let combineTask = Process()
        combineTask.executableURL = URL(fileURLWithPath: ffmpegPath)
        combineTask.arguments = [
            "-y", "-i", systemPath, "-i", micPath,
            "-filter_complex", "[0:a]volume=1.0[a];[1:a]volume=1.0[b];[a][b]amix=inputs=2:duration=longest:normalize=1",
            "-ar", "44100", "-ac", "2", combinedPath
        ]

        do {
            try combineTask.run()
            combineTask.waitUntilExit()

            let mp3Task = Process()
            mp3Task.executableURL = URL(fileURLWithPath: ffmpegPath)
            mp3Task.arguments = ["-y", "-i", combinedPath, "-codec:a", "libmp3lame", "-qscale:a", "2", "-ar", "44100", mp3Path]
            
            try mp3Task.run()
            mp3Task.waitUntilExit()
            
            if FileManager.default.fileExists(atPath: mp3Path) {
                ResponseHandler.returnResponse(["code": "RECORDING_STOPPED", "path": mp3Path, "timestamp": ISO8601DateFormatter().string(from: Date()), "combined": true])
                try? FileManager.default.removeItem(atPath: systemPath)
                try? FileManager.default.removeItem(atPath: micPath)
                try? FileManager.default.removeItem(atPath: combinedPath)
            } else {
                throw NSError(domain: "RecorderCLI", code: 103, userInfo: [NSLocalizedDescriptionKey: "MP3 conversion failed"])
            }
        } catch {
            ResponseHandler.returnResponse(["code": "RECORDING_ERROR", "error": "Audio processing failed: \(error.localizedDescription)"])
        }
    }
    
    func pauseRecording() { /* ... implementation needed ... */ }
    func resumeRecording() { /* ... implementation needed ... */ }
    
    // Function to start the recording process
    func startRecordingProcess() {
        if !isInitialized {
            isInitialized = true
            
            if audioSource == "both" {
                do {
                    try setupMicrophoneForCombinedRecording()
                    initializeSystemAudioRecording()
                } catch {
                    sendResponse(["code": "RECORDING_FAILED", "error": "Failed to initialize combined recording: \(error.localizedDescription)"])
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
        
        if audioSource == "both" {
            guard let systemPath = systemTempWavPath else {
                ResponseHandler.returnResponse(["code": "SYSTEM_AUDIO_PATH_ERROR", "error": "System audio path not set"])
                return
            }
            prepareAudioFile(at: systemPath)
        }
        
        updateAvailableContent()
    }

    // Override the existing executeRecordingProcess
    func executeRecordingProcess() {
        print("Starting recording process with source: \(audioSource)")
        
        if audioSource == "both" || audioSource == "system" {
            PermissionsRequester.requestScreenCaptureAccess { [weak self] granted in
                guard let self = self else { return }
                
                if granted {
                    let timestamp = Date()
                    let baseFilename = self.recordingFilename ?? timestamp.toFormattedFileName()
                    
                    if self.audioSource == "both" {
                        self.systemTempWavPath = "\(self.recordingPath!)/\(baseFilename)_system.wav"
                        self.micTempWavPath = "\(self.recordingPath!)/\(baseFilename)_mic.wav"
                        self.combinedTempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
                        self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
                    } else {
                        self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
                        self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
                    }
                    
                    self.setupInterruptSignalHandler()
                    self.startRecordingProcess()
                    self.semaphoreRecordingStopped.wait()
                } else {
                    ResponseHandler.returnResponse(["code": "PERMISSION_DENIED", "error": "Screen recording permission is required"])
                }
            }
        } else {
            setupMicrophoneRecording()
        }
    }

    func setupMicrophoneRecording() {
        print("Setting up microphone-only recording...")
        
        let timestamp = Date()
        let baseFilename = self.recordingFilename ?? timestamp.toFormattedFileName()
        self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
        self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
            
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        do {
            microphoneRecorder = try AVAudioRecorder(url: URL(fileURLWithPath: tempWavPath!), settings: settings)
            microphoneRecorder?.delegate = self
            if microphoneRecorder?.prepareToRecord() == true && microphoneRecorder?.record() ?? false {
                micRecordingActive = true
                sendResponse(["code": "RECORDING_STARTED", "path": self.finalMp3Path!, "timestamp": ISO8601DateFormatter().string(from: Date())])
            } else {
                sendResponse(["code": "RECORDING_FAILED", "error": "Failed to start microphone recording"])
            }
        } catch {
            sendResponse(["code": "RECORDING_FAILED", "error": "Microphone setup error: \(error.localizedDescription)"])
        }
    }
    
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if audioSource == "both" {
            micRecordingActive = false
            if !systemRecordingActive { combineAndConvertRecordings() }
        } else if flag {
            convertAndFinish()
        } else {
            ResponseHandler.returnResponse(["code": "RECORDING_STOPPED", "error": "Recording failed to complete properly"])
        }
    }
    
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        ResponseHandler.returnResponse(["code": "RECORDING_ERROR", "error": "Encoding error: \(error?.localizedDescription ?? "unknown")"])
    }

    func setupInterruptSignalHandler() {
        signal(SIGINT, handleInterruptSignal)
    }
    
    func stopAndCombineRecordings() {
        print("Stopping all recording components...")
        
        if microphoneRecorder?.isRecording == true {
            microphoneRecorder?.stop()
        }
        
        if RecorderCLI.screenCaptureStream != nil {
            RecorderCLI.screenCaptureStream?.stopCapture()
        }
        
        // Final combination is handled in delegate methods
    }
    
    func convertAndFinish() {
        let timestamp = Date()
        let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
        
        let sourceFile = self.tempWavPath
        let outputPath = self.finalMp3Path ?? ""
        
        if let wavPath = sourceFile, FileManager.default.fileExists(atPath: wavPath) {
            let mp3Path = self.finalMp3Path ?? wavPath.replacingOccurrences(of: ".wav", with: ".mp3")
            
            if FileManager.default.fileExists(atPath: mp3Path) {
                try? FileManager.default.removeItem(atPath: mp3Path)
            }
            
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/sh")
            task.arguments = ["-c", "ffmpeg -i \"\(wavPath)\" -codec:a libmp3lame -qscale:a 2 -ar 44100 \"\(mp3Path)\" -y"]
            
            do {
                try task.run()
                task.waitUntilExit()
                
                if task.terminationStatus == 0 && FileManager.default.fileExists(atPath: mp3Path) {
                    sendResponse(["code": "RECORDING_STOPPED", "timestamp": formattedTimestamp, "path": mp3Path, "combined": false])
                    try? FileManager.default.removeItem(atPath: wavPath)
                } else {
                    sendResponse(["code": "RECORDING_STOPPED", "timestamp": formattedTimestamp, "path": wavPath, "error": "MP3 conversion failed", "combined": false])
                }
            } catch {
                sendResponse(["code": "RECORDING_STOPPED", "timestamp": formattedTimestamp, "path": wavPath, "error": "MP3 conversion error: \(error.localizedDescription)", "combined": false])
            }
        } else {
            sendResponse(["code": "RECORDING_STOPPED", "timestamp": formattedTimestamp, "path": outputPath, "error": "No recording file created", "combined": false])
        }
    }

    func updateAvailableContent() {
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self = self else { return }
            if let error = error {
                ResponseHandler.returnResponse(["code": "CONTENT_ERROR", "error": "Could not get sharable content: \(error.localizedDescription)"])
                return
            }
            guard let content = content, !content.displays.isEmpty else {
                ResponseHandler.returnResponse(["code": "NO_DISPLAY_FOUND", "error": "No displays available for screen capture"])
                return
            }
            self.contentEligibleForSharing = content
            self.setupRecordingEnvironment()
        }
    }

    func setupRecordingEnvironment() {
        // For combined recording, check for Bluetooth limitation upfront
        if audioSource == "both" && AudioDeviceManager.isCurrentOutputDeviceBluetooth() {
            let currentDevice = AudioDeviceManager.getCurrentDeviceName()
            print("❌ Bluetooth device detected - combined recording not supported")
            
            // Stop microphone recording if it was started
            if microphoneRecorder?.isRecording == true {
                microphoneRecorder?.stop()
                micRecordingActive = false
            }
            
            // Send immediate error for Bluetooth limitation
            ResponseHandler.returnResponse([
                "code": "COMBINED_RECORDING_FAILED_BLUETOOTH",
                "error": "Combined recording failed: System audio capture not available with Bluetooth devices.",
                "timestamp": ISO8601DateFormatter().string(from: Date()),
                "device": currentDevice,
                "recommendation": "Switch to wired headphones or built-in speakers for combined recording."
            ])
            return // Stop the setup process
        }

        guard let firstDisplay = contentEligibleForSharing?.displays.first else {
            ResponseHandler.returnResponse(["code": "SETUP_ERROR", "error": "No display found"])
            return
        }
        
        if audioSource != "both" {
            prepareAudioFile(at: self.tempWavPath!)
        }

        let screenContentFilter = SCContentFilter(display: firstDisplay, excludingApplications: [], exceptingWindows: [])
        Task { 
            do {
                try await initiateRecording(with: screenContentFilter)
            } catch {
                ResponseHandler.returnResponse(["code": "RECORDING_FAILED", "error": "Failed to initiate recording: \(error.localizedDescription)"])
            }
        }
    }

    func prepareAudioFile(at path: String) {
        do {
            if FileManager.default.fileExists(atPath: path) {
                try FileManager.default.removeItem(atPath: path)
            }
            RecorderCLI.audioFileForRecording = try AVAudioFile(
                forWriting: URL(fileURLWithPath: path),
                settings: [
                    AVSampleRateKey: 44100,
                    AVNumberOfChannelsKey: 2,
                    AVFormatIDKey: kAudioFormatLinearPCM
                ],
                commonFormat: .pcmFormatFloat32,
                interleaved: false
            )
        } catch {
            ResponseHandler.returnResponse(["code": "AUDIO_FILE_CREATION_FAILED", "error": error.localizedDescription])
        }
    }

    func initiateRecording(with filter: SCContentFilter) async throws {
        let streamConfiguration = SCStreamConfiguration()
        configureStream(streamConfiguration)
        let outputPath = self.finalMp3Path ?? ""

        do {
            RecorderCLI.screenCaptureStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)
            try RecorderCLI.screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
            try await RecorderCLI.screenCaptureStream?.startCapture()
            
            systemRecordingActive = true
            
            if audioSource == "both" {
                sendResponse(["code": "RECORDING_STARTED", "path": outputPath, "timestamp": ISO8601DateFormatter().string(from: Date()), "mode": "combined", "combined": true])
            } else {
                sendResponse(["code": "RECORDING_STARTED", "path": outputPath, "timestamp": ISO8601DateFormatter().string(from: Date())])
            }
        } catch {
            if audioSource == "both" {
                if microphoneRecorder?.isRecording == true { microphoneRecorder?.stop() }
                ResponseHandler.returnResponse(["code": "COMBINED_RECORDING_FAILED_SYSTEM", "error": "System audio capture failed: \(error.localizedDescription)"])
            } else {
                ResponseHandler.returnResponse(["code": "RECORDING_FAILED", "error": "Failed to initiate recording: \(error.localizedDescription)"])
            }
            throw error
        }
    }

    private func sendResponse(_ response: [String: Any]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: response, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
                fflush(stdout)
            }
        } catch {
            print("Error creating JSON response: \(error)")
        }
    }

    func configureStream(_ configuration: SCStreamConfiguration) {
        configuration.width = 1
        configuration.height = 1
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        configuration.showsCursor = false
        configuration.capturesAudio = true
        configuration.sampleRate = 44100
        configuration.channelCount = 2
        configuration.excludesCurrentProcessAudio = true
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard let audioBuffer = sampleBuffer.asPCMBuffer, sampleBuffer.isValid else { return }
        do {
            try RecorderCLI.audioFileForRecording?.write(from: audioBuffer)
        } catch {
            print("Failed to write audio buffer: \(error.localizedDescription)")
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        systemRecordingActive = false
        if audioSource == "both" {
            if !micRecordingActive { 
                combineAndConvertRecordings() 
            }
        } else {
            ResponseHandler.returnResponse(["code": "STREAM_ERROR", "error": error.localizedDescription], shouldExitProcess: false)
            convertAndFinish()
        }
        semaphoreRecordingStopped.signal()
    }

    static func terminateRecording() {
        screenCaptureStream?.stopCapture()
        screenCaptureStream = nil
        audioFileForRecording = nil
        if let recorder = recorderInstance?.microphoneRecorder, recorder.isRecording {
            recorder.stop()
        }
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
        if CGPreflightScreenCaptureAccess() {
            completion(true)
        } else {
            // This is a non-blocking request
            let access = CGRequestScreenCaptureAccess()
            completion(access)
        }
    }
}

class ResponseHandler {
    static func returnResponse(_ response: [String: Any], shouldExitProcess: Bool = true) {
        do {
            let data = try JSONSerialization.data(withJSONObject: response, options: .prettyPrinted)
            if let jsonString = String(data: data, encoding: .utf8) {
                print(jsonString)
                fflush(stdout)
            }
        } catch {
            print("{\"code\": \"JSON_ERROR\", \"error\": \"Failed to serialize response\"}")
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