#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * FFmpeg-based audio recorder that mimics the Swift Recorder interface
 * Integrates seamlessly with the Friday Electron app
 */
class FFmpegRecorder {
    constructor() {
        this.isRecording = false;
        this.ffmpegProcess = null;
        this.recordingPath = null;
        this.recordingDir = process.cwd();
        this.baseFilename = this.generateFilename();
        this.audioSource = 'mic'; // mic | system | both
    }

    // Generate timestamp-based filename like the Swift version
    generateFilename() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}_${hour}-${minute}`;
    }

    // Parse CLI arguments like the Swift version
    parseArgs() {
        const args = process.argv.slice(2);
        
        const recordIndex = args.indexOf('--record');
        if (recordIndex !== -1 && recordIndex + 1 < args.length) {
            this.recordingDir = args[recordIndex + 1].replace('~', process.env.HOME);
        }
        
        const filenameIndex = args.indexOf('--filename');
        if (filenameIndex !== -1 && filenameIndex + 1 < args.length) {
            this.baseFilename = args[filenameIndex + 1];
        }
        
        const sourceIndex = args.indexOf('--source');
        if (sourceIndex !== -1 && sourceIndex + 1 < args.length) {
            const source = args[sourceIndex + 1].toLowerCase();
            if (['mic', 'system', 'both'].includes(source)) {
                this.audioSource = source;
            }
        }
    }

    // Send JSON responses like the Swift version
    sendResponse(data) {
        console.log(`FRIDAY_RESPONSE: ${JSON.stringify(data)}`);
    }

    // List audio devices (simplified)
    async listAudioDevices() {
        return new Promise((resolve) => {
            const deviceProcess = spawn('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], 
                { stdio: 'pipe' });
            
            let output = '';
            deviceProcess.stderr.on('data', (data) => {
                output += data.toString();
            });

            deviceProcess.on('close', () => {
                const devices = this.parseAudioDevices(output);
                console.log('🎤 Audio diagnostics:');
                devices.forEach(device => console.log(`  • ${device.name}`));
                resolve(devices);
            });
        });
    }

    parseAudioDevices(output) {
        const devices = [];
        const lines = output.split('\n');
        let inAudioSection = false;

        for (const line of lines) {
            if (line.includes('AVFoundation audio devices')) {
                inAudioSection = true;
                continue;
            }
            if (inAudioSection && line.includes('AVFoundation video devices')) {
                break;
            }
            if (inAudioSection) {
                const match = line.match(/\[(\d+)\]\s+(.+)/);
                if (match) {
                    devices.push({
                        id: parseInt(match[1]),
                        name: match[2].trim()
                    });
                }
            }
        }
        return devices;
    }

    // Start recording based on source type
    async startRecording() {
        if (this.audioSource === 'mic') {
            return this.startMicRecording();
        } else if (this.audioSource === 'system') {
            this.sendResponse({code: "ERROR", error: "System audio recording not yet implemented with ffmpeg"});
            return false;
        } else if (this.audioSource === 'both') {
            this.sendResponse({code: "ERROR", error: "Combined recording not yet implemented with ffmpeg"});
            return false;
        }
    }

    async startMicRecording() {
        if (this.isRecording) {
            this.sendResponse({code: "ERROR", error: "Already recording"});
            return false;
        }

        // Create output directory
        if (!fs.existsSync(this.recordingDir)) {
            fs.mkdirSync(this.recordingDir, { recursive: true });
        }

        const outputPath = path.join(this.recordingDir, `${this.baseFilename}_mic.wav`);
        console.log(`🎙️ Starting microphone recording to: ${outputPath}`);

        const args = [
            '-f', 'avfoundation',
            '-i', ':0',  // Default microphone
            '-ac', '2',  // Stereo
            '-ar', '44100',  // 44.1kHz
            '-y',  // Overwrite
            outputPath
        ];

        this.ffmpegProcess = spawn('ffmpeg', args, { stdio: 'pipe' });
        this.recordingPath = outputPath;
        this.isRecording = true;

        // Monitor recording
        let errorOutput = '';
        this.ffmpegProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        this.ffmpegProcess.on('close', (code) => {
            this.isRecording = false;
            
            if (code === 0 && fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                console.log(`✅ Recording completed: ${stats.size} bytes`);
                
                if (stats.size > 1000) {
                    // Convert to MP3 for consistency
                    this.convertToMp3(outputPath);
                } else {
                    console.log('⚠️ Recording file too small, may have failed');
                    this.sendResponse({code: "ERROR", error: "Recording failed - file too small"});
                }
            } else {
                console.log(`❌ Recording failed with code: ${code}`);
                console.log('FFmpeg output:', errorOutput);
                this.sendResponse({code: "ERROR", error: `Recording failed: ${code}`});
            }
        });

        // Send recording started notification
        this.sendResponse({code: "RECORDING_STARTED", path: outputPath});
        console.log('✅ Microphone recording started');
        
        return true;
    }

    convertToMp3(wavPath) {
        const mp3Path = wavPath.replace('.wav', '.mp3');
        
        const convertProcess = spawn('ffmpeg', [
            '-i', wavPath,
            '-codec:a', 'libmp3lame',
            '-qscale:a', '2',
            '-y',
            mp3Path
        ], { stdio: 'pipe' });

        convertProcess.on('close', (code) => {
            if (code === 0) {
                // Clean up WAV file
                try { fs.unlinkSync(wavPath); } catch {}
                
                this.sendResponse({code: "RECORDING_STOPPED", path: mp3Path});
                console.log(`🎵 Converted to MP3: ${mp3Path}`);
            } else {
                console.log('⚠️ MP3 conversion failed, keeping WAV');
                this.sendResponse({code: "RECORDING_STOPPED", path: wavPath});
            }
        });
    }

    // Stop recording
    async stopRecording() {
        if (!this.isRecording || !this.ffmpegProcess) {
            return false;
        }

        console.log('⏹️ Stopping recording...');
        this.ffmpegProcess.kill('SIGTERM');
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (this.ffmpegProcess) {
                    this.ffmpegProcess.kill('SIGKILL');
                }
                resolve(false);
            }, 5000);

            this.ffmpegProcess.on('close', () => {
                clearTimeout(timeout);
                this.ffmpegProcess = null;
                resolve(true);
            });
        });
    }

    // Main execution function
    async run() {
        this.parseArgs();
        
        console.log('DEBUG: FFmpeg recorder starting');
        console.log(`DEBUG: CLI args → ${process.argv.join(' ')}`);
        
        // Show diagnostics like Swift version
        await this.listAudioDevices();
        
        // Start recording
        await this.startRecording();
        
        // Handle graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('📤 Received SIGTERM, stopping recording...');
            await this.stopRecording();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            console.log('📤 Received SIGINT, stopping recording...');
            await this.stopRecording();
            process.exit(0);
        });
    }
}

// CLI entry point
if (require.main === module) {
    const recorder = new FFmpegRecorder();
    recorder.run().catch(console.error);
}

module.exports = FFmpegRecorder; 