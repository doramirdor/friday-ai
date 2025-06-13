#!/usr/bin/env swift

import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreAudio

@available(macOS 13.0, *)
class SimpleAudioTest: NSObject, SCStreamDelegate, SCStreamOutput {
    private var stream: SCStream?
    private var audioFile: AVAudioFile?
    
    func testSystemAudioCapture() {
        print("🔍 Testing basic ScreenCaptureKit audio capture...")
        
        // Check screen capture permission
        let hasPermission = CGPreflightScreenCaptureAccess()
        print("📺 Screen capture permission: \(hasPermission)")
        
        if !hasPermission {
            print("❌ No screen capture permission - requesting...")
            let granted = CGRequestScreenCaptureAccess()
            print("Permission request result: \(granted)")
            if !granted {
                print("❌ Permission denied")
                return
            }
        }
        
        // Get content
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self = self else { return }
            
            if let error = error {
                print("❌ Error getting sharable content: \(error.localizedDescription)")
                return
            }
            
            guard let content = content, let display = content.displays.first else {
                print("❌ No displays found")
                return
            }
            
            print("✅ Found display: \(display.width)x\(display.height)")
            
            // Create filter
            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
            
            // Create configuration
            let config = SCStreamConfiguration()
            config.width = 1
            config.height = 1
            config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
            config.showsCursor = false
            config.capturesAudio = true
            config.sampleRate = 44100
            config.channelCount = 2
            config.excludesCurrentProcessAudio = false  // Try with false
            
            print("🔧 Configuration:")
            print("   Sample rate: \(config.sampleRate)")
            print("   Channels: \(config.channelCount)")
            print("   Captures audio: \(config.capturesAudio)")
            print("   Excludes current process: \(config.excludesCurrentProcessAudio)")
            
            // Prepare audio file
            let outputPath = "/tmp/simple-audio-test.wav"
            do {
                if FileManager.default.fileExists(atPath: outputPath) {
                    try FileManager.default.removeItem(atPath: outputPath)
                }
                
                self.audioFile = try AVAudioFile(
                    forWriting: URL(fileURLWithPath: outputPath),
                    settings: [
                        AVSampleRateKey: 44100,
                        AVNumberOfChannelsKey: 2,
                        AVFormatIDKey: kAudioFormatLinearPCM
                    ],
                    commonFormat: .pcmFormatFloat32,
                    interleaved: false
                )
                print("✅ Audio file prepared at: \(outputPath)")
            } catch {
                print("❌ Failed to create audio file: \(error.localizedDescription)")
                return
            }
            
            // Create stream
            self.stream = SCStream(filter: filter, configuration: config, delegate: self)
            
            Task {
                do {
                    try self.stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
                    print("✅ Added audio stream output")
                    
                    try await self.stream?.startCapture()
                    print("✅ Stream started successfully")
                    
                    // Record for 5 seconds
                    try await Task.sleep(nanoseconds: 5_000_000_000)
                    
                    try await self.stream?.stopCapture()
                    print("✅ Recording stopped")
                    
                    // Check file size
                    let attributes = try FileManager.default.attributesOfItem(atPath: outputPath)
                    let fileSize = attributes[.size] as? NSNumber ?? 0
                    print("📊 Final file size: \(fileSize) bytes")
                    
                    if fileSize.intValue > 1000 {
                        print("🎉 SUCCESS: Audio capture working!")
                    } else {
                        print("❌ FAILED: No audio captured")
                    }
                    
                } catch {
                    print("❌ Stream error: \(error.localizedDescription)")
                }
            }
        }
    }
    
    // MARK: - SCStreamOutput
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .audio else { return }
        
        guard let audioBuffer = sampleBuffer.asPCMBuffer, sampleBuffer.isValid else {
            print("⚠️ Invalid audio buffer")
            return
        }
        
        do {
            try self.audioFile?.write(from: audioBuffer)
            print("📝 Audio buffer written (\(audioBuffer.frameLength) frames)")
        } catch {
            print("❌ Failed to write audio buffer: \(error.localizedDescription)")
        }
    }
    
    // MARK: - SCStreamDelegate
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("🛑 Stream stopped with error: \(error.localizedDescription)")
    }
}

// Extension for CMSampleBuffer to PCM conversion
extension CMSampleBuffer {
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { audioBufferList, _ -> AVAudioPCMBuffer? in
            guard let absd = self.formatDescription?.audioStreamBasicDescription else { return nil }
            guard let format = AVAudioFormat(standardFormatWithSampleRate: absd.mSampleRate, channels: absd.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: audioBufferList.unsafePointer)
        }
    }
}

// Main execution
if #available(macOS 13.0, *) {
    let test = SimpleAudioTest()
    test.testSystemAudioCapture()
    
    // Keep the program running
    RunLoop.main.run()
} else {
    print("❌ This test requires macOS 13.0 or later")
} 