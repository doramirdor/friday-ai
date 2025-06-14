import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreAudio

@available(macOS 13.0, *)
final class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput, AVAudioRecorderDelegate {
    // PUBLIC CONFIG -----------------
    var audioSource: String = "system" // mic | system | both

    // PRIVATE STATE -----------------
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
    
    // Audio-only mode to avoid Bluetooth disconnection
    private var audioOnlyMode = false

    // MARK: – CLI entry
    override init() {
        super.init()
        parseCLI()
    }

    func executeRecordingProcess() {
        // Check if this is a permission check request
        if CommandLine.arguments.contains("--check-permissions") {
            checkPermissionsAndRespond()
            return
        }
        
        // Check if audio-only mode is requested (to avoid Bluetooth disconnection)
        if CommandLine.arguments.contains("--audio-only") {
            audioOnlyMode = true
            print("🎵 Audio-only mode enabled - avoiding Bluetooth disconnection")
        }
        
        // Handle Bluetooth output device for system audio recording
        if (audioSource == "system" || audioSource == "both") && AudioDeviceManager.isCurrentOutputDeviceBluetooth() {
            if audioOnlyMode {
                print("🎧 Bluetooth output detected in audio-only mode - preserving Bluetooth connection")
                print("⚠️ System audio capture will be limited with Bluetooth output, but Bluetooth stays connected")
                // Don't switch output device in audio-only mode to preserve Bluetooth connection
            } else {
                print("⚠️  Bluetooth output detected - this will prevent system audio capture")
                print("🔄 Attempting to switch to built-in speakers for better system audio capture...")
                
                if let builtInDevice = AudioDeviceManager.builtInOutputID() {
                    if AudioDeviceManager.setDefaultOutputDevice(builtInDevice) {
                        print("✅ Switched to built-in speakers for recording")
                    } else {
                        print("❌ Failed to switch to built-in speakers")
                        ResponseHandler.send([
                            "code": "COMBINED_RECORDING_FAILED_BLUETOOTH",
                            "error": "Cannot capture system audio with Bluetooth output device",
                            "recommendation": "Please switch to built-in speakers or wired headphones for system audio recording"
                        ])
                        return
                    }
                } else {
                    print("❌ No built-in speakers found for fallback")
                    ResponseHandler.send([
                        "code": "COMBINED_RECORDING_FAILED_BLUETOOTH", 
                        "error": "No built-in speakers available for system audio capture",
                        "recommendation": "Please connect wired headphones or speakers for system audio recording"
                    ])
                    return
                }
            }
        }
        
        if AudioDeviceManager.isCurrentInputDeviceBluetooth() {
            print("🎧 Input device is Bluetooth – recording from Bluetooth microphone.")
        }

        if audioSource == "mic" {
            startMicOnly()
            return
        }

        // Choose permission approach based on mode to avoid Bluetooth disconnection
        if audioOnlyMode {
            // Use microphone-only permissions to keep Bluetooth connected
            PermissionsRequester.requestAudioOnlyAccess { granted in
                guard granted else {
                    print("❌ Microphone permission denied")
                    ResponseHandler.send([
                        "code": "PERMISSION_DENIED",
                        "error": "Microphone permission required for audio recording",
                        "recommendation": "Grant microphone permission in System Settings > Privacy & Security > Microphone"
                    ])
                    return
                }
                
                print("✅ Audio-only permissions granted - Bluetooth should stay connected")
                if self.audioSource == "both" { self.startMicOnly() } // Start microphone first
                
                // In audio-only mode with Bluetooth, skip system audio to preserve connection
                if (self.audioSource == "both" || self.audioSource == "system") && AudioDeviceManager.isCurrentOutputDeviceBluetooth() {
                    print("🎧 Skipping system audio in audio-only mode to preserve Bluetooth connection")
                    // Send recording started for mic-only
                    if self.audioSource == "both" && self.micRecordingActive {
                        ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
                    }
                } else if self.audioSource == "both" || self.audioSource == "system" {
                    // Try system audio only if screen permissions are already available
                    if CGPreflightScreenCaptureAccess() {
                        print("✅ Screen permissions available - adding system audio")
                        self.startSystemAudio()
                    } else {
                        print("⚠️ Screen permissions not available - microphone only (Bluetooth preserved)")
                        // Send recording started for mic-only
                        if self.audioSource == "both" && self.micRecordingActive {
                            ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
                        }
                    }
                }
            }
        } else {
            // Traditional approach (may disconnect Bluetooth)
            PermissionsRequester.requestScreenCaptureAccess { granted in
                guard granted else {
                    // If screen permission denied, fallback to mic-only with clear message
                    print("❌ Screen capture permission denied - falling back to microphone-only recording")
                    ResponseHandler.send([
                        "code": "PERMISSION_DENIED_FALLBACK_MIC",
                        "message": "Screen recording permission required for system audio capture. Falling back to microphone-only recording.",
                        "recommendation": "Grant screen recording permission in System Settings > Privacy & Security > Screen Recording for full system audio capture."
                    ])
                    self.audioSource = "mic" // Switch to mic-only mode
                    self.startMicOnly()
                    return
                }
                if self.audioSource == "both" { self.startMicOnly() } // mic part first
                self.startSystemAudio()
            }
        }
    }
    
    // MARK: – Permission checking
    private func checkPermissionsAndRespond() {
        if audioOnlyMode {
            // Check audio-only permissions (won't disconnect Bluetooth)
            PermissionsRequester.requestAudioOnlyAccess { granted in
                if granted {
                    ResponseHandler.send(["code": "PERMISSION_GRANTED"])
                } else {
                    ResponseHandler.send(["code": "PERMISSION_DENIED"])
                }
            }
        } else {
            // Check screen capture permissions (may disconnect Bluetooth)
            PermissionsRequester.requestScreenCaptureAccess { granted in
                if granted {
                    ResponseHandler.send(["code": "PERMISSION_GRANTED"])
                } else {
                    ResponseHandler.send(["code": "PERMISSION_DENIED"])
                }
            }
        }
    }

    // MARK: – System audio via ScreenCaptureKit
    private func startSystemAudio() {
        print("Initialising ScreenCaptureKit …")
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { content, err in
            guard let display = content?.displays.first else {
                ResponseHandler.send(["code": "NO_DISPLAY_FOUND"]) ; return
            }
            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
            Task { try await self.beginCapture(filter: filter) }
        }
    }

    private func beginCapture(filter: SCContentFilter) async throws {
        let cfg = SCStreamConfiguration()
        cfg.width = 2 ; cfg.height = 2 ; cfg.capturesAudio = true ; cfg.sampleRate = 44100 ; cfg.channelCount = 2
        screenStream = SCStream(filter: filter, configuration: cfg, delegate: self)
        try screenStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
        let systemPath = urlInDir("_system.wav")
        systemAudioFile = try AVAudioFile(forWriting: systemPath, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 2])
        try await screenStream?.startCapture()
        systemRecordingActive = true
        print("✅ System audio recording started")
        
        // Send recording started confirmation after both mic and system are ready
        if audioSource == "both" && micRecordingActive && systemRecordingActive {
            ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
        } else if audioSource == "system" && systemRecordingActive {
            ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard let buf = sb.pcmBuffer else { return }
        try? systemAudioFile?.write(from: buf)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("System stream stopped: \(error.localizedDescription)")
        
        // Check if this is an unexpected stop (not user-initiated)
        let errorDescription = error.localizedDescription.lowercased()
        let isUserStopped = errorDescription.contains("user") && errorDescription.contains("stop")
        
        if !isUserStopped && systemRecordingActive && !isRecordingStopped && restartAttempts < maxRestartAttempts {
            restartAttempts += 1
            print("⚠️ System stream stopped unexpectedly - attempting restart #\(restartAttempts)/\(maxRestartAttempts) in 2 seconds...")
            
            // Wait a moment for system to stabilize
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                // Only restart if we're still supposed to be recording
                if self.systemRecordingActive && !self.isRecordingStopped && (self.audioSource == "system" || self.audioSource == "both") {
                    print("🔄 Restarting system audio capture...")
                    self.restartSystemAudio()
                }
            }
        } else {
            if restartAttempts >= maxRestartAttempts {
                print("❌ Maximum restart attempts reached (\(maxRestartAttempts)) - stopping system audio recording")
            } else {
                print("✅ System stream stopped normally (user-initiated or recording stopped)")
            }
            systemRecordingActive = false
            finishIfPossible()
        }
    }

    // Helper method to restart system audio capture
    private func restartSystemAudio() {
        print("🔄 Restarting system audio capture...")
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { content, err in
            guard let display = content?.displays.first else {
                print("❌ No display found for restart")
                self.systemRecordingActive = false
                self.finishIfPossible()
                return
            }
            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
            Task { 
                do {
                    try await self.beginCapture(filter: filter)
                    print("✅ System audio capture restarted successfully")
                } catch {
                    print("❌ Failed to restart system audio capture: \(error)")
                    self.systemRecordingActive = false
                    self.finishIfPossible()
                }
            }
        }
    }

    // MARK: – Microphone only path
    private func startMicOnly() {
        AudioDeviceManager.logAudioDiagnostics()
        
        // If Bluetooth input device, try Core Audio approach instead of AVAudioRecorder
        if AudioDeviceManager.isCurrentInputDeviceBluetooth() {
            print("🎧 Bluetooth microphone detected - using Core Audio approach...")
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
            AVNumberOfChannelsKey: 1,  // Mono for better compatibility
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
            
            // Send recording started confirmation for mic-only mode
            if audioSource == "mic" {
                ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
            }
            // For "both" mode, check if system audio is also ready
            else if audioSource == "both" && systemRecordingActive {
                ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
            }
        } catch {
            print("❌ Standard microphone recording failed: \(error.localizedDescription)")
            ResponseHandler.send(["code": "MIC_ERROR", "error": "Microphone recording failed: \(error.localizedDescription). Check microphone permissions in System Settings."])
        }
    }
    
    // MARK: - Bluetooth Recording with Core Audio
    private func startBluetoothRecording() {
        print("🎧 Starting Bluetooth microphone recording with Core Audio...")
        
        let micPath = urlInDir("_mic.wav")
        
        // Create audio file for Bluetooth recording
        let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1)!
        
        do {
            bluetoothAudioFile = try AVAudioFile(forWriting: micPath, settings: format.settings)
            
            // Set up Core Audio for Bluetooth recording
            var audioUnit: AudioUnit?
            var componentDesc = AudioComponentDescription(
                componentType: kAudioUnitType_Output,
                componentSubType: kAudioUnitSubType_HALOutput,
                componentManufacturer: kAudioUnitManufacturer_Apple,
                componentFlags: 0,
                componentFlagsMask: 0
            )
            
            guard let component = AudioComponentFindNext(nil, &componentDesc) else {
                throw NSError(domain: "CoreAudio", code: -1, userInfo: [
                    NSLocalizedDescriptionKey: "Could not find audio component"
                ])
            }
            
            let status = AudioComponentInstanceNew(component, &audioUnit)
            guard status == noErr, let audioUnit = audioUnit else {
                throw NSError(domain: "CoreAudio", code: Int(status), userInfo: [
                    NSLocalizedDescriptionKey: "Could not create audio unit: \(status)"
                ])
            }
            
            self.audioUnit = audioUnit
            
            // Enable input on the audio unit
            var enableInput: UInt32 = 1
            let enableInputStatus = AudioUnitSetProperty(
                audioUnit,
                kAudioOutputUnitProperty_EnableIO,
                kAudioUnitScope_Input,
                1, // input bus
                &enableInput,
                UInt32(MemoryLayout<UInt32>.size)
            )
            
            guard enableInputStatus == noErr else {
                throw NSError(domain: "CoreAudio", code: Int(enableInputStatus), userInfo: [
                    NSLocalizedDescriptionKey: "Could not enable input on audio unit: \(enableInputStatus)"
                ])
            }
            
            // Disable output on the audio unit (we're just recording)
            var disableOutput: UInt32 = 0
            let disableOutputStatus = AudioUnitSetProperty(
                audioUnit,
                kAudioOutputUnitProperty_EnableIO,
                kAudioUnitScope_Output,
                0, // output bus
                &disableOutput,
                UInt32(MemoryLayout<UInt32>.size)
            )
            
            guard disableOutputStatus == noErr else {
                throw NSError(domain: "CoreAudio", code: Int(disableOutputStatus), userInfo: [
                    NSLocalizedDescriptionKey: "Could not disable output on audio unit: \(disableOutputStatus)"
                ])
            }
            
            // Set up stream format
            var streamFormat = AudioStreamBasicDescription()
            streamFormat.mSampleRate = 16000
            streamFormat.mFormatID = kAudioFormatLinearPCM
            streamFormat.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked
            streamFormat.mBitsPerChannel = 16
            streamFormat.mChannelsPerFrame = 1
            streamFormat.mBytesPerFrame = 2
            streamFormat.mFramesPerPacket = 1
            streamFormat.mBytesPerPacket = 2
            
            let formatStatus = AudioUnitSetProperty(
                audioUnit,
                kAudioUnitProperty_StreamFormat,
                kAudioUnitScope_Output,
                1, // input bus
                &streamFormat,
                UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
            )
            
            guard formatStatus == noErr else {
                throw NSError(domain: "CoreAudio", code: Int(formatStatus), userInfo: [
                    NSLocalizedDescriptionKey: "Could not set stream format: \(formatStatus)"
                ])
            }
            
            // Initialize the audio unit
            let initStatus = AudioUnitInitialize(audioUnit)
            guard initStatus == noErr else {
                throw NSError(domain: "CoreAudio", code: Int(initStatus), userInfo: [
                    NSLocalizedDescriptionKey: "Could not initialize audio unit: \(initStatus)"
                ])
            }
            
            // Start the audio unit
            let startStatus = AudioOutputUnitStart(audioUnit)
            guard startStatus == noErr else {
                throw NSError(domain: "CoreAudio", code: Int(startStatus), userInfo: [
                    NSLocalizedDescriptionKey: "Could not start audio unit: \(startStatus)"
                ])
            }
            
            bluetoothRecordingActive = true
            print("✅ Bluetooth microphone recording started with Core Audio")
            
            // Set up audio callback to send chunks for transcription
            var callbackStruct = AURenderCallbackStruct()
            callbackStruct.inputProc = { (inRefCon, ioActionFlags, inTimeStamp, inBusNumber, inNumberFrames, ioData) -> OSStatus in
                // This will be called for each audio buffer
                // We can send audio data to transcription service here
                return noErr
            }
            callbackStruct.inputProcRefCon = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
            
            let callbackStatus = AudioUnitSetProperty(
                audioUnit,
                kAudioUnitProperty_SetRenderCallback,
                kAudioUnitScope_Input,
                0,
                &callbackStruct,
                UInt32(MemoryLayout<AURenderCallbackStruct>.size)
            )
            
            if callbackStatus == noErr {
                print("✅ Audio callback set up for transcription streaming")
            }
            
            // Send recording started confirmation
            if audioSource == "mic" {
                ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
            }
            else if audioSource == "both" && systemRecordingActive {
                ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
            }
            
        } catch {
            print("❌ Bluetooth Core Audio recording failed: \(error.localizedDescription)")
            
            // Fallback to simple AVEngine approach
            startBluetoothAVEngineRecording()
        }
    }
    
    // MARK: - Bluetooth AVAudioEngine Fallback
    private func startBluetoothAVEngineRecording() {
        print("🔄 Trying Bluetooth recording with AVAudioEngine...")
        
        let micPath = urlInDir("_mic.wav")
        
        // Try using AVAudioEngine instead of AVAudioRecorder for Bluetooth
        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        
        // Use lower sample rate and mono for Bluetooth compatibility
        let recordingFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, 
                                          sampleRate: 16000, 
                                          channels: 1, 
                                          interleaved: false)!
        
        do {
            let audioFile = try AVAudioFile(forWriting: micPath, settings: recordingFormat.settings)
            
            // Install tap on input node
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputNode.outputFormat(forBus: 0)) { buffer, time in
                do {
                    try audioFile.write(from: buffer)
                } catch {
                    print("❌ Error writing audio buffer: \(error)")
                }
            }
            
            try engine.start()
            bluetoothRecordingActive = true
            print("✅ Bluetooth microphone recording started with AVAudioEngine")
            
            // Send recording started confirmation
            if self.audioSource == "mic" {
                ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
            }
            else if self.audioSource == "both" && self.systemRecordingActive {
                ResponseHandler.send(["code": "RECORDING_STARTED"], exitProcess: false)
            }
            
        } catch {
            print("❌ AVAudioEngine Bluetooth recording also failed: \(error.localizedDescription)")
            ResponseHandler.send(["code": "MIC_ERROR", "error": "Bluetooth microphone recording failed with all methods. Error: \(error.localizedDescription). Consider using built-in microphone or checking Bluetooth permissions."])
        }
    }

    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        micRecordingActive = false
        finishIfPossible()
    }

    // MARK: – Combine & finish
    private func finishIfPossible() {
        guard (audioSource == "mic" && !micRecordingActive) ||
              (audioSource == "system" && !systemRecordingActive) ||
              (audioSource == "both" && !micRecordingActive && !systemRecordingActive) else { return }

        if audioSource == "both" {
            combineSystemAndMic()
        } else if audioSource == "system" {
            convertWavToMp3(wav: urlInDir("_system.wav"))
        } else {
            convertWavToMp3(wav: urlInDir("_mic.wav"))
        }
    }

    private func combineSystemAndMic() {
        let sys = urlInDir("_system.wav")
        let mic = urlInDir("_mic.wav")
        let combined = urlInDir(".wav")
        let ffmpeg = "/opt/homebrew/bin/ffmpeg"
        guard FileManager.default.fileExists(atPath: ffmpeg) else {
            ResponseHandler.send(["code": "NO_FFMPEG"]) ; return
        }
        let task = Process()
        task.executableURL = URL(fileURLWithPath: ffmpeg)
        task.arguments = ["-y", "-i", sys.path, "-i", mic.path, "-filter_complex", "amix=inputs=2:duration=longest:normalize=1", combined.path]
        try? task.run(); task.waitUntilExit()
        convertWavToMp3(wav: combined)
    }

    private func convertWavToMp3(wav: URL) {
        let mp3 = wav.deletingPathExtension().appendingPathExtension("mp3")
        let ffmpeg = "/opt/homebrew/bin/ffmpeg"
        let task = Process()
        task.executableURL = URL(fileURLWithPath: ffmpeg)
        task.arguments = ["-y", "-i", wav.path, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3.path]
        try? task.run(); task.waitUntilExit()
        ResponseHandler.send(["code": "RECORDING_STOPPED", "path": mp3.path])
    }

    // MARK: – CLI parsing helpers
    private func parseCLI() {
        let args = CommandLine.arguments
        if let idx = args.firstIndex(of: "--record"), idx + 1 < args.count {
            recordingDir = (args[idx + 1] as NSString).expandingTildeInPath
        }
        if let idx = args.firstIndex(of: "--filename"), idx + 1 < args.count {
            baseFilename = args[idx + 1]
        }
        if let idx = args.firstIndex(of: "--source"), idx + 1 < args.count {
            let src = args[idx + 1].lowercased(); if ["mic","system","both"].contains(src) { audioSource = src }
        }
    }

    private func urlInDir(_ suffix: String) -> URL {
        URL(fileURLWithPath: recordingDir).appendingPathComponent(baseFilename + suffix)
    }
    
    // MARK: – Stop recording methods
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
            if let audioUnit = audioUnit {
                AudioOutputUnitStop(audioUnit)
                AudioUnitUninitialize(audioUnit)
                AudioComponentInstanceDispose(audioUnit)
                self.audioUnit = nil
            }
        }
        
        // Stop system audio recording
        if systemRecordingActive {
            Task {
                try? await screenStream?.stopCapture()
                systemRecordingActive = false
                // Trigger finish logic after stopping
                print("🔄 Processing final recording...")
                finishIfPossible()
            }
        } else {
            // If no system recording, just finish
            print("🔄 Processing final recording...")
            finishIfPossible()
        }
    }
}
