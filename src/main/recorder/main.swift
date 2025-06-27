import AVFoundation
import ScreenCaptureKit

class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput {
    static var screenCaptureStream: SCStream?
    static var audioFileForRecording: AVAudioFile?
    static var systemAudioFile: AVAudioFile?  // Separate file for system audio only
    var contentEligibleForSharing: SCShareableContent?
    let semaphoreRecordingStopped = DispatchSemaphore(value: 0)
    var recordingPath: String?
    var recordingFilename: String?
    var streamFunctionCalled = false
    var streamFunctionTimeout: TimeInterval = 0.5 // Timeout in seconds
    
    // Live transcription support
    var enableLiveTranscription = false
    var transcriptionChunkDuration: TimeInterval = 2.0  // Default 2 seconds
    var currentChunkStartTime: CMTime = CMTime.zero
    var audioBufferQueue: [AVAudioPCMBuffer] = []
    let audioBufferQueueLock = NSLock()
    var isRecording = false

    override init() {
        super.init()
        processCommandLineArguments()
    }

    func processCommandLineArguments() {
        let arguments = CommandLine.arguments
        
        // Debug: Print all arguments received
        ResponseHandler.returnResponse([
            "code": "DEBUG",
            "message": "Swift recorder arguments: \(arguments.joined(separator: " "))"
        ], shouldExitProcess: false)
        
        guard arguments.contains("--record") else {
            if arguments.contains("--check-permissions") {
                PermissionsRequester.requestScreenCaptureAccess { granted in
                    if granted {
                        ResponseHandler.returnResponse(["code": "PERMISSION_GRANTED"])
                    } else {
                        ResponseHandler.returnResponse(["code": "PERMISSION_DENIED"])
                    }
                }
            } else {
                ResponseHandler.returnResponse(["code": "INVALID_ARGUMENTS"])
            }

            return
        }

        if let recordIndex = arguments.firstIndex(of: "--record"), recordIndex + 1 < arguments.count {
            recordingPath = arguments[recordIndex + 1]
        } else {
            ResponseHandler.returnResponse(["code": "NO_PATH_SPECIFIED"])
        }

        if let filenameIndex = arguments.firstIndex(of: "--filename"), filenameIndex + 1 < arguments.count {
            recordingFilename = arguments[filenameIndex + 1]
        }
        
        // Check for live transcription flag
        if arguments.contains("--live-transcription") {
            enableLiveTranscription = true
            ResponseHandler.returnResponse([
                "code": "DEBUG",
                "message": "✅ Live transcription ENABLED via --live-transcription flag"
            ], shouldExitProcess: false)
        } else {
            ResponseHandler.returnResponse([
                "code": "DEBUG",
                "message": "❌ Live transcription NOT enabled - no --live-transcription flag found"
            ], shouldExitProcess: false)
        }
        
        // Debug: Final state
        ResponseHandler.returnResponse([
            "code": "DEBUG",
            "message": "Swift recorder initialized - recordingPath: \(recordingPath ?? "nil"), enableLiveTranscription: \(enableLiveTranscription)"
        ], shouldExitProcess: false)
    }

    func executeRecordingProcess() {
        // Use already parsed recording path and filename from processCommandLineArguments
        guard let recordPath = recordingPath, let filename = recordingFilename else {
            ResponseHandler.returnResponse(["code": "INVALID_ARGUMENTS"])
            return
        }

        self.recordingPath = recordPath
        
        // Prepare both combined and system-only audio files
        let combinedPath = "\(recordPath)/\(filename)"
        let systemOnlyPath = "\(recordPath)/system_only_\(filename)"
        
        prepareAudioFile(at: combinedPath)
        prepareSystemAudioFile(at: systemOnlyPath)

        PermissionsRequester.requestScreenCaptureAccess { granted in
            guard granted else {
                ResponseHandler.returnResponse(["code": "PERMISSION_DENIED"])
                self.semaphoreRecordingStopped.signal() // Signal to exit
                return
            }

            ResponseHandler.returnResponse([
                "code": "DEBUG",
                "message": "Screen capture permission granted, starting recording..."
            ], shouldExitProcess: false)

            self.updateAvailableContent()
        }

        semaphoreRecordingStopped.wait()
    }

    func setupInterruptSignalHandler() {
        let interruptSignalHandler: @convention(c) (Int32) -> Void = { signal in
            if signal == SIGINT {
                // Note: Can't access instance method from static context, 
                // so we'll handle isRecording in terminateRecording
                RecorderCLI.terminateRecording()

                let timestamp = Date()
                let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
                ResponseHandler.returnResponse(["code": "RECORDING_STOPPED", "timestamp": formattedTimestamp])
            }
        }

        signal(SIGINT, interruptSignalHandler)
    }

    func setupStreamFunctionTimeout() {
        DispatchQueue.global().asyncAfter(deadline: .now() + streamFunctionTimeout) { [weak self] in
            guard let self = self else { return }
            if !self.streamFunctionCalled {
                RecorderCLI.terminateRecording()
                ResponseHandler.returnResponse(["code": "STREAM_FUNCTION_NOT_CALLED"], shouldExitProcess: true)
            } else {
                let timestamp = Date()
                let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)

                let filename = self.recordingFilename ?? timestamp.toFormattedFileName()
                let pathForAudioFile = "\(self.recordingPath!)/\(filename).flac"
                self.prepareAudioFile(at: pathForAudioFile)
    
                ResponseHandler.returnResponse(["code": "RECORDING_STARTED", "path": pathForAudioFile, "timestamp": formattedTimestamp], shouldExitProcess: false)
            }
        }
    }
    
    func setupLiveTranscriptionTimer() {
        // Use background queue with timer since command-line tools don't have main run loop
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            // Log timer setup
            ResponseHandler.returnResponse([
                "code": "SYSTEM_AUDIO_DEBUG",
                "message": "🔄 SYSTEM AUDIO: Setting up live transcription timer with \(self.transcriptionChunkDuration) second intervals"
            ], shouldExitProcess: false)
            
            var cycleCount = 0
            
            // Use a simple loop instead of Timer for command-line tool
            while self.isRecording {
                cycleCount += 1
                
                ResponseHandler.returnResponse([
                    "code": "SYSTEM_AUDIO_DEBUG",
                    "message": "⏰ SYSTEM AUDIO: Timer cycle \(cycleCount) - sleeping for \(self.transcriptionChunkDuration) seconds"
                ], shouldExitProcess: false)
                
                Thread.sleep(forTimeInterval: self.transcriptionChunkDuration)
                
                // Check if we're still recording
                guard self.isRecording else {
                    ResponseHandler.returnResponse([
                        "code": "SYSTEM_AUDIO_DEBUG",
                        "message": "🛑 SYSTEM AUDIO: Live transcription timer stopped - recording ended at cycle \(cycleCount)"
                    ], shouldExitProcess: false)
                    break
                }
                
                ResponseHandler.returnResponse([
                    "code": "SYSTEM_AUDIO_DEBUG",
                    "message": "🔄 SYSTEM AUDIO: Timer cycle \(cycleCount) - about to process audio chunk"
                ], shouldExitProcess: false)
                
                self.processAudioChunkForTranscription()
            }
            
            ResponseHandler.returnResponse([
                "code": "SYSTEM_AUDIO_DEBUG",
                "message": "🏁 SYSTEM AUDIO: Live transcription timer completed after \(cycleCount) cycles"
            ], shouldExitProcess: false)
        }
    }
    
    func processAudioChunkForTranscription() {
        audioBufferQueueLock.lock()
        defer { audioBufferQueueLock.unlock() }
        
        let bufferCount = audioBufferQueue.count
        
        // Always log processing attempts to help debug
        ResponseHandler.returnResponse([
            "code": "SYSTEM_AUDIO_DEBUG",
            "message": "🔍 SYSTEM AUDIO: processAudioChunkForTranscription called - buffer count: \(bufferCount), isRecording: \(isRecording)"
        ], shouldExitProcess: false)
        
        guard !audioBufferQueue.isEmpty else {
            // Debug: Log when no audio buffers are available
            ResponseHandler.returnResponse([
                "code": "SYSTEM_AUDIO_DEBUG",
                "message": "⚠️ SYSTEM AUDIO: No audio buffers for transcription chunk - queue is empty"
            ], shouldExitProcess: false)
            return
        }
        
        // Debug: Log buffer processing
        ResponseHandler.returnResponse([
            "code": "SYSTEM_AUDIO_DEBUG",
            "message": "📊 SYSTEM AUDIO: Processing \(bufferCount) audio buffers for transcription"
        ], shouldExitProcess: false)
        
        // Combine buffered audio into a single chunk
        let combinedBuffer = combineAudioBuffers(audioBufferQueue)
        audioBufferQueue.removeAll()
        
        guard let combinedBuffer = combinedBuffer else {
            ResponseHandler.returnResponse([
                "code": "SYSTEM_AUDIO_DEBUG",
                "message": "❌ SYSTEM AUDIO: Failed to combine \(bufferCount) audio buffers"
            ], shouldExitProcess: false)
            return
        }
        
        ResponseHandler.returnResponse([
            "code": "SYSTEM_AUDIO_DEBUG",
            "message": "✅ SYSTEM AUDIO: Successfully combined \(bufferCount) buffers into single chunk with \(combinedBuffer.frameLength) frames"
        ], shouldExitProcess: false)
        
        // Save chunk to temporary file for transcription
        let tempChunkPath = saveAudioChunkToFile(combinedBuffer)
        if let chunkPath = tempChunkPath {
            // Output the chunk path for the transcription service to pick up
            ResponseHandler.returnResponse([
                "code": "TRANSCRIPTION_CHUNK", 
                "path": chunkPath,
                "stream_type": "system"
            ], shouldExitProcess: false)
            
            ResponseHandler.returnResponse([
                "code": "SYSTEM_AUDIO_DEBUG",
                "message": "🎵 SYSTEM AUDIO: Successfully generated TRANSCRIPTION_CHUNK: \(chunkPath)"
            ], shouldExitProcess: false)
        } else {
            ResponseHandler.returnResponse([
                "code": "SYSTEM_AUDIO_DEBUG",
                "message": "❌ SYSTEM AUDIO: Failed to save audio chunk to file"
            ], shouldExitProcess: false)
        }
    }
    
    func combineAudioBuffers(_ buffers: [AVAudioPCMBuffer]) -> AVAudioPCMBuffer? {
        guard !buffers.isEmpty else { return nil }
        
        let format = buffers[0].format
        let totalFrames = buffers.reduce(0) { $0 + $1.frameLength }
        
        guard let combinedBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: totalFrames) else {
            return nil
        }
        
        var currentFrame: AVAudioFramePosition = 0
        for buffer in buffers {
            let framesToCopy = min(buffer.frameLength, combinedBuffer.frameCapacity - AVAudioFrameCount(currentFrame))
            
            if let srcFloatChannelData = buffer.floatChannelData,
               let dstFloatChannelData = combinedBuffer.floatChannelData {
                for channel in 0..<Int(format.channelCount) {
                    let src = srcFloatChannelData[channel]
                    let dst = dstFloatChannelData[channel].advanced(by: Int(currentFrame))
                                         dst.update(from: src, count: Int(framesToCopy))
                }
            }
            
            currentFrame += AVAudioFramePosition(framesToCopy)
        }
        
        combinedBuffer.frameLength = AVAudioFrameCount(currentFrame)
        return combinedBuffer
    }
    
    func saveAudioChunkToFile(_ buffer: AVAudioPCMBuffer) -> String? {
        let timestamp = Date().timeIntervalSince1970
        let chunkFilename = "system_audio_chunk_\(timestamp).wav"
        let chunkPath = "\(recordingPath!)/\(chunkFilename)"
        
        // Debug: Log buffer format details and check for audio content
        let hasValidAudio = validateAudioBuffer(buffer)
        ResponseHandler.returnResponse([
            "code": "DEBUG",
            "message": "Saving audio chunk - Format: \(buffer.format.sampleRate)Hz, \(buffer.format.channelCount) channels, \(buffer.frameLength) frames, hasValidAudio: \(hasValidAudio)"
        ], shouldExitProcess: false)
        
        // Skip saving if buffer doesn't contain valid audio data
        guard hasValidAudio else {
            ResponseHandler.returnResponse([
                "code": "DEBUG",
                "message": "Skipping save - audio buffer contains no valid audio data"
            ], shouldExitProcess: false)
            return nil
        }
        
        do {
            // First save in original format to preserve quality
            let originalPath = "\(recordingPath!)/original_\(chunkFilename)"
            let originalFile = try AVAudioFile(forWriting: URL(fileURLWithPath: originalPath), 
                                             settings: buffer.format.settings)
            try originalFile.write(from: buffer)
            
            // Create a proper transcription format with better settings
            let transcriptionFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, 
                                                   sampleRate: 16000, 
                                                   channels: 1, 
                                                   interleaved: false)!
            
            // Create converter with better error handling
            guard let converter = AVAudioConverter(from: buffer.format, to: transcriptionFormat) else {
                ResponseHandler.returnResponse([
                    "code": "DEBUG",
                    "message": "Failed to create audio converter from \(buffer.format) to \(transcriptionFormat)"
                ], shouldExitProcess: false)
                return originalPath // Return original format file as fallback
            }
            
            // Calculate the output buffer size more accurately
            let ratio = transcriptionFormat.sampleRate / buffer.format.sampleRate
            let outputFrameCapacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * ratio))
            
            guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: transcriptionFormat, frameCapacity: outputFrameCapacity) else {
                ResponseHandler.returnResponse([
                    "code": "DEBUG",
                    "message": "Failed to create output buffer with capacity \(outputFrameCapacity)"
                ], shouldExitProcess: false)
                return originalPath // Return original format file as fallback
            }
            
            // Improved conversion with proper input handling
            var error: NSError?
            var inputBufferUsed = false
            
            let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
                guard !inputBufferUsed else {
                    outStatus.pointee = .noDataNow
                    return nil
                }
                outStatus.pointee = .haveData
                inputBufferUsed = true // Mark as used to ensure we only return the buffer once
                return buffer
            }
            
            let status = converter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)
            
            if status == .error {
                ResponseHandler.returnResponse([
                    "code": "DEBUG",
                    "message": "Audio conversion failed: \(error?.localizedDescription ?? "Unknown error")"
                ], shouldExitProcess: false)
                return originalPath // Return original format file as fallback
            }
            
            // Validate the converted audio
            let convertedHasAudio = validateAudioBuffer(outputBuffer)
            ResponseHandler.returnResponse([
                "code": "DEBUG",
                "message": "Conversion result: \(outputBuffer.frameLength) frames, hasValidAudio: \(convertedHasAudio)"
            ], shouldExitProcess: false)
            
            if !convertedHasAudio {
                ResponseHandler.returnResponse([
                    "code": "DEBUG",
                    "message": "Converted audio is invalid, using original format"
                ], shouldExitProcess: false)
                return originalPath // Return original format file if conversion corrupted audio
            }
            
            // Save the converted audio with float format (better for transcription)
            let audioFile = try AVAudioFile(forWriting: URL(fileURLWithPath: chunkPath), 
                                          settings: [
                                            AVFormatIDKey: kAudioFormatLinearPCM,
                                            AVSampleRateKey: 16000,
                                            AVNumberOfChannelsKey: 1,
                                            AVLinearPCMBitDepthKey: 32,
                                            AVLinearPCMIsFloatKey: true, // Use float for better precision
                                            AVLinearPCMIsBigEndianKey: false
                                          ])
            try audioFile.write(from: outputBuffer)
            
            // Verify file exists and has content
            if FileManager.default.fileExists(atPath: chunkPath) {
                let fileSize = (try? FileManager.default.attributesOfItem(atPath: chunkPath)[.size] as? NSNumber)?.intValue ?? 0
                ResponseHandler.returnResponse([
                    "code": "DEBUG",
                    "message": "✅ Converted file created: \(chunkPath) (\(fileSize) bytes)"
                ], shouldExitProcess: false)
                
                // Clean up original file since conversion was successful
                try? FileManager.default.removeItem(atPath: originalPath)
                
                return chunkPath
            } else {
                ResponseHandler.returnResponse([
                    "code": "DEBUG", 
                    "message": "❌ Converted file NOT found, using original: \(originalPath)"
                ], shouldExitProcess: false)
                return originalPath
            }
            
        } catch {
            ResponseHandler.returnResponse([
                "code": "DEBUG",
                "message": "Failed to save audio chunk: \(error.localizedDescription)"
            ], shouldExitProcess: false)
            return nil
        }
    }
    
    func validateAudioBuffer(_ buffer: AVAudioPCMBuffer) -> Bool {
        guard buffer.frameLength > 0 else { return false }
        
        // Check if buffer has valid audio data by looking for non-zero samples
        guard let floatChannelData = buffer.floatChannelData else { return false }
        
        let frameLength = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        var maxAmplitude: Float = 0.0
        var sampleCount = 0
        
        for channel in 0..<channelCount {
            let channelData = floatChannelData[channel]
            for frame in 0..<frameLength {
                let sample = abs(channelData[frame])
                maxAmplitude = max(maxAmplitude, sample)
                if sample > 0.001 { // Threshold for non-silent audio
                    sampleCount += 1
                }
            }
        }
        
        // Consider buffer valid if it has some amplitude and non-silent samples
        let hasAudio = maxAmplitude > 0.001 && sampleCount > frameLength / 20 // At least 5% non-silent
        
        ResponseHandler.returnResponse([
            "code": "DEBUG",
            "message": "Audio validation - Max amplitude: \(maxAmplitude), Non-silent samples: \(sampleCount)/\(frameLength * channelCount), Valid: \(hasAudio)"
        ], shouldExitProcess: false)
        
        return hasAudio
    }

    func updateAvailableContent() {
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { [weak self] content, _ in
            guard let self = self else { return }
            self.contentEligibleForSharing = content
            self.setupRecordingEnvironment()
        }
    }

    func setupRecordingEnvironment() {
        guard let firstDisplay = contentEligibleForSharing?.displays.first else {
            ResponseHandler.returnResponse(["code": "NO_DISPLAY_FOUND"])
            semaphoreRecordingStopped.signal() // Signal to exit
            return
        }

        let screenContentFilter = SCContentFilter(display: firstDisplay, excludingApplications: [], exceptingWindows: [])

        Task { await initiateRecording(with: screenContentFilter) }
    }

    func prepareAudioFile(at path: String) {
        do {
            RecorderCLI.audioFileForRecording = try AVAudioFile(forWriting: URL(fileURLWithPath: path), settings: [AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2, AVFormatIDKey: kAudioFormatFLAC], commonFormat: .pcmFormatFloat32, interleaved: false)
        } catch {
            ResponseHandler.returnResponse(["code": "AUDIO_FILE_CREATION_FAILED"])
        }
    }

    func prepareSystemAudioFile(at path: String) {
        do {
            RecorderCLI.systemAudioFile = try AVAudioFile(forWriting: URL(fileURLWithPath: path), settings: [AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2, AVFormatIDKey: kAudioFormatFLAC], commonFormat: .pcmFormatFloat32, interleaved: false)
        } catch {
            ResponseHandler.returnResponse(["code": "SYSTEM_AUDIO_FILE_CREATION_FAILED"])
        }
    }

    func initiateRecording(with filter: SCContentFilter) async {
        let streamConfiguration = SCStreamConfiguration()
        configureStream(streamConfiguration)

        do {
            RecorderCLI.screenCaptureStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)

            try RecorderCLI.screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
            try await RecorderCLI.screenCaptureStream?.startCapture()
            
            // Mark as recording and start live transcription timer
            isRecording = true
            ResponseHandler.returnResponse([
                "code": "DEBUG",
                "message": "Stream started successfully, isRecording=true, enableLiveTranscription=\(enableLiveTranscription)"
            ], shouldExitProcess: false)
            
            if enableLiveTranscription {
                ResponseHandler.returnResponse([
                    "code": "DEBUG",
                    "message": "About to start live transcription timer..."
                ], shouldExitProcess: false)
                setupLiveTranscriptionTimer()
            }
        } catch {
            ResponseHandler.returnResponse(["code": "CAPTURE_FAILED"])
            semaphoreRecordingStopped.signal() // Signal to exit on failure
        }
    }

    func configureStream(_ configuration: SCStreamConfiguration) {
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale.max)
        configuration.showsCursor = false
        configuration.capturesAudio = true
        configuration.sampleRate = 48000
        configuration.channelCount = 2
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        self.streamFunctionCalled = true
        guard let audioBuffer = sampleBuffer.asPCMBuffer, sampleBuffer.isValid else { return }

        // Write to main combined recording file
        do {
            try RecorderCLI.audioFileForRecording?.write(from: audioBuffer)
        } catch {
            ResponseHandler.returnResponse(["code": "AUDIO_BUFFER_WRITE_FAILED"])
        }
        
        // Write to system-only recording file for debugging
        do {
            try RecorderCLI.systemAudioFile?.write(from: audioBuffer)
        } catch {
            ResponseHandler.returnResponse([
                "code": "DEBUG",
                "message": "Failed to write to system-only file: \(error.localizedDescription)"
            ], shouldExitProcess: false)
        }
        
        // Also buffer for live transcription if enabled
        if enableLiveTranscription {
            audioBufferQueueLock.lock()
            audioBufferQueue.append(audioBuffer)
            let currentQueueSize = audioBufferQueue.count
            audioBufferQueueLock.unlock()
            
            // Log first buffer and then every 20 buffers to avoid spam
            if currentQueueSize == 1 {
                ResponseHandler.returnResponse([
                    "code": "SYSTEM_AUDIO_DEBUG",
                    "message": "🎵 SYSTEM AUDIO: First audio buffer received for live transcription!"
                ], shouldExitProcess: false)
            } else if currentQueueSize % 20 == 0 {
                ResponseHandler.returnResponse([
                    "code": "SYSTEM_AUDIO_DEBUG",
                    "message": "🎵 SYSTEM AUDIO: Audio buffer queue size: \(currentQueueSize) buffers"
                ], shouldExitProcess: false)
            }
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        ResponseHandler.returnResponse(["code": "STREAM_ERROR"], shouldExitProcess: false)
        isRecording = false
        RecorderCLI.terminateRecording()
        semaphoreRecordingStopped.signal()
    }

    static func terminateRecording() {
        screenCaptureStream?.stopCapture()
        screenCaptureStream = nil
        audioFileForRecording = nil
        systemAudioFile = nil
    }
    
    func stopRecording() {
        isRecording = false
        RecorderCLI.terminateRecording()
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
        if !CGPreflightScreenCaptureAccess() {
            let result = CGRequestScreenCaptureAccess()
            completion(result)
        } else {
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
        
        // Force flush stderr as well in case something goes there
        fflush(stderr)

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

let app = RecorderCLI()
app.executeRecordingProcess() 